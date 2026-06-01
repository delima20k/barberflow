-- ==============================================================
-- Migration: 20260525000001_professionals_since_year.sql
-- Descricao: Ano publico de inicio profissional do barbeiro.
-- ==============================================================

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS since_year integer;

ALTER TABLE public.professionals
  DROP CONSTRAINT IF EXISTS professionals_since_year_range_chk;

ALTER TABLE public.professionals
  ADD CONSTRAINT professionals_since_year_range_chk
  CHECK (
    since_year IS NULL
    OR (
      since_year >= 1950
      AND since_year <= EXTRACT(YEAR FROM CURRENT_DATE)::integer
    )
  );

COMMENT ON COLUMN public.professionals.since_year IS
  'Ano desde quando o profissional corta cabelo. Exposto no perfil publico via BFF.';
