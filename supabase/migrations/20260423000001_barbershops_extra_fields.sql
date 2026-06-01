-- ==============================================================
-- Migration: 20260423000001_barbershops_extra_fields.sql
-- Descrição: Campos extras na tabela barbershops:
--   neighborhood  — bairro (salvo no sub-painel GPS)
--   whatsapp      — número WhatsApp para contato (configurações)
--   founded_year  — ano de fundação da barbearia (configurações)
-- ==============================================================

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS neighborhood  TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp      TEXT,
  ADD COLUMN IF NOT EXISTS founded_year  SMALLINT;
