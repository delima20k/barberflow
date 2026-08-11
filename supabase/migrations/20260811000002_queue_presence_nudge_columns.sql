-- =============================================================================
-- Migration: 20260811000002_queue_presence_nudge_columns.sql
-- Objetivo:
--   Suportar a confirmacao de presenca recorrente do cliente em 1o lugar na
--   fila de espera (pergunta "voce ja esta na barbearia?" a cada 10 min).
--
-- Contexto:
--   Feature nova, separada da confirmacao existente em queue_entries.client_confirmed
--   (FilaPresencaService, disparada uma unica vez ao ENTRAR na fila, com timer
--   fixo de 5 min, resultado usado para notificar o barbeiro). Reaproveitar
--   client_confirmed causaria falso-positivo: um cliente que respondeu 'yes'
--   ao entrar na fila (ainda em 5o lugar) apareceria como ja confirmado para
--   este novo ciclo, que so deve comecar quando ele chega em 1o lugar.
--
-- Colunas:
--   presence_confirmed_at   - setado quando o cliente responde "Sim" ao ciclo
--                             recorrente. NULL = ainda nao confirmou.
--   last_presence_prompt_at - timestamp do ultimo lembrete enviado. Controla o
--                             intervalo de 10 minutos entre disparos (task do
--                             scheduler compara contra now() - interval '10 min').
--
-- rollback:
--   ALTER TABLE public.queue_entries
--     DROP COLUMN IF EXISTS presence_confirmed_at,
--     DROP COLUMN IF EXISTS last_presence_prompt_at;
-- =============================================================================

ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS presence_confirmed_at   timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_presence_prompt_at timestamptz NULL;

COMMENT ON COLUMN public.queue_entries.presence_confirmed_at IS
  'Confirmacao de presenca do ciclo recorrente (1o lugar, pergunta a cada 10 min). Distinta de client_confirmed (confirmacao unica ao entrar na fila).';
COMMENT ON COLUMN public.queue_entries.last_presence_prompt_at IS
  'Timestamp do ultimo lembrete de presenca recorrente enviado. Usado pela task queue.presence-nudge para respeitar o intervalo de 10 minutos.';
