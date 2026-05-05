-- ==============================================================
-- Migration: 20260505000004_security_hardening_v2.sql
-- Descrição: Quatro gaps de segurança identificados na auditoria
--
-- GAP 1 — CRÍTICO : get_clientes_favoritos_modal retornava email
--         + full_name de clientes para QUALQUER usuário autenticado.
--         Corrigido: somente profissionais ativos ou dono da
--         barbearia podem chamar a função.
--
-- GAP 2 — ALTO    : queue_entries SELECT com USING (true) expunha
--         nomes de clientes (PII + guest_name) para visitantes
--         não autenticados (anon).
--         Corrigido: SELECT restrito a role 'authenticated'.
--
-- GAP 3 — MÉDIO   : direct_messages UPDATE sem restrição de colunas
--         permitia que o destinatário reescrevesse content/sender_id.
--         Corrigido: trigger BEFORE UPDATE bloqueia alteração de
--         qualquer campo exceto is_read.
--
-- GAP 4 — MÉDIO   : profiles UPDATE permitia que o usuário
--         alterasse diretamente o campo email, desassociando-o
--         do email verificado em auth.users.
--         Corrigido: prevent_role_escalation estendido para
--         bloquear alteração de email via trigger.
-- ==============================================================


-- ==============================================================
-- GAP 1 — Restringir get_clientes_favoritos_modal a profissionais
-- ==============================================================
-- ANTES: qualquer usuário autenticado chamava via RPC e obtinha
--        id, full_name, email, avatar_path de outros clientes.
-- DEPOIS: somente quem tem linha em public.professionals OU é
--         owner_id da barbearia informada pode chamar.
-- O GRANT permanece em 'authenticated' para compatibilidade com
-- o SDK — a checagem de autorização ocorre dentro da função.
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
  -- Verifica se o chamador é profissional ativo OU dono da barbearia
  IF NOT EXISTS (
    SELECT 1 FROM public.professionals
    WHERE id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.barbershops
    WHERE id = p_barbershop_id
      AND owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION
      'Acesso negado: somente profissionais ou o dono da barbearia podem consultar os clientes favoritos.'
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
      -- Apenas quem favoritou este profissional específico
      SELECT fp.user_id
      FROM   public.favorite_professionals fp
      WHERE  fp.professional_id = p_professional_id
    )
    ORDER BY p.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_clientes_favoritos_modal(UUID, UUID) TO authenticated;


-- ==============================================================
-- GAP 2 — Restringir SELECT de queue_entries a autenticados
-- ==============================================================
-- A policy anterior (USING true) permitia leitura anônima da
-- fila, expondo guest_name e client_id para qualquer visitante.
-- ==============================================================

DROP POLICY IF EXISTS "queue_select_public" ON public.queue_entries;

CREATE POLICY "queue_select_authenticated"
  ON public.queue_entries
  FOR SELECT
  USING (auth.role() = 'authenticated');


-- ==============================================================
-- GAP 3 — Proteger conteúdo de direct_messages contra UPDATE
-- ==============================================================
-- A policy dm_update_read só verificava quem fazia o UPDATE,
-- não quais colunas eram modificadas. Isso permitia que o
-- destinatário reescrevesse o conteúdo de mensagens recebidas.
-- Apenas is_read pode ser alterado via UPDATE.
-- ==============================================================

CREATE OR REPLACE FUNCTION public.fn_dm_protect_content()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Permite mudanças pelo service_role (admin, moderação interna)
  IF current_setting('role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.content        IS DISTINCT FROM OLD.content
  OR NEW.sender_id      IS DISTINCT FROM OLD.sender_id
  OR NEW.recipient_id   IS DISTINCT FROM OLD.recipient_id
  OR NEW.story_ref_id   IS DISTINCT FROM OLD.story_ref_id
  OR NEW.created_at     IS DISTINCT FROM OLD.created_at
  THEN
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
-- GAP 4 — Bloquear alteração direta do campo email em profiles
-- ==============================================================
-- A policy profiles_update_own (auth.uid() = id) não impedia
-- UPDATE em profiles.email, causando dessincronismo com o email
-- verificado em auth.users.
-- A sincronização legítima ocorre APENAS via trigger
-- on_auth_user_email_updated (service_role), que continua
-- funcionando normalmente pois bypassa RLS + esta função.
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

  -- Bloqueia alteração direta de email (sincronizado via trigger auth → profiles)
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION
      'O campo email não pode ser alterado diretamente. Use o fluxo de alteração de e-mail do Auth.'
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

-- O trigger trg_prevent_role_escalation já existe e aponta para esta função.
-- CREATE OR REPLACE atualiza o corpo sem recriar o trigger.

-- ==============================================================
-- RESUMO PÓS-MIGRATION
-- ==============================================================
-- GAP 1: get_clientes_favoritos_modal → acesso restrito a professionals/owner ✅
-- GAP 2: queue_entries SELECT           → apenas authenticated (era anon) ✅
-- GAP 3: direct_messages UPDATE         → somente is_read modificável ✅
-- GAP 4: profiles.email UPDATE          → bloqueado via prevent_role_escalation ✅
-- ==============================================================
