-- 20260601000001_reset_curtidas_zero.sql
-- Zera todas as curtidas de imagens de portfólio e garante 1 curtida por usuário.

-- 1. Remove TODOS os likes de portfolio_image (começa do zero)
DELETE FROM public.likes WHERE content_type = 'portfolio_image';

-- 2. Zera o contador em portfolio_images
UPDATE public.portfolio_images SET likes_count = 0;

-- 3. Garante índice único: 1 curtida por (usuario, imagem, tipo)
CREATE UNIQUE INDEX IF NOT EXISTS idx_likes_unique_user_content
  ON public.likes(user_id, content_id, content_type);

-- 4. Constraint de verificação: impede o mesmo usuário curtir duas vezes
--    (proteção adicional além do índice)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'likes_unique_per_user_content'
  ) THEN
    ALTER TABLE public.likes
      ADD CONSTRAINT likes_unique_per_user_content
      UNIQUE (user_id, content_id, content_type);
  END IF;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;
