-- ================================================================
-- BARBERFLOW — Script único para aplicar todas as migrations pendentes
-- Execute este arquivo no Supabase SQL Editor:
--   https://supabase.com/dashboard/project/jfvjisqnzapxxagkbxcu/sql/new
--
-- É seguro rodar mais de uma vez (todas as operações são idempotentes).
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- 0. BARBERSHOP_INTERACTIONS — curtidas/descurtidas/favoritos em barbearias
--    (cria apenas se não existir — idempotente)
-- ────────────────────────────────────────────────────────────────

ALTER TABLE barbershops
  ADD COLUMN IF NOT EXISTS likes_count     INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dislikes_count  INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_score    NUMERIC(3,1) NOT NULL DEFAULT 0.0;

CREATE TABLE IF NOT EXISTS public.barbershop_interactions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID        NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  type          TEXT        NOT NULL CHECK (type IN ('like', 'dislike', 'favorite')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (barbershop_id, user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_bi_barbershop ON public.barbershop_interactions (barbershop_id);
CREATE INDEX IF NOT EXISTS idx_bi_user       ON public.barbershop_interactions (user_id);

ALTER TABLE public.barbershop_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bi_select_own" ON public.barbershop_interactions;
CREATE POLICY "bi_select_own"
  ON public.barbershop_interactions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "bi_insert_own" ON public.barbershop_interactions;
CREATE POLICY "bi_insert_own"
  ON public.barbershop_interactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "bi_delete_own" ON public.barbershop_interactions;
CREATE POLICY "bi_delete_own"
  ON public.barbershop_interactions FOR DELETE
  USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- 1. PROFILES_PUBLIC — expõe rating_avg e rating_count dos profissionais
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT
    p.id,
    p.full_name,
    p.phone,
    p.avatar_path,
    p.role,
    p.pro_type,
    p.is_active,
    p.created_at,
    p.updated_at,
    COALESCE(pr.rating_avg,   0.00) AS rating_avg,
    COALESCE(pr.rating_count, 0)    AS rating_count
  FROM  public.profiles     p
  LEFT JOIN public.professionals pr ON pr.id = p.id
  WHERE p.is_active = true;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- ────────────────────────────────────────────────────────────────
-- 2. FAVORITE_PROFESSIONALS — barbeiros favoritos do cliente
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.favorite_professionals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id)       ON DELETE CASCADE,
  professional_id UUID        NOT NULL REFERENCES public.professionals(id)  ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, professional_id)
);

CREATE INDEX IF NOT EXISTS idx_fav_pro_user ON public.favorite_professionals(user_id);
CREATE INDEX IF NOT EXISTS idx_fav_pro_pro  ON public.favorite_professionals(professional_id);

ALTER TABLE public.favorite_professionals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fav_pro_select_own" ON public.favorite_professionals;
CREATE POLICY "fav_pro_select_own"
  ON public.favorite_professionals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_pro_insert_own" ON public.favorite_professionals;
CREATE POLICY "fav_pro_insert_own"
  ON public.favorite_professionals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_pro_delete_own" ON public.favorite_professionals;
CREATE POLICY "fav_pro_delete_own"
  ON public.favorite_professionals FOR DELETE
  USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────
-- 3. PROFESSIONAL_LIKES — curtidas de clientes em barbeiros
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.professional_likes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID        NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (professional_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pro_likes_pro  ON public.professional_likes(professional_id);
CREATE INDEX IF NOT EXISTS idx_pro_likes_user ON public.professional_likes(user_id);

ALTER TABLE public.professional_likes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pro_likes_select_own" ON public.professional_likes;
CREATE POLICY "pro_likes_select_own"
  ON public.professional_likes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "pro_likes_insert_own" ON public.professional_likes;
CREATE POLICY "pro_likes_insert_own"
  ON public.professional_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "pro_likes_delete_own" ON public.professional_likes;
CREATE POLICY "pro_likes_delete_own"
  ON public.professional_likes FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger: mantém rating_count sincronizado em professionals
CREATE OR REPLACE FUNCTION fn_update_professional_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.professionals
       SET rating_count = rating_count + 1
     WHERE id = NEW.professional_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.professionals
       SET rating_count = GREATEST(rating_count - 1, 0)
     WHERE id = OLD.professional_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_professional_likes ON public.professional_likes;
CREATE TRIGGER trg_professional_likes
  AFTER INSERT OR DELETE ON public.professional_likes
  FOR EACH ROW EXECUTE FUNCTION fn_update_professional_likes_count();

-- ────────────────────────────────────────────────────────────────
-- 4. ENSURE PROFESSIONALS ROW — backfill + trigger automático
-- ────────────────────────────────────────────────────────────────
INSERT INTO public.professionals (id)
SELECT p.id
FROM public.profiles p
WHERE p.role = 'professional'
  AND NOT EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.id = p.id)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_profile_professional()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.role = 'professional' THEN
    INSERT INTO public.professionals (id)
    VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_professional ON public.profiles;
CREATE TRIGGER trg_profile_professional
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_professional();

-- ────────────────────────────────────────────────────────────────
-- 5. BAYESIAN RATING — fórmula Bayesiana para barbershops
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_update_barbershop_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_id       UUID;
  v_likes    INT;
  v_dislikes INT;
  v_avg      NUMERIC;
  v_score    NUMERIC(3,1);
  PRIOR_N    CONSTANT NUMERIC := 5;
  PRIOR_MEAN CONSTANT NUMERIC := 3.0;
BEGIN
  v_id := COALESCE(NEW.barbershop_id, OLD.barbershop_id);

  SELECT
    COUNT(*) FILTER (WHERE type = 'like'),
    COUNT(*) FILTER (WHERE type = 'dislike')
  INTO v_likes, v_dislikes
  FROM barbershop_interactions
  WHERE barbershop_id = v_id;

  IF (v_likes + v_dislikes) = 0 THEN
    v_score := 0.0;
  ELSE
    v_avg := (v_likes * 5.0 + v_dislikes * 1.0) / (v_likes + v_dislikes);
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

-- Recalcula scores existentes com a nova fórmula Bayesiana
UPDATE barbershops b
   SET rating_score = (
     SELECT CASE
       WHEN (lk + dl) = 0 THEN 0.0
       ELSE ROUND(
         (3.0 * 5 + ((lk * 5.0 + dl * 1.0) / (lk + dl)) * (lk + dl))
         / (5 + (lk + dl))
       , 1)
     END
     FROM (
       SELECT
         COUNT(*) FILTER (WHERE type = 'like')    AS lk,
         COUNT(*) FILTER (WHERE type = 'dislike') AS dl
       FROM barbershop_interactions
       WHERE barbershop_id = b.id
     ) stats
   );

-- ================================================================
-- FIM — todas as tabelas, triggers e views foram criadas/atualizadas
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- 6. SERVICES.IMAGE_PATH — imagem por serviço da barbearia
--    Migration: 20260428000001_services_image_path.sql
-- ────────────────────────────────────────────────────────────────

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS image_path TEXT DEFAULT NULL;

COMMENT ON COLUMN public.services.image_path IS
  'Path no bucket barbershops para a imagem do serviço (ex: <uuid>/services/<file>.webp).';

-- Políticas de storage para upload de imagens de serviços
-- (dono da barbearia faz upload em barbershops/<barbershop_id>/services/**)
DROP POLICY IF EXISTS "barbershops_services_owner_insert" ON storage.objects;
CREATE POLICY "barbershops_services_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'barbershops' AND
    (storage.foldername(name))[2] = 'services' AND
    EXISTS (
      SELECT 1 FROM public.barbershops b
      WHERE b.id::text = (storage.foldername(name))[1]
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "barbershops_services_owner_update" ON storage.objects;
CREATE POLICY "barbershops_services_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'barbershops' AND
    (storage.foldername(name))[2] = 'services' AND
    EXISTS (
      SELECT 1 FROM public.barbershops b
      WHERE b.id::text = (storage.foldername(name))[1]
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "barbershops_services_owner_delete" ON storage.objects;
CREATE POLICY "barbershops_services_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'barbershops' AND
    (storage.foldername(name))[2] = 'services' AND
    EXISTS (
      SELECT 1 FROM public.barbershops b
      WHERE b.id::text = (storage.foldername(name))[1]
        AND b.owner_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────────
-- 7. MEDIA-BARBERSHOP BUCKET — imagens de logo/cover/banner
--    Migration: 20260428130605_create_barbershop_bucket.sql
-- ────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-barbershop',
  'media-barbershop',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "media-barbershop: leitura pública"      ON storage.objects;
DROP POLICY IF EXISTS "media-barbershop: upload pelo dono"     ON storage.objects;
DROP POLICY IF EXISTS "media-barbershop: atualização pelo dono" ON storage.objects;
DROP POLICY IF EXISTS "media-barbershop: deleção pelo dono"    ON storage.objects;

CREATE POLICY "media-barbershop: leitura pública"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media-barbershop');

CREATE POLICY "media-barbershop: upload pelo dono"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'media-barbershop'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = split_part(name, '/', 2)
  );

CREATE POLICY "media-barbershop: atualização pelo dono"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'media-barbershop'
    AND auth.uid()::text = split_part(name, '/', 2)
  );

CREATE POLICY "media-barbershop: deleção pelo dono"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'media-barbershop'
    AND auth.uid()::text = split_part(name, '/', 2)
  );

-- ────────────────────────────────────────────────────────────────
-- 8. P2P_PEERS — tabela de peers WebRTC para redistribuição de mídia
--    Migration: 20260428130606_create_p2p_peers.sql
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.p2p_peers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id   TEXT        NOT NULL,
  peer_id    UUID        NOT NULL,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  region     TEXT        NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS p2p_peers_media_expires
  ON public.p2p_peers (media_id, expires_at);

CREATE INDEX IF NOT EXISTS p2p_peers_user_expires
  ON public.p2p_peers (user_id, expires_at);

ALTER TABLE public.p2p_peers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "p2p_peers: insert pelo usuário autenticado" ON public.p2p_peers;
CREATE POLICY "p2p_peers: insert pelo usuário autenticado"
  ON public.p2p_peers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "p2p_peers: select por usuários autenticados" ON public.p2p_peers;
CREATE POLICY "p2p_peers: select por usuários autenticados"
  ON public.p2p_peers FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "p2p_peers: delete pelo dono" ON public.p2p_peers;
CREATE POLICY "p2p_peers: delete pelo dono"
  ON public.p2p_peers FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "p2p_peers: update pelo dono" ON public.p2p_peers;
CREATE POLICY "p2p_peers: update pelo dono"
  ON public.p2p_peers FOR UPDATE
  USING (auth.uid() = user_id);

COMMENT ON TABLE  public.p2p_peers IS 'Peers WebRTC disponíveis para redistribuição de mídia (TTL: 5 min)';
COMMENT ON COLUMN public.p2p_peers.media_id   IS 'ID do arquivo em cache no IndexedDB do peer';
COMMENT ON COLUMN public.p2p_peers.peer_id    IS 'UUID de sessão P2P gerado pelo frontend';
COMMENT ON COLUMN public.p2p_peers.user_id    IS 'Usuário dono deste anúncio';
COMMENT ON COLUMN public.p2p_peers.region     IS 'Região geográfica (opcional) para preferência local';
COMMENT ON COLUMN public.p2p_peers.expires_at IS 'Timestamp de expiração do anúncio (5 min após announce)';

-- ================================================================
-- FIM ATUALIZADO — execute este arquivo completo no SQL Editor do Supabase:
-- https://supabase.com/dashboard/project/jfvjisqnzapxxagkbxcu/sql/new
-- ================================================================
