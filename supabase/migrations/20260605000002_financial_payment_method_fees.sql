-- Migration: 20260605000002_financial_payment_method_fees
-- Objetivo: configurar taxas de maquininha por barbearia sem alterar transactions.

CREATE TABLE IF NOT EXISTS public.financial_payment_method_fees (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbershop_id  uuid NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  fee_percent    numeric(5,2) NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_fpmf_method CHECK (payment_method IN ('debit', 'credit')),
  CONSTRAINT chk_fpmf_fee_percent CHECK (fee_percent >= 0 AND fee_percent <= 30),
  CONSTRAINT uq_fpmf_shop_method UNIQUE (barbershop_id, payment_method)
);

COMMENT ON TABLE public.financial_payment_method_fees IS
  'Taxas percentuais de debito/credito usadas pela BFF para calcular resumo financeiro por metodo. Nao altera transacoes.';

CREATE INDEX IF NOT EXISTS idx_fpmf_barbershop
  ON public.financial_payment_method_fees (barbershop_id);

DROP TRIGGER IF EXISTS trg_financial_payment_method_fees_updated_at
  ON public.financial_payment_method_fees;
CREATE TRIGGER trg_financial_payment_method_fees_updated_at
  BEFORE UPDATE ON public.financial_payment_method_fees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.financial_payment_method_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fpmf_select_shop_members" ON public.financial_payment_method_fees;
CREATE POLICY "fpmf_select_shop_members"
  ON public.financial_payment_method_fees
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = financial_payment_method_fees.barbershop_id
        AND b.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.professional_shop_links psl
      WHERE psl.barbershop_id = financial_payment_method_fees.barbershop_id
        AND psl.professional_id = auth.uid()
        AND psl.is_active = true
    )
  );

DROP POLICY IF EXISTS "fpmf_insert_owner" ON public.financial_payment_method_fees;
CREATE POLICY "fpmf_insert_owner"
  ON public.financial_payment_method_fees
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = financial_payment_method_fees.barbershop_id
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "fpmf_update_owner" ON public.financial_payment_method_fees;
CREATE POLICY "fpmf_update_owner"
  ON public.financial_payment_method_fees
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = financial_payment_method_fees.barbershop_id
        AND b.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = financial_payment_method_fees.barbershop_id
        AND b.owner_id = auth.uid()
    )
  );

-- rollback:
-- DROP TABLE IF EXISTS public.financial_payment_method_fees;
