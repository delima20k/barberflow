-- ==============================================================
-- Migration: 20260417000002_fix_notifications_rls.sql
-- Descrição: Corrige RLS de INSERT em notifications
--            Policy anterior usava with check (true), permitindo
--            que qualquer usuário autenticado injetasse notificações
--            em qualquer outro usuário (spam / phishing).
--
-- Correção: INSERT só permitido via service_role (Edge Functions /
--           triggers) OU pelo próprio usuário (auto-notificação local).
-- ==============================================================

-- Remove a policy permissiva anterior
DROP POLICY IF EXISTS "notifications_insert_service" ON public.notifications;

-- Nova policy: apenas service_role ou o próprio usuário pode inserir
CREATE POLICY "notifications_insert_service"
  ON public.notifications
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR auth.uid() = user_id
  );
