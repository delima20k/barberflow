-- =============================================================
-- Migration: 20260505000006_fix_rpc_clientes_favoritos_sql.sql
--
-- Problema: a versão plpgsql da função get_clientes_favoritos_modal
-- produz "column reference 'id' is ambiguous" em algumas versões do
-- PostgreSQL porque RETURNS TABLE (id UUID, ...) cria uma variável
-- OUT implícita 'id' que conflita com o 'p.id' da query interna
-- durante a resolução de nomes do planner.
--
-- Solução: converter para LANGUAGE sql.
-- Em funções SQL, as colunas de RETURNS TABLE são apenas alias de
-- saída — não criam variáveis no escopo da query, eliminando
-- completamente o conflito de nomes.
--
-- Comportamento (sem alteração):
--   Retorna perfis de clientes que favoritaram o profissional
--   especificado, ordenados por nome.
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_clientes_favoritos_modal(
  p_barbershop_id   UUID,
  p_professional_id UUID
)
RETURNS TABLE (
  id          UUID,
  full_name   TEXT,
  email       TEXT,
  avatar_path TEXT,
  updated_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    p.id          AS id,
    p.full_name   AS full_name,
    p.email       AS email,
    p.avatar_path AS avatar_path,
    p.updated_at  AS updated_at
  FROM  public.profiles               AS p
  INNER JOIN public.favorite_professionals AS fp
    ON  fp.user_id         = p.id
    AND fp.professional_id = p_professional_id
  ORDER BY p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_clientes_favoritos_modal(UUID, UUID) TO authenticated;
