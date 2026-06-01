-- =============================================================
-- 20260421000004_bayesian_rating_formula.sql
-- Atualiza a fórmula do rating_score em barbershops para usar
-- média ponderada Bayesiana, idêntica ao cálculo do front-end.
--
-- Fórmula (iFood/99 style):
--   avg  = (likes * 5.0 + dislikes * 1.0) / total
--   score = (PRIOR_MEAN * PRIOR_N + avg * total) / (PRIOR_N + total)
--   PRIOR_N = 5, PRIOR_MEAN = 3.0
-- =============================================================

CREATE OR REPLACE FUNCTION fn_update_barbershop_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_id       UUID;
  v_likes    INT;
  v_dislikes INT;
  v_avg      NUMERIC;
  v_score    NUMERIC(3,1);

  -- Parâmetros Bayesianos (espelham o front-end)
  PRIOR_N    CONSTANT NUMERIC := 5;
  PRIOR_MEAN CONSTANT NUMERIC := 3.0;
BEGIN
  v_id := COALESCE(NEW.barbershop_id, OLD.barbershop_id);

  -- Recalcula a partir das interações reais (fonte de verdade)
  SELECT
    COUNT(*) FILTER (WHERE type = 'like'),
    COUNT(*) FILTER (WHERE type = 'dislike')
  INTO v_likes, v_dislikes
  FROM barbershop_interactions
  WHERE barbershop_id = v_id;

  IF (v_likes + v_dislikes) = 0 THEN
    v_score := 0.0;
  ELSE
    -- Média ponderada: like = 5.0, dislike = 1.0
    v_avg := (v_likes * 5.0 + v_dislikes * 1.0) / (v_likes + v_dislikes);
    -- Suavização Bayesiana
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

-- Recalcula todos os scores existentes com a nova fórmula
UPDATE barbershops b
   SET rating_score = (
     WITH stats AS (
       SELECT
         COUNT(*) FILTER (WHERE type = 'like')    AS lk,
         COUNT(*) FILTER (WHERE type = 'dislike') AS dl
       FROM barbershop_interactions
       WHERE barbershop_id = b.id
     )
     SELECT CASE
       WHEN (lk + dl) = 0 THEN 0.0
       ELSE ROUND(
         (3.0 * 5 + ((lk * 5.0 + dl * 1.0) / (lk + dl)) * (lk + dl))
         / (5 + (lk + dl))
       , 1)
     END
     FROM stats
   );
