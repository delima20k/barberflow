create extension if not exists "postgis";

create extension if not exists "uuid-ossp";

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE OR REPLACE FUNCTION cleanup_expired_story_comments()
RETURNS TABLE (cleaned_count BIGINT, cleaned_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
 v_count BIGINT;
COMMENT ON COLUMN public.profiles.pro_type IS
 'Subtipo do profissional. barbeiro = autônomo/funcionário; barbearia = dono/gestor de espaço. NULL para clientes.';
END;
END;
END;
END;
END;
END;
END;
END;
END;
END;
END;
END;
END;
END;
END;
END;
END;
END;
IF v_entry IS NULL THEN
 RETURN;
ELSIF NOT p_grace_used THEN
 UPDATE public.queue_entries
 SET client_confirmed = 'no_waiting',
 first_no_at = NOW()
 WHERE id = p_entry_id;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
 'barbershops',
 'barbershops',
 true,
 5242880, -- 5MB
 array['image/jpeg','image/png','image/webp']
) on conflict (id) do nothing;
$$;

CREATE OR REPLACE FUNCTION delete_expired_stories()
RETURNS TABLE (deleted_stories BIGINT, cleaned_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
 v_count BIGINT;
$$;

CREATE OR REPLACE FUNCTION fn_update_barbershop_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
 v_id UUID;
 v_likes INT;
 v_dislikes INT;
 v_avg NUMERIC;
 v_score NUMERIC(3,1);
 PRIOR_N CONSTANT NUMERIC := 5;
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
 SET likes_count = v_likes,
 dislikes_count = v_dislikes,
 rating_score = v_score
 WHERE id = v_id;
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_update_barbershop_rating()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
 v_id UUID;
 v_likes INT;
 v_dislikes INT;
 v_score NUMERIC(3,1);
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
 likes_count = v_likes,
 dislikes_count = v_dislikes,
 rating_score = v_score
 WHERE id = v_id;
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION fn_update_professional_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
 UPDATE public.professionals
 SET rating_count = rating_count + 1
 WHERE id = NEW.professional_id;
$$;

CREATE OR REPLACE FUNCTION get_barbershops_nearby(
 lat DOUBLE PRECISION,
 lng DOUBLE PRECISION,
 raio_metros DOUBLE PRECISION,
 limit_val INT DEFAULT 50
)
RETURNS TABLE (
 id UUID,
 name TEXT,
 address TEXT,
 city TEXT,
 latitude DOUBLE PRECISION,
 longitude DOUBLE PRECISION,
 logo_path TEXT,
 cover_path TEXT,
 is_open BOOLEAN,
 close_reason TEXT,
 rating_avg NUMERIC,
 rating_count INT,
 rating_score NUMERIC,
 likes_count INT,
 dislikes_count INT,
 font_key TEXT,
 distancia_m DOUBLE PRECISION
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

CREATE OR REPLACE FUNCTION limpar_refresh_tokens_expirados()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
 DELETE FROM refresh_tokens
 WHERE expires_at < NOW() - INTERVAL '30 days';
$$;

CREATE OR REPLACE FUNCTION public.anonimizar_perfil(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
 UPDATE public.data_deletion_requests
 SET
 status = 'completed',
 processed_at = now()
 WHERE user_id = p_user_id;

CREATE OR REPLACE FUNCTION public.aplicar_desconto_metodo(
 p_barbershop_id uuid,
 p_metodo text,
 p_de timestamptz,
 p_ate timestamptz,
 p_porcentagem numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
 END IF;

CREATE OR REPLACE FUNCTION public.buscar_perfis_por_nome(
 p_termo TEXT,
 p_limite INT DEFAULT 20
)
RETURNS TABLE (
 id UUID,
 full_name TEXT,
 avatar_path TEXT,
 updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.cleanup_all_old_data()
RETURNS TABLE (tabela TEXT, cleaned_count BIGINT, cleaned_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
 RETURN QUERY
 SELECT 'notifications'::TEXT, c.cleaned_count, c.cleaned_at
 FROM cleanup_notifications_old() AS c;

CREATE OR REPLACE FUNCTION public.cleanup_notifications_old(
 p_dias INT DEFAULT 30
)
RETURNS TABLE (cleaned_count BIGINT, cleaned_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
BEGIN
 DELETE FROM public.notifications
 WHERE is_read = TRUE
 AND created_at < NOW() - (p_dias || ' days')::INTERVAL;

CREATE OR REPLACE FUNCTION public.cleanup_queue_entries_old(
 p_dias INT DEFAULT 7
)
RETURNS TABLE (cleaned_count BIGINT, cleaned_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
BEGIN
 DELETE FROM public.queue_entries
 WHERE status IN ('done', 'cancelled')
 AND check_in_at < NOW() - (p_dias || ' days')::INTERVAL;

CREATE OR REPLACE FUNCTION public.confirmar_presenca_cliente(
 p_entry_id UUID,
 p_confirmado BOOLEAN,
 p_grace_used BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
 v_profId UUID;

CREATE OR REPLACE FUNCTION public.criar_agendamento_atomico(
 p_client_id UUID,
 p_professional_id UUID,
 p_barbershop_id UUID,
 p_service_id UUID,
 p_scheduled_at TIMESTAMPTZ,
 p_duration_min INT,
 p_notes TEXT DEFAULT NULL,
 p_price_charged NUMERIC DEFAULT NULL
)
RETURNS SETOF public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
 v_conflito INT;

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

CREATE OR REPLACE FUNCTION public.fn_clear_close_reason()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.is_open = TRUE AND OLD.is_open = FALSE THEN
 NEW.close_reason := NULL;
 END IF;
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_notify_queue_clients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
 posicao_rank INT := 0;

CREATE OR REPLACE FUNCTION public.fn_notify_queue_clients()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
 posicao_rank INT := 0;

CREATE OR REPLACE FUNCTION public.fn_update_barbershop_rating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
 v_id UUID;
 v_likes INT;
 v_dislikes INT;
 v_avg NUMERIC;
 v_score NUMERIC(3,1);
 PRIOR_N CONSTANT NUMERIC := 5;
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
 likes_count = v_likes,
 dislikes_count = v_dislikes,
 rating_score = v_score
 WHERE id = v_id;
 RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_update_professional_likes_count()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
 v_id UUID;
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

CREATE OR REPLACE FUNCTION public.get_clientes_favoritos_modal(
 p_barbershop_id UUID,
 p_professional_id UUID
)
RETURNS TABLE (
 id UUID,
 full_name TEXT,
 email TEXT,
 avatar_path TEXT,
 updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
END;

CREATE OR REPLACE FUNCTION public.get_clientes_favoritos_modal(
 p_barbershop_id UUID,
 p_professional_id UUID
)
RETURNS TABLE (
 id UUID,
 full_name TEXT,
 email TEXT,
 avatar_path TEXT,
 updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
END;

CREATE OR REPLACE FUNCTION public.get_clientes_favoritos_modal(
 p_barbershop_id UUID,
 p_professional_id UUID
)
RETURNS TABLE (
 id UUID,
 full_name TEXT,
 email TEXT,
 avatar_path TEXT,
 updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
$$;
$$;

CREATE OR REPLACE FUNCTION public.get_clientes_favoritos_modal(
 p_barbershop_id UUID,
 p_professional_id UUID
)
RETURNS TABLE (
 id UUID,
 full_name TEXT,
 email TEXT,
 avatar_path TEXT,
 updated_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
$$;
GRANT EXECUTE ON FUNCTION public.get_clientes_favoritos_modal(UUID, UUID) TO authenticated;
ALTER TABLE public.queue_entries
 ADD COLUMN IF NOT EXISTS client_confirmed TEXT
 CHECK (client_confirmed IN ('yes', 'no_waiting', 'absent')),
 ADD COLUMN IF NOT EXISTS first_no_at TIMESTAMPTZ;
COMMENT ON COLUMN public.queue_entries.client_confirmed IS
 'Estado de confirmação de presença do cliente na cadeira: yes | no_waiting | absent';
COMMENT ON COLUMN public.queue_entries.first_no_at IS
 'Timestamp do primeiro "Não" — base para cálculo do grace period de 5 min';
CREATE OR REPLACE FUNCTION public.confirmar_presenca_cliente(
 p_entry_id UUID,
 p_confirmado BOOLEAN,
 p_grace_used BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
 v_profId UUID;
BEGIN
 SELECT qe.id, qe.professional_id, qe.barbershop_id,
 p.full_name AS client_name
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
 v_profId := v_entry.professional_id;
 IF p_confirmado THEN
 UPDATE public.queue_entries
 SET client_confirmed = 'yes',
 first_no_at = NULL
 WHERE id = p_entry_id;
 ELSIF NOT p_grace_used THEN
 UPDATE public.queue_entries
 SET client_confirmed = 'no_waiting',
 first_no_at = NOW()
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
 'client_absent', true,
 'entry_id', p_entry_id,
 'client_name', COALESCE(v_entry.client_name, 'Cliente'),
 'barbershop_id', v_entry.barbershop_id
 ),
 false,
 NOW()
 );
 END IF;
 END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
 RETURN NEW;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
 RETURN NEW;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
 RETURN NEW;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
 RETURN NEW;

CREATE OR REPLACE FUNCTION public.handle_profile_barbearia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
BEGIN
 IF NEW.pro_type = 'barbearia' THEN
 SELECT COALESCE(
 (SELECT raw_user_meta_data->>'barbearia_name'
 FROM auth.users WHERE id = NEW.id),
 NEW.full_name,
 'Minha Barbearia'
 ) INTO v_name;

CREATE OR REPLACE FUNCTION public.handle_profile_professional()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
 END IF;

CREATE OR REPLACE FUNCTION public.notificar_barbeiro_chegada(
 p_professional_id UUID,
 p_type TEXT,
 p_title TEXT,
 p_body TEXT,
 p_data JSONB
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
 END IF;

CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
 END IF;

CREATE OR REPLACE FUNCTION public.search_users(
 p_term TEXT DEFAULT NULL,
 p_role TEXT DEFAULT NULL,
 p_limit INTEGER DEFAULT 20,
 p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
 id UUID,
 full_name TEXT,
 email TEXT,
 role TEXT,
 avatar_path TEXT,
 barbershop_name TEXT,
 updated_at TIMESTAMPTZ,
 total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
$$;
GRANT EXECUTE ON FUNCTION public.search_users(TEXT, TEXT, INTEGER, INTEGER)
 TO authenticated;
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
 new.updated_at = now();
 return new;
end;
$$;

create or replace function public.storage_is_barbershop_owner(shop_id text)
returns boolean
language sql
security definer
$$;
UPDATE public.barbershops b
UPDATE public.professionals p
UPDATE public.barbershops b
CREATE OR REPLACE FUNCTION public.handle_profile_barbearia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
 v_shop_id UUID;
comment on table public.likes is
 'Curtidas polimórficas. 1 like por usuário por conteúdo. Índice composto evita duplicidade.';
comment on table public.media_files is
 'Metadados de mídia armazenada no Cloudflare R2. '
 'O arquivo em si NÃO está no Supabase — apenas path e URL pública.';
comment on table public.notifications is
 'Notificações push. Campo data (jsonb) para payload variável sem schema fixo.';
COMMENT ON TABLE public.p2p_peers IS 'Peers WebRTC disponíveis para redistribuição de mídia (TTL: 5 min)';
comment on table public.portfolio_images is
 'Portfólio de trabalhos. Apenas metadados. Storage em /portfolio/images/. 
 likes_count desnormalizado para evitar COUNT(*) a cada requisição.';
comment on table public.professionals is
 'Perfil profissional. Vinculado a profiles. Especialidades em array para filtro rápido.';
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text,
 phone text,
 avatar_path text, -- caminho no Supabase Storage (nunca URL direta)
 role text not null default 'client'
 check (role in ('client', 'professional', 'admin')),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
comment on table public.profiles is
 'Dados públicos do usuário, espelho de auth.users. Role define o tipo de acesso.';
create table if not exists public.push_subscriptions (
 id uuid primary key default uuid_generate_v4(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 endpoint text not null unique,
 p256dh text not null,
 auth_key text not null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
comment on table public.push_subscriptions is
 'Subscriptions Web Push por usuário. endpoint é a URL do push service. 
 p256dh e auth_key são as chaves de criptografia do browser.';
comment on table public.queue_entries is
 'Fila em tempo real. Dados efêmeros. Limpar com cron diário ou função agendada.';
alter publication supabase_realtime add table public.queue_entry_services;
comment on table public.queue_entry_services is
 'Serviços escolhidos pelo cliente ao entrar na fila. Apagados em cascata com a entrada.';
comment on table public.services is
 'Serviços oferecidos por barbearia. Duração em minutos para cálculo de agenda.';
end $$;

CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
 RETURN NEW;

create or replace function public.trg_set_updated_at()
 returns trigger
 language plpgsql
as $$
begin
 new.updated_at := now();
 return new;
end;
$$;

CREATE OR REPLACE FUNCTION sync_barbershop_geom()
RETURNS TRIGGER AS $$
BEGIN
 IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
 NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
create policy "agreements_owner_write"
 on public.agreements for all
 using (
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
create policy "appointments_client_insert"
 on public.appointments for insert
 with check (auth.uid() = client_id);
create policy "appointments_delete_client"
 on public.appointments
 for delete
 using (auth.uid() = client_id);
create policy "appointments_select_own"
 on public.appointments for select
 using (
 auth.uid() = client_id or
 auth.uid() = professional_id
 );
create policy "appointments_update_parties"
 on public.appointments for update
 using (
 auth.uid() = client_id or
 auth.uid() = professional_id
 );
CREATE POLICY "attendance_insert_professional"
 ON public.attendance_sessions FOR INSERT
 WITH CHECK (auth.uid() = professional_id);
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
create policy "avatars_owner_delete"
 on storage.objects for delete
 using (
 bucket_id = 'avatars' and
 auth.uid()::text = (storage.foldername(name))[1]
 );
create policy "avatars_owner_write"
 on storage.objects for insert
 with check (
 bucket_id = 'avatars' and
 auth.uid()::text = (storage.foldername(name))[1]
 );
create policy "avatars_public_read"
 on storage.objects for select
 using (bucket_id = 'avatars');
CREATE POLICY "barbershops_delete_own"
 ON public.barbershops FOR DELETE
 USING (auth.uid() = owner_id);
CREATE POLICY "barbershops_insert_own"
 ON public.barbershops FOR INSERT
 WITH CHECK (auth.uid() = owner_id);
create policy "barbershops_owner_delete"
 on storage.objects for delete
 using (
 bucket_id = 'barbershops' and
 auth.uid()::text = (storage.foldername(name))[1]
 );
create policy "barbershops_owner_delete"
 on storage.objects for delete
 using (
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
CREATE POLICY "barbershops_owner_write"
 ON public.barbershops FOR ALL
 USING (auth.uid() = owner_id)
 WITH CHECK (
 auth.uid() = owner_id
 AND (
 SELECT role FROM public.profiles WHERE id = auth.uid()
 ) = 'professional'
 );
create policy "barbershops_owner_write"
 on public.barbershops for all
 using (auth.uid() = owner_id);
create policy "barbershops_owner_write"
 on storage.objects for insert
 with check (
 bucket_id = 'barbershops' and
 auth.uid()::text = (storage.foldername(name))[1]
 );
create policy "barbershops_owner_write"
 on storage.objects for insert
 with check (
 bucket_id = 'barbershops' and
 public.storage_is_barbershop_owner((storage.foldername(name))[1])
 );
create policy "barbershops_public_read"
 on storage.objects for select
 using (bucket_id = 'barbershops');
create policy "barbershops_select_active"
 on public.barbershops for select
 using (is_active = true);
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
CREATE POLICY "barbershops_update_own"
 ON public.barbershops FOR UPDATE
 USING (auth.uid() = owner_id);
CREATE POLICY "bi_delete_own"
 ON barbershop_interactions FOR DELETE
 USING (auth.uid() = user_id);
CREATE POLICY "bi_insert_own"
 ON barbershop_interactions FOR INSERT
 WITH CHECK (auth.uid() = user_id);
CREATE POLICY "bi_select_own"
 ON barbershop_interactions FOR SELECT
 USING (auth.uid() = user_id);
create policy "chairs_owner_write"
 on public.chairs for all
 using (
 auth.uid() = (
 select owner_id from public.barbershops
 where id = barbershop_id
 )
 );
create policy "chairs_select_public"
 on public.chairs for select
 using (true);
CREATE POLICY "data_access_log_insert_own"
 ON public.data_access_log FOR INSERT
 WITH CHECK (auth.uid() = user_id);
CREATE POLICY "data_access_log_select_own"
 ON public.data_access_log FOR SELECT
 USING (auth.uid() = user_id);
CREATE POLICY "deletion_requests_insert_own"
 ON public.data_deletion_requests FOR INSERT
 WITH CHECK (auth.uid() = user_id);
CREATE POLICY "deletion_requests_select_own"
 ON public.data_deletion_requests FOR SELECT
 USING (auth.uid() = user_id);
CREATE POLICY "deletion_requests_update_own"
 ON public.data_deletion_requests FOR UPDATE
 USING (auth.uid() = user_id)
 WITH CHECK (auth.uid() = user_id AND status = 'cancelled');
drop policy if exists "appointments_delete_client" on public.appointments;
drop policy if exists "barbershops_owner_delete" on storage.objects;
drop policy if exists "barbershops_owner_update" on storage.objects;
DROP POLICY IF EXISTS "barbershops_owner_write" ON public.barbershops;
DROP POLICY IF EXISTS "barbershops_owner_write" ON public.barbershops;
drop policy if exists "barbershops_owner_write" on storage.objects;
drop policy if exists "legal_consents: insert próprio" on public.legal_consents;
drop policy if exists "legal_consents: select próprio" on public.legal_consents;
drop policy if exists "legal_consents: update próprio" on public.legal_consents;
drop policy if exists "notifications_delete_own" on public.notifications;
drop policy if exists "notifications_insert_service" on public.notifications;
drop policy if exists "professionals_delete_own" on public.professionals;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
drop policy if exists "psl_select_public" on public.professional_shop_links;
drop policy if exists "psl_write_own" on public.professional_shop_links;
drop policy if exists "push_subs_update_own" on public.push_subscriptions;
drop policy if exists "queue_insert_own" on public.queue_entries;
DROP POLICY IF EXISTS "subscriptions_insert_service" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_select_own" ON public.subscriptions;
DROP POLICY IF EXISTS "subscriptions_update_service" ON public.subscriptions;
DROP POLICY IF EXISTS "transactions_insert_owner" ON public.transactions;
create policy "legal_consents: insert próprio"
 on public.legal_consents for insert
 with check (auth.uid() = user_id);
create policy "legal_consents: select próprio"
 on public.legal_consents for select
 using (auth.uid() = user_id);
create policy "legal_consents: update próprio"
 on public.legal_consents for update
 using (auth.uid() = user_id)
 with check (auth.uid() = user_id);
create policy "likes_delete_own"
 on public.likes for delete
 using (auth.uid() = user_id);
create policy "likes_insert_own"
 on public.likes for insert
 with check (auth.uid() = user_id);
create policy "likes_select_public"
 on public.likes for select
 using (true);
create policy "media_files_owner_select"
 on public.media_files for select
 using (owner_id = auth.uid());
create policy "media_files_service_insert"
 on public.media_files for insert
 with check (false);
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
create policy "notifications_delete_own"
 on public.notifications
 for delete
 using (auth.uid() = user_id);
create policy "notifications_insert_own"
 on public.notifications
 for insert
 with check (auth.uid() = user_id);
create policy "notifications_insert_service"
 on public.notifications
 for insert
 with check (true);
create policy "notifications_select_own"
 on public.notifications
 for select
 using (auth.uid() = user_id);
create policy "notifications_select_own"
 on public.notifications for select
 using (auth.uid() = user_id);
create policy "notifications_update_own"
 on public.notifications
 for update
 using (auth.uid() = user_id)
 with check (auth.uid() = user_id);
create policy "notifications_update_own"
 on public.notifications for update
 using (auth.uid() = user_id);
CREATE POLICY "p2p_peers: delete pelo dono"
 ON public.p2p_peers FOR DELETE
 USING (auth.uid() = user_id);
CREATE POLICY "p2p_peers: insert pelo usuário autenticado"
 ON public.p2p_peers FOR INSERT
 WITH CHECK (auth.uid() = user_id);
CREATE POLICY "p2p_peers: select por usuários autenticados"
 ON public.p2p_peers FOR SELECT
 USING (auth.role() = 'authenticated');
CREATE POLICY "p2p_peers: update pelo dono"
 ON public.p2p_peers FOR UPDATE
 USING (auth.uid() = user_id);
create policy "portfolio_likes_delete_own"
 on public.portfolio_likes for delete
 using (auth.uid() = user_id);
create policy "portfolio_likes_insert_own"
 on public.portfolio_likes for insert
 with check (auth.uid() = user_id);
create policy "portfolio_likes_select"
 on public.portfolio_likes for select
 using (true);
create policy "portfolio_owner_delete"
 on storage.objects for delete
 using (
 bucket_id = 'portfolio' and
 auth.uid()::text = (storage.foldername(name))[1]
 );
create policy "portfolio_owner_write"
 on public.portfolio_images for all
 using (auth.uid() = owner_id);
create policy "portfolio_owner_write"
 on storage.objects for insert
 with check (
 bucket_id = 'portfolio' and
 auth.uid()::text = (storage.foldername(name))[1]
 );
create policy "portfolio_public_read"
 on storage.objects for select
 using (bucket_id = 'portfolio');
create policy "portfolio_select_active"
 on public.portfolio_images for select
 using (status = 'active');
create policy "professionals_delete_own"
 on public.professionals
 for delete
 using (auth.uid() = id);
create policy "professionals_insert_own"
 on public.professionals for insert
 with check (auth.uid() = id);
create policy "professionals_select_active"
 on public.professionals for select
 using (is_active = true);
create policy "professionals_update_own"
 on public.professionals for update
 using (auth.uid() = id);
CREATE POLICY "profiles_insert_own"
 ON public.profiles FOR INSERT
 WITH CHECK (
 auth.uid() = id
 AND role IN ('client', 'professional')
 );
create policy "profiles_insert_own"
 on public.profiles for insert
 with check (auth.uid() = id);
CREATE POLICY "profiles_select_active_for_queue"
 ON public.profiles FOR SELECT
 TO authenticated
 USING (is_active = true);
create policy "profiles_select_public"
 on public.profiles for select
 using (is_active = true);
create policy "profiles_update_own"
 on public.profiles for update
 using (auth.uid() = id);
create policy "psl_delete_own"
 on public.professional_shop_links
 for delete
 using (auth.uid() = professional_id);
create policy "psl_insert_own"
 on public.professional_shop_links
 for insert
 with check (auth.uid() = professional_id);
create policy "psl_select_public"
 on public.professional_shop_links
 for select
 using (is_active = true);
create policy "psl_update_own"
 on public.professional_shop_links
 for update
 using (auth.uid() = professional_id);
create policy "push_subs_delete_own"
 on public.push_subscriptions
 for delete
 using (auth.uid() = user_id);
create policy "push_subs_insert_own"
 on public.push_subscriptions
 for insert
 with check (auth.uid() = user_id);
create policy "push_subs_select_own"
 on public.push_subscriptions
 for select
 using (auth.uid() = user_id);
create policy "push_subs_update_own"
 on public.push_subscriptions
 for update
 using (auth.uid() = user_id)
 with check (auth.uid() = user_id);
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
create policy "qes_select_public"
 on public.queue_entry_services for select
 using (true);
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
create policy "services_owner_write"
 on public.services for all
 using (
 auth.uid() = (
 select owner_id from public.barbershops
 where id = barbershop_id
 )
 );
create policy "services_select_public"
 on public.services for select
 using (is_active = true);
create policy "stories_owner_delete"
 on storage.objects for delete
 using (
 bucket_id = 'stories' and
 auth.uid()::text = (storage.foldername(name))[1]
 );
create policy "stories_owner_write"
 on public.stories for all
 using (auth.uid() = owner_id);
create policy "stories_owner_write"
 on storage.objects for insert
 with check (
 bucket_id = 'stories' and
 auth.uid()::text = (storage.foldername(name))[1]
 );
create policy "stories_public_read"
 on storage.objects for select
 using (bucket_id = 'stories');
create policy "stories_select_active"
 on public.stories for select
 using (expires_at > now());
create policy "story_views_insert_own"
 on public.story_views
 for insert
 with check (auth.uid() = viewer_id);
CREATE POLICY "story_views_insert_own"
 ON public.story_views FOR INSERT
 WITH CHECK (auth.uid() = viewer_id);
create policy "story_views_select_own"
 on public.story_views
 for select
 using (auth.uid() = viewer_id);
CREATE POLICY "story_views_select_owner"
 ON public.story_views FOR SELECT
 USING (
 auth.uid() = viewer_id
 OR auth.uid() = (
 SELECT owner_id FROM public.stories
 WHERE id = story_id
 )
 );
CREATE POLICY "subscriptions_insert_service"
 ON public.subscriptions FOR INSERT
 WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "subscriptions_select_own"
 ON public.subscriptions FOR SELECT
 USING (auth.uid() = user_id);
CREATE POLICY "subscriptions_update_service"
 ON public.subscriptions FOR UPDATE
 USING (auth.role() = 'service_role');
CREATE POLICY "subscriptions: service_role only insert"
 ON public.subscriptions FOR INSERT
 WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "subscriptions: service_role only update"
 ON public.subscriptions FOR UPDATE
 USING (auth.role() = 'service_role');
CREATE POLICY "subscriptions: user can select own"
 ON public.subscriptions FOR SELECT
 USING (auth.uid() = user_id);
CREATE POLICY "transactions_delete_owner"
 ON public.transactions
 FOR DELETE
 USING (
 auth.uid() = (
 SELECT owner_id FROM public.barbershops
 WHERE id = barbershop_id
 )
 );
CREATE POLICY "transactions_insert_owner"
 ON public.transactions
 FOR INSERT
 WITH CHECK (
 auth.uid() = (
 SELECT owner_id FROM public.barbershops
 WHERE id = barbershop_id
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
create policy "transactions_select_owner"
 on public.transactions for select
 using (
 auth.uid() = professional_id or
 auth.uid() = (
 select owner_id from public.barbershops
 where id = barbershop_id
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
create policy "waiting_seats_owner_write"
 on public.waiting_seats for all
 using (
 auth.uid() = (
 select owner_id from public.barbershops
 where id = barbershop_id
 )
 );
create policy "waiting_seats_select"
 on public.waiting_seats for select
 using (true);
ALTER TABLE barbershop_interactions ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS barbershop_interactions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 barbershop_id UUID NOT NULL REFERENCES barbershops(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 type TEXT NOT NULL CHECK (type IN ('like', 'dislike', 'favorite')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE (barbershop_id, user_id, type)
);
ALTER TABLE barbershops
 ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS dislikes_count INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS rating_score NUMERIC(3,1) NOT NULL DEFAULT 0.0;
alter table public.agreements enable row level security;
create table if not exists public.agreements (
 id uuid primary key default uuid_generate_v4(),
 professional_id uuid not null references public.professionals(id) on delete cascade,
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 type text not null default 'percentage'
 check (type in ('percentage','fixed','rent')),
 value numeric(8,2) not null default 0, -- % ou R$ fixo
 is_active boolean not null default true,
 valid_from date not null default current_date,
 valid_until date,
 notes text,
 created_at timestamptz not null default now()
);
ALTER TABLE public.appointments
 ADD CONSTRAINT chk_appointments_duration_valida
 CHECK (duration_min > 0 AND duration_min <= 480);
alter table public.appointments enable row level security;
create table if not exists public.appointments (
 id uuid primary key default uuid_generate_v4(),
 client_id uuid not null references public.profiles(id) on delete restrict,
 professional_id uuid not null references public.professionals(id) on delete restrict,
 barbershop_id uuid not null references public.barbershops(id) on delete restrict,
 service_id uuid not null references public.services(id) on delete restrict,
 scheduled_at timestamptz not null,
 duration_min int not null default 30,
 status text not null default 'pending'
 check (status in ('pending','confirmed','in_progress','done','cancelled','no_show')),
 notes text,
 price_charged numeric(8,2),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.attendance_sessions enable row level security;
create table if not exists public.attendance_sessions (
 id uuid primary key default uuid_generate_v4(),
 queue_entry_id uuid not null references public.queue_entries(id) on delete restrict,
 appointment_id uuid references public.appointments(id) on delete set null,
 professional_id uuid not null references public.professionals(id) on delete restrict,
 chair_id uuid not null references public.chairs(id) on delete restrict,
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 notes text
);
ALTER TABLE public.barbershops
 ADD COLUMN IF NOT EXISTS close_reason TEXT DEFAULT NULL;
ALTER TABLE public.barbershops
 ADD CONSTRAINT chk_barbershops_rating_avg
 CHECK (rating_avg >= 0 AND rating_avg <= 5),
 ADD CONSTRAINT chk_barbershops_rating_count
 CHECK (rating_count >= 0);
alter table public.barbershops enable row level security;
create table if not exists public.barbershops (
 id uuid primary key default uuid_generate_v4(),
 owner_id uuid not null references public.profiles(id) on delete restrict,
 name text not null,
 slug text unique, -- ex: "barbearia-elite"
 description text,
 phone text,
 address text,
 city text,
 state text,
 zip_code text,
 latitude numeric(10, 7),
 longitude numeric(10, 7),
 logo_path text, -- Supabase Storage
 cover_path text, -- Supabase Storage
 is_open boolean not null default false,
 is_active boolean not null default true,
 rating_avg numeric(3,2) not null default 0.00,
 rating_count int not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.chairs enable row level security;
create table if not exists public.chairs (
 id uuid primary key default uuid_generate_v4(),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 label text not null, -- ex: "Cadeira 1"
 status text not null default 'livre'
 check (status in ('livre','ocupada','inativa')),
 professional_id uuid references public.professionals(id) on delete set null,
 updated_at timestamptz not null default now()
);
ALTER TABLE public.data_access_log ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.data_access_log (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 recurso text NOT NULL,
 acao text NOT NULL
 CHECK (acao IN ('read', 'write', 'delete', 'export')),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.data_deletion_requests ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.data_deletion_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 motivo text NOT NULL DEFAULT 'user_request'
 CHECK (motivo IN ('user_request', 'legal_obligation', 'consent_withdrawn')),
 status text NOT NULL DEFAULT 'pending'
 CHECK (status IN ('pending', 'processing', 'completed', 'cancelled')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz,
 CONSTRAINT deletion_requests_user_unique UNIQUE (user_id)
);
alter table public.file_download_events enable row level security;
create table if not exists public.file_download_events (
 id uuid primary key default uuid_generate_v4(),
 file_id text not null, -- ID do arquivo (media_files.id ou path P2P)
 downloaded_at timestamptz not null default now()
);
ALTER TABLE public.legal_consents
 ADD CONSTRAINT legal_consents_plan_type_check
 CHECK (plan_type IN ('trial', 'mensal', 'trimestral', 'client'));
ALTER TABLE public.legal_consents
 DROP CONSTRAINT IF EXISTS legal_consents_plan_type_check;
alter table public.legal_consents enable row level security;
create table if not exists public.legal_consents (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 plan_type text not null check (plan_type in ('trial', 'mensal', 'trimestral')),
 aceitou_termos boolean not null default false,
 direitos_autorais boolean not null default false,
 uso_arquivos boolean not null default false,
 uso_midias_internas boolean not null default false,
 uso_gps boolean not null default false,
 data_aceite timestamptz not null default now(),
 version integer not null default 1, -- versão dos termos aceitos
 ip_hint text, -- identificação de sessão (opcional)
 constraint legal_consents_user_unique unique (user_id)
);
alter table public.likes enable row level security;
create table if not exists public.likes (
 id uuid primary key default uuid_generate_v4(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 content_id uuid not null, -- portfolio_image.id ou story.id
 content_type text not null
 check (content_type in ('portfolio_image','story')),
 created_at timestamptz not null default now(),
 unique (user_id, content_id, content_type)
);
alter table public.media_files
 add constraint media_files_contexto_check
 check (contexto in ('stories', 'avatars', 'services', 'portfolio'));
alter table public.media_files enable row level security;
create table if not exists public.media_files (
 id uuid primary key default uuid_generate_v4(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 contexto text not null, -- stories | avatars | services | portfolio
 path text not null unique, -- chave no bucket R2 (ex: avatars/uuid/uuid.webp)
 public_url text not null, -- URL pública no R2 CDN
 content_type text,
 tamanho_bytes int,
 metadata jsonb, -- dados extras livres (barbershopId, title, etc.)
 created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
alter table public.notifications enable row level security;
create table if not exists public.notifications (
 id uuid primary key default uuid_generate_v4(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 type text not null, -- ex: appointment_confirmed, new_message, queue_update
 title text not null,
 body text,
 data jsonb, -- payload extra sem coluna fixa (barato e flexível)
 is_read boolean not null default false,
 created_at timestamptz not null default now()
);
ALTER TABLE public.p2p_peers ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.p2p_peers (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 media_id TEXT NOT NULL, -- ID do arquivo que o peer possui em cache
 peer_id UUID NOT NULL, -- UUID gerado pelo frontend para esta sessão P2P
 user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 region TEXT NOT NULL DEFAULT '', -- ex: 'BR-SP' (opcional, para seleção geográfica)
 expires_at TIMESTAMPTZ NOT NULL, -- NOW() + 5 minutos
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
alter table public.portfolio_images enable row level security;
create table if not exists public.portfolio_images (
 id uuid primary key default uuid_generate_v4(),
 owner_id uuid not null references public.profiles(id) on delete cascade,
 owner_type text not null default 'professional'
 check (owner_type in ('professional','barbershop')),
 title text,
 description text,
 category text, -- degradê, barba, social, freestyle, infantil, sobrancelha, antes_e_depois
 storage_path text not null, -- /portfolio/images/original/
 thumbnail_path text, -- /portfolio/images/thumbs/
 likes_count int not null default 0,
 views_count int not null default 0,
 is_featured boolean not null default false,
 status text not null default 'active'
 check (status in ('active','archived','deleted')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.portfolio_likes enable row level security;
create table if not exists public.portfolio_likes (
 id uuid primary key default uuid_generate_v4(),
 portfolio_image_id uuid not null references public.portfolio_images(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique (portfolio_image_id, user_id)
);
alter table public.professional_shop_links enable row level security;
create table if not exists public.professional_shop_links (
 id uuid primary key default uuid_generate_v4(),
 professional_id uuid not null references public.professionals(id) on delete cascade,
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 is_active boolean not null default true,
 joined_at timestamptz not null default now(),
 unique (professional_id, barbershop_id)
);
alter table public.professionals enable row level security;
create table if not exists public.professionals (
 id uuid primary key references public.profiles(id) on delete cascade,
 bio text,
 specialties text[], -- ex: ARRAY['degradê','barba','social']
 avatar_path text,
 is_active boolean not null default true,
 rating_avg numeric(3,2) not null default 0.00,
 rating_count int not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
ALTER TABLE public.profiles
 ADD COLUMN IF NOT EXISTS email text;
alter table public.profiles
 add column if not exists last_lat numeric(10,7),
 add column if not exists last_lng numeric(10,7),
 add column if not exists last_location_at timestamptz;
ALTER TABLE public.profiles
 ADD COLUMN IF NOT EXISTS pro_type text
 CHECK (pro_type IN ('barbeiro', 'barbearia'));
alter table public.profiles enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.queue_entries enable row level security;
create table if not exists public.queue_entries (
 id uuid primary key default uuid_generate_v4(),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 client_id uuid references public.profiles(id) on delete set null,
 professional_id uuid references public.professionals(id) on delete set null,
 chair_id uuid references public.chairs(id) on delete set null,
 position int not null default 0,
 status text not null default 'waiting'
 check (status in ('waiting','in_service','done','cancelled')),
 check_in_at timestamptz not null default now(),
 served_at timestamptz,
 done_at timestamptz
);
alter table public.queue_entry_services enable row level security;
create table if not exists public.queue_entry_services (
 id uuid primary key default uuid_generate_v4(),
 queue_entry_id uuid not null references public.queue_entries(id) on delete cascade,
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 service_id uuid not null references public.services(id) on delete cascade,
 created_at timestamptz not null default now(),
 unique (queue_entry_id, service_id)
);
alter table public.services
 add column if not exists image_path text default null;
ALTER TABLE public.services
 ADD CONSTRAINT chk_services_price_positivo
 CHECK (price >= 0),
 ADD CONSTRAINT chk_services_duration_valida
 CHECK (duration_min > 0 AND duration_min <= 480);
alter table public.services enable row level security;
create table if not exists public.services (
 id uuid primary key default uuid_generate_v4(),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 name text not null,
 description text,
 category text, -- ex: corte, barba, combo
 price numeric(8,2) not null default 0,
 duration_min int not null default 30, -- duração em minutos
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.stories enable row level security;
create table if not exists public.stories (
 id uuid primary key default uuid_generate_v4(),
 owner_id uuid not null references public.profiles(id) on delete cascade,
 barbershop_id uuid references public.barbershops(id) on delete set null,
 storage_path text not null, -- caminho no Supabase Storage (/stories/videos/...)
 thumbnail_path text, -- thumb gerada no upload (/stories/thumbs/...)
 media_type text not null default 'video'
 check (media_type in ('video','image')),
 duration_sec int default 30, -- máximo 30s
 views_count int not null default 0,
 region_key text, -- chave para cache por região
 expires_at timestamptz not null default (now() + interval '24 hours'),
 created_at timestamptz not null default now()
);
alter table public.story_views enable row level security;
create table if not exists public.story_views (
 id uuid primary key default uuid_generate_v4(),
 story_id uuid not null references public.stories(id) on delete cascade,
 viewer_id uuid not null references public.profiles(id) on delete cascade,
 viewed_at timestamptz not null default now(),
 unique (story_id, viewer_id)
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 plan_type text NOT NULL CHECK (plan_type IN ('trial', 'mensal', 'trimestral')),
 status text NOT NULL DEFAULT 'trial'
 CHECK (status IN ('trial', 'active', 'expired', 'cancelled')),
 purchase_token text,
 platform text NOT NULL DEFAULT 'web'
 CHECK (platform IN ('android', 'web')),
 starts_at timestamptz NOT NULL DEFAULT now(),
 ends_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
alter table public.transactions enable row level security;
create table if not exists public.transactions (
 id uuid primary key default uuid_generate_v4(),
 barbershop_id uuid not null references public.barbershops(id) on delete restrict,
 appointment_id uuid references public.appointments(id) on delete set null,
 professional_id uuid references public.professionals(id) on delete set null,
 client_id uuid references public.profiles(id) on delete set null,
 amount numeric(10,2) not null,
 type text not null default 'revenue'
 check (type in ('revenue','refund','commission','expense')),
 payment_method text, -- ex: pix, dinheiro, cartao
 status text not null default 'pending'
 check (status in ('pending','paid','cancelled','refunded')),
 notes text,
 paid_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.waiting_seats enable row level security;
create table if not exists public.waiting_seats (
 id uuid primary key default uuid_generate_v4(),
 barbershop_id uuid not null references public.barbershops(id) on delete cascade,
 label text not null, -- ex: "Assento A"
 is_occupied boolean not null default false,
 updated_at timestamptz not null default now()
);
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS refresh_tokens (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE, -- SHA-256 hex (64 chars)
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL,
 revoked_at TIMESTAMPTZ, -- NULL = ativo
 device_hint TEXT, -- ex: 'iOS 18 / iPhone 15 Pro'
 ip_address INET
);
CREATE TRIGGER trg_barbershop_rating
 AFTER INSERT OR DELETE ON barbershop_interactions
 FOR EACH ROW EXECUTE FUNCTION fn_update_barbershop_rating();
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER trg_check_barbershop_open
 BEFORE INSERT ON public.queue_entries
 FOR EACH ROW EXECUTE FUNCTION public.fn_check_barbershop_open_on_queue();
CREATE TRIGGER trg_clear_close_reason
 BEFORE UPDATE ON public.barbershops
 FOR EACH ROW EXECUTE FUNCTION public.fn_clear_close_reason();
CREATE TRIGGER trg_barbershop_rating
 AFTER INSERT OR DELETE ON public.barbershop_interactions
 FOR EACH ROW EXECUTE FUNCTION public.fn_update_barbershop_rating();
CREATE TRIGGER trg_professional_likes
 AFTER INSERT OR DELETE ON public.professional_likes
 FOR EACH ROW EXECUTE FUNCTION public.fn_update_professional_likes_count();
CREATE TRIGGER on_auth_user_created
 AFTER INSERT ON auth.users
 FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER trg_profile_professional
 AFTER INSERT OR UPDATE OF role ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION public.handle_profile_professional();
CREATE TRIGGER trg_prevent_role_escalation
 BEFORE UPDATE ON public.profiles
 FOR EACH ROW
 EXECUTE FUNCTION public.prevent_role_escalation();
CREATE TRIGGER trg_set_transaction_gross_amount
 BEFORE INSERT ON public.transactions
 FOR EACH ROW
 EXECUTE FUNCTION public.set_transaction_gross_amount();
CREATE TRIGGER on_auth_user_email_updated
 AFTER UPDATE OF email ON auth.users
 FOR EACH ROW
 WHEN (OLD.email IS DISTINCT FROM NEW.email)
 EXECUTE FUNCTION public.sync_profile_email();
create trigger trg_push_subs_updated_at
 before update on public.push_subscriptions
 for each row execute function public.trg_set_updated_at();
DROP TRIGGER IF EXISTS trg_barbershop_rating ON barbershop_interactions;
DROP TRIGGER IF EXISTS trg_barbershop_rating ON public.barbershop_interactions;
DROP TRIGGER IF EXISTS trg_check_barbershop_open ON public.queue_entries;
DROP TRIGGER IF EXISTS trg_clear_close_reason ON public.barbershops;
DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
DROP TRIGGER IF EXISTS trg_professional_likes ON public.professional_likes;
DROP TRIGGER IF EXISTS trg_profile_professional ON public.profiles;
DROP TRIGGER IF EXISTS trg_set_transaction_gross_amount ON public.transactions;
GRANT SELECT ON public.barbershops TO anon;
GRANT SELECT ON public.profiles_public TO anon, authenticated;
GRANT SELECT ON public.profiles_public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION cleanup_expired_story_comments() TO service_role;
REVOKE EXECUTE ON FUNCTION cleanup_expired_story_comments() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION delete_expired_stories() TO service_role;
REVOKE EXECUTE ON FUNCTION delete_expired_stories() FROM PUBLIC;
GRANT SELECT ON public.profiles TO anon;
GRANT EXECUTE ON FUNCTION public.anonimizar_perfil(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.anonimizar_perfil(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_desconto_metodo(uuid, text, timestamptz, timestamptz, numeric)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_perfis_por_nome(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_all_old_data() TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_all_old_data() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_notifications_old(INT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_notifications_old(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_queue_entries_old(INT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_queue_entries_old(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirmar_presenca_cliente(UUID, BOOLEAN, BOOLEAN)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_presenca_cliente(UUID, BOOLEAN, BOOLEAN)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_agendamento_atomico(
 UUID, UUID, UUID, UUID, TIMESTAMPTZ, INT, TEXT, NUMERIC
) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.criar_agendamento_atomico(
 UUID, UUID, UUID, UUID, TIMESTAMPTZ, INT, TEXT, NUMERIC
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_clientes_favoritos_modal(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clientes_favoritos_modal(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clientes_favoritos_modal(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notificar_barbeiro_chegada(UUID, TEXT, TEXT, TEXT, JSONB)
 TO authenticated;
create index idx_agreements_barbershop on public.agreements(barbershop_id, is_active);
create index idx_agreements_professional on public.agreements(professional_id, is_active);
create index idx_appointments_barbershop on public.appointments(barbershop_id, scheduled_at);
create index idx_appointments_client on public.appointments(client_id, scheduled_at);
create index idx_appointments_professional on public.appointments(professional_id, scheduled_at);
create index idx_appointments_status on public.appointments(status);
create index idx_barbershops_active on public.barbershops(is_active, is_open);
create index idx_barbershops_city on public.barbershops(city, state);
create index idx_barbershops_location on public.barbershops(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_barbershops_name_lower
 ON public.barbershops (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_barbershops_name
 ON public.barbershops (name);
create index idx_barbershops_owner on public.barbershops(owner_id);
CREATE INDEX IF NOT EXISTS idx_bi_barbershop ON barbershop_interactions (barbershop_id);
CREATE INDEX IF NOT EXISTS idx_bi_user ON barbershop_interactions (user_id);
create index idx_chairs_barbershop on public.chairs(barbershop_id, status);
CREATE INDEX IF NOT EXISTS idx_data_access_log_user
 ON public.data_access_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status
 ON public.data_deletion_requests (status, requested_at)
 WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_dm_conversation
 ON direct_messages (sender_id, recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_inbox
 ON direct_messages (recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dm_story_ref
 ON direct_messages (story_ref_id) WHERE story_ref_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fav_pro_pro ON public.favorite_professionals(professional_id);
CREATE INDEX IF NOT EXISTS idx_fav_pro_user ON public.favorite_professionals(user_id);
CREATE INDEX IF NOT EXISTS idx_fav_pro_user ON public.favorite_professionals(user_id);
create index idx_fde_file_window
 on public.file_download_events(file_id, downloaded_at desc);
create index idx_likes_content on public.likes(content_id, content_type);
create index idx_likes_user on public.likes(user_id);
create index idx_media_files_contexto on public.media_files(owner_id, contexto);
create index idx_media_files_created on public.media_files(created_at desc);
create index idx_media_files_owner on public.media_files(owner_id);
create index idx_notifications_type on public.notifications(type);
create index if not exists idx_notifications_unread
 on public.notifications(user_id, created_at desc)
 where is_read = false;
create index idx_notifications_user on public.notifications(user_id, is_read, created_at);
create index idx_portfolio_category on public.portfolio_images(category, status);
create index idx_portfolio_featured on public.portfolio_images(is_featured, status);
create index idx_portfolio_likes_image on public.portfolio_likes(portfolio_image_id);
create index idx_portfolio_likes_user on public.portfolio_likes(user_id);
create index idx_portfolio_owner on public.portfolio_images(owner_id, owner_type);
CREATE INDEX IF NOT EXISTS idx_pro_likes_pro ON public.professional_likes(professional_id);
CREATE INDEX IF NOT EXISTS idx_pro_likes_user ON public.professional_likes(user_id);
create index idx_professionals_active on public.professionals(is_active);
create index idx_professionals_specialties on public.professionals using gin(specialties);
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
CREATE INDEX IF NOT EXISTS idx_profiles_full_name_lower
 ON public.profiles (lower(full_name));
CREATE INDEX IF NOT EXISTS idx_profiles_full_name_lower
 ON public.profiles (LOWER(full_name));
CREATE INDEX IF NOT EXISTS idx_profiles_full_name
 ON public.profiles (full_name);
create index if not exists idx_profiles_location
 on public.profiles (last_lat, last_lng)
 where last_lat is not null;
CREATE INDEX IF NOT EXISTS idx_profiles_pro_type
 ON public.profiles (pro_type)
 WHERE pro_type IS NOT NULL;
create index idx_profiles_role on public.profiles(role);
create index idx_psl_barbershop on public.professional_shop_links(barbershop_id);
create index idx_psl_professional on public.professional_shop_links(professional_id);
create index if not exists idx_push_subs_expiration
 on public.push_subscriptions (expiration_time)
 where expiration_time is not null;
create index if not exists idx_push_subs_send
 on public.push_subscriptions (user_id, app_id, is_valid)
 where is_valid = true;
create index idx_push_subs_user on public.push_subscriptions(user_id);
create index idx_qes_entry on public.queue_entry_services(queue_entry_id);
create index idx_qes_service on public.queue_entry_services(service_id);
create index idx_queue_barbershop on public.queue_entries(barbershop_id, status);
CREATE INDEX IF NOT EXISTS idx_queue_entries_shop_waiting
 ON public.queue_entries (barbershop_id, status, position)
 WHERE status = 'waiting';
create index idx_queue_position on public.queue_entries(barbershop_id, position);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_refresh_tokens_family_id
 ON refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash
 ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id
 ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_sc_recipient
 ON story_comments (recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sc_sender
 ON story_comments (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sc_story
 ON story_comments (story_id, created_at DESC);
create index idx_services_barbershop on public.services(barbershop_id, is_active);
create index idx_services_category on public.services(category);
create index idx_sessions_chair on public.attendance_sessions(chair_id);
create index idx_sessions_professional on public.attendance_sessions(professional_id, started_at);
create index idx_stories_barbershop on public.stories(barbershop_id, expires_at);
create index idx_stories_expires on public.stories(expires_at);
create index idx_stories_owner on public.stories(owner_id, created_at);
create index idx_story_views_story on public.story_views(story_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_ends_at
 ON public.subscriptions (ends_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_one_active_per_user
 ON public.subscriptions (user_id)
 WHERE status IN ('trial', 'active');
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status
 ON public.subscriptions (user_id, status);
create index idx_transactions_barbershop on public.transactions(barbershop_id, created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_queue_entry
 ON public.transactions(queue_entry_id);
create index idx_transactions_status on public.transactions(status);
create index idx_waiting_seats_barbershop on public.waiting_seats(barbershop_id);
create index if not exists legal_consents_user_id_idx
 on public.legal_consents (user_id);
CREATE INDEX IF NOT EXISTS p2p_peers_media_expires
 ON public.p2p_peers (media_id, expires_at);
CREATE INDEX IF NOT EXISTS p2p_peers_user_expires
 ON public.p2p_peers (user_id, expires_at);
INSERT INTO public.professionals (id)
SELECT p.id
FROM public.profiles p
WHERE p.role = 'professional'
 AND p.pro_type = 'barbearia'
 AND NOT EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.id = p.id)
ON CONFLICT (id) DO NOTHING;
COMMENT ON COLUMN public.profiles.zip_code IS 'CEP — usado como fallback de geolocalização quando GPS está desativado';
ELSE
 SELECT id INTO v_shop_id
 FROM public.barbershops
 WHERE owner_id = NEW.id
 LIMIT 1;
END $$;

$$;
END $$;

$$;
INSERT INTO public.likes (user_id, content_id, content_type, created_at)
SELECT
 pl.user_id,
 pl.portfolio_image_id AS content_id,
 'portfolio_image' AS content_type,
 pl.created_at
FROM public.portfolio_likes pl
ON CONFLICT (user_id, content_id, content_type) DO NOTHING;
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
 coalesce(pr.rating_avg, 0.00) AS rating_avg,
 coalesce(pr.rating_count, 0) AS rating_count
 FROM public.profiles p
 LEFT JOIN public.professionals pr ON pr.id = p.id
 WHERE p.is_active = true;
COMMENT ON COLUMN public.queue_entries.client_confirmed IS
 'Estados: yes=presente(in_service) | no_waiting=ausente(in_service) | absent=grace expirado(in_service) | arriving=a caminho(waiting)';
END IF;
END IF;
END IF;
END IF;
END IF;
END IF;
END IF;
COMMENT ON COLUMN public.profiles.birth_date IS 'Data de nascimento';
SELECT COUNT(*) INTO v_conflito
 FROM public.appointments
 WHERE professional_id = p_professional_id
 AND status NOT IN ('cancelled', 'no_show', 'done')
 AND scheduled_at < v_fim
 AND (scheduled_at + (duration_min || ' minutes')::INTERVAL) > p_scheduled_at;
COMMENT ON COLUMN public.queue_entries.guest_name IS
 'Nome avulso informado pelo barbeiro para cliente sem cadastro (walk-in).';
$$;

$$;
INSERT INTO public.barbershops (owner_id, name, is_active, is_open)
 VALUES (rec.id, v_name, true, false);
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
end if;
comment on column public.file_download_events.downloaded_at is
 'Timestamp UTC do evento de download. Usado para filtro por janela de tempo.';
UPDATE barbershops b
 SET rating_score = (
 WITH stats AS (
 SELECT
 COUNT(*) FILTER (WHERE type = 'like') AS lk,
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
BEGIN
 DELETE FROM stories WHERE expires_at < now();
UPDATE public.transactions
 SET amount = ROUND(COALESCE(gross_amount, amount) * (1 - p_porcentagem / 100.0), 2)
 WHERE barbershop_id = p_barbershop_id
 AND payment_method = p_metodo
 AND type = 'revenue'
 AND status = 'paid'
 AND paid_at BETWEEN p_de AND p_ate;
END$$;

$$;
BEGIN
 IF NEW.pro_type = 'barbearia' THEN
 SELECT COALESCE(
 (SELECT raw_user_meta_data->>'barbearia_name'
 FROM auth.users WHERE id = NEW.id),
 NEW.full_name,
 'Minha Barbearia'
 ) INTO v_name;
COMMENT ON COLUMN public.subscriptions.price IS
 'Valor cobrado pelo plano (0.00 para planos free/trial/administrativos).';
END$$;

IF p_metodo NOT IN ('credito', 'debito', 'cartao') THEN
 RAISE EXCEPTION 'metodo inválido: %', p_metodo;

comment on column public.media_files.public_url is 'URL pública no R2 CDN (via R2_PUBLIC_URL)';

IF NOT EXISTS (SELECT 1 FROM public.barbershops WHERE owner_id = NEW.id) THEN
 INSERT INTO public.barbershops (owner_id, name, is_active, is_open)
 VALUES (NEW.id, v_name, true, false)
 RETURNING id INTO v_shop_id;

END LOOP;

END LOOP;

END LOOP;

ELSIF TG_OP = 'DELETE' THEN
 UPDATE public.professionals
 SET rating_count = GREATEST(rating_count - 1, 0)
 WHERE id = OLD.professional_id;

RETURN NULL;

BEGIN
 SELECT qe.id, qe.professional_id, qe.barbershop_id,
 p.full_name AS client_name
 INTO v_entry
 FROM public.queue_entries qe
 LEFT JOIN public.profiles p ON p.id = qe.client_id
 WHERE qe.id = p_entry_id
 AND qe.client_id = auth.uid()
 AND qe.status = 'in_service'
 LIMIT 1;

IF p_confirmado THEN
 UPDATE public.queue_entries
 SET client_confirmed = 'yes',
 first_no_at = NULL
 WHERE id = p_entry_id;

END IF;

END IF;

END IF;

END IF;

END IF;

END IF;

END IF;

END IF;

END IF;

END IF;

END IF;

END IF;

END IF;

END IF;

END IF;

END IF;

END IF;

END IF;

$$;
IF NEW.pro_type IS DISTINCT FROM OLD.pro_type THEN
 RAISE EXCEPTION 'O campo pro_type não pode ser alterado pelo usuário.'
 USING ERRCODE = 'insufficient_privilege';
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
 'entry_id', p_entry_id,
 'client_name', COALESCE(v_entry.client_name, 'Cliente'),
 'barbershop_id', v_entry.barbershop_id
 ),
 false,
 NOW()
 );
v_fim := p_scheduled_at + (p_duration_min || ' minutes')::INTERVAL;
COMMENT ON COLUMN public.p2p_peers.expires_at IS 'Timestamp de expiração do anúncio (5 min após announce)';
RETURN NEW;
RETURN NEW;
RETURN NEW;
RETURN NEW;
RETURN NEW;
RETURN NEW;
RETURN NEW;
INSERT INTO public.professionals (id)
SELECT p.id
FROM public.profiles p
WHERE p.role = 'professional'
 AND NOT EXISTS (SELECT 1 FROM public.professionals pr WHERE pr.id = p.id)
ON CONFLICT (id) DO NOTHING;
comment on column public.push_subscriptions.last_used_at is 'Timestamp do último envio bem-sucedido para esta subscription.';
end loop;
INSERT INTO public.professional_shop_links (professional_id, barbershop_id, is_active)
SELECT b.owner_id, b.id, true
FROM public.barbershops b
JOIN public.profiles p ON p.id = b.owner_id
WHERE p.pro_type = 'barbearia'
 AND NOT EXISTS (
 SELECT 1 FROM public.professional_shop_links psl
 WHERE psl.professional_id = b.owner_id
 AND psl.barbershop_id = b.id
 )
ON CONFLICT (professional_id, barbershop_id) DO NOTHING;
FOR rec IN
 SELECT
 client_id,
 position,
 ROW_NUMBER() OVER (ORDER BY position ASC) AS rank
 FROM public.queue_entries
 WHERE barbershop_id = NEW.barbershop_id
 AND status = 'waiting'
 AND client_id IS NOT NULL
 LOOP
 posicao_rank := rec.rank;
FOR rec IN
 SELECT
 client_id,
 position,
 ROW_NUMBER() OVER (ORDER BY position ASC) AS rank
 FROM public.queue_entries
 WHERE barbershop_id = NEW.barbershop_id
 AND status = 'waiting'
 AND client_id IS NOT NULL
 LOOP
 posicao_rank := rec.rank;
comment on column public.media_files.path is 'Chave no bucket R2 (ex: services/uuid/uuid.webp)';
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
 'media-images',
 'media-images',
 true,
 10485760, -- 10 MB por arquivo
 ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
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
ELSE
 UPDATE public.queue_entries
 SET client_confirmed = 'absent'
 WHERE id = p_entry_id;
COMMENT ON COLUMN public.p2p_peers.peer_id IS 'UUID de sessão P2P gerado pelo frontend';
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
 'avatars',
 'avatars',
 true,
 2097152, -- 2MB
 array['image/jpeg','image/png','image/webp']
) on conflict (id) do nothing;

$$ LANGUAGE plpgsql;
COMMENT ON COLUMN public.profiles.address IS 'Endereço residencial do usuário';
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
END $$;

comment on column public.media_files.metadata is 'Dados extras opcionais (barbershopId, title, etc.)';

$$;
$$;

$$;
$$;

$$;
$$;

$$;
$$;

BEGIN
 IF NEW.status IS DISTINCT FROM 'done' THEN
 RETURN NEW;

BEGIN
 IF NEW.status IS DISTINCT FROM 'done' THEN
 RETURN NEW;

BEGIN
 DELETE FROM story_comments
 WHERE story_id IN (
 SELECT id FROM stories WHERE expires_at < now()
 );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
 'portfolio',
 'portfolio',
 true,
 10485760, -- 10MB
 array['image/jpeg','image/png','image/webp']
) on conflict (id) do nothing;

IF v_proximo IS NOT NULL THEN
 INSERT INTO public.notifications (user_id, type, title, body, data, is_read, created_at)
 VALUES (
 NEW.professional_id,
 'queue_next_client',
 'Próximo cliente',
 v_proximo.client_name || ' está aguardando na fila.',
 jsonb_build_object(
 'entry_id', v_proximo.entry_id,
 'client_name', v_proximo.client_name,
 'barbershop_id', NEW.barbershop_id,
 'is_next', true
 ),
 false,
 NOW()
 );

RETURN QUERY SELECT v_count, now();

RETURN QUERY SELECT v_count, now();

COMMENT ON COLUMN public.p2p_peers.region IS 'Região geográfica (opcional) para preferência local';

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
 'position', posicao_rank,
 'barbershop_id', NEW.barbershop_id,
 'is_next', (posicao_rank = 1)
 ),
 false,
 NOW()
 );

INSERT INTO public.professionals (id)
 VALUES (NEW.id)
 ON CONFLICT (id) DO NOTHING;

COMMENT ON COLUMN public.p2p_peers.media_id IS 'ID do arquivo em cache no IndexedDB do peer';

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
 'position', posicao_rank,
 'barbershop_id', NEW.barbershop_id,
 'is_next', (posicao_rank = 1)
 ),
 false,
 NOW()
 );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
 'stories',
 'stories',
 true,
 52428800, -- 50MB (vídeo até 30s / 720p)
 array['video/mp4','video/webm','image/jpeg','image/png','image/webp']
) on conflict (id) do nothing;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
 'media-barbershop',
 'media-barbershop',
 true,
 5242880, -- 5 MB (o logo tem limite menor, validado no backend)
 ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

$$;
IF v_conflito > 0 THEN
 RAISE EXCEPTION 'SCHEDULE_CONFLICT'
 USING ERRCODE = 'P0001',
 DETAIL = 'Horário não disponível: conflito com agendamento existente.';
comment on column public.push_subscriptions.device_id is 'UUID persistido em localStorage (bf_device_id). Identifica o dispositivo.';
DO $$
BEGIN
 IF NOT EXISTS (
 SELECT 1 FROM pg_policies
 WHERE tablename = 'barbershops'
 AND policyname = 'anon_select_active_barbershops'
 ) THEN
 CREATE POLICY "anon_select_active_barbershops"
 ON public.barbershops
 FOR SELECT
 TO anon
 USING (is_active = TRUE);

IF NOT EXISTS (
 SELECT 1 FROM public.barbershops WHERE owner_id = NEW.id
 ) THEN
 INSERT INTO public.barbershops (owner_id, name, is_active, is_open)
 VALUES (NEW.id, v_name, true, false);

ALTER PUBLICATION supabase_realtime ADD TABLE barbershops;

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
comment on column public.push_subscriptions.expiration_time is
 'Data de expiração da subscription (PushSubscription.expirationTime em UTC). null = sem expiração definida.';
DO $$
DECLARE
 rec RECORD;

comment on column public.file_download_events.file_id is
 'Identificador do arquivo. Pode ser UUID de media_files ou path P2P — sem FK intencional.';

comment on column public.services.image_path is
 'Path no bucket barbershops para a imagem do serviço (ex: <uuid>/services/<file>.webp).';

IF NEW.professional_id IS NOT NULL THEN
 SELECT
 qe.id AS entry_id,
 COALESCE(p.full_name, qe.guest_name, 'Cliente walk-in') AS client_name
 INTO v_proximo
 FROM public.queue_entries qe
 LEFT JOIN public.profiles p ON p.id = qe.client_id
 WHERE qe.barbershop_id = NEW.barbershop_id
 AND qe.status = 'waiting'
 ORDER BY qe.position ASC
 LIMIT 1;

$$;
comment on column public.push_subscriptions.app_id is 'App que gerou a subscription: cliente | profissional.';
END;
END;
END;
END;
END;
END;
END;
END;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(p_professional_id::TEXT));
UPDATE public.barbershops
CREATE TABLE IF NOT EXISTS direct_messages (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
 is_read BOOLEAN NOT NULL DEFAULT false,
 story_ref_id UUID REFERENCES stories(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
RETURN QUERY SELECT v_count, NOW();
IF NEW.role IS DISTINCT FROM OLD.role THEN
 RAISE EXCEPTION 'O campo role não pode ser alterado pelo usuário.'
 USING ERRCODE = 'insufficient_privilege';
GET DIAGNOSTICS v_count = ROW_COUNT;
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
comment on column public.push_subscriptions.is_valid is 'false quando o push service retorna 410 ou 404 (subscription expirada ou inválida).';
COMMENT ON COLUMN public.profiles.gender IS 'Gênero: masculino | feminino | outro | nao_informar';
UPDATE barbershops
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_barbershops_geom
 ON barbershops USING GIST (geom);
$$;

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

v_name TEXT;

RETURN QUERY SELECT v_count, NOW();

COMMENT ON COLUMN public.p2p_peers.user_id IS 'Usuário dono deste anúncio';

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

v_proximo RECORD;

GET DIAGNOSTICS v_count = ROW_COUNT;

GET DIAGNOSTICS v_count = ROW_COUNT;

GET DIAGNOSTICS v_count = ROW_COUNT;

v_profId := v_entry.professional_id;

IF v_shop_id IS NOT NULL THEN
 INSERT INTO public.professional_shop_links (professional_id, barbershop_id, is_active)
 VALUES (NEW.id, v_shop_id, true)
 ON CONFLICT (professional_id, barbershop_id) DO NOTHING;

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
 'client_absent', true,
 'entry_id', p_entry_id,
 'client_name', COALESCE(v_entry.client_name, 'Cliente'),
 'barbershop_id', v_entry.barbershop_id
 ),
 false,
 NOW()
 );

comment on column public.media_files.contexto is 'Contexto de uso: stories | avatars | services | portfolio';

DO $$
BEGIN
 IF EXISTS (
 SELECT 1 FROM information_schema.tables
 WHERE table_schema = 'public' AND table_name = 'transactions'
 ) THEN
 ALTER TABLE public.transactions
 ADD CONSTRAINT chk_transactions_amount_positivo
 CHECK (amount > 0);
UPDATE refresh_tokens
ALTER TABLE refresh_tokens
 ALTER COLUMN family_id SET NOT NULL,
 ALTER COLUMN family_id SET DEFAULT gen_random_uuid();
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
CREATE POLICY "barbershops_select_active"
 ON public.barbershops FOR SELECT
 TO anon, authenticated
 USING (is_active = true);
CREATE POLICY "barbershops_select_active"
 ON public.barbershops FOR SELECT
 TO anon, authenticated
 USING (is_active = true);
CREATE POLICY "barbershops_select_active"
 ON public.barbershops FOR SELECT
 TO anon, authenticated
 USING (is_active = true);
CREATE POLICY "dm_insert_own"
 ON direct_messages FOR INSERT
 WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "dm_select_own"
 ON direct_messages FOR SELECT
 USING (
 auth.uid() = sender_id
 OR auth.uid() = recipient_id
 );
CREATE POLICY "dm_update_read"
 ON direct_messages FOR UPDATE
 USING (auth.uid() = recipient_id)
 WITH CHECK (auth.uid() = recipient_id);
CREATE POLICY "fav_pro_delete_own"
 ON public.favorite_professionals FOR DELETE
 USING (auth.uid() = user_id);
CREATE POLICY "fav_pro_delete_own"
 ON public.favorite_professionals FOR DELETE
 USING (auth.uid() = user_id);
CREATE POLICY "fav_pro_insert_own"
 ON public.favorite_professionals FOR INSERT
 WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fav_pro_insert_own"
 ON public.favorite_professionals FOR INSERT
 WITH CHECK (auth.uid() = user_id);
CREATE POLICY "fav_pro_select_own"
 ON public.favorite_professionals FOR SELECT
 USING (auth.uid() = user_id);
CREATE POLICY "fav_pro_select_own"
 ON public.favorite_professionals FOR SELECT
 USING (auth.uid() = user_id);
drop policy if exists "barbershops_owner_delete" on storage.objects;
drop policy if exists "barbershops_owner_update" on storage.objects;
drop policy if exists "barbershops_owner_write" on storage.objects;
DROP POLICY IF EXISTS "barbershops_select_active" ON public.barbershops;
DROP POLICY IF EXISTS "barbershops_select_active" ON public.barbershops;
DROP POLICY IF EXISTS "barbershops_select_active" ON public.barbershops;
DROP POLICY IF EXISTS "dm_insert_own" ON direct_messages;
DROP POLICY IF EXISTS "dm_select_own" ON direct_messages;
DROP POLICY IF EXISTS "dm_update_read" ON direct_messages;
DROP POLICY IF EXISTS "fav_pro_delete_own" ON public.favorite_professionals;
DROP POLICY IF EXISTS "fav_pro_insert_own" ON public.favorite_professionals;
DROP POLICY IF EXISTS "fav_pro_select_own" ON public.favorite_professionals;
DROP POLICY IF EXISTS "notifications_insert_service" ON public.notifications;
DROP POLICY IF EXISTS "notifications_insert_service" ON public.notifications;
DROP POLICY IF EXISTS "professionals_select_active" ON public.professionals;
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_public" ON public.profiles;
DROP POLICY IF EXISTS "transactions_insert_member" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_owner" ON public.transactions;
CREATE POLICY "notifications_insert_service"
 ON public.notifications
 FOR INSERT
 WITH CHECK (
 auth.role() = 'service_role'
 OR auth.uid() = user_id
 );
CREATE POLICY "notifications_insert_service"
 ON public.notifications
 FOR INSERT
 WITH CHECK (true);
CREATE POLICY "pro_likes_delete_own"
 ON public.professional_likes FOR DELETE
 USING (auth.uid() = user_id);
CREATE POLICY "pro_likes_insert_own"
 ON public.professional_likes FOR INSERT
 WITH CHECK (auth.uid() = user_id);
CREATE POLICY "pro_likes_select_own"
 ON public.professional_likes FOR SELECT
 USING (auth.uid() = user_id);
CREATE POLICY "professionals_select_active"
 ON public.professionals FOR SELECT
 TO anon, authenticated
 USING (is_active = true);
CREATE POLICY "profiles_select_own"
 ON public.profiles FOR SELECT
 TO authenticated
 USING (auth.uid() = id);
CREATE POLICY "profiles_select_public"
 ON public.profiles FOR SELECT
 TO anon, authenticated
 USING (is_active = true);
CREATE POLICY "profiles_select_public"
 ON public.profiles FOR SELECT
 TO anon, authenticated
 USING (is_active = true);
CREATE POLICY "sc_delete_own_or_owner"
 ON story_comments FOR DELETE
 USING (
 auth.uid() = sender_id
 OR auth.uid() = recipient_id
 );
CREATE POLICY "sc_insert_own"
 ON story_comments FOR INSERT
 WITH CHECK (auth.uid() = sender_id);
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
 AND psl.barbershop_id = transactions.barbershop_id
 AND psl.is_active = true
 )
 )
 );
ALTER TABLE barbershops
 ADD COLUMN IF NOT EXISTS geom GEOMETRY(Point, 4326);
ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbershops
 ADD COLUMN IF NOT EXISTS font_key TEXT;
ALTER TABLE public.barbershops
 ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS dislikes_count INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS rating_score NUMERIC(3,1) NOT NULL DEFAULT 0.0,
 ADD COLUMN IF NOT EXISTS font_key TEXT,
 ADD COLUMN IF NOT EXISTS close_reason TEXT;
ALTER TABLE public.barbershops
 ADD COLUMN IF NOT EXISTS neighborhood TEXT,
 ADD COLUMN IF NOT EXISTS whatsapp TEXT,
 ADD COLUMN IF NOT EXISTS founded_year SMALLINT;
ALTER TABLE public.barbershops
 ADD CONSTRAINT barbershops_owner_id_fkey
 FOREIGN KEY (owner_id)
 REFERENCES public.profiles(id)
 ON DELETE CASCADE;
ALTER TABLE public.barbershops
 DROP CONSTRAINT IF EXISTS barbershops_owner_id_fkey;
ALTER TABLE public.favorite_professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_professionals ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.favorite_professionals (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE (user_id, professional_id)
);
CREATE TABLE IF NOT EXISTS public.favorite_professionals (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE (user_id, professional_id)
);
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.professional_likes ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS public.professional_likes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE (professional_id, user_id)
);
ALTER TABLE public.profiles
 ADD COLUMN IF NOT EXISTS address text,
 ADD COLUMN IF NOT EXISTS birth_date date,
 ADD COLUMN IF NOT EXISTS gender text
 CHECK (gender IN ('masculino', 'feminino', 'outro', 'nao_informar')),
 ADD COLUMN IF NOT EXISTS zip_code text;
alter table public.push_subscriptions
 add column if not exists device_id text,
 add column if not exists app_id text check (app_id in ('cliente', 'profissional')),
 add column if not exists is_valid boolean not null default true,
 add column if not exists last_used_at timestamptz not null default now();
alter table public.push_subscriptions
 add column if not exists expiration_time timestamptz null;
ALTER TABLE public.queue_entries
 ADD CONSTRAINT queue_entries_client_confirmed_check
 CHECK (client_confirmed IN ('yes', 'no_waiting', 'absent', 'arriving'));
ALTER TABLE public.queue_entries
 DROP CONSTRAINT IF EXISTS queue_entries_client_confirmed_check;
ALTER TABLE public.queue_entries ADD COLUMN IF NOT EXISTS guest_name TEXT;
ALTER TABLE public.subscriptions
 ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.subscriptions
 ADD CONSTRAINT subscriptions_purchase_token_unique
 UNIQUE (purchase_token);
ALTER TABLE public.transactions
 ADD COLUMN IF NOT EXISTS gross_amount numeric(10,2);
ALTER TABLE public.transactions
 ADD COLUMN IF NOT EXISTS queue_entry_id uuid
 REFERENCES public.queue_entries(id) ON DELETE SET NULL;
ALTER TABLE refresh_tokens
 ADD COLUMN IF NOT EXISTS family_id UUID;
ALTER TABLE story_comments ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS story_comments (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
 sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 recipient_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
 content TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_professional_likes
 AFTER INSERT OR DELETE ON public.professional_likes
 FOR EACH ROW EXECUTE FUNCTION fn_update_professional_likes_count();
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_profile_barbearia ON public.profiles;
DROP TRIGGER IF EXISTS on_profile_barbearia ON public.profiles;
CREATE TRIGGER trg_notify_queue_on_done
 AFTER UPDATE OF status ON public.queue_entries
 FOR EACH ROW
 EXECUTE FUNCTION public.fn_notify_queue_clients();
CREATE TRIGGER on_auth_user_created
 AFTER INSERT ON auth.users
 FOR EACH ROW
 EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER on_profile_barbearia
 AFTER INSERT OR UPDATE OF pro_type ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION public.handle_profile_barbearia();
CREATE TRIGGER on_profile_barbearia
 AFTER INSERT OR UPDATE OF pro_type ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION public.handle_profile_barbearia();
CREATE TRIGGER trg_sync_barbershop_geom
 BEFORE INSERT OR UPDATE OF latitude, longitude ON barbershops
 FOR EACH ROW EXECUTE FUNCTION sync_barbershop_geom();
DROP TRIGGER IF EXISTS trg_notify_queue_on_done ON public.queue_entries;
DROP TRIGGER IF EXISTS trg_professional_likes ON public.professional_likes;
DROP TRIGGER IF EXISTS trg_sync_barbershop_geom ON barbershops;
UPDATE public.profiles p
CREATE INDEX IF NOT EXISTS idx_profiles_email
 ON public.profiles (email);
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

DROP INDEX IF EXISTS idx_dm_conversation;

DROP INDEX IF EXISTS idx_dm_inbox;

DROP INDEX IF EXISTS idx_dm_story_ref;

DROP TABLE IF EXISTS direct_messages;

DROP TABLE IF EXISTS public.portfolio_likes;

COMMENT ON FUNCTION public.anonimizar_perfil(uuid) IS
 'LGPD Art. 18, VI — Anonimiza dados pessoais após validação do pedido de exclusão. '
 'SECURITY DEFINER: executa apenas via service_role (backend). '
 'Nunca deve ser chamada diretamente pelo app cliente.';

$$;
comment on table public.appointments is
 'Agendamentos. Status controla todo o ciclo do atendimento.';
comment on table public.barbershops is
 'Barbearias cadastradas. Coordenadas para busca por raio. Mídias somente no Storage.';
COMMENT ON TABLE public.data_access_log IS
 'LGPD Art. 37 — Registro de operações de tratamento de dados pessoais.';
COMMENT ON TABLE public.data_deletion_requests IS
 'LGPD Art. 18, VI — Pedidos de exclusão de dados pessoais. '
 'A anonimização efetiva é executada pelo backend após validação.';
comment on table public.file_download_events is
 'Registro de eventos de download por arquivo. '
 'Alimenta o ReplicationService para decisão de estratégia P2P/R2/BOTH.';
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

UPDATE public.transactions
CREATE OR REPLACE FUNCTION public.set_transaction_gross_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
 RETURN NEW;

$$;
create or replace trigger trg_portfolio_images_updated_at
 before update on public.portfolio_images
 for each row execute function public.set_updated_at();
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

end $$;
comment on table public.stories is
 'Stories de 24h. Somente metadados. Mídia fica no Storage em /stories/. Limpar expirados com cron.';
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

$$;
comment on table public.transactions is
 'Movimentação financeira. Não salvar dados sensíveis de cartão — apenas método.';
$$;

do $$ begin
 if not exists (
 select 1 from pg_policies
 where schemaname = 'public'
 and tablename = 'push_subscriptions'
 and policyname = 'push_subs_update_own'
 ) then
 execute $policy$
 create policy "push_subs_update_own"
 on public.push_subscriptions
 for update
 using (auth.uid() = user_id)
 with check (auth.uid() = user_id)
 $policy$;
create policy "media_files_owner_delete"
 on public.media_files for delete
 using (owner_id = auth.uid());
