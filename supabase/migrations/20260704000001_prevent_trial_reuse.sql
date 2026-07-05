-- =============================================================
-- Migration: 20260704000001_prevent_trial_reuse.sql
-- Descrição: CRÍTICO (financeiro) — impede que um usuário ative
--   mais de UM trial na vida, por QUALQUER caminho:
--     - BFF POST /pagamentos/trial (ProfessionalPaymentRepository.ativarTrial)
--     - trigger de signup handle_new_user_trial (cadastro / voucher 30 dias)
--     - Edge Function validate-purchase (Google Play / TWA)
--     - INSERT direto via service_role
--
-- Contexto da brecha (diagnóstico anterior):
--   ativarTrial() expirava a assinatura atual e inseria um NOVO trial
--   de 7 dias INCONDICIONALMENTE, sem checar histórico. Não existia
--   coluna nem constraint de "1 trial por usuário na vida" — apenas
--   idx_subscriptions_one_active_per_user (migration 20260417000006),
--   que garante somente 1 assinatura ATIVA por vez e NÃO cobre trial
--   já expirado. Resultado: reuso ilimitado de trial via API.
--
-- Estratégia (não-destrutiva, tolerante a duplicatas já existentes):
--   1. profiles.trial_used_at (nullable) = carimbo do (único) trial.
--   2. Backfill do carimbo a partir do trial mais antigo já existente
--      (não apaga nem altera nenhuma assinatura).
--   3. Trigger BEFORE INSERT em subscriptions que, para plan_type='trial':
--        - bloqueia (unique_violation) se profiles.trial_used_at já
--          estiver preenchido;
--        - caso contrário, carimba profiles.trial_used_at na MESMA
--          transação do INSERT.
--      Por ser BEFORE INSERT, duplicatas históricas NÃO impedem a
--      criação da migration (o trigger só avalia inserts NOVOS): quem
--      já tem 2+ trials fica "grandfathered", mas não consegue um 3º.
--   NÃO altera idx_subscriptions_one_active_per_user (mantido para o
--   seu propósito original: evitar 2 assinaturas ativas simultâneas).
--
-- Reversível — rollback:
--   DROP TRIGGER IF EXISTS trg_enforce_single_trial ON public.subscriptions;
--   DROP FUNCTION IF EXISTS public.enforce_single_trial();
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS trial_used_at;
-- =============================================================

-- 1. Coluna de histórico de trial (per-user; NULL = nunca usou).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trial_used_at timestamptz;

COMMENT ON COLUMN public.profiles.trial_used_at IS
  'Momento em que o usuário ativou seu único trial (NULL = nunca usou). Impede reuso de trial — carimbado/validado por enforce_single_trial().';

-- 2. Backfill NÃO-destrutivo: marca todo usuário que já teve QUALQUER
--    trial, usando o created_at do trial mais antigo. Idempotente
--    (só escreve onde ainda está NULL).
UPDATE public.profiles p
   SET trial_used_at = sub.first_trial_at
  FROM (
    SELECT user_id, MIN(created_at) AS first_trial_at
      FROM public.subscriptions
     WHERE plan_type = 'trial'
     GROUP BY user_id
  ) sub
 WHERE sub.user_id = p.id
   AND p.trial_used_at IS NULL;

-- 3. Guard atômico contra reuso de trial.
--    SECURITY DEFINER: precisa carimbar profiles mesmo quando o INSERT
--    parte de um trigger SECURITY DEFINER (signup) ou do service_role.
CREATE OR REPLACE FUNCTION public.enforce_single_trial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trial_used timestamptz;
BEGIN
  -- Só nos interessa a criação de trials. Planos pagos (mensal/trimestral)
  -- e mudanças de status (UPDATE) passam direto — trigger é só BEFORE INSERT.
  IF NEW.plan_type IS DISTINCT FROM 'trial' THEN
    RETURN NEW;
  END IF;

  -- Trava a linha de profiles para serializar inserts concorrentes de trial
  -- (fecha o TOCTOU: dois POST /trial simultâneos após a expiração).
  SELECT trial_used_at INTO v_trial_used
    FROM public.profiles
   WHERE id = NEW.user_id
   FOR UPDATE;

  IF v_trial_used IS NOT NULL THEN
    RAISE EXCEPTION 'trial_already_used'
      USING ERRCODE = 'unique_violation',
            HINT    = 'Usuário já ativou um trial anteriormente.';
  END IF;

  -- Carimba o uso do trial na MESMA transação do INSERT.
  UPDATE public.profiles
     SET trial_used_at = COALESCE(NEW.starts_at, now())
   WHERE id = NEW.user_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_trial ON public.subscriptions;
CREATE TRIGGER trg_enforce_single_trial
  BEFORE INSERT ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_trial();
