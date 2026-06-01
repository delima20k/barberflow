-- =============================================================
-- 20260517000001_postgis_barbershops.sql
-- Migra queries geográficas de Euclidiana → PostGIS ST_DWithin.
--
-- Mudanças:
--   1. Adiciona coluna geom GEOMETRY(Point, 4326) em barbershops
--   2. Popula geom com dados existentes de latitude/longitude
--   3. Cria índice GIST CONCURRENTLY (não bloqueia leituras)
--   4. Cria trigger para manter geom sincronizado com lat/lng
--   5. Cria função RPC get_barbershops_nearby() para uso pelo BFF
-- =============================================================

-- ── 1. Habilitar PostGIS (idempotente) ───────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS postgis;

-- ── 2. Adicionar coluna de geometria ─────────────────────────────────────────
ALTER TABLE barbershops
  ADD COLUMN IF NOT EXISTS geom GEOMETRY(Point, 4326);

-- ── 3. Popular geom com dados existentes ─────────────────────────────────────
UPDATE barbershops
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND geom IS NULL;

-- ── 4. Criar índice espacial GIST ─────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_barbershops_geom
  ON barbershops USING GIST (geom);

-- ── 5. Trigger para manter geom sincronizado ──────────────────────────────────
CREATE OR REPLACE FUNCTION sync_barbershop_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_barbershop_geom ON barbershops;
CREATE TRIGGER trg_sync_barbershop_geom
  BEFORE INSERT OR UPDATE OF latitude, longitude ON barbershops
  FOR EACH ROW EXECUTE FUNCTION sync_barbershop_geom();

-- ── 6. Função RPC para busca por proximidade ──────────────────────────────────
-- Recebe lat/lng em graus decimais e raio em metros.
-- Retorna barbearias dentro do raio ordenadas por distância.
CREATE OR REPLACE FUNCTION get_barbershops_nearby(
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  raio_metros DOUBLE PRECISION,
  limit_val  INT DEFAULT 50
)
RETURNS TABLE (
  id            UUID,
  name          TEXT,
  address       TEXT,
  city          TEXT,
  latitude      DOUBLE PRECISION,
  longitude     DOUBLE PRECISION,
  logo_path     TEXT,
  cover_path    TEXT,
  is_open       BOOLEAN,
  close_reason  TEXT,
  rating_avg    NUMERIC,
  rating_count  INT,
  rating_score  NUMERIC,
  likes_count   INT,
  dislikes_count INT,
  font_key      TEXT,
  distancia_m   DOUBLE PRECISION
)
LANGUAGE sql STABLE
AS $$
  SELECT
    b.id, b.name, b.address, b.city,
    b.latitude, b.longitude,
    b.logo_path, b.cover_path,
    b.is_open, b.close_reason,
    b.rating_avg, b.rating_count, b.rating_score,
    b.likes_count, b.dislikes_count, b.font_key,
    ST_Distance(
      b.geom::geography,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    ) AS distancia_m
  FROM barbershops b
  WHERE
    b.is_active = TRUE
    AND b.geom IS NOT NULL
    AND ST_DWithin(
      b.geom::geography,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
      raio_metros
    )
  ORDER BY distancia_m ASC
  LIMIT limit_val;
$$;
