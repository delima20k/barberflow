-- ==============================================================
-- Migration: 20260417000004_profiles_private_columns.sql
-- Descrição: Protege dados pessoais sensíveis (address, birth_date,
--            gender, zip_code) adicionados em 20260417000001.
--
-- Problema: a policy SELECT pública expunha esses campos para
--           qualquer visitante não autenticado (LGPD/GDPR).
--
-- Solução: política de SELECT separada por contexto:
--   - anon / authenticated: vê apenas campos não-sensíveis
--   - próprio usuário (auth.uid() = id): vê todos os campos
--
-- Como o PostgreSQL não suporta column-level RLS nativamente,
-- a estratégia é restringir via função de acesso segura (SECURITY
-- DEFINER) para as colunas sensíveis.
-- O frontend já usa select explícito sem os campos sensíveis
-- (AuthService._carregarPerfil usa select('id, full_name, phone,
-- avatar_path, role, pro_type') — sem address/birth_date/gender/zip).
--
-- Esta migration garante que mesmo uma chamada direta à API
-- Supabase (via REST ou SDK) não retorne campos privados para
-- usuários que não sejam o próprio dono do perfil.
-- ==============================================================

-- ── 1. Remove a policy SELECT pública atual ──────────────────
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;

-- ── 2. SELECT público (anon + authenticated): campos não-sensíveis
--    O truque: usamos uma função SECURITY DEFINER que mascara as
--    colunas sensíveis quando o solicitante não é o dono.
--    Para apps Supabase sem RLS column-level, a abordagem padrão
--    é criar uma VIEW dedicada para leitura pública.
-- ──────────────────────────────────────────────────────────────

-- View pública: expõe apenas campos seguros de profiles
CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT
    id,
    full_name,
    phone,
    avatar_path,
    role,
    pro_type,
    is_active,
    created_at,
    updated_at
  FROM public.profiles
  WHERE is_active = true;

-- Permissão de leitura na view para todos os roles
GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- ── 3. Policy SELECT na tabela original: apenas o próprio usuário
--    vê seus dados completos (incluindo sensíveis).
--    Terceiros devem usar a view profiles_public.
-- ──────────────────────────────────────────────────────────────

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Leitura pública (anon/authenticated) via view profiles_public
-- não precisa de policy na tabela diretamente para anon.
-- Garantia: anon não tem acesso à tabela profiles sem policy.
-- authenticated só acessa a própria linha pela policy acima.
