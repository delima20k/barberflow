-- =============================================================
-- 20260517000003_unify_portfolio_likes.sql
-- Elimina a tabela redundante portfolio_likes, migrando seus dados
-- para a tabela unificada likes (que já possui content_type).
--
-- CONTEXTO:
--   A tabela portfolio_likes armazena curtidas em portfolio_images.
--   A tabela likes já tem content_type IN ('portfolio_image','story').
--   Nenhum código (src/, shared/js/, bff) referencia portfolio_likes —
--   a tabela é um dead schema nunca usado pela aplicação.
--
-- SEGURANÇA:
--   A migração é idempotente (ON CONFLICT DO NOTHING).
--   Apenas remove dados/tabela depois de confirmar migração.
--   Diagnóstico: execute SELECTs abaixo antes de aplicar em produção.
-- =============================================================

-- ── Diagnóstico (rodar antes em produção) ────────────────────────────────────
-- SELECT COUNT(*) FROM portfolio_likes;
-- SELECT COUNT(*) FROM likes WHERE content_type = 'portfolio_image';

-- ── 1. Migrar dados de portfolio_likes → likes ────────────────────────────────
INSERT INTO public.likes (user_id, content_id, content_type, created_at)
SELECT
  pl.user_id,
  pl.portfolio_image_id AS content_id,
  'portfolio_image'     AS content_type,
  pl.created_at
FROM public.portfolio_likes pl
ON CONFLICT (user_id, content_id, content_type) DO NOTHING;

-- ── 2. Validar: contagem deve bater (ou likes ter ≥ portfolio_likes após migração)
-- SELECT
--   (SELECT COUNT(*) FROM portfolio_likes)  AS portfolio_likes_total,
--   (SELECT COUNT(*) FROM likes WHERE content_type = 'portfolio_image') AS likes_portfolio_total;

-- ── 3. Remover tabela redundante ──────────────────────────────────────────────
DROP TABLE IF EXISTS public.portfolio_likes;
