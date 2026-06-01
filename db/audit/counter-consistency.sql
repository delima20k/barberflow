-- db-validate counter consistency audit
-- Warning-only in CI. Adjust threshold with: -v drift_threshold=0

\set drift_threshold :drift_threshold
\if :{?drift_threshold}
\else
\set drift_threshold 0
\endif

create temp table db_validate_counter_drift on commit drop as
with counter_checks as (
  select
    'portfolio_items.likes_count' as counter_name,
    p.id::text as entity_id,
    coalesce(p.likes_count, 0)::bigint as stored_value,
    count(l.id)::bigint as actual_value
  from public.portfolio_images p
  left join public.likes l on l.content_type = 'portfolio_image' and l.content_id = p.id
  group by p.id, p.likes_count
  union all
  select
    'stories.likes_count' as counter_name,
    s.id::text as entity_id,
    coalesce(s.likes_count, 0)::bigint as stored_value,
    count(l.id)::bigint as actual_value
  from public.stories s
  left join public.likes l on l.content_type = 'story' and l.content_id = s.id
  group by s.id, s.likes_count
)
select *
from counter_checks
where abs(stored_value - actual_value) > :drift_threshold
order by counter_name, entity_id;

select * from db_validate_counter_drift;

do $$
begin
  if exists (select 1 from db_validate_counter_drift) then
    raise warning 'db-validate counter consistency: % drift row(s) above threshold',
      (select count(*) from db_validate_counter_drift);
  end if;
end $$;
