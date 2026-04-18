-- ==============================================================
-- Migration: 20260417000006_fix_trial_race_condition.sql
-- Descrição: CRÍTICO — Corrige race condition (TOCTOU) na
--            ativação de trials simultâneos.
--
-- Vulnerabilidade corrigida:
--   A Edge Function validate-purchase faz SELECT para verificar
--   assinatura existente e depois INSERT. Requests paralelos
--   passavam pelo SELECT antes de qualquer INSERT ocorrer.
--   Como purchase_token é NULL para trial, o UNIQUE constraint
--   existente não protegia (NULL != NULL no PostgreSQL).
--
-- Solução: partial unique index que garante no banco, de forma
--   atômica, que só existe 1 linha com status ativo por usuário.
-- ==============================================================

-- Índice parcial ÚNICO: apenas 1 linha com status 'trial' ou 'active'
-- por usuário é permitida simultaneamente.
-- O banco rejeita o segundo INSERT com UNIQUE VIOLATION (23505),
-- independentemente de race condition — a proteção é atômica.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_active_per_user
  ON public.subscriptions (user_id)
  WHERE status IN ('trial', 'active');


-- ==============================================================
-- BÔNUS: RLS para a tabela subscriptions (insert via service_role
-- já estava correto, mas SELECT own é seguro e explícito).
-- ==============================================================

-- Garante que a tabela tem RLS ativo
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas suas próprias assinaturas
DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Apenas service_role insere (Edge Function usa service_role key)
DROP POLICY IF EXISTS "subscriptions_insert_service" ON public.subscriptions;
CREATE POLICY "subscriptions_insert_service"
  ON public.subscriptions FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Apenas service_role atualiza (ex: renovação, cancelamento)
DROP POLICY IF EXISTS "subscriptions_update_service" ON public.subscriptions;
CREATE POLICY "subscriptions_update_service"
  ON public.subscriptions FOR UPDATE
  USING (auth.role() = 'service_role');
