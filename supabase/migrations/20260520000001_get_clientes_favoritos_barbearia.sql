-- =============================================================
-- Migration: 20260520000001_get_clientes_favoritos_barbearia.sql
--
-- Objetivo: expor lista de clientes elegiveis ao plano de
-- mensalista de uma barbearia. Sao elegiveis quem:
--   1) favoritou a propria barbearia (barbershop_interactions);
--   2) favoritou QUALQUER barbeiro vinculado a essa barbearia
--      (favorite_professionals JOIN professional_shop_links).
--
-- Diferenca para get_clientes_favoritos_modal:
--   - aquela retorna favoritos de UM barbeiro especifico
--     (modal de cadeira);
--   - esta retorna favoritos da BARBEARIA como um todo
--     (mslm-card / mensalistas).
--
-- Seguranca:
--   - LANGUAGE sql / STABLE / SECURITY DEFINER
--   - search_path travado em "public" para evitar hijacking
--   - GRANT EXECUTE apenas a authenticated
-- =============================================================

CREATE OR REPLACE FUNCTION public.get_clientes_favoritos_barbearia(
  p_barbershop_id UUID
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
    -- Favoritos diretos da barbearia
    SELECT bi.user_id
    FROM   public.barbershop_interactions AS bi
    WHERE  bi.barbershop_id = p_barbershop_id
      AND  bi.type = 'favorite'
    UNION
    -- Favoritos de barbeiros vinculados a essa barbearia
    SELECT fp.user_id
    FROM   public.favorite_professionals    AS fp
    JOIN   public.professional_shop_links   AS psl
           ON psl.professional_id = fp.professional_id
    WHERE  psl.barbershop_id = p_barbershop_id
      AND  psl.is_active = true
  )
  ORDER BY p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_clientes_favoritos_barbearia(UUID) TO authenticated;
