-- ==============================================================
-- seed.sql — Dados de desenvolvimento do BarberFlow
-- NÃO usar em produção — apenas para testes locais
-- Rodar com: supabase db reset (ou inserir manualmente)
-- ==============================================================

-- ATENÇÃO: Supabase não permite inserir direto em auth.users via SQL
-- em ambiente de produção. Em local (supabase start), funciona via
-- supabase/seed.sql automaticamente após db reset.


-- ===========================================================
-- 1. PROFILES — usuários demo (sem auth.users real em seed)
--    UUIDs fixos para referência cruzada entre tabelas
-- ===========================================================

insert into public.profiles (id, full_name, phone, role, is_active, created_at, updated_at) values
  -- Dono da barbearia
  ('00000000-0000-0000-0000-000000000001',
   'Marcos Oliveira', '11999990001', 'professional', true, now(), now()),

  -- Barbeiro funcionário
  ('00000000-0000-0000-0000-000000000002',
   'João Silva', '11999990002', 'professional', true, now(), now()),

  -- Cliente demo
  ('00000000-0000-0000-0000-000000000003',
   'Lucas Ferreira', '11999990003', 'client', true, now(), now())

on conflict (id) do nothing;


-- ===========================================================
-- 2. PROFESSIONALS
-- ===========================================================

insert into public.professionals (id, bio, specialties, is_active, rating_avg, rating_count) values
  ('00000000-0000-0000-0000-000000000001',
   'Barbeiro com 10 anos de experiência. Especialista em degradê e barba.',
   ARRAY['degradê','barba','social'],
   true, 4.9, 120),

  ('00000000-0000-0000-0000-000000000002',
   'Especialista em cortes sociais e infantis.',
   ARRAY['social','infantil','sobrancelha'],
   true, 4.7, 85)

on conflict (id) do nothing;


-- ===========================================================
-- 3. BARBERSHOP DEMO
-- ===========================================================

insert into public.barbershops
  (id, owner_id, name, slug, description, phone, address, city, state, zip_code,
   latitude, longitude, is_open, is_active, rating_avg, rating_count) values
  ('10000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   'Barbearia Elite',
   'barbearia-elite',
   'A melhor barbearia do bairro. Degradê, barba e muito estilo.',
   '11988880001',
   'Av. Paulista, 123 — Bela Vista',
   'São Paulo', 'SP', '01310-100',
   -23.5613, -46.6570,
   true, true, 4.9, 205)

on conflict (id) do nothing;


-- ===========================================================
-- 4. VÍNCULO PROFISSIONAL ↔ BARBEARIA
-- ===========================================================

insert into public.professional_shop_links (professional_id, barbershop_id, is_active) values
  ('00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', true),
  ('00000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', true)

on conflict (professional_id, barbershop_id) do nothing;


-- ===========================================================
-- 5. SERVIÇOS
-- ===========================================================

insert into public.services
  (id, barbershop_id, name, category, price, duration_min, is_active) values
  ('20000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Corte Degradê', 'corte', 40.00, 40, true),

  ('20000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001',
   'Barba Completa', 'barba', 30.00, 30, true),

  ('20000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000001',
   'Combo Corte + Barba', 'combo', 65.00, 60, true),

  ('20000000-0000-0000-0000-000000000004',
   '10000000-0000-0000-0000-000000000001',
   'Corte Social', 'corte', 35.00, 35, true),

  ('20000000-0000-0000-0000-000000000005',
   '10000000-0000-0000-0000-000000000001',
   'Corte Infantil', 'corte', 25.00, 30, true)

on conflict (id) do nothing;


-- ===========================================================
-- 6. CADEIRAS
-- ===========================================================

insert into public.chairs
  (id, barbershop_id, label, status, professional_id) values
  ('30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'Cadeira 1', 'ocupada',
   '00000000-0000-0000-0000-000000000001'),

  ('30000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001',
   'Cadeira 2', 'livre',
   '00000000-0000-0000-0000-000000000002'),

  ('30000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000001',
   'Cadeira 3', 'livre', null)

on conflict (id) do nothing;


-- ===========================================================
-- 7. ASSENTOS DE ESPERA
-- ===========================================================

insert into public.waiting_seats
  (id, barbershop_id, label, is_occupied) values
  ('40000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001', 'Assento A', true),

  ('40000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001', 'Assento B', false),

  ('40000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000001', 'Assento C', false)

on conflict (id) do nothing;


-- ===========================================================
-- 8. STORIES DEMO (paths fictícios — Storage não validado em seed)
-- ===========================================================

insert into public.stories
  (id, owner_id, barbershop_id, storage_path, thumbnail_path,
   media_type, duration_sec, views_count, region_key, expires_at) values
  ('50000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   'stories/videos/demo-story-1.mp4',
   'stories/thumbs/demo-story-1.jpg',
   'video', 28, 120, 'sao-paulo',
   now() + interval '20 hours'),

  ('50000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000001',
   'stories/images/demo-story-2.jpg',
   'stories/thumbs/demo-story-2.jpg',
   'image', null, 45, 'sao-paulo',
   now() + interval '18 hours')

on conflict (id) do nothing;


-- ===========================================================
-- 9. PORTFÓLIO DEMO
-- ===========================================================

insert into public.portfolio_images
  (id, owner_id, owner_type, title, category,
   storage_path, thumbnail_path, likes_count, is_featured, status) values
  ('60000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000001',
   'professional',
   'Degradê Clássico',
   'degradê',
   'portfolio/images/original/demo-1.jpg',
   'portfolio/images/thumbs/demo-1.jpg',
   34, true, 'active'),

  ('60000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000001',
   'professional',
   'Barba Modelada',
   'barba',
   'portfolio/images/original/demo-2.jpg',
   'portfolio/images/thumbs/demo-2.jpg',
   21, false, 'active'),

  ('60000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000002',
   'professional',
   'Corte Social Executivo',
   'social',
   'portfolio/images/original/demo-3.jpg',
   'portfolio/images/thumbs/demo-3.jpg',
   15, false, 'active')

on conflict (id) do nothing;


-- ===========================================================
-- 10. AGENDAMENTO DEMO
-- ===========================================================

insert into public.appointments
  (id, client_id, professional_id, barbershop_id, service_id,
   scheduled_at, duration_min, status, price_charged) values
  ('70000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001',
   now() + interval '2 hours',
   40, 'confirmed', 40.00)

on conflict (id) do nothing;
