-- ================================================================
-- Migration: 20260901000001_queue_entries_guest_phone.sql
-- Adiciona coluna guest_phone a queue_entries, complementando
-- guest_name para clientes sem cadastro (walk-in e fila sem login
-- via link de barbearia).
-- ================================================================

ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS guest_phone TEXT;

COMMENT ON COLUMN public.queue_entries.guest_phone IS
  'WhatsApp avulso informado pelo cliente sem cadastro (walk-in ou fila sem login). Opcional.';
