-- =============================================================
-- Migration: 20260721000001_issue_professional_trial_vouchers.sql
-- Descricao: reserva atomica dos vouchers existentes por e-mail.
--
-- rollback:
--   DROP FUNCTION IF EXISTS public.issue_professional_trial_voucher(text);
--   DROP INDEX IF EXISTS public.idx_professional_trial_vouchers_issued_email;
--   ALTER TABLE public.professional_trial_vouchers
--     DROP COLUMN IF EXISTS issued_email_hash,
--     DROP COLUMN IF EXISTS issued_at;
--   Reaplicar 20260702000004_professional_trial_vouchers.sql para restaurar
--   public.handle_new_user_trial() sem vinculo com o e-mail da emissao.
-- =============================================================

ALTER TABLE public.professional_trial_vouchers
  ADD COLUMN IF NOT EXISTS issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS issued_email_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_professional_trial_vouchers_issued_email
  ON public.professional_trial_vouchers (issued_email_hash)
  WHERE issued_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_professional_trial_vouchers_issue_order
  ON public.professional_trial_vouchers (created_at, id)
  WHERE is_active = true AND used_at IS NULL AND issued_at IS NULL;

COMMENT ON COLUMN public.professional_trial_vouchers.issued_at IS
  'Momento em que o voucher foi entregue pela landing; NULL significa disponivel para emissao.';
COMMENT ON COLUMN public.professional_trial_vouchers.issued_email_hash IS
  'SHA-256 do e-mail normalizado que recebeu o voucher; o e-mail puro nao e persistido.';

CREATE OR REPLACE FUNCTION public.issue_professional_trial_voucher(
  p_email_hash text
)
RETURNS TABLE (
  result_status text,
  voucher_code text,
  voucher_trial_days integer,
  remaining_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_voucher_id uuid;
  v_code text;
  v_trial_days integer;
  v_remaining integer := 0;
BEGIN
  IF COALESCE(p_email_hash, '') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid_email_hash' USING ERRCODE = '22023';
  END IF;

  -- Impede duas solicitacoes concorrentes do mesmo e-mail.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_email_hash, 0));

  IF EXISTS (
    SELECT 1
      FROM public.professional_trial_vouchers AS voucher
     WHERE voucher.issued_email_hash = p_email_hash
  ) THEN
    SELECT count(*)::integer
      INTO v_remaining
      FROM public.professional_trial_vouchers AS voucher
     WHERE voucher.is_active = true
       AND voucher.used_at IS NULL
       AND voucher.issued_at IS NULL
       AND (voucher.expires_at IS NULL OR voucher.expires_at > now());

    RETURN QUERY SELECT
      'duplicate_email'::text,
      NULL::text,
      NULL::integer,
      v_remaining;
    RETURN;
  END IF;

  SELECT voucher.id
    INTO v_voucher_id
    FROM public.professional_trial_vouchers AS voucher
   WHERE voucher.is_active = true
     AND voucher.used_at IS NULL
     AND voucher.issued_at IS NULL
     AND (voucher.expires_at IS NULL OR voucher.expires_at > now())
   ORDER BY voucher.created_at, voucher.id
   FOR UPDATE SKIP LOCKED
   LIMIT 1;

  IF v_voucher_id IS NULL THEN
    RETURN QUERY SELECT
      'sold_out'::text,
      NULL::text,
      NULL::integer,
      0::integer;
    RETURN;
  END IF;

  UPDATE public.professional_trial_vouchers AS voucher
     SET issued_at = now(),
         issued_email_hash = p_email_hash
   WHERE voucher.id = v_voucher_id
   RETURNING voucher.code, voucher.trial_days
        INTO v_code, v_trial_days;

  SELECT count(*)::integer
    INTO v_remaining
    FROM public.professional_trial_vouchers AS voucher
   WHERE voucher.is_active = true
     AND voucher.used_at IS NULL
     AND voucher.issued_at IS NULL
     AND (voucher.expires_at IS NULL OR voucher.expires_at > now());

  RETURN QUERY SELECT
    'issued'::text,
    v_code,
    v_trial_days,
    v_remaining;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_professional_trial_voucher(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_professional_trial_voucher(text)
  TO service_role;

-- Mantem o consumo atomico ja existente e exige, para vouchers emitidos pela
-- landing, o mesmo e-mail usado na solicitacao.
CREATE OR REPLACE FUNCTION public.handle_new_user_trial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_trial_days integer := 7;
  v_email_hash text;
BEGIN
  IF COALESCE(NEW.raw_user_meta_data->>'role', 'client') = 'professional'
     AND NEW.raw_user_meta_data->>'plan_intent' = 'trial' THEN

    IF NOT EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = NEW.id AND status IN ('trial', 'active')
    ) THEN
      v_code := upper(regexp_replace(
        COALESCE(NEW.raw_user_meta_data->>'trial_voucher_code', ''),
        '\s+',
        '',
        'g'
      ));
      v_email_hash := encode(
        digest(lower(trim(COALESCE(NEW.email, ''))), 'sha256'),
        'hex'
      );

      IF v_code ~ '^[A-Z0-9]{6}$' THEN
        UPDATE public.professional_trial_vouchers AS voucher
           SET used_at = now(),
               used_by = NEW.id
         WHERE voucher.code = v_code
           AND voucher.is_active = true
           AND voucher.used_at IS NULL
           AND (voucher.expires_at IS NULL OR voucher.expires_at > now())
           AND (
             voucher.issued_at IS NULL
             OR voucher.issued_email_hash = v_email_hash
           )
         RETURNING voucher.trial_days INTO v_trial_days;

        IF v_trial_days IS NULL THEN
          v_trial_days := 7;
        END IF;
      END IF;

      INSERT INTO public.subscriptions
        (user_id, plan_type, status, platform, starts_at, ends_at)
      VALUES
        (NEW.id, 'trial', 'trial', 'web', now(), now() + make_interval(days => v_trial_days));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
