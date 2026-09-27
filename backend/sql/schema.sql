-- =====================================================================
-- Schema de segurança para o app de gestão financeira.
-- Rode este script no SQL Editor do Supabase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Row Level Security nas tabelas existentes
-- ---------------------------------------------------------------------
alter table transacoes enable row level security;

drop policy if exists "usuario_ve_apenas_suas_transacoes" on transacoes;
create policy "usuario_ve_apenas_suas_transacoes"
on transacoes for select
using (auth.uid() = user_id);

drop policy if exists "usuario_insere_apenas_para_si" on transacoes;
create policy "usuario_insere_apenas_para_si"
on transacoes for insert
with check (auth.uid() = user_id);

-- Tabelas usadas para o fluxo de vinculação/whatsapp e open finance:
-- só o backend (service_role, que ignora RLS) deve acessá-las.
-- Bloqueamos totalmente o acesso via anon/authenticated key.
alter table usuarios_whatsapp enable row level security;
alter table vinculos_pendentes enable row level security;

drop policy if exists "bloquear_acesso_direto" on usuarios_whatsapp;
create policy "bloquear_acesso_direto" on usuarios_whatsapp for all using (false);

drop policy if exists "bloquear_acesso_direto" on vinculos_pendentes;
create policy "bloquear_acesso_direto" on vinculos_pendentes for all using (false);

-- ---------------------------------------------------------------------
-- 2. Expiração dos códigos de vinculação do WhatsApp
-- ---------------------------------------------------------------------
alter table vinculos_pendentes
  add column if not exists expira_em timestamptz default (now() + interval '10 minutes');

-- ---------------------------------------------------------------------
-- 3. Tabela: relação item da Pluggy -> usuário
--    Necessária para o webhook saber em qual conta gravar as
--    transações que chegam de forma assíncrona.
-- ---------------------------------------------------------------------
create table if not exists open_finance_items (
  item_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'ATIVO',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table open_finance_items enable row level security;

drop policy if exists "usuario_ve_apenas_seus_items" on open_finance_items;
create policy "usuario_ve_apenas_seus_items"
on open_finance_items for select
using (auth.uid() = user_id);

-- inserts/updates só pelo backend (service_role)
drop policy if exists "bloquear_escrita_direta" on open_finance_items;
create policy "bloquear_escrita_direta" on open_finance_items for insert with check (false);

-- ---------------------------------------------------------------------
-- 4. Tabela de idempotência de eventos de webhook
--    Evita processar o mesmo evento duas vezes (a Pluggy reenvia
--    notificações que falharam).
-- ---------------------------------------------------------------------
create table if not exists webhook_events (
  event_id text primary key,
  event_type text not null,
  item_id uuid,
  received_at timestamptz not null default now()
);

alter table webhook_events enable row level security;
drop policy if exists "bloquear_acesso_direto" on webhook_events;
create policy "bloquear_acesso_direto" on webhook_events for all using (false);

-- ---------------------------------------------------------------------
-- 5. NOTA: a tabela `profiles` NÃO existe neste projeto (confirmado no
--    diagrama de schema real do Supabase). O frontend
--    (src/hooks/useAuth.js) tenta consultá-la, mas a chamada falha
--    silenciosamente e o app cai de volta para `user_metadata` do
--    próprio auth.users. Não é uma falha de RLS (a tabela nem existe,
--    então não há dado exposto), mas é código morto/quebrado.
--    Se algum dia você criar essa tabela, habilite RLS na MESMA
--    migration que a cria — nunca depois:
--
--    create table profiles (
--      id uuid primary key references auth.users(id) on delete cascade,
--      nome text, telefone text, banco_conectado text,
--      updated_at timestamptz not null default now()
--    );
--    alter table profiles enable row level security;
--    create policy "usuario_ve_apenas_seu_perfil" on profiles
--      for select using (auth.uid() = id);
--    create policy "usuario_atualiza_apenas_seu_perfil" on profiles
--      for update using (auth.uid() = id) with check (auth.uid() = id);
--    create policy "usuario_insere_apenas_seu_perfil" on profiles
--      for insert with check (auth.uid() = id);
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 6. Índices úteis
-- ---------------------------------------------------------------------
create index if not exists idx_transacoes_user_id on transacoes(user_id);
create index if not exists idx_transacoes_data on transacoes(data_transacao desc);
create index if not exists idx_open_finance_items_user_id on open_finance_items(user_id);
