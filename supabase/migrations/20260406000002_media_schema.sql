-- ==============================================================
-- Migration: 20260406000002_media_schema.sql
-- Descrição: Tabelas de mídia e conteúdo social
-- Tabelas: stories, portfolio_images, likes, notifications
-- ==============================================================


-- ==================== STORIES ====================
-- Vídeos/imagens de 30s com expiração de 24h.
-- Arquivo NUNCA fica no banco — apenas metadados.
create table if not exists public.stories (
  id             uuid primary key default uuid_generate_v4(),
  owner_id       uuid not null references public.profiles(id)     on delete cascade,
  barbershop_id  uuid references public.barbershops(id)           on delete set null,
  storage_path   text not null,       -- caminho no Supabase Storage (/stories/videos/...)
  thumbnail_path text,                -- thumb gerada no upload (/stories/thumbs/...)
  media_type     text not null default 'video'
                   check (media_type in ('video','image')),
  duration_sec   int default 30,      -- máximo 30s
  views_count    int not null default 0,
  region_key     text,                -- chave para cache por região
  expires_at     timestamptz not null default (now() + interval '24 hours'),
  created_at     timestamptz not null default now()
);

comment on table public.stories is
  'Stories de 24h. Somente metadados. Mídia fica no Storage em /stories/. Limpar expirados com cron.';

create index idx_stories_owner      on public.stories(owner_id, created_at);
create index idx_stories_expires    on public.stories(expires_at);
create index idx_stories_barbershop on public.stories(barbershop_id, expires_at);


-- Visualizações de stories (tabela leve — sem dados pesados)
create table if not exists public.story_views (
  id         uuid primary key default uuid_generate_v4(),
  story_id   uuid not null references public.stories(id) on delete cascade,
  viewer_id  uuid not null references public.profiles(id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  unique (story_id, viewer_id)
);

create index idx_story_views_story on public.story_views(story_id);


-- ==================== PORTFOLIO IMAGES ====================
-- Portfólio de trabalhos de profissionais e barbearias.
-- Imagens NUNCA ficam no banco — somente metadados.
create table if not exists public.portfolio_images (
  id             uuid primary key default uuid_generate_v4(),
  owner_id       uuid not null references public.profiles(id) on delete cascade,
  owner_type     text not null default 'professional'
                   check (owner_type in ('professional','barbershop')),
  title          text,
  description    text,
  category       text,    -- degradê, barba, social, freestyle, infantil, sobrancelha, antes_e_depois
  storage_path   text not null,    -- /portfolio/images/original/
  thumbnail_path text,             -- /portfolio/images/thumbs/
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


-- ==================== LIKES ====================
-- Curtidas unificadas para portfólio e stories.
create table if not exists public.likes (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  content_id  uuid not null,           -- portfolio_image.id ou story.id
  content_type text not null
                 check (content_type in ('portfolio_image','story')),
  created_at  timestamptz not null default now(),
  unique (user_id, content_id, content_type)
);

comment on table public.likes is
  'Curtidas polimórficas. 1 like por usuário por conteúdo. Índice composto evita duplicidade.';

create index idx_likes_content on public.likes(content_id, content_type);
create index idx_likes_user    on public.likes(user_id);


-- Portfolio likes (tabela dedicada para rastrear por portfolio_image)
create table if not exists public.portfolio_likes (
  id                  uuid primary key default uuid_generate_v4(),
  portfolio_image_id  uuid not null references public.portfolio_images(id) on delete cascade,
  user_id             uuid not null references public.profiles(id) on delete cascade,
  created_at          timestamptz not null default now(),
  unique (portfolio_image_id, user_id)
);

create index idx_portfolio_likes_image on public.portfolio_likes(portfolio_image_id);
create index idx_portfolio_likes_user  on public.portfolio_likes(user_id);


-- ==================== NOTIFICATIONS ====================
create table if not exists public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null,    -- ex: appointment_confirmed, new_message, queue_update
  title       text not null,
  body        text,
  data        jsonb,            -- payload extra sem coluna fixa (barato e flexível)
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.notifications is
  'Notificações push. Campo data (jsonb) para payload variável sem schema fixo.';

create index idx_notifications_user   on public.notifications(user_id, is_read, created_at);
create index idx_notifications_type   on public.notifications(type);


-- ==================== TRIGGERS updated_at portfolio ====================
create or replace trigger trg_portfolio_images_updated_at
  before update on public.portfolio_images
  for each row execute function public.set_updated_at();
