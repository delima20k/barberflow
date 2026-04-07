-- ==============================================================
-- Migration: 20260406000003_rls_policies.sql
-- Descrição: Row Level Security — políticas de acesso
-- Garante que cada usuário acesse apenas o que lhe pertence
-- ==============================================================


-- ==================== HABILITAR RLS ====================
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


-- ===========================================================
-- PROFILES
-- ===========================================================

-- Qualquer autenticado pode ver perfis ativos
create policy "profiles_select_public"
  on public.profiles for select
  using (is_active = true);

-- Cada usuário edita apenas o próprio perfil
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id);

-- Insert automático via trigger (auth.users) — permitido
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);


-- ===========================================================
-- BARBERSHOPS
-- ===========================================================

-- Público pode ver barbearias ativas
create policy "barbershops_select_active"
  on public.barbershops for select
  using (is_active = true);

-- Apenas o dono pode inserir/editar/deletar
create policy "barbershops_owner_write"
  on public.barbershops for all
  using (auth.uid() = owner_id);


-- ===========================================================
-- PROFESSIONALS
-- ===========================================================

-- Público pode ver profissionais ativos
create policy "professionals_select_active"
  on public.professionals for select
  using (is_active = true);

-- Profissional edita apenas o próprio registro
create policy "professionals_update_own"
  on public.professionals for update
  using (auth.uid() = id);

create policy "professionals_insert_own"
  on public.professionals for insert
  with check (auth.uid() = id);


-- ===========================================================
-- SERVICES — público lê, dono escreve
-- ===========================================================

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


-- ===========================================================
-- CHAIRS — público lê, dono da barbearia escreve
-- ===========================================================

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


-- ===========================================================
-- WAITING SEATS — público lê, dono escreve
-- ===========================================================

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


-- ===========================================================
-- APPOINTMENTS
-- ===========================================================

-- Cliente e profissional veem seus próprios agendamentos
create policy "appointments_select_own"
  on public.appointments for select
  using (
    auth.uid() = client_id or
    auth.uid() = professional_id
  );

-- Cliente cria agendamento
create policy "appointments_client_insert"
  on public.appointments for insert
  with check (auth.uid() = client_id);

-- Cliente e profissional podem atualizar status
create policy "appointments_update_parties"
  on public.appointments for update
  using (
    auth.uid() = client_id or
    auth.uid() = professional_id
  );


-- ===========================================================
-- QUEUE ENTRIES — Realtime, dados da fila ao vivo
-- ===========================================================

-- Qualquer autenticado pode ver a fila (público = estratégia de negócio)
create policy "queue_select_public"
  on public.queue_entries for select
  using (true);

-- Apenas profissional da barbearia ou dono pode gerenciar fila
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


-- ===========================================================
-- NOTIFICATIONS — cada usuário vê apenas as suas
-- ===========================================================

create policy "notifications_select_own"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "notifications_update_own"
  on public.notifications for update
  using (auth.uid() = user_id);


-- ===========================================================
-- STORIES — público vê os não expirados
-- ===========================================================

create policy "stories_select_active"
  on public.stories for select
  using (expires_at > now());

create policy "stories_owner_write"
  on public.stories for all
  using (auth.uid() = owner_id);


-- ===========================================================
-- PORTFOLIO IMAGES — público vê ativos
-- ===========================================================

create policy "portfolio_select_active"
  on public.portfolio_images for select
  using (status = 'active');

create policy "portfolio_owner_write"
  on public.portfolio_images for all
  using (auth.uid() = owner_id);


-- ===========================================================
-- LIKES / PORTFOLIO LIKES
-- ===========================================================

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


-- ===========================================================
-- TRANSACTIONS — apenas dono da barbearia e profissional
-- ===========================================================

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


-- ===========================================================
-- AGREEMENTS — profissional e dono
-- ===========================================================

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
