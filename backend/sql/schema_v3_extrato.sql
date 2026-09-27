-- =====================================================================
-- Schema v3: importação manual de extrato bancário (substituto do
-- Open Finance para quem prefere enviar o PDF/foto do extrato).
-- Rode este script no SQL Editor do Supabase (depois do schema.sql e
-- do schema_v2_roles.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. profiles: dia do mês combinado com o planejador para a pessoa
--    enviar o extrato (lembrete exibido na aba "Importar Extrato").
-- ---------------------------------------------------------------------
alter table profiles
  add column if not exists dia_importacao_extrato smallint;

alter table profiles
  drop constraint if exists dia_importacao_extrato_valido;
alter table profiles
  add constraint dia_importacao_extrato_valido
  check (dia_importacao_extrato is null or (dia_importacao_extrato between 1 and 31));

-- ---------------------------------------------------------------------
-- 2. transacoes: de onde veio o lançamento + hash de deduplicação.
--    O hash evita gravar o mesmo lançamento duas vezes quando a pessoa
--    reenvia o mesmo extrato por engano, ou quando dois arquivos se
--    sobrepõem em alguns dias.
-- ---------------------------------------------------------------------
alter table transacoes
  add column if not exists origem text not null default 'manual';

alter table transacoes
  add column if not exists extrato_hash text;

-- Único por usuário: o MESMO hash não pode existir duas vezes para o
-- mesmo user_id, mas linhas sem hash (open finance, whatsapp, manual
-- pela UI) não são afetadas por este índice.
drop index if exists idx_transacoes_extrato_hash_unico;
create unique index idx_transacoes_extrato_hash_unico
  on transacoes(user_id, extrato_hash)
  where extrato_hash is not null;

-- ---------------------------------------------------------------------
-- 3. Tabela: histórico de importações de extrato.
--    Guardamos só o RESULTADO da importação (nome do arquivo, quantos
--    lançamentos entraram, quantos já existiam) — nunca o arquivo em
--    si nem o conteúdo do extrato, que é dado bancário sensível.
-- ---------------------------------------------------------------------
create table if not exists extrato_importacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome_arquivo text not null,
  quantidade_transacoes integer not null default 0,
  quantidade_duplicadas integer not null default 0,
  status text not null default 'concluido', -- concluido | erro | vazio
  mensagem_erro text,
  importado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table extrato_importacoes enable row level security;

drop policy if exists "usuario_ve_apenas_suas_importacoes" on extrato_importacoes;
create policy "usuario_ve_apenas_suas_importacoes"
on extrato_importacoes for select
using (auth.uid() = user_id);

-- Assim como open_finance_items e webhook_events: só o backend
-- (service_role, que ignora RLS) grava aqui. Bloqueia escrita direta
-- via anon/authenticated key.
drop policy if exists "bloquear_escrita_direta" on extrato_importacoes;
create policy "bloquear_escrita_direta" on extrato_importacoes for insert with check (false);

-- ---------------------------------------------------------------------
-- 4. Índices úteis
-- ---------------------------------------------------------------------
create index if not exists idx_extrato_importacoes_user_id on extrato_importacoes(user_id, created_at desc);
create index if not exists idx_transacoes_origem on transacoes(origem);
