-- BarberFlow Schema Snapshot
-- Gerado em: 2026-06-08
-- Migrations: 124
-- NÃO editar manualmente. Regenerar com: node scripts/db-snapshot.js


-- MIGRATION: 20260406000001_initial_schema.sql
create extension if not exists "uuid-ossp";
create extension if not exists "postgis";

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  phone        text,
  avatar_path  text,
  role         text not null default 'client'
                check (role in ('client', 'professional', 'admin')),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Dados públicos do usuário, espelho de auth.users. Role define o tipo de acesso.';

create index idx_profiles_role on public.profiles(role);

create table if not exists public.barbershops (
  id             uuid primary key default uuid_generate_v4(),
  owner_id       uuid not null references public.profiles(id) on delete restrict,
  name           text not null,
  slug           text unique,
  description    text,
  phone          text,
  address        text,
  city           text,
  state          text,
  zip_code       text,

  latitude       numeric(10, 7),
  longitude      numeric(10, 7),
  logo_path      text,
  cover_path     text,
  is_open        boolean not null default false,
  is_active      boolean not null default true,
  rating_avg     numeric(3,2) not null default 0.00,
  rating_count   int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.barbershops is
  'Barbearias cadastradas. Coordenadas para busca por raio. Mídias somente no Storage.';

create index idx_barbershops_owner     on public.barbershops(owner_id);
create index idx_barbershops_city      on public.barbershops(city, state);
create index idx_barbershops_location  on public.barbershops(latitude, longitude);
create index idx_barbershops_active    on public.barbershops(is_active, is_open);

create table if not exists public.professionals (
  id           uuid primary key references public.profiles(id) on delete cascade,
  bio          text,
  specialties  text[],
  avatar_path  text,
  is_active    boolean not null default true,
  rating_avg   numeric(3,2) not null default 0.00,
  rating_count int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.professionals is
  'Perfil profissional. Vinculado a profiles. Especialidades em array para filtro rápido.';

create index idx_professionals_active      on public.professionals(is_active);
create index idx_professionals_specialties on public.professionals using gin(specialties);

create table if not exists public.professional_shop_links (
  id              uuid primary key default uuid_generate_v4(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  barbershop_id   uuid not null references public.barbershops(id)  on delete cascade,
  is_active       boolean not null default true,
  joined_at       timestamptz not null default now(),
  unique (professional_id, barbershop_id)
);

create index idx_psl_professional on public.professional_shop_links(professional_id);
create index idx_psl_barbershop   on public.professional_shop_links(barbershop_id);

create table if not exists public.services (
  id            uuid primary key default uuid_generate_v4(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  name          text not null,
  description   text,
  category      text,
  price         numeric(8,2) not null default 0,
  duration_min  int not null default 30,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.services is
  'Serviços oferecidos por barbearia. Duração em minutos para cálculo de agenda.';

create index idx_services_barbershop on public.services(barbershop_id, is_active);
create index idx_services_category   on public.services(category);

create table if not exists public.chairs (
  id            uuid primary key default uuid_generate_v4(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  label         text not null,
  status        text not null default 'livre'
                  check (status in ('livre','ocupada','inativa')),
  professional_id uuid references public.professionals(id) on delete set null,
  updated_at    timestamptz not null default now()
);

create index idx_chairs_barbershop on public.chairs(barbershop_id, status);

create table if not exists public.waiting_seats (
  id            uuid primary key default uuid_generate_v4(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  label         text not null,
  is_occupied   boolean not null default false,
  updated_at    timestamptz not null default now()
);

create index idx_waiting_seats_barbershop on public.waiting_seats(barbershop_id);

create table if not exists public.appointments (
  id              uuid primary key default uuid_generate_v4(),
  client_id       uuid not null references public.profiles(id)       on delete restrict,
  professional_id uuid not null references public.professionals(id)  on delete restrict,
  barbershop_id   uuid not null references public.barbershops(id)    on delete restrict,
  service_id      uuid not null references public.services(id)       on delete restrict,
  scheduled_at    timestamptz not null,
  duration_min    int not null default 30,
  status          text not null default 'pending'
                    check (status in ('pending','confirmed','in_progress','done','cancelled','no_show')),
  notes           text,
  price_charged   numeric(8,2),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.appointments is
  'Agendamentos. Status controla todo o ciclo do atendimento.';

create index idx_appointments_client       on public.appointments(client_id, scheduled_at);
create index idx_appointments_professional on public.appointments(professional_id, scheduled_at);
create index idx_appointments_barbershop   on public.appointments(barbershop_id, scheduled_at);
create index idx_appointments_status       on public.appointments(status);

create table if not exists public.queue_entries (
  id              uuid primary key default uuid_generate_v4(),
  barbershop_id   uuid not null references public.barbershops(id)   on delete cascade,
  client_id       uuid references public.profiles(id)               on delete set null,
  professional_id uuid references public.professionals(id)          on delete set null,
  chair_id        uuid references public.chairs(id)                 on delete set null,
  position        int not null default 0,
  status          text not null default 'waiting'
                    check (status in ('waiting','in_service','done','cancelled')),
  check_in_at     timestamptz not null default now(),
  served_at       timestamptz,
  done_at         timestamptz
);

comment on table public.queue_entries is
  'Fila em tempo real. Dados efêmeros. Limpar com cron diário ou função agendada.';

create index idx_queue_barbershop on public.queue_entries(barbershop_id, status);
create index idx_queue_position   on public.queue_entries(barbershop_id, position);

create table if not exists public.attendance_sessions (
  id              uuid primary key default uuid_generate_v4(),
  queue_entry_id  uuid not null references public.queue_entries(id) on delete restrict,
  appointment_id  uuid references public.appointments(id)           on delete set null,
  professional_id uuid not null references public.professionals(id) on delete restrict,
  chair_id        uuid not null references public.chairs(id)        on delete restrict,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  notes           text
);

create index idx_sessions_professional on public.attendance_sessions(professional_id, started_at);
create index idx_sessions_chair        on public.attendance_sessions(chair_id);

create table if not exists public.agreements (
  id              uuid primary key default uuid_generate_v4(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  barbershop_id   uuid not null references public.barbershops(id)   on delete cascade,
  type            text not null default 'percentage'
                    check (type in ('percentage','fixed','rent')),
  value           numeric(8,2) not null default 0,
  is_active       boolean not null default true,
  valid_from      date not null default current_date,
  valid_until     date,
  notes           text,
  created_at      timestamptz not null default now()
);

create index idx_agreements_professional on public.agreements(professional_id, is_active);
create index idx_agreements_barbershop   on public.agreements(barbershop_id, is_active);

create table if not exists public.transactions (
  id              uuid primary key default uuid_generate_v4(),
  barbershop_id   uuid not null references public.barbershops(id)   on delete restrict,
  appointment_id  uuid references public.appointments(id)           on delete set null,
  professional_id uuid references public.professionals(id)          on delete set null,
  client_id       uuid references public.profiles(id)               on delete set null,
  amount          numeric(10,2) not null,
  type            text not null default 'revenue'
                    check (type in ('revenue','refund','commission','expense')),
  payment_method  text,
  status          text not null default 'pending'
                    check (status in ('pending','paid','cancelled','refunded')),
  notes           text,
  paid_at         timestamptz,
  created_at      timestamptz not null default now()
);

comment on table public.transactions is
  'Movimentação financeira. Não salvar dados sensíveis de cartão — apenas método.';

create index idx_transactions_barbershop on public.transactions(barbershop_id, created_at);
create index idx_transactions_status     on public.transactions(status);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ declare
  t text;
begin
  foreach t in array array[
    'profiles','barbershops','professionals',
    'services','appointments'
  ] loop
    execute format(
      'create or replace trigger trg_%s_updated_at
       before update on public.%s
       for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- MIGRATION: 20260406000002_media_schema.sql
create table if not exists public.stories (
  id             uuid primary key default uuid_generate_v4(),
  owner_id       uuid not null references public.profiles(id)     on delete cascade,
  barbershop_id  uuid references public.barbershops(id)           on delete set null,
  storage_path   text not null,
  thumbnail_path text,
  media_type     text not null default 'video'
                   check (media_type in ('video','image')),
  duration_sec   int default 30,
  views_count    int not null default 0,
  region_key     text,
  expires_at     timestamptz not null default (now() + interval '24 hours'),
  created_at     timestamptz not null default now()
);

comment on table public.stories is
  'Stories de 24h. Somente metadados. Mídia fica no Storage em /stories/. Limpar expirados com cron.';

create index idx_stories_owner      on public.stories(owner_id, created_at);
create index idx_stories_expires    on public.stories(expires_at);
create index idx_stories_barbershop on public.stories(barbershop_id, expires_at);

create table if not exists public.story_views (
  id         uuid primary key default uuid_generate_v4(),
  story_id   uuid not null references public.stories(id) on delete cascade,
  viewer_id  uuid not null references public.profiles(id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  unique (story_id, viewer_id)
);

create index idx_story_views_story on public.story_views(story_id);

create table if not exists public.portfolio_images (
  id             uuid primary key default uuid_generate_v4(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  owner_type     text not null default 'professional'
                   check (owner_type in ('professional','barbershop')),
  title          text,
  description    text,
  category       text,
  storage_path   text not null,
  thumbnail_path text,
  likes_count    int not null default 0,
  views_count    int not null default 0,
  is_featured    boolean not null default false,
  status         text not null default 'active'
                   check (status in ('active','archived','deleted')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.portfolio_images is
  'Portfólio de trabalhos. Apenas metadados. Storage em /portfolio/images/.
   likes_count desnormalizado para evitar COUNT(*) a cada requisição.';

create index idx_portfolio_owner    on public.portfolio_images(owner_id, owner_type);
create index idx_portfolio_category on public.portfolio_images(category, status);
create index idx_portfolio_featured on public.portfolio_images(is_featured, status);

create table if not exists public.likes (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  content_id  uuid not null,
  content_type text not null
                 check (content_type in ('portfolio_image','story')),
  created_at  timestamptz not null default now(),
  unique (user_id, content_id, content_type)
);

comment on table public.likes is
  'Curtidas polimórficas. 1 like por usuário por conteúdo. Índice composto evita duplicidade.';

create index idx_likes_content on public.likes(content_id, content_type);
create index idx_likes_user    on public.likes(user_id);

create table if not exists public.portfolio_likes (
  id                  uuid primary key default uuid_generate_v4(),
  portfolio_image_id  uuid not null references public.portfolio_images(id) on delete cascade,
  user_id             uuid not null references public.profiles(id) on delete cascade,
  created_at          timestamptz not null default now(),
  unique (portfolio_image_id, user_id)
);

create index idx_portfolio_likes_image on public.portfolio_likes(portfolio_image_id);
create index idx_portfolio_likes_user  on public.portfolio_likes(user_id);

create table if not exists public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  data        jsonb,
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.notifications is
  'Notificações push. Campo data (jsonb) para payload variável sem schema fixo.';

create index idx_notifications_user   on public.notifications(user_id, is_read, created_at);
create index idx_notifications_type   on public.notifications(type);

create or replace trigger trg_portfolio_images_updated_at
  before update on public.portfolio_images
  for each row execute function public.set_updated_at();

-- MIGRATION: 20260406000003_rls_policies.sql
alter table public.profiles           enable row level security;
alter table public.barbershops        enable row level security;
alter table public.professionals      enable row level security;
alter table public.professional_shop_links enable row level security;
alter table public.services           enable row level security;
alter table public.chairs             enable row level security;
alter table public.waiting_seats      enable row level security;
alter table public.appointments       enable row level security;
alter table public.queue_entries      enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.agreements         enable row level security;
alter table public.transactions       enable row level security;
alter table public.stories            enable row level security;
alter table public.story_views        enable row level security;
alter table public.portfolio_images   enable row level security;
alter table public.likes              enable row level security;
alter table public.portfolio_likes    enable row level security;
alter table public.notifications      enable row level security;

create policy "profiles_select_public"
  on public.profiles for select
  using (is_active = true);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "barbershops_select_active"
  on public.barbershops for select
  using (is_active = true);

create policy "barbershops_owner_write"
  on public.barbershops for all
  using (auth.uid() = owner_id);

create policy "professionals_select_active"
  on public.professionals for select
  using (is_active = true);

create policy "professionals_update_own"
  on public.professionals for update
  using (auth.uid() = id);

create policy "professionals_insert_own"
  on public.professionals for insert
  with check (auth.uid() = id);

create policy "services_select_public"
  on public.services for select
  using (is_active = true);

create policy "services_owner_write"
  on public.services for all
  using (
    auth.uid() = (
      select owner_id from public.barbershops
      where id = barbershop_id
    )
  );

create policy "chairs_select_public"
  on public.chairs for select
  using (true);

create policy "chairs_owner_write"
  on public.chairs for all
  using (
    auth.uid() = (
      select owner_id from public.barbershops
      where id = barbershop_id
    )
  );

create policy "waiting_seats_select"
  on public.waiting_seats for select
  using (true);

create policy "waiting_seats_owner_write"
  on public.waiting_seats for all
  using (
    auth.uid() = (
      select owner_id from public.barbershops
      where id = barbershop_id
    )
  );

create policy "appointments_select_own"
  on public.appointments for select
  using (
    auth.uid() = client_id or
    auth.uid() = professional_id
  );

create policy "appointments_client_insert"
  on public.appointments for insert
  with check (auth.uid() = client_id);

create policy "appointments_update_parties"
  on public.appointments for update
  using (
    auth.uid() = client_id or
    auth.uid() = professional_id
  );

create policy "queue_select_public"
  on public.queue_entries for select
  using (true);

create policy "queue_write_professional"
  on public.queue_entries for all
  using (
    auth.uid() = client_id or
    auth.uid() = professional_id or
    auth.uid() = (
      select owner_id from public.barbershops
      where id = barbershop_id
    )
  );

create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid() = user_id);

create policy "stories_select_active"
  on public.stories for select
  using (expires_at > now());

create policy "stories_owner_write"
  on public.stories for all
  using (auth.uid() = owner_id);

create policy "portfolio_select_active"
  on public.portfolio_images for select
  using (status = 'active');

create policy "portfolio_owner_write"
  on public.portfolio_images for all
  using (auth.uid() = owner_id);

create policy "likes_select_public"
  on public.likes for select
  using (true);

create policy "likes_insert_own"
  on public.likes for insert
  with check (auth.uid() = user_id);

create policy "likes_delete_own"
  on public.likes for delete
  using (auth.uid() = user_id);

create policy "portfolio_likes_select"
  on public.portfolio_likes for select
  using (true);

create policy "portfolio_likes_insert_own"
  on public.portfolio_likes for insert
  with check (auth.uid() = user_id);

create policy "portfolio_likes_delete_own"
  on public.portfolio_likes for delete
  using (auth.uid() = user_id);

create policy "transactions_select_owner"
  on public.transactions for select
  using (
    auth.uid() = professional_id or
    auth.uid() = (
      select owner_id from public.barbershops
      where id = barbershop_id
    )
  );

create policy "transactions_insert_owner"
  on public.transactions for insert
  with check (
    auth.uid() = (
      select owner_id from public.barbershops
      where id = barbershop_id
    )
  );

create policy "agreements_select_parties"
  on public.agreements for select
  using (
    auth.uid() = professional_id or
    auth.uid() = (
      select owner_id from public.barbershops
      where id = barbershop_id
    )
  );

create policy "agreements_owner_write"
  on public.agreements for all
  using (
    auth.uid() = (
      select owner_id from public.barbershops
      where id = barbershop_id
    )
  );

-- MIGRATION: 20260406000004_storage_buckets.sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,
  array['image/jpeg','image/png','image/webp']
) on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'barbershops',
  'barbershops',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']
) on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stories',
  'stories',
  true,
  52428800,
  array['video/mp4','video/webm','image/jpeg','image/png','image/webp']
) on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'portfolio',
  'portfolio',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp']
) on conflict (id) do nothing;

create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "barbershops_public_read"
  on storage.objects for select
  using (bucket_id = 'barbershops');

create policy "barbershops_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'barbershops' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "barbershops_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'barbershops' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "stories_public_read"
  on storage.objects for select
  using (bucket_id = 'stories');

create policy "stories_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'stories' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "stories_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'stories' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "portfolio_public_read"
  on storage.objects for select
  using (bucket_id = 'portfolio');

create policy "portfolio_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'portfolio' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "portfolio_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'portfolio' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- MIGRATION: 20260411000006_notifications_rls.sql
alter table public.notifications enable row level security;

create policy "notifications_select_own"
  on public.notifications
  for select
  using (auth.uid() = user_id);

create policy "notifications_update_own"
  on public.notifications
  for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "notifications_insert_service"
  on public.notifications
  for insert
  with check (true);

create table if not exists public.push_subscriptions (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth_key   text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.push_subscriptions is
  'Subscriptions Web Push por usuário. endpoint é a URL do push service.
   p256dh e auth_key são as chaves de criptografia do browser.';

create index idx_push_subs_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subs_select_own"
  on public.push_subscriptions
  for select
  using (auth.uid() = user_id);

create policy "push_subs_insert_own"
  on public.push_subscriptions
  for insert
  with check (auth.uid() = user_id);

create policy "push_subs_delete_own"
  on public.push_subscriptions
  for delete
  using (auth.uid() = user_id);

create or replace function public.trg_set_updated_at()
  returns trigger
  language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_push_subs_updated_at
  before update on public.push_subscriptions
  for each row execute function public.trg_set_updated_at();

create index if not exists idx_notifications_unread
  on public.notifications(user_id, created_at desc)
  where is_read = false;

-- MIGRATION: 20260411000006_subscriptions.sql
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_type      text NOT NULL CHECK (plan_type IN ('trial', 'mensal', 'trimestral')),
  status         text NOT NULL DEFAULT 'trial'
                   CHECK (status IN ('trial', 'active', 'expired', 'cancelled')),
  purchase_token text,
  platform       text NOT NULL DEFAULT 'web'
                   CHECK (platform IN ('android', 'web')),
  starts_at      timestamptz NOT NULL DEFAULT now(),
  ends_at        timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
  ON public.subscriptions (user_id, status);

CREATE INDEX IF NOT EXISTS idx_subscriptions_ends_at
  ON public.subscriptions (ends_at);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions: user can select own"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "subscriptions: service_role only insert"
  ON public.subscriptions FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "subscriptions: service_role only update"
  ON public.subscriptions FOR UPDATE
  USING (auth.role() = 'service_role');

-- MIGRATION: 20260413000005_location_and_legal.sql
alter table public.profiles
  add column if not exists last_lat         numeric(10,7),
  add column if not exists last_lng         numeric(10,7),
  add column if not exists last_location_at timestamptz;

create index if not exists idx_profiles_location
  on public.profiles (last_lat, last_lng)
  where last_lat is not null;

create table if not exists public.legal_consents (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  plan_type         text        not null check (plan_type in ('trial', 'mensal', 'trimestral')),

  aceitou_termos    boolean     not null default false,
  direitos_autorais boolean     not null default false,
  uso_arquivos         boolean     not null default false,
  uso_midias_internas  boolean     not null default false,
  uso_gps              boolean     not null default false,

  data_aceite       timestamptz not null default now(),
  version           integer     not null default 1,
  ip_hint           text,

  constraint legal_consents_user_unique unique (user_id)
);

create index if not exists legal_consents_user_id_idx
  on public.legal_consents (user_id);

alter table public.legal_consents enable row level security;

drop policy if exists "legal_consents: select próprio" on public.legal_consents;
create policy "legal_consents: select próprio"
  on public.legal_consents for select
  using (auth.uid() = user_id);

drop policy if exists "legal_consents: insert próprio" on public.legal_consents;
create policy "legal_consents: insert próprio"
  on public.legal_consents for insert
  with check (auth.uid() = user_id);

drop policy if exists "legal_consents: update próprio" on public.legal_consents;
create policy "legal_consents: update próprio"
  on public.legal_consents for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- MIGRATION: 20260414000006_pro_type.sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pro_type text
    CHECK (pro_type IN ('barbeiro', 'barbearia'));

COMMENT ON COLUMN public.profiles.pro_type IS
  'Subtipo do profissional. barbeiro = autônomo/funcionário; barbearia = dono/gestor de espaço. NULL para clientes.';

CREATE INDEX IF NOT EXISTS idx_profiles_pro_type
  ON public.profiles (pro_type)
  WHERE pro_type IS NOT NULL;

-- MIGRATION: 20260414000007_fix_barbershops_rls.sql
DROP POLICY IF EXISTS "barbershops_owner_write" ON public.barbershops;

CREATE POLICY "barbershops_insert_own"
  ON public.barbershops FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "barbershops_update_own"
  ON public.barbershops FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "barbershops_delete_own"
  ON public.barbershops FOR DELETE
  USING (auth.uid() = owner_id);

-- MIGRATION: 20260414000008_profiles_trigger.sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- MIGRATION: 20260414000009_cascade_on_delete.sql
ALTER TABLE public.barbershops
  DROP CONSTRAINT IF EXISTS barbershops_owner_id_fkey;

ALTER TABLE public.barbershops
  ADD CONSTRAINT barbershops_owner_id_fkey
  FOREIGN KEY (owner_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- MIGRATION: 20260414000010_barbershops_anon_select.sql
DROP POLICY IF EXISTS "barbershops_select_active" ON public.barbershops;

CREATE POLICY "barbershops_select_active"
  ON public.barbershops FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- MIGRATION: 20260414000011_fix_rls_anon_all_tables.sql
DROP POLICY IF EXISTS "barbershops_select_active" ON public.barbershops;

CREATE POLICY "barbershops_select_active"
  ON public.barbershops FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;

CREATE POLICY "profiles_select_public"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "professionals_select_active" ON public.professionals;

CREATE POLICY "professionals_select_active"
  ON public.professionals FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- MIGRATION: 20260414000012_trigger_auto_barbershop.sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, role, pro_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client'),
    COALESCE(NEW.raw_user_meta_data->>'pro_type', NULL)
  )
  ON CONFLICT (id) DO UPDATE SET
    pro_type = EXCLUDED.pro_type;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_profile_barbearia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
BEGIN

  IF NEW.pro_type = 'barbearia' THEN

    SELECT COALESCE(
      (SELECT raw_user_meta_data->>'barbearia_name'
       FROM auth.users WHERE id = NEW.id),
      NEW.full_name,
      'Minha Barbearia'
    ) INTO v_name;

    IF NOT EXISTS (
      SELECT 1 FROM public.barbershops WHERE owner_id = NEW.id
    ) THEN
      INSERT INTO public.barbershops (owner_id, name, is_active, is_open)
      VALUES (NEW.id, v_name, true, false);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_barbearia ON public.profiles;
CREATE TRIGGER on_profile_barbearia
  AFTER INSERT OR UPDATE OF pro_type ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_barbearia();

DROP POLICY IF EXISTS "barbershops_select_active"  ON public.barbershops;
DROP POLICY IF EXISTS "profiles_select_public"     ON public.profiles;

CREATE POLICY "barbershops_select_active"
  ON public.barbershops FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

CREATE POLICY "profiles_select_public"
  ON public.profiles FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

GRANT SELECT ON public.barbershops TO anon;
GRANT SELECT ON public.profiles    TO anon;

DO $$
DECLARE
  rec RECORD;
  v_name TEXT;
BEGIN
  FOR rec IN
    SELECT p.id, p.full_name, p.pro_type
    FROM public.profiles p
    WHERE p.pro_type = 'barbearia'
      AND NOT EXISTS (
        SELECT 1 FROM public.barbershops b WHERE b.owner_id = p.id
      )
  LOOP
    SELECT COALESCE(
      (SELECT u.raw_user_meta_data->>'barbearia_name'
       FROM auth.users u WHERE u.id = rec.id),
      rec.full_name,
      'Minha Barbearia'
    ) INTO v_name;

    INSERT INTO public.barbershops (owner_id, name, is_active, is_open)
    VALUES (rec.id, v_name, true, false);
  END LOOP;
END;
$$;

UPDATE public.barbershops
SET is_active = true
WHERE is_active = false;

-- MIGRATION: 20260416000001_direct_messages.sql
CREATE TABLE IF NOT EXISTS direct_messages (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  sender_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content       TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  is_read       BOOLEAN     NOT NULL DEFAULT false,
  story_ref_id  UUID        REFERENCES stories(id)  ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dm_conversation
  ON direct_messages (sender_id, recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_inbox
  ON direct_messages (recipient_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dm_story_ref
  ON direct_messages (story_ref_id) WHERE story_ref_id IS NOT NULL;

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- MIGRATION: 20260416000002_story_comments.sql
CREATE TABLE IF NOT EXISTS story_comments (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  story_id      UUID        NOT NULL REFERENCES stories(id)  ON DELETE CASCADE,
  sender_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content       TEXT        NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sc_story
  ON story_comments (story_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sc_recipient
  ON story_comments (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sc_sender
  ON story_comments (sender_id, created_at DESC);

ALTER TABLE story_comments ENABLE ROW LEVEL SECURITY;

-- MIGRATION: 20260416000003_messages_rls.sql
CREATE POLICY "dm_select_own"
  ON direct_messages FOR SELECT
  USING (
    auth.uid() = sender_id
    OR auth.uid() = recipient_id
  );

CREATE POLICY "dm_insert_own"
  ON direct_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "dm_update_read"
  ON direct_messages FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

CREATE POLICY "sc_select_authenticated"
  ON story_comments FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM stories s
      WHERE s.id = story_id
        AND s.expires_at > now()
    )
  );

CREATE POLICY "sc_insert_own"
  ON story_comments FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "sc_delete_own_or_owner"
  ON story_comments FOR DELETE
  USING (
    auth.uid() = sender_id
    OR auth.uid() = recipient_id
  );

-- MIGRATION: 20260416000004_story_cleanup_function.sql
CREATE OR REPLACE FUNCTION cleanup_expired_story_comments()
RETURNS TABLE (cleaned_count BIGINT, cleaned_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count BIGINT;
BEGIN

  DELETE FROM story_comments
  WHERE story_id IN (
    SELECT id FROM stories WHERE expires_at < now()
  );

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, now();
END;
$$;

REVOKE EXECUTE ON FUNCTION cleanup_expired_story_comments() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION cleanup_expired_story_comments() TO service_role;

CREATE OR REPLACE FUNCTION delete_expired_stories()
RETURNS TABLE (deleted_stories BIGINT, cleaned_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count BIGINT;
BEGIN

  DELETE FROM stories WHERE expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count, now();
END;
$$;

REVOKE EXECUTE ON FUNCTION delete_expired_stories() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION delete_expired_stories() TO service_role;

-- MIGRATION: 20260417000001_profiles_personal_data.sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS address    text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS gender     text
    CHECK (gender IN ('masculino', 'feminino', 'outro', 'nao_informar')),
  ADD COLUMN IF NOT EXISTS zip_code   text;

COMMENT ON COLUMN public.profiles.address    IS 'Endereço residencial do usuário';
COMMENT ON COLUMN public.profiles.birth_date IS 'Data de nascimento';
COMMENT ON COLUMN public.profiles.gender     IS 'Gênero: masculino | feminino | outro | nao_informar';
COMMENT ON COLUMN public.profiles.zip_code   IS 'CEP — usado como fallback de geolocalização quando GPS está desativado';

-- MIGRATION: 20260417000002_fix_notifications_rls.sql
DROP POLICY IF EXISTS "notifications_insert_service" ON public.notifications;

CREATE POLICY "notifications_insert_service"
  ON public.notifications
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR auth.uid() = user_id
  );

-- MIGRATION: 20260417000003_subscriptions_unique_token.sql
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_purchase_token_unique
  UNIQUE (purchase_token);

-- MIGRATION: 20260417000004_profiles_private_columns.sql
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;

CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT
    id,
    full_name,
    phone,
    avatar_path,
    role,
    pro_type,
    is_active,
    created_at,
    updated_at
  FROM public.profiles
  WHERE is_active = true;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- MIGRATION: 20260417000005_prevent_role_escalation.sql
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  IF current_setting('role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'O campo role não pode ser alterado pelo usuário.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.pro_type IS DISTINCT FROM OLD.pro_type THEN
    RAISE EXCEPTION 'O campo pro_type não pode ser alterado pelo usuário.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;

CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_escalation();

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;

CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  WITH CHECK (
    auth.uid() = id
    AND role IN ('client', 'professional')
  );

-- MIGRATION: 20260417000006_fix_trial_race_condition.sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_active_per_user
  ON public.subscriptions (user_id)
  WHERE status IN ('trial', 'active');

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
CREATE POLICY "subscriptions_select_own"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "subscriptions_insert_service" ON public.subscriptions;
CREATE POLICY "subscriptions_insert_service"
  ON public.subscriptions FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "subscriptions_update_service" ON public.subscriptions;
CREATE POLICY "subscriptions_update_service"
  ON public.subscriptions FOR UPDATE
  USING (auth.role() = 'service_role');

-- MIGRATION: 20260417000007_missing_rls_policies.sql
CREATE POLICY "story_views_select_owner"
  ON public.story_views FOR SELECT
  USING (
    auth.uid() = viewer_id
    OR auth.uid() = (
      SELECT owner_id FROM public.stories
      WHERE id = story_id
    )
  );

CREATE POLICY "story_views_insert_own"
  ON public.story_views FOR INSERT
  WITH CHECK (auth.uid() = viewer_id);

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

CREATE POLICY "attendance_insert_professional"
  ON public.attendance_sessions FOR INSERT
  WITH CHECK (auth.uid() = professional_id);

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

-- MIGRATION: 20260418000001_barbershop_interactions.sql
ALTER TABLE barbershops
  ADD COLUMN IF NOT EXISTS likes_count     INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dislikes_count  INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_score    NUMERIC(3,1) NOT NULL DEFAULT 0.0;

CREATE TABLE IF NOT EXISTS barbershop_interactions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id UUID        NOT NULL REFERENCES barbershops(id)  ON DELETE CASCADE,
  user_id       UUID        NOT NULL REFERENCES auth.users(id)   ON DELETE CASCADE,
  type          TEXT        NOT NULL CHECK (type IN ('like', 'dislike', 'favorite')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (barbershop_id, user_id, type)
);

CREATE INDEX IF NOT EXISTS idx_bi_barbershop ON barbershop_interactions (barbershop_id);
CREATE INDEX IF NOT EXISTS idx_bi_user       ON barbershop_interactions (user_id);

ALTER TABLE barbershop_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bi_select_own"
  ON barbershop_interactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "bi_insert_own"
  ON barbershop_interactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "bi_delete_own"
  ON barbershop_interactions FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION fn_update_barbershop_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_id       UUID;
  v_likes    INT;
  v_dislikes INT;
  v_score    NUMERIC(3,1);
BEGIN
  v_id := COALESCE(NEW.barbershop_id, OLD.barbershop_id);

  SELECT
    COUNT(*) FILTER (WHERE type = 'like'),
    COUNT(*) FILTER (WHERE type = 'dislike')
  INTO v_likes, v_dislikes
  FROM barbershop_interactions
  WHERE barbershop_id = v_id;

  IF (v_likes + v_dislikes) = 0 THEN
    v_score := 0.0;
  ELSE
    v_score := GREATEST(0.0, LEAST(5.0,
      ROUND(
        (v_likes::NUMERIC / (v_likes + v_dislikes)) * 5.0
        - (v_dislikes::NUMERIC * 0.1)
      , 1)
    ));
  END IF;

  UPDATE barbershops
  SET
    likes_count    = v_likes,
    dislikes_count = v_dislikes,
    rating_score   = v_score
  WHERE id = v_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_barbershop_rating ON barbershop_interactions;
CREATE TRIGGER trg_barbershop_rating
  AFTER INSERT OR DELETE ON barbershop_interactions
  FOR EACH ROW EXECUTE FUNCTION fn_update_barbershop_rating();

-- MIGRATION: 20260418000001_rls_security_hardening.sql
drop policy if exists "notifications_insert_service" on public.notifications;

create policy "notifications_insert_own"
  on public.notifications
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "notifications_delete_own" on public.notifications;

create policy "notifications_delete_own"
  on public.notifications
  for delete
  using (auth.uid() = user_id);

create policy "story_views_select_own"
  on public.story_views
  for select
  using (auth.uid() = viewer_id);

create policy "story_views_insert_own"
  on public.story_views
  for insert
  with check (auth.uid() = viewer_id);

drop policy if exists "appointments_delete_client" on public.appointments;

create policy "appointments_delete_client"
  on public.appointments
  for delete
  using (auth.uid() = client_id);

drop policy if exists "queue_insert_own" on public.queue_entries;

create policy "queue_insert_own"
  on public.queue_entries
  for insert
  with check (
    auth.uid() = client_id
    or

    auth.uid() = (
      select owner_id from public.barbershops
      where id = barbershop_id
    )
  );

drop policy if exists "push_subs_update_own" on public.push_subscriptions;

create policy "push_subs_update_own"
  on public.push_subscriptions
  for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "psl_select_public" on public.professional_shop_links;
drop policy if exists "psl_write_own"     on public.professional_shop_links;

create policy "psl_select_public"
  on public.professional_shop_links
  for select
  using (is_active = true);

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

drop policy if exists "professionals_delete_own" on public.professionals;

create policy "professionals_delete_own"
  on public.professionals
  for delete
  using (auth.uid() = id);

-- MIGRATION: 20260418000002_fix_transactions_rls.sql
DROP POLICY IF EXISTS "transactions_insert_owner" ON public.transactions;

CREATE POLICY "transactions_insert_owner"
  ON public.transactions
  FOR INSERT
  WITH CHECK (
    auth.uid() = (
      SELECT owner_id FROM public.barbershops
      WHERE id = barbershop_id
    )
  );

CREATE POLICY "transactions_update_owner"
  ON public.transactions
  FOR UPDATE
  USING (
    auth.uid() = (
      SELECT owner_id FROM public.barbershops
      WHERE id = barbershop_id
    )
  );

CREATE POLICY "transactions_delete_owner"
  ON public.transactions
  FOR DELETE
  USING (
    auth.uid() = (
      SELECT owner_id FROM public.barbershops
      WHERE id = barbershop_id
    )
  );

-- MIGRATION: 20260418000003_barbershops_role_check.sql
DROP POLICY IF EXISTS "barbershops_owner_write" ON public.barbershops;

CREATE POLICY "barbershops_owner_write"
  ON public.barbershops FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (
    auth.uid() = owner_id
    AND (
      SELECT role FROM public.profiles WHERE id = auth.uid()
    ) = 'professional'
  );

-- MIGRATION: 20260419000001_lgpd_compliance.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.data_deletion_requests (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  motivo       text        NOT NULL DEFAULT 'user_request'
    CHECK (motivo IN ('user_request', 'legal_obligation', 'consent_withdrawn')),
  status       text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,

  CONSTRAINT deletion_requests_user_unique UNIQUE (user_id)
);

COMMENT ON TABLE public.data_deletion_requests IS
  'LGPD Art. 18, VI — Pedidos de exclusão de dados pessoais. '
  'A anonimização efetiva é executada pelo backend após validação.';

CREATE INDEX IF NOT EXISTS idx_deletion_requests_status
  ON public.data_deletion_requests (status, requested_at)
  WHERE status = 'pending';

ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deletion_requests_select_own"
  ON public.data_deletion_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "deletion_requests_insert_own"
  ON public.data_deletion_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "deletion_requests_update_own"
  ON public.data_deletion_requests FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND status = 'cancelled');

CREATE TABLE IF NOT EXISTS public.data_access_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  recurso    text        NOT NULL,
  acao       text        NOT NULL
    CHECK (acao IN ('read', 'write', 'delete', 'export')),
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.data_access_log IS
  'LGPD Art. 37 — Registro de operações de tratamento de dados pessoais.';

CREATE INDEX IF NOT EXISTS idx_data_access_log_user
  ON public.data_access_log (user_id, created_at DESC);

ALTER TABLE public.data_access_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "data_access_log_select_own"
  ON public.data_access_log FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "data_access_log_insert_own"
  ON public.data_access_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.legal_consents
  DROP CONSTRAINT IF EXISTS legal_consents_plan_type_check;

ALTER TABLE public.legal_consents
  ADD CONSTRAINT legal_consents_plan_type_check
    CHECK (plan_type IN ('trial', 'mensal', 'trimestral', 'client'));

CREATE OR REPLACE FUNCTION public.anonimizar_perfil(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  UPDATE public.profiles
  SET
    full_name   = '[removido]',
    phone       = NULL,
    address     = NULL,
    birth_date  = NULL,
    gender      = NULL,
    zip_code    = NULL,
    avatar_path = NULL,
    is_active   = false,
    updated_at  = now()
  WHERE id = p_user_id;

  UPDATE public.data_deletion_requests
  SET
    status       = 'completed',
    processed_at = now()
  WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.anonimizar_perfil(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.anonimizar_perfil(uuid) TO service_role;

COMMENT ON FUNCTION public.anonimizar_perfil(uuid) IS
  'LGPD Art. 18, VI — Anonimiza dados pessoais após validação do pedido de exclusão. '
  'SECURITY DEFINER: executa apenas via service_role (backend). '
  'Nunca deve ser chamada diretamente pelo app cliente.';

-- MIGRATION: 20260420000001_profiles_public_rating.sql
CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT
    p.id,
    p.full_name,
    p.phone,
    p.avatar_path,
    p.role,
    p.pro_type,
    p.is_active,
    p.created_at,
    p.updated_at,
    coalesce(pr.rating_avg,    0.00) AS rating_avg,
    coalesce(pr.rating_count,  0)    AS rating_count
  FROM  public.profiles     p
  LEFT JOIN public.professionals pr ON pr.id = p.id
  WHERE p.is_active = true;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- MIGRATION: 20260420000002_storage_avatar_update.sql
create policy "avatars_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars' and
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- MIGRATION: 20260420000003_favorite_professionals.sql
CREATE TABLE IF NOT EXISTS public.favorite_professionals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  professional_id UUID        NOT NULL REFERENCES public.professionals(id)  ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, professional_id)
);

CREATE INDEX IF NOT EXISTS idx_fav_pro_user ON public.favorite_professionals(user_id);

ALTER TABLE public.favorite_professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fav_pro_select_own"
  ON public.favorite_professionals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "fav_pro_insert_own"
  ON public.favorite_professionals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "fav_pro_delete_own"
  ON public.favorite_professionals FOR DELETE
  USING (auth.uid() = user_id);

-- MIGRATION: 20260420000004_professional_likes.sql
CREATE TABLE IF NOT EXISTS public.professional_likes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID        NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (professional_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pro_likes_pro  ON public.professional_likes(professional_id);
CREATE INDEX IF NOT EXISTS idx_pro_likes_user ON public.professional_likes(user_id);

ALTER TABLE public.professional_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pro_likes_select_own"
  ON public.professional_likes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "pro_likes_insert_own"
  ON public.professional_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "pro_likes_delete_own"
  ON public.professional_likes FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION fn_update_professional_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.professionals
       SET rating_count = rating_count + 1
     WHERE id = NEW.professional_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.professionals
       SET rating_count = GREATEST(rating_count - 1, 0)
     WHERE id = OLD.professional_id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_professional_likes ON public.professional_likes;
CREATE TRIGGER trg_professional_likes
  AFTER INSERT OR DELETE ON public.professional_likes
  FOR EACH ROW EXECUTE FUNCTION fn_update_professional_likes_count();

-- MIGRATION: 20260421000001_favorite_professionals_ensure.sql
CREATE TABLE IF NOT EXISTS public.favorite_professionals (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id)       ON DELETE CASCADE,
  professional_id UUID        NOT NULL REFERENCES public.professionals(id)  ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, professional_id)
);

CREATE INDEX IF NOT EXISTS idx_fav_pro_user ON public.favorite_professionals(user_id);
CREATE INDEX IF NOT EXISTS idx_fav_pro_pro  ON public.favorite_professionals(professional_id);

ALTER TABLE public.favorite_professionals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fav_pro_select_own" ON public.favorite_professionals;
CREATE POLICY "fav_pro_select_own"
  ON public.favorite_professionals FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_pro_insert_own" ON public.favorite_professionals;
CREATE POLICY "fav_pro_insert_own"
  ON public.favorite_professionals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "fav_pro_delete_own" ON public.favorite_professionals;
CREATE POLICY "fav_pro_delete_own"
  ON public.favorite_professionals FOR DELETE
  USING (auth.uid() = user_id);

-- MIGRATION: 20260421000002_ensure_professionals_row.sql
INSERT INTO public.professionals (id)
SELECT p.id
FROM public.profiles p
WHERE p.role = 'professional'
  AND NOT EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.id = p.id)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_profile_professional()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'professional' THEN
    INSERT INTO public.professionals (id)
    VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_professional ON public.profiles;
CREATE TRIGGER trg_profile_professional
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_professional();

-- MIGRATION: 20260421000004_bayesian_rating_formula.sql
CREATE OR REPLACE FUNCTION fn_update_barbershop_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_id       UUID;
  v_likes    INT;
  v_dislikes INT;
  v_avg      NUMERIC;
  v_score    NUMERIC(3,1);

  PRIOR_N    CONSTANT NUMERIC := 5;
  PRIOR_MEAN CONSTANT NUMERIC := 3.0;
BEGIN
  v_id := COALESCE(NEW.barbershop_id, OLD.barbershop_id);

  SELECT
    COUNT(*) FILTER (WHERE type = 'like'),
    COUNT(*) FILTER (WHERE type = 'dislike')
  INTO v_likes, v_dislikes
  FROM barbershop_interactions
  WHERE barbershop_id = v_id;

  IF (v_likes + v_dislikes) = 0 THEN
    v_score := 0.0;
  ELSE

    v_avg := (v_likes * 5.0 + v_dislikes * 1.0) / (v_likes + v_dislikes);

    v_score := ROUND(
      (PRIOR_MEAN * PRIOR_N + v_avg * (v_likes + v_dislikes))
      / (PRIOR_N + (v_likes + v_dislikes))
    , 1);
  END IF;

  UPDATE barbershops
     SET likes_count    = v_likes,
         dislikes_count = v_dislikes,
         rating_score   = v_score
   WHERE id = v_id;

  RETURN NEW;
END;
$$;

UPDATE barbershops b
   SET rating_score = (
     WITH stats AS (
       SELECT
         COUNT(*) FILTER (WHERE type = 'like')    AS lk,
         COUNT(*) FILTER (WHERE type = 'dislike') AS dl
       FROM barbershop_interactions
       WHERE barbershop_id = b.id
     )
     SELECT CASE
       WHEN (lk + dl) = 0 THEN 0.0
       ELSE ROUND(
         (3.0 * 5 + ((lk * 5.0 + dl * 1.0) / (lk + dl)) * (lk + dl))
         / (5 + (lk + dl))
       , 1)
     END
     FROM stats
   );

-- MIGRATION: 20260421000005_public_interaction_counts.sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'barbershop_interactions'
      AND policyname = 'bi_select_public_counts'
  ) THEN
    CREATE POLICY "bi_select_public_counts"
      ON public.barbershop_interactions FOR SELECT
      USING (true);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'professional_likes'
      AND policyname = 'pl_select_public_counts'
  ) THEN
    CREATE POLICY "pl_select_public_counts"
      ON public.professional_likes FOR SELECT
      USING (true);
  END IF;
END$$;

CREATE OR REPLACE FUNCTION public.fn_update_barbershop_rating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id       UUID;
  v_likes    INT;
  v_dislikes INT;
  v_avg      NUMERIC;
  v_score    NUMERIC(3,1);

  PRIOR_N    CONSTANT NUMERIC := 5;
  PRIOR_MEAN CONSTANT NUMERIC := 3.0;
BEGIN
  v_id := COALESCE(NEW.barbershop_id, OLD.barbershop_id);

  SELECT
    COUNT(*) FILTER (WHERE type = 'like'),
    COUNT(*) FILTER (WHERE type = 'dislike')
  INTO v_likes, v_dislikes
  FROM public.barbershop_interactions
  WHERE barbershop_id = v_id;

  IF (v_likes + v_dislikes) = 0 THEN
    v_score := 0.0;
  ELSE

    v_avg := (v_likes * 5.0 + v_dislikes * 1.0) / (v_likes + v_dislikes);

    v_score := ROUND(
      (PRIOR_MEAN * PRIOR_N + v_avg * (v_likes + v_dislikes))
      / (PRIOR_N + (v_likes + v_dislikes))
    , 1);
  END IF;

  UPDATE public.barbershops
  SET
    likes_count    = v_likes,
    dislikes_count = v_dislikes,
    rating_score   = v_score
  WHERE id = v_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_barbershop_rating ON public.barbershop_interactions;
CREATE TRIGGER trg_barbershop_rating
  AFTER INSERT OR DELETE ON public.barbershop_interactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_barbershop_rating();

CREATE OR REPLACE FUNCTION public.fn_update_professional_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_id    UUID;
  v_count INT;
BEGIN
  v_id := COALESCE(NEW.professional_id, OLD.professional_id);

  SELECT COUNT(*) INTO v_count
  FROM public.professional_likes
  WHERE professional_id = v_id;

  UPDATE public.professionals
  SET rating_count = v_count
  WHERE id = v_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_professional_likes ON public.professional_likes;
CREATE TRIGGER trg_professional_likes
  AFTER INSERT OR DELETE ON public.professional_likes
  FOR EACH ROW EXECUTE FUNCTION public.fn_update_professional_likes_count();

UPDATE public.barbershops b
SET
  likes_count    = COALESCE((
    SELECT COUNT(*) FROM public.barbershop_interactions
    WHERE barbershop_id = b.id AND type = 'like'
  ), 0),
  dislikes_count = COALESCE((
    SELECT COUNT(*) FROM public.barbershop_interactions
    WHERE barbershop_id = b.id AND type = 'dislike'
  ), 0);

UPDATE public.professionals p
SET rating_count = COALESCE((
  SELECT COUNT(*) FROM public.professional_likes
  WHERE professional_id = p.id
), 0);

UPDATE public.barbershops b
SET rating_score = (
  SELECT CASE
    WHEN (lk + dl) = 0 THEN 0.0
    ELSE ROUND(
      (3.0 * 5 + ((lk * 5.0 + dl * 1.0) / (lk + dl)) * (lk + dl))
      / (5.0 + (lk + dl))
    , 1)
  END
  FROM (
    SELECT b.likes_count AS lk, b.dislikes_count AS dl
  ) sub
);

-- MIGRATION: 20260422000001_owner_pro_link.sql
CREATE OR REPLACE FUNCTION public.handle_profile_barbearia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name    TEXT;
  v_shop_id UUID;
BEGIN
  IF NEW.pro_type = 'barbearia' THEN
    SELECT COALESCE(
      (SELECT raw_user_meta_data->>'barbearia_name'
       FROM auth.users WHERE id = NEW.id),
      NEW.full_name,
      'Minha Barbearia'
    ) INTO v_name;

    INSERT INTO public.professionals (id)
    VALUES (NEW.id)
    ON CONFLICT (id) DO NOTHING;

    IF NOT EXISTS (SELECT 1 FROM public.barbershops WHERE owner_id = NEW.id) THEN
      INSERT INTO public.barbershops (owner_id, name, is_active, is_open)
      VALUES (NEW.id, v_name, true, false)
      RETURNING id INTO v_shop_id;
    ELSE
      SELECT id INTO v_shop_id
      FROM public.barbershops
      WHERE owner_id = NEW.id
      LIMIT 1;
    END IF;

    IF v_shop_id IS NOT NULL THEN
      INSERT INTO public.professional_shop_links (professional_id, barbershop_id, is_active)
      VALUES (NEW.id, v_shop_id, true)
      ON CONFLICT (professional_id, barbershop_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_barbearia ON public.profiles;
CREATE TRIGGER on_profile_barbearia
  AFTER INSERT OR UPDATE OF pro_type ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_profile_barbearia();

INSERT INTO public.professionals (id)
SELECT p.id
FROM public.profiles p
WHERE p.role = 'professional'
  AND p.pro_type = 'barbearia'
  AND NOT EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.id = p.id)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.professional_shop_links (professional_id, barbershop_id, is_active)
SELECT b.owner_id, b.id, true
FROM public.barbershops b
JOIN public.profiles p ON p.id = b.owner_id
WHERE p.pro_type = 'barbearia'
  AND NOT EXISTS (
    SELECT 1 FROM public.professional_shop_links psl
    WHERE psl.professional_id = b.owner_id
      AND psl.barbershop_id   = b.id
  )
ON CONFLICT (professional_id, barbershop_id) DO NOTHING;

-- MIGRATION: 20260423000001_barbershops_extra_fields.sql
ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS neighborhood  TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp      TEXT,
  ADD COLUMN IF NOT EXISTS founded_year  SMALLINT;

-- MIGRATION: 20260423000002_barbershops_font_key.sql
ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS font_key TEXT;

-- MIGRATION: 20260424000001_storage_barbershops_fix.sql
drop policy if exists "barbershops_owner_write"  on storage.objects;
drop policy if exists "barbershops_owner_delete" on storage.objects;
drop policy if exists "barbershops_owner_update" on storage.objects;

create policy "barbershops_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'barbershops' and
    exists (
      select 1
        from public.barbershops b
       where b.id::text = (storage.foldername(name))[1]
         and b.owner_id = auth.uid()
    )
  );

create policy "barbershops_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'barbershops' and
    exists (
      select 1
        from public.barbershops b
       where b.id::text = (storage.foldername(name))[1]
         and b.owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'barbershops' and
    exists (
      select 1
        from public.barbershops b
       where b.id::text = (storage.foldername(name))[1]
         and b.owner_id = auth.uid()
    )
  );

create policy "barbershops_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'barbershops' and
    exists (
      select 1
        from public.barbershops b
       where b.id::text = (storage.foldername(name))[1]
         and b.owner_id = auth.uid()
    )
  );

-- MIGRATION: 20260424000002_storage_barbershops_secdef.sql
create or replace function public.storage_is_barbershop_owner(shop_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
      from public.barbershops
     where id::text = shop_id
       and owner_id = auth.uid()
  );
$$;

drop policy if exists "barbershops_owner_write"  on storage.objects;
drop policy if exists "barbershops_owner_update" on storage.objects;
drop policy if exists "barbershops_owner_delete" on storage.objects;

create policy "barbershops_owner_write"
  on storage.objects for insert
  with check (
    bucket_id = 'barbershops' and
    public.storage_is_barbershop_owner((storage.foldername(name))[1])
  );

create policy "barbershops_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'barbershops' and
    public.storage_is_barbershop_owner((storage.foldername(name))[1])
  )
  with check (
    bucket_id = 'barbershops' and
    public.storage_is_barbershop_owner((storage.foldername(name))[1])
  );

create policy "barbershops_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'barbershops' and
    public.storage_is_barbershop_owner((storage.foldername(name))[1])
  );

-- MIGRATION: 20260427000001_create_refresh_tokens.sql
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  device_hint TEXT,
  ip_address  INET
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
  ON refresh_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash
  ON refresh_tokens(token_hash);

ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION limpar_refresh_tokens_expirados()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM refresh_tokens
  WHERE expires_at < NOW() - INTERVAL '30 days';
$$;

-- MIGRATION: 20260427000002_file_download_events.sql
create table if not exists public.file_download_events (
  id            uuid        primary key default uuid_generate_v4(),
  file_id       text        not null,
  downloaded_at timestamptz not null default now()
);

comment on table public.file_download_events is
  'Registro de eventos de download por arquivo. '
  'Alimenta o ReplicationService para decisão de estratégia P2P/R2/BOTH.';

comment on column public.file_download_events.file_id is
  'Identificador do arquivo. Pode ser UUID de media_files ou path P2P — sem FK intencional.';

comment on column public.file_download_events.downloaded_at is
  'Timestamp UTC do evento de download. Usado para filtro por janela de tempo.';

create index idx_fde_file_window
  on public.file_download_events(file_id, downloaded_at desc);

alter table public.file_download_events enable row level security;

-- MIGRATION: 20260428000001_services_image_path.sql
alter table public.services
  add column if not exists image_path text default null;

comment on column public.services.image_path is
  'Path no bucket barbershops para a imagem do serviço (ex: <uuid>/services/<file>.webp).';

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

-- MIGRATION: 20260428000002_media_metadata.sql
create table if not exists public.media_files (
  id            uuid        primary key default uuid_generate_v4(),
  owner_id      uuid        not null references auth.users(id) on delete cascade,
  contexto      text        not null,
  path          text        not null unique,
  public_url    text        not null,
  content_type  text,
  tamanho_bytes int,
  metadata      jsonb,
  created_at    timestamptz not null default now()
);

comment on table public.media_files is
  'Metadados de mídia armazenada no Cloudflare R2. '
  'O arquivo em si NÃO está no Supabase — apenas path e URL pública.';

comment on column public.media_files.contexto   is 'Contexto de uso: stories | avatars | services | portfolio';
comment on column public.media_files.path        is 'Chave no bucket R2 (ex: services/uuid/uuid.webp)';
comment on column public.media_files.public_url  is 'URL pública no R2 CDN (via R2_PUBLIC_URL)';
comment on column public.media_files.metadata    is 'Dados extras opcionais (barbershopId, title, etc.)';

alter table public.media_files
  add constraint media_files_contexto_check
  check (contexto in ('stories', 'avatars', 'services', 'portfolio'));

create index idx_media_files_owner    on public.media_files(owner_id);
create index idx_media_files_contexto on public.media_files(owner_id, contexto);
create index idx_media_files_created  on public.media_files(created_at desc);

alter table public.media_files enable row level security;

create policy "media_files_owner_select"
  on public.media_files for select
  using (owner_id = auth.uid());

create policy "media_files_service_insert"
  on public.media_files for insert
  with check (false);

create policy "media_files_owner_delete"
  on public.media_files for delete
  using (owner_id = auth.uid());

-- MIGRATION: 20260428121847_create_storage_buckets.sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-images',
  'media-images',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "media-images: leitura pública"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'media-images');

CREATE POLICY "media-images: upload pelo dono"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'media-images' AND
    auth.uid()::text = split_part(name, '/', 2)
  );

CREATE POLICY "media-images: atualização pelo dono"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'media-images' AND
    auth.uid()::text = split_part(name, '/', 2)
  );

CREATE POLICY "media-images: deleção pelo dono"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'media-images' AND
    auth.uid()::text = split_part(name, '/', 2)
  );

-- MIGRATION: 20260428130605_create_barbershop_bucket.sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-barbershop',
  'media-barbershop',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "media-barbershop: leitura pública"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media-barbershop');

CREATE POLICY "media-barbershop: upload pelo dono"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'media-barbershop'
    AND auth.role() = 'authenticated'
    AND auth.uid()::text = split_part(name, '/', 2)
  );

CREATE POLICY "media-barbershop: atualização pelo dono"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'media-barbershop'
    AND auth.uid()::text = split_part(name, '/', 2)
  );

CREATE POLICY "media-barbershop: deleção pelo dono"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'media-barbershop'
    AND auth.uid()::text = split_part(name, '/', 2)
  );

-- MIGRATION: 20260428130606_create_p2p_peers.sql
CREATE TABLE IF NOT EXISTS public.p2p_peers (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id   TEXT        NOT NULL,
  peer_id    UUID        NOT NULL,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  region     TEXT        NOT NULL DEFAULT '',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS p2p_peers_media_expires
  ON public.p2p_peers (media_id, expires_at);

CREATE INDEX IF NOT EXISTS p2p_peers_user_expires
  ON public.p2p_peers (user_id, expires_at);

ALTER TABLE public.p2p_peers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "p2p_peers: insert pelo usuário autenticado"
  ON public.p2p_peers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "p2p_peers: select por usuários autenticados"
  ON public.p2p_peers FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "p2p_peers: delete pelo dono"
  ON public.p2p_peers FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "p2p_peers: update pelo dono"
  ON public.p2p_peers FOR UPDATE
  USING (auth.uid() = user_id);

COMMENT ON TABLE  public.p2p_peers IS 'Peers WebRTC disponíveis para redistribuição de mídia (TTL: 5 min)';
COMMENT ON COLUMN public.p2p_peers.media_id   IS 'ID do arquivo em cache no IndexedDB do peer';
COMMENT ON COLUMN public.p2p_peers.peer_id    IS 'UUID de sessão P2P gerado pelo frontend';
COMMENT ON COLUMN public.p2p_peers.user_id    IS 'Usuário dono deste anúncio';
COMMENT ON COLUMN public.p2p_peers.region     IS 'Região geográfica (opcional) para preferência local';
COMMENT ON COLUMN public.p2p_peers.expires_at IS 'Timestamp de expiração do anúncio (5 min após announce)';

-- MIGRATION: 20260430000001_barbershop_close_reason.sql
ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS close_reason TEXT DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.fn_clear_close_reason()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.is_open = TRUE AND OLD.is_open = FALSE THEN
    NEW.close_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_close_reason ON public.barbershops;
CREATE TRIGGER trg_clear_close_reason
  BEFORE UPDATE ON public.barbershops
  FOR EACH ROW EXECUTE FUNCTION public.fn_clear_close_reason();

-- MIGRATION: 20260501000001_barbershops_realtime.sql
ALTER PUBLICATION supabase_realtime ADD TABLE barbershops;

-- MIGRATION: 20260503000001_profiles_email.sql
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text;

UPDATE public.profiles p
SET    email = u.email
FROM   auth.users u
WHERE  p.id = u.id;

CREATE INDEX IF NOT EXISTS idx_profiles_email
  ON public.profiles (email);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, role, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client'),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET    email = NEW.email
  WHERE  id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;

CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email();

-- MIGRATION: 20260503000002_modal_rpc_functions.sql
CREATE OR REPLACE FUNCTION public.buscar_perfis_por_nome(
  p_termo  TEXT,
  p_limite INT DEFAULT 20
)
RETURNS TABLE (
  id          UUID,
  full_name   TEXT,
  avatar_path TEXT,
  updated_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  p_limite := GREATEST(1, LEAST(p_limite, 50));

  RETURN QUERY
    SELECT
      p.id,
      p.full_name,
      p.avatar_path,
      p.updated_at
    FROM public.profiles p
    WHERE p.full_name ILIKE '%' || p_termo || '%'
    ORDER BY p.full_name
    LIMIT p_limite;
END;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_perfis_por_nome(TEXT, INT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_clientes_favoritos_modal(
  p_barbershop_id   UUID,
  p_professional_id UUID
)
RETURNS TABLE (
  id          UUID,
  full_name   TEXT,
  email       TEXT,
  avatar_path TEXT,
  updated_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT DISTINCT
      p.id,
      p.full_name,
      p.email,
      p.avatar_path,
      p.updated_at
    FROM public.profiles p
    WHERE p.id IN (

      SELECT bi.user_id
      FROM   public.barbershop_interactions bi
      WHERE  bi.barbershop_id = p_barbershop_id
        AND  bi.type = 'favorite'
      UNION

      SELECT fp.user_id
      FROM   public.favorite_professionals fp
      WHERE  fp.professional_id = p_professional_id
    )
    ORDER BY p.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_clientes_favoritos_modal(UUID, UUID) TO authenticated;

-- MIGRATION: 20260503000003_search_indexes_and_rpc.sql
CREATE INDEX IF NOT EXISTS idx_profiles_full_name_lower
  ON public.profiles (LOWER(full_name));

CREATE INDEX IF NOT EXISTS idx_profiles_email_lower
  ON public.profiles (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_profiles_fts
  ON public.profiles
  USING GIN (
    to_tsvector(
      'portuguese',
      COALESCE(full_name, '') || ' ' || COALESCE(email, '')
    )
  );

CREATE INDEX IF NOT EXISTS idx_barbershops_name_lower
  ON public.barbershops (LOWER(name));

CREATE OR REPLACE FUNCTION public.search_users(
  p_term   TEXT    DEFAULT NULL,
  p_role   TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id              UUID,
  full_name       TEXT,
  email           TEXT,
  role            TEXT,
  avatar_path     TEXT,
  barbershop_name TEXT,
  updated_at      TIMESTAMPTZ,
  total_count     BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.email,
    p.role,
    p.avatar_path,
    b.name  AS barbershop_name,
    p.updated_at,

    COUNT(*) OVER() AS total_count
  FROM public.profiles p
  LEFT JOIN public.barbershops b
    ON  b.owner_id  = p.id
    AND b.is_active = TRUE
  WHERE

    (
      p_term IS NULL
      OR p.full_name ILIKE '%' || p_term || '%'
      OR p.email     ILIKE '%' || p_term || '%'
      OR b.name      ILIKE '%' || p_term || '%'
    )

    AND (p_role IS NULL OR p.role = p_role)

    AND p.is_active = TRUE
  ORDER BY

    CASE WHEN p_term IS NOT NULL AND p.full_name ILIKE p_term || '%' THEN 0 ELSE 1 END,
    p.full_name
  LIMIT  GREATEST(1, LEAST(p_limit,  50))
  OFFSET GREATEST(0, p_offset);
$$;

GRANT EXECUTE ON FUNCTION public.search_users(TEXT, TEXT, INTEGER, INTEGER)
  TO authenticated;

-- MIGRATION: 20260503000004_allow_pro_type_promotion.sql
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  IF current_setting('role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'O campo role não pode ser alterado pelo usuário.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.pro_type IS DISTINCT FROM OLD.pro_type THEN
    IF OLD.pro_type = 'barbeiro'
       AND NEW.pro_type = 'barbearia'
       AND EXISTS (
         SELECT 1 FROM public.barbershops
         WHERE owner_id = NEW.id AND is_active = true
         LIMIT 1
       )
    THEN

      NULL;
    ELSE
      RAISE EXCEPTION 'O campo pro_type não pode ser alterado pelo usuário.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- MIGRATION: 20260503000005_fix_handle_new_user_pro_type.sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone, role, pro_type, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', NULL),
    COALESCE(NEW.raw_user_meta_data->>'role', 'client'),
    COALESCE(NEW.raw_user_meta_data->>'pro_type', NULL),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET
    pro_type = EXCLUDED.pro_type,
    email    = EXCLUDED.email;
  RETURN NEW;
END;
$$;

-- MIGRATION: 20260503000006_subscriptions_price.sql
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) NOT NULL DEFAULT 0.00;

COMMENT ON COLUMN public.subscriptions.price IS
  'Valor cobrado pelo plano (0.00 para planos free/trial/administrativos).';

-- MIGRATION: 20260505000001_queue_entries_guest_name.sql
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS guest_name TEXT;

COMMENT ON COLUMN public.queue_entries.guest_name IS
  'Nome avulso informado pelo barbeiro para cliente sem cadastro (walk-in).';

-- MIGRATION: 20260505000002_fix_clientes_favoritos_modal.sql
CREATE OR REPLACE FUNCTION public.get_clientes_favoritos_modal(
  p_barbershop_id   UUID,
  p_professional_id UUID
)
RETURNS TABLE (
  id          UUID,
  full_name   TEXT,
  email       TEXT,
  avatar_path TEXT,
  updated_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT DISTINCT
      p.id,
      p.full_name,
      p.email,
      p.avatar_path,
      p.updated_at
    FROM public.profiles p
    WHERE p.id IN (

      SELECT fp.user_id
      FROM   public.favorite_professionals fp
      WHERE  fp.professional_id = p_professional_id
    )
    ORDER BY p.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_clientes_favoritos_modal(UUID, UUID) TO authenticated;

-- MIGRATION: 20260505000003_indexes_ordering.sql
CREATE INDEX IF NOT EXISTS idx_profiles_full_name
  ON public.profiles (full_name);

CREATE INDEX IF NOT EXISTS idx_profiles_full_name_lower
  ON public.profiles (lower(full_name));

CREATE INDEX IF NOT EXISTS idx_barbershops_name
  ON public.barbershops (name);

-- MIGRATION: 20260505000005_notify_all_queue_on_done.sql
CREATE OR REPLACE FUNCTION public.fn_notify_queue_clients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec           RECORD;
  posicao_rank  INT := 0;
BEGIN

  IF NEW.status IS DISTINCT FROM 'done' THEN
    RETURN NEW;
  END IF;

  FOR rec IN
    SELECT
      client_id,
      position,
      ROW_NUMBER() OVER (ORDER BY position ASC) AS rank
    FROM public.queue_entries
    WHERE barbershop_id = NEW.barbershop_id
      AND status        = 'waiting'
      AND client_id     IS NOT NULL
  LOOP
    posicao_rank := rec.rank;

    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      body,
      data,
      is_read,
      created_at
    ) VALUES (
      rec.client_id,
      'queue_update',
      'Fila avançou',
      CASE
        WHEN posicao_rank = 1 THEN 'Você é o próximo! Dirija-se à cadeira.'
        ELSE 'Você está na posição ' || posicao_rank || ' da fila.'
      END,
      jsonb_build_object(
        'position',      posicao_rank,
        'barbershop_id', NEW.barbershop_id,
        'is_next',       (posicao_rank = 1)
      ),
      false,
      NOW()
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_queue_on_done ON public.queue_entries;

CREATE TRIGGER trg_notify_queue_on_done
  AFTER UPDATE OF status ON public.queue_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_notify_queue_clients();

CREATE INDEX IF NOT EXISTS idx_queue_entries_shop_waiting
  ON public.queue_entries (barbershop_id, status, position)
  WHERE status = 'waiting';

-- MIGRATION: 20260505000006_fix_rpc_clientes_favoritos_sql.sql
CREATE OR REPLACE FUNCTION public.get_clientes_favoritos_modal(
  p_barbershop_id   UUID,
  p_professional_id UUID
)
RETURNS TABLE (
  id          UUID,
  full_name   TEXT,
  email       TEXT,
  avatar_path TEXT,
  updated_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    p.id          AS id,
    p.full_name   AS full_name,
    p.email       AS email,
    p.avatar_path AS avatar_path,
    p.updated_at  AS updated_at
  FROM  public.profiles               AS p
  INNER JOIN public.favorite_professionals AS fp
    ON  fp.user_id         = p.id
    AND fp.professional_id = p_professional_id
  ORDER BY p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_clientes_favoritos_modal(UUID, UUID) TO authenticated;

-- MIGRATION: 20260506000001_queue_entry_services.sql
create table if not exists public.queue_entry_services (
  id             uuid        primary key default uuid_generate_v4(),
  queue_entry_id uuid        not null references public.queue_entries(id) on delete cascade,
  barbershop_id  uuid        not null references public.barbershops(id)   on delete cascade,
  service_id     uuid        not null references public.services(id)      on delete cascade,
  created_at     timestamptz not null default now(),

  unique (queue_entry_id, service_id)
);

comment on table public.queue_entry_services is
  'Serviços escolhidos pelo cliente ao entrar na fila. Apagados em cascata com a entrada.';

create index idx_qes_entry   on public.queue_entry_services(queue_entry_id);
create index idx_qes_service on public.queue_entry_services(service_id);

alter table public.queue_entry_services enable row level security;

create policy "qes_select_public"
  on public.queue_entry_services for select
  using (true);

create policy "qes_insert"
  on public.queue_entry_services for insert
  with check (
    auth.uid() = (
      select client_id from public.queue_entries
      where id = queue_entry_id
    )
    or
    auth.uid() = (
      select owner_id from public.barbershops
      where id = barbershop_id
    )
  );

create policy "qes_delete"
  on public.queue_entry_services for delete
  using (
    auth.uid() = (
      select client_id from public.queue_entries
      where id = queue_entry_id
    )
    or
    auth.uid() = (
      select owner_id from public.barbershops
      where id = barbershop_id
    )
  );

alter publication supabase_realtime add table public.queue_entry_services;

-- MIGRATION: 20260507000001_fix_profiles_rls_queue_access.sql
CREATE POLICY "profiles_select_active_for_queue"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (is_active = true);

-- MIGRATION: 20260507000002_restaurar_favoritos_barbearia_modal.sql
CREATE OR REPLACE FUNCTION public.get_clientes_favoritos_modal(
  p_barbershop_id   UUID,
  p_professional_id UUID
)
RETURNS TABLE (
  id          UUID,
  full_name   TEXT,
  email       TEXT,
  avatar_path TEXT,
  updated_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    p.id          AS id,
    p.full_name   AS full_name,
    p.email       AS email,
    p.avatar_path AS avatar_path,
    p.updated_at  AS updated_at
  FROM public.profiles AS p
  WHERE p.id IN (

    SELECT bi.user_id
    FROM   public.barbershop_interactions AS bi
    WHERE  bi.barbershop_id = p_barbershop_id
      AND  bi.type = 'favorite'
    UNION

    SELECT fp.user_id
    FROM   public.favorite_professionals AS fp
    WHERE  fp.professional_id = p_professional_id
  )
  ORDER BY p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_clientes_favoritos_modal(UUID, UUID) TO authenticated;

-- MIGRATION: 20260507000003_queue_client_confirmation.sql
ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS client_confirmed TEXT
    CHECK (client_confirmed IN ('yes', 'no_waiting', 'absent')),
  ADD COLUMN IF NOT EXISTS first_no_at TIMESTAMPTZ;

COMMENT ON COLUMN public.queue_entries.client_confirmed IS
  'Estado de confirmação de presença do cliente na cadeira: yes | no_waiting | absent';

COMMENT ON COLUMN public.queue_entries.first_no_at IS
  'Timestamp do primeiro "Não" — base para cálculo do grace period de 5 min';

CREATE OR REPLACE FUNCTION public.confirmar_presenca_cliente(
  p_entry_id   UUID,
  p_confirmado BOOLEAN,
  p_grace_used BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry   RECORD;
  v_profId  UUID;
BEGIN

  SELECT qe.id, qe.professional_id, qe.barbershop_id,
         p.full_name AS client_name
  INTO v_entry
  FROM public.queue_entries qe
  LEFT JOIN public.profiles p ON p.id = qe.client_id
  WHERE qe.id        = p_entry_id
    AND qe.client_id = auth.uid()
    AND qe.status    = 'in_service'
  LIMIT 1;

  IF v_entry IS NULL THEN
    RETURN;
  END IF;

  v_profId := v_entry.professional_id;

  IF p_confirmado THEN

    UPDATE public.queue_entries
    SET client_confirmed = 'yes',
        first_no_at      = NULL
    WHERE id = p_entry_id;

  ELSIF NOT p_grace_used THEN

    UPDATE public.queue_entries
    SET client_confirmed = 'no_waiting',
        first_no_at      = NOW()
    WHERE id = p_entry_id;

  ELSE

    UPDATE public.queue_entries
    SET client_confirmed = 'absent'
    WHERE id = p_entry_id;

    IF v_profId IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        data,
        is_read,
        created_at
      ) VALUES (
        v_profId,
        'client_absent',
        'Cliente ausente 🔔',
        COALESCE(v_entry.client_name, 'Cliente') || ' não confirmou presença na cadeira.',
        jsonb_build_object(
          'client_absent',  true,
          'entry_id',       p_entry_id,
          'client_name',    COALESCE(v_entry.client_name, 'Cliente'),
          'barbershop_id',  v_entry.barbershop_id
        ),
        false,
        NOW()
      );
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_presenca_cliente(UUID, BOOLEAN, BOOLEAN)
  TO authenticated;

-- MIGRATION: 20260507000004_notify_barber_on_first_no.sql
CREATE OR REPLACE FUNCTION public.confirmar_presenca_cliente(
  p_entry_id   UUID,
  p_confirmado BOOLEAN,
  p_grace_used BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry   RECORD;
  v_profId  UUID;
BEGIN

  SELECT qe.id, qe.professional_id, qe.barbershop_id,
         p.full_name AS client_name
  INTO v_entry
  FROM public.queue_entries qe
  LEFT JOIN public.profiles p ON p.id = qe.client_id
  WHERE qe.id        = p_entry_id
    AND qe.client_id = auth.uid()
    AND qe.status    = 'in_service'
  LIMIT 1;

  IF v_entry IS NULL THEN
    RETURN;
  END IF;

  v_profId := v_entry.professional_id;

  IF p_confirmado THEN

    UPDATE public.queue_entries
    SET client_confirmed = 'yes',
        first_no_at      = NULL
    WHERE id = p_entry_id;

  ELSIF NOT p_grace_used THEN

    UPDATE public.queue_entries
    SET client_confirmed = 'no_waiting',
        first_no_at      = NOW()
    WHERE id = p_entry_id;

    IF v_profId IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        data,
        is_read,
        created_at
      ) VALUES (
        v_profId,
        'client_not_seated',
        'Cliente ainda não está pronto',
        COALESCE(v_entry.client_name, 'Cliente') || ' avisou que ainda não está sentado na cadeira.',
        jsonb_build_object(
          'client_not_seated', true,
          'entry_id',          p_entry_id,
          'client_name',       COALESCE(v_entry.client_name, 'Cliente'),
          'barbershop_id',     v_entry.barbershop_id
        ),
        false,
        NOW()
      );
    END IF;

  ELSE

    UPDATE public.queue_entries
    SET client_confirmed = 'absent'
    WHERE id = p_entry_id;

    IF v_profId IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        body,
        data,
        is_read,
        created_at
      ) VALUES (
        v_profId,
        'client_absent',
        'Cliente ausente 🔔',
        COALESCE(v_entry.client_name, 'Cliente') || ' não confirmou presença na cadeira.',
        jsonb_build_object(
          'client_absent',  true,
          'entry_id',       p_entry_id,
          'client_name',    COALESCE(v_entry.client_name, 'Cliente'),
          'barbershop_id',  v_entry.barbershop_id
        ),
        false,
        NOW()
      );
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_presenca_cliente(UUID, BOOLEAN, BOOLEAN)
  TO authenticated;

-- MIGRATION: 20260507000005_notifications_realtime.sql
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- MIGRATION: 20260509000001_push_v2.sql
alter table public.push_subscriptions
  add column if not exists device_id     text,
  add column if not exists app_id        text check (app_id in ('cliente', 'profissional')),
  add column if not exists is_valid      boolean not null default true,
  add column if not exists last_used_at  timestamptz not null default now();

comment on column public.push_subscriptions.device_id    is 'UUID persistido em localStorage (bf_device_id). Identifica o dispositivo.';
comment on column public.push_subscriptions.app_id       is 'App que gerou a subscription: cliente | profissional.';
comment on column public.push_subscriptions.is_valid     is 'false quando o push service retorna 410 ou 404 (subscription expirada ou inválida).';
comment on column public.push_subscriptions.last_used_at is 'Timestamp do último envio bem-sucedido para esta subscription.';

create index if not exists idx_push_subs_send
  on public.push_subscriptions (user_id, app_id, is_valid)
  where is_valid = true;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'push_subscriptions'
      and policyname = 'push_subs_update_own'
  ) then
    execute $policy$
      create policy "push_subs_update_own"
        on public.push_subscriptions
        for update
        using     (auth.uid() = user_id)
        with check (auth.uid() = user_id)
    $policy$;
  end if;
end $$;

-- MIGRATION: 20260511000001_push_expiration.sql
alter table public.push_subscriptions
  add column if not exists expiration_time timestamptz null;

comment on column public.push_subscriptions.expiration_time is
  'Data de expiração da subscription (PushSubscription.expirationTime em UTC). null = sem expiração definida.';

create index if not exists idx_push_subs_expiration
  on public.push_subscriptions (expiration_time)
  where expiration_time is not null;

-- MIGRATION: 20260511000002_transactions_financeiro.sql
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS queue_entry_id uuid
    REFERENCES public.queue_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_queue_entry
  ON public.transactions(queue_entry_id);

DROP POLICY IF EXISTS "transactions_insert_owner"  ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_member" ON public.transactions;

CREATE POLICY "transactions_insert_member"
  ON public.transactions
  FOR INSERT
  WITH CHECK (

    auth.uid() = (
      SELECT owner_id FROM public.barbershops WHERE id = barbershop_id
    )
    OR

    (
      auth.uid() = professional_id
      AND professional_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.professional_shop_links psl
        WHERE psl.professional_id = auth.uid()
          AND psl.barbershop_id   = transactions.barbershop_id
          AND psl.is_active       = true
      )
    )
  );

-- MIGRATION: 20260512000001_client_at_shop_presenca.sql
ALTER TABLE public.queue_entries
  DROP CONSTRAINT IF EXISTS queue_entries_client_confirmed_check;

ALTER TABLE public.queue_entries
  ADD CONSTRAINT queue_entries_client_confirmed_check
  CHECK (client_confirmed IN ('yes', 'no_waiting', 'absent', 'arriving'));

COMMENT ON COLUMN public.queue_entries.client_confirmed IS
  'Estados: yes=presente(in_service) | no_waiting=ausente(in_service) | absent=grace expirado(in_service) | arriving=a caminho(waiting)';

-- MIGRATION: 20260512000001_transactions_gross_amount.sql
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS gross_amount numeric(10,2);

UPDATE public.transactions
SET gross_amount = amount
WHERE gross_amount IS NULL;

CREATE OR REPLACE FUNCTION public.set_transaction_gross_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  NEW.gross_amount := COALESCE(NEW.gross_amount, NEW.amount);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_transaction_gross_amount ON public.transactions;
CREATE TRIGGER trg_set_transaction_gross_amount
  BEFORE INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_transaction_gross_amount();

CREATE OR REPLACE FUNCTION public.aplicar_desconto_metodo(
  p_barbershop_id uuid,
  p_metodo        text,
  p_de            timestamptz,
  p_ate           timestamptz,
  p_porcentagem   numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  IF p_porcentagem <= 0 OR p_porcentagem >= 100 THEN
    RAISE EXCEPTION 'porcentagem deve ser > 0 e < 100';
  END IF;

  IF p_metodo NOT IN ('credito', 'debito', 'cartao') THEN
    RAISE EXCEPTION 'metodo inválido: %', p_metodo;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.barbershops
    WHERE id = p_barbershop_id AND owner_id = auth.uid()
    UNION ALL
    SELECT 1 FROM public.professional_shop_links
    WHERE barbershop_id = p_barbershop_id
      AND professional_id = auth.uid()
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  UPDATE public.transactions
  SET amount = ROUND(COALESCE(gross_amount, amount) * (1 - p_porcentagem / 100.0), 2)
  WHERE barbershop_id = p_barbershop_id
    AND payment_method = p_metodo
    AND type   = 'revenue'
    AND status = 'paid'
    AND paid_at BETWEEN p_de AND p_ate;
END;
$$;

GRANT EXECUTE ON FUNCTION public.aplicar_desconto_metodo(uuid, text, timestamptz, timestamptz, numeric)
  TO authenticated;

-- MIGRATION: 20260513000001_notificar_barbeiro_rpc.sql
DROP POLICY IF EXISTS "notifications_insert_service" ON public.notifications;

CREATE POLICY "notifications_insert_service"
  ON public.notifications
  FOR INSERT
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.notificar_barbeiro_chegada(
  p_professional_id UUID,
  p_type            TEXT,
  p_title           TEXT,
  p_body            TEXT,
  p_data            JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_professional_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.notifications (
    user_id, type, title, body, data, is_read, created_at
  ) VALUES (
    p_professional_id,
    p_type,
    p_title,
    COALESCE(p_body, ''),
    COALESCE(p_data, '{}'),
    false,
    NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.notificar_barbeiro_chegada(UUID, TEXT, TEXT, TEXT, JSONB)
  TO authenticated;

-- MIGRATION: 20260513000002_block_queue_closed_barbershop.sql
CREATE OR REPLACE FUNCTION public.fn_check_barbershop_open_on_queue()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_is_open BOOLEAN;
BEGIN
  SELECT is_open
    INTO v_is_open
    FROM public.barbershops
   WHERE id = NEW.barbershop_id;

  IF v_is_open IS NOT TRUE THEN
    RAISE EXCEPTION 'Barbearia está fechada no momento.'
      USING ERRCODE = 'P0001', DETAIL = 'is_open = false';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_barbershop_open ON public.queue_entries;
CREATE TRIGGER trg_check_barbershop_open
  BEFORE INSERT ON public.queue_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_barbershop_open_on_queue();

-- MIGRATION: 20260516000001_check_constraints.sql
ALTER TABLE public.services
  ADD CONSTRAINT chk_services_price_positivo
    CHECK (price >= 0),
  ADD CONSTRAINT chk_services_duration_valida
    CHECK (duration_min > 0 AND duration_min <= 480);

ALTER TABLE public.appointments
  ADD CONSTRAINT chk_appointments_duration_valida
    CHECK (duration_min > 0 AND duration_min <= 480);

ALTER TABLE public.barbershops
  ADD CONSTRAINT chk_barbershops_rating_avg
    CHECK (rating_avg >= 0 AND rating_avg <= 5),
  ADD CONSTRAINT chk_barbershops_rating_count
    CHECK (rating_count >= 0);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'transactions'
  ) THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT chk_transactions_amount_positivo
        CHECK (amount > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subscriptions'
      AND column_name = 'valid_until'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT chk_subscriptions_datas
        CHECK (valid_until >= valid_from);
  END IF;
END $$;

-- MIGRATION: 20260516000002_cleanup_functions.sql
CREATE OR REPLACE FUNCTION public.cleanup_queue_entries_old(
  p_dias INT DEFAULT 7
)
RETURNS TABLE (cleaned_count BIGINT, cleaned_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  DELETE FROM public.queue_entries
  WHERE status IN ('done', 'cancelled')
    AND check_in_at < NOW() - (p_dias || ' days')::INTERVAL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, NOW();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_queue_entries_old(INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cleanup_queue_entries_old(INT) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_notifications_old(
  p_dias INT DEFAULT 30
)
RETURNS TABLE (cleaned_count BIGINT, cleaned_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count BIGINT;
BEGIN
  DELETE FROM public.notifications
  WHERE is_read = TRUE
    AND created_at < NOW() - (p_dias || ' days')::INTERVAL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN QUERY SELECT v_count, NOW();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_notifications_old(INT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cleanup_notifications_old(INT) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_all_old_data()
RETURNS TABLE (tabela TEXT, cleaned_count BIGINT, cleaned_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT 'queue_entries'::TEXT, c.cleaned_count, c.cleaned_at
    FROM cleanup_queue_entries_old() AS c;

  RETURN QUERY
    SELECT 'notifications'::TEXT, c.cleaned_count, c.cleaned_at
    FROM cleanup_notifications_old() AS c;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_all_old_data() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.cleanup_all_old_data() TO service_role;

-- MIGRATION: 20260516000003_atomic_appointment_rpc.sql
CREATE OR REPLACE FUNCTION public.criar_agendamento_atomico(
  p_client_id       UUID,
  p_professional_id UUID,
  p_barbershop_id   UUID,
  p_service_id      UUID,
  p_scheduled_at    TIMESTAMPTZ,
  p_duration_min    INT,
  p_notes           TEXT    DEFAULT NULL,
  p_price_charged   NUMERIC DEFAULT NULL
)
RETURNS SETOF public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fim       TIMESTAMPTZ;
  v_conflito  INT;
BEGIN

  PERFORM pg_advisory_xact_lock(hashtext(p_professional_id::TEXT));

  v_fim := p_scheduled_at + (p_duration_min || ' minutes')::INTERVAL;

  SELECT COUNT(*) INTO v_conflito
  FROM public.appointments
  WHERE professional_id = p_professional_id
    AND status NOT IN ('cancelled', 'no_show', 'done')
    AND scheduled_at < v_fim
    AND (scheduled_at + (duration_min || ' minutes')::INTERVAL) > p_scheduled_at;

  IF v_conflito > 0 THEN
    RAISE EXCEPTION 'SCHEDULE_CONFLICT'
      USING ERRCODE = 'P0001',
            DETAIL  = 'Horário não disponível: conflito com agendamento existente.';
  END IF;

  RETURN QUERY
  INSERT INTO public.appointments (
    client_id, professional_id, barbershop_id, service_id,
    scheduled_at, duration_min, notes, price_charged, status
  )
  VALUES (
    p_client_id, p_professional_id, p_barbershop_id, p_service_id,
    p_scheduled_at, p_duration_min, p_notes, p_price_charged, 'pending'
  )
  RETURNING *;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.criar_agendamento_atomico(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ, INT, TEXT, NUMERIC
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.criar_agendamento_atomico(
  UUID, UUID, UUID, UUID, TIMESTAMPTZ, INT, TEXT, NUMERIC
) TO authenticated;

-- MIGRATION: 20260516_notify_professional_queue_done.sql
CREATE OR REPLACE FUNCTION public.fn_notify_queue_clients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec           RECORD;
  posicao_rank  INT := 0;
  v_proximo     RECORD;
BEGIN

  IF NEW.status IS DISTINCT FROM 'done' THEN
    RETURN NEW;
  END IF;

  FOR rec IN
    SELECT
      client_id,
      position,
      ROW_NUMBER() OVER (ORDER BY position ASC) AS rank
    FROM public.queue_entries
    WHERE barbershop_id = NEW.barbershop_id
      AND status        = 'waiting'
      AND client_id     IS NOT NULL
  LOOP
    posicao_rank := rec.rank;
    INSERT INTO public.notifications (user_id, type, title, body, data, is_read, created_at)
    VALUES (
      rec.client_id,
      'queue_update',
      'Fila avançou',
      CASE
        WHEN posicao_rank = 1 THEN 'Você é o próximo! Dirija-se à cadeira.'
        ELSE 'Você está na posição ' || posicao_rank || ' da fila.'
      END,
      jsonb_build_object(
        'position',      posicao_rank,
        'barbershop_id', NEW.barbershop_id,
        'is_next',       (posicao_rank = 1)
      ),
      false,
      NOW()
    );
  END LOOP;

  IF NEW.professional_id IS NOT NULL THEN

    SELECT
      qe.id                                                    AS entry_id,
      COALESCE(p.full_name, qe.guest_name, 'Cliente walk-in') AS client_name
    INTO v_proximo
    FROM public.queue_entries qe
    LEFT JOIN public.profiles p ON p.id = qe.client_id
    WHERE qe.barbershop_id = NEW.barbershop_id
      AND qe.status        = 'waiting'
    ORDER BY qe.position ASC
    LIMIT 1;

    IF v_proximo IS NOT NULL THEN

      INSERT INTO public.notifications (user_id, type, title, body, data, is_read, created_at)
      VALUES (
        NEW.professional_id,
        'queue_next_client',
        'Próximo cliente',
        v_proximo.client_name || ' está aguardando na fila.',
        jsonb_build_object(
          'entry_id',      v_proximo.entry_id,
          'client_name',   v_proximo.client_name,
          'barbershop_id', NEW.barbershop_id,
          'is_next',       true
        ),
        false,
        NOW()
      );
    ELSE

      INSERT INTO public.notifications (user_id, type, title, body, data, is_read, created_at)
      VALUES (
        NEW.professional_id,
        'queue_empty',
        'Fila vazia',
        'Não há mais clientes aguardando.',
        jsonb_build_object('barbershop_id', NEW.barbershop_id),
        false,
        NOW()
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- MIGRATION: 20260517000001_drop_direct_messages.sql
DROP POLICY IF EXISTS "dm_select_own"   ON direct_messages;
DROP POLICY IF EXISTS "dm_insert_own"   ON direct_messages;
DROP POLICY IF EXISTS "dm_update_read"  ON direct_messages;

DROP INDEX IF EXISTS idx_dm_conversation;
DROP INDEX IF EXISTS idx_dm_inbox;
DROP INDEX IF EXISTS idx_dm_story_ref;

DROP TABLE IF EXISTS direct_messages;

-- MIGRATION: 20260517000001_postgis_barbershops.sql
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE barbershops
  ADD COLUMN IF NOT EXISTS geom GEOMETRY(Point, 4326);

UPDATE barbershops
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND geom IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_barbershops_geom
  ON barbershops USING GIST (geom);

CREATE OR REPLACE FUNCTION sync_barbershop_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_barbershop_geom ON barbershops;
CREATE TRIGGER trg_sync_barbershop_geom
  BEFORE INSERT OR UPDATE OF latitude, longitude ON barbershops
  FOR EACH ROW EXECUTE FUNCTION sync_barbershop_geom();

CREATE OR REPLACE FUNCTION get_barbershops_nearby(
  lat        DOUBLE PRECISION,
  lng        DOUBLE PRECISION,
  raio_metros DOUBLE PRECISION,
  limit_val  INT DEFAULT 50
)
RETURNS TABLE (
  id            UUID,
  name          TEXT,
  address       TEXT,
  city          TEXT,
  latitude      DOUBLE PRECISION,
  longitude     DOUBLE PRECISION,
  logo_path     TEXT,
  cover_path    TEXT,
  is_open       BOOLEAN,
  close_reason  TEXT,
  rating_avg    NUMERIC,
  rating_count  INT,
  rating_score  NUMERIC,
  likes_count   INT,
  dislikes_count INT,
  font_key      TEXT,
  distancia_m   DOUBLE PRECISION
)
LANGUAGE sql STABLE
AS $$
  SELECT
    b.id, b.name, b.address, b.city,
    b.latitude, b.longitude,
    b.logo_path, b.cover_path,
    b.is_open, b.close_reason,
    b.rating_avg, b.rating_count, b.rating_score,
    b.likes_count, b.dislikes_count, b.font_key,
    ST_Distance(
      b.geom::geography,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
    ) AS distancia_m
  FROM barbershops b
  WHERE
    b.is_active = TRUE
    AND b.geom IS NOT NULL
    AND ST_DWithin(
      b.geom::geography,
      ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
      raio_metros
    )
  ORDER BY distancia_m ASC
  LIMIT limit_val;
$$;

-- MIGRATION: 20260517000002_refresh_tokens_family_id.sql
ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS family_id UUID;

UPDATE refresh_tokens
SET family_id = gen_random_uuid()
WHERE family_id IS NULL;

ALTER TABLE refresh_tokens
  ALTER COLUMN family_id SET NOT NULL,
  ALTER COLUMN family_id SET DEFAULT gen_random_uuid();

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refresh_tokens_family_id
  ON refresh_tokens (family_id);

-- MIGRATION: 20260517000003_unify_portfolio_likes.sql
INSERT INTO public.likes (user_id, content_id, content_type, created_at)
SELECT
  pl.user_id,
  pl.portfolio_image_id AS content_id,
  'portfolio_image'     AS content_type,
  pl.created_at
FROM public.portfolio_likes pl
ON CONFLICT (user_id, content_id, content_type) DO NOTHING;

DROP TABLE IF EXISTS public.portfolio_likes;

-- MIGRATION: 20260517000004_barbershops_missing_columns.sql
ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS likes_count     INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dislikes_count  INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_score    NUMERIC(3,1)  NOT NULL DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS font_key        TEXT,
  ADD COLUMN IF NOT EXISTS close_reason    TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename  = 'barbershops'
      AND policyname = 'anon_select_active_barbershops'
  ) THEN
    CREATE POLICY "anon_select_active_barbershops"
      ON public.barbershops
      FOR SELECT
      TO anon
      USING (is_active = TRUE);
  END IF;
END $$;

-- MIGRATION: 20260519000001_queue_client_confirmed_arriving_check.sql
ALTER TABLE public.queue_entries
  DROP CONSTRAINT IF EXISTS queue_entries_client_confirmed_check;

ALTER TABLE public.queue_entries
  ADD CONSTRAINT queue_entries_client_confirmed_check
  CHECK (
    client_confirmed IS NULL
    OR client_confirmed IN ('yes', 'no_waiting', 'absent', 'arriving')
  );

COMMENT ON COLUMN public.queue_entries.client_confirmed IS
  'Estados: yes=presente(in_service) | no_waiting=ausente(in_service) | absent=grace expirado(in_service) | arriving=a caminho/aguardando confirmacao';

-- MIGRATION: 20260519000002_fix_barbershop_storage_rls.sql
CREATE OR REPLACE FUNCTION public.storage_is_barbershop_owner(shop_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.barbershops
    WHERE id::text = shop_id
      AND owner_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "barbershops_owner_write"  ON storage.objects;
DROP POLICY IF EXISTS "barbershops_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "barbershops_owner_delete" ON storage.objects;

CREATE POLICY "barbershops_owner_write"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'barbershops' AND
    public.storage_is_barbershop_owner((storage.foldername(name))[1])
  );

CREATE POLICY "barbershops_owner_update"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'barbershops' AND
    public.storage_is_barbershop_owner((storage.foldername(name))[1])
  )
  WITH CHECK (
    bucket_id = 'barbershops' AND
    public.storage_is_barbershop_owner((storage.foldername(name))[1])
  );

CREATE POLICY "barbershops_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'barbershops' AND
    public.storage_is_barbershop_owner((storage.foldername(name))[1])
  );

-- MIGRATION: 20260519000003_barbershop_mensalistas.sql
CREATE TABLE IF NOT EXISTS public.barbershop_mensalistas (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  barbershop_id uuid        NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  client_id     uuid        NOT NULL REFERENCES public.profiles(id)    ON DELETE CASCADE,
  starts_at     timestamptz NOT NULL DEFAULT now(),
  ends_at       timestamptz NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (barbershop_id, client_id)
);

ALTER TABLE public.barbershop_mensalistas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mensalistas_owner_all"
  ON public.barbershop_mensalistas
  FOR ALL
  USING (
    barbershop_id IN (
      SELECT id FROM public.barbershops WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "mensalistas_client_read"
  ON public.barbershop_mensalistas
  FOR SELECT
  USING (client_id = auth.uid());

-- MIGRATION: 20260520000001_get_clientes_favoritos_barbearia.sql
CREATE OR REPLACE FUNCTION public.get_clientes_favoritos_barbearia(
  p_barbershop_id UUID
)
RETURNS TABLE (
  id          UUID,
  full_name   TEXT,
  email       TEXT,
  avatar_path TEXT,
  updated_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    p.id          AS id,
    p.full_name   AS full_name,
    p.email       AS email,
    p.avatar_path AS avatar_path,
    p.updated_at  AS updated_at
  FROM public.profiles AS p
  WHERE p.id IN (

    SELECT bi.user_id
    FROM   public.barbershop_interactions AS bi
    WHERE  bi.barbershop_id = p_barbershop_id
      AND  bi.type = 'favorite'
    UNION

    SELECT fp.user_id
    FROM   public.favorite_professionals    AS fp
    JOIN   public.professional_shop_links   AS psl
           ON psl.professional_id = fp.professional_id
    WHERE  psl.barbershop_id = p_barbershop_id
      AND  psl.is_active = true
  )
  ORDER BY p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_clientes_favoritos_barbearia(UUID) TO authenticated;

-- MIGRATION: 20260521000001_add_monthly_fee_mensalistas.sql
ALTER TABLE public.barbershop_mensalistas
  ADD COLUMN IF NOT EXISTS monthly_fee numeric(10,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'barbershop_mensalistas_monthly_fee_nonnegative'
  ) THEN
    ALTER TABLE public.barbershop_mensalistas
      ADD CONSTRAINT barbershop_mensalistas_monthly_fee_nonnegative
      CHECK (monthly_fee >= 0);
  END IF;
END $$;

-- MIGRATION: 20260521000001_geo_bounded_context.sql
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS geom GEOMETRY(Point, 4326);

UPDATE profiles
SET geom = ST_SetSRID(ST_MakePoint(last_lng, last_lat), 4326)
WHERE last_lat IS NOT NULL
  AND last_lng IS NOT NULL
  AND geom IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_geom
  ON profiles USING GIST (geom);

CREATE OR REPLACE FUNCTION sync_profile_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.last_lat IS NOT NULL AND NEW.last_lng IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.last_lng, NEW.last_lat), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_profile_geom ON profiles;
CREATE TRIGGER trg_sync_profile_geom
  BEFORE INSERT OR UPDATE OF last_lat, last_lng ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_profile_geom();

CREATE TABLE IF NOT EXISTS public.geofences (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  owner_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  center      GEOMETRY(Point, 4326) NOT NULL,
  radius_m    DOUBLE PRECISION NOT NULL CHECK (radius_m > 0 AND radius_m <= 100000),
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_geofences_center
  ON geofences USING GIST (center);

CREATE INDEX IF NOT EXISTS idx_geofences_owner_active
  ON geofences (owner_id, is_active);

ALTER TABLE public.geofences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "geofences_owner_all"    ON public.geofences;
DROP POLICY IF EXISTS "geofences_active_read"  ON public.geofences;

CREATE POLICY "geofences_owner_all" ON public.geofences
  FOR ALL
  USING (owner_id = auth.uid());

CREATE POLICY "geofences_active_read" ON public.geofences
  FOR SELECT
  USING (is_active = TRUE);

CREATE OR REPLACE FUNCTION public.update_user_geo(
  p_user_id  UUID,
  p_lat      DOUBLE PRECISION,
  p_lng      DOUBLE PRECISION
)
RETURNS TABLE (
  prev_lat         DOUBLE PRECISION,
  prev_lng         DOUBLE PRECISION,
  prev_location_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev_lat         DOUBLE PRECISION;
  v_prev_lng         DOUBLE PRECISION;
  v_prev_location_at TIMESTAMPTZ;
BEGIN

  SELECT p.last_lat, p.last_lng, p.last_location_at
    INTO v_prev_lat, v_prev_lng, v_prev_location_at
  FROM profiles p
  WHERE p.id = p_user_id;

  UPDATE profiles
  SET
    last_lat         = p_lat,
    last_lng         = p_lng,
    last_location_at = NOW()
  WHERE id = p_user_id;

  RETURN QUERY SELECT v_prev_lat, v_prev_lng, v_prev_location_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_user_geo(UUID, DOUBLE PRECISION, DOUBLE PRECISION) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_user_geo(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.update_user_geo(UUID, DOUBLE PRECISION, DOUBLE PRECISION) TO service_role;

CREATE OR REPLACE FUNCTION public.get_active_geofences_near_user(
  p_user_id     UUID,
  p_raio_metros DOUBLE PRECISION DEFAULT 5000
)
RETURNS TABLE (
  id         UUID,
  name       TEXT,
  owner_id   UUID,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_m   DOUBLE PRECISION,
  is_active  BOOLEAN
)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.id, g.name, g.owner_id,
    ST_Y(g.center::geometry) AS center_lat,
    ST_X(g.center::geometry) AS center_lng,
    g.radius_m, g.is_active
  FROM geofences g
  JOIN profiles p ON p.id = p_user_id
  WHERE
    g.is_active = TRUE
    AND p.geom IS NOT NULL
    AND ST_DWithin(
      g.center::geography,
      p.geom::geography,
      p_raio_metros + g.radius_m
    )
  ORDER BY ST_Distance(g.center::geography, p.geom::geography) ASC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_active_geofences_near_user(UUID, DOUBLE PRECISION) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_active_geofences_near_user(UUID, DOUBLE PRECISION) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_active_geofences_near_user(UUID, DOUBLE PRECISION) TO service_role;

-- MIGRATION: 20260521000002_add_haircuts_count_mensalistas.sql
ALTER TABLE public.barbershop_mensalistas
  ADD COLUMN IF NOT EXISTS haircuts_count INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'barbershop_mensalistas_haircuts_count_nonnegative'
  ) THEN
    ALTER TABLE public.barbershop_mensalistas
      ADD CONSTRAINT barbershop_mensalistas_haircuts_count_nonnegative
      CHECK (haircuts_count >= 0);
  END IF;
END $$;

-- MIGRATION: 20260522000001_media_pipeline.sql
alter table public.media_files
  add column if not exists source_path text,
  add column if not exists declared_mime text,
  add column if not exists declared_size_bytes integer,
  add column if not exists source_mime text,
  add column if not exists source_size_bytes integer,
  add column if not exists privacy text not null default 'private'
    check (privacy in ('public', 'private')),
  add column if not exists status text not null default 'published'
    check (status in ('reserved', 'uploaded', 'published', 'blocked', 'orphaned', 'deleted')),
  add column if not exists perceptual_hash text,
  add column if not exists duplicate_of uuid references public.media_files(id) on delete set null,
  add column if not exists published_at timestamptz;

alter table public.media_files
  alter column public_url drop not null;

update public.media_files
set source_path = coalesce(source_path, path),
    source_mime = coalesce(source_mime, content_type),
    source_size_bytes = coalesce(source_size_bytes, tamanho_bytes),
    privacy = coalesce(privacy, 'public'),
    status = coalesce(status, 'published')
where source_path is null
   or source_mime is null
   or source_size_bytes is null;

create index if not exists idx_media_files_phash_owner
  on public.media_files(owner_id, perceptual_hash)
  where perceptual_hash is not null;

create index if not exists idx_media_files_status_created
  on public.media_files(status, created_at);

create table if not exists public.media_variants (
  id uuid primary key default uuid_generate_v4(),
  media_id uuid not null references public.media_files(id) on delete cascade,
  name text not null,
  version integer not null check (version > 0),
  storage_path text not null,
  mime text not null,
  size_bytes integer not null check (size_bytes >= 0),
  created_at timestamptz not null default now(),
  unique (media_id, name, version)
);

create index if not exists idx_media_variants_media
  on public.media_variants(media_id, name, version desc);

alter table public.media_variants enable row level security;

create policy "media_variants_owner_select"
  on public.media_variants for select
  using (
    exists (
      select 1 from public.media_files mf
      where mf.id = media_id
        and mf.owner_id = auth.uid()
    )
  );

-- MIGRATION: 20260522000002_feed_bounded_context.sql
create table if not exists public.feed_items (
  id            uuid primary key default gen_random_uuid(),
  author_id     uuid not null references public.profiles(id) on delete cascade,
  source_type   text not null check (source_type in ('story', 'portfolio_image', 'post')),
  source_id     uuid not null,
  content_hash  text not null,
  fanout_mode   text not null default 'write' check (fanout_mode in ('write', 'pull')),
  likes_count   integer not null default 0 check (likes_count >= 0),
  views_count   integer not null default 0 check (views_count >= 0),
  created_at    timestamptz not null default now(),
  unique (author_id, source_type, source_id)
);

create index if not exists idx_feed_items_author_created
  on public.feed_items (author_id, created_at desc, id desc);
create index if not exists idx_feed_items_cursor
  on public.feed_items (created_at desc, id desc);
create index if not exists idx_feed_items_hash_recent
  on public.feed_items (author_id, content_hash, created_at desc);
create index if not exists idx_feed_items_pull_cursor
  on public.feed_items (fanout_mode, created_at desc, id desc)
  where fanout_mode = 'pull';

create table if not exists public.feed_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  author_id   uuid not null references public.profiles(id) on delete cascade,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (follower_id, author_id),
  check (follower_id <> author_id)
);
create index if not exists idx_feed_follows_author_active
  on public.feed_follows (author_id, follower_id)
  where is_active = true;

create table if not exists public.feed_blocks (
  user_id           uuid not null references public.profiles(id) on delete cascade,
  blocked_author_id uuid not null references public.profiles(id) on delete cascade,
  created_at        timestamptz not null default now(),
  primary key (user_id, blocked_author_id),
  check (user_id <> blocked_author_id)
);

create table if not exists public.feed_inbox (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  feed_item_id uuid not null references public.feed_items(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, feed_item_id)
);
create index if not exists idx_feed_inbox_user_item
  on public.feed_inbox (user_id, feed_item_id);

alter table public.feed_items enable row level security;
alter table public.feed_follows enable row level security;
alter table public.feed_blocks enable row level security;
alter table public.feed_inbox enable row level security;

drop policy if exists feed_items_auth_read on public.feed_items;
create policy feed_items_auth_read on public.feed_items
  for select to authenticated using (true);
drop policy if exists feed_follows_owner_all on public.feed_follows;
create policy feed_follows_owner_all on public.feed_follows
  for all to authenticated using (follower_id = auth.uid()) with check (follower_id = auth.uid());
drop policy if exists feed_blocks_owner_all on public.feed_blocks;
create policy feed_blocks_owner_all on public.feed_blocks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists feed_inbox_owner_read on public.feed_inbox;
create policy feed_inbox_owner_read on public.feed_inbox
  for select to authenticated using (user_id = auth.uid());

create or replace function public.get_feed_page(
  p_user_id uuid,
  p_limit integer default 20,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  author_id uuid,
  source_type text,
  source_id uuid,
  content_hash text,
  fanout_mode text,
  likes_count integer,
  views_count integer,
  affinity_score numeric,
  created_at timestamptz
)
language sql
stable
as $$
  with candidates as (
    select fi.*
      from public.feed_inbox inbox
      join public.feed_items fi on fi.id = inbox.feed_item_id
     where inbox.user_id = p_user_id
    union
    select fi.*
      from public.feed_follows follows
      join public.feed_items fi on fi.author_id = follows.author_id and fi.fanout_mode = 'pull'
     where follows.follower_id = p_user_id and follows.is_active = true
  )
  select c.id, c.author_id, c.source_type, c.source_id, c.content_hash, c.fanout_mode,
         c.likes_count, c.views_count, 0::numeric as affinity_score, c.created_at
    from candidates c
   where not exists (
         select 1 from public.feed_blocks b
          where b.user_id = p_user_id and b.blocked_author_id = c.author_id
       )
     and (
       p_cursor_created_at is null
       or c.created_at < p_cursor_created_at
       or (c.created_at = p_cursor_created_at and c.id < p_cursor_id)
     )
   order by c.created_at desc, c.id desc
   limit greatest(1, least(coalesce(p_limit, 20), 150));
$$;

comment on function public.get_feed_page is
  'Pagina feed hibrido por cursor (created_at,id). Inbox atende write fanout; autores heavy entram por pull.';

-- MIGRATION: 20260522000003_chat_bounded_context.sql
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type        text NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  metadata    jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.chat_participants (
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'owner')),
  joined_at       timestamptz NOT NULL DEFAULT now(),
  left_at         timestamptz,
  last_read_message_id uuid,
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_message_id text NOT NULL,
  body              text NOT NULL DEFAULT '' CHECK (char_length(body) <= 4000),
  encrypted_payload jsonb,
  e2e_key_version   integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz,
  retention_until   timestamptz
);

CREATE TABLE IF NOT EXISTS public.chat_message_attachments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  media_id   uuid NOT NULL REFERENCES public.media_files(id) ON DELETE RESTRICT,
  variant    text NOT NULL DEFAULT 'original',
  kind       text NOT NULL DEFAULT 'media',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, media_id, variant)
);

CREATE TABLE IF NOT EXISTS public.chat_message_statuses (
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     text NOT NULL CHECK (status IN ('saved', 'published', 'delivered', 'read', 'failed')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_read_receipts (
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS public.chat_mute_rules (
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  muted_until     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_client_id
  ON public.chat_messages(sender_id, client_message_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created_desc
  ON public.chat_messages(conversation_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_chat_participants_user_active
  ON public.chat_participants(user_id, conversation_id)
  WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_attachments_media
  ON public.chat_message_attachments(media_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_retention
  ON public.chat_messages(retention_until)
  WHERE deleted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.has_chat_block(p_left_user_id uuid, p_right_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.chat_blocks b
     WHERE (b.blocker_id = p_left_user_id AND b.blocked_id = p_right_user_id)
        OR (b.blocker_id = p_right_user_id AND b.blocked_id = p_left_user_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.count_chat_pair_messages(
  p_sender_id uuid,
  p_recipient_ids uuid[],
  p_window_seconds integer
)
RETURNS integer
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::integer
    FROM public.chat_messages m
   WHERE m.sender_id = p_sender_id
     AND m.created_at >= now() - make_interval(secs => p_window_seconds)
     AND EXISTS (
       SELECT 1
         FROM public.chat_participants cp
        WHERE cp.conversation_id = m.conversation_id
          AND cp.user_id = ANY(p_recipient_ids)
          AND cp.left_at IS NULL
     );
$$;

CREATE OR REPLACE FUNCTION public.get_chat_messages_reverse(
  p_conversation_id uuid,
  p_limit integer DEFAULT 30,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  client_message_id text,
  body text,
  created_at timestamptz,
  deleted_at timestamptz,
  retention_until timestamptz,
  attachments jsonb
)
LANGUAGE sql
STABLE
AS $$
  SELECT m.id,
         m.conversation_id,
         m.sender_id,
         m.client_message_id,
         CASE WHEN m.deleted_at IS NULL THEN m.body ELSE '' END AS body,
         m.created_at,
         m.deleted_at,
         m.retention_until,
         COALESCE(
           jsonb_agg(
             jsonb_build_object('media_id', a.media_id, 'variant', a.variant, 'kind', a.kind)
             ORDER BY a.created_at
           ) FILTER (WHERE a.id IS NOT NULL),
           '[]'::jsonb
         ) AS attachments
    FROM public.chat_messages m
    LEFT JOIN public.chat_message_attachments a ON a.message_id = m.id
   WHERE m.conversation_id = p_conversation_id
     AND (
       p_cursor_created_at IS NULL
       OR (m.created_at, m.id) < (p_cursor_created_at, p_cursor_id)
     )
   GROUP BY m.id
   ORDER BY m.created_at DESC, m.id DESC
   LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_message_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_read_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_mute_rules ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.chat_messages IS 'Mensagens canonicas do chat. Leitura otimizada por (conversation_id, created_at desc, id desc).';
COMMENT ON COLUMN public.chat_messages.client_message_id IS 'Chave idempotente enviada pelo cliente por mensagem.';
COMMENT ON COLUMN public.chat_messages.encrypted_payload IS 'Ponto de extensao para E2E; nao usado ate habilitar IMessageCipher.';

-- MIGRATION: 20260522000004_notifications_rls_security_fix.sql
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE public.notifications
SET read_at = COALESCE(read_at, created_at)
WHERE is_read = true
  AND read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_visible
  ON public.notifications (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  CREATE TYPE public.notification_type AS ENUM (
    'sistema',
    'agendamento',
    'barbearia',
    'engajamento',
    'appointment_confirmed',
    'new_message',
    'queue_update',
    'client_at_shop',
    'client_arriving_late',
    'client_not_seated',
    'client_absent',
    'queue_next_client',
    'queue_empty'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'sistema';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'agendamento';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'barbearia';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'engajamento';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'appointment_confirmed';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'new_message';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'queue_update';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'client_at_shop';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'client_arriving_late';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'client_not_seated';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'client_absent';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'queue_next_client';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'queue_empty';

CREATE TABLE IF NOT EXISTS public.notification_rate_limits (
  sender_id          uuid not null references public.profiles(id) on delete cascade,
  recipient_id       uuid not null references public.profiles(id) on delete cascade,
  window_started_at  timestamptz not null default now(),
  notification_count integer not null default 0 check (notification_count >= 0),
  primary key (sender_id, recipient_id)
);

CREATE TABLE IF NOT EXISTS public.notification_audit (
  id              uuid primary key default uuid_generate_v4(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  actor_id        uuid references public.profiles(id) on delete set null,
  recipient_id    uuid not null references public.profiles(id) on delete cascade,
  type            public.notification_type not null,
  source          text not null,
  created_at      timestamptz not null default now()
);

ALTER TABLE public.notification_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_rate_limits_no_client_access" ON public.notification_rate_limits;
DROP POLICY IF EXISTS "notification_audit_no_client_access" ON public.notification_audit;

REVOKE ALL ON public.notification_rate_limits FROM anon, authenticated;
REVOKE ALL ON public.notification_audit FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.notifications_guard_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.notification_insert_allowed', true) = 'on'
     OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'notification_direct_insert_forbidden'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_guard_insert ON public.notifications;
CREATE TRIGGER trg_notifications_guard_insert
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notifications_guard_insert();

CREATE OR REPLACE FUNCTION public.notifications_guard_user_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_read IS DISTINCT FROM OLD.is_read
     OR (to_jsonb(NEW) - 'read_at' - 'deleted_at' - 'is_read')
        IS DISTINCT FROM
        (to_jsonb(OLD) - 'read_at' - 'deleted_at' - 'is_read') THEN
    RAISE EXCEPTION 'notification_update_fields_forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.read_at IS NOT NULL
     AND NEW.read_at IS DISTINCT FROM OLD.read_at THEN
    RAISE EXCEPTION 'notification_read_at_immutable'
      USING ERRCODE = 'P0001';
  END IF;

  IF OLD.deleted_at IS NOT NULL
     AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'notification_deleted_at_immutable'
      USING ERRCODE = 'P0001';
  END IF;

  NEW.is_read := NEW.read_at IS NOT NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_guard_user_update ON public.notifications;
CREATE TRIGGER trg_notifications_guard_user_update
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notifications_guard_user_update();

CREATE OR REPLACE FUNCTION public.notifications_guard_user_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    RAISE EXCEPTION 'notification_delete_forbidden_use_deleted_at'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_guard_user_delete ON public.notifications;
CREATE TRIGGER trg_notifications_guard_user_delete
  BEFORE DELETE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.notifications_guard_user_delete();

DROP POLICY IF EXISTS "notifications_insert_service" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_read_own" ON public.notifications;

CREATE POLICY "notifications_select_own"
  ON public.notifications
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    AND deleted_at IS NULL
  );

CREATE POLICY "notifications_update_read_own"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND deleted_at IS NULL
  )
  WITH CHECK (auth.uid() = user_id);

REVOKE DELETE ON public.notifications FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._insert_validated_notification(
  p_recipient_id uuid,
  p_sender_id uuid,
  p_type text,
  p_payload jsonb,
  p_source text,
  p_apply_rate_limit boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notification_id uuid;
  v_type public.notification_type;
  v_title text;
  v_body text;
  v_rate_count integer;
BEGIN
  IF p_recipient_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles p
       WHERE p.id = p_recipient_id
         AND p.is_active = true
     ) THEN
    RAISE EXCEPTION 'notification_recipient_invalid'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT e.enumlabel::public.notification_type
  INTO v_type
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND t.typname = 'notification_type'
    AND e.enumlabel = p_type;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'notification_invalid_type'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_payload IS NULL
     OR jsonb_typeof(p_payload) <> 'object'
     OR octet_length(p_payload::text) > 8192
     OR NOT (p_payload ? 'title')
     OR jsonb_typeof(p_payload->'title') <> 'string'
     OR length(btrim(p_payload->>'title')) NOT BETWEEN 1 AND 160
     OR ((p_payload ? 'body') AND (
       jsonb_typeof(p_payload->'body') <> 'string'
       OR length(p_payload->>'body') > 1000
     ))
     OR ((p_payload ? 'data') AND jsonb_typeof(p_payload->'data') <> 'object')
     OR EXISTS (
       SELECT 1
       FROM jsonb_object_keys(p_payload) AS payload_key
       WHERE payload_key NOT IN ('title', 'body', 'data')
     ) THEN
    RAISE EXCEPTION 'notification_invalid_payload'
      USING ERRCODE = 'P0001';
  END IF;

  v_title := btrim(p_payload->>'title');
  v_body := COALESCE(p_payload->>'body', '');

  IF p_apply_rate_limit THEN
    IF p_sender_id IS NULL THEN
      RAISE EXCEPTION 'notification_sender_invalid'
        USING ERRCODE = 'P0001';
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(p_sender_id::text || ':' || p_recipient_id::text, 0)
    );

    INSERT INTO public.notification_rate_limits (
      sender_id,
      recipient_id,
      window_started_at,
      notification_count
    ) VALUES (
      p_sender_id,
      p_recipient_id,
      now(),
      1
    )
    ON CONFLICT (sender_id, recipient_id)
    DO UPDATE SET
      window_started_at = CASE
        WHEN public.notification_rate_limits.window_started_at <= now() - interval '1 minute'
          THEN now()
        ELSE public.notification_rate_limits.window_started_at
      END,
      notification_count = CASE
        WHEN public.notification_rate_limits.window_started_at <= now() - interval '1 minute'
          THEN 1
        ELSE public.notification_rate_limits.notification_count + 1
      END
    RETURNING notification_count INTO v_rate_count;

    IF v_rate_count > 10 THEN
      RAISE EXCEPTION 'notification_rate_limited'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  PERFORM set_config('app.notification_insert_allowed', 'on', true);

  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    body,
    data,
    is_read,
    read_at,
    created_at
  ) VALUES (
    p_recipient_id,
    v_type::text,
    v_title,
    v_body,
    COALESCE(p_payload->'data', '{}'::jsonb),
    false,
    NULL,
    now()
  )
  RETURNING id INTO v_notification_id;

  INSERT INTO public.notification_audit (
    notification_id,
    actor_id,
    recipient_id,
    type,
    source
  ) VALUES (
    v_notification_id,
    p_sender_id,
    p_recipient_id,
    v_type,
    left(COALESCE(NULLIF(p_source, ''), 'unknown'), 80)
  );

  RETURN v_notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public._insert_validated_notification(
  uuid, uuid, text, jsonb, text, boolean
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_notification(
  p_recipient_id uuid,
  p_type text,
  p_payload jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sender_id uuid := auth.uid();
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN public._insert_validated_notification(
      p_recipient_id,
      NULL,
      p_type,
      p_payload,
      'create_notification_service',
      false
    );
  END IF;

  IF v_sender_id IS NULL THEN
    RAISE EXCEPTION 'notification_auth_required'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_recipient_id IS DISTINCT FROM v_sender_id THEN
    RAISE EXCEPTION 'notification_recipient_forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN public._insert_validated_notification(
    p_recipient_id,
    v_sender_id,
    p_type,
    p_payload,
    'create_notification',
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_notification(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.notificar_barbeiro_chegada(
  p_professional_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_id uuid;
BEGIN
  IF p_type NOT IN ('client_at_shop', 'client_arriving_late', 'client_not_seated')
     OR p_data IS NULL
     OR jsonb_typeof(p_data) <> 'object'
     OR COALESCE(p_data->>'entry_id', '') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'notification_queue_payload_invalid'
      USING ERRCODE = 'P0001';
  END IF;

  v_entry_id := (p_data->>'entry_id')::uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM public.queue_entries qe
    WHERE qe.id = v_entry_id
      AND qe.client_id = auth.uid()
      AND qe.professional_id = p_professional_id
  ) THEN
    RAISE EXCEPTION 'notification_queue_recipient_forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM public._insert_validated_notification(
    p_professional_id,
    auth.uid(),
    p_type,
    jsonb_build_object(
      'title', left(COALESCE(NULLIF(btrim(p_title), ''), 'Atualizacao da fila'), 160),
      'body', left(COALESCE(p_body, ''), 1000),
      'data', p_data
    ),
    'notificar_barbeiro_chegada',
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notificar_barbeiro_chegada(uuid, text, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificar_barbeiro_chegada(uuid, text, text, text, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.confirmar_presenca_cliente(
  p_entry_id uuid,
  p_confirmado boolean,
  p_grace_used boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry record;
BEGIN
  SELECT qe.id, qe.professional_id, qe.barbershop_id, p.full_name AS client_name
  INTO v_entry
  FROM public.queue_entries qe
  LEFT JOIN public.profiles p ON p.id = qe.client_id
  WHERE qe.id = p_entry_id
    AND qe.client_id = auth.uid()
    AND qe.status = 'in_service'
  LIMIT 1;

  IF v_entry IS NULL THEN
    RETURN;
  END IF;

  IF p_confirmado THEN
    UPDATE public.queue_entries
    SET client_confirmed = 'yes',
        first_no_at = NULL
    WHERE id = p_entry_id;
    RETURN;
  END IF;

  IF NOT p_grace_used THEN
    UPDATE public.queue_entries
    SET client_confirmed = 'no_waiting',
        first_no_at = now()
    WHERE id = p_entry_id;

    IF v_entry.professional_id IS NOT NULL THEN
      PERFORM public._insert_validated_notification(
        v_entry.professional_id,
        auth.uid(),
        'client_not_seated',
        jsonb_build_object(
          'title', 'Cliente ainda nao esta pronto',
          'body', COALESCE(v_entry.client_name, 'Cliente') || ' avisou que ainda nao esta sentado na cadeira.',
          'data', jsonb_build_object(
            'client_not_seated', true,
            'entry_id', p_entry_id,
            'client_name', COALESCE(v_entry.client_name, 'Cliente'),
            'barbershop_id', v_entry.barbershop_id
          )
        ),
        'confirmar_presenca_cliente',
        true
      );
    END IF;
    RETURN;
  END IF;

  UPDATE public.queue_entries
  SET client_confirmed = 'absent'
  WHERE id = p_entry_id;

  IF v_entry.professional_id IS NOT NULL THEN
    PERFORM public._insert_validated_notification(
      v_entry.professional_id,
      auth.uid(),
      'client_absent',
      jsonb_build_object(
        'title', 'Cliente ausente',
        'body', COALESCE(v_entry.client_name, 'Cliente') || ' nao confirmou presenca na cadeira.',
        'data', jsonb_build_object(
          'client_absent', true,
          'entry_id', p_entry_id,
          'client_name', COALESCE(v_entry.client_name, 'Cliente'),
          'barbershop_id', v_entry.barbershop_id
        )
      ),
      'confirmar_presenca_cliente',
      true
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_presenca_cliente(uuid, boolean, boolean)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_notify_queue_clients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  rec record;
  posicao_rank integer := 0;
  v_proximo record;
BEGIN
  IF NEW.status IS DISTINCT FROM 'done' THEN
    RETURN NEW;
  END IF;

  FOR rec IN
    SELECT
      client_id,
      ROW_NUMBER() OVER (ORDER BY position ASC) AS rank
    FROM public.queue_entries
    WHERE barbershop_id = NEW.barbershop_id
      AND status = 'waiting'
      AND client_id IS NOT NULL
  LOOP
    posicao_rank := rec.rank;
    PERFORM public._insert_validated_notification(
      rec.client_id,
      NEW.professional_id,
      'queue_update',
      jsonb_build_object(
        'title', 'Fila avancou',
        'body', CASE
          WHEN posicao_rank = 1 THEN 'Voce e o proximo! Dirija-se a cadeira.'
          ELSE 'Voce esta na posicao ' || posicao_rank || ' da fila.'
        END,
        'data', jsonb_build_object(
          'position', posicao_rank,
          'barbershop_id', NEW.barbershop_id,
          'is_next', posicao_rank = 1
        )
      ),
      'fn_notify_queue_clients',
      false
    );
  END LOOP;

  IF NEW.professional_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT qe.id AS entry_id, COALESCE(p.full_name, qe.guest_name, 'Cliente walk-in') AS client_name
  INTO v_proximo
  FROM public.queue_entries qe
  LEFT JOIN public.profiles p ON p.id = qe.client_id
  WHERE qe.barbershop_id = NEW.barbershop_id
    AND qe.status = 'waiting'
  ORDER BY qe.position ASC
  LIMIT 1;

  IF v_proximo IS NOT NULL THEN
    PERFORM public._insert_validated_notification(
      NEW.professional_id,
      NEW.professional_id,
      'queue_next_client',
      jsonb_build_object(
        'title', 'Proximo cliente',
        'body', v_proximo.client_name || ' esta aguardando na fila.',
        'data', jsonb_build_object(
          'entry_id', v_proximo.entry_id,
          'client_name', v_proximo.client_name,
          'barbershop_id', NEW.barbershop_id,
          'is_next', true
        )
      ),
      'fn_notify_queue_clients',
      false
    );
  ELSE
    PERFORM public._insert_validated_notification(
      NEW.professional_id,
      NEW.professional_id,
      'queue_empty',
      jsonb_build_object(
        'title', 'Fila vazia',
        'body', 'Nao ha mais clientes aguardando.',
        'data', jsonb_build_object('barbershop_id', NEW.barbershop_id)
      ),
      'fn_notify_queue_clients',
      false
    );
  END IF;

  RETURN NEW;
END;
$$;

-- MIGRATION: 20260523000001_notifications_fix_alto_vector.sql
BEGIN;

DROP POLICY IF EXISTS "notifications_insert_service" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_own"     ON public.notifications;

CREATE TABLE IF NOT EXISTS public.notification_sender_limits (
  sender_id         uuid        NOT NULL
                    REFERENCES  public.profiles(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  sent_count        integer     NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  PRIMARY KEY (sender_id)
);

ALTER TABLE public.notification_sender_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_sender_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._insert_validated_notification(
  p_recipient_id     uuid,
  p_sender_id        uuid,
  p_type             text,
  p_payload          jsonb,
  p_source           text,
  p_apply_rate_limit boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_notification_id uuid;
  v_type            public.notification_type;
  v_title           text;
  v_body            text;
  v_pair_count      integer;
  v_global_count    integer;
BEGIN

  IF p_recipient_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM   public.profiles p
       WHERE  p.id = p_recipient_id
         AND  p.is_active = true
     ) THEN
    RAISE EXCEPTION 'notification_recipient_invalid'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT e.enumlabel::public.notification_type
  INTO   v_type
  FROM   pg_enum     e
  JOIN   pg_type     t ON t.oid   = e.enumtypid
  JOIN   pg_namespace n ON n.oid  = t.typnamespace
  WHERE  n.nspname   = 'public'
    AND  t.typname   = 'notification_type'
    AND  e.enumlabel = p_type;

  IF v_type IS NULL THEN
    RAISE EXCEPTION 'notification_invalid_type'
      USING ERRCODE = 'P0001';
  END IF;

  IF p_payload IS NULL
     OR jsonb_typeof(p_payload) <> 'object'
     OR octet_length(p_payload::text) > 8192
     OR NOT (p_payload ? 'title')
     OR jsonb_typeof(p_payload->'title') <> 'string'
     OR length(btrim(p_payload->>'title')) NOT BETWEEN 1 AND 160
     OR ((p_payload ? 'body') AND (
           jsonb_typeof(p_payload->'body') <> 'string'
           OR length(p_payload->>'body') > 1000
         ))
     OR ((p_payload ? 'data') AND jsonb_typeof(p_payload->'data') <> 'object')
     OR EXISTS (
          SELECT 1
          FROM   jsonb_object_keys(p_payload) AS k
          WHERE  k NOT IN ('title', 'body', 'data')
        ) THEN
    RAISE EXCEPTION 'notification_invalid_payload'
      USING ERRCODE = 'P0001';
  END IF;

  v_title := btrim(p_payload->>'title');
  v_body  := COALESCE(p_payload->>'body', '');

  IF p_apply_rate_limit THEN
    IF p_sender_id IS NULL THEN
      RAISE EXCEPTION 'notification_sender_invalid'
        USING ERRCODE = 'P0001';
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(p_sender_id::text, 1)
    );

    INSERT INTO public.notification_sender_limits (sender_id, window_started_at, sent_count)
    VALUES (p_sender_id, now(), 1)
    ON CONFLICT (sender_id)
    DO UPDATE SET
      window_started_at = CASE
        WHEN public.notification_sender_limits.window_started_at
             <= now() - interval '1 minute'
          THEN now()
        ELSE public.notification_sender_limits.window_started_at
      END,
      sent_count = CASE
        WHEN public.notification_sender_limits.window_started_at
             <= now() - interval '1 minute'
          THEN 1
        ELSE public.notification_sender_limits.sent_count + 1
      END
    RETURNING sent_count INTO v_global_count;

    IF v_global_count > 50 THEN
      RAISE EXCEPTION 'notification_global_rate_limited'
        USING ERRCODE = 'P0001';
    END IF;

    PERFORM pg_advisory_xact_lock(
      hashtextextended(p_sender_id::text || ':' || p_recipient_id::text, 0)
    );

    INSERT INTO public.notification_rate_limits (
      sender_id, recipient_id, window_started_at, notification_count
    ) VALUES (
      p_sender_id, p_recipient_id, now(), 1
    )
    ON CONFLICT (sender_id, recipient_id)
    DO UPDATE SET
      window_started_at = CASE
        WHEN public.notification_rate_limits.window_started_at
             <= now() - interval '1 minute'
          THEN now()
        ELSE public.notification_rate_limits.window_started_at
      END,
      notification_count = CASE
        WHEN public.notification_rate_limits.window_started_at
             <= now() - interval '1 minute'
          THEN 1
        ELSE public.notification_rate_limits.notification_count + 1
      END
    RETURNING notification_count INTO v_pair_count;

    IF v_pair_count > 10 THEN
      RAISE EXCEPTION 'notification_rate_limited'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  PERFORM set_config('app.notification_insert_allowed', 'on', true);

  INSERT INTO public.notifications (
    user_id, type, title, body, data, is_read, read_at, created_at
  ) VALUES (
    p_recipient_id,
    v_type::text,
    v_title,
    v_body,
    COALESCE(p_payload->'data', '{}'::jsonb),
    false,
    NULL,
    now()
  )
  RETURNING id INTO v_notification_id;

  INSERT INTO public.notification_audit (
    notification_id, actor_id, recipient_id, type, source
  ) VALUES (
    v_notification_id,
    p_sender_id,
    p_recipient_id,
    v_type,
    left(COALESCE(NULLIF(p_source, ''), 'unknown'), 80)
  );

  RETURN v_notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public._insert_validated_notification(
  uuid, uuid, text, jsonb, text, boolean
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notificar_barbeiro_chegada(
  p_professional_id uuid,
  p_type            text,
  p_title           text,
  p_body            text,
  p_data            jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_id    uuid;
  v_client_name text;
  v_title       text;
  v_body        text;
BEGIN

  IF p_type NOT IN ('client_at_shop', 'client_arriving_late', 'client_not_seated')
     OR p_data IS NULL
     OR jsonb_typeof(p_data) <> 'object'
     OR COALESCE(p_data->>'entry_id', '') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' THEN
    RAISE EXCEPTION 'notification_queue_payload_invalid'
      USING ERRCODE = 'P0001';
  END IF;

  v_entry_id := (p_data->>'entry_id')::uuid;

  SELECT COALESCE(p.full_name, 'Cliente')
  INTO   v_client_name
  FROM   public.queue_entries  qe
  LEFT JOIN public.profiles    p  ON p.id = qe.client_id
  WHERE  qe.id              = v_entry_id
    AND  qe.client_id       = auth.uid()
    AND  qe.professional_id = p_professional_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'notification_queue_recipient_forbidden'
      USING ERRCODE = 'P0001';
  END IF;

  v_title := CASE p_type
    WHEN 'client_at_shop'       THEN 'Cliente na barbearia'
    WHEN 'client_arriving_late' THEN 'Cliente a caminho'
    WHEN 'client_not_seated'    THEN 'Cliente ainda nao esta pronto'
  END;

  v_body := CASE p_type
    WHEN 'client_at_shop'       THEN v_client_name || ' confirmou que esta na barbearia.'
    WHEN 'client_arriving_late' THEN v_client_name || ' ainda nao chegou. Aguardando...'
    WHEN 'client_not_seated'    THEN v_client_name || ' avisou que ainda nao esta sentado.'
  END;

  PERFORM public._insert_validated_notification(
    p_professional_id,
    auth.uid(),
    p_type,
    jsonb_build_object('title', v_title, 'body', v_body, 'data', p_data),
    'notificar_barbeiro_chegada',
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notificar_barbeiro_chegada(uuid, text, text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificar_barbeiro_chegada(uuid, text, text, text, jsonb)
  TO authenticated;

COMMIT;

-- MIGRATION: 20260524000001_rebuild_counters_with_atomic_triggers.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.counter_drift_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid        NOT NULL,
  run_at       timestamptz NOT NULL DEFAULT now(),
  counter_id   text        NOT NULL,
  entity_table text        NOT NULL,
  column_name  text        NOT NULL,
  entity_id    uuid        NOT NULL,
  stored_count integer     NOT NULL,
  real_count   integer     NOT NULL,
  drift        integer     NOT NULL,
  corrected    boolean     NOT NULL DEFAULT false,
  dry_run      boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_counter_drift_log_run
  ON public.counter_drift_log (run_id, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_counter_drift_log_entity
  ON public.counter_drift_log (entity_table, entity_id);

ALTER TABLE public.counter_drift_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.counter_drift_log FROM anon, authenticated;

ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS likes_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.likes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.story_views
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.barbershop_interactions
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.professional_likes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.likes
  DROP CONSTRAINT IF EXISTS likes_user_id_content_id_content_type_key;
ALTER TABLE public.story_views
  DROP CONSTRAINT IF EXISTS story_views_story_id_viewer_id_key;
ALTER TABLE public.barbershop_interactions
  DROP CONSTRAINT IF EXISTS barbershop_interactions_barbershop_id_user_id_type_key;
ALTER TABLE public.professional_likes
  DROP CONSTRAINT IF EXISTS professional_likes_professional_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_likes_active
  ON public.likes (user_id, content_id, content_type)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_story_views_active
  ON public.story_views (story_id, viewer_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_barbershop_interactions_active
  ON public.barbershop_interactions (barbershop_id, user_id, type)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_professional_likes_active
  ON public.professional_likes (professional_id, user_id)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.fn_sync_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_active boolean := false;
  v_new_active boolean := false;
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    v_old_active := OLD.deleted_at IS NULL;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new_active := NEW.deleted_at IS NULL;
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE') AND v_old_active THEN
    PERFORM public.apply_like_counter_delta(OLD.content_id, OLD.content_type, -1);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND v_new_active THEN
    PERFORM public.apply_like_counter_delta(NEW.content_id, NEW.content_type, 1);
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_like_counter_delta(
  p_content_id   uuid,
  p_content_type text,
  p_delta        integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN

  CASE p_content_type
    WHEN 'portfolio_image' THEN
      UPDATE public.portfolio_images
      SET    likes_count = GREATEST(0, likes_count + p_delta)
      WHERE  id = p_content_id
        AND  status != 'deleted';
    WHEN 'story' THEN
      UPDATE public.stories
      SET    likes_count = GREATEST(0, likes_count + p_delta)
      WHERE  id = p_content_id;
    ELSE NULL;
  END CASE;

  UPDATE public.feed_items
  SET    likes_count = GREATEST(0, likes_count + p_delta)
  WHERE  source_id   = p_content_id
    AND  source_type = p_content_type;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_likes_count() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_like_counter_delta(uuid, text, integer) FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_likes_count ON public.likes;
CREATE TRIGGER trg_sync_likes_count
  AFTER INSERT OR DELETE ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_likes_count();

DROP TRIGGER IF EXISTS trg_sync_likes_count_soft_delete ON public.likes;
CREATE TRIGGER trg_sync_likes_count_soft_delete
  AFTER UPDATE OF deleted_at, content_id, content_type ON public.likes
  FOR EACH ROW
  WHEN (
    OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR
    OLD.content_id IS DISTINCT FROM NEW.content_id OR
    OLD.content_type IS DISTINCT FROM NEW.content_type
  )
  EXECUTE FUNCTION public.fn_sync_likes_count();

CREATE OR REPLACE FUNCTION public.fn_sync_story_views_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.stories
  SET    views_count = views_count + 1
  WHERE  id = NEW.story_id;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_story_views_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_story_views_count ON public.story_views;
CREATE TRIGGER trg_sync_story_views_count
  AFTER INSERT ON public.story_views
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_story_views_count();

CREATE OR REPLACE FUNCTION public.fn_sync_story_views_count_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.deleted_at IS NULL THEN
    UPDATE public.stories
    SET    views_count = GREATEST(0, views_count - 1)
    WHERE  id = OLD.story_id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_sync_story_views_count_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.story_id IS DISTINCT FROM NEW.story_id THEN
    IF OLD.deleted_at IS NULL THEN
      UPDATE public.stories
      SET    views_count = GREATEST(0, views_count - 1)
      WHERE  id = OLD.story_id;
    END IF;
    IF NEW.deleted_at IS NULL THEN
      UPDATE public.stories
      SET    views_count = views_count + 1
      WHERE  id = NEW.story_id;
    END IF;
  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    UPDATE public.stories
    SET    views_count = GREATEST(0, views_count - 1)
    WHERE  id = NEW.story_id;
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    UPDATE public.stories
    SET    views_count = views_count + 1
    WHERE  id = NEW.story_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_story_views_count_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_sync_story_views_count_soft_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_story_views_count_delete ON public.story_views;
CREATE TRIGGER trg_sync_story_views_count_delete
  AFTER DELETE ON public.story_views
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_story_views_count_delete();

DROP TRIGGER IF EXISTS trg_sync_story_views_count_soft_delete ON public.story_views;
CREATE TRIGGER trg_sync_story_views_count_soft_delete
  AFTER UPDATE OF deleted_at, story_id ON public.story_views
  FOR EACH ROW
  WHEN (
    OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR
    OLD.story_id IS DISTINCT FROM NEW.story_id
  )
  EXECUTE FUNCTION public.fn_sync_story_views_count_soft_delete();

CREATE OR REPLACE FUNCTION public.fn_sync_barbershop_interaction_counts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old_delta_like    integer := 0;
  v_old_delta_dislike integer := 0;
  v_new_delta_like    integer := 0;
  v_new_delta_dislike integer := 0;
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    IF OLD.deleted_at IS NULL THEN
      IF OLD.type = 'like' THEN
        v_old_delta_like := -1;
      ELSIF OLD.type = 'dislike' THEN
        v_old_delta_dislike := -1;
      END IF;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.deleted_at IS NULL THEN
      IF NEW.type = 'like' THEN
        v_new_delta_like := 1;
      ELSIF NEW.type = 'dislike' THEN
        v_new_delta_dislike := 1;
      END IF;
    END IF;
  END IF;

  IF TG_OP IN ('DELETE', 'UPDATE') AND (v_old_delta_like <> 0 OR v_old_delta_dislike <> 0) THEN
    PERFORM public.apply_barbershop_counter_delta(OLD.barbershop_id, v_old_delta_like, v_old_delta_dislike);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND (v_new_delta_like <> 0 OR v_new_delta_dislike <> 0) THEN
    PERFORM public.apply_barbershop_counter_delta(NEW.barbershop_id, v_new_delta_like, v_new_delta_dislike);
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_barbershop_counter_delta(
  p_barbershop_id  uuid,
  p_like_delta     integer,
  p_dislike_delta  integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  WITH next_values AS (
    SELECT
      id,
      GREATEST(0, likes_count + p_like_delta)       AS next_likes,
      GREATEST(0, dislikes_count + p_dislike_delta) AS next_dislikes
    FROM public.barbershops
    WHERE id = p_barbershop_id
  )
    UPDATE public.barbershops
    SET
      likes_count    = nv.next_likes,
      dislikes_count = nv.next_dislikes,
      rating_score = CASE
    WHEN (nv.next_likes + nv.next_dislikes) = 0 THEN 0.0
    ELSE ROUND(
      (3.0 * 5 + ((nv.next_likes * 5.0 + nv.next_dislikes * 1.0) / (nv.next_likes + nv.next_dislikes)) * (nv.next_likes + nv.next_dislikes))
      / (5 + (nv.next_likes + nv.next_dislikes))
    , 1)
  END
  FROM next_values nv
  WHERE public.barbershops.id = nv.id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_barbershop_interaction_counts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_barbershop_counter_delta(uuid, integer, integer) FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_barbershop_rating ON public.barbershop_interactions;
CREATE TRIGGER trg_barbershop_rating
  AFTER INSERT OR DELETE ON public.barbershop_interactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_barbershop_interaction_counts();

DROP TRIGGER IF EXISTS trg_barbershop_rating_soft_delete ON public.barbershop_interactions;
CREATE TRIGGER trg_barbershop_rating_soft_delete
  AFTER UPDATE OF deleted_at, type, barbershop_id ON public.barbershop_interactions
  FOR EACH ROW
  WHEN (
    OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR
    OLD.type IS DISTINCT FROM NEW.type OR
    OLD.barbershop_id IS DISTINCT FROM NEW.barbershop_id
  )
  EXECUTE FUNCTION public.fn_sync_barbershop_interaction_counts();

CREATE OR REPLACE FUNCTION public.fn_sync_professional_likes_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP IN ('DELETE', 'UPDATE') THEN
    IF OLD.deleted_at IS NULL THEN
      UPDATE public.professionals
      SET    rating_count = GREATEST(0, rating_count - 1)
      WHERE  id = OLD.professional_id;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    IF NEW.deleted_at IS NULL THEN
      UPDATE public.professionals
      SET    rating_count = rating_count + 1
      WHERE  id = NEW.professional_id;
    END IF;
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_sync_professional_likes_count() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_professional_likes ON public.professional_likes;
CREATE TRIGGER trg_professional_likes
  AFTER INSERT OR DELETE ON public.professional_likes
  FOR EACH ROW EXECUTE FUNCTION public.fn_sync_professional_likes_count();

DROP TRIGGER IF EXISTS trg_professional_likes_soft_delete ON public.professional_likes;
CREATE TRIGGER trg_professional_likes_soft_delete
  AFTER UPDATE OF deleted_at, professional_id ON public.professional_likes
  FOR EACH ROW
  WHEN (
    OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR
    OLD.professional_id IS DISTINCT FROM NEW.professional_id
  )
  EXECUTE FUNCTION public.fn_sync_professional_likes_count();

CREATE OR REPLACE FUNCTION public.increment_haircuts_count(
  p_barbershop_id uuid,
  p_client_id     uuid
)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.barbershop_mensalistas
  SET    haircuts_count = haircuts_count + 1
  WHERE  barbershop_id = p_barbershop_id
    AND  client_id     = p_client_id
    AND  ends_at       > now()
  RETURNING haircuts_count;
$$;

REVOKE ALL ON FUNCTION public.increment_haircuts_count(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_haircuts_count(uuid, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.rebuild_counter_batch(
  p_counter  text,
  p_after_id uuid    DEFAULT '00000000-0000-0000-0000-000000000000',
  p_limit    integer DEFAULT 500
)
RETURNS TABLE(last_processed_id uuid, rows_updated bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_last_id      uuid;
  v_rows_updated bigint := 0;
BEGIN
  CASE p_counter

    WHEN 'C8' THEN
      WITH batch AS (
        SELECT id FROM public.portfolio_images
        WHERE  id > p_after_id AND status != 'deleted'
        ORDER BY id LIMIT p_limit
      ), upd AS (
        UPDATE public.portfolio_images pi
        SET    likes_count = (
          SELECT COUNT(*) FROM public.likes l
          WHERE  l.content_id   = pi.id
            AND  l.content_type = 'portfolio_image'
            AND  l.deleted_at IS NULL
        )
        FROM   batch WHERE pi.id = batch.id
        RETURNING pi.id
      )
      SELECT COALESCE(MAX(id), p_after_id), COUNT(*) INTO v_last_id, v_rows_updated FROM upd;

    WHEN 'C10' THEN
      WITH batch AS (
        SELECT id FROM public.stories
        WHERE  id > p_after_id
        ORDER BY id LIMIT p_limit
      ), upd AS (
        UPDATE public.stories s
        SET    views_count = (
          SELECT COUNT(*) FROM public.story_views sv
          WHERE sv.story_id = s.id
            AND sv.deleted_at IS NULL
        )
        FROM   batch WHERE s.id = batch.id
        RETURNING s.id
      )
      SELECT COALESCE(MAX(id), p_after_id), COUNT(*) INTO v_last_id, v_rows_updated FROM upd;

    WHEN 'C11' THEN
      WITH batch AS (
        SELECT id FROM public.stories
        WHERE  id > p_after_id
        ORDER BY id LIMIT p_limit
      ), upd AS (
        UPDATE public.stories s
        SET    likes_count = (
          SELECT COUNT(*) FROM public.likes l
          WHERE  l.content_id   = s.id
            AND  l.content_type = 'story'
            AND  l.deleted_at IS NULL
        )
        FROM   batch WHERE s.id = batch.id
        RETURNING s.id
      )
      SELECT COALESCE(MAX(id), p_after_id), COUNT(*) INTO v_last_id, v_rows_updated FROM upd;

    WHEN 'C12' THEN
      WITH batch AS (
        SELECT id FROM public.feed_items
        WHERE  id > p_after_id
        ORDER BY id LIMIT p_limit
      ), upd AS (
        UPDATE public.feed_items fi
        SET    likes_count = (
          SELECT COUNT(*) FROM public.likes l
          WHERE  l.content_id   = fi.source_id
            AND  l.content_type = fi.source_type
            AND  l.deleted_at IS NULL
        )
        FROM   batch WHERE fi.id = batch.id
        RETURNING fi.id
      )
      SELECT COALESCE(MAX(id), p_after_id), COUNT(*) INTO v_last_id, v_rows_updated FROM upd;

    WHEN 'C1' THEN
      WITH batch AS (
        SELECT id FROM public.barbershops
        WHERE id > p_after_id AND is_active = true
        ORDER BY id LIMIT p_limit
      ), upd AS (
        UPDATE public.barbershops b
        SET likes_count = (
          SELECT COUNT(*) FROM public.barbershop_interactions bi
          WHERE bi.barbershop_id = b.id
            AND bi.type = 'like'
            AND bi.deleted_at IS NULL
        )
        FROM batch WHERE b.id = batch.id
        RETURNING b.id
      )
      SELECT COALESCE(MAX(id), p_after_id), COUNT(*) INTO v_last_id, v_rows_updated FROM upd;

    WHEN 'C2' THEN
      WITH batch AS (
        SELECT id FROM public.barbershops
        WHERE id > p_after_id AND is_active = true
        ORDER BY id LIMIT p_limit
      ), upd AS (
        UPDATE public.barbershops b
        SET dislikes_count = (
          SELECT COUNT(*) FROM public.barbershop_interactions bi
          WHERE bi.barbershop_id = b.id
            AND bi.type = 'dislike'
            AND bi.deleted_at IS NULL
        )
        FROM batch WHERE b.id = batch.id
        RETURNING b.id
      )
      SELECT COALESCE(MAX(id), p_after_id), COUNT(*) INTO v_last_id, v_rows_updated FROM upd;

    WHEN 'C3' THEN
      WITH batch AS (
        SELECT id FROM public.barbershops
        WHERE id > p_after_id AND is_active = true
        ORDER BY id LIMIT p_limit
      ), upd AS (
        UPDATE public.barbershops b
        SET rating_score = (
          WITH s AS (
            SELECT
              COUNT(*) FILTER (WHERE type = 'like')    AS lk,
              COUNT(*) FILTER (WHERE type = 'dislike') AS dl
            FROM public.barbershop_interactions
            WHERE barbershop_id = b.id
              AND deleted_at IS NULL
          )
          SELECT CASE WHEN (s.lk + s.dl) = 0 THEN 0.0
                 ELSE ROUND(
                   (3.0 * 5 + ((s.lk * 5.0 + s.dl * 1.0) / (s.lk + s.dl)) * (s.lk + s.dl))
                   / (5 + (s.lk + s.dl))
                 , 1)
                 END FROM s
        )
        FROM batch WHERE b.id = batch.id
        RETURNING b.id
      )
      SELECT COALESCE(MAX(id), p_after_id), COUNT(*) INTO v_last_id, v_rows_updated FROM upd;

    WHEN 'C6' THEN
      WITH batch AS (
        SELECT id FROM public.professionals
        WHERE id > p_after_id AND is_active = true
        ORDER BY id LIMIT p_limit
      ), upd AS (
        UPDATE public.professionals p
        SET rating_count = (
          SELECT COUNT(*) FROM public.professional_likes pl
          WHERE pl.professional_id = p.id
            AND pl.deleted_at IS NULL
        )
        FROM batch WHERE p.id = batch.id
        RETURNING p.id
      )
      SELECT COALESCE(MAX(id), p_after_id), COUNT(*) INTO v_last_id, v_rows_updated FROM upd;

    ELSE
      RAISE EXCEPTION 'rebuild_counter_batch: contador desconhecido: %', p_counter
        USING ERRCODE = 'P0001';
  END CASE;

  last_processed_id := COALESCE(v_last_id, p_after_id);
  rows_updated      := v_rows_updated;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.rebuild_counter_batch(text, uuid, integer)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_counters(
  p_dry_run         boolean DEFAULT false,
  p_alert_threshold numeric DEFAULT 0.05
)
RETURNS TABLE(
  counter_id   text,
  entity_table text,
  column_name  text,
  entity_id    uuid,
  stored_count integer,
  real_count   integer,
  drift        integer,
  corrected    boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_run_id    uuid    := gen_random_uuid();
  v_total     bigint  := 0;
  v_drifted   bigint  := 0;
  v_ratio     numeric;
BEGIN

  FOR entity_id, stored_count, real_count IN
    SELECT pi.id,
           pi.likes_count,
           COUNT(l.id)::integer
    FROM   public.portfolio_images pi
    LEFT JOIN public.likes l
      ON l.content_id   = pi.id
     AND l.content_type = 'portfolio_image'
     AND l.deleted_at IS NULL
    WHERE  pi.status != 'deleted'
    GROUP BY pi.id, pi.likes_count
    HAVING pi.likes_count IS DISTINCT FROM COUNT(l.id)
  LOOP
    counter_id   := 'C8';
    entity_table := 'portfolio_images';
    column_name  := 'likes_count';
    drift        := stored_count - real_count;
    corrected    := NOT p_dry_run;
    v_drifted    := v_drifted + 1;

    IF NOT p_dry_run THEN
      UPDATE public.portfolio_images
      SET    likes_count = real_count
      WHERE  id = entity_id;

      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES
        (v_run_id, 'C8', 'portfolio_images', 'likes_count', entity_id, stored_count, real_count, drift, true, false);
    ELSE
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES
        (v_run_id, 'C8', 'portfolio_images', 'likes_count', entity_id, stored_count, real_count, drift, false, true);
    END IF;

    RETURN NEXT;
  END LOOP;

  SELECT COUNT(*) INTO v_total FROM public.portfolio_images WHERE status != 'deleted';
  IF v_total > 0 THEN
    v_ratio := v_drifted::numeric / v_total;
    IF v_ratio > p_alert_threshold THEN
      RAISE NOTICE 'ALERTA: C8 portfolio_images.likes_count — drift em %.1f%% das entidades (% de %)',
        v_ratio * 100, v_drifted, v_total;
    END IF;
  END IF;
  v_drifted := 0;

  FOR entity_id, stored_count, real_count IN
    SELECT s.id,
           s.views_count,
           COUNT(sv.id)::integer
    FROM   public.stories s
    LEFT JOIN public.story_views sv
      ON sv.story_id = s.id
     AND sv.deleted_at IS NULL
    GROUP BY s.id, s.views_count
    HAVING s.views_count IS DISTINCT FROM COUNT(sv.id)
  LOOP
    counter_id   := 'C10';
    entity_table := 'stories';
    column_name  := 'views_count';
    drift        := stored_count - real_count;
    corrected    := NOT p_dry_run;
    v_drifted    := v_drifted + 1;

    IF NOT p_dry_run THEN
      UPDATE public.stories SET views_count = real_count WHERE id = entity_id;
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C10', 'stories', 'views_count', entity_id, stored_count, real_count, drift, true, false);
    ELSE
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C10', 'stories', 'views_count', entity_id, stored_count, real_count, drift, false, true);
    END IF;

    RETURN NEXT;
  END LOOP;

  SELECT COUNT(*) INTO v_total FROM public.stories;
  IF v_total > 0 THEN
    v_ratio := v_drifted::numeric / v_total;
    IF v_ratio > p_alert_threshold THEN
      RAISE NOTICE 'ALERTA: C10 stories.views_count — drift em %.1f%% (% de %)',
        v_ratio * 100, v_drifted, v_total;
    END IF;
  END IF;
  v_drifted := 0;

  FOR entity_id, stored_count, real_count IN
    SELECT s.id,
           s.likes_count,
           COUNT(l.id)::integer
    FROM   public.stories s
    LEFT JOIN public.likes l
      ON l.content_id   = s.id
     AND l.content_type = 'story'
     AND l.deleted_at IS NULL
    GROUP BY s.id, s.likes_count
    HAVING s.likes_count IS DISTINCT FROM COUNT(l.id)
  LOOP
    counter_id   := 'C11';
    entity_table := 'stories';
    column_name  := 'likes_count';
    drift        := stored_count - real_count;
    corrected    := NOT p_dry_run;
    v_drifted    := v_drifted + 1;

    IF NOT p_dry_run THEN
      UPDATE public.stories SET likes_count = real_count WHERE id = entity_id;
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C11', 'stories', 'likes_count', entity_id, stored_count, real_count, drift, true, false);
    ELSE
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C11', 'stories', 'likes_count', entity_id, stored_count, real_count, drift, false, true);
    END IF;

    RETURN NEXT;
  END LOOP;

  v_drifted := 0;

  FOR entity_id, stored_count, real_count IN
    SELECT fi.id,
           fi.likes_count,
           COUNT(l.id)::integer
    FROM   public.feed_items fi
    LEFT JOIN public.likes l
      ON l.content_id   = fi.source_id
     AND l.content_type = fi.source_type
     AND l.deleted_at IS NULL
    GROUP BY fi.id, fi.likes_count
    HAVING fi.likes_count IS DISTINCT FROM COUNT(l.id)
  LOOP
    counter_id   := 'C12';
    entity_table := 'feed_items';
    column_name  := 'likes_count';
    drift        := stored_count - real_count;
    corrected    := NOT p_dry_run;
    v_drifted    := v_drifted + 1;

    IF NOT p_dry_run THEN
      UPDATE public.feed_items SET likes_count = real_count WHERE id = entity_id;
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C12', 'feed_items', 'likes_count', entity_id, stored_count, real_count, drift, true, false);
    ELSE
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C12', 'feed_items', 'likes_count', entity_id, stored_count, real_count, drift, false, true);
    END IF;

    RETURN NEXT;
  END LOOP;

  SELECT COUNT(*) INTO v_total FROM public.feed_items;
  IF v_total > 0 THEN
    v_ratio := v_drifted::numeric / v_total;
    IF v_ratio > p_alert_threshold THEN
      RAISE NOTICE 'ALERTA: C12 feed_items.likes_count — drift em %.1f%% (% de %)',
        v_ratio * 100, v_drifted, v_total;
    END IF;
  END IF;
  v_drifted := 0;

  FOR entity_id, stored_count, real_count IN
    SELECT b.id,
           b.likes_count,
           COUNT(bi.id) FILTER (WHERE bi.type = 'like' AND bi.deleted_at IS NULL)::integer
    FROM   public.barbershops b
    LEFT JOIN public.barbershop_interactions bi ON bi.barbershop_id = b.id
    WHERE  b.is_active = true
    GROUP BY b.id, b.likes_count
    HAVING b.likes_count IS DISTINCT FROM COUNT(bi.id) FILTER (WHERE bi.type = 'like' AND bi.deleted_at IS NULL)
  LOOP
    counter_id   := 'C1';
    entity_table := 'barbershops';
    column_name  := 'likes_count';
    drift        := stored_count - real_count;
    corrected    := NOT p_dry_run;
    v_drifted    := v_drifted + 1;

    IF NOT p_dry_run THEN
      UPDATE public.barbershops SET likes_count = real_count WHERE id = entity_id;
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C1', 'barbershops', 'likes_count', entity_id, stored_count, real_count, drift, true, false);
    ELSE
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C1', 'barbershops', 'likes_count', entity_id, stored_count, real_count, drift, false, true);
    END IF;

    RETURN NEXT;
  END LOOP;

  FOR entity_id, stored_count, real_count IN
    SELECT b.id,
           b.dislikes_count,
           COUNT(bi.id) FILTER (WHERE bi.type = 'dislike' AND bi.deleted_at IS NULL)::integer
    FROM   public.barbershops b
    LEFT JOIN public.barbershop_interactions bi ON bi.barbershop_id = b.id
    WHERE  b.is_active = true
    GROUP BY b.id, b.dislikes_count
    HAVING b.dislikes_count IS DISTINCT FROM COUNT(bi.id) FILTER (WHERE bi.type = 'dislike' AND bi.deleted_at IS NULL)
  LOOP
    counter_id   := 'C2';
    entity_table := 'barbershops';
    column_name  := 'dislikes_count';
    drift        := stored_count - real_count;
    corrected    := NOT p_dry_run;

    IF NOT p_dry_run THEN
      UPDATE public.barbershops SET dislikes_count = real_count WHERE id = entity_id;
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C2', 'barbershops', 'dislikes_count', entity_id, stored_count, real_count, drift, true, false);
    ELSE
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C2', 'barbershops', 'dislikes_count', entity_id, stored_count, real_count, drift, false, true);
    END IF;

    RETURN NEXT;
  END LOOP;

  FOR entity_id, stored_count, real_count IN
    WITH stats AS (
      SELECT
        b.id,
        b.rating_score::integer AS stored_as_int,
        b.rating_score,
        COUNT(bi.id) FILTER (WHERE bi.type = 'like' AND bi.deleted_at IS NULL)    AS lk,
        COUNT(bi.id) FILTER (WHERE bi.type = 'dislike' AND bi.deleted_at IS NULL) AS dl
      FROM public.barbershops b
      LEFT JOIN public.barbershop_interactions bi ON bi.barbershop_id = b.id
      WHERE b.is_active = true
      GROUP BY b.id, b.rating_score
    ), calc AS (
      SELECT
        id,
        rating_score,
        CASE WHEN (lk + dl) = 0 THEN 0.0
             ELSE ROUND((3.0 * 5 + ((lk * 5.0 + dl * 1.0) / (lk + dl)) * (lk + dl)) / (5 + (lk + dl)), 1)
        END AS expected_score
      FROM stats
    )
    SELECT id, (rating_score * 10)::integer, (expected_score * 10)::integer
    FROM calc
    WHERE rating_score IS DISTINCT FROM expected_score
  LOOP
    counter_id   := 'C3';
    entity_table := 'barbershops';
    column_name  := 'rating_score_x10';
    drift        := stored_count - real_count;
    corrected    := NOT p_dry_run;

    IF NOT p_dry_run THEN
      UPDATE public.barbershops b
      SET rating_score = (real_count::numeric / 10)
      WHERE id = entity_id;
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C3', 'barbershops', 'rating_score_x10', entity_id, stored_count, real_count, drift, true, false);
    ELSE
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C3', 'barbershops', 'rating_score_x10', entity_id, stored_count, real_count, drift, false, true);
    END IF;

    RETURN NEXT;
  END LOOP;

  FOR entity_id, stored_count, real_count IN
    SELECT p.id,
           p.rating_count,
           COUNT(pl.id)::integer
    FROM   public.professionals p
    LEFT JOIN public.professional_likes pl
      ON pl.professional_id = p.id
     AND pl.deleted_at IS NULL
    WHERE  p.is_active = true
    GROUP BY p.id, p.rating_count
    HAVING p.rating_count IS DISTINCT FROM COUNT(pl.id)
  LOOP
    counter_id   := 'C6';
    entity_table := 'professionals';
    column_name  := 'rating_count';
    drift        := stored_count - real_count;
    corrected    := NOT p_dry_run;

    IF NOT p_dry_run THEN
      UPDATE public.professionals SET rating_count = real_count WHERE id = entity_id;
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C6', 'professionals', 'rating_count', entity_id, stored_count, real_count, drift, true, false);
    ELSE
      INSERT INTO public.counter_drift_log
        (run_id, counter_id, entity_table, column_name, entity_id, stored_count, real_count, drift, corrected, dry_run)
      VALUES (v_run_id, 'C6', 'professionals', 'rating_count', entity_id, stored_count, real_count, drift, false, true);
    END IF;

    RETURN NEXT;
  END LOOP;

END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_counters(boolean, numeric)
  FROM PUBLIC, anon, authenticated;

UPDATE public.portfolio_images pi
SET    likes_count = (
  SELECT COUNT(*) FROM public.likes l
  WHERE  l.content_id   = pi.id
    AND  l.content_type = 'portfolio_image'
    AND  l.deleted_at IS NULL
)
WHERE  pi.status != 'deleted';

UPDATE public.stories s
SET    views_count = (
  SELECT COUNT(*) FROM public.story_views sv
  WHERE sv.story_id = s.id
    AND sv.deleted_at IS NULL
);

UPDATE public.stories s
SET    likes_count = (
  SELECT COUNT(*) FROM public.likes l
  WHERE  l.content_id   = s.id
    AND  l.content_type = 'story'
    AND  l.deleted_at IS NULL
);

UPDATE public.feed_items fi
SET    likes_count = (
  SELECT COUNT(*) FROM public.likes l
  WHERE  l.content_id   = fi.source_id
    AND  l.content_type = fi.source_type
    AND  l.deleted_at IS NULL
);

UPDATE public.barbershops b
SET
  likes_count    = (
    SELECT COUNT(*) FILTER (WHERE type = 'like')
    FROM   public.barbershop_interactions bi
    WHERE  bi.barbershop_id = b.id
      AND  bi.deleted_at IS NULL
  ),
  dislikes_count = (
    SELECT COUNT(*) FILTER (WHERE type = 'dislike')
    FROM   public.barbershop_interactions bi
    WHERE  bi.barbershop_id = b.id
      AND  bi.deleted_at IS NULL
  )
WHERE b.is_active = true;

UPDATE public.barbershops b
SET rating_score = (
  WITH s AS (
    SELECT
      COUNT(*) FILTER (WHERE type = 'like')    AS lk,
      COUNT(*) FILTER (WHERE type = 'dislike') AS dl
    FROM public.barbershop_interactions
    WHERE barbershop_id = b.id
      AND deleted_at IS NULL
  )
  SELECT CASE WHEN (s.lk + s.dl) = 0 THEN 0.0
         ELSE ROUND(
           (3.0 * 5 + ((s.lk * 5.0 + s.dl * 1.0) / (s.lk + s.dl)) * (s.lk + s.dl))
           / (5 + (s.lk + s.dl))
         , 1)
         END FROM s
)
WHERE b.is_active = true;

UPDATE public.professionals p
SET rating_count = (
  SELECT COUNT(*) FROM public.professional_likes pl
  WHERE pl.professional_id = p.id
    AND pl.deleted_at IS NULL
)
WHERE p.is_active = true;

COMMIT;

-- MIGRATION: 20260524000002_fix_aplicar_desconto_metodo_user_id.sql
CREATE OR REPLACE FUNCTION public.aplicar_desconto_metodo(
  p_barbershop_id uuid,
  p_metodo        text,
  p_de            timestamptz,
  p_ate           timestamptz,
  p_porcentagem   numeric,
  p_user_id       uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

  IF p_porcentagem <= 0 OR p_porcentagem >= 100 THEN
    RAISE EXCEPTION 'porcentagem deve ser > 0 e < 100';
  END IF;

  IF p_metodo NOT IN ('credito', 'debito', 'credit', 'debit') THEN
    RAISE EXCEPTION 'metodo inválido: %', p_metodo;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.barbershops
    WHERE id = p_barbershop_id AND owner_id = p_user_id
    UNION ALL
    SELECT 1 FROM public.professional_shop_links
    WHERE barbershop_id = p_barbershop_id
      AND professional_id = p_user_id
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  UPDATE public.transactions
  SET amount = ROUND(COALESCE(gross_amount, amount) * (1 - p_porcentagem / 100.0), 2)
  WHERE barbershop_id = p_barbershop_id
    AND payment_method = p_metodo
    AND type   = 'revenue'
    AND status = 'paid'
    AND paid_at BETWEEN p_de AND p_ate;
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_desconto_metodo(uuid, text, timestamptz, timestamptz, numeric)
  FROM PUBLIC, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.aplicar_desconto_metodo(uuid, text, timestamptz, timestamptz, numeric, uuid)
  TO service_role;

-- MIGRATION: 20260525000001_professionals_since_year.sql
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS since_year integer;

ALTER TABLE public.professionals
  DROP CONSTRAINT IF EXISTS professionals_since_year_range_chk;

ALTER TABLE public.professionals
  ADD CONSTRAINT professionals_since_year_range_chk
  CHECK (
    since_year IS NULL
    OR (
      since_year >= 1950
      AND since_year <= EXTRACT(YEAR FROM CURRENT_DATE)::integer
    )
  );

COMMENT ON COLUMN public.professionals.since_year IS
  'Ano desde quando o profissional corta cabelo. Exposto no perfil publico via BFF.';

-- MIGRATION: 20260525000002_media_variant_optimization_metadata.sql
alter table public.media_variants
  add column if not exists width integer check (width is null or width > 0),
  add column if not exists height integer check (height is null or height > 0),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.media_variants.width is 'Optimized variant width in pixels.';
comment on column public.media_variants.height is 'Optimized variant height in pixels.';
comment on column public.media_variants.metadata is 'Non-sensitive optimization metadata such as preset, mimeType and encoded size.';

-- MIGRATION: 20260525000004_barbershop_invites.sql
CREATE TABLE IF NOT EXISTS public.barbershop_invites (
  id             uuid         PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbershop_id  uuid         NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  barbeiro_id    uuid         NOT NULL REFERENCES public.profiles(id)    ON DELETE CASCADE,
  commission_pct numeric(8,2) NOT NULL DEFAULT 0,
  message        text,
  status         text         NOT NULL DEFAULT 'pendente'
                               CHECK (status IN ('pendente', 'aceito', 'recusado')),
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.barbershop_invites IS
  'Convites enviados por donos de barbearias a barbeiros autônomos para trabalhar no espaço.';

CREATE UNIQUE INDEX barbershop_invites_pendente_unique
  ON public.barbershop_invites (barbershop_id, barbeiro_id)
  WHERE status = 'pendente';

CREATE INDEX idx_barbershop_invites_shop    ON public.barbershop_invites (barbershop_id, status);
CREATE INDEX idx_barbershop_invites_barb    ON public.barbershop_invites (barbeiro_id,   status);

ALTER TABLE public.barbershop_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_select_convites"
  ON public.barbershop_invites FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.barbershops
      WHERE id = barbershop_invites.barbershop_id
        AND owner_id = auth.uid()
    )
  );

CREATE POLICY "owner_insert_convites"
  ON public.barbershop_invites FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.barbershops
      WHERE id = barbershop_invites.barbershop_id
        AND owner_id = auth.uid()
    )
  );

CREATE POLICY "barbeiro_select_convites"
  ON public.barbershop_invites FOR SELECT
  USING (barbeiro_id = auth.uid());

CREATE POLICY "barbeiro_update_convites"
  ON public.barbershop_invites FOR UPDATE
  USING  (barbeiro_id = auth.uid())
  WITH CHECK (
    barbeiro_id = auth.uid()
    AND status IN ('aceito', 'recusado')
  );

-- MIGRATION: 20260529000001_queue_entries_professional_ownership.sql
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

-- MIGRATION: 20260530000001_servico_tipo_e_mensalidade.sql
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS price_half numeric(8,2);

COMMENT ON COLUMN public.services.price_half IS
  'Preco da variante "meia" (ex.: Luzes meia). price = variante inteira.';

ALTER TABLE public.barbershops
  ADD COLUMN IF NOT EXISTS monthly_plan_price   numeric(10,2),
  ADD COLUMN IF NOT EXISTS monthly_plan_message text;

COMMENT ON COLUMN public.barbershops.monthly_plan_price IS
  'Valor da mensalidade anunciada no banner da pagina publica (null = sem banner).';
COMMENT ON COLUMN public.barbershops.monthly_plan_message IS
  'Mensagem promocional exibida no banner de mensalidade.';

-- MIGRATION: 20260531000001_portfolio_messages_index.sql
CREATE INDEX IF NOT EXISTS idx_chat_conversations_portfolio_image_id
  ON public.chat_conversations USING gin (metadata jsonb_path_ops)
  WHERE metadata ? 'portfolioImageId';

COMMENT ON INDEX idx_chat_conversations_portfolio_image_id
  IS 'Busca rápida de conversas originadas de uma imagem de portfólio via metadata->portfolioImageId';

-- MIGRATION: 20260531000002_domain_events_outbox.sql
CREATE TABLE IF NOT EXISTS public.domain_events_outbox (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name   text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  queue        text NOT NULL,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','processing','done','failed')),
  attempts     integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_created
  ON public.domain_events_outbox(status, created_at)
  WHERE status = 'pending';

ALTER TABLE public.domain_events_outbox ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.domain_events_outbox
  IS 'Outbox Pattern: eventos de domínio pendentes de entrega pelo BFF (service_role only)';

-- MIGRATION: 20260531000003_portfolio_messages.sql
CREATE TABLE IF NOT EXISTS public.portfolio_messages (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_image_id uuid        NOT NULL,
  professional_id    uuid        NOT NULL,
  sender_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body               text        NOT NULL CHECK (char_length(body) BETWEEN 1 AND 240),
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_messages_image
  ON public.portfolio_messages(portfolio_image_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_portfolio_messages_professional
  ON public.portfolio_messages(professional_id, created_at DESC);

ALTER TABLE public.portfolio_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profissional_le_mensagens_portfolio"
  ON public.portfolio_messages FOR SELECT
  USING (auth.uid() = professional_id);

CREATE POLICY "cliente_envia_mensagem_portfolio"
  ON public.portfolio_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

COMMENT ON TABLE public.portfolio_messages
  IS 'Reações e mensagens de clientes em imagens de portfólio de barbeiros';

-- MIGRATION: 20260531000004_reset_portfolio_likes.sql
DELETE FROM public.likes WHERE content_type = 'portfolio_image';

UPDATE public.portfolio_images SET likes_count = 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_likes_unique_user_content
  ON public.likes(user_id, content_id, content_type);

COMMENT ON INDEX idx_likes_unique_user_content
  IS 'Garante que cada usuário só pode curtir uma vez por conteúdo';

-- MIGRATION: 20260601000001_reset_curtidas_zero.sql
DELETE FROM public.likes WHERE content_type = 'portfolio_image';

UPDATE public.portfolio_images SET likes_count = 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_likes_unique_user_content
  ON public.likes(user_id, content_id, content_type);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'likes_unique_per_user_content'
  ) THEN
    ALTER TABLE public.likes
      ADD CONSTRAINT likes_unique_per_user_content
      UNIQUE (user_id, content_id, content_type);
  END IF;
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- MIGRATION: 20260601000002_chat_find_or_create.sql
CREATE OR REPLACE FUNCTION public.find_or_create_direct_conversation(
  p_user_a uuid,
  p_user_b uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_conv_id uuid;
BEGIN

  SELECT c.id INTO v_conv_id
  FROM chat_conversations c
  WHERE c.type = 'direct'
    AND c.archived_at IS NULL
    AND EXISTS (
      SELECT 1 FROM chat_participants
      WHERE conversation_id = c.id AND user_id = p_user_a AND left_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM chat_participants
      WHERE conversation_id = c.id AND user_id = p_user_b AND left_at IS NULL
    )
    AND (
      SELECT COUNT(*) FROM chat_participants cp
      WHERE cp.conversation_id = c.id AND cp.left_at IS NULL
    ) = 2
  LIMIT 1;

  IF v_conv_id IS NOT NULL THEN
    RETURN v_conv_id;
  END IF;

  INSERT INTO chat_conversations (type, created_by)
  VALUES ('direct', p_user_a)
  RETURNING id INTO v_conv_id;

  INSERT INTO chat_participants (conversation_id, user_id, role)
  VALUES
    (v_conv_id, p_user_a, 'owner'),
    (v_conv_id, p_user_b, 'member');

  RETURN v_conv_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_conversations_for_user(
  p_user_id uuid
)
RETURNS TABLE (
  id                      uuid,
  type                    text,
  created_at              timestamptz,
  last_message_body       text,
  last_message_at         timestamptz,
  last_message_sender_id  uuid,
  unread_count            bigint,
  other_participant_ids   uuid[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    c.id,
    c.type,
    c.created_at,
    lm.body           AS last_message_body,
    lm.created_at     AS last_message_at,
    lm.sender_id      AS last_message_sender_id,
    COALESCE(unread.cnt, 0)::bigint AS unread_count,
    ARRAY(
      SELECT op.user_id
      FROM chat_participants op
      WHERE op.conversation_id = c.id
        AND op.user_id <> p_user_id
        AND op.left_at IS NULL
    ) AS other_participant_ids
  FROM chat_conversations c
  JOIN chat_participants me
    ON me.conversation_id = c.id
   AND me.user_id = p_user_id
   AND me.left_at IS NULL
  LEFT JOIN LATERAL (
    SELECT body, created_at, sender_id
    FROM chat_messages
    WHERE conversation_id = c.id
      AND deleted_at IS NULL
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM chat_messages m2
    WHERE m2.conversation_id = c.id
      AND m2.sender_id <> p_user_id
      AND m2.deleted_at IS NULL
      AND (
        me.last_read_message_id IS NULL
        OR m2.created_at > (
          SELECT created_at FROM chat_messages
          WHERE id = me.last_read_message_id
        )
      )
  ) unread ON true
  WHERE c.archived_at IS NULL
  ORDER BY COALESCE(lm.created_at, c.created_at) DESC NULLS LAST;
$$;

CREATE INDEX IF NOT EXISTS idx_chat_messages_conv_latest
  ON public.chat_messages(conversation_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_conversations_select" ON public.chat_conversations;
CREATE POLICY "chat_conversations_select"
  ON public.chat_conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_participants
      WHERE conversation_id = id
        AND user_id = auth.uid()
        AND left_at IS NULL
    )
  );

DROP POLICY IF EXISTS "chat_participants_select" ON public.chat_participants;
CREATE POLICY "chat_participants_select"
  ON public.chat_participants FOR SELECT
  USING (
    conversation_id IN (
      SELECT conversation_id FROM public.chat_participants
      WHERE user_id = auth.uid() AND left_at IS NULL
    )
  );

-- MIGRATION: 20260601000002_zerar_curtidas_agora.sql
DELETE FROM public.likes WHERE content_type = 'portfolio_image';

UPDATE public.portfolio_images SET likes_count = 0;

-- MIGRATION: 20260601000003_cascade_delete_portfolio.sql
CREATE OR REPLACE FUNCTION public.limpar_dados_portfolio_image()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN

  DELETE FROM public.likes
  WHERE content_id = OLD.id AND content_type = 'portfolio_image';

  DELETE FROM public.portfolio_messages
  WHERE portfolio_image_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_limpar_dados_portfolio_image ON public.portfolio_images;
CREATE TRIGGER trg_limpar_dados_portfolio_image
  BEFORE DELETE ON public.portfolio_images
  FOR EACH ROW EXECUTE FUNCTION public.limpar_dados_portfolio_image();

COMMENT ON TRIGGER trg_limpar_dados_portfolio_image ON public.portfolio_images
  IS 'Remove likes e portfolio_messages antes de deletar a imagem';

-- MIGRATION: 20260603000001_professional_barbershop_presence.sql
CREATE TABLE IF NOT EXISTS public.professional_barbershop_presence (
  barbershop_id   uuid NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  is_available    boolean NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (barbershop_id, professional_id)
);

COMMENT ON TABLE public.professional_barbershop_presence IS
  'Disponibilidade operacional do barbeiro parceiro na barbearia. Nao confundir com vinculo ativo.';

CREATE INDEX IF NOT EXISTS idx_pbp_barbershop_available
  ON public.professional_barbershop_presence (barbershop_id, is_available);

DROP TRIGGER IF EXISTS trg_professional_barbershop_presence_updated_at
  ON public.professional_barbershop_presence;
CREATE TRIGGER trg_professional_barbershop_presence_updated_at
  BEFORE UPDATE ON public.professional_barbershop_presence
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.professional_barbershop_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pbp_select_public" ON public.professional_barbershop_presence;
CREATE POLICY "pbp_select_public"
  ON public.professional_barbershop_presence
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "pbp_insert_linked_professional" ON public.professional_barbershop_presence;
CREATE POLICY "pbp_insert_linked_professional"
  ON public.professional_barbershop_presence
  FOR INSERT
  WITH CHECK (
    auth.uid() = professional_id
    AND updated_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.professional_shop_links psl
      WHERE psl.barbershop_id = professional_barbershop_presence.barbershop_id
        AND psl.professional_id = auth.uid()
        AND psl.is_active = true
    )
  );

DROP POLICY IF EXISTS "pbp_update_linked_professional" ON public.professional_barbershop_presence;
CREATE POLICY "pbp_update_linked_professional"
  ON public.professional_barbershop_presence
  FOR UPDATE
  USING (
    auth.uid() = professional_id
    AND EXISTS (
      SELECT 1
      FROM public.professional_shop_links psl
      WHERE psl.barbershop_id = professional_barbershop_presence.barbershop_id
        AND psl.professional_id = auth.uid()
        AND psl.is_active = true
    )
  )
  WITH CHECK (
    auth.uid() = professional_id
    AND updated_by = auth.uid()
  );

-- MIGRATION: 20260604000001_professional_barbershop_presence_realtime.sql
ALTER TABLE public.professional_barbershop_presence REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'professional_barbershop_presence'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.professional_barbershop_presence;
  END IF;
END $$;

-- MIGRATION: 20260604000002_chat_realtime_private_channels.sql
DROP POLICY IF EXISTS "chat_private_channel_select_own"
  ON realtime.messages;

CREATE POLICY "chat_private_channel_select_own"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.topic() = 'chat.' || auth.uid()::text
  );

COMMENT ON POLICY "chat_private_channel_select_own"
  ON realtime.messages
  IS 'Permite assinatura privada do canal chat.{userId} apenas ao proprio usuario autenticado.';

-- MIGRATION: 20260605000001_user_keys.sql
CREATE TABLE IF NOT EXISTS public.user_keys (
  user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  public_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_keys_select_authenticated" ON public.user_keys;
CREATE POLICY "user_keys_select_authenticated"
  ON public.user_keys
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "user_keys_insert_own" ON public.user_keys;
CREATE POLICY "user_keys_insert_own"
  ON public.user_keys
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_keys_update_own" ON public.user_keys;
CREATE POLICY "user_keys_update_own"
  ON public.user_keys
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE public.user_keys IS
  'Chaves públicas ECDH P-256 de longo prazo dos usuários para E2E do chat. Chave privada permanece no browser.';

-- MIGRATION: 20260605000002_financial_payment_method_fees.sql
CREATE TABLE IF NOT EXISTS public.financial_payment_method_fees (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbershop_id  uuid NOT NULL REFERENCES public.barbershops(id) ON DELETE CASCADE,
  payment_method text NOT NULL,
  fee_percent    numeric(5,2) NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_fpmf_method CHECK (payment_method IN ('debit', 'credit')),
  CONSTRAINT chk_fpmf_fee_percent CHECK (fee_percent >= 0 AND fee_percent <= 30),
  CONSTRAINT uq_fpmf_shop_method UNIQUE (barbershop_id, payment_method)
);

COMMENT ON TABLE public.financial_payment_method_fees IS
  'Taxas percentuais de debito/credito usadas pela BFF para calcular resumo financeiro por metodo. Nao altera transacoes.';

CREATE INDEX IF NOT EXISTS idx_fpmf_barbershop
  ON public.financial_payment_method_fees (barbershop_id);

DROP TRIGGER IF EXISTS trg_financial_payment_method_fees_updated_at
  ON public.financial_payment_method_fees;
CREATE TRIGGER trg_financial_payment_method_fees_updated_at
  BEFORE UPDATE ON public.financial_payment_method_fees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.financial_payment_method_fees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fpmf_select_shop_members" ON public.financial_payment_method_fees;
CREATE POLICY "fpmf_select_shop_members"
  ON public.financial_payment_method_fees
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = financial_payment_method_fees.barbershop_id
        AND b.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.professional_shop_links psl
      WHERE psl.barbershop_id = financial_payment_method_fees.barbershop_id
        AND psl.professional_id = auth.uid()
        AND psl.is_active = true
    )
  );

DROP POLICY IF EXISTS "fpmf_insert_owner" ON public.financial_payment_method_fees;
CREATE POLICY "fpmf_insert_owner"
  ON public.financial_payment_method_fees
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = financial_payment_method_fees.barbershop_id
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "fpmf_update_owner" ON public.financial_payment_method_fees;
CREATE POLICY "fpmf_update_owner"
  ON public.financial_payment_method_fees
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = financial_payment_method_fees.barbershop_id
        AND b.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = financial_payment_method_fees.barbershop_id
        AND b.owner_id = auth.uid()
    )
  );

-- MIGRATION: 20260605000003_professional_payouts.sql
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.professional_payouts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbershop_id   uuid NOT NULL REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  amount          numeric(12,2) NOT NULL CHECK (amount > 0),
  period_start    timestamptz NOT NULL,
  period_end      timestamptz NOT NULL,
  status          text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'failed', 'cancelled')),
  paid_at         timestamptz,
  created_by      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professional_payouts_period_check CHECK (period_start <= period_end),
  CONSTRAINT professional_payouts_paid_at_check CHECK (
    (status = 'confirmed' AND paid_at IS NOT NULL)
    OR (status <> 'confirmed' AND paid_at IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.professional_payout_items (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  payout_id      uuid NOT NULL REFERENCES public.professional_payouts(id) ON DELETE CASCADE,
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE RESTRICT,
  amount         numeric(12,2) NOT NULL CHECK (amount > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professional_payout_items_transaction_unique UNIQUE (transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_professional_payouts_shop_prof_status_paid
  ON public.professional_payouts (barbershop_id, professional_id, status, paid_at);

CREATE INDEX IF NOT EXISTS idx_professional_payout_items_payout
  ON public.professional_payout_items (payout_id);

CREATE INDEX IF NOT EXISTS idx_professional_payout_items_transaction
  ON public.professional_payout_items (transaction_id);

DROP TRIGGER IF EXISTS trg_professional_payouts_updated_at
  ON public.professional_payouts;
CREATE TRIGGER trg_professional_payouts_updated_at
  BEFORE UPDATE ON public.professional_payouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.professional_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_payout_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "professional_payouts_select_shop_owner_or_self"
  ON public.professional_payouts;
CREATE POLICY "professional_payouts_select_shop_owner_or_self"
  ON public.professional_payouts
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = professional_payouts.barbershop_id
        AND b.owner_id = auth.uid()
    )
    OR professional_payouts.professional_id = auth.uid()
  );

DROP POLICY IF EXISTS "professional_payouts_insert_owner"
  ON public.professional_payouts;
CREATE POLICY "professional_payouts_insert_owner"
  ON public.professional_payouts
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = professional_payouts.barbershop_id
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "professional_payouts_update_owner"
  ON public.professional_payouts;
CREATE POLICY "professional_payouts_update_owner"
  ON public.professional_payouts
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = professional_payouts.barbershop_id
        AND b.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = professional_payouts.barbershop_id
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "professional_payout_items_select_via_payout"
  ON public.professional_payout_items;
CREATE POLICY "professional_payout_items_select_via_payout"
  ON public.professional_payout_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.professional_payouts p
      WHERE p.id = professional_payout_items.payout_id
        AND (
          EXISTS (
            SELECT 1
            FROM public.barbershops b
            WHERE b.id = p.barbershop_id
              AND b.owner_id = auth.uid()
          )
          OR p.professional_id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "professional_payout_items_insert_owner"
  ON public.professional_payout_items;
CREATE POLICY "professional_payout_items_insert_owner"
  ON public.professional_payout_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.professional_payouts p
      JOIN public.barbershops b ON b.id = p.barbershop_id
      WHERE p.id = professional_payout_items.payout_id
        AND b.owner_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.confirmar_professional_payout_atomic(
  p_barbershop_id uuid,
  p_professional_id uuid,
  p_amount numeric,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_created_by uuid,
  p_transaction_ids uuid[],
  p_item_amounts numeric[]
)
RETURNS TABLE (
  id uuid,
  barbershop_id uuid,
  professional_id uuid,
  amount numeric,
  period_start timestamptz,
  period_end timestamptz,
  status text,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout_id uuid;
  v_paid_at timestamptz := now();
  v_transaction_count integer;
  v_distinct_transaction_count integer;
  v_item_total numeric;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'p_amount must be positive' USING ERRCODE = '22023';
  END IF;

  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_start > p_period_end THEN
    RAISE EXCEPTION 'invalid payout period' USING ERRCODE = '22023';
  END IF;

  IF coalesce(array_length(p_transaction_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'p_transaction_ids must not be empty' USING ERRCODE = '22023';
  END IF;

  IF array_length(p_transaction_ids, 1) <> array_length(p_item_amounts, 1) THEN
    RAISE EXCEPTION 'transaction and amount arrays must have same length' USING ERRCODE = '22023';
  END IF;

  IF auth.role() <> 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_created_by THEN
      RAISE EXCEPTION 'payout creator does not match authenticated user' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.barbershops b
    WHERE b.id = p_barbershop_id
      AND b.owner_id = p_created_by
  ) THEN
    RAISE EXCEPTION 'payout creator is not barbershop owner' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.barbershops b
    WHERE b.id = p_barbershop_id
      AND (
        b.owner_id = p_professional_id
        OR EXISTS (
          SELECT 1
          FROM public.professional_shop_links psl
          WHERE psl.barbershop_id = p_barbershop_id
            AND psl.professional_id = p_professional_id
            AND psl.is_active = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'professional is not linked to barbershop' USING ERRCODE = '23503';
  END IF;

  SELECT
    count(*),
    count(DISTINCT tx.transaction_id),
    coalesce(sum(amounts.item_amount), 0)
  INTO v_transaction_count, v_distinct_transaction_count, v_item_total
  FROM unnest(p_transaction_ids) WITH ORDINALITY AS tx(transaction_id, ord)
  JOIN unnest(p_item_amounts) WITH ORDINALITY AS amounts(item_amount, ord)
    ON amounts.ord = tx.ord;

  IF v_transaction_count <> v_distinct_transaction_count THEN
    RAISE EXCEPTION 'duplicate transaction in payout payload' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_item_amounts) AS amounts(item_amount)
    WHERE amounts.item_amount <= 0
  ) THEN
    RAISE EXCEPTION 'item amounts must be positive' USING ERRCODE = '22023';
  END IF;

  IF round(v_item_total, 2) <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'payout amount does not match item total' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*)
    FROM public.transactions t
    WHERE t.id = ANY(p_transaction_ids)
      AND t.barbershop_id = p_barbershop_id
      AND t.professional_id = p_professional_id
      AND t.type = 'revenue'
      AND t.status = 'paid'
      AND t.paid_at >= p_period_start
      AND t.paid_at <= p_period_end
  ) <> v_transaction_count THEN
    RAISE EXCEPTION 'payout contains ineligible or missing transactions' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.professional_payouts (
    barbershop_id,
    professional_id,
    amount,
    period_start,
    period_end,
    status,
    paid_at,
    created_by
  )
  VALUES (
    p_barbershop_id,
    p_professional_id,
    p_amount,
    p_period_start,
    p_period_end,
    'confirmed',
    v_paid_at,
    p_created_by
  )
  RETURNING professional_payouts.id INTO v_payout_id;

  INSERT INTO public.professional_payout_items (
    payout_id,
    transaction_id,
    amount
  )
  SELECT
    v_payout_id,
    tx.transaction_id,
    amounts.item_amount
  FROM unnest(p_transaction_ids) WITH ORDINALITY AS tx(transaction_id, ord)
  JOIN unnest(p_item_amounts) WITH ORDINALITY AS amounts(item_amount, ord)
    ON amounts.ord = tx.ord;

  RETURN QUERY
  SELECT
    p.id,
    p.barbershop_id,
    p.professional_id,
    p.amount,
    p.period_start,
    p.period_end,
    p.status,
    p.paid_at,
    p.created_by,
    p.created_at,
    p.updated_at
  FROM public.professional_payouts p
  WHERE p.id = v_payout_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_professional_payout_atomic(
  uuid,
  uuid,
  numeric,
  timestamptz,
  timestamptz,
  uuid,
  uuid[],
  numeric[]
) TO authenticated, service_role;

-- MIGRATION: 20260605000004_professional_weekly_settlements.sql
CREATE TABLE IF NOT EXISTS public.professional_weekly_settlements (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  barbershop_id   uuid NOT NULL REFERENCES public.barbershops(id) ON DELETE RESTRICT,
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE RESTRICT,
  period_start    timestamptz NOT NULL,
  period_end      timestamptz NOT NULL,
  gross_amount    numeric(12,2) NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
  shop_amount     numeric(12,2) NOT NULL DEFAULT 0 CHECK (shop_amount >= 0),
  barber_amount   numeric(12,2) NOT NULL DEFAULT 0 CHECK (barber_amount >= 0),
  fees_amount     numeric(12,2) NOT NULL DEFAULT 0 CHECK (fees_amount >= 0),
  net_amount      numeric(12,2) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
  status          text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid')),
  confirmed_at    timestamptz NOT NULL,
  confirmed_by    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professional_weekly_settlements_period_check CHECK (period_start <= period_end),
  CONSTRAINT professional_weekly_settlements_confirmed_by_check CHECK (confirmed_by = professional_id),
  CONSTRAINT professional_weekly_settlements_unique_week UNIQUE (
    barbershop_id,
    professional_id,
    period_start,
    period_end
  )
);

CREATE INDEX IF NOT EXISTS idx_prof_weekly_settlements_shop_prof_period
  ON public.professional_weekly_settlements (barbershop_id, professional_id, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_prof_weekly_settlements_status_confirmed
  ON public.professional_weekly_settlements (status, confirmed_at DESC);

DROP TRIGGER IF EXISTS trg_professional_weekly_settlements_updated_at
  ON public.professional_weekly_settlements;
CREATE TRIGGER trg_professional_weekly_settlements_updated_at
  BEFORE UPDATE ON public.professional_weekly_settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.professional_weekly_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "professional_weekly_settlements_select_owner_or_self"
  ON public.professional_weekly_settlements;
CREATE POLICY "professional_weekly_settlements_select_owner_or_self"
  ON public.professional_weekly_settlements
  FOR SELECT
  USING (
    professional_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = professional_weekly_settlements.barbershop_id
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "professional_weekly_settlements_insert_self"
  ON public.professional_weekly_settlements;
CREATE POLICY "professional_weekly_settlements_insert_self"
  ON public.professional_weekly_settlements
  FOR INSERT
  WITH CHECK (
    professional_id = auth.uid()
    AND confirmed_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.professional_shop_links psl
      WHERE psl.barbershop_id = professional_weekly_settlements.barbershop_id
        AND psl.professional_id = auth.uid()
        AND psl.is_active = true
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = professional_weekly_settlements.barbershop_id
        AND b.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "professional_weekly_settlements_update_self"
  ON public.professional_weekly_settlements;
CREATE POLICY "professional_weekly_settlements_update_self"
  ON public.professional_weekly_settlements
  FOR UPDATE
  USING (
    professional_id = auth.uid()
    AND confirmed_by = auth.uid()
  )
  WITH CHECK (
    professional_id = auth.uid()
    AND confirmed_by = auth.uid()
  );

-- MIGRATION: 20260606000001_chat_e2e_storage.sql
DROP FUNCTION IF EXISTS public.get_chat_messages_reverse(uuid, integer, timestamptz, uuid);

CREATE OR REPLACE FUNCTION public.get_chat_messages_reverse(
  p_conversation_id uuid,
  p_limit integer DEFAULT 30,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  client_message_id text,
  body text,
  encrypted_payload jsonb,
  e2e_key_version integer,
  created_at timestamptz,
  deleted_at timestamptz,
  retention_until timestamptz,
  attachments jsonb
)
LANGUAGE sql
STABLE
AS $$
  SELECT m.id,
         m.conversation_id,
         m.sender_id,
         m.client_message_id,
         CASE WHEN m.deleted_at IS NULL THEN m.body ELSE '' END AS body,
         CASE WHEN m.deleted_at IS NULL THEN m.encrypted_payload ELSE NULL END AS encrypted_payload,
         m.e2e_key_version,
         m.created_at,
         m.deleted_at,
         m.retention_until,
         COALESCE(
           jsonb_agg(
             jsonb_build_object('media_id', a.media_id, 'variant', a.variant, 'kind', a.kind)
             ORDER BY a.created_at
           ) FILTER (WHERE a.id IS NOT NULL),
           '[]'::jsonb
         ) AS attachments
    FROM public.chat_messages m
    LEFT JOIN public.chat_message_attachments a ON a.message_id = m.id
   WHERE m.conversation_id = p_conversation_id
     AND (
       p_cursor_created_at IS NULL
       OR (m.created_at, m.id) < (p_cursor_created_at, p_cursor_id)
     )
   GROUP BY m.id
   ORDER BY m.created_at DESC, m.id DESC
   LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;

CREATE INDEX IF NOT EXISTS idx_chat_messages_encrypted
  ON public.chat_messages(conversation_id, created_at DESC)
  WHERE encrypted_payload IS NOT NULL;

COMMENT ON FUNCTION public.get_chat_messages_reverse IS
  'Retorna mensagens de uma conversa em ordem DESC com cursor. Inclui encrypted_payload para E2E client-side.';

-- MIGRATION: 20260606000002_chat_message_expiry.sql
CREATE OR REPLACE FUNCTION public.purge_expired_chat_messages(
  p_older_than_days integer DEFAULT 7
)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_older_than_days < 1 OR p_older_than_days > 365 THEN
    RAISE EXCEPTION 'p_older_than_days deve estar entre 1 e 365 (recebido: %)', p_older_than_days;
  END IF;

  DELETE FROM public.chat_messages
  WHERE created_at <= now() - make_interval(days => p_older_than_days);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.purge_expired_chat_messages IS
  'Remove permanentemente mensagens de chat com mais de N dias (padrão: 7). '
  'Chamado pelo BFF scheduler task chat.purge-expired-messages às 03:00 UTC. '
  'Cascade apaga attachments, statuses e receipts. Conversas/participantes preservados.';

-- MIGRATION: 20260606000003_chat_body_nullable.sql
ALTER TABLE public.chat_messages ALTER COLUMN body DROP NOT NULL;
ALTER TABLE public.chat_messages ALTER COLUMN body DROP DEFAULT;

COMMENT ON COLUMN public.chat_messages.body IS
  'NULL = mensagem cifrada (usar encrypted_payload). '
  '''''' = mensagem soft-deletada. '
  'texto = mensagem legada (compatibilidade retroativa, leitura apenas).';

-- MIGRATION: 20260607000001_stories_media_id.sql
ALTER TABLE public.stories
  ADD COLUMN IF NOT EXISTS media_id UUID REFERENCES public.media_files(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stories_media_id
  ON public.stories(media_id)
  WHERE media_id IS NOT NULL;

COMMENT ON COLUMN public.stories.media_id IS
  'FK para media_files. Preenchido em stories novos (R2). NULL mantém compatibilidade com storage_path legado.';

-- MIGRATION: 20260608000001_professional_financial_cycle_summary.sql
CREATE OR REPLACE FUNCTION public.get_professional_financial_history_summary(
  p_barbershop_id uuid,
  p_professional_id uuid DEFAULT NULL
)
RETURNS TABLE (
  professional_id uuid,
  faturamento_historico numeric,
  total_recebido numeric,
  payouts_count integer,
  last_payout_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH profissionais_escopo AS (
    SELECT b.owner_id AS professional_id
    FROM public.barbershops b
    WHERE b.id = p_barbershop_id
      AND (
        auth.role() = 'service_role'
        OR b.owner_id = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.professional_shop_links access_link
          WHERE access_link.barbershop_id = p_barbershop_id
            AND access_link.professional_id = auth.uid()
            AND access_link.is_active = true
        )
      )

    UNION

    SELECT psl.professional_id
    FROM public.professional_shop_links psl
    WHERE psl.barbershop_id = p_barbershop_id
      AND psl.is_active = true
      AND EXISTS (
        SELECT 1
        FROM public.barbershops b
        WHERE b.id = p_barbershop_id
          AND (
            auth.role() = 'service_role'
            OR b.owner_id = auth.uid()
            OR EXISTS (
              SELECT 1
              FROM public.professional_shop_links access_link
              WHERE access_link.barbershop_id = p_barbershop_id
                AND access_link.professional_id = auth.uid()
                AND access_link.is_active = true
            )
          )
      )
  ),
  transacoes_historicas AS (
    SELECT
      t.professional_id,
      COALESCE(SUM(COALESCE(t.gross_amount, t.amount, 0)), 0) AS faturamento_historico
    FROM public.transactions t
    WHERE t.barbershop_id = p_barbershop_id
      AND (p_professional_id IS NULL OR t.professional_id = p_professional_id)
      AND t.type = 'revenue'
      AND t.status = 'paid'
    GROUP BY t.professional_id
  ),
  payouts_historicos AS (
    SELECT
      p.professional_id,
      COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'confirmed'), 0) AS total_recebido,
      COUNT(*) FILTER (WHERE p.status = 'confirmed')::integer AS payouts_count,
      MAX(p.paid_at) FILTER (WHERE p.status = 'confirmed') AS last_payout_at
    FROM public.professional_payouts p
    WHERE p.barbershop_id = p_barbershop_id
      AND (p_professional_id IS NULL OR p.professional_id = p_professional_id)
    GROUP BY p.professional_id
  )
  SELECT
    pe.professional_id,
    COALESCE(th.faturamento_historico, 0) AS faturamento_historico,
    COALESCE(ph.total_recebido, 0) AS total_recebido,
    COALESCE(ph.payouts_count, 0) AS payouts_count,
    ph.last_payout_at
  FROM profissionais_escopo pe
  LEFT JOIN transacoes_historicas th ON th.professional_id = pe.professional_id
  LEFT JOIN payouts_historicos ph ON ph.professional_id = pe.professional_id
  WHERE pe.professional_id IS NOT NULL
    AND (p_professional_id IS NULL OR pe.professional_id = p_professional_id)
  ORDER BY pe.professional_id;
$$;

CREATE OR REPLACE FUNCTION public.get_professional_unpaid_transactions(
  p_barbershop_id uuid,
  p_professional_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 5000
)
RETURNS TABLE (
  id uuid,
  barbershop_id uuid,
  professional_id uuid,
  amount numeric,
  gross_amount numeric,
  payment_method text,
  status text,
  type text,
  paid_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.barbershop_id,
    t.professional_id,
    t.amount,
    t.gross_amount,
    t.payment_method::text,
    t.status::text,
    t.type::text,
    t.paid_at,
    t.created_at
  FROM public.transactions t
  WHERE t.barbershop_id = p_barbershop_id
    AND EXISTS (
      SELECT 1
      FROM public.barbershops b
      WHERE b.id = p_barbershop_id
        AND (
          auth.role() = 'service_role'
          OR b.owner_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.professional_shop_links access_link
            WHERE access_link.barbershop_id = p_barbershop_id
              AND access_link.professional_id = auth.uid()
              AND access_link.is_active = true
          )
        )
    )
    AND (p_professional_id IS NULL OR t.professional_id = p_professional_id)
    AND t.type = 'revenue'
    AND t.status = 'paid'
    AND NOT EXISTS (
      SELECT 1
      FROM public.professional_payout_items ppi
      WHERE ppi.transaction_id = t.id
    )
  ORDER BY t.paid_at ASC, t.created_at ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 5000), 1), 5000);
$$;

GRANT EXECUTE ON FUNCTION public.get_professional_financial_history_summary(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_professional_unpaid_transactions(uuid, uuid, integer) TO authenticated, service_role;