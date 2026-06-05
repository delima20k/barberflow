-- Migration: 20260605000003_professional_payouts
-- Objetivo: registrar pagamentos de barbeiros com historico e dedupe atomico por transacao.
-- rollback: DROP FUNCTION IF EXISTS public.confirmar_professional_payout_atomic(uuid, uuid, numeric, timestamptz, timestamptz, uuid, uuid[], numeric[]); DROP TABLE IF EXISTS public.professional_payout_items; DROP TABLE IF EXISTS public.professional_payouts;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.professional_payouts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbershop_id   uuid NOT NULL REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  period_start    timestamptz NOT NULL,
  period_end      timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'failed', 'cancelled')),
  paid_at         timestamptz,
  created_by      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professional_payouts_period_check CHECK (period_start <= period_end),
  CONSTRAINT professional_payouts_paid_at_check CHECK (
    (status = 'confirmed' AND paid_at IS NOT NULL)
    OR (status <> 'confirmed' AND paid_at IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.professional_payout_items (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payout_id      uuid NOT NULL REFERENCES public.professional_payouts(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  amount         numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professional_payout_items_transaction_unique UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_professional_payouts_shop_prof_status_paid
  ON public.professional_payouts (barbershop_id, professional_id, status, paid_at);

CREATE INDEX IF NOT EXISTS idx_professional_payout_items_payout
  ON public.professional_payout_items (payout_id);

CREATE INDEX IF NOT EXISTS idx_professional_payout_items_transaction
  ON public.professional_payout_items (transaction_id);

DROP TRIGGER IF EXISTS trg_professional_payouts_updated_at
  ON public.professional_payouts;
CREATE TRIGGER trg_professional_payouts_updated_at
  BEFORE UPDATE ON public.professional_payouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.professional_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_payout_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "professional_payouts_select_shop_owner_or_self"
  ON public.professional_payouts;
CREATE POLICY "professional_payouts_select_shop_owner_or_self"
  ON public.professional_payouts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = professional_payouts.barbershop_id
        AND b.owner_id = auth.uid()
    )
    OR professional_payouts.professional_id = auth.uid()
  );

DROP POLICY IF EXISTS "professional_payouts_insert_owner"
  ON public.professional_payouts;
CREATE POLICY "professional_payouts_insert_owner"
  ON public.professional_payouts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = professional_payouts.barbershop_id
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "professional_payouts_update_owner"
  ON public.professional_payouts;
CREATE POLICY "professional_payouts_update_owner"
  ON public.professional_payouts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = professional_payouts.barbershop_id
        AND b.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = professional_payouts.barbershop_id
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "professional_payout_items_select_via_payout"
  ON public.professional_payout_items;
CREATE POLICY "professional_payout_items_select_via_payout"
  ON public.professional_payout_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.professional_payouts p
      WHERE p.id = professional_payout_items.payout_id
        AND (
          EXISTS (
            SELECT 1
            FROM public.barbershops b
            WHERE b.id = p.barbershop_id
              AND b.owner_id = auth.uid()
          )
          OR p.professional_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "professional_payout_items_insert_owner"
  ON public.professional_payout_items;
CREATE POLICY "professional_payout_items_insert_owner"
  ON public.professional_payout_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.professional_payouts p
      JOIN public.barbershops b ON b.id = p.barbershop_id
      WHERE p.id = professional_payout_items.payout_id
        AND b.owner_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.confirmar_professional_payout_atomic(
  p_barbershop_id uuid,
  p_professional_id uuid,
  p_amount numeric,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_created_by uuid,
  p_transaction_ids uuid[],
  p_item_amounts numeric[]
)
RETURNS TABLE (
  id uuid,
  barbershop_id uuid,
  professional_id uuid,
  amount numeric,
  period_start timestamptz,
  period_end timestamptz,
  status text,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout_id uuid;
  v_paid_at timestamptz := now();
  v_transaction_count integer;
  v_distinct_transaction_count integer;
  v_item_total numeric;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount must be positive' USING ERRCODE = '22023';
  END IF;

  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN
    RAISE EXCEPTION 'invalid payout period' USING ERRCODE = '22023';
  END IF;

  IF coalesce(array_length(p_transaction_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'p_transaction_ids must not be empty' USING ERRCODE = '22023';
  END IF;

  IF array_length(p_transaction_ids, 1) <> array_length(p_item_amounts, 1) THEN
    RAISE EXCEPTION 'transaction and amount arrays must have same length' USING ERRCODE = '22023';
  END IF;

  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_created_by THEN
      RAISE EXCEPTION 'payout creator does not match authenticated user' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.barbershops b
    WHERE b.id = p_barbershop_id
      AND b.owner_id = p_created_by
  ) THEN
    RAISE EXCEPTION 'payout creator is not barbershop owner' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.barbershops b
    WHERE b.id = p_barbershop_id
      AND (
        b.owner_id = p_professional_id
        OR EXISTS (
          SELECT 1
          FROM public.professional_shop_links psl
          WHERE psl.barbershop_id = p_barbershop_id
            AND psl.professional_id = p_professional_id
            AND psl.is_active = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'professional is not linked to barbershop' USING ERRCODE = '23503';
  END IF;

  SELECT
    count(*),
    count(DISTINCT tx.transaction_id),
    coalesce(sum(amounts.item_amount), 0)
  INTO v_transaction_count, v_distinct_transaction_count, v_item_total
  FROM unnest(p_transaction_ids) WITH ORDINALITY AS tx(transaction_id, ord)
  JOIN unnest(p_item_amounts) WITH ORDINALITY AS amounts(item_amount, ord)
    ON amounts.ord = tx.ord;

  IF v_transaction_count <> v_distinct_transaction_count THEN
    RAISE EXCEPTION 'duplicate transaction in payout payload' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_item_amounts) AS amounts(item_amount)
    WHERE amounts.item_amount <= 0
  ) THEN
    RAISE EXCEPTION 'item amounts must be positive' USING ERRCODE = '22023';
  END IF;

  IF round(v_item_total, 2) <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'payout amount does not match item total' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*)
    FROM public.transactions t
    WHERE t.id = ANY(p_transaction_ids)
      AND t.barbershop_id = p_barbershop_id
      AND t.professional_id = p_professional_id
      AND t.type = 'revenue'
      AND t.status = 'paid'
      AND t.paid_at >= p_period_start
      AND t.paid_at <= p_period_end
  ) <> v_transaction_count THEN
    RAISE EXCEPTION 'payout contains ineligible or missing transactions' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.professional_payouts (
    barbershop_id,
    professional_id,
    amount,
    period_start,
    period_end,
    status,
    paid_at,
    created_by
  )
  VALUES (
    p_barbershop_id,
    p_professional_id,
    p_amount,
    p_period_start,
    p_period_end,
    'confirmed',
    v_paid_at,
    p_created_by
  )
  RETURNING professional_payouts.id INTO v_payout_id;

  INSERT INTO public.professional_payout_items (
    payout_id,
    transaction_id,
    amount
  )
  SELECT
    v_payout_id,
    tx.transaction_id,
    amounts.item_amount
  FROM unnest(p_transaction_ids) WITH ORDINALITY AS tx(transaction_id, ord)
  JOIN unnest(p_item_amounts) WITH ORDINALITY AS amounts(item_amount, ord)
    ON amounts.ord = tx.ord;

  RETURN QUERY
  SELECT
    p.id,
    p.barbershop_id,
    p.professional_id,
    p.amount,
    p.period_start,
    p.period_end,
    p.status,
    p.paid_at,
    p.created_by,
    p.created_at,
    p.updated_at
  FROM public.professional_payouts p
  WHERE p.id = v_payout_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_professional_payout_atomic(
  uuid,
  uuid,
  numeric,
  timestamptz,
  timestamptz,
  uuid,
  uuid[],
  numeric[]
) TO authenticated, service_role;
