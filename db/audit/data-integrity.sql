-- db-validate data integrity audit
-- Any returned row is a failure candidate and should be investigated.

create temp table db_validate_integrity_violations on commit drop as
with fk_orphans as (
  select 'appointments.client_id' as check_name, a.id::text as entity_id
  from public.appointments a
  left join public.profiles p on p.id = a.client_id
  where a.client_id is not null and p.id is null
  union all
  select 'appointments.professional_id' as check_name, a.id::text as entity_id
  from public.appointments a
  left join public.profiles p on p.id = a.professional_id
  where a.professional_id is not null and p.id is null
  union all
  select 'notifications.user_id' as check_name, n.id::text as entity_id
  from public.notifications n
  left join public.profiles p on p.id = n.user_id
  where n.user_id is not null and p.id is null
),
critical_nulls as (
  select 'profiles.id' as check_name, '<null>' as entity_id
  from public.profiles
  where id is null
  union all
  select 'appointments.scheduled_at' as check_name, id::text as entity_id
  from public.appointments
  where scheduled_at is null
),
enum_drift as (
  select 'appointments.status' as check_name, id::text as entity_id
  from public.appointments
  where status is not null
    and status not in ('pending', 'confirmed', 'in_progress', 'done', 'cancelled', 'no_show')
)
select *
from fk_orphans
union all
select *
from critical_nulls
union all
select *
from enum_drift
order by check_name, entity_id;

select * from db_validate_integrity_violations;

do $$
begin
  if exists (select 1 from db_validate_integrity_violations) then
    raise exception 'db-validate data integrity failed: % violation(s)',
      (select count(*) from db_validate_integrity_violations);
  end if;
end $$;
