-- =============================================================
-- 20260420000004_professional_likes.sql
-- Curtidas de clientes em barbeiros profissionais.
-- Contador desnormalizado em professionals.rating_count para
-- leitura barata. Trigger mantém o contador sincronizado.
-- =============================================================

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

CREATE POLICY "pro_likes_select_own"
  ON public.professional_likes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "pro_likes_insert_own"
  ON public.professional_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "pro_likes_delete_own"
  ON public.professional_likes FOR DELETE
  USING (auth.uid() = user_id);

-- Leitura pública do contador na tabela professionals (já é pública via RLS)

-- ── Trigger: mantém rating_count sincronizado ────────────────
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
