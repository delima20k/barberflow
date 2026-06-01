-- db-validate performance baseline
-- Execute with: psql "$SUPABASE_STAGING_DB_URL" -v ON_ERROR_STOP=1 -f db/perf/critical-queries.sql
-- Keep exactly 10 business-critical reads here. The CI stores the text output as an artifact.

\timing on

select 'critical_query_01_search_profiles' as query_name;
explain (analyze, buffers, format text)
select id, full_name, role, is_active
from public.profiles
where full_name ilike 'a%'
order by full_name
limit 20;

select 'critical_query_02_user_appointments' as query_name;
explain (analyze, buffers, format text)
select id, client_id, professional_id, scheduled_at, status
from public.appointments
where client_id = '00000000-0000-0000-0000-000000000001'
order by scheduled_at desc
limit 20;

select 'critical_query_03_professional_agenda' as query_name;
explain (analyze, buffers, format text)
select id, professional_id, scheduled_at, status
from public.appointments
where professional_id = '00000000-0000-0000-0000-000000000002'
  and scheduled_at >= now() - interval '30 days'
order by scheduled_at;

select 'critical_query_04_notifications_inbox' as query_name;
explain (analyze, buffers, format text)
select id, user_id, is_read, created_at
from public.notifications
where user_id = '00000000-0000-0000-0000-000000000001'
order by created_at desc
limit 50;

select 'critical_query_05_direct_messages_thread' as query_name;
explain (analyze, buffers, format text)
select id, sender_id, recipient_id, created_at
from public.direct_messages
where sender_id = '00000000-0000-0000-0000-000000000001'
   or recipient_id = '00000000-0000-0000-0000-000000000001'
order by created_at desc
limit 50;

select 'critical_query_06_portfolio_by_professional' as query_name;
explain (analyze, buffers, format text)
select id, owner_id, created_at
from public.portfolio_images
where owner_id = '00000000-0000-0000-0000-000000000002'
order by created_at desc
limit 30;

select 'critical_query_07_stories_feed' as query_name;
explain (analyze, buffers, format text)
select id, owner_id, expires_at, created_at
from public.stories
where expires_at > now()
order by created_at desc
limit 50;

select 'critical_query_08_queue_entries_active' as query_name;
explain (analyze, buffers, format text)
select id, barbershop_id, client_id, status, check_in_at
from public.queue_entries
where barbershop_id = '00000000-0000-0000-0000-000000000003'
  and status in ('waiting', 'in_service')
order by check_in_at;

select 'critical_query_09_favorites_by_user' as query_name;
explain (analyze, buffers, format text)
select id, user_id, professional_id, created_at
from public.favorite_professionals
where user_id = '00000000-0000-0000-0000-000000000001'
order by created_at desc
limit 50;

select 'critical_query_10_likes_by_content' as query_name;
explain (analyze, buffers, format text)
select id, content_id, content_type, created_at
from public.likes
where content_id = '00000000-0000-0000-0000-000000000002'
order by created_at desc
limit 50;
