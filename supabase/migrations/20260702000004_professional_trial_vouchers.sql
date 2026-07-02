-- =============================================================
-- Migration: 20260702000004_professional_trial_vouchers.sql
-- Descricao: vouchers de teste gratis profissional.
--
-- Regras:
-- - Sem voucher: trial permanece 7 dias.
-- - Voucher valido: trigger consome atomicamente e usa trial_days.
-- - Voucher invalido/usado/expirado: trigger ignora e preserva 7 dias.
--
-- rollback:
--   DROP TRIGGER IF EXISTS on_auth_user_trial ON auth.users;
--   DROP FUNCTION IF EXISTS public.handle_new_user_trial();
--   DROP TABLE IF EXISTS public.professional_trial_vouchers;
--   Reaplicar a migration 20260702000001_auto_trial_subscription.sql.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.professional_trial_vouchers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  trial_days integer NOT NULL DEFAULT 30 CHECK (trial_days BETWEEN 1 AND 365),
  is_active boolean NOT NULL DEFAULT true,
  used_at timestamptz NULL,
  used_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NULL,
  CONSTRAINT professional_trial_vouchers_code_format
    CHECK (code = upper(code) AND code ~ '^[A-Z0-9]{6}$'),
  CONSTRAINT professional_trial_vouchers_used_pair
    CHECK ((used_at IS NULL AND used_by IS NULL) OR (used_at IS NOT NULL AND used_by IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_professional_trial_vouchers_available
  ON public.professional_trial_vouchers (code)
  WHERE is_active = true AND used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_professional_trial_vouchers_used_by
  ON public.professional_trial_vouchers (used_by)
  WHERE used_by IS NOT NULL;

ALTER TABLE public.professional_trial_vouchers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.professional_trial_vouchers FROM anon, authenticated;

COMMENT ON TABLE public.professional_trial_vouchers IS
  'Vouchers de teste gratis profissional. A BFF valida previamente; o trigger de signup consome atomicamente.';

CREATE OR REPLACE FUNCTION public.handle_new_user_trial()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_trial_days integer := 7;
BEGIN
  -- So profissional que escolheu explicitamente o trial no cadastro.
  IF COALESCE(NEW.raw_user_meta_data->>'role', 'client') = 'professional'
     AND NEW.raw_user_meta_data->>'plan_intent' = 'trial' THEN

    -- Idempotente: nao duplica se ja houver trial/ativo.
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

      -- Consumo atomico: duas contas concorrentes nao conseguem usar o mesmo voucher.
      IF v_code ~ '^[A-Z0-9]{6}$' THEN
        UPDATE public.professional_trial_vouchers
           SET used_at = now(),
               used_by = NEW.id
         WHERE code = v_code
           AND is_active = true
           AND used_at IS NULL
           AND (expires_at IS NULL OR expires_at > now())
         RETURNING trial_days INTO v_trial_days;

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

DROP TRIGGER IF EXISTS on_auth_user_trial ON auth.users;
CREATE TRIGGER on_auth_user_trial
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_trial();
