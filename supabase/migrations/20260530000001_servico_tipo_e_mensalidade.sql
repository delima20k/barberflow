-- ==============================================================
-- Migration: 20260530000001_servico_tipo_e_mensalidade.sql
-- Descricao: Suporte a servicos tipados (Luzes meia/inteira) e ao
--            banner de mensalidade anunciada na pagina publica.
--            O tipo do servico usa a coluna existente services.category
--            (corte | luzes | barba | pezinho | sobrancelha | pacote).
-- ==============================================================

-- ── Luzes: dois precos no mesmo servico (price = inteira, price_half = meia) ──
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS price_half numeric(8,2);

COMMENT ON COLUMN public.services.price_half IS
  'Preco da variante "meia" (ex.: Luzes meia). price = variante inteira.';

-- ── Mensalidade anunciada da barbearia (banner publico) ──────────────────────
ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS monthly_plan_price   numeric(10,2),
  ADD COLUMN IF NOT EXISTS monthly_plan_message text;

COMMENT ON COLUMN public.barbershops.monthly_plan_price IS
  'Valor da mensalidade anunciada no banner da pagina publica (null = sem banner).';
COMMENT ON COLUMN public.barbershops.monthly_plan_message IS
  'Mensagem promocional exibida no banner de mensalidade.';
