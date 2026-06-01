-- =============================================================
-- Migration: 20260507000005_notifications_realtime.sql
-- Objetivo : Habilitar Supabase Realtime na tabela notifications
--            para que o NotificationService receba INSERTs via
--            postgres_changes com filtro user_id=eq.{userId}.
--
-- Sem esta migration, o canal Realtime nunca dispara eventos
-- e o barbeiro não recebe notificações em tempo real.
--
-- REPLICA IDENTITY FULL é necessário para filtros por coluna
-- funcionarem corretamente no Supabase Realtime.
-- =============================================================

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
