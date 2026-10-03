-- =====================================================================
-- Schema v4 — Oule | App (backlog do Trello)
--
-- Rode no SQL Editor do Supabase DEPOIS de schema.sql, schema_v2_roles.sql
-- e schema_v3_extrato.sql. O script é idempotente: pode rodar de novo
-- sem quebrar nada.
--
-- Cobre:
--   * Dados de cadastro do cliente + TAGs de perfil + Código de cliente
--   * Categorias Oule / Tipos de gasto nas transações
--   * Faturas: datas de competência x caixa, cartões e parcelas
--   * Aba de pagamentos mensais + lembretes de vencimento
--   * Aposentadoria / Liberdade Financeira
--   * Plano x Vida Real para anos seguintes (premissas por ano)
--
-- Padrão de segurança (igual às versões anteriores): o backend usa a
-- service_role (ignora RLS) e é quem decide quem vê o quê. Para as
-- chaves anon/authenticated liberamos no máximo a LEITURA dos próprios
-- dados e bloqueamos qualquer escrita direta.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. profiles: cadastro completo, TAGs de perfil e código de cliente
-- ---------------------------------------------------------------------
create sequence if not exists profiles_codigo_cliente_seq start 1001;

create or replace function public.gerar_codigo_cliente()
returns text
language sql
volatile
set search_path = public
as $$
  select 'OUL-' || lpad(nextval('profiles_codigo_cliente_seq')::text, 6, '0');
$$;

alter table profiles add column if not exists codigo_cliente text;
alter table profiles alter column codigo_cliente set default public.gerar_codigo_cliente();
update profiles set codigo_cliente = public.gerar_codigo_cliente() where codigo_cliente is null;
create unique index if not exists idx_profiles_codigo_cliente on profiles(codigo_cliente);

alter table profiles add column if not exists data_nascimento date;
alter table profiles add column if not exists cidade text;
alter table profiles add column if not exists estado text;              -- UF (SP, RJ, ...)
alter table profiles add column if not exists pais text default 'Brasil';
alter table profiles add column if not exists profissao text;
alter table profiles add column if not exists forma_trabalho text;      -- clt | pj | autonomo | servidor | empresario | aposentado | estudante | sem_renda
alter table profiles add column if not exists renda_mensal numeric(14,2);
alter table profiles add column if not exists estado_civil text;
alter table profiles add column if not exists dependentes smallint;
alter table profiles add column if not exists tags text[] not null default '{}';
alter table profiles add column if not exists observacoes_planejador text;
alter table profiles add column if not exists lembrete_dias_antecedencia smallint not null default 3;
alter table profiles add column if not exists lembrete_whatsapp boolean not null default true;
alter table profiles add column if not exists updated_at timestamptz not null default now();

alter table profiles drop constraint if exists profiles_estado_uf;
alter table profiles add constraint profiles_estado_uf check (estado is null or estado ~ '^[A-Z]{2}$');
alter table profiles drop constraint if exists profiles_lembrete_dias;
alter table profiles add constraint profiles_lembrete_dias check (lembrete_dias_antecedencia between 0 and 15);
alter table profiles drop constraint if exists profiles_dependentes;
alter table profiles add constraint profiles_dependentes check (dependentes is null or dependentes between 0 and 20);

create index if not exists idx_profiles_estado on profiles(estado);

-- ---------------------------------------------------------------------
-- 2. Cartões de crédito (base do cálculo inteligente de fatura)
--    Comprei hoje, mas a fatura só cobra mês que vem: com o dia de
--    fechamento e de vencimento de cada cartão o backend calcula em
--    qual fatura cada compra/parcela cai (data de caixa), mantendo a
--    data real da compra (data de competência).
-- ---------------------------------------------------------------------
create table if not exists cartoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  bandeira text,
  final text,                                  -- 4 últimos dígitos (opcional, só exibição)
  dia_fechamento smallint not null check (dia_fechamento between 1 and 31),
  dia_vencimento smallint not null check (dia_vencimento between 1 and 31),
  limite numeric(14,2),
  ativo boolean not null default true,
  open_finance_account_id text,                -- conta CREDIT da Pluggy, quando vier do Open Finance
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_cartoes_user on cartoes(user_id);
create unique index if not exists idx_cartoes_pluggy_conta on cartoes(user_id, open_finance_account_id)
  where open_finance_account_id is not null;

-- ---------------------------------------------------------------------
-- 3. transacoes: tipo de gasto, competência x caixa, cartão e parcelas
-- ---------------------------------------------------------------------
alter table transacoes add column if not exists tipo_gasto text;
alter table transacoes add column if not exists data_competencia date;
alter table transacoes add column if not exists data_caixa date;
alter table transacoes add column if not exists cartao_id uuid references cartoes(id) on delete set null;
alter table transacoes add column if not exists conta_tipo text;           -- conta | cartao_credito
alter table transacoes add column if not exists parcela_atual smallint;
alter table transacoes add column if not exists parcelas_total smallint;
alter table transacoes add column if not exists compra_id uuid;             -- agrupa as parcelas de uma mesma compra
alter table transacoes add column if not exists categoria_original text;    -- como veio da origem (Pluggy/IA/planilha)
alter table transacoes add column if not exists observacao text;
alter table transacoes add column if not exists updated_at timestamptz;

alter table transacoes drop constraint if exists transacoes_tipo_gasto_valido;
alter table transacoes add constraint transacoes_tipo_gasto_valido check (
  tipo_gasto is null or tipo_gasto in (
    'recorrente_obrigatorio', 'recorrente_nao_obrigatorio', 'variavel_obrigatorio', 'variavel_nao_obrigatorio'
  )
);

update transacoes set data_competencia = data_transacao where data_competencia is null;
update transacoes set data_caixa = data_transacao where data_caixa is null;

-- Open Finance: troca o "apaga e insere" por upsert. Antes de criar o
-- índice único, remove duplicatas antigas (mantém a linha mais recente).
delete from transacoes a
using transacoes b
where a.open_finance_id is not null
  and a.open_finance_id = b.open_finance_id
  and a.user_id = b.user_id
  and a.ctid < b.ctid;

-- Índice único SEM cláusula WHERE: o upsert do Supabase (ON CONFLICT)
-- não consegue usar índice parcial. Como NULLs são distintos entre si no
-- Postgres, linhas sem open_finance_id não conflitam umas com as outras.
create unique index if not exists idx_transacoes_open_finance_unico
  on transacoes(user_id, open_finance_id);

create index if not exists idx_transacoes_user_competencia on transacoes(user_id, data_competencia);
create index if not exists idx_transacoes_user_caixa on transacoes(user_id, data_caixa);
create index if not exists idx_transacoes_compra on transacoes(compra_id) where compra_id is not null;

-- ---------------------------------------------------------------------
-- 4. Pagamentos mensais (contas fixas) + controle do mês + lembretes
-- ---------------------------------------------------------------------
create table if not exists pagamentos_recorrentes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  descricao text not null,
  categoria text not null default 'Outros',
  tipo_gasto text not null default 'recorrente_obrigatorio',
  valor numeric(14,2) not null check (valor >= 0),
  dia_vencimento smallint not null check (dia_vencimento between 1 and 31),
  forma_pagamento text,
  cartao_id uuid references cartoes(id) on delete set null,
  inicio_mes text check (inicio_mes is null or inicio_mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  fim_mes text check (fim_mes is null or fim_mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  lembrar boolean not null default true,
  ativo boolean not null default true,
  observacao text,
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_pagamentos_recorrentes_user on pagamentos_recorrentes(user_id);

create table if not exists pagamentos_mensais (
  id uuid primary key default gen_random_uuid(),
  pagamento_id uuid not null references pagamentos_recorrentes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  valor_pago numeric(14,2),
  pago_em date not null default current_date,
  transacao_id text,
  created_at timestamptz not null default now(),
  unique (pagamento_id, mes)
);
create index if not exists idx_pagamentos_mensais_user_mes on pagamentos_mensais(user_id, mes);

create table if not exists lembretes_enviados (
  id uuid primary key default gen_random_uuid(),
  pagamento_id uuid not null references pagamentos_recorrentes(id) on delete cascade,
  mes text not null,
  canal text not null,                        -- whatsapp
  tipo text not null,                         -- antecedencia | no_dia | atrasado
  enviado_em timestamptz not null default now(),
  unique (pagamento_id, mes, canal, tipo)
);

-- WhatsApp: guarda o JID completo do vínculo (necessário para o bot
-- conseguir ENVIAR lembretes também para contas no formato @lid).
alter table usuarios_whatsapp add column if not exists jid text;

-- ---------------------------------------------------------------------
-- 5. Aposentadoria / Liberdade Financeira
-- ---------------------------------------------------------------------
create table if not exists aposentadoria_planos (
  user_id uuid primary key references auth.users(id) on delete cascade,
  idade_aposentadoria smallint not null default 60 check (idade_aposentadoria between 18 and 100),
  renda_desejada numeric(14,2) not null default 0 check (renda_desejada >= 0),
  patrimonio_atual numeric(16,2) not null default 0 check (patrimonio_atual >= 0),
  aporte_mensal numeric(14,2) not null default 0 check (aporte_mensal >= 0),
  rentabilidade_real_anual numeric(5,2) not null default 4 check (rentabilidade_real_anual between -10 and 30),
  taxa_retirada_anual numeric(5,2) not null default 4 check (taxa_retirada_anual between 1 and 15),
  outras_rendas numeric(14,2) not null default 0 check (outras_rendas >= 0),   -- INSS, aluguéis...
  atualizado_por uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Premissas do plano por ano (planejar os anos seguintes)
-- ---------------------------------------------------------------------
create table if not exists plano_premissas (
  user_id uuid not null references auth.users(id) on delete cascade,
  ano smallint not null check (ano between 2000 and 2100),
  inflacao_anual numeric(5,2) not null default 4.5,
  reajuste_renda_anual numeric(5,2) not null default 5,
  meta_poupanca_pct numeric(5,2) not null default 20,
  patrimonio_inicial numeric(16,2),
  observacoes text,
  atualizado_por uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, ano)
);

-- plano_mensal passa a aceitar receitas planejadas (categorias do grupo
-- "receita", ex.: Salário). Nada a alterar na estrutura — apenas
-- garantimos a unicidade por mês/categoria.
delete from plano_mensal a
using plano_mensal b
where a.user_id = b.user_id and a.mes = b.mes and a.categoria = b.categoria and a.ctid < b.ctid;
create unique index if not exists idx_plano_mensal_unico on plano_mensal(user_id, mes, categoria);

-- ---------------------------------------------------------------------
-- 7. RLS das tabelas novas: leitura do próprio dado, escrita só backend
-- ---------------------------------------------------------------------
do $$
declare
  tabela text;
begin
  foreach tabela in array array[
    'cartoes', 'pagamentos_recorrentes', 'pagamentos_mensais', 'aposentadoria_planos', 'plano_premissas'
  ] loop
    execute format('alter table %I enable row level security', tabela);
    execute format('drop policy if exists "usuario_ve_apenas_seus_dados" on %I', tabela);
    execute format('create policy "usuario_ve_apenas_seus_dados" on %I for select using (auth.uid() = user_id)', tabela);
    execute format('drop policy if exists "bloquear_escrita_direta" on %I', tabela);
    execute format('create policy "bloquear_escrita_direta" on %I for insert with check (false)', tabela);
  end loop;
end $$;

alter table lembretes_enviados enable row level security;
drop policy if exists "bloquear_acesso_direto" on lembretes_enviados;
create policy "bloquear_acesso_direto" on lembretes_enviados for all using (false);
