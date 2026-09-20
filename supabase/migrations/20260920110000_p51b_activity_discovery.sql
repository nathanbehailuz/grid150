-- P5.1b: group activity feed + public group discovery

create or replace function public.group_recent_activity(
  p_group_id uuid,
  p_limit integer default 40
)
returns table (
  attempt_id uuid,
  user_id uuid,
  problem_id uuid,
  attempt_type public.attempt_type,
  outcome public.attempt_outcome,
  completed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 40), 100));
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not app_private.is_active_member(p_group_id) then
    raise exception 'not a member of group';
  end if;

  return query
  select
    a.id,
    a.user_id,
    a.problem_id,
    a.attempt_type,
    a.outcome,
    a.completed_at
  from public.attempts a
  inner join public.attempt_group_attributions aga
    on aga.attempt_id = a.id
   and aga.group_id = p_group_id
  where a.invalidated_at is null
  order by a.completed_at desc
  limit v_limit;
end;
$$;

create or replace function public.list_public_groups(p_query text default null)
returns table (
  id uuid,
  name text,
  join_mode public.group_join_mode,
  member_count bigint,
  created_at timestamptz,
  problems_per_week integer,
  deadline date
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_q text := nullif(trim(coalesce(p_query, '')), '');
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  return query
  select
    g.id,
    g.name,
    g.join_mode,
    (
      select count(*)::bigint
      from public.group_memberships m
      where m.group_id = g.id
        and m.left_at is null
    ) as member_count,
    g.created_at,
    gps.problems_per_week,
    gps.deadline
  from public.groups g
  left join public.group_pace_settings gps on gps.group_id = g.id
  where g.visibility = 'public'
    and (
      v_q is null
      or g.name ilike '%' || v_q || '%'
    )
  order by member_count desc, g.created_at desc;
end;
$$;

revoke execute on function public.group_recent_activity(uuid, integer) from public;
revoke execute on function public.group_recent_activity(uuid, integer) from anon;
grant execute on function public.group_recent_activity(uuid, integer) to authenticated;
grant execute on function public.group_recent_activity(uuid, integer) to service_role;

revoke execute on function public.list_public_groups(text) from public;
revoke execute on function public.list_public_groups(text) from anon;
grant execute on function public.list_public_groups(text) to authenticated;
grant execute on function public.list_public_groups(text) to service_role;
