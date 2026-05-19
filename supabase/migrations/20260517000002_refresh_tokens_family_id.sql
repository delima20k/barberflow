-- =============================================================
-- 20260517000002_refresh_tokens_family_id.sql
-- Adiciona family_id à tabela refresh_tokens para implementar
-- token rotation com family invalidation (cascade revocation).
--
-- MECANISMO:
--   Login → cria token com novo family_id (UUID aleatório).
--   Refresh → cria novo token com o mesmo family_id do anterior,
--              revoga o token anterior.
--   Token revogado reutilizado → compromisso detectado:
--              TODA a família é revogada (todos os dispositivos).
--
-- Sessões existentes: cada token antigo recebe seu próprio family_id
-- (geração individual) — sem impacto em sessões ativas.
-- =============================================================

-- ── 1. Adicionar coluna (nullable primeiro, para backfill) ────────────────────
ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS family_id UUID;

-- ── 2. Backfill: cada token existente recebe seu próprio family ───────────────
UPDATE refresh_tokens
SET family_id = gen_random_uuid()
WHERE family_id IS NULL;

-- ── 3. Tornar NOT NULL + setar DEFAULT para novos tokens ─────────────────────
ALTER TABLE refresh_tokens
  ALTER COLUMN family_id SET NOT NULL,
  ALTER COLUMN family_id SET DEFAULT gen_random_uuid();

-- ── 4. Índice para lookup de família (cascade revocation) ─────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refresh_tokens_family_id
  ON refresh_tokens (family_id);
