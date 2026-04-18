-- ==============================================================
-- Migration: 20260418000002_fix_transactions_rls.sql
-- Descrição: Corrige policy INSERT vulnerável em transactions
--            (qual: null = sem WITH CHECK) + adiciona UPDATE e DELETE
-- ==============================================================

-- Remove a policy INSERT sem WITH CHECK
DROP POLICY IF EXISTS "transactions_insert_owner" ON public.transactions;

-- INSERT seguro: apenas dono da barbearia
CREATE POLICY "transactions_insert_owner"
  ON public.transactions
  FOR INSERT
  WITH CHECK (
    auth.uid() = (
      SELECT owner_id FROM public.barbershops
      WHERE id = barbershop_id
    )
  );

-- UPDATE: apenas dono da barbearia
CREATE POLICY "transactions_update_owner"
  ON public.transactions
  FOR UPDATE
  USING (
    auth.uid() = (
      SELECT owner_id FROM public.barbershops
      WHERE id = barbershop_id
    )
  );

-- DELETE: apenas dono da barbearia
CREATE POLICY "transactions_delete_owner"
  ON public.transactions
  FOR DELETE
  USING (
    auth.uid() = (
      SELECT owner_id FROM public.barbershops
      WHERE id = barbershop_id
    )
  );
