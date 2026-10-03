-- =====================================================================
-- Schema v5 — Oule | App: "Minhas regras" (classificação memorizada)
--
-- Rode no SQL Editor do Supabase DEPOIS do schema_v4_oule.sql. O script
-- é idempotente: pode rodar de novo sem quebrar nada.
--
-- O cliente ensina o app: "todo Pix para PEDRO VEIGA RELA TAVARES é
-- Brownie, categoria Alimentação, Variável | Não obrigatório". A regra é
-- aplicada automaticamente em tudo que entrar depois (planilha/extrato,
-- Open Finance, comprovante do WhatsApp) e, se a pessoa quiser, nos
-- lançamentos que já existem.
-- =====================================================================

create table if not exists regras_transacao (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Trecho que a descrição ORIGINAL do banco precisa conter (sem
  -- diferenciar maiúsculas/acentos). Ex.: "Pedro Veiga Rela Tavares".
  padrao text not null,
  -- saida | entrada | ambos
  sentido text not null default 'saida',
  categoria text,
  tipo_gasto text,
  -- Nome amigável que substitui a descrição do banco. Ex.: "Brownie".
  descricao text,
  ativo boolean not null default true,
  criado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint regras_transacao_padrao check (char_length(trim(padrao)) between 2 and 120),
  constraint regras_transacao_sentido check (sentido in ('saida', 'entrada', 'ambos')),
  constraint regras_transacao_tipo_gasto check (
    tipo_gasto is null or tipo_gasto in ('recorrente_obrigatorio', 'recorrente_nao_obrigatorio', 'variavel_obrigatorio', 'variavel_nao_obrigatorio')
  ),
  constraint regras_transacao_algo_a_fazer check (categoria is not null or tipo_gasto is not null or descricao is not null)
);

create index if not exists idx_regras_transacao_user on regras_transacao(user_id);

-- Em cada lançamento: qual regra o classificou e a descrição que veio do
-- banco antes de ser renomeada (para a regra continuar casando e para dar
-- para desfazer).
alter table transacoes add column if not exists regra_id uuid references regras_transacao(id) on delete set null;
alter table transacoes add column if not exists descricao_original text;
create index if not exists idx_transacoes_regra on transacoes(regra_id) where regra_id is not null;

-- RLS: leitura das próprias regras, escrita só pelo backend.
alter table regras_transacao enable row level security;
drop policy if exists "usuario_ve_apenas_seus_dados" on regras_transacao;
create policy "usuario_ve_apenas_seus_dados" on regras_transacao for select using (auth.uid() = user_id);
drop policy if exists "bloquear_escrita_direta" on regras_transacao;
create policy "bloquear_escrita_direta" on regras_transacao for insert with check (false);
