-- ==============================================================
-- Migration: 20260503000002_modal_rpc_functions.sql
-- Descrição: Funções SECURITY DEFINER para o modal de seleção
--            de cliente no app profissional.
--
-- Por que SECURITY DEFINER?
--   As tabelas barbershop_interactions, favorite_professionals e
--   profiles possuem RLS que restringe cada usuário à sua própria
--   linha. O profissional precisa ver dados de outros usuários.
--   SECURITY DEFINER executa com as permissões do owner (postgres),
--   contornando RLS de forma controlada e auditável, sem expor
--   a service_role key no frontend.
-- ==============================================================

-- ── 1. Busca de perfis por nome (para o input de busca da modal) ─
CREATE OR REPLACE FUNCTION public.buscar_perfis_por_nome(
  p_termo  TEXT,
  p_limite INT DEFAULT 20
)
RETURNS TABLE (
  id          UUID,
  full_name   TEXT,
  avatar_path TEXT,
  updated_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Limita entre 1 e 50 para evitar abuso
  p_limite := GREATEST(1, LEAST(p_limite, 50));

  RETURN QUERY
    SELECT
      p.id,
      p.full_name,
      p.avatar_path,
      p.updated_at
    FROM public.profiles p
    WHERE p.full_name ILIKE '%' || p_termo || '%'
    ORDER BY p.full_name
    LIMIT p_limite;
END;
$$;

-- Permite que qualquer usuário autenticado chame via RPC
GRANT EXECUTE ON FUNCTION public.buscar_perfis_por_nome(TEXT, INT) TO authenticated;


-- ── 2. Favoritos da modal (quem favoritou a barbearia ou barbeiro) ─
CREATE OR REPLACE FUNCTION public.get_clientes_favoritos_modal(
  p_barbershop_id   UUID,
  p_professional_id UUID
)
RETURNS TABLE (
  id          UUID,
  full_name   TEXT,
  avatar_path TEXT,
  updated_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids UUID[];
BEGIN
  -- Coleta IDs de quem favoritou a barbearia
  SELECT ARRAY_AGG(DISTINCT bi.user_id)
  INTO   v_ids
  FROM   public.barbershop_interactions bi
  WHERE  bi.barbershop_id = p_barbershop_id
    AND  bi.type = 'favorite';

  -- Adiciona IDs de quem favoritou o barbeiro
  SELECT ARRAY_AGG(DISTINCT fp.user_id)
  INTO   v_ids
  FROM   public.favorite_professionals fp
  WHERE  fp.professional_id = p_professional_id
  UNION ALL
  SELECT UNNEST(v_ids);

  -- Recolhe lista unificada e deduplica
  SELECT ARRAY_AGG(DISTINCT uid)
  INTO   v_ids
  FROM   UNNEST(v_ids) AS uid;

  IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      p.id,
      p.full_name,
      p.avatar_path,
      p.updated_at
    FROM public.profiles p
    WHERE p.id = ANY(v_ids)
    ORDER BY p.full_name;
END;
$$;

-- Permite que qualquer usuário autenticado chame via RPC
GRANT EXECUTE ON FUNCTION public.get_clientes_favoritos_modal(UUID, UUID) TO authenticated;
