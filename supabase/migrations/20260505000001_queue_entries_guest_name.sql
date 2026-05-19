-- ================================================================
-- Migration: 20260505000001_queue_entries_guest_name.sql
-- Adiciona coluna guest_name a queue_entries para clientes walk-in
-- (sem cadastro no sistema — inseridos manualmente pelo barbeiro).
-- ================================================================

ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS guest_name TEXT;

COMMENT ON COLUMN public.queue_entries.guest_name IS
  'Nome avulso informado pelo barbeiro para cliente sem cadastro (walk-in).';
