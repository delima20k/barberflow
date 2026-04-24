-- ==============================================================
-- Migration: 20260424000001_storage_barbershops_fix.sql
-- Descrição: Corrige RLS do bucket 'barbershops'.
--
-- Problema anterior:
--   1. Path gerado pelo JS continha prefixo 'barbershops/' dentro do
--      bucket 'barbershops', criando URL duplicada (.../barbershops/barbershops/...).
--   2. Policy INSERT verificava foldername(name)[1] = auth.uid(),
--      mas [1] retornava a string "barbershops" — nunca um UUID de usuário.
--   3. Não havia policy UPDATE → upsert:true falhava com RLS violation.
--
-- Solução:
--   • Path corrigido no JS para: {barbershopId}/{nomeArq}.{ext}
--   • Policies refeitas verificando ownership via subquery em public.barbershops
--   • Policy UPDATE adicionada (necessária para upsert)
-- ==============================================================

-- ── Remover policies antigas ──────────────────────────────────
drop policy if exists "barbershops_owner_write"  on storage.objects;
drop policy if exists "barbershops_owner_delete" on storage.objects;
drop policy if exists "barbershops_owner_update" on storage.objects;

-- ── INSERT: só o dono da barbearia pode fazer upload ─────────
create policy "barbershops_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'barbershops' and
    exists (
      select 1
        from public.barbershops b
       where b.id::text = (storage.foldername(name))[1]
         and b.owner_id = auth.uid()
    )
  );

-- ── UPDATE: necessário para upsert:true ──────────────────────
create policy "barbershops_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'barbershops' and
    exists (
      select 1
        from public.barbershops b
       where b.id::text = (storage.foldername(name))[1]
         and b.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'barbershops' and
    exists (
      select 1
        from public.barbershops b
       where b.id::text = (storage.foldername(name))[1]
         and b.owner_id = auth.uid()
    )
  );

-- ── DELETE: só o dono pode remover ───────────────────────────
create policy "barbershops_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'barbershops' and
    exists (
      select 1
        from public.barbershops b
       where b.id::text = (storage.foldername(name))[1]
         and b.owner_id = auth.uid()
    )
  );
