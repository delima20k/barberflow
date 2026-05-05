-- Migration: 20260505000002_fix_clientes_favoritos_modal
-- Ajuste: a modal de seleção de clientes na cadeira deve exibir
-- apenas usuários que favoritaram o PROFISSIONAL específico,
-- não quem favoritou a barbearia (gerava falsos positivos).

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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT DISTINCT
      p.id,
      p.full_name,
      p.email,
      p.avatar_path,
      p.updated_at
    FROM public.profiles p
    WHERE p.id IN (
      -- Apenas quem favoritou este profissional específico
      SELECT fp.user_id
      FROM   public.favorite_professionals fp
      WHERE  fp.professional_id = p_professional_id
    )
    ORDER BY p.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_clientes_favoritos_modal(UUID, UUID) TO authenticated;
