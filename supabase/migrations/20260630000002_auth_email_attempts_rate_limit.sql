-- Rate limit distribuido para emails de autenticacao quando Upstash/Redis
-- nao estiver disponivel na BFF serverless.
--
-- email_hash deve ser HMAC-SHA256 gerado na BFF com AUTH_EMAIL_HASH_SECRET.
-- Nao armazenar SHA-256 puro de email: emails tem baixa entropia e sao
-- vulneraveis a dicionario em caso de leitura/vazamento da tabela.

CREATE TABLE IF NOT EXISTS public.auth_email_attempts (
  email_hash        text        NOT NULL,
  purpose           text        NOT NULL,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts          integer     NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email_hash, purpose)
);

ALTER TABLE public.auth_email_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_email_attempts_service_role_all" ON public.auth_email_attempts;
CREATE POLICY "auth_email_attempts_service_role_all"
  ON public.auth_email_attempts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_auth_email_attempts_updated_at
  ON public.auth_email_attempts (updated_at);

CREATE OR REPLACE FUNCTION public.consume_auth_email_attempt(
  p_email_hash text,
  p_purpose text,
  p_window_seconds integer DEFAULT 3600,
  p_max_attempts integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_row public.auth_email_attempts%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_email_hash IS NULL OR p_email_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid_email_hash';
  END IF;

  IF p_purpose NOT IN ('forgot-password', 'signup-confirmation') THEN
    RAISE EXCEPTION 'invalid_purpose';
  END IF;

  INSERT INTO public.auth_email_attempts (
    email_hash,
    purpose,
    window_started_at,
    attempts,
    updated_at
  )
  VALUES (
    p_email_hash,
    p_purpose,
    v_now,
    1,
    v_now
  )
  ON CONFLICT (email_hash, purpose)
  DO UPDATE SET
    window_started_at = CASE
      WHEN public.auth_email_attempts.window_started_at < v_now - make_interval(secs => p_window_seconds)
        THEN v_now
      ELSE public.auth_email_attempts.window_started_at
    END,
    attempts = CASE
      WHEN public.auth_email_attempts.window_started_at < v_now - make_interval(secs => p_window_seconds)
        THEN 1
      ELSE public.auth_email_attempts.attempts + 1
    END,
    updated_at = v_now
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'allowed', v_row.attempts <= p_max_attempts,
    'attempts', v_row.attempts,
    'maxAttempts', p_max_attempts,
    'windowStartedAt', v_row.window_started_at
  );
END;
$$;

REVOKE ALL ON public.auth_email_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.auth_email_attempts TO service_role;

REVOKE EXECUTE ON FUNCTION public.consume_auth_email_attempt(text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_auth_email_attempt(text, text, integer, integer)
  TO service_role;
