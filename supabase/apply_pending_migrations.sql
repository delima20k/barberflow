-- ================================================================
-- BARBERFLOW — Script único para aplicar todas as migrations pendentes
-- Execute este arquivo no Supabase SQL Editor:
--   https://supabase.com/dashboard/project/jfvjisqnzapxxagkbxcu/sql/new
--
-- É seguro rodar mais de uma vez (todas as operações são idempotentes).
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 1. PROFILES_PUBLIC — expõe rating_avg e rating_count dos profissionais
-- ────────────────────────────────────────────────────────────────
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
    COALESCE(pr.rating_avg,   0.00) AS rating_avg,
    COALESCE(pr.rating_count, 0)    AS rating_count
  FROM  public.profiles     p
  LEFT JOIN public.professionals pr ON pr.id = p.id
  WHERE p.is_active = true;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- ────────────────────────────────────────────────────────────────
-- 2. FAVORITE_PROFESSIONALS — barbeiros favoritos do cliente
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.favorite_professionals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id)       ON DELETE CASCADE,
  professional_id UUID        NOT NULL REFERENCES public.professionals(id)  ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, professional_id)
);

CREATE INDEX IF NOT EXISTS idx_fav_pro_user ON public.favorite_professionals(user_id);
CREATE INDEX IF NOT EXISTS idx_fav_pro_pro  ON public.favorite_professionals(professional_id);

ALTER TABLE public.favorite_professionals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fav_pro_select_own" ON public.favorite_professionals;
CREATE POLICY "fav_pro_select_own"
  ON public.favorite_professionals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_pro_insert_own" ON public.favorite_professionals;
CREATE POLICY "fav_pro_insert_own"
  ON public.favorite_professionals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_pro_delete_own" ON public.favorite_professionals;
CREATE POLICY "fav_pro_delete_own"
  ON public.favorite_professionals FOR DELETE
  USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- 3. PROFESSIONAL_LIKES — curtidas de clientes em barbeiros
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.professional_likes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID        NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (professional_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pro_likes_pro  ON public.professional_likes(professional_id);
CREATE INDEX IF NOT EXISTS idx_pro_likes_user ON public.professional_likes(user_id);

ALTER TABLE public.professional_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pro_likes_select_own" ON public.professional_likes;
CREATE POLICY "pro_likes_select_own"
  ON public.professional_likes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "pro_likes_insert_own" ON public.professional_likes;
CREATE POLICY "pro_likes_insert_own"
  ON public.professional_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "pro_likes_delete_own" ON public.professional_likes;
CREATE POLICY "pro_likes_delete_own"
  ON public.professional_likes FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger: mantém rating_count sincronizado em professionals
CREATE OR REPLACE FUNCTION fn_update_professional_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.professionals
       SET rating_count = rating_count + 1
     WHERE id = NEW.professional_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.professionals
       SET rating_count = GREATEST(rating_count - 1, 0)
     WHERE id = OLD.professional_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_professional_likes ON public.professional_likes;
CREATE TRIGGER trg_professional_likes
  AFTER INSERT OR DELETE ON public.professional_likes
  FOR EACH ROW EXECUTE FUNCTION fn_update_professional_likes_count();

-- ────────────────────────────────────────────────────────────────
-- 4. ENSURE PROFESSIONALS ROW — backfill + trigger automático
-- ────────────────────────────────────────────────────────────────
INSERT INTO public.professionals (id)
SELECT p.id
FROM public.profiles p
WHERE p.role = 'professional'
  AND NOT EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.id = p.id)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_profile_professional()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.role = 'professional' THEN
    INSERT INTO public.professionals (id)
    VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_professional ON public.profiles;
CREATE TRIGGER trg_profile_professional
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_professional();

-- ────────────────────────────────────────────────────────────────
-- 5. BAYESIAN RATING — fórmula Bayesiana para barbershops
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_update_barbershop_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_id       UUID;
  v_likes    INT;
  v_dislikes INT;
  v_avg      NUMERIC;
  v_score    NUMERIC(3,1);
  PRIOR_N    CONSTANT NUMERIC := 5;
  PRIOR_MEAN CONSTANT NUMERIC := 3.0;
BEGIN
  v_id := COALESCE(NEW.barbershop_id, OLD.barbershop_id);

  SELECT
    COUNT(*) FILTER (WHERE type = 'like'),
    COUNT(*) FILTER (WHERE type = 'dislike')
  INTO v_likes, v_dislikes
  FROM barbershop_interactions
  WHERE barbershop_id = v_id;

  IF (v_likes + v_dislikes) = 0 THEN
    v_score := 0.0;
  ELSE
    v_avg := (v_likes * 5.0 + v_dislikes * 1.0) / (v_likes + v_dislikes);
    v_score := ROUND(
      (PRIOR_MEAN * PRIOR_N + v_avg * (v_likes + v_dislikes))
      / (PRIOR_N + (v_likes + v_dislikes))
    , 1);
  END IF;

  UPDATE barbershops
     SET likes_count    = v_likes,
         dislikes_count = v_dislikes,
         rating_score   = v_score
   WHERE id = v_id;

  RETURN NEW;
END;
$$;

-- Recalcula scores existentes com a nova fórmula Bayesiana
UPDATE barbershops b
   SET rating_score = (
     SELECT CASE
       WHEN (lk + dl) = 0 THEN 0.0
       ELSE ROUND(
         (3.0 * 5 + ((lk * 5.0 + dl * 1.0) / (lk + dl)) * (lk + dl))
         / (5 + (lk + dl))
       , 1)
     END
     FROM (
       SELECT
         COUNT(*) FILTER (WHERE type = 'like')    AS lk,
         COUNT(*) FILTER (WHERE type = 'dislike') AS dl
       FROM barbershop_interactions
       WHERE barbershop_id = b.id
     ) stats
   );

-- ================================================================
-- FIM — todas as tabelas, triggers e views foram criadas/atualizadas
-- ================================================================
