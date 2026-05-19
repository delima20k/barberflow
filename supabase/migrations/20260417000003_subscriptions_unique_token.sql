-- ==============================================================
-- Migration: 20260417000003_subscriptions_unique_token.sql
-- Descrição: Adiciona constraint UNIQUE em purchase_token para
--            impedir reutilização de um mesmo token Google Play
--            em múltiplas contas (token replay attack).
--
-- NULL é permitido (plano trial / web não usa purchaseToken).
-- O índice UNIQUE ignora NULLs automaticamente no PostgreSQL.
-- ==============================================================

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_purchase_token_unique
  UNIQUE (purchase_token);
