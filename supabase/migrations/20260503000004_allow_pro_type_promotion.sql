-- ==============================================================
-- Migration: 20260503000004_allow_pro_type_promotion.sql
-- Descrição: Permite que barbeiros promovam seu pro_type de
--            'barbeiro' para 'barbearia' somente quando já possuem
--            uma barbearia ativa na tabela barbershops.
--
-- Contexto:
--   A migration 20260417000005_prevent_role_escalation.sql bloqueou
--   toda alteração de pro_type pelo próprio usuário (correto por
--   segurança). Mas isso também bloqueou o fluxo legítimo de
--   CriarBarbeariaPage, que precisa promover o barbeiro após criar
--   sua barbearia.
--
-- Solução: refina a função prevent_role_escalation para permitir
--   apenas a transição 'barbeiro' → 'barbearia' quando o usuário
--   possui barbearia ativa. Todos os outros casos continuam bloqueados.
-- ==============================================================

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Permite mudanças pelo service_role (admin, triggers internos)
  IF current_setting('role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Bloqueia qualquer tentativa de alterar role pelo próprio usuário
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'O campo role não pode ser alterado pelo usuário.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- pro_type: permite apenas a promoção de 'barbeiro' → 'barbearia'
  -- quando o usuário já possui uma barbearia ativa.
  IF NEW.pro_type IS DISTINCT FROM OLD.pro_type THEN
    IF OLD.pro_type = 'barbeiro'
       AND NEW.pro_type = 'barbearia'
       AND EXISTS (
         SELECT 1 FROM public.barbershops
         WHERE owner_id = NEW.id AND is_active = true
         LIMIT 1
       )
    THEN
      -- Promoção legítima: barbeiro criou a barbearia antes de atualizar pro_type
      NULL;
    ELSE
      RAISE EXCEPTION 'O campo pro_type não pode ser alterado pelo usuário.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
