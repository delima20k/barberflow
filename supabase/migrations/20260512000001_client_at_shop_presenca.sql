-- ────────────────────────────────────────────────────────────────
-- Migration: 20260512000001 — client_confirmed: adiciona valor 'arriving'
--
-- Contexto: ao entrar na fila (status=waiting), o cliente é perguntado
-- "Você já está na barbearia?". Se responder "Não, estou chegando",
-- o sistema registra client_confirmed = 'arriving' e agenda um grace
-- period de 5 min (FilaPresencaService). Esse valor é distinto de
-- 'no_waiting', que é usado quando o cliente nega presença no momento
-- do atendimento (status=in_service).
--
-- Estados finais de client_confirmed:
--   yes        → presente confirmado (in_service)
--   no_waiting → negou presença no atendimento (in_service)
--   absent     → grace expirado sem resposta (in_service)
--   arriving   → a caminho, aguardando chegar (waiting)
-- ────────────────────────────────────────────────────────────────

ALTER TABLE public.queue_entries
  DROP CONSTRAINT IF EXISTS queue_entries_client_confirmed_check;

ALTER TABLE public.queue_entries
  ADD CONSTRAINT queue_entries_client_confirmed_check
  CHECK (client_confirmed IN ('yes', 'no_waiting', 'absent', 'arriving'));

COMMENT ON COLUMN public.queue_entries.client_confirmed IS
  'Estados: yes=presente(in_service) | no_waiting=ausente(in_service) | absent=grace expirado(in_service) | arriving=a caminho(waiting)';
