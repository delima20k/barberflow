-- ==============================================================
-- Migration: 20260503000003_search_indexes_and_rpc.sql
-- Descrição: Índices de performance para busca de usuários e
--            função RPC search_users — busca unificada em
--            profiles + barbershops em uma única query parametrizada.
-- ==============================================================

-- ── 1. Índices em profiles ────────────────────────────────────

-- BTREE em LOWER(full_name): acelera ILIKE case-insensitive
CREATE INDEX IF NOT EXISTS idx_profiles_full_name_lower
  ON public.profiles (LOWER(full_name));

-- BTREE em LOWER(email): refina o existente idx_profiles_email
CREATE INDEX IF NOT EXISTS idx_profiles_email_lower
  ON public.profiles (LOWER(email));

-- GIN para busca textual (full-text search em português)
CREATE INDEX IF NOT EXISTS idx_profiles_fts
  ON public.profiles
  USING GIN (
    to_tsvector(
      'portuguese',
      COALESCE(full_name, '') || ' ' || COALESCE(email, '')
    )
  );

-- ── 2. Índice em barbershops ──────────────────────────────────

-- BTREE em LOWER(name): acelera ILIKE em barbershops.name
CREATE INDEX IF NOT EXISTS idx_barbershops_name_lower
  ON public.barbershops (LOWER(name));

-- ── 3. Função search_users ────────────────────────────────────
--
-- Busca unificada em profiles + barbershops em uma única query.
-- Todos os filtros são parâmetros substituídos pelo planner do
-- PostgreSQL — zero concatenação de string, zero SQL injection.
--
-- Parâmetros:
--   p_term   — termo de busca (NULL → sem filtro de texto)
--   p_role   — filtro de role ('client' | 'professional' | NULL)
--   p_limit  — máx. registros por página (default 20, máx 50)
--   p_offset — deslocamento para paginação (default 0)
--
-- Retorna campos mínimos para exibição em modais/listas.
-- NÃO retorna phone, is_active, dados sensíveis.
-- ==============================================================
CREATE OR REPLACE FUNCTION public.search_users(
  p_term   TEXT    DEFAULT NULL,
  p_role   TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id              UUID,
  full_name       TEXT,
  email           TEXT,
  role            TEXT,
  avatar_path     TEXT,
  barbershop_name TEXT,
  updated_at      TIMESTAMPTZ,
  total_count     BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.email,
    p.role,
    p.avatar_path,
    b.name  AS barbershop_name,
    p.updated_at,
    -- total de linhas que batem o WHERE, calculado ANTES do LIMIT/OFFSET
    COUNT(*) OVER() AS total_count
  FROM public.profiles p
  LEFT JOIN public.barbershops b
    ON  b.owner_id  = p.id
    AND b.is_active = TRUE
  WHERE
    -- Filtro de texto (ativo apenas quando p_term for informado)
    (
      p_term IS NULL
      OR p.full_name ILIKE '%' || p_term || '%'
      OR p.email     ILIKE '%' || p_term || '%'
      OR b.name      ILIKE '%' || p_term || '%'
    )
    -- Filtro de role (ativo apenas quando p_role for informado)
    AND (p_role IS NULL OR p.role = p_role)
    -- Ignora usuários desativados
    AND p.is_active = TRUE
  ORDER BY
    -- Relevância: nome que começa com o termo vem primeiro
    CASE WHEN p_term IS NOT NULL AND p.full_name ILIKE p_term || '%' THEN 0 ELSE 1 END,
    p.full_name
  LIMIT  GREATEST(1, LEAST(p_limit,  50))
  OFFSET GREATEST(0, p_offset);
$$;

-- Concede execução apenas para usuários autenticados
GRANT EXECUTE ON FUNCTION public.search_users(TEXT, TEXT, INTEGER, INTEGER)
  TO authenticated;
