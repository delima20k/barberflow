-- =============================================================
-- Migration: 20260428130606_create_p2p_peers.sql
--
-- Tabela de peers P2P WebRTC para troca de sinalização.
-- Cada registro representa um peer que tem um mediaId em cache
-- e está disponível para redistribuição via DataChannel.
--
-- TTL: 5 minutos (backend deleta expirados via expires_at < NOW())
-- RLS: qualquer autenticado anuncia/consulta/deleta os próprios peers
-- =============================================================

CREATE TABLE IF NOT EXISTS public.p2p_peers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id   TEXT        NOT NULL,                -- ID do arquivo que o peer possui em cache
  peer_id    UUID        NOT NULL,                -- UUID gerado pelo frontend para esta sessão P2P
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  region     TEXT        NOT NULL DEFAULT '',     -- ex: 'BR-SP' (opcional, para seleção geográfica)
  expires_at TIMESTAMPTZ NOT NULL,                -- NOW() + 5 minutos
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Índices ───────────────────────────────────────────────────
-- Consulta principal: buscar peers de um mediaId ainda válidos
CREATE INDEX IF NOT EXISTS p2p_peers_media_expires
  ON public.p2p_peers (media_id, expires_at);

-- Limpeza de peers expirados por user
CREATE INDEX IF NOT EXISTS p2p_peers_user_expires
  ON public.p2p_peers (user_id, expires_at);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE public.p2p_peers ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado pode anunciar como peer
CREATE POLICY "p2p_peers: insert pelo usuário autenticado"
  ON public.p2p_peers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Usuários autenticados consultam peers ativos (excl. expirados via WHERE no app)
CREATE POLICY "p2p_peers: select por usuários autenticados"
  ON public.p2p_peers FOR SELECT
  USING (auth.role() = 'authenticated');

-- Dono pode deletar / cancelar anúncio
CREATE POLICY "p2p_peers: delete pelo dono"
  ON public.p2p_peers FOR DELETE
  USING (auth.uid() = user_id);

-- Dono pode renovar (UPDATE expires_at)
CREATE POLICY "p2p_peers: update pelo dono"
  ON public.p2p_peers FOR UPDATE
  USING (auth.uid() = user_id);

-- ── Comentários ───────────────────────────────────────────────
COMMENT ON TABLE  public.p2p_peers IS 'Peers WebRTC disponíveis para redistribuição de mídia (TTL: 5 min)';
COMMENT ON COLUMN public.p2p_peers.media_id   IS 'ID do arquivo em cache no IndexedDB do peer';
COMMENT ON COLUMN public.p2p_peers.peer_id    IS 'UUID de sessão P2P gerado pelo frontend';
COMMENT ON COLUMN public.p2p_peers.user_id    IS 'Usuário dono deste anúncio';
COMMENT ON COLUMN public.p2p_peers.region     IS 'Região geográfica (opcional) para preferência local';
COMMENT ON COLUMN public.p2p_peers.expires_at IS 'Timestamp de expiração do anúncio (5 min após announce)';
