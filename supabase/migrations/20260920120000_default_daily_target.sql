-- Group default daily new-problem target (set on create; new members inherit; members may lower later).

alter table public.group_pace_settings
  add column if not exists default_daily_new_target integer not null default 1
    check (default_daily_new_target >= 0);

comment on column public.group_pace_settings.default_daily_new_target is
  'Suggested daily new-problem target for new members; personal targets may be set lower.';

drop function if exists public.create_group(text, public.group_visibility, public.group_join_mode);

create or replace function public.create_group(
  p_name text,
  p_visibility public.group_visibility default 'private',
  p_join_mode public.group_join_mode default 'approval',
  p_daily_new_target integer default 1
)
returns table (
  group_id uuid,
  invite_code text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_gid uuid;
  v_code text;
  v_try integer;
  v_daily integer := coalesce(p_daily_new_target, 1);
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'name required';
  end if;
  if v_daily < 0 then
    raise exception 'invalid daily target';
  end if;

  insert into public.groups as g (name, visibility, join_mode, created_by)
  values (trim(p_name), p_visibility, p_join_mode, v_uid)
  returning g.id into v_gid;

  update public.group_pace_settings
  set default_daily_new_target = v_daily, updated_at = now()
  where group_id = v_gid;

  for v_try in 1..8 loop
    v_code := app_private.generate_invite_code();
    begin
      insert into public.group_invites as gi (group_id, code, created_by)
      values (v_gid, v_code, v_uid);
      exit;
    exception when unique_violation then
      if v_try = 8 then
        raise;
      end if;
    end;
  end loop;

  update public.profiles as pr
  set focused_group_id = v_gid, updated_at = now()
  where pr.id = v_uid;

  insert into public.member_targets as mt (user_id, group_id, daily_new_target)
  values (v_uid, v_gid, v_daily)
  on conflict (user_id, group_id) do update
    set daily_new_target = excluded.daily_new_target,
        updated_at = now();

  perform app_private.rebuild_progress_for_user(v_uid);

  return query select v_gid, v_code;
end;
$$;

create or replace function public.join_group_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.group_invites%rowtype;
  v_daily integer := 1;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into v_invite
  from public.group_invites
  where upper(code) = upper(trim(p_code))
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'invalid or expired invite code';
  end if;

  select coalesce(gps.default_daily_new_target, 1)
  into v_daily
  from public.group_pace_settings gps
  where gps.group_id = v_invite.group_id;

  if not exists (
    select 1 from public.group_memberships m
    where m.group_id = v_invite.group_id
      and m.user_id = v_uid
      and m.left_at is null
  ) then
    insert into public.group_memberships (group_id, user_id, role)
    values (v_invite.group_id, v_uid, 'member');
  end if;

  update public.profiles
  set focused_group_id = v_invite.group_id, updated_at = now()
  where id = v_uid;

  insert into public.member_targets (user_id, group_id, daily_new_target)
  values (v_uid, v_invite.group_id, v_daily)
  on conflict (user_id, group_id) do nothing;

  return v_invite.group_id;
end;
$$;

create or replace function public.resolve_join_request(
  p_request_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.group_join_requests%rowtype;
  v_daily integer := 1;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into strict v_req from public.group_join_requests where id = p_request_id;
  if not app_private.has_group_role(
    v_req.group_id, array['owner', 'admin']::public.membership_role[]
  ) then
    raise exception 'not authorized';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'request already resolved';
  end if;

  update public.group_join_requests
  set
    status = case when p_approve then 'approved'::public.join_request_status
                  else 'rejected'::public.join_request_status end,
    resolved_at = now(),
    resolved_by = v_uid
  where id = p_request_id;

  if p_approve then
    select coalesce(gps.default_daily_new_target, 1)
    into v_daily
    from public.group_pace_settings gps
    where gps.group_id = v_req.group_id;

    if not exists (
      select 1 from public.group_memberships
      where group_id = v_req.group_id and user_id = v_req.user_id and left_at is null
    ) then
      insert into public.group_memberships (group_id, user_id, role)
      values (v_req.group_id, v_req.user_id, 'member');
    end if;

    insert into public.member_targets (user_id, group_id, daily_new_target)
    values (v_req.user_id, v_req.group_id, v_daily)
    on conflict (user_id, group_id) do nothing;
  end if;
end;
$$;

revoke execute on function public.create_group(
  text, public.group_visibility, public.group_join_mode, integer
) from public;
revoke execute on function public.create_group(
  text, public.group_visibility, public.group_join_mode, integer
) from anon;
grant execute on function public.create_group(
  text, public.group_visibility, public.group_join_mode, integer
) to authenticated;
grant execute on function public.create_group(
  text, public.group_visibility, public.group_join_mode, integer
) to service_role;

revoke execute on function public.join_group_by_code(text) from public;
revoke execute on function public.join_group_by_code(text) from anon;
grant execute on function public.join_group_by_code(text) to authenticated;
grant execute on function public.join_group_by_code(text) to service_role;

revoke execute on function public.resolve_join_request(uuid, boolean) from public;
revoke execute on function public.resolve_join_request(uuid, boolean) from anon;
grant execute on function public.resolve_join_request(uuid, boolean) to authenticated;
grant execute on function public.resolve_join_request(uuid, boolean) to service_role;
