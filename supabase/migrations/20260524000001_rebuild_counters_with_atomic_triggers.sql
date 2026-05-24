-- =============================================================================
-- Migration: 20260524000001_rebuild_counters_with_atomic_triggers.sql
--
-- Consolida o rebuild completo de contadores desnormalizados com:
--   • Triggers atômicos (+1/-1) em vez de SELECT COUNT(*) por evento
--   • Tabela counter_drift_log para rastreio de reconciliação
--   • Coluna stories.likes_count (C11 — referenciada em SocialRepository.js)
--   • fn_sync_likes_count: C8 (portfolio), C11 (stories), C12 (feed_items)
--   • fn_sync_story_views_count: C10 (stories.views_count)
--   • fn_sync_barbershop_interaction_counts: C1/C2/C3 atomicos
--   • fn_sync_professional_likes_count: C6 atomico
--   • fn_increment_haircuts_count: C14 — incremento atômico via RPC
--   • reconcile_counters(): job semanal com alertas de threshold
--   • rebuild_counter_batch(): suporte ao script rebuild-counters.js
--   • Backfill inicial de todos os contadores corrigidos
--
-- Reversível: ver bloco DOWN no final deste arquivo (comentado).
-- Script de rebuild: scripts/rebuild-counters.js
-- Relatório: docs/db/contadores-audit.md, docs/db/drift-report.json
-- =============================================================================

BEGIN;

-- ─── 1. Tabela de auditoria de drift ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.counter_drift_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid        NOT NULL,
  run_at       timestamptz NOT NULL DEFAULT now(),
  counter_id   text        NOT NULL,
  entity_table text        NOT NULL,
  column_name  text        NOT NULL,
  entity_id    uuid        NOT NULL,
  stored_count integer     NOT NULL,
  real_count   integer     NOT NULL,
  drift        integer     NOT NULL, -- stored - real; negativo = perdidos
  corrected    boolean     NOT NULL DEFAULT false,
  dry_run      boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_counter_drift_log_run
  ON public.counter_drift_log (run_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_counter_drift_log_entity
  ON public.counter_drift_log (entity_table, entity_id);

ALTER TABLE public.counter_drift_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.counter_drift_log FROM anon, authenticated;

-- ─── 2. Coluna stories.likes_count (C11) ─────────────────────────────────────
-- SocialRepository.js:40 referencia esta coluna — PostgREST retornava null.
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0;

-- Fontes de eventos passam a aceitar soft delete. As partial unique indexes
-- preservam "1 evento ativo por usuario/conteudo", mas permitem historico.
ALTER TABLE public.likes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.story_views
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.barbershop_interactions
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.professional_likes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.likes
  DROP CONSTRAINT IF EXISTS likes_user_id_content_id_content_type_key;
ALTER TABLE public.story_views
  DROP CONSTRAINT IF EXISTS story_views_story_id_viewer_id_key;
ALTER TABLE public.barbershop_interactions
  DROP CONSTRAINT IF EXISTS barbershop_interactions_barbershop_id_user_id_type_key;
ALTER TABLE public.professional_likes
  DROP CONSTRAINT IF EXISTS professional_likes_professional_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_likes_active
  ON public.likes (user_id, content_id, content_type)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_story_views_active
  ON public.story_views (story_id, viewer_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_barbershop_interactions_active
  ON public.barbershop_interactions (barbershop_id, user_id, type)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_professional_likes_active
  ON public.professional_likes (professional_id, user_id)
  WHERE deleted_at IS NULL;

-- ─── 3. fn_sync_likes_count — trigger atômico na tabela public.likes ─────────
-- Cobre: C8 (portfolio_images.likes_count), C11 (stories.likes_count),
--        C12 (feed_items.likes_count para qualquer content_type).
-- Padrão atômico: SET count = GREATEST(0, count + delta)
-- NUNCA usa SELECT COUNT(*) — seria caro e sujeito a race condition por evento.
CREATE OR REPLACE FUNCTION public.fn_sync_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_active boolean := false;
  v_new_active boolean := false;
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    v_old_active := OLD.deleted_at IS NULL;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_active := NEW.deleted_at IS NULL;
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE') AND v_old_active THEN
    PERFORM public.apply_like_counter_delta(OLD.content_id, OLD.content_type, -1);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND v_new_active THEN
    PERFORM public.apply_like_counter_delta(NEW.content_id, NEW.content_type, 1);
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_like_counter_delta(
  p_content_id   uuid,
  p_content_type text,
  p_delta        integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Atualiza o contador na tabela dona do conteudo
  CASE p_content_type
    WHEN 'portfolio_image' THEN
      UPDATE public.portfolio_images
      SET    likes_count = GREATEST(0, likes_count + p_delta)
      WHERE  id = p_content_id
        AND  status != 'deleted'; -- ignora imagens soft-deleted
    WHEN 'story' THEN
      UPDATE public.stories
      SET    likes_count = GREATEST(0, likes_count + p_delta)
      WHERE  id = p_content_id;
    ELSE NULL; -- outros tipos: apenas feed_items abaixo
  END CASE;

  -- feed_items espelha likes de qualquer content_type (source_id/source_type)
  UPDATE public.feed_items
  SET    likes_count = GREATEST(0, likes_count + p_delta)
  WHERE  source_id   = p_content_id
    AND  source_type = p_content_type;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_likes_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_like_counter_delta(uuid, text, integer) FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_likes_count ON public.likes;
CREATE TRIGGER trg_sync_likes_count
  AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_likes_count();

DROP TRIGGER IF EXISTS trg_sync_likes_count_soft_delete ON public.likes;
CREATE TRIGGER trg_sync_likes_count_soft_delete
  AFTER UPDATE OF deleted_at, content_id, content_type ON public.likes
  FOR EACH ROW
  WHEN (
    OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR
    OLD.content_id IS DISTINCT FROM NEW.content_id OR
    OLD.content_type IS DISTINCT FROM NEW.content_type
  )
  EXECUTE FUNCTION public.fn_sync_likes_count();

-- ─── 4. fn_sync_story_views_count — trigger atômico em story_views (C10) ─────
-- Não usa SELECT COUNT(*): cada INSERT em story_views faz +1 atomicamente.
-- story_views tem UNIQUE(story_id, viewer_id) — sem risco de dupla contagem.
CREATE OR REPLACE FUNCTION public.fn_sync_story_views_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.stories
  SET    views_count = views_count + 1
  WHERE  id = NEW.story_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_story_views_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_story_views_count ON public.story_views;
CREATE TRIGGER trg_sync_story_views_count
  AFTER INSERT ON public.story_views
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_story_views_count();

CREATE OR REPLACE FUNCTION public.fn_sync_story_views_count_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.deleted_at IS NULL THEN
    UPDATE public.stories
    SET    views_count = GREATEST(0, views_count - 1)
    WHERE  id = OLD.story_id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_sync_story_views_count_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.story_id IS DISTINCT FROM NEW.story_id THEN
    IF OLD.deleted_at IS NULL THEN
      UPDATE public.stories
      SET    views_count = GREATEST(0, views_count - 1)
      WHERE  id = OLD.story_id;
    END IF;
    IF NEW.deleted_at IS NULL THEN
      UPDATE public.stories
      SET    views_count = views_count + 1
      WHERE  id = NEW.story_id;
    END IF;
  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.stories
    SET    views_count = GREATEST(0, views_count - 1)
    WHERE  id = NEW.story_id;
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    UPDATE public.stories
    SET    views_count = views_count + 1
    WHERE  id = NEW.story_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_story_views_count_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_sync_story_views_count_soft_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_story_views_count_delete ON public.story_views;
CREATE TRIGGER trg_sync_story_views_count_delete
  AFTER DELETE ON public.story_views
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_story_views_count_delete();

DROP TRIGGER IF EXISTS trg_sync_story_views_count_soft_delete ON public.story_views;
CREATE TRIGGER trg_sync_story_views_count_soft_delete
  AFTER UPDATE OF deleted_at, story_id ON public.story_views
  FOR EACH ROW
  WHEN (
    OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR
    OLD.story_id IS DISTINCT FROM NEW.story_id
  )
  EXECUTE FUNCTION public.fn_sync_story_views_count_soft_delete();

-- C1/C2/C3: substitui trigger legacy de barbearias por deltas atomicos.
CREATE OR REPLACE FUNCTION public.fn_sync_barbershop_interaction_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_delta_like    integer := 0;
  v_old_delta_dislike integer := 0;
  v_new_delta_like    integer := 0;
  v_new_delta_dislike integer := 0;
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    IF OLD.deleted_at IS NULL THEN
      IF OLD.type = 'like' THEN
        v_old_delta_like := -1;
      ELSIF OLD.type = 'dislike' THEN
        v_old_delta_dislike := -1;
      END IF;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.deleted_at IS NULL THEN
      IF NEW.type = 'like' THEN
        v_new_delta_like := 1;
      ELSIF NEW.type = 'dislike' THEN
        v_new_delta_dislike := 1;
      END IF;
    END IF;
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE') AND (v_old_delta_like <> 0 OR v_old_delta_dislike <> 0) THEN
    PERFORM public.apply_barbershop_counter_delta(OLD.barbershop_id, v_old_delta_like, v_old_delta_dislike);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND (v_new_delta_like <> 0 OR v_new_delta_dislike <> 0) THEN
    PERFORM public.apply_barbershop_counter_delta(NEW.barbershop_id, v_new_delta_like, v_new_delta_dislike);
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_barbershop_counter_delta(
  p_barbershop_id  uuid,
  p_like_delta     integer,
  p_dislike_delta  integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  WITH next_values AS (
    SELECT
      id,
      GREATEST(0, likes_count + p_like_delta)       AS next_likes,
      GREATEST(0, dislikes_count + p_dislike_delta) AS next_dislikes
    FROM public.barbershops
    WHERE id = p_barbershop_id
  )
    UPDATE public.barbershops
    SET
      likes_count    = nv.next_likes,
      dislikes_count = nv.next_dislikes,
      rating_score = CASE
    WHEN (nv.next_likes + nv.next_dislikes) = 0 THEN 0.0
    ELSE ROUND(
      (3.0 * 5 + ((nv.next_likes * 5.0 + nv.next_dislikes * 1.0) / (nv.next_likes + nv.next_dislikes)) * (nv.next_likes + nv.next_dislikes))
      / (5 + (nv.next_likes + nv.next_dislikes))
    , 1)
  END
  FROM next_values nv
  WHERE public.barbershops.id = nv.id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_barbershop_interaction_counts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_barbershop_counter_delta(uuid, integer, integer) FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_barbershop_rating ON public.barbershop_interactions;
CREATE TRIGGER trg_barbershop_rating
  AFTER INSERT OR DELETE ON public.barbershop_interactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_barbershop_interaction_counts();

DROP TRIGGER IF EXISTS trg_barbershop_rating_soft_delete ON public.barbershop_interactions;
CREATE TRIGGER trg_barbershop_rating_soft_delete
  AFTER UPDATE OF deleted_at, type, barbershop_id ON public.barbershop_interactions
  FOR EACH ROW
  WHEN (
    OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR
    OLD.type IS DISTINCT FROM NEW.type OR
    OLD.barbershop_id IS DISTINCT FROM NEW.barbershop_id
  )
  EXECUTE FUNCTION public.fn_sync_barbershop_interaction_counts();

-- C6: trigger atomico para curtidas de profissionais, com soft delete.
CREATE OR REPLACE FUNCTION public.fn_sync_professional_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    IF OLD.deleted_at IS NULL THEN
      UPDATE public.professionals
      SET    rating_count = GREATEST(0, rating_count - 1)
      WHERE  id = OLD.professional_id;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.deleted_at IS NULL THEN
      UPDATE public.professionals
      SET    rating_count = rating_count + 1
      WHERE  id = NEW.professional_id;
    END IF;
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_professional_likes_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_professional_likes ON public.professional_likes;
CREATE TRIGGER trg_professional_likes
  AFTER INSERT OR DELETE ON public.professional_likes
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_professional_likes_count();

DROP TRIGGER IF EXISTS trg_professional_likes_soft_delete ON public.professional_likes;
CREATE TRIGGER trg_professional_likes_soft_delete
  AFTER UPDATE OF deleted_at, professional_id ON public.professional_likes
  FOR EACH ROW
  WHEN (
    OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR
    OLD.professional_id IS DISTINCT FROM NEW.professional_id
  )
  EXECUTE FUNCTION public.fn_sync_professional_likes_count();

-- ─── 5. fn_increment_haircuts_count — RPC atômica para C14 ───────────────────
-- Substitui o read-modify-write de MensalistaRepository.js:232.
-- O UPDATE usa haircuts_count + 1 diretamente — PostgreSQL serializa o row lock.
CREATE OR REPLACE FUNCTION public.increment_haircuts_count(
  p_barbershop_id uuid,
  p_client_id     uuid
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.barbershop_mensalistas
  SET    haircuts_count = haircuts_count + 1
  WHERE  barbershop_id = p_barbershop_id
    AND  client_id     = p_client_id
    AND  ends_at       > now()
  RETURNING haircuts_count;
$$;

REVOKE ALL ON FUNCTION public.increment_haircuts_count(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_haircuts_count(uuid, uuid)
  TO authenticated;

-- ─── 6. rebuild_counter_batch — suporte ao script rebuild-counters.js ─────────
-- Recalcula um lote de counters via cursor (p_after_id).
-- Usa SELECT COUNT(*) — aceitável em rebuild batch, não em evento por linha.
-- Retorna (last_processed_id, rows_updated) para o script atualizar o checkpoint.
CREATE OR REPLACE FUNCTION public.rebuild_counter_batch(
  p_counter  text,
  p_after_id uuid    DEFAULT '00000000-0000-0000-0000-000000000000',
  p_limit    integer DEFAULT 500
)
RETURNS TABLE(last_processed_id uuid, rows_updated bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last_id      uuid;
  v_rows_updated bigint := 0;
BEGIN
  CASE p_counter

    WHEN 'C8' THEN -- portfolio_images.likes_count
      WITH batch AS (
        SELECT id FROM public.portfolio_images
        WHERE  id > p_after_id AND status != 'deleted'
        ORDER BY id LIMIT p_limit
      ), upd AS (
        UPDATE public.portfolio_images pi
        SET    likes_count = (
          SELECT COUNT(*) FROM public.likes l
          WHERE  l.content_id   = pi.id
            AND  l.content_type = 'portfolio_image'
            AND  l.deleted_at IS NULL
        )
        FROM   batch WHERE pi.id = batch.id
        RETURNING pi.id
      )
      SELECT COALESCE(MAX(id), p_after_id), COUNT(*) INTO v_last_id, v_rows_updated FROM upd;

    WHEN 'C10' THEN -- stories.views_count
      WITH batch AS (
        SELECT id FROM public.stories
        WHERE  id > p_after_id
        ORDER BY id LIMIT p_limit
      ), upd AS (
        UPDATE public.stories s
        SET    views_count = (
          SELECT COUNT(*) FROM public.story_views sv
          WHERE sv.story_id = s.id
            AND sv.deleted_at IS NULL
        )
        FROM   batch WHERE s.id = batch.id
        RETURNING s.id
      )
      SELECT COALESCE(MAX(id), p_after_id), COUNT(*) INTO v_last_id, v_rows_updated FROM upd;

    WHEN 'C11' THEN -- stories.likes_count
      WITH batch AS (
        SELECT id FROM public.stories
        WHERE  id > p_after_id
        ORDER BY id LIMIT p_limit
      ), upd AS (
        UPDATE public.stories s
        SET    likes_count = (
          SELECT COUNT(*) FROM public.likes l
          WHERE  l.content_id   = s.id
            AND  l.content_type = 'story'
            AND  l.deleted_at IS NULL
        )
        FROM   batch WHERE s.id = batch.id
        RETURNING s.id
      )
      SELECT COALESCE(MAX(id), p_after_id), COUNT(*) INTO v_last_id, v_rows_updated FROM upd;

    WHEN 'C12' THEN -- feed_items.likes_count
      WITH batch AS (
        SELECT id FROM public.feed_items
        WHERE  id > p_after_id
        ORDER BY id LIMIT p_limit
      ), upd AS (
        UPDATE public.feed_items fi
        SET    likes_count = (
          SELECT COUNT(*) FROM public.likes l
          WHERE  l.content_id   = fi.source_id
            AND  l.content_type = fi.source_type
            AND  l.deleted_at IS NULL
        )
        FROM   batch WHERE fi.id = batch.id
        RETURNING fi.id
      )
      SELECT COALESCE(MAX(id), p_after_id), COUNT(*) INTO v_last_id, v_rows_updated FROM upd;

    WHEN 'C1' THEN -- barbershops.likes_count
      WITH batch AS (
        SELECT id FROM public.barbershops
        WHERE id > p_after_id AND is_active = true
        ORDER BY id LIMIT p_limit
      ), upd AS (
        UPDATE public.barbershops b
        SET likes_count = (
          SELECT COUNT(*) FROM public.barbershop_interactions bi
          WHERE bi.barbershop_id = b.id
            AND bi.type = 'like'
            AND bi.deleted_at IS NULL
        )
        FROM batch WHERE b.id = batch.id
        RETURNING b.id
      )
      SELECT COALESCE(MAX(id), p_after_id), COUNT(*) INTO v_last_id, v_rows_updated FROM upd;

    WHEN 'C2' THEN -- barbershops.dislikes_count
      WITH batch AS (
        SELECT id FROM public.barbershops
        WHERE id > p_after_id AND is_active = true
        ORDER BY id LIMIT p_limit
      ), upd AS (
        UPDATE public.barbershops b
        SET dislikes_count = (
          SELECT COUNT(*) FROM public.barbershop_interactions bi
          WHERE bi.barbershop_id = b.id
            AND bi.type = 'dislike'
            AND bi.deleted_at IS NULL
        )
        FROM batch WHERE b.id = batch.id
        RETURNING b.id
      )
      SELECT COALESCE(MAX(id), p_after_id), COUNT(*) INTO v_last_id, v_rows_updated FROM upd;

    WHEN 'C3' THEN -- barbershops.rating_score
      WITH batch AS (
        SELECT id FROM public.barbershops
        WHERE id > p_after_id AND is_active = true
        ORDER BY id LIMIT p_limit
      ), upd AS (
        UPDATE public.barbershops b
        SET rating_score = (
          WITH s AS (
            SELECT
              COUNT(*) FILTER (WHERE type = 'like')    AS lk,
              COUNT(*) FILTER (WHERE type = 'dislike') AS dl
            FROM public.barbershop_interactions
            WHERE barbershop_id = b.id
              AND deleted_at IS NULL
          )
          SELECT CASE WHEN (s.lk + s.dl) = 0 THEN 0.0
                 ELSE ROUND(
                   (3.0 * 5 + ((s.lk * 5.0 + s.dl * 1.0) / (s.lk + s.dl)) * (s.lk + s.dl))
                   / (5 + (s.lk + s.dl))
                 , 1)
                 END FROM s
        )
        FROM batch WHERE b.id = batch.id
        RETURNING b.id
      )
      SELECT COALESCE(MAX(id), p_after_id), COUNT(*) INTO v_last_id, v_rows_updated FROM upd;

    WHEN 'C6' THEN -- professionals.rating_count
      WITH batch AS (
        SELECT id FROM public.professionals
        WHERE id > p_after_id AND is_active = true
        ORDER BY id LIMIT p_limit
      ), upd AS (
        UPDATE public.professionals p
        SET rating_count = (
          SELECT COUNT(*) FROM public.professional_likes pl
          WHERE pl.professional_id = p.id
            AND pl.deleted_at IS NULL
        )
        FROM batch WHERE p.id = batch.id
        RETURNING p.id
      )
      SELECT COALESCE(MAX(id), p_after_id), COUNT(*) INTO v_last_id, v_rows_updated FROM upd;

    ELSE
      RAISE EXCEPTION 'rebuild_counter_batch: contador desconhecido: %', p_counter
        USING ERRCODE = 'P0001';
  END CASE;

  last_processed_id := COALESCE(v_last_id, p_after_id);
  rows_updated      := v_rows_updated;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_counter_batch(text, uuid, integer)
  FROM PUBLIC, anon, authenticated;

-- ─── 7. reconcile_counters — job de reconciliação semanal ────────────────────
-- Detecta drift em todos os contadores rastreados.
-- Se p_dry_run = false: corrige e registra em counter_drift_log.
-- Emite NOTICE se a proporção de drift exceder p_alert_threshold.
-- Usa SELECT COUNT(*) — aceitável para job agendado (não por evento).
CREATE OR REPLACE FUNCTION public.reconcile_counters(
  p_dry_run         boolean DEFAULT false,
  p_alert_threshold numeric DEFAULT 0.05  -- 5% = alerta
)
RETURNS TABLE(
  counter_id   text,
  entity_table text,
  column_name  text,
  entity_id    uuid,
  stored_count integer,
  real_count   integer,
  drift        integer,
  corrected    boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_run_id    uuid    := gen_random_uuid();
  v_total     bigint  := 0;
  v_drifted   bigint  := 0;
  v_ratio     numeric;
BEGIN

  -- ── C8: portfolio_images.likes_count ───────────────────────────────────────
  FOR entity_id, stored_count, real_count IN
    SELECT pi.id,
           pi.likes_count,
           COUNT(l.id)::integer
    FROM   public.portfolio_images pi
    LEFT JOIN public.likes l
      ON l.content_id   = pi.id
     AND l.content_type = 'portfolio_image'
     AND l.deleted_at IS NULL
    WHERE  pi.status != 'deleted'
    GROUP BY pi.id, pi.likes_count
    HAVING pi.likes_count IS DISTINCT FROM COUNT(l.id)
  LOOP
    counter_id   := 'C8';
    entity_table := 'portfolio_images';
    column_name  := 'likes_count';
    drift        := stored_count - real_count;
    corrected    := NOT p_dry_run;
    v_drifted    := v_drifted + 1;

    IF NOT p_dry_run THEN
      UPDATE public.portfolio_images
      SET    likes_count = real_count
      WHERE  id = entity_id;

      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES
        (v_run_id, 'C8', 'portfolio_images', 'likes_count', entity_id, stored_count, real_count, drift, true, false);
    ELSE
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES
        (v_run_id, 'C8', 'portfolio_images', 'likes_count', entity_id, stored_count, real_count, drift, false, true);
    END IF;

    RETURN NEXT;
  END LOOP;

  SELECT COUNT(*) INTO v_total FROM public.portfolio_images WHERE status != 'deleted';
  IF v_total > 0 THEN
    v_ratio := v_drifted::numeric / v_total;
    IF v_ratio > p_alert_threshold THEN
      RAISE NOTICE 'ALERTA: C8 portfolio_images.likes_count — drift em %.1f%% das entidades (% de %)',
        v_ratio * 100, v_drifted, v_total;
    END IF;
  END IF;
  v_drifted := 0;

  -- ── C10: stories.views_count ───────────────────────────────────────────────
  FOR entity_id, stored_count, real_count IN
    SELECT s.id,
           s.views_count,
           COUNT(sv.id)::integer
    FROM   public.stories s
    LEFT JOIN public.story_views sv
      ON sv.story_id = s.id
     AND sv.deleted_at IS NULL
    GROUP BY s.id, s.views_count
    HAVING s.views_count IS DISTINCT FROM COUNT(sv.id)
  LOOP
    counter_id   := 'C10';
    entity_table := 'stories';
    column_name  := 'views_count';
    drift        := stored_count - real_count;
    corrected    := NOT p_dry_run;
    v_drifted    := v_drifted + 1;

    IF NOT p_dry_run THEN
      UPDATE public.stories SET views_count = real_count WHERE id = entity_id;
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C10', 'stories', 'views_count', entity_id, stored_count, real_count, drift, true, false);
    ELSE
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C10', 'stories', 'views_count', entity_id, stored_count, real_count, drift, false, true);
    END IF;

    RETURN NEXT;
  END LOOP;

  SELECT COUNT(*) INTO v_total FROM public.stories;
  IF v_total > 0 THEN
    v_ratio := v_drifted::numeric / v_total;
    IF v_ratio > p_alert_threshold THEN
      RAISE NOTICE 'ALERTA: C10 stories.views_count — drift em %.1f%% (% de %)',
        v_ratio * 100, v_drifted, v_total;
    END IF;
  END IF;
  v_drifted := 0;

  -- ── C11: stories.likes_count ───────────────────────────────────────────────
  FOR entity_id, stored_count, real_count IN
    SELECT s.id,
           s.likes_count,
           COUNT(l.id)::integer
    FROM   public.stories s
    LEFT JOIN public.likes l
      ON l.content_id   = s.id
     AND l.content_type = 'story'
     AND l.deleted_at IS NULL
    GROUP BY s.id, s.likes_count
    HAVING s.likes_count IS DISTINCT FROM COUNT(l.id)
  LOOP
    counter_id   := 'C11';
    entity_table := 'stories';
    column_name  := 'likes_count';
    drift        := stored_count - real_count;
    corrected    := NOT p_dry_run;
    v_drifted    := v_drifted + 1;

    IF NOT p_dry_run THEN
      UPDATE public.stories SET likes_count = real_count WHERE id = entity_id;
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C11', 'stories', 'likes_count', entity_id, stored_count, real_count, drift, true, false);
    ELSE
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C11', 'stories', 'likes_count', entity_id, stored_count, real_count, drift, false, true);
    END IF;

    RETURN NEXT;
  END LOOP;

  v_drifted := 0;

  -- ── C12: feed_items.likes_count ───────────────────────────────────────────
  FOR entity_id, stored_count, real_count IN
    SELECT fi.id,
           fi.likes_count,
           COUNT(l.id)::integer
    FROM   public.feed_items fi
    LEFT JOIN public.likes l
      ON l.content_id   = fi.source_id
     AND l.content_type = fi.source_type
     AND l.deleted_at IS NULL
    GROUP BY fi.id, fi.likes_count
    HAVING fi.likes_count IS DISTINCT FROM COUNT(l.id)
  LOOP
    counter_id   := 'C12';
    entity_table := 'feed_items';
    column_name  := 'likes_count';
    drift        := stored_count - real_count;
    corrected    := NOT p_dry_run;
    v_drifted    := v_drifted + 1;

    IF NOT p_dry_run THEN
      UPDATE public.feed_items SET likes_count = real_count WHERE id = entity_id;
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C12', 'feed_items', 'likes_count', entity_id, stored_count, real_count, drift, true, false);
    ELSE
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C12', 'feed_items', 'likes_count', entity_id, stored_count, real_count, drift, false, true);
    END IF;

    RETURN NEXT;
  END LOOP;

  SELECT COUNT(*) INTO v_total FROM public.feed_items;
  IF v_total > 0 THEN
    v_ratio := v_drifted::numeric / v_total;
    IF v_ratio > p_alert_threshold THEN
      RAISE NOTICE 'ALERTA: C12 feed_items.likes_count — drift em %.1f%% (% de %)',
        v_ratio * 100, v_drifted, v_total;
    END IF;
  END IF;
  v_drifted := 0;

  -- ── C1: barbershops.likes_count ───────────────────────────────────────────
  FOR entity_id, stored_count, real_count IN
    SELECT b.id,
           b.likes_count,
           COUNT(bi.id) FILTER (WHERE bi.type = 'like' AND bi.deleted_at IS NULL)::integer
    FROM   public.barbershops b
    LEFT JOIN public.barbershop_interactions bi ON bi.barbershop_id = b.id
    WHERE  b.is_active = true
    GROUP BY b.id, b.likes_count
    HAVING b.likes_count IS DISTINCT FROM COUNT(bi.id) FILTER (WHERE bi.type = 'like' AND bi.deleted_at IS NULL)
  LOOP
    counter_id   := 'C1';
    entity_table := 'barbershops';
    column_name  := 'likes_count';
    drift        := stored_count - real_count;
    corrected    := NOT p_dry_run;
    v_drifted    := v_drifted + 1;

    IF NOT p_dry_run THEN
      UPDATE public.barbershops SET likes_count = real_count WHERE id = entity_id;
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C1', 'barbershops', 'likes_count', entity_id, stored_count, real_count, drift, true, false);
    ELSE
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C1', 'barbershops', 'likes_count', entity_id, stored_count, real_count, drift, false, true);
    END IF;

    RETURN NEXT;
  END LOOP;

  -- ── C2: barbershops.dislikes_count ───────────────────────────────────────
  FOR entity_id, stored_count, real_count IN
    SELECT b.id,
           b.dislikes_count,
           COUNT(bi.id) FILTER (WHERE bi.type = 'dislike' AND bi.deleted_at IS NULL)::integer
    FROM   public.barbershops b
    LEFT JOIN public.barbershop_interactions bi ON bi.barbershop_id = b.id
    WHERE  b.is_active = true
    GROUP BY b.id, b.dislikes_count
    HAVING b.dislikes_count IS DISTINCT FROM COUNT(bi.id) FILTER (WHERE bi.type = 'dislike' AND bi.deleted_at IS NULL)
  LOOP
    counter_id   := 'C2';
    entity_table := 'barbershops';
    column_name  := 'dislikes_count';
    drift        := stored_count - real_count;
    corrected    := NOT p_dry_run;

    IF NOT p_dry_run THEN
      UPDATE public.barbershops SET dislikes_count = real_count WHERE id = entity_id;
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C2', 'barbershops', 'dislikes_count', entity_id, stored_count, real_count, drift, true, false);
    ELSE
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C2', 'barbershops', 'dislikes_count', entity_id, stored_count, real_count, drift, false, true);
    END IF;

    RETURN NEXT;
  END LOOP;

  -- ── C3: barbershops.rating_score ─────────────────────────────────────────
  FOR entity_id, stored_count, real_count IN
    WITH stats AS (
      SELECT
        b.id,
        b.rating_score::integer AS stored_as_int,
        b.rating_score,
        COUNT(bi.id) FILTER (WHERE bi.type = 'like' AND bi.deleted_at IS NULL)    AS lk,
        COUNT(bi.id) FILTER (WHERE bi.type = 'dislike' AND bi.deleted_at IS NULL) AS dl
      FROM public.barbershops b
      LEFT JOIN public.barbershop_interactions bi ON bi.barbershop_id = b.id
      WHERE b.is_active = true
      GROUP BY b.id, b.rating_score
    ), calc AS (
      SELECT
        id,
        rating_score,
        CASE WHEN (lk + dl) = 0 THEN 0.0
             ELSE ROUND((3.0 * 5 + ((lk * 5.0 + dl * 1.0) / (lk + dl)) * (lk + dl)) / (5 + (lk + dl)), 1)
        END AS expected_score
      FROM stats
    )
    SELECT id, (rating_score * 10)::integer, (expected_score * 10)::integer
    FROM calc
    WHERE rating_score IS DISTINCT FROM expected_score
  LOOP
    counter_id   := 'C3';
    entity_table := 'barbershops';
    column_name  := 'rating_score_x10';
    drift        := stored_count - real_count;
    corrected    := NOT p_dry_run;

    IF NOT p_dry_run THEN
      UPDATE public.barbershops b
      SET rating_score = (real_count::numeric / 10)
      WHERE id = entity_id;
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C3', 'barbershops', 'rating_score_x10', entity_id, stored_count, real_count, drift, true, false);
    ELSE
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C3', 'barbershops', 'rating_score_x10', entity_id, stored_count, real_count, drift, false, true);
    END IF;

    RETURN NEXT;
  END LOOP;

  -- ── C6: professionals.rating_count (armazena likes, não ratings) ──────────
  FOR entity_id, stored_count, real_count IN
    SELECT p.id,
           p.rating_count,
           COUNT(pl.id)::integer
    FROM   public.professionals p
    LEFT JOIN public.professional_likes pl
      ON pl.professional_id = p.id
     AND pl.deleted_at IS NULL
    WHERE  p.is_active = true
    GROUP BY p.id, p.rating_count
    HAVING p.rating_count IS DISTINCT FROM COUNT(pl.id)
  LOOP
    counter_id   := 'C6';
    entity_table := 'professionals';
    column_name  := 'rating_count';
    drift        := stored_count - real_count;
    corrected    := NOT p_dry_run;

    IF NOT p_dry_run THEN
      UPDATE public.professionals SET rating_count = real_count WHERE id = entity_id;
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C6', 'professionals', 'rating_count', entity_id, stored_count, real_count, drift, true, false);
    ELSE
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C6', 'professionals', 'rating_count', entity_id, stored_count, real_count, drift, false, true);
    END IF;

    RETURN NEXT;
  END LOOP;

END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_counters(boolean, numeric)
  FROM PUBLIC, anon, authenticated;

-- ─── 8. Backfill inicial ──────────────────────────────────────────────────────
-- Executado uma vez ao aplicar a migration. Idempotente: recalcula o valor
-- correto independente do estado atual. Sem batching — aceitável para
-- backfill único. Para re-execução em produção: usar scripts/rebuild-counters.js.

-- C8: portfolio_images.likes_count
UPDATE public.portfolio_images pi
SET    likes_count = (
  SELECT COUNT(*) FROM public.likes l
  WHERE  l.content_id   = pi.id
    AND  l.content_type = 'portfolio_image'
    AND  l.deleted_at IS NULL
)
WHERE  pi.status != 'deleted';

-- C10: stories.views_count
UPDATE public.stories s
SET    views_count = (
  SELECT COUNT(*) FROM public.story_views sv
  WHERE sv.story_id = s.id
    AND sv.deleted_at IS NULL
);

-- C11: stories.likes_count (coluna nova — começando do zero correto)
UPDATE public.stories s
SET    likes_count = (
  SELECT COUNT(*) FROM public.likes l
  WHERE  l.content_id   = s.id
    AND  l.content_type = 'story'
    AND  l.deleted_at IS NULL
);

-- C12: feed_items.likes_count
UPDATE public.feed_items fi
SET    likes_count = (
  SELECT COUNT(*) FROM public.likes l
  WHERE  l.content_id   = fi.source_id
    AND  l.content_type = fi.source_type
    AND  l.deleted_at IS NULL
);

-- C1/C2 backfill residual: garante consistência após janela de corrupção 2026-04-18..21
-- O trigger existente (trg_barbershop_rating, SECURITY DEFINER) já está correto.
-- Este UPDATE recalcula qualquer drift remanescente de forma segura.
UPDATE public.barbershops b
SET
  likes_count    = (
    SELECT COUNT(*) FILTER (WHERE type = 'like')
    FROM   public.barbershop_interactions bi
    WHERE  bi.barbershop_id = b.id
      AND  bi.deleted_at IS NULL
  ),
  dislikes_count = (
    SELECT COUNT(*) FILTER (WHERE type = 'dislike')
    FROM   public.barbershop_interactions bi
    WHERE  bi.barbershop_id = b.id
      AND  bi.deleted_at IS NULL
  )
WHERE b.is_active = true;

-- rating_score recalculado via UPDATE com fórmula Bayesiana inline
-- (PRIOR_N=5, PRIOR_MEAN=3.0, like=5.0, dislike=1.0)
UPDATE public.barbershops b
SET rating_score = (
  WITH s AS (
    SELECT
      COUNT(*) FILTER (WHERE type = 'like')    AS lk,
      COUNT(*) FILTER (WHERE type = 'dislike') AS dl
    FROM public.barbershop_interactions
    WHERE barbershop_id = b.id
      AND deleted_at IS NULL
  )
  SELECT CASE WHEN (s.lk + s.dl) = 0 THEN 0.0
         ELSE ROUND(
           (3.0 * 5 + ((s.lk * 5.0 + s.dl * 1.0) / (s.lk + s.dl)) * (s.lk + s.dl))
           / (5 + (s.lk + s.dl))
         , 1)
         END FROM s
)
WHERE b.is_active = true;

-- C6: professionals.rating_count
UPDATE public.professionals p
SET rating_count = (
  SELECT COUNT(*) FROM public.professional_likes pl
  WHERE pl.professional_id = p.id
    AND pl.deleted_at IS NULL
)
WHERE p.is_active = true;

COMMIT;

-- =============================================================================
-- DOWN (rollback) — executar somente em staging ou rollback de incidente
-- =============================================================================
/*
BEGIN;

DROP TRIGGER IF EXISTS trg_sync_likes_count        ON public.likes;
DROP TRIGGER IF EXISTS trg_sync_likes_count_soft_delete ON public.likes;
DROP TRIGGER IF EXISTS trg_sync_story_views_count  ON public.story_views;
DROP TRIGGER IF EXISTS trg_sync_story_views_count_delete ON public.story_views;
DROP TRIGGER IF EXISTS trg_sync_story_views_count_soft_delete ON public.story_views;
DROP TRIGGER IF EXISTS trg_barbershop_rating ON public.barbershop_interactions;
DROP TRIGGER IF EXISTS trg_barbershop_rating_soft_delete ON public.barbershop_interactions;
DROP TRIGGER IF EXISTS trg_professional_likes ON public.professional_likes;
DROP TRIGGER IF EXISTS trg_professional_likes_soft_delete ON public.professional_likes;
DROP FUNCTION IF EXISTS public.fn_sync_likes_count();
DROP FUNCTION IF EXISTS public.apply_like_counter_delta(uuid, text, integer);
DROP FUNCTION IF EXISTS public.fn_sync_story_views_count();
DROP FUNCTION IF EXISTS public.fn_sync_story_views_count_delete();
DROP FUNCTION IF EXISTS public.fn_sync_story_views_count_soft_delete();
DROP FUNCTION IF EXISTS public.fn_sync_barbershop_interaction_counts();
DROP FUNCTION IF EXISTS public.apply_barbershop_counter_delta(uuid, integer, integer);
DROP FUNCTION IF EXISTS public.fn_sync_professional_likes_count();
DROP FUNCTION IF EXISTS public.increment_haircuts_count(uuid, uuid);
DROP FUNCTION IF EXISTS public.rebuild_counter_batch(text, uuid, integer);
DROP FUNCTION IF EXISTS public.reconcile_counters(boolean, numeric);
DROP TABLE  IF EXISTS public.counter_drift_log;

-- ATENÇÃO: a coluna stories.likes_count e os valores de backfill NÃO são
-- revertidos — eles representam o estado real dos dados.
-- Para reverter a coluna: ALTER TABLE public.stories DROP COLUMN IF EXISTS likes_count;

COMMIT;
*/
