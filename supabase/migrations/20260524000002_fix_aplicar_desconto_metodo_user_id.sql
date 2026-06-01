-- ==============================================================
-- Migration: 20260524000002_fix_aplicar_desconto_metodo_user_id.sql
-- Descrição: Substitui auth.uid() por p_user_id explícito na RPC
--            aplicar_desconto_metodo. A BFF chama via service_role_key
--            e auth.uid() retorna NULL nesse contexto, causando 500.
-- ==============================================================

-- Recria a função com o novo parâmetro p_user_id
CREATE OR REPLACE FUNCTION public.aplicar_desconto_metodo(
  p_barbershop_id uuid,
  p_metodo        text,
  p_de            timestamptz,
  p_ate           timestamptz,
  p_porcentagem   numeric,
  p_user_id       uuid
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

  IF p_metodo NOT IN ('credito', 'debito', 'credit', 'debit') THEN
    RAISE EXCEPTION 'metodo inválido: %', p_metodo;
  END IF;

  -- Verifica se o usuário é dono ou membro ativo da barbearia
  IF NOT EXISTS (
    SELECT 1 FROM public.barbershops
    WHERE id = p_barbershop_id AND owner_id = p_user_id
    UNION ALL
    SELECT 1 FROM public.professional_shop_links
    WHERE barbershop_id = p_barbershop_id
      AND professional_id = p_user_id
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

-- Revoga grant da assinatura antiga (5 parâmetros) e concede na nova (6 parâmetros)
REVOKE ALL ON FUNCTION public.aplicar_desconto_metodo(uuid, text, timestamptz, timestamptz, numeric)
  FROM PUBLIC, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.aplicar_desconto_metodo(uuid, text, timestamptz, timestamptz, numeric, uuid)
  TO service_role;
