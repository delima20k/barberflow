-- 20260531000004_reset_portfolio_likes.sql
-- Zera todas as curtidas de portfolio_images para começar do zero.
-- Garante unicidade (1 curtida por usuário por imagem).

-- 1. Remove todos os likes de portfolio_image existentes
DELETE FROM public.likes WHERE content_type = 'portfolio_image';

-- 2. Zera o contador desnormalizado em portfolio_images
UPDATE public.portfolio_images SET likes_count = 0;

-- 3. Garante unicidade: 1 curtida por (user_id, content_id, content_type)
-- (ON CONFLICT DO NOTHING já está em uso, mas cria o índice caso não exista)
CREATE UNIQUE INDEX IF NOT EXISTS idx_likes_unique_user_content
  ON public.likes(user_id, content_id, content_type);

COMMENT ON INDEX idx_likes_unique_user_content
  IS 'Garante que cada usuário só pode curtir uma vez por conteúdo';
