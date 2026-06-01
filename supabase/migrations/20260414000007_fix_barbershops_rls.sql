-- ==============================================================
-- Migration: 20260414000007_fix_barbershops_rls.sql
-- Descrição: Corrige política RLS de INSERT em barbershops
--            Separa INSERT (with check) de UPDATE/DELETE (using)
--            para garantir que o dono possa criar sua barbearia
--            no cadastro via AuthService.
-- ==============================================================

-- Remove policy genérica "for all" que não cobria INSERT corretamente
DROP POLICY IF EXISTS "barbershops_owner_write" ON public.barbershops;

-- INSERT: dono pode criar sua própria barbearia
CREATE POLICY "barbershops_insert_own"
  ON public.barbershops FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- UPDATE: dono pode editar somente a sua
CREATE POLICY "barbershops_update_own"
  ON public.barbershops FOR UPDATE
  USING (auth.uid() = owner_id);

-- DELETE: dono pode excluir somente a sua
CREATE POLICY "barbershops_delete_own"
  ON public.barbershops FOR DELETE
  USING (auth.uid() = owner_id);
