-- ══════════════════════════════════════════════════════════════════
-- Migration: 20260707000001_stories_portfolio_likes_realtime
-- Objetivo : Publicar as tabelas stories e portfolio_images no Realtime
--            do Supabase para que o DONO (barbeiro) veja a contagem de
--            curtidas subir EM TEMPO REAL enquanto olha o próprio story
--            (vídeo) ou foto de portfólio.
--
--            Bug: quando um cliente curte um story/foto do barbeiro, o
--            barbeiro que está olhando o próprio conteúdo não vê o número
--            +1 ao vivo — só aparece quando ele mesmo interage. Isso porque
--            nem stories nem portfolio_images estavam na publicação
--            `supabase_realtime`, então o Postgres não emite nada.
--
--            Como funciona a atualização:
--            - Triggers atômicos (20260524000001) já mantêm
--              stories.likes_count / portfolio_images.likes_count a cada
--              INSERT/DELETE na tabela `likes`. Portanto cada curtida gera
--              um UPDATE nessas tabelas.
--            - O front (PortfolioMessageRealtimeService.iniciarLikes) assina
--              UPDATE filtrado por owner_id=eq.<proId> e atualiza o contador.
--
--            RLS já permite leitura pública (stories: expires_at > now();
--            portfolio_images: status='active'), então o dono recebe o
--            evento das próprias linhas — basta publicar.
--
--            REPLICA IDENTITY FULL: garante que o UPDATE entregue owner_id
--            (coluna do filtro do canal) de forma confiável.
--
-- Rollback:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.stories;
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.portfolio_images;
--   ALTER TABLE public.stories          REPLICA IDENTITY DEFAULT;
--   ALTER TABLE public.portfolio_images REPLICA IDENTITY DEFAULT;
-- ══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'stories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_publication_tables
     WHERE pubname    = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename  = 'portfolio_images'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.portfolio_images;
  END IF;
END $$;

ALTER TABLE public.stories          REPLICA IDENTITY FULL;
ALTER TABLE public.portfolio_images REPLICA IDENTITY FULL;
