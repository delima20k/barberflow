-- ==============================================================
-- Migration: 20260418000003_barbershops_role_check.sql
-- Descrição: Restringe criação de barbearias apenas para
--            usuários com role = 'professional'
--            Clientes não podem criar barbearias via API direta.
-- ==============================================================

DROP POLICY IF EXISTS "barbershops_owner_write" ON public.barbershops;

CREATE POLICY "barbershops_owner_write"
  ON public.barbershops FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND (
      SELECT role FROM public.profiles WHERE id = auth.uid()
    ) = 'professional'
  );
