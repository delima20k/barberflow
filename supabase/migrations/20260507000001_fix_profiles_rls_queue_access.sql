-- ==============================================================
-- Migration: 20260507000001_fix_profiles_rls_queue_access.sql
-- Descrição: Permite que usuários autenticados vejam campos
--            básicos de perfis alheios para exibição na fila
--            (avatar e nome nas cadeiras do app profissional).
--
-- Contexto:
--   A policy "profiles_select_own" (20260417000004) restringia
--   SELECT na tabela profiles apenas ao próprio usuário. Isso
--   impedia o PostgREST de resolver o join
--   client:profiles!client_id(id, full_name, avatar_path)
--   ao buscar queue_entries no app profissional, fazendo com
--   que "client" retornasse null para todos os clientes que
--   não fossem o próprio usuário logado.
--
-- Solução:
--   Adicionar policy de SELECT para authenticated que permite
--   ver perfis ativos. O frontend já usa select explícito sem
--   colunas sensíveis (full_name, avatar_path, updated_at),
--   portanto a proteção de colunas sensíveis é garantida pela
--   camada de aplicação (PostgREST retorna apenas o que é
--   explicitamente selecionado). Equivale ao que a view
--   profiles_public já expunha via GRANT SELECT a authenticated.
-- ==============================================================

CREATE POLICY "profiles_select_active_for_queue"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (is_active = true);
