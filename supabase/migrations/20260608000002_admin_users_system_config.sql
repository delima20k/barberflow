-- ============================================================
-- Migration: admin_users + system_config
--
-- admin_users  — controle de acesso ao painel administrativo.
--               Apenas registros com active=true e user_id
--               vinculado ao Supabase Auth têm acesso.
--
-- system_config — armazenamento criptografado de configurações
--               do sistema (ex: credenciais Cloudflare R2).
--               Valores protegidos por AES-256-GCM no BFF.
--               Nenhuma policy pública: acesso exclusivo via
--               service_role (SUPABASE_SERVICE_ROLE_KEY).
-- ============================================================

-- ── admin_users ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admin_users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT        NOT NULL,
  active     BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_user_id_idx ON public.admin_users (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_idx   ON public.admin_users (email);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Trigger para updated_at automático
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'admin_users_updated_at'
    AND tgrelid = 'public.admin_users'::regclass
  ) THEN
    CREATE TRIGGER admin_users_updated_at
      BEFORE UPDATE ON public.admin_users
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

COMMENT ON TABLE  public.admin_users          IS 'Usuários com acesso ao painel administrativo do BarberFlow.';
COMMENT ON COLUMN public.admin_users.user_id  IS 'FK para auth.users. Vincula o registro ao login Supabase.';
COMMENT ON COLUMN public.admin_users.email    IS 'E-mail de verificação dupla (além do user_id).';
COMMENT ON COLUMN public.admin_users.active   IS 'false = acesso revogado sem deletar o registro.';

-- ── system_config ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.system_config (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT        NOT NULL UNIQUE,
  value_enc   TEXT        NOT NULL,
  iv          TEXT        NOT NULL,
  auth_tag    TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS system_config_key_idx ON public.system_config (key);

ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'system_config_updated_at'
    AND tgrelid = 'public.system_config'::regclass
  ) THEN
    CREATE TRIGGER system_config_updated_at
      BEFORE UPDATE ON public.system_config
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

COMMENT ON TABLE  public.system_config           IS 'Configurações de sistema armazenadas criptografadas (AES-256-GCM). Acesso exclusivo via service_role.';
COMMENT ON COLUMN public.system_config.key       IS 'Chave de configuração, ex: r2.account_id, r2.secret_access_key.';
COMMENT ON COLUMN public.system_config.value_enc IS 'Valor criptografado (AES-256-GCM), base64url.';
COMMENT ON COLUMN public.system_config.iv        IS 'IV de 12 bytes, base64url. Único por registro.';
COMMENT ON COLUMN public.system_config.auth_tag  IS 'GCM auth tag de 16 bytes, base64url.';
