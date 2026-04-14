-- ==============================================================
-- Migration: 20260414000006_pro_type.sql
-- Descrição: Identifica subtipo do profissional (barbeiro autônomo
--            ou proprietário/gestor de barbearia) diretamente no perfil.
-- Campo: profiles.pro_type
-- Valores: 'barbeiro' | 'barbearia' | null (não aplica para clientes)
-- ==============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pro_type text
    CHECK (pro_type IN ('barbeiro', 'barbearia'));

COMMENT ON COLUMN public.profiles.pro_type IS
  'Subtipo do profissional. barbeiro = autônomo/funcionário; barbearia = dono/gestor de espaço. NULL para clientes.';

CREATE INDEX IF NOT EXISTS idx_profiles_pro_type
  ON public.profiles (pro_type)
  WHERE pro_type IS NOT NULL;
