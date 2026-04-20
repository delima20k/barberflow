-- ==============================================================
-- Migration: 20260419000001_lgpd_compliance.sql
-- Descrição: Conformidade com a LGPD (Lei 13.709/2018)
--
-- Implementa:
--   1. Habilita pgcrypto (criptografia de dados)
--   2. Tabela data_deletion_requests (direito ao esquecimento — Art. 18, VI)
--   3. Tabela data_access_log (log de auditoria — Art. 37)
--   4. Adiciona 'client' à constraint plan_type da tabela legal_consents
--   5. Função anonimizar_perfil() SECURITY DEFINER (executa apenas via service_role)
--
-- Controle de acesso:
--   RLS garante que cada usuário acessa APENAS os próprios registros.
--   auth.uid() = user_id é verificado pelo PostgreSQL antes da aplicação
--   ver qualquer dado — camada de proteção no banco, não apenas no app.
--
-- Criptografia em repouso:
--   O Supabase já aplica AES-256 no nível de disco (transparent encryption).
--   pgcrypto disponibiliza criptografia por coluna quando necessário, por exemplo:
--   pgp_sym_encrypt(address::text, current_setting('app.data_key')) — para
--   colunas que exigem isolamento adicional além do RLS.
-- ==============================================================


-- ==============================================================
-- 1. pgcrypto — criptografia por coluna disponível via SQL
-- ==============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ==============================================================
-- 2. data_deletion_requests — direito ao esquecimento (Art. 18, VI)
-- ==============================================================
-- Quem tem acesso: apenas o titular (auth.uid() = user_id).
-- Quem processa: backend com service_role — a aplicação apenas solicita.
-- ==============================================================

CREATE TABLE IF NOT EXISTS public.data_deletion_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  motivo       text        NOT NULL DEFAULT 'user_request'
    CHECK (motivo IN ('user_request', 'legal_obligation', 'consent_withdrawn')),
  status       text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,

  -- Um pedido ativo por usuário — renovável via UPSERT
  CONSTRAINT deletion_requests_user_unique UNIQUE (user_id)
);

COMMENT ON TABLE public.data_deletion_requests IS
  'LGPD Art. 18, VI — Pedidos de exclusão de dados pessoais. '
  'A anonimização efetiva é executada pelo backend após validação.';

CREATE INDEX IF NOT EXISTS idx_deletion_requests_status
  ON public.data_deletion_requests (status, requested_at)
  WHERE status = 'pending';

ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Titular lê o próprio pedido
CREATE POLICY "deletion_requests_select_own"
  ON public.data_deletion_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Titular cria o próprio pedido
CREATE POLICY "deletion_requests_insert_own"
  ON public.data_deletion_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Titular pode cancelar (status → cancelled) — backend processa o restante
CREATE POLICY "deletion_requests_update_own"
  ON public.data_deletion_requests FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');


-- ==============================================================
-- 3. data_access_log — registro de operações (Art. 37, LGPD)
-- ==============================================================
-- Quem tem acesso (leitura): o titular dos dados.
-- Quem grava: o próprio usuário autenticado (via insert policy).
-- Auditoria privilegiada: service_role bypassa RLS — backend pode ler tudo.
-- ==============================================================

CREATE TABLE IF NOT EXISTS public.data_access_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  recurso    text        NOT NULL,
  acao       text        NOT NULL
    CHECK (acao IN ('read', 'write', 'delete', 'export')),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.data_access_log IS
  'LGPD Art. 37 — Registro de operações de tratamento de dados pessoais.';

CREATE INDEX IF NOT EXISTS idx_data_access_log_user
  ON public.data_access_log (user_id, created_at DESC);

ALTER TABLE public.data_access_log ENABLE ROW LEVEL SECURITY;

-- Titular lê seus próprios registros de acesso
CREATE POLICY "data_access_log_select_own"
  ON public.data_access_log FOR SELECT
  USING (auth.uid() = user_id);

-- Titular grava no próprio log (aplicação chama insert após ações sensíveis)
CREATE POLICY "data_access_log_insert_own"
  ON public.data_access_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- ==============================================================
-- 4. legal_consents — adiciona 'client' ao plan_type
-- ==============================================================
-- Permite que o app cliente registre consentimento na mesma tabela
-- usada pelo app profissional (LgpdService.registrarConsentimentoCliente).
-- ==============================================================

ALTER TABLE public.legal_consents
  DROP CONSTRAINT IF EXISTS legal_consents_plan_type_check;

ALTER TABLE public.legal_consents
  ADD CONSTRAINT legal_consents_plan_type_check
    CHECK (plan_type IN ('trial', 'mensal', 'trimestral', 'client'));


-- ==============================================================
-- 5. anonimizar_perfil() — função SECURITY DEFINER
-- ==============================================================
-- Substitui dados pessoais identificáveis por valores nulos.
-- Executa com privilégios de OWNER (service_role).
-- NUNCA chamada diretamente pelo app — apenas pelo backend após
-- validação do pedido de exclusão.
--
-- Dados anonimizados conforme Art. 5, III, LGPD:
--   Dado anonimizado = "dado relativo ao titular que não possa ser
--   identificado, considerado o uso de meios técnicos razoáveis"
-- ==============================================================

CREATE OR REPLACE FUNCTION public.anonimizar_perfil(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Substitui dados pessoais identificáveis por valores nulos/anônimos
  UPDATE public.profiles
  SET
    full_name   = '[removido]',
    phone       = NULL,
    address     = NULL,
    birth_date  = NULL,
    gender      = NULL,
    zip_code    = NULL,
    avatar_path = NULL,
    is_active   = false,
    updated_at  = now()
  WHERE id = p_user_id;

  -- Registra a conclusão do pedido de exclusão
  UPDATE public.data_deletion_requests
  SET
    status       = 'completed',
    processed_at = now()
  WHERE user_id = p_user_id;
END;
$$;

-- Revoga execução para roles não privilegiadas (defesa em profundidade)
REVOKE ALL ON FUNCTION public.anonimizar_perfil(uuid) FROM PUBLIC, anon, authenticated;

-- Apenas o backend (service_role) pode chamar esta função
GRANT EXECUTE ON FUNCTION public.anonimizar_perfil(uuid) TO service_role;

COMMENT ON FUNCTION public.anonimizar_perfil(uuid) IS
  'LGPD Art. 18, VI — Anonimiza dados pessoais após validação do pedido de exclusão. '
  'SECURITY DEFINER: executa apenas via service_role (backend). '
  'Nunca deve ser chamada diretamente pelo app cliente.';
