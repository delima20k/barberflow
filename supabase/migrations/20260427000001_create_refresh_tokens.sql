-- =============================================================
-- Migration: 20260427000001_create_refresh_tokens.sql
--
-- Tabela para armazenar refresh tokens customizados com suporte
-- a revogação explícita (logout-all-devices, exclusão de conta).
--
-- SEGURANÇA:
--   - token_hash armazena SHA-256 do token — nunca o token em claro.
--   - RLS habilitado: apenas service_role acessa (via backend Node.js).
--   - CASCADE em ON DELETE: tokens de usuário deletado são removidos.
--   - revoked_at NULL = ativo; preenchido = revogado (soft delete).
--
-- Aplique em: https://supabase.com/dashboard/project/jfvjisqnzapxxagkbxcu/sql/new
-- =============================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,        -- SHA-256 hex (64 chars)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,                         -- NULL = ativo
  device_hint TEXT,                                -- ex: 'iOS 18 / iPhone 15 Pro'
  ip_address  INET
);

-- ── Índices para queries frequentes ──────────────────────────
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
  ON refresh_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash
  ON refresh_tokens(token_hash);

-- ── RLS: apenas service_role acessa (backend Node.js) ────────
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

-- Nenhum acesso via PostgREST por usuários normais.
-- Service role bypassa RLS automaticamente — nenhuma política necessária.

-- ── Limpeza automática de tokens expirados ───────────────────
-- Função para remover tokens expirados há mais de 30 dias.
CREATE OR REPLACE FUNCTION limpar_refresh_tokens_expirados()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM refresh_tokens
  WHERE expires_at < NOW() - INTERVAL '30 days';
$$;
