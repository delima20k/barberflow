-- 20260601000002_zerar_curtidas_agora.sql
-- Zera TODAS as curtidas de portfolio_image para começar do zero.

-- Remove todos os likes de imagens de portfólio
DELETE FROM public.likes WHERE content_type = 'portfolio_image';

-- Zera o contador em todas as imagens de portfólio
UPDATE public.portfolio_images SET likes_count = 0;
