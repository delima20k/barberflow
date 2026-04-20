-- ══════════════════════════════════════════════════════════════════
-- Migration: 20260420000001_profiles_public_rating
-- Objetivo : Adicionar rating_avg e rating_count à view profiles_public
--            via LEFT JOIN com a tabela professionals.
--
-- Contexto : A view profiles_public expõe somente colunas da tabela
--            profiles, mas getBarbers() precisa de rating_avg e
--            rating_count que vivem em professionals.
-- ══════════════════════════════════════════════════════════════════

-- Recria a view expondo rating de professionals (0 para não-profissionais)
CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT
    p.id,
    p.full_name,
    p.phone,
    p.avatar_path,
    p.role,
    p.pro_type,
    p.is_active,
    p.created_at,
    p.updated_at,
    coalesce(pr.rating_avg,    0.00) AS rating_avg,
    coalesce(pr.rating_count,  0)    AS rating_count
  FROM  public.profiles     p
  LEFT JOIN public.professionals pr ON pr.id = p.id
  WHERE p.is_active = true;

-- Mantém permissão de leitura para todos os roles
GRANT SELECT ON public.profiles_public TO anon, authenticated;
