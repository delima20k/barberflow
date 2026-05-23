-- =============================================================================
-- Migration: 20260524000001_rebuild_counters_with_atomic_triggers.sql
--
-- Consolida o rebuild completo de contadores desnormalizados com:
--   • Triggers atômicos (+1/-1) em vez de SELECT COUNT(*) por evento
--   • Tabela counter_drift_log para rastreio de reconciliação
--   • Coluna stories.likes_count (C11 — referenciada em SocialRepository.js)
--   • fn_sync_likes_count: C8 (portfolio), C11 (stories), C12 (feed_items)
--   • fn_sync_story_views_count: C10 (stories.views_count)
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
  v_delta integer := CASE TG_OP WHEN 'DELETE' THEN -1 ELSE 1 END;
  v_id    uuid    := CASE TG_OP WHEN 'DELETE' THEN OLD.content_id   ELSE NEW.content_id   END;
  v_type  text    := CASE TG_OP WHEN 'DELETE' THEN OLD.content_type ELSE NEW.content_type END;
BEGIN
  -- Atualiza o contador na tabela dona do conteúdo
  CASE v_type
    WHEN 'portfolio_image' THEN
      UPDATE public.portfolio_images
      SET    likes_count = GREATEST(0, likes_count + v_delta)
      WHERE  id = v_id
        AND  status != 'deleted'; -- ignora imagens soft-deleted
    WHEN 'story' THEN
      UPDATE public.stories
      SET    likes_count = GREATEST(0, likes_count + v_delta)
      WHERE  id = v_id;
    ELSE NULL; -- outros tipos: apenas feed_items abaixo
  END CASE;

  -- feed_items espelha likes de qualquer content_type (source_id/source_type)
  UPDATE public.feed_items
  SET    likes_count = GREATEST(0, likes_count + v_delta)
  WHERE  source_id   = v_id
    AND  source_type = v_type;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_likes_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_likes_count ON public.likes;
CREATE TRIGGER trg_sync_likes_count
  AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_likes_count();

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
          SELECT COUNT(*) FROM public.story_views sv WHERE sv.story_id = s.id
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
        )
        FROM   batch WHERE fi.id = batch.id
        RETURNING fi.id
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
    LEFT JOIN public.story_views sv ON sv.story_id = s.id
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
           COUNT(bi.id) FILTER (WHERE bi.type = 'like')::integer
    FROM   public.barbershops b
    LEFT JOIN public.barbershop_interactions bi ON bi.barbershop_id = b.id
    WHERE  b.is_active = true
    GROUP BY b.id, b.likes_count
    HAVING b.likes_count IS DISTINCT FROM COUNT(bi.id) FILTER (WHERE bi.type = 'like')
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

  -- ── C6: professionals.rating_count (armazena likes, não ratings) ──────────
  FOR entity_id, stored_count, real_count IN
    SELECT p.id,
           p.rating_count,
           COUNT(pl.id)::integer
    FROM   public.professionals p
    LEFT JOIN public.professional_likes pl ON pl.professional_id = p.id
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
)
WHERE  pi.status != 'deleted';

-- C10: stories.views_count
UPDATE public.stories s
SET    views_count = (
  SELECT COUNT(*) FROM public.story_views sv WHERE sv.story_id = s.id
);

-- C11: stories.likes_count (coluna nova — começando do zero correto)
UPDATE public.stories s
SET    likes_count = (
  SELECT COUNT(*) FROM public.likes l
  WHERE  l.content_id   = s.id
    AND  l.content_type = 'story'
);

-- C12: feed_items.likes_count
UPDATE public.feed_items fi
SET    likes_count = (
  SELECT COUNT(*) FROM public.likes l
  WHERE  l.content_id   = fi.source_id
    AND  l.content_type = fi.source_type
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
  ),
  dislikes_count = (
    SELECT COUNT(*) FILTER (WHERE type = 'dislike')
    FROM   public.barbershop_interactions bi
    WHERE  bi.barbershop_id = b.id
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
  )
  SELECT CASE WHEN (s.lk + s.dl) = 0 THEN 0.0
         ELSE ROUND(
           (3.0 * 5 + ((s.lk * 5.0 + s.dl * 1.0) / (s.lk + s.dl)) * (s.lk + s.dl))
           / (5 + (s.lk + s.dl))
         , 1)
         END FROM s
)
WHERE b.is_active = true;

COMMIT;

-- =============================================================================
-- DOWN (rollback) — executar somente em staging ou rollback de incidente
-- =============================================================================
/*
BEGIN;

DROP TRIGGER IF EXISTS trg_sync_likes_count        ON public.likes;
DROP TRIGGER IF EXISTS trg_sync_story_views_count  ON public.story_views;
DROP FUNCTION IF EXISTS public.fn_sync_likes_count();
DROP FUNCTION IF EXISTS public.fn_sync_story_views_count();
DROP FUNCTION IF EXISTS public.increment_haircuts_count(uuid, uuid);
DROP FUNCTION IF EXISTS public.rebuild_counter_batch(text, uuid, integer);
DROP FUNCTION IF EXISTS public.reconcile_counters(boolean, numeric);
DROP TABLE  IF EXISTS public.counter_drift_log;

-- ATENÇÃO: a coluna stories.likes_count e os valores de backfill NÃO são
-- revertidos — eles representam o estado real dos dados.
-- Para reverter a coluna: ALTER TABLE public.stories DROP COLUMN IF EXISTS likes_count;

COMMIT;
*/
