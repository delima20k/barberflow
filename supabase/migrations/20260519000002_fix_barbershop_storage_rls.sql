-- ==============================================================
-- Migration: 20260519000002_fix_barbershop_storage_rls.sql
-- Descrição: Garante que a função SECURITY DEFINER e as policies
--            do bucket 'barbershops' estejam aplicadas corretamente.
--
-- Problema:
--   A migration 20260424000002 nunca foi aplicada ao banco de produção.
--   Sem a função storage_is_barbershop_owner, as policies que usam
--   subquery em public.barbershops falham com RLS violation 400,
--   bloqueando todo upload de capa e logo da barbearia.
--
-- Solução:
--   Idempotente: CREATE OR REPLACE FUNCTION + DROP POLICY IF EXISTS.
-- ==============================================================

-- ── Função helper: verifica ownership via SECURITY DEFINER ────
-- Bypassa RLS da tabela public.barbershops dentro da policy de storage.
CREATE OR REPLACE FUNCTION public.storage_is_barbershop_owner(shop_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.barbershops
    WHERE id::text = shop_id
      AND owner_id = auth.uid()
  );
$$;

-- ── Recriar policies do bucket 'barbershops' ─────────────────
DROP POLICY IF EXISTS "barbershops_owner_write"  ON storage.objects;
DROP POLICY IF EXISTS "barbershops_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "barbershops_owner_delete" ON storage.objects;

-- INSERT: dono da barbearia pode fazer upload
CREATE POLICY "barbershops_owner_write"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'barbershops' AND
    public.storage_is_barbershop_owner((storage.foldername(name))[1])
  );

-- UPDATE: necessário para upsert:true (re-upload de capa/logo)
CREATE POLICY "barbershops_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'barbershops' AND
    public.storage_is_barbershop_owner((storage.foldername(name))[1])
  )
  WITH CHECK (
    bucket_id = 'barbershops' AND
    public.storage_is_barbershop_owner((storage.foldername(name))[1])
  );

-- DELETE: dono pode remover
CREATE POLICY "barbershops_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'barbershops' AND
    public.storage_is_barbershop_owner((storage.foldername(name))[1])
  );
