-- ==============================================================
-- Migration: 20260428000001_services_image_path.sql
-- Descrição: Adiciona image_path na tabela services e política de
--            storage para upload de imagens de serviços no bucket
--            'barbershops' (pasta <barbershop_id>/services/).
-- ==============================================================

-- ── Coluna ──────────────────────────────────────────────────
alter table public.services
  add column if not exists image_path text default null;

comment on column public.services.image_path is
  'Path no bucket barbershops para a imagem do serviço (ex: <uuid>/services/<file>.webp).';

-- ── Política de storage ──────────────────────────────────────
-- O dono da barbearia pode fazer upload/update/delete em
-- barbershops/<barbershop_id>/services/** mesmo que o primeiro
-- segmento do path seja o UUID da barbearia (≠ auth.uid()).

create policy "barbershops_services_owner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'barbershops' and
    (storage.foldername(name))[2] = 'services' and
    exists (
      select 1 from public.barbershops b
      where b.id::text = (storage.foldername(name))[1]
        and b.owner_id = auth.uid()
    )
  );

create policy "barbershops_services_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'barbershops' and
    (storage.foldername(name))[2] = 'services' and
    exists (
      select 1 from public.barbershops b
      where b.id::text = (storage.foldername(name))[1]
        and b.owner_id = auth.uid()
    )
  );

create policy "barbershops_services_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'barbershops' and
    (storage.foldername(name))[2] = 'services' and
    exists (
      select 1 from public.barbershops b
      where b.id::text = (storage.foldername(name))[1]
        and b.owner_id = auth.uid()
    )
  );
