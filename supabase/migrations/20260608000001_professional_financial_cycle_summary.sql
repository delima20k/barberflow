-- Ciclo financeiro do barbeiro: historico agregado e transacoes abertas para payout.
-- rollback: DROP FUNCTION IF EXISTS public.get_professional_unpaid_transactions(uuid, uuid, integer); DROP FUNCTION IF EXISTS public.get_professional_financial_history_summary(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_professional_financial_history_summary(
  p_barbershop_id uuid,
  p_professional_id uuid DEFAULT NULL
)
RETURNS TABLE (
  professional_id uuid,
  faturamento_historico numeric,
  total_recebido numeric,
  payouts_count integer,
  last_payout_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH profissionais_escopo AS (
    SELECT b.owner_id AS professional_id
    FROM public.barbershops b
    WHERE b.id = p_barbershop_id
      AND (
        auth.role() = 'service_role'
        OR b.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.professional_shop_links access_link
          WHERE access_link.barbershop_id = p_barbershop_id
            AND access_link.professional_id = auth.uid()
            AND access_link.is_active = true
        )
      )

    UNION

    SELECT psl.professional_id
    FROM public.professional_shop_links psl
    WHERE psl.barbershop_id = p_barbershop_id
      AND psl.is_active = true
      AND EXISTS (
        SELECT 1
        FROM public.barbershops b
        WHERE b.id = p_barbershop_id
          AND (
            auth.role() = 'service_role'
            OR b.owner_id = auth.uid()
            OR EXISTS (
              SELECT 1
              FROM public.professional_shop_links access_link
              WHERE access_link.barbershop_id = p_barbershop_id
                AND access_link.professional_id = auth.uid()
                AND access_link.is_active = true
            )
          )
      )
  ),
  transacoes_historicas AS (
    SELECT
      t.professional_id,
      COALESCE(SUM(COALESCE(t.gross_amount, t.amount, 0)), 0) AS faturamento_historico
    FROM public.transactions t
    WHERE t.barbershop_id = p_barbershop_id
      AND (p_professional_id IS NULL OR t.professional_id = p_professional_id)
      AND t.type = 'revenue'
      AND t.status = 'paid'
    GROUP BY t.professional_id
  ),
  payouts_historicos AS (
    SELECT
      p.professional_id,
      COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'confirmed'), 0) AS total_recebido,
      COUNT(*) FILTER (WHERE p.status = 'confirmed')::integer AS payouts_count,
      MAX(p.paid_at) FILTER (WHERE p.status = 'confirmed') AS last_payout_at
    FROM public.professional_payouts p
    WHERE p.barbershop_id = p_barbershop_id
      AND (p_professional_id IS NULL OR p.professional_id = p_professional_id)
    GROUP BY p.professional_id
  )
  SELECT
    pe.professional_id,
    COALESCE(th.faturamento_historico, 0) AS faturamento_historico,
    COALESCE(ph.total_recebido, 0) AS total_recebido,
    COALESCE(ph.payouts_count, 0) AS payouts_count,
    ph.last_payout_at
  FROM profissionais_escopo pe
  LEFT JOIN transacoes_historicas th ON th.professional_id = pe.professional_id
  LEFT JOIN payouts_historicos ph ON ph.professional_id = pe.professional_id
  WHERE pe.professional_id IS NOT NULL
    AND (p_professional_id IS NULL OR pe.professional_id = p_professional_id)
  ORDER BY pe.professional_id;
$$;

CREATE OR REPLACE FUNCTION public.get_professional_unpaid_transactions(
  p_barbershop_id uuid,
  p_professional_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 5000
)
RETURNS TABLE (
  id uuid,
  barbershop_id uuid,
  professional_id uuid,
  amount numeric,
  gross_amount numeric,
  payment_method text,
  status text,
  type text,
  paid_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.barbershop_id,
    t.professional_id,
    t.amount,
    t.gross_amount,
    t.payment_method::text,
    t.status::text,
    t.type::text,
    t.paid_at,
    t.created_at
  FROM public.transactions t
  WHERE t.barbershop_id = p_barbershop_id
    AND EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = p_barbershop_id
        AND (
          auth.role() = 'service_role'
          OR b.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.professional_shop_links access_link
            WHERE access_link.barbershop_id = p_barbershop_id
              AND access_link.professional_id = auth.uid()
              AND access_link.is_active = true
          )
        )
    )
    AND (p_professional_id IS NULL OR t.professional_id = p_professional_id)
    AND t.type = 'revenue'
    AND t.status = 'paid'
    AND NOT EXISTS (
      SELECT 1
      FROM public.professional_payout_items ppi
      WHERE ppi.transaction_id = t.id
    )
  ORDER BY t.paid_at ASC, t.created_at ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 5000);
$$;

GRANT EXECUTE ON FUNCTION public.get_professional_financial_history_summary(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_professional_unpaid_transactions(uuid, uuid, integer) TO authenticated, service_role;
