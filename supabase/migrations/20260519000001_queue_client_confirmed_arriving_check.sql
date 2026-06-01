-- Migration: 20260519000001 — reaplica constraint de client_confirmed com 'arriving'
-- Motivo:
--   Algumas bases podem estar com a constraint antiga:
--   ('yes', 'no_waiting', 'absent')
--   O fluxo da cadeira de producao usa 'arriving' para representar cliente a caminho
--   ou aguardando confirmacao do barbeiro.

ALTER TABLE public.queue_entries
  DROP CONSTRAINT IF EXISTS queue_entries_client_confirmed_check;

ALTER TABLE public.queue_entries
  ADD CONSTRAINT queue_entries_client_confirmed_check
  CHECK (
    client_confirmed IS NULL
    OR client_confirmed IN ('yes', 'no_waiting', 'absent', 'arriving')
  );

COMMENT ON COLUMN public.queue_entries.client_confirmed IS
  'Estados: yes=presente(in_service) | no_waiting=ausente(in_service) | absent=grace expirado(in_service) | arriving=a caminho/aguardando confirmacao';
