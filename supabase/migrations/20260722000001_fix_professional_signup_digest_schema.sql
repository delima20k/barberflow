-- Corrige exclusivamente a resolucao de pgcrypto no trigger de trial.
-- rollback: reaplicar a definicao anterior de public.handle_new_user_trial().

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
        extensions.digest(lower(trim(COALESCE(NEW.email, ''))), 'sha256'),
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
