-- =============================================================
-- 20260521000001_geo_bounded_context.sql
--
-- Bounded context de geolocalização — BFF BarberFlow.
--
-- Mudanças:
--   1. profiles: coluna geom GEOMETRY(Point, 4326) + GiST + trigger
--   2. Nova tabela geofences (círculo: center + radius_m)
--   3. GiST index em geofences.center
--   4. RPC update_user_geo(userId, lat, lng)
--      → atualiza profiles.last_lat/lng/location_at/geom
--      → retorna posição anterior (para anti-spoof no app)
--   5. RPC get_active_geofences_near_user(p_user_id, p_raio_metros)
--      → retorna geofences ativas dentro de p_raio_metros do usuário
-- =============================================================

-- ── 1. Adicionar coluna geom à tabela profiles ──────────────────
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS geom GEOMETRY(Point, 4326);

-- Popular geom com dados existentes
UPDATE profiles
SET geom = ST_SetSRID(ST_MakePoint(last_lng, last_lat), 4326)
WHERE last_lat IS NOT NULL
  AND last_lng IS NOT NULL
  AND geom IS NULL;

-- Índice GiST para queries espaciais em profiles (O(log n))
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_geom
  ON profiles USING GIST (geom);

-- Trigger para manter profiles.geom sincronizado com last_lat/last_lng
CREATE OR REPLACE FUNCTION sync_profile_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_lat IS NOT NULL AND NEW.last_lng IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.last_lng, NEW.last_lat), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_profile_geom ON profiles;
CREATE TRIGGER trg_sync_profile_geom
  BEFORE INSERT OR UPDATE OF last_lat, last_lng ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_profile_geom();

-- ── 2. Tabela geofences ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.geofences (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  owner_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  center      GEOMETRY(Point, 4326) NOT NULL,
  radius_m    DOUBLE PRECISION NOT NULL CHECK (radius_m > 0 AND radius_m <= 100000),
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 3. GiST index em geofences.center ──────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_geofences_center
  ON geofences USING GIST (center);

-- Índice auxiliar para queries por owner + is_active
CREATE INDEX IF NOT EXISTS idx_geofences_owner_active
  ON geofences (owner_id, is_active);

-- RLS básico para geofences
ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "geofences_owner_all"    ON public.geofences;
DROP POLICY IF EXISTS "geofences_active_read"  ON public.geofences;

CREATE POLICY "geofences_owner_all" ON public.geofences
  FOR ALL
  USING (owner_id = auth.uid());

CREATE POLICY "geofences_active_read" ON public.geofences
  FOR SELECT
  USING (is_active = TRUE);

-- ── 4. RPC update_user_geo ──────────────────────────────────────
-- Atualiza localização do usuário e retorna posição anterior.
-- Usado pelo UpdateUserLocationUseCase para anti-spoof (comparar
-- last_lat/lng e last_location_at antes da atualização).
CREATE OR REPLACE FUNCTION public.update_user_geo(
  p_user_id  UUID,
  p_lat      DOUBLE PRECISION,
  p_lng      DOUBLE PRECISION
)
RETURNS TABLE (
  prev_lat         DOUBLE PRECISION,
  prev_lng         DOUBLE PRECISION,
  prev_location_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_lat         DOUBLE PRECISION;
  v_prev_lng         DOUBLE PRECISION;
  v_prev_location_at TIMESTAMPTZ;
BEGIN
  -- Captura posição anterior ANTES de atualizar
  SELECT p.last_lat, p.last_lng, p.last_location_at
    INTO v_prev_lat, v_prev_lng, v_prev_location_at
  FROM profiles p
  WHERE p.id = p_user_id;

  -- Atualiza posição (trigger sync_profile_geom atualiza geom automaticamente)
  UPDATE profiles
  SET
    last_lat         = p_lat,
    last_lng         = p_lng,
    last_location_at = NOW()
  WHERE id = p_user_id;

  RETURN QUERY SELECT v_prev_lat, v_prev_lng, v_prev_location_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_user_geo(UUID, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_user_geo(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.update_user_geo(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO service_role;

-- ── 5. RPC get_active_geofences_near_user ──────────────────────
-- Retorna geofences ativas cuja borda está dentro de p_raio_metros
-- da posição atual do usuário (ST_DWithin com índice GiST).
CREATE OR REPLACE FUNCTION public.get_active_geofences_near_user(
  p_user_id     UUID,
  p_raio_metros DOUBLE PRECISION DEFAULT 5000
)
RETURNS TABLE (
  id         UUID,
  name       TEXT,
  owner_id   UUID,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_m   DOUBLE PRECISION,
  is_active  BOOLEAN
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.id, g.name, g.owner_id,
    ST_Y(g.center::geometry) AS center_lat,
    ST_X(g.center::geometry) AS center_lng,
    g.radius_m, g.is_active
  FROM geofences g
  JOIN profiles p ON p.id = p_user_id
  WHERE
    g.is_active = TRUE
    AND p.geom IS NOT NULL
    AND ST_DWithin(
      g.center::geography,
      p.geom::geography,
      p_raio_metros + g.radius_m  -- considera raio da própria geofence
    )
  ORDER BY ST_Distance(g.center::geography, p.geom::geography) ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_geofences_near_user(UUID, DOUBLE PRECISION) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_active_geofences_near_user(UUID, DOUBLE PRECISION) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_active_geofences_near_user(UUID, DOUBLE PRECISION) TO service_role;
