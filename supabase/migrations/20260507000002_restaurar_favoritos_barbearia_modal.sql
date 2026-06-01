-- =============================================================
-- Migration: 20260507000002_restaurar_favoritos_barbearia_modal.sql
--
-- Problema: a migration 20260505000002 removeu o UNION com
-- barbershop_interactions, deixando apenas favorite_professionals.
-- Com isso, clientes que favoritaram a BARBEARIA deixaram de
-- aparecer na modal de selecao de cliente da cadeira.
--
-- Solucao: restaurar o UNION usando LANGUAGE sql (mesmo padrao
-- de 20260505000006 para evitar "column reference is ambiguous").
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
  FROM public.profiles AS p
  WHERE p.id IN (
    -- Quem favoritou a barbearia
    SELECT bi.user_id
    FROM   public.barbershop_interactions AS bi
    WHERE  bi.barbershop_id = p_barbershop_id
      AND  bi.type = 'favorite'
    UNION
    -- Quem favoritou o barbeiro
    SELECT fp.user_id
    FROM   public.favorite_professionals AS fp
    WHERE  fp.professional_id = p_professional_id
  )
  ORDER BY p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_clientes_favoritos_modal(UUID, UUID) TO authenticated;
