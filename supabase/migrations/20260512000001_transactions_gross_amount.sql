-- ==============================================================
-- Migration: 20260512000001_transactions_gross_amount.sql
-- Descrição: Adiciona coluna gross_amount para armazenar o valor
--            bruto original da transação (antes de qualquer desconto
--            de maquininha). Nunca é alterada após o INSERT.
--            Adiciona RPC aplicar_desconto_metodo para atualização
--            em batch do amount líquido por método de pagamento.
-- ==============================================================

-- ── 1. Nova coluna gross_amount ──────────────────────────────────
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS gross_amount numeric(10,2);

-- ── 2. Backfill: dados históricos sem gross_amount ───────────────
UPDATE public.transactions
SET gross_amount = amount
WHERE gross_amount IS NULL;

-- ── 3. Trigger para novos INSERTs (garante gross_amount sempre preenchido) ───
CREATE OR REPLACE FUNCTION public.set_transaction_gross_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Preserva gross_amount se fornecido; senão copia de amount
  NEW.gross_amount := COALESCE(NEW.gross_amount, NEW.amount);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_transaction_gross_amount ON public.transactions;
CREATE TRIGGER trg_set_transaction_gross_amount
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_transaction_gross_amount();

-- ── 4. RPC: aplicar desconto por método de pagamento ─────────────
-- Atualiza amount = ROUND(gross_amount * (1 - p_porcentagem/100), 2)
-- para todas as transações do período + método indicados.
-- SECURITY DEFINER: executa como owner da função, permitindo UPDATE
-- sem depender de RLS UPDATE (que estaria restrita ao dono da barbearia).
-- search_path = public evita injection via search_path.
CREATE OR REPLACE FUNCTION public.aplicar_desconto_metodo(
  p_barbershop_id uuid,
  p_metodo        text,
  p_de            timestamptz,
  p_ate           timestamptz,
  p_porcentagem   numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validações de guarda
  IF p_porcentagem <= 0 OR p_porcentagem >= 100 THEN
    RAISE EXCEPTION 'porcentagem deve ser > 0 e < 100';
  END IF;

  IF p_metodo NOT IN ('credito', 'debito', 'cartao') THEN
    RAISE EXCEPTION 'metodo inválido: %', p_metodo;
  END IF;

  -- Verifica se quem chama é dono ou membro ativo da barbearia
  IF NOT EXISTS (
    SELECT 1 FROM public.barbershops
    WHERE id = p_barbershop_id AND owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.professional_shop_links
    WHERE barbershop_id = p_barbershop_id
      AND professional_id = auth.uid()
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  UPDATE public.transactions
  SET amount = ROUND(COALESCE(gross_amount, amount) * (1 - p_porcentagem / 100.0), 2)
  WHERE barbershop_id = p_barbershop_id
    AND payment_method = p_metodo
    AND type   = 'revenue'
    AND status = 'paid'
    AND paid_at BETWEEN p_de AND p_ate;
END;
$$;

-- Permissão para usuários autenticados chamarem a RPC
GRANT EXECUTE ON FUNCTION public.aplicar_desconto_metodo(uuid, text, timestamptz, timestamptz, numeric)
  TO authenticated;
