-- ==============================================================
-- Migration: 20260505000004_security_hardening_v2.sql
-- Descrição: Reforço de segurança RLS — 4 gaps identificados em auditoria
--
-- GAP 1 — CRÍTICO  : get_clientes_favoritos_modal exposta a clientes comuns
-- GAP 2 — ALTO     : queue_entries SELECT acessível por visitantes anônimos
-- GAP 3 — MÉDIO    : direct_messages UPDATE sem proteção de colunas imutáveis
-- GAP 4 — MÉDIO    : profiles.email pode ser sobrescrito diretamente via REST
--
-- Todos os fixes são não-destrutivos: apenas restrições adicionais.
-- Nenhuma tabela, coluna ou dado existente é alterado.
-- ==============================================================


-- ==============================================================
-- GAP 1 — get_clientes_favoritos_modal: acesso restrito a profissionais/donos
-- ==============================================================
-- PROBLEMA: GRANT EXECUTE TO authenticated — qualquer cliente logado pode
--   chamar com qualquer professional_id e receber email + full_name de
--   outros usuários. Violação LGPD — exposição de dados pessoais de
--   terceiros sem consentimento.
--
-- SOLUÇÃO: verificar no início da função que auth.uid() está cadastrado
--   em public.professionals (é um barbeiro) OU é owner_id da barbearia
--   passada como parâmetro. Qualquer outro chamador recebe exceção.
-- ==============================================================

CREATE OR REPLACE FUNCTION public.get_clientes_favoritos_modal(
  p_barbershop_id   UUID,
  p_professional_id UUID
)
RETURNS TABLE (
  id          UUID,
  full_name   TEXT,
  email       TEXT,
  avatar_path TEXT,
  updated_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Apenas profissionais cadastrados ou donos da barbearia podem consultar
  IF NOT EXISTS (
    SELECT 1 FROM public.professionals  WHERE id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.barbershops    WHERE id = p_barbershop_id
                                          AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION
      'Acesso negado: somente profissionais ou donos da barbearia podem consultar esta função.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
    SELECT DISTINCT
      p.id,
      p.full_name,
      p.email,
      p.avatar_path,
      p.updated_at
    FROM public.profiles p
    WHERE p.id IN (
      SELECT fp.user_id
      FROM   public.favorite_professionals fp
      WHERE  fp.professional_id = p_professional_id
    )
    ORDER BY p.full_name;
END;
$$;

-- Mantém o GRANT existente — o controle de acesso agora é feito dentro da função
GRANT EXECUTE ON FUNCTION public.get_clientes_favoritos_modal(UUID, UUID) TO authenticated;


-- ==============================================================
-- GAP 2 — queue_entries: bloquear SELECT para visitantes anônimos
-- ==============================================================
-- PROBLEMA: policy "queue_select_public" usa USING (true), permitindo
--   que qualquer visitante sem login leia a fila inteira, expondo
--   client_id, guest_name e position (PII dos clientes na fila).
--
-- SOLUÇÃO: substituir pela policy "queue_select_authenticated" que
--   exige que o solicitante esteja autenticado (role = 'authenticated').
--   Clientes, barbeiros e donos ainda lêem normalmente após login.
-- ==============================================================

DROP POLICY IF EXISTS "queue_select_public"        ON public.queue_entries;
DROP POLICY IF EXISTS "queue_select_authenticated" ON public.queue_entries;

CREATE POLICY "queue_select_authenticated"
  ON public.queue_entries FOR SELECT
  USING (auth.role() = 'authenticated');


-- ==============================================================
-- GAP 3 — direct_messages: proteger colunas imutáveis contra UPDATE
-- ==============================================================
-- PROBLEMA: a policy dm_update_read verifica apenas QUEM faz o UPDATE,
--   não QUAIS colunas mudam. O destinatário da mensagem pode alterar
--   content, sender_id, recipient_id e story_ref_id além de is_read.
--
-- SOLUÇÃO: trigger BEFORE UPDATE que levanta exceção se qualquer coluna
--   além de is_read for modificada. Mensagens são imutáveis por design;
--   apenas a marcação de lida é permitida ao destinatário.
-- ==============================================================

CREATE OR REPLACE FUNCTION public.fn_dm_protect_content()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.content        IS DISTINCT FROM OLD.content        OR
     NEW.sender_id      IS DISTINCT FROM OLD.sender_id      OR
     NEW.recipient_id   IS DISTINCT FROM OLD.recipient_id   OR
     NEW.story_ref_id   IS DISTINCT FROM OLD.story_ref_id   THEN
    RAISE EXCEPTION
      'Apenas o campo is_read pode ser atualizado em direct_messages.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dm_protect_content ON public.direct_messages;

CREATE TRIGGER trg_dm_protect_content
  BEFORE UPDATE ON public.direct_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_dm_protect_content();


-- ==============================================================
-- GAP 4 — profiles.email: bloquear sobrescrita direta via REST API
-- ==============================================================
-- PROBLEMA: a policy profiles_update_own (auth.uid() = id) permite UPDATE
--   de qualquer coluna, inclusive email. Um usuário pode exibir um email
--   diferente do verificado em auth.users (dessincronização + exibição
--   de email falso ou de terceiro).
--
-- SOLUÇÃO: estender prevent_role_escalation (trigger BEFORE UPDATE em
--   profiles) para bloquear mudança de email quando o chamador é o
--   role 'authenticated' (chamada REST API direta).
--
-- COMPATIBILIDADE PRESERVADA:
--   • service_role → retorna NEW no início (bypass completo)
--   • sync_profile_email trigger → roda como supabase_auth_admin,
--     que NÃO é 'authenticated', portanto não é bloqueado ✓
--   • handle_new_user trigger → INSERT, não UPDATE, sem impacto ✓
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

  -- pro_type: permite apenas a promoção 'barbeiro' → 'barbearia'
  -- quando o usuário já possui barbearia ativa (fluxo CriarBarbeariaPage).
  IF NEW.pro_type IS DISTINCT FROM OLD.pro_type THEN
    IF OLD.pro_type = 'barbeiro'
       AND NEW.pro_type = 'barbearia'
       AND EXISTS (
         SELECT 1 FROM public.barbershops
         WHERE owner_id = NEW.id AND is_active = true
         LIMIT 1
       )
    THEN
      NULL; -- Promoção legítima
    ELSE
      RAISE EXCEPTION 'O campo pro_type não pode ser alterado pelo usuário.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Bloqueia sobrescrita direta de email via REST API (role = 'authenticated').
  -- O trigger sync_profile_email roda como supabase_auth_admin — não é bloqueado.
  IF NEW.email IS DISTINCT FROM OLD.email
     AND current_setting('role') = 'authenticated' THEN
    RAISE EXCEPTION
      'O campo email não pode ser alterado diretamente. Use o fluxo de autenticação.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;
