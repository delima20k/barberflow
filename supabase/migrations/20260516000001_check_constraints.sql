-- ==============================================================
-- Migration: 20260516000001_check_constraints.sql
-- Descrição: Constraints de integridade em colunas numéricas críticas.
--
-- Diagnóstico antes de aplicar:
--   SELECT id, price FROM services WHERE price < 0;
--   SELECT id, duration_min FROM services WHERE duration_min <= 0 OR duration_min > 480;
--   SELECT id, rating_avg FROM barbershops WHERE rating_avg < 0 OR rating_avg > 5;
-- ==============================================================

-- ── services ─────────────────────────────────────────────────

ALTER TABLE public.services
  ADD CONSTRAINT chk_services_price_positivo
    CHECK (price >= 0),
  ADD CONSTRAINT chk_services_duration_valida
    CHECK (duration_min > 0 AND duration_min <= 480);

-- ── appointments ─────────────────────────────────────────────

ALTER TABLE public.appointments
  ADD CONSTRAINT chk_appointments_duration_valida
    CHECK (duration_min > 0 AND duration_min <= 480);

-- ── barbershops ──────────────────────────────────────────────

ALTER TABLE public.barbershops
  ADD CONSTRAINT chk_barbershops_rating_avg
    CHECK (rating_avg >= 0 AND rating_avg <= 5),
  ADD CONSTRAINT chk_barbershops_rating_count
    CHECK (rating_count >= 0);

-- ── transactions (se existir a tabela) ───────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'transactions'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT chk_transactions_amount_positivo
        CHECK (amount > 0);
  END IF;
END $$;

-- ── subscriptions ─────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
      AND column_name = 'valid_until'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT chk_subscriptions_datas
        CHECK (valid_until >= valid_from);
  END IF;
END $$;
