-- =============================================================
-- 20260420000003_favorite_professionals.sql
-- Tabela de barbeiros favoritos do cliente.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.favorite_professionals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  professional_id UUID        NOT NULL REFERENCES public.professionals(id)  ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, professional_id)
);

CREATE INDEX IF NOT EXISTS idx_fav_pro_user ON public.favorite_professionals(user_id);

ALTER TABLE public.favorite_professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fav_pro_select_own"
  ON public.favorite_professionals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "fav_pro_insert_own"
  ON public.favorite_professionals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fav_pro_delete_own"
  ON public.favorite_professionals FOR DELETE
  USING (auth.uid() = user_id);
