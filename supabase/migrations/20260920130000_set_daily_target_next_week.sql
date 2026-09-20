-- Always schedule personal daily target changes for the following ISO week.
-- Never mutate daily_new_target mid-week when a row already exists.

create or replace function public.set_daily_target(
  p_group_id uuid,
  p_daily_new_target integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_next_week date;
  v_exists boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_daily_new_target < 0 then
    raise exception 'invalid target';
  end if;
  if not exists (
    select 1 from public.group_memberships m
    where m.group_id = p_group_id and m.user_id = v_uid and m.left_at is null
  ) then
    raise exception 'not a member of group';
  end if;

  v_next_week := app_private.week_start_for(v_uid, now()) + 7;
  select exists (
    select 1 from public.member_targets
    where user_id = v_uid and group_id = p_group_id
  ) into v_exists;

  if not v_exists then
    -- First row (rare): seed this week's target only; later edits go pending.
    insert into public.member_targets (user_id, group_id, daily_new_target)
    values (v_uid, p_group_id, p_daily_new_target);
  else
    update public.member_targets
    set
      pending_daily_new_target = p_daily_new_target,
      pending_effective_week_start = v_next_week,
      updated_at = now()
    where user_id = v_uid and group_id = p_group_id;
  end if;
end;
$$;

revoke execute on function public.set_daily_target(uuid, integer) from public;
revoke execute on function public.set_daily_target(uuid, integer) from anon;
grant execute on function public.set_daily_target(uuid, integer) to authenticated;
grant execute on function public.set_daily_target(uuid, integer) to service_role;
