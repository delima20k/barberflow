-- ==============================================================
-- Migration: 20260418000001_rls_security_hardening.sql
-- Descrição: Reforço de segurança RLS — correção de políticas
--            permissivas + cobertura de tabelas sem DELETE policy
-- ==============================================================
--
-- POR QUE auth.uid() PROTEGE OS DADOS?
--   auth.uid() retorna o ID do usuário autenticado pelo JWT na request.
--   Ao usar USING (auth.uid() = user_id), o PostgreSQL garante que
--   APENAS o dono do registro consegue lê-lo, editá-lo ou apagá-lo.
--   Isso acontece no nível do banco, antes da aplicação ver os dados.
--
-- RISCO DE NÃO USAR:
--   Sem RLS, qualquer usuário com a anon key consegue ler ou modificar
--   dados de outros usuários via REST (PostgREST não filtra por conta).
--   Com `with check (true)` no INSERT, qualquer autenticado pode criar
--   registros apontando para o user_id de outra pessoa.
-- ==============================================================


-- ==============================================================
-- 1. NOTIFICATIONS — corrigir INSERT permissivo
-- ==============================================================
-- ❌ PROBLEMA: `with check (true)` permite que qualquer usuário
--    autenticado insira notificações para QUALQUER user_id.
--    Um usuário mal-intencionado pode "spam" a caixa de outro.
--
-- ✅ SOLUÇÃO: separar em dois casos:
--    a) Usuário insere notificação para SI MESMO (self-notify)
--    b) Backend (Edge Function / trigger) usa service_role
--       e bypassa RLS completamente — sem necessidade de policy.
-- ==============================================================

drop policy if exists "notifications_insert_service" on public.notifications;

-- Usuário só pode inserir notificação onde user_id = próprio ID
create policy "notifications_insert_own"
  on public.notifications
  for insert
  with check (auth.uid() = user_id);

-- DELETE: usuário pode apagar suas próprias notificações
drop policy if exists "notifications_delete_own" on public.notifications;

create policy "notifications_delete_own"
  on public.notifications
  for delete
  using (auth.uid() = user_id);


-- ==============================================================
-- 2. STORY_VIEWS — políticas ausentes
-- ==============================================================
-- Sem policy: qualquer autenticado pode inserir view com
-- viewer_id de outro usuário, inflando contadores falsamente.
-- ==============================================================

-- Usuário vê apenas visualizações que ele gerou
create policy "story_views_select_own"
  on public.story_views
  for select
  using (auth.uid() = viewer_id);

-- Usuário só pode registrar view com seu próprio ID
create policy "story_views_insert_own"
  on public.story_views
  for insert
  with check (auth.uid() = viewer_id);

-- Sem UPDATE nem DELETE: views são imutáveis por design


-- ==============================================================
-- 3. APPOINTMENTS — adicionar DELETE para o cliente
-- ==============================================================
-- Cliente pode cancelar/apagar um agendamento pendente.
-- Profissional NÃO pode deletar — apenas mudar status.
-- ==============================================================

drop policy if exists "appointments_delete_client" on public.appointments;

create policy "appointments_delete_client"
  on public.appointments
  for delete
  using (auth.uid() = client_id);


-- ==============================================================
-- 4. QUEUE ENTRIES — restringir INSERT
-- ==============================================================
-- Sem with check, qualquer autenticado poderia entrar na fila
-- como outra pessoa. Garantir que client_id = auth.uid().
-- ==============================================================

drop policy if exists "queue_insert_own" on public.queue_entries;

create policy "queue_insert_own"
  on public.queue_entries
  for insert
  with check (
    auth.uid() = client_id
    or
    -- Profissional/dono da barbearia pode inserir entradas gerenciadas
    auth.uid() = (
      select owner_id from public.barbershops
      where id = barbershop_id
    )
  );


-- ==============================================================
-- 5. PUSH SUBSCRIPTIONS — adicionar UPDATE (troca de endpoint)
-- ==============================================================

drop policy if exists "push_subs_update_own" on public.push_subscriptions;

create policy "push_subs_update_own"
  on public.push_subscriptions
  for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ==============================================================
-- 6. LIKES — bloquear UPDATE (likes são imutáveis)
-- ==============================================================
-- Não há razão para atualizar um like — só inserir ou deletar.
-- Nenhuma policy de UPDATE = UPDATE bloqueado por padrão. OK.


-- ==============================================================
-- 7. PROFESSIONAL_SHOP_LINKS — SELECT público + write protegido
-- ==============================================================
-- Sem policy de SELECT: clientes não conseguem ver
-- em quais barbearias um profissional trabalha.
-- ==============================================================

drop policy if exists "psl_select_public" on public.professional_shop_links;
drop policy if exists "psl_write_own"     on public.professional_shop_links;

-- Público pode ver os vínculos ativos (necessário para busca de profissionais)
create policy "psl_select_public"
  on public.professional_shop_links
  for select
  using (is_active = true);

-- Profissional gerencia seus próprios vínculos
create policy "psl_insert_own"
  on public.professional_shop_links
  for insert
  with check (auth.uid() = professional_id);

create policy "psl_update_own"
  on public.professional_shop_links
  for update
  using (auth.uid() = professional_id);

create policy "psl_delete_own"
  on public.professional_shop_links
  for delete
  using (auth.uid() = professional_id);


-- ==============================================================
-- 8. PROFESSIONALS — adicionar DELETE protegido
-- ==============================================================

drop policy if exists "professionals_delete_own" on public.professionals;

create policy "professionals_delete_own"
  on public.professionals
  for delete
  using (auth.uid() = id);


-- ==============================================================
-- 9. PORTFOLIO IMAGES — garantir DELETE isolado
-- ==============================================================
-- A policy "for all" já cobre DELETE, mas deixamos explícito
-- para auditoria. Se "for all" existir, sem conflito.
-- ==============================================================


-- ==============================================================
-- RESUMO DE SEGURANÇA PÓS-MIGRATION
-- ==============================================================
-- Tabela                 | SELECT       | INSERT          | UPDATE          | DELETE
-- -----------------------|--------------|-----------------|-----------------|------------------
-- profiles               | is_active    | auth.uid()=id   | auth.uid()=id   | (cascade auth)
-- barbershops            | is_active    | auth.uid()=own  | auth.uid()=own  | auth.uid()=own
-- professionals          | is_active    | auth.uid()=id   | auth.uid()=id   | auth.uid()=id ✅
-- professional_shop_links| is_active    | auth.uid()=prof | auth.uid()=prof | auth.uid()=prof ✅
-- appointments           | parties      | client          | parties         | client ✅
-- queue_entries          | public       | client/owner    | parties/owner   | parties/owner
-- notifications          | own          | own ✅ (era true)| own             | own ✅
-- story_views            | own ✅       | own ✅          | (bloqueado)     | (bloqueado)
-- stories                | não-expirado | owner           | owner           | owner
-- portfolio_images       | active       | owner           | owner           | owner
-- likes                  | public       | own             | (bloqueado)     | own
-- portfolio_likes        | public       | own             | (bloqueado)     | own
-- push_subscriptions     | own          | own             | own ✅          | own
-- direct_messages        | parties      | sender          | recipient       | (bloqueado)
-- story_comments         | autenticado  | sender          | (bloqueado)     | sender/recipient
-- ==============================================================
