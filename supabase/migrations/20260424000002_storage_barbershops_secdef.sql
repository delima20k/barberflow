-- ==============================================================
-- Migration: 20260424000002_storage_barbershops_secdef.sql
-- Descrição: Corrige RLS do bucket 'barbershops' usando função
--            SECURITY DEFINER para evitar o bloqueio de RLS da
--            tabela public.barbershops dentro da policy de storage.
--
-- Problema:
--   A subquery EXISTS na policy fazia SELECT em public.barbershops,
--   mas a RLS dessa tabela bloqueava a leitura, causando 400 RLS
--   violation mesmo com o owner autenticado.
--
-- Solução:
--   Função security definer que bypassa RLS ao verificar ownership.
-- ==============================================================

-- ── Função helper: verifica se auth.uid() é dono do shop ─────
create or replace function public.storage_is_barbershop_owner(shop_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.barbershops
     where id::text = shop_id
       and owner_id = auth.uid()
  );
$$;

-- ── Recriar policies usando a função ─────────────────────────
drop policy if exists "barbershops_owner_write"  on storage.objects;
drop policy if exists "barbershops_owner_update" on storage.objects;
drop policy if exists "barbershops_owner_delete" on storage.objects;

create policy "barbershops_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'barbershops' and
    public.storage_is_barbershop_owner((storage.foldername(name))[1])
  );

create policy "barbershops_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'barbershops' and
    public.storage_is_barbershop_owner((storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'barbershops' and
    public.storage_is_barbershop_owner((storage.foldername(name))[1])
  );

create policy "barbershops_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'barbershops' and
    public.storage_is_barbershop_owner((storage.foldername(name))[1])
  );
