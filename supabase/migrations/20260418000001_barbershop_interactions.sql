-- =============================================================
-- 20260418000001_barbershop_interactions.sql
-- Sistema de interações dos clientes com barbearias:
-- curtida (like), descurtida (dislike) e favorito.
--
-- Cria tabela barbershop_interactions e adiciona contadores
-- desnormalizados na tabela barbershops para leitura barata.
-- Um trigger mantém os contadores e recalcula o rating_score.
--
-- Fórmula do rating_score (0.0 a 5.0, 1 decimal):
--   ratio = likes / (likes + dislikes)
--   score = CLAMP(ratio * 5.0 - dislikes * 0.1, 0.0, 5.0)
-- =============================================================

-- ── Colunas desnormalizadas na tabela principal ──────────────
ALTER TABLE barbershops
  ADD COLUMN IF NOT EXISTS likes_count     INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dislikes_count  INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_score    NUMERIC(3,1) NOT NULL DEFAULT 0.0;

-- ── Tabela de interações ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS barbershop_interactions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID        NOT NULL REFERENCES barbershops(id)  ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  type          TEXT        NOT NULL CHECK (type IN ('like', 'dislike', 'favorite')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (barbershop_id, user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_bi_barbershop ON barbershop_interactions (barbershop_id);
CREATE INDEX IF NOT EXISTS idx_bi_user       ON barbershop_interactions (user_id);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE barbershop_interactions ENABLE ROW LEVEL SECURITY;

-- Apenas o próprio usuário lê suas interações
CREATE POLICY "bi_select_own"
  ON barbershop_interactions FOR SELECT
  USING (auth.uid() = user_id);

-- Usuário insere apenas para si mesmo
CREATE POLICY "bi_insert_own"
  ON barbershop_interactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Usuário remove apenas suas interações (toggle)
CREATE POLICY "bi_delete_own"
  ON barbershop_interactions FOR DELETE
  USING (auth.uid() = user_id);

-- Leitura anônima dos contadores (via barbershops, que já é pública)
-- Não é necessária policy extra — os campos estão na tabela barbershops.

-- ── Trigger: atualiza contadores e rating_score ──────────────
CREATE OR REPLACE FUNCTION fn_update_barbershop_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_id       UUID;
  v_likes    INT;
  v_dislikes INT;
  v_score    NUMERIC(3,1);
BEGIN
  v_id := COALESCE(NEW.barbershop_id, OLD.barbershop_id);

  -- Recalcula a partir das interações reais (fonte da verdade)
  SELECT
    COUNT(*) FILTER (WHERE type = 'like'),
    COUNT(*) FILTER (WHERE type = 'dislike')
  INTO v_likes, v_dislikes
  FROM barbershop_interactions
  WHERE barbershop_id = v_id;

  -- Fórmula: ratio positivo * 5, penalizado pelos negativos
  -- Mínimo 0.0, máximo 5.0, 1 casa decimal
  IF (v_likes + v_dislikes) = 0 THEN
    v_score := 0.0;
  ELSE
    v_score := GREATEST(0.0, LEAST(5.0,
      ROUND(
        (v_likes::NUMERIC / (v_likes + v_dislikes)) * 5.0
        - (v_dislikes::NUMERIC * 0.1)
      , 1)
    ));
  END IF;

  UPDATE barbershops
  SET
    likes_count    = v_likes,
    dislikes_count = v_dislikes,
    rating_score   = v_score
  WHERE id = v_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_barbershop_rating ON barbershop_interactions;
CREATE TRIGGER trg_barbershop_rating
  AFTER INSERT OR DELETE ON barbershop_interactions
  FOR EACH ROW EXECUTE FUNCTION fn_update_barbershop_rating();
