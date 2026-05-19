-- =============================================================
-- 20260422000001_owner_pro_link.sql
-- Objetivo: Dono de barbearia (pro_type='barbearia') aparece
--           tambem em Barbeiros Populares com vinculo automatico
--           a propria barbearia em professional_shop_links.
-- 1. Atualiza handle_profile_barbearia para criar o vinculo
-- 2. Backfill de donos existentes sem vinculo
-- =============================================================

-- 1. Atualiza trigger: cria professionals + barbershop + link
CREATE OR REPLACE FUNCTION public.handle_profile_barbearia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name    TEXT;
  v_shop_id UUID;
BEGIN
  IF NEW.pro_type = 'barbearia' THEN
    SELECT COALESCE(
      (SELECT raw_user_meta_data->>'barbearia_name'
       FROM auth.users WHERE id = NEW.id),
      NEW.full_name,
      'Minha Barbearia'
    ) INTO v_name;

    -- Garante linha em professionals
    INSERT INTO public.professionals (id)
    VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;

    -- Cria barbearia se ainda nao existe
    IF NOT EXISTS (SELECT 1 FROM public.barbershops WHERE owner_id = NEW.id) THEN
      INSERT INTO public.barbershops (owner_id, name, is_active, is_open)
      VALUES (NEW.id, v_name, true, false)
      RETURNING id INTO v_shop_id;
    ELSE
      SELECT id INTO v_shop_id
      FROM public.barbershops
      WHERE owner_id = NEW.id
      LIMIT 1;
    END IF;

    -- Vincula profissional a propria barbearia
    IF v_shop_id IS NOT NULL THEN
      INSERT INTO public.professional_shop_links (professional_id, barbershop_id, is_active)
      VALUES (NEW.id, v_shop_id, true)
      ON CONFLICT (professional_id, barbershop_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_barbearia ON public.profiles;
CREATE TRIGGER on_profile_barbearia
  AFTER INSERT OR UPDATE OF pro_type ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_barbearia();

-- 2. Backfill: cria linha em professionals para donos existentes
INSERT INTO public.professionals (id)
SELECT p.id
FROM public.profiles p
WHERE p.role = 'professional'
  AND p.pro_type = 'barbearia'
  AND NOT EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.id = p.id)
ON CONFLICT (id) DO NOTHING;

-- 3. Backfill: vincula donos existentes a propria barbearia
INSERT INTO public.professional_shop_links (professional_id, barbershop_id, is_active)
SELECT b.owner_id, b.id, true
FROM public.barbershops b
JOIN public.profiles p ON p.id = b.owner_id
WHERE p.pro_type = 'barbearia'
  AND NOT EXISTS (
    SELECT 1 FROM public.professional_shop_links psl
    WHERE psl.professional_id = b.owner_id
      AND psl.barbershop_id   = b.id
  )
ON CONFLICT (professional_id, barbershop_id) DO NOTHING;
