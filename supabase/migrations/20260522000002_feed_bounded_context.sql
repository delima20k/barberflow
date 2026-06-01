-- Contexto canonico de feed: fanout hibrido, inbox de escrita e cursor estavel.

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
