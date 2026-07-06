-- =============================================================================
-- Migration: 20260706000001_notificacoes_fila_idempotentes.sql
-- Objetivo : Idempotência real de notificações de fila (barbeiro recebendo
--            client_not_seated/client_at_shop/client_absent duplicado enquanto
--            o cliente permanece aguardando na cadeira).
--
-- ATENÇÃO — reescrita em cima do banco REAL (não do que os arquivos de
-- migration anteriores do repositório sugeriam). Diagnóstico ao vivo mostrou
-- que este banco NÃO tem: enum public.notification_type, a função
-- public._insert_validated_notification, nem o trigger
-- notifications_guard_insert — ou seja, as migrations
-- 20260522000004_notifications_rls_security_fix.sql e
-- 20260523000001_notifications_fix_alto_vector.sql (que criam essas peças)
-- NUNCA foram aplicadas neste banco, embora existam no repositório e os
-- testes tests/notifications-rls.test.js / tests/db-contracts.test.js
-- (CONTRACT-07) simulem essa versão "endurecida" como se já estivesse em
-- produção. Essa discrepância é um assunto separado, maior, e não é resolvida
-- por esta migration — aqui só se resolve o bug do loop de notificação em
-- cima da coluna/função que realmente existe:
--   notifications(id, user_id, type text, title, body, data jsonb, is_read, created_at)
-- Ambas as funções abaixo fazem INSERT direto (sem guarda nenhuma hoje).
--
-- confirmar_presenca_cliente: dedupe_key construído dentro da própria função
-- (não depende de nenhuma mudança de JS).
--
-- notificar_barbeiro_chegada: dedupe_key tirado de p_data->>'dedupe_key' se
-- o caller mandar; senão, construído a partir de p_data->>'entry_id' + p_type
-- (ambos SEMPRE presentes nas chamadas atuais de ChegadaProducaoService.js e
-- FilaPresencaService.js — não depende de nenhum trabalho de outra frente
-- ainda não commitado).
--
-- Rollback:
--   DROP TABLE IF EXISTS public.push_notification_dedup;
--   -- Reverter confirmar_presenca_cliente e notificar_barbeiro_chegada para
--   -- as versões sem dedupe_key/ON CONFLICT (ver corpo original antes desta
--   -- migration, sem a coluna dedupe_key nem o ON CONFLICT).
--   DROP INDEX IF EXISTS idx_notifications_user_dedupe;
--   ALTER TABLE public.notifications DROP COLUMN IF EXISTS dedupe_key;
-- =============================================================================

BEGIN;

-- ── 1. Coluna + índice único parcial em notifications ────────────────────────

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text;

COMMENT ON COLUMN public.notifications.dedupe_key IS
  'Chave lógica de deduplicação (ex: queue:{entry_id}:{type}). NULL para tipos que não precisam de idempotência. Única por user_id quando preenchida.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_user_dedupe
  ON public.notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ── 2. confirmar_presenca_cliente — dedupe_key + guarda contra reprocessar ────
-- Mesma assinatura/estrutura/corpo da versão real hoje em produção; adiciona
-- apenas: qe.client_confirmed na SELECT (para v_ja_absente), dedupe_key nos
-- dois INSERTs que notificam, ON CONFLICT DO NOTHING, e a checagem
-- v_ja_absente ANTES do UPDATE no ramo 'absent' (evita reprocessar retries
-- óbvios; o dedupe_key cobre a corrida real/TOCTOU como defesa atômica).
CREATE OR REPLACE FUNCTION public.confirmar_presenca_cliente(p_entry_id uuid, p_confirmado boolean, p_grace_used boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry      RECORD;
  v_profId     UUID;
  v_ja_absente boolean;
BEGIN
  SELECT qe.id, qe.professional_id, qe.barbershop_id, qe.client_confirmed,
         p.full_name AS client_name
  INTO v_entry
  FROM public.queue_entries qe
  LEFT JOIN public.profiles p ON p.id = qe.client_id
  WHERE qe.id        = p_entry_id
    AND qe.client_id = auth.uid()
    AND qe.status    = 'in_service'
  LIMIT 1;

  IF v_entry IS NULL THEN
    RETURN;
  END IF;

  v_profId := v_entry.professional_id;

  IF p_confirmado THEN
    UPDATE public.queue_entries
    SET client_confirmed = 'yes',
        first_no_at      = NULL
    WHERE id = p_entry_id;

  ELSIF NOT p_grace_used THEN
    -- Primeiro "Não" — registra timestamp e notifica barbeiro imediatamente
    UPDATE public.queue_entries
    SET client_confirmed = 'no_waiting',
        first_no_at      = NOW()
    WHERE id = p_entry_id;

    IF v_profId IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id, type, title, body, data, dedupe_key, is_read, created_at
      ) VALUES (
        v_profId,
        'client_not_seated',
        'Cliente ainda não está pronto',
        COALESCE(v_entry.client_name, 'Cliente') || ' avisou que ainda não está sentado na cadeira.',
        jsonb_build_object(
          'client_not_seated', true,
          'entry_id',          p_entry_id,
          'client_name',       COALESCE(v_entry.client_name, 'Cliente'),
          'barbershop_id',     v_entry.barbershop_id
        ),
        'queue:' || p_entry_id::text || ':client_not_seated',
        false,
        NOW()
      )
      ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;

  ELSE
    -- Segundo "Não" (grace expirado) — checa ANTES do UPDATE se já estava 'absent'
    v_ja_absente := v_entry.client_confirmed IS NOT DISTINCT FROM 'absent';

    UPDATE public.queue_entries
    SET client_confirmed = 'absent'
    WHERE id = p_entry_id;

    IF v_profId IS NOT NULL AND NOT v_ja_absente THEN
      INSERT INTO public.notifications (
        user_id, type, title, body, data, dedupe_key, is_read, created_at
      ) VALUES (
        v_profId,
        'client_absent',
        'Cliente ausente 🔔',
        COALESCE(v_entry.client_name, 'Cliente') || ' não confirmou presença na cadeira.',
        jsonb_build_object(
          'client_absent',  true,
          'entry_id',       p_entry_id,
          'client_name',    COALESCE(v_entry.client_name, 'Cliente'),
          'barbershop_id',  v_entry.barbershop_id
        ),
        'queue:' || p_entry_id::text || ':client_absent',
        false,
        NOW()
      )
      ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;
  END IF;
END;
$function$;

-- ── 3. notificar_barbeiro_chegada — dedupe_key sem depender de mudança de JS ──
-- Mesma assinatura/estrutura da versão real hoje em produção. dedupe_key:
-- usa p_data->>'dedupe_key' se vier explícito; senão deriva de
-- p_data->>'entry_id' + p_type (ambos sempre presentes nas chamadas atuais
-- de ChegadaProducaoService.js/FilaPresencaService.js já commitadas).
CREATE OR REPLACE FUNCTION public.notificar_barbeiro_chegada(p_professional_id uuid, p_type text, p_title text, p_body text, p_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dedupe_key text;
BEGIN
  IF p_professional_id IS NULL THEN RETURN; END IF;

  v_dedupe_key := NULLIF(TRIM(COALESCE(p_data->>'dedupe_key', '')), '');
  IF v_dedupe_key IS NULL AND (p_data ? 'entry_id') THEN
    v_dedupe_key := 'queue:' || (p_data->>'entry_id') || ':' || p_type;
  END IF;

  INSERT INTO public.notifications (
    user_id, type, title, body, data, dedupe_key, is_read, created_at
  ) VALUES (
    p_professional_id,
    p_type,
    p_title,
    COALESCE(p_body, ''),
    COALESCE(p_data, '{}'),
    v_dedupe_key,
    false,
    NOW()
  )
  ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
END;
$function$;

-- ── 4. push_notification_dedup — idempotência do Web Push no BFF ─────────────
-- Mesmo padrão de public.asaas_webhook_events (event_id UNIQUE + tratamento
-- de 23505 no app). Sem TTL automático: queue_entries tem vida curta.
CREATE TABLE IF NOT EXISTS public.push_notification_dedup (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, dedupe_key)
);

COMMENT ON TABLE public.push_notification_dedup IS
  'Guarda de idempotencia para Web Push (PushService.enviarAoBarbeiro). Sem TTL automatico: queue_entries tem vida curta, nao critico se crescer.';

CREATE INDEX IF NOT EXISTS idx_push_notification_dedup_created_at
  ON public.push_notification_dedup (created_at);

ALTER TABLE public.push_notification_dedup ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_notification_dedup_service_all" ON public.push_notification_dedup;
CREATE POLICY "push_notification_dedup_service_all"
  ON public.push_notification_dedup FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

COMMIT;
