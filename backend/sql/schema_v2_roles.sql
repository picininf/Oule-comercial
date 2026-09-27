-- =====================================================================
-- Schema v2: papéis (cliente/planejador/oule), Objetivos e Plano Mensal.
-- Rode este script no SQL Editor do Supabase (depois do schema.sql).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. profiles — RLS
--    O backend (service_role) ignora RLS e é quem decide o que cada
--    papel pode ver (ver backend/utils/acesso.js). Aqui só bloqueamos
--    o acesso direto via anon/authenticated key, exceto leitura do
--    próprio perfil.
-- ---------------------------------------------------------------------
alter table profiles enable row level security;

drop policy if exists "usuario_ve_apenas_seu_perfil" on profiles;
create policy "usuario_ve_apenas_seu_perfil"
on profiles for select
using (auth.uid() = id);

drop policy if exists "bloquear_escrita_direta_profiles" on profiles;
create policy "bloquear_escrita_direta_profiles"
on profiles for all
using (false)
with check (false);

-- Reabilita select acima; insert/update/delete direto (fora do
-- backend) continuam bloqueados pela policy "for all" acima, que o
-- Postgres combina em OR com a de select apenas para SELECT.

-- ---------------------------------------------------------------------
-- 2. Trigger: cria a linha em `profiles` automaticamente quando um
--    novo usuário se cadastra no Supabase Auth. O backend também tem
--    uma criação "auto-curativa" (attachProfile), então isso é uma
--    camada extra — não depende de nenhuma requisição HTTP acontecer.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, nome, telefone, banco_conectado, role)
  values (
    new.id,
    new.raw_user_meta_data->>'nome',
    new.raw_user_meta_data->>'telefone',
    new.raw_user_meta_data->>'banco_conectado',
    'cliente'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------
-- 3. objetivos — RLS
--    O dono vê e edita os próprios objetivos. Planejadores/admin só
--    acessam via backend (service_role), que valida o vínculo
--    planejador -> cliente antes de responder.
-- ---------------------------------------------------------------------
alter table objetivos enable row level security;

drop policy if exists "usuario_ve_apenas_seus_objetivos" on objetivos;
create policy "usuario_ve_apenas_seus_objetivos"
on objetivos for select
using (auth.uid() = user_id);

drop policy if exists "usuario_gerencia_apenas_seus_objetivos" on objetivos;
create policy "usuario_gerencia_apenas_seus_objetivos"
on objetivos for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 4. plano_mensal — RLS
-- ---------------------------------------------------------------------
alter table plano_mensal enable row level security;

drop policy if exists "usuario_ve_apenas_seu_plano" on plano_mensal;
create policy "usuario_ve_apenas_seu_plano"
on plano_mensal for select
using (auth.uid() = user_id);

drop policy if exists "usuario_gerencia_apenas_seu_plano" on plano_mensal;
create policy "usuario_gerencia_apenas_seu_plano"
on plano_mensal for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 5. Índices úteis
-- ---------------------------------------------------------------------
create index if not exists idx_profiles_planejador_id on profiles(planejador_id);
create index if not exists idx_objetivos_user_id on objetivos(user_id);
create index if not exists idx_plano_mensal_user_mes on plano_mensal(user_id, mes);
