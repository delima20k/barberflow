-- 20260531000003_portfolio_messages.sql
-- Mensagens públicas enviadas por clientes em imagens de portfólio.
-- Independente do sistema de chat — tabela simples e autossuficiente.

CREATE TABLE IF NOT EXISTS public.portfolio_messages (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_image_id uuid        NOT NULL,
  professional_id    uuid        NOT NULL,
  sender_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body               text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 240),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_messages_image
  ON public.portfolio_messages(portfolio_image_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_portfolio_messages_professional
  ON public.portfolio_messages(professional_id, created_at DESC);

ALTER TABLE public.portfolio_messages ENABLE ROW LEVEL SECURITY;

-- Barbeiro lê mensagens das próprias imagens
CREATE POLICY "profissional_le_mensagens_portfolio"
  ON public.portfolio_messages FOR SELECT
  USING (auth.uid() = professional_id);

-- Cliente envia mensagem (INSERT)
CREATE POLICY "cliente_envia_mensagem_portfolio"
  ON public.portfolio_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

COMMENT ON TABLE public.portfolio_messages
  IS 'Reações e mensagens de clientes em imagens de portfólio de barbeiros';
