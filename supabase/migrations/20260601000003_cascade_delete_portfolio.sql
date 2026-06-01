-- 20260601000003_cascade_delete_portfolio.sql
-- Ao deletar uma portfolio_image, remove automaticamente:
--   likes, portfolio_messages relacionados.

-- 1. Likes: a tabela 'likes' usa content_id (sem FK), então usa trigger
CREATE OR REPLACE FUNCTION public.limpar_dados_portfolio_image()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Remove curtidas da imagem
  DELETE FROM public.likes
  WHERE content_id = OLD.id AND content_type = 'portfolio_image';

  -- Remove mensagens de portfólio da imagem
  DELETE FROM public.portfolio_messages
  WHERE portfolio_image_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_limpar_dados_portfolio_image ON public.portfolio_images;
CREATE TRIGGER trg_limpar_dados_portfolio_image
  BEFORE DELETE ON public.portfolio_images
  FOR EACH ROW EXECUTE FUNCTION public.limpar_dados_portfolio_image();

COMMENT ON TRIGGER trg_limpar_dados_portfolio_image ON public.portfolio_images
  IS 'Remove likes e portfolio_messages antes de deletar a imagem';
