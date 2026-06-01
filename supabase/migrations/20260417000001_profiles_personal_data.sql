-- ==============================================================
-- Migration: 20260417000001_profiles_personal_data.sql
-- Descrição: Dados pessoais do usuário (endereço, nascimento,
--            sexo e CEP como fallback de geolocalização)
-- ==============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address    text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS gender     text
    CHECK (gender IN ('masculino', 'feminino', 'outro', 'nao_informar')),
  ADD COLUMN IF NOT EXISTS zip_code   text;

COMMENT ON COLUMN public.profiles.address    IS 'Endereço residencial do usuário';
COMMENT ON COLUMN public.profiles.birth_date IS 'Data de nascimento';
COMMENT ON COLUMN public.profiles.gender     IS 'Gênero: masculino | feminino | outro | nao_informar';
COMMENT ON COLUMN public.profiles.zip_code   IS 'CEP — usado como fallback de geolocalização quando GPS está desativado';
