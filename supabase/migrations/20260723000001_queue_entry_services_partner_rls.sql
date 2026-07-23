-- Migration: 20260723000001_queue_entry_services_partner_rls.sql
-- Permite que o profissional responsavel registre os servicos da propria entrada.
--
-- rollback:
-- Recriar qes_select_public, qes_insert e qes_delete conforme
-- 20260506000001_queue_entry_services.sql.

ALTER TABLE public.queue_entry_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qes_select_public" ON public.queue_entry_services;

CREATE POLICY "qes_select_public"
  ON public.queue_entry_services
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "qes_insert" ON public.queue_entry_services;

CREATE POLICY "qes_insert"
  ON public.queue_entry_services
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.queue_entries qe
      WHERE qe.id = queue_entry_services.queue_entry_id
        AND qe.barbershop_id = queue_entry_services.barbershop_id
        AND (
          qe.client_id = auth.uid()
          OR (
            qe.professional_id = auth.uid()
            AND (
              EXISTS (
                SELECT 1
                FROM public.barbershops b
                WHERE b.id = queue_entry_services.barbershop_id
                  AND b.owner_id = auth.uid()
              )
              OR EXISTS (
                SELECT 1
                FROM public.professional_shop_links psl
                WHERE psl.barbershop_id = queue_entry_services.barbershop_id
                  AND psl.professional_id = auth.uid()
                  AND psl.is_active = true
              )
            )
          )
        )
    )
    AND EXISTS (
      SELECT 1
      FROM public.services s
      WHERE s.id = queue_entry_services.service_id
        AND s.barbershop_id = queue_entry_services.barbershop_id
        AND s.is_active = true
    )
  );

DROP POLICY IF EXISTS "qes_delete" ON public.queue_entry_services;

CREATE POLICY "qes_delete"
  ON public.queue_entry_services
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.queue_entries qe
      WHERE qe.id = queue_entry_services.queue_entry_id
        AND qe.barbershop_id = queue_entry_services.barbershop_id
        AND (
          qe.client_id = auth.uid()
          OR (
            qe.professional_id = auth.uid()
            AND (
              EXISTS (
                SELECT 1
                FROM public.barbershops b
                WHERE b.id = queue_entry_services.barbershop_id
                  AND b.owner_id = auth.uid()
              )
              OR EXISTS (
                SELECT 1
                FROM public.professional_shop_links psl
                WHERE psl.barbershop_id = queue_entry_services.barbershop_id
                  AND psl.professional_id = auth.uid()
                  AND psl.is_active = true
              )
            )
          )
        )
    )
  );
