-- Migration: 20260605000004_professional_weekly_settlements
-- Objetivo: registrar acertos semanais confirmados pelo barbeiro parceiro.
-- rollback: DROP TABLE IF EXISTS public.professional_weekly_settlements;

CREATE TABLE IF NOT EXISTS public.professional_weekly_settlements (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbershop_id   uuid NOT NULL REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  period_start    timestamptz NOT NULL,
  period_end      timestamptz NOT NULL,
  gross_amount    numeric(12,2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  shop_amount     numeric(12,2) NOT NULL DEFAULT 0 CHECK (shop_amount >= 0),
  barber_amount   numeric(12,2) NOT NULL DEFAULT 0 CHECK (barber_amount >= 0),
  fees_amount     numeric(12,2) NOT NULL DEFAULT 0 CHECK (fees_amount >= 0),
  net_amount      numeric(12,2) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
  status          text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid')),
  confirmed_at    timestamptz NOT NULL,
  confirmed_by    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professional_weekly_settlements_period_check CHECK (period_start <= period_end),
  CONSTRAINT professional_weekly_settlements_confirmed_by_check CHECK (confirmed_by = professional_id),
  CONSTRAINT professional_weekly_settlements_unique_week UNIQUE (
    barbershop_id,
    professional_id,
    period_start,
    period_end
  )
);

CREATE INDEX IF NOT EXISTS idx_prof_weekly_settlements_shop_prof_period
  ON public.professional_weekly_settlements (barbershop_id, professional_id, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_prof_weekly_settlements_status_confirmed
  ON public.professional_weekly_settlements (status, confirmed_at DESC);

DROP TRIGGER IF EXISTS trg_professional_weekly_settlements_updated_at
  ON public.professional_weekly_settlements;
CREATE TRIGGER trg_professional_weekly_settlements_updated_at
  BEFORE UPDATE ON public.professional_weekly_settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.professional_weekly_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "professional_weekly_settlements_select_owner_or_self"
  ON public.professional_weekly_settlements;
CREATE POLICY "professional_weekly_settlements_select_owner_or_self"
  ON public.professional_weekly_settlements
  FOR SELECT
  USING (
    professional_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = professional_weekly_settlements.barbershop_id
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "professional_weekly_settlements_insert_self"
  ON public.professional_weekly_settlements;
CREATE POLICY "professional_weekly_settlements_insert_self"
  ON public.professional_weekly_settlements
  FOR INSERT
  WITH CHECK (
    professional_id = auth.uid()
    AND confirmed_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.professional_shop_links psl
      WHERE psl.barbershop_id = professional_weekly_settlements.barbershop_id
        AND psl.professional_id = auth.uid()
        AND psl.is_active = true
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = professional_weekly_settlements.barbershop_id
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "professional_weekly_settlements_update_self"
  ON public.professional_weekly_settlements;
CREATE POLICY "professional_weekly_settlements_update_self"
  ON public.professional_weekly_settlements
  FOR UPDATE
  USING (
    professional_id = auth.uid()
    AND confirmed_by = auth.uid()
  )
  WITH CHECK (
    professional_id = auth.uid()
    AND confirmed_by = auth.uid()
  );
