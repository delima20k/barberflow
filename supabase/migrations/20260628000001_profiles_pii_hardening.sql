-- ==============================================================
-- Migration: 20260628000001_profiles_pii_hardening.sql
-- Descrição: Correção P0 de vazamento de PII (OWASP API3:2023 —
--            Broken Object Property Level Authorization).
--
-- PROBLEMA:
--   A policy "profiles_select_active_for_queue" (USING is_active = true)
--   somada ao GRANT SELECT default permitia que QUALQUER usuário
--   autenticado (anon key é pública) lesse email/phone/address/
--   birth_date/zip_code de TODOS os perfis ativos via PostgREST.
--   RLS filtra LINHA, não COLUNA — não há proteção de coluna nativa.
--
-- SOLUÇÃO (defesa no banco, não na aplicação):
--   1. REVOKE SELECT direto na tabela profiles para anon/authenticated.
--      → A tabela deixa de ser legível pela anon key. Leitura do
--        próprio perfil completo passa a ser servida pela BFF
--        (service_role + JWT.sub == profile.id no AuthMiddleware).
--   2. Remover a policy de fila (não é mais necessária: leituras de
--      terceiros vão exclusivamente pela view profiles_public).
--   3. Recriar profiles_public SEM a coluna `phone` (privada),
--      mantendo apenas colunas públicas que o app realmente usa.
--
-- DECISÃO CONSCIENTE — view SECURITY DEFINER (owner-rights):
--   profiles_public é mantida como SECURITY DEFINER (padrão), NÃO
--   security_invoker. Motivo: anon precisa buscar barbearias/profissionais
--   sem login; com SELECT revogado na tabela base, uma view invoker daria
--   permission denied para anon. Como definer, a view roda como owner e
--   projeta SOMENTE colunas não-sensíveis — esse recorte de colunas É a
--   proteção. O Supabase Advisor sinaliza "security definer view" como
--   alerta genérico; aqui é intencional e é o mecanismo de proteção.
--   Ref.: docs/db/supabase-advisor-security-audit-2026-06-26.md
--
-- ==============================================================
-- rollback:
--   GRANT SELECT ON public.profiles TO anon, authenticated;
--   CREATE POLICY "profiles_select_active_for_queue"
--     ON public.profiles FOR SELECT TO authenticated
--     USING (is_active = true);
--   CREATE OR REPLACE VIEW public.profiles_public AS
--     SELECT p.id, p.full_name, p.phone, p.avatar_path, p.role,
--            p.pro_type, p.is_active, p.created_at, p.updated_at,
--            coalesce(pr.rating_avg, 0.00) AS rating_avg,
--            coalesce(pr.rating_count, 0)  AS rating_count
--     FROM public.profiles p
--     LEFT JOIN public.professionals pr ON pr.id = p.id
--     WHERE p.is_active = true;
--   GRANT SELECT ON public.profiles_public TO anon, authenticated;
-- ==============================================================


-- ── 1. Revoga leitura direta da tabela profiles ──────────────
-- Fecha o vetor: anon/authenticated não selecionam mais profiles
-- via PostgREST. O próprio dono lê seu perfil completo pela BFF.
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;

-- ── 2. Remove a policy de fila (não é mais usada) ────────────
-- Leituras de perfis de terceiros passam a usar a view profiles_public.
DROP POLICY IF EXISTS "profiles_select_active_for_queue" ON public.profiles;

-- A policy "profiles_select_own" permanece. Ela não concede leitura
-- via PostgREST (SELECT foi revogado), mas mantém o contrato de RLS
-- para SELECT caso um GRANT seja reintroduzido no futuro, e não
-- interfere em UPDATE/INSERT (que têm policies próprias).

-- ── 3. profiles_public sem `phone` (recorte de colunas públicas)
-- SECURITY DEFINER (padrão) — projeta apenas colunas não-sensíveis.
CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT
    p.id,
    p.full_name,
    p.avatar_path,
    p.role,
    p.pro_type,
    p.is_active,
    p.created_at,
    p.updated_at,
    coalesce(pr.rating_avg,   0.00) AS rating_avg,
    coalesce(pr.rating_count, 0)    AS rating_count
  FROM  public.profiles      p
  LEFT JOIN public.professionals pr ON pr.id = p.id
  WHERE p.is_active = true;

-- anon precisa buscar barbearias/profissionais sem login (decisão do produto).
GRANT SELECT ON public.profiles_public TO anon, authenticated;

COMMENT ON VIEW public.profiles_public IS
  'View pública de profiles — SECURITY DEFINER intencional. Projeta apenas '
  'colunas não-sensíveis (sem phone/email/address/birth_date/gender/zip_code). '
  'É a única porta de leitura de profiles para anon/authenticated. '
  'Perfil privado do próprio dono é servido pela BFF (/api/v1/auth/me).';
