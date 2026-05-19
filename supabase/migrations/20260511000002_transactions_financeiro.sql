-- ==============================================================
-- Migration: 20260511000002_transactions_financeiro.sql
-- Descrição: Vincula transactions à entrada da fila (queue_entry_id)
--            e corrige RLS para que o barbeiro executor possa inserir.
-- ==============================================================

-- ── 1. Nova coluna queue_entry_id ───────────────────────────────
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS queue_entry_id uuid
    REFERENCES public.queue_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_queue_entry
  ON public.transactions(queue_entry_id);

-- ── 2. Corrige RLS INSERT ───────────────────────────────────────
-- A policy anterior só permitia o *dono* da barbearia inserir.
-- O barbeiro que executa o corte também precisa inserir sua transação.
DROP POLICY IF EXISTS "transactions_insert_owner"  ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_member" ON public.transactions;

CREATE POLICY "transactions_insert_member"
  ON public.transactions
  FOR INSERT
  WITH CHECK (
    -- Dono da barbearia
    auth.uid() = (
      SELECT owner_id FROM public.barbershops WHERE id = barbershop_id
    )
    OR
    -- Barbeiro executor: apenas insere a própria transação e está vinculado à barbearia
    (
      auth.uid() = professional_id
      AND professional_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.professional_shop_links psl
        WHERE psl.professional_id = auth.uid()
          AND psl.barbershop_id   = transactions.barbershop_id
          AND psl.is_active       = true
      )
    )
  );

-- ── 3. Garante SELECT para o profissional executor ──────────────
-- A policy existente já cobre auth.uid() = professional_id — nada a fazer.
