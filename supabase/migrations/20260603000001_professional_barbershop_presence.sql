-- Migration: 20260603000001_professional_barbershop_presence
-- Objetivo: status operacional ON/OFF do barbeiro parceiro por barbearia.

CREATE TABLE IF NOT EXISTS public.professional_barbershop_presence (
  barbershop_id   uuid NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  is_available    boolean NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (barbershop_id, professional_id)
);

COMMENT ON TABLE public.professional_barbershop_presence IS
  'Disponibilidade operacional do barbeiro parceiro na barbearia. Nao confundir com vinculo ativo.';

CREATE INDEX IF NOT EXISTS idx_pbp_barbershop_available
  ON public.professional_barbershop_presence (barbershop_id, is_available);

DROP TRIGGER IF EXISTS trg_professional_barbershop_presence_updated_at
  ON public.professional_barbershop_presence;
CREATE TRIGGER trg_professional_barbershop_presence_updated_at
  BEFORE UPDATE ON public.professional_barbershop_presence
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.professional_barbershop_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pbp_select_public" ON public.professional_barbershop_presence;
CREATE POLICY "pbp_select_public"
  ON public.professional_barbershop_presence
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "pbp_insert_linked_professional" ON public.professional_barbershop_presence;
CREATE POLICY "pbp_insert_linked_professional"
  ON public.professional_barbershop_presence
  FOR INSERT
  WITH CHECK (
    auth.uid() = professional_id
    AND updated_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.professional_shop_links psl
      WHERE psl.barbershop_id = professional_barbershop_presence.barbershop_id
        AND psl.professional_id = auth.uid()
        AND psl.is_active = true
    )
  );

DROP POLICY IF EXISTS "pbp_update_linked_professional" ON public.professional_barbershop_presence;
CREATE POLICY "pbp_update_linked_professional"
  ON public.professional_barbershop_presence
  FOR UPDATE
  USING (
    auth.uid() = professional_id
    AND EXISTS (
      SELECT 1
      FROM public.professional_shop_links psl
      WHERE psl.barbershop_id = professional_barbershop_presence.barbershop_id
        AND psl.professional_id = auth.uid()
        AND psl.is_active = true
    )
  )
  WITH CHECK (
    auth.uid() = professional_id
    AND updated_by = auth.uid()
  );

-- rollback:
-- DROP TABLE IF EXISTS public.professional_barbershop_presence;
