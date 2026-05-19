-- =============================================================
-- 20260421000002_ensure_professionals_row.sql
-- Garante que todo profile com role='professional' tenha linha
-- correspondente em public.professionals (requisito para FKs em
-- favorite_professionals, professional_likes, etc.).
--
-- 1. Popula linhas faltantes
-- 2. Trigger auto-cria linha em professionals quando profile vira
--    role='professional' (insert ou update).
-- =============================================================

-- ── 1. Backfill: cria linhas faltantes ───────────────────────
INSERT INTO public.professionals (id)
SELECT p.id
FROM public.profiles p
WHERE p.role = 'professional'
  AND NOT EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.id = p.id)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Trigger: cria linha automaticamente ───────────────────
CREATE OR REPLACE FUNCTION public.handle_profile_professional()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
