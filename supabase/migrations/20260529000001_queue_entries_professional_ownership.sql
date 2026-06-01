-- Migration: 20260529000001_queue_entries_professional_ownership.sql
-- Objetivo: cada barbeiro administra somente as proprias cadeiras/fila.
-- Dono da barbearia deixa de ter permissao ampla sobre queue_entries de
-- outros profissionais; ele continua administrando a propria row quando
-- professional_id = auth.uid().

DROP POLICY IF EXISTS "queue_write_professional" ON public.queue_entries;
DROP POLICY IF EXISTS "queue_insert_own" ON public.queue_entries;
DROP POLICY IF EXISTS "queue_insert_self_or_responsible" ON public.queue_entries;
DROP POLICY IF EXISTS "queue_update_responsible_professional" ON public.queue_entries;
DROP POLICY IF EXISTS "queue_delete_responsible_professional" ON public.queue_entries;

CREATE POLICY "queue_insert_self_or_responsible"
  ON public.queue_entries
  FOR INSERT
  WITH CHECK (
    auth.uid() = client_id
    OR (
      professional_id IS NOT NULL
      AND auth.uid() = professional_id
    )
  );

CREATE POLICY "queue_update_responsible_professional"
  ON public.queue_entries
  FOR UPDATE
  USING (
    auth.uid() = professional_id
  )
  WITH CHECK (
    auth.uid() = professional_id
  );

CREATE POLICY "queue_delete_responsible_professional"
  ON public.queue_entries
  FOR DELETE
  USING (
    auth.uid() = professional_id
  );
