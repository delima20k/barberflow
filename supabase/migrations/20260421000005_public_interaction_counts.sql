-- =============================================================
-- 20260421000005_public_interaction_counts.sql
-- Corrige dois problemas críticos de visibilidade de contadores:
--
-- PROBLEMA 1: Trigger sem SECURITY DEFINER
--   fn_update_barbershop_rating e fn_update_professional_likes_count
--   executavam com o contexto do usuário logado. A RLS "select_own"
--   fazia o COUNT(*) ver apenas as interações do próprio usuário
--   (sempre 0 ou 1), corrompendo likes_count / dislikes_count.
--   Fix: adicionar SECURITY DEFINER às funções de trigger.
--
-- PROBLEMA 2: Sem política pública de SELECT
--   Usuários anônimos recebiam {} de getInteractionCountsAll,
--   caindo no fallback de dataset.likes = likes_count = 0.
--   Fix: policy USING (true) em barbershop_interactions e
--   professional_likes para que todos possam ler os contadores.
-- =============================================================

-- ── barbershop_interactions: leitura pública ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'barbershop_interactions'
      AND policyname = 'bi_select_public_counts'
  ) THEN
    CREATE POLICY "bi_select_public_counts"
      ON public.barbershop_interactions FOR SELECT
      USING (true);
  END IF;
END$$;

-- ── professional_likes: leitura pública ──────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'professional_likes'
      AND policyname = 'pl_select_public_counts'
  ) THEN
    CREATE POLICY "pl_select_public_counts"
      ON public.professional_likes FOR SELECT
      USING (true);
  END IF;
END$$;

-- ── Recria fn_update_barbershop_rating com SECURITY DEFINER ──
-- SECURITY DEFINER permite que o COUNT(*) veja todas as linhas,
-- ignorando a RLS "bi_select_own" que filtra por usuário.
CREATE OR REPLACE FUNCTION public.fn_update_barbershop_rating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id       UUID;
  v_likes    INT;
  v_dislikes INT;
  v_avg      NUMERIC;
  v_score    NUMERIC(3,1);

  -- Parâmetros Bayesianos (espelham o front-end: calcRatingScore)
  PRIOR_N    CONSTANT NUMERIC := 5;
  PRIOR_MEAN CONSTANT NUMERIC := 3.0;
BEGIN
  v_id := COALESCE(NEW.barbershop_id, OLD.barbershop_id);

  -- Reconta SEM restrição de RLS (SECURITY DEFINER ignora bi_select_own)
  SELECT
    COUNT(*) FILTER (WHERE type = 'like'),
    COUNT(*) FILTER (WHERE type = 'dislike')
  INTO v_likes, v_dislikes
  FROM public.barbershop_interactions
  WHERE barbershop_id = v_id;

  IF (v_likes + v_dislikes) = 0 THEN
    v_score := 0.0;
  ELSE
    -- Média ponderada: like = 5.0, dislike = 1.0
    v_avg := (v_likes * 5.0 + v_dislikes * 1.0) / (v_likes + v_dislikes);
    -- Suavização Bayesiana (iFood/99 style)
    v_score := ROUND(
      (PRIOR_MEAN * PRIOR_N + v_avg * (v_likes + v_dislikes))
      / (PRIOR_N + (v_likes + v_dislikes))
    , 1);
  END IF;

  UPDATE public.barbershops
  SET
    likes_count    = v_likes,
    dislikes_count = v_dislikes,
    rating_score   = v_score
  WHERE id = v_id;

  RETURN NEW;
END;
$$;

-- Reinstala o trigger (DROP+CREATE garante uso da nova função)
DROP TRIGGER IF EXISTS trg_barbershop_rating ON public.barbershop_interactions;
CREATE TRIGGER trg_barbershop_rating
  AFTER INSERT OR DELETE ON public.barbershop_interactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_barbershop_rating();

-- ── Recria fn_update_professional_likes_count com SECURITY DEFINER ──
CREATE OR REPLACE FUNCTION public.fn_update_professional_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id    UUID;
  v_count INT;
BEGIN
  v_id := COALESCE(NEW.professional_id, OLD.professional_id);

  -- Reconta SEM restrição de RLS (SECURITY DEFINER ignora pro_likes_select_own)
  SELECT COUNT(*) INTO v_count
  FROM public.professional_likes
  WHERE professional_id = v_id;

  UPDATE public.professionals
  SET rating_count = v_count
  WHERE id = v_id;

  RETURN NULL;
END;
$$;

-- Reinstala o trigger
DROP TRIGGER IF EXISTS trg_professional_likes ON public.professional_likes;
CREATE TRIGGER trg_professional_likes
  AFTER INSERT OR DELETE ON public.professional_likes
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_professional_likes_count();

-- ── Backfill: recalcula barbershops.likes_count / dislikes_count ─
-- Corrige dados corrompidos pelo trigger sem SECURITY DEFINER.
UPDATE public.barbershops b
SET
  likes_count    = COALESCE((
    SELECT COUNT(*) FROM public.barbershop_interactions
    WHERE barbershop_id = b.id AND type = 'like'
  ), 0),
  dislikes_count = COALESCE((
    SELECT COUNT(*) FROM public.barbershop_interactions
    WHERE barbershop_id = b.id AND type = 'dislike'
  ), 0);

-- ── Backfill: recalcula professionals.rating_count ───────────
UPDATE public.professionals p
SET rating_count = COALESCE((
  SELECT COUNT(*) FROM public.professional_likes
  WHERE professional_id = p.id
), 0);

-- ── Recalcula rating_score após backfill ─────────────────────
UPDATE public.barbershops b
SET rating_score = (
  SELECT CASE
    WHEN (lk + dl) = 0 THEN 0.0
    ELSE ROUND(
      (3.0 * 5 + ((lk * 5.0 + dl * 1.0) / (lk + dl)) * (lk + dl))
      / (5.0 + (lk + dl))
    , 1)
  END
  FROM (
    SELECT b.likes_count AS lk, b.dislikes_count AS dl
  ) sub
);
