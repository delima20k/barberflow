-- ==============================================================
-- Migration: 20260417000007_missing_rls_policies.sql
-- Descrição: MÉDIO — Cria policies RLS para attendance_sessions
--            e story_views, que estavam com RLS habilitado mas
--            SEM nenhuma policy — tabelas completamente travadas.
-- ==============================================================


-- ===========================================================
-- STORY VIEWS — quem visualizou cada story
-- ===========================================================

-- Qualquer autenticado vê as visualizações dos próprios stories
-- (dono do story sabe quem viu — comportamento padrão de stories)
CREATE POLICY "story_views_select_owner"
  ON public.story_views FOR SELECT
  USING (
    auth.uid() = viewer_id
    OR auth.uid() = (
      SELECT owner_id FROM public.stories
      WHERE id = story_id
    )
  );

-- Viewer insere a própria visualização
CREATE POLICY "story_views_insert_own"
  ON public.story_views FOR INSERT
  WITH CHECK (auth.uid() = viewer_id);

-- Ninguém deleta manualmente — limpeza via cascade quando story expira


-- ===========================================================
-- ATTENDANCE SESSIONS — sessões de atendimento ao vivo
-- ===========================================================

-- Profissional e dono da barbearia veem as sessões daquela barbearia
CREATE POLICY "attendance_select_professional"
  ON public.attendance_sessions FOR SELECT
  USING (
    auth.uid() = professional_id
    OR auth.uid() = (
      SELECT b.owner_id FROM public.barbershops b
      JOIN public.chairs c ON c.barbershop_id = b.id
      WHERE c.id = chair_id
      LIMIT 1
    )
  );

-- Profissional cria sessão para si mesmo
CREATE POLICY "attendance_insert_professional"
  ON public.attendance_sessions FOR INSERT
  WITH CHECK (auth.uid() = professional_id);

-- Profissional ou dono atualiza sessão (ex: marcar finished_at)
CREATE POLICY "attendance_update_professional"
  ON public.attendance_sessions FOR UPDATE
  USING (
    auth.uid() = professional_id
    OR auth.uid() = (
      SELECT b.owner_id FROM public.barbershops b
      JOIN public.chairs c ON c.barbershop_id = b.id
      WHERE c.id = chair_id
      LIMIT 1
    )
  );
