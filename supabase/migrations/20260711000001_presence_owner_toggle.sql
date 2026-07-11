-- Migration: 20260711000001_presence_owner_toggle
-- Objetivo: permitir que o DONO da barbearia gerencie a própria presença
--           (Ativo/Inativo) em professional_barbershop_presence.
--
-- Contexto: as policies originais (20260603000001) exigiam vínculo ativo em
-- professional_shop_links — o dono não tem essa linha, então não conseguia
-- criar/atualizar a própria presença. O caminho de escrita real passa pelo
-- BFF (service role, bypassa RLS); esta migration é hardening defensivo para
-- manter a regra de negócio consistente no banco.
--
-- rollback:
--   Reaplicar as policies pbp_insert_linked_professional e
--   pbp_update_linked_professional da migration 20260603000001.

DROP POLICY IF EXISTS "pbp_insert_linked_professional" ON public.professional_barbershop_presence;
CREATE POLICY "pbp_insert_linked_professional"
  ON public.professional_barbershop_presence
  FOR INSERT
  WITH CHECK (
    auth.uid() = professional_id
    AND updated_by = auth.uid()
    AND (
      EXISTS (
        SELECT 1
        FROM public.professional_shop_links psl
        WHERE psl.barbershop_id = professional_barbershop_presence.barbershop_id
          AND psl.professional_id = auth.uid()
          AND psl.is_active = true
      )
      OR EXISTS (
        SELECT 1
        FROM public.barbershops b
        WHERE b.id = professional_barbershop_presence.barbershop_id
          AND b.owner_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "pbp_update_linked_professional" ON public.professional_barbershop_presence;
CREATE POLICY "pbp_update_linked_professional"
  ON public.professional_barbershop_presence
  FOR UPDATE
  USING (
    auth.uid() = professional_id
    AND (
      EXISTS (
        SELECT 1
        FROM public.professional_shop_links psl
        WHERE psl.barbershop_id = professional_barbershop_presence.barbershop_id
          AND psl.professional_id = auth.uid()
          AND psl.is_active = true
      )
      OR EXISTS (
        SELECT 1
        FROM public.barbershops b
        WHERE b.id = professional_barbershop_presence.barbershop_id
          AND b.owner_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    auth.uid() = professional_id
    AND updated_by = auth.uid()
  );
