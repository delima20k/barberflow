-- 20260531000001_portfolio_messages_index.sql
-- Índice GIN para busca eficiente de conversas por portfolioImageId no metadata JSONB.
-- Usado por: ProfissionalRepository.listarMensagensPortfolioImagem

CREATE INDEX IF NOT EXISTS idx_chat_conversations_portfolio_image_id
  ON public.chat_conversations USING gin (metadata jsonb_path_ops)
  WHERE metadata ? 'portfolioImageId';

COMMENT ON INDEX idx_chat_conversations_portfolio_image_id
  IS 'Busca rápida de conversas originadas de uma imagem de portfólio via metadata->portfolioImageId';
