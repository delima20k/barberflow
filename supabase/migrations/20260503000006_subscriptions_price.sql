-- ==============================================================
-- Migration: 20260503000006_subscriptions_price.sql
-- Descricao: Adiciona coluna price em subscriptions para
--            exibir valor do plano na aba financeira da dashboard.
-- ==============================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

COMMENT ON COLUMN public.subscriptions.price IS
  'Valor cobrado pelo plano (0.00 para planos free/trial/administrativos).';
