-- =============================================================
-- 20260421000005_public_interaction_counts.sql
-- Permite leitura pública dos contadores de interações.
-- Sem esta policy, usuários anônimos recebem 0 curtidas em todos
-- os cards mesmo que existam registros em barbershop_interactions
-- e professional_likes.
-- =============================================================

-- ── barbershop_interactions: leitura pública ─────────────────
-- Contagem de likes/dislikes de barbearias é informação pública
-- (igual ao número de estrelas no Google Maps / iFood).
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
-- Idem — número de curtidas de barbeiros é informação pública.
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

-- ── Backfill: recalcula barbershops.likes_count / dislikes_count ─
-- Garante que os contadores estejam corretos após aplicar esta migration
-- (o trigger mantém os contadores atualizados daqui em diante).
UPDATE public.barbershops b
SET
  likes_count    = COALESCE((
    SELECT COUNT(*) FROM public.barbershop_interactions
    WHERE barbershop_id = b.id AND type = 'like'
  ), 0),
  dislikes_count = COALESCE((
    SELECT COUNT(*) FROM public.barbershop_interactions
    WHERE barbershop_id = b.id AND type = 'dislike'
  ), 0)
WHERE EXISTS (
  SELECT 1 FROM public.barbershop_interactions WHERE barbershop_id = b.id
);

-- ── Backfill: recalcula professionals.rating_count ───────────
UPDATE public.professionals p
SET rating_count = COALESCE((
  SELECT COUNT(*) FROM public.professional_likes
  WHERE professional_id = p.id
), 0)
WHERE EXISTS (
  SELECT 1 FROM public.professional_likes WHERE professional_id = p.id
);

-- ── Atualiza rating_score das barbearias após backfill ────────
UPDATE public.barbershops
SET rating_score = ROUND(
  CASE
    WHEN likes_count + dislikes_count = 0 THEN 0.0
    ELSE (
      3.0 * 5 +
      ((likes_count * 5.0 + dislikes_count * 1.0) / (likes_count + dislikes_count))
      * (likes_count + dislikes_count)
    ) / (5.0 + likes_count + dislikes_count)
  END
::numeric, 1)
WHERE likes_count + dislikes_count > 0;
