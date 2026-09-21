-- Keep group identity unambiguous and make create_group safe under retries.

create unique index groups_name_normalized_unique
  on public.groups (lower(trim(name)));

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
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_gid uuid;
  v_code text;
  v_try integer;
  v_name text := trim(p_name);
  v_daily integer := coalesce(p_daily_new_target, 1);
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if v_name is null or char_length(v_name) < 2 then
    raise exception 'group name must be at least 2 characters';
  end if;
  if char_length(v_name) > 80 then
    raise exception 'group name must be 80 characters or fewer';
  end if;
  if v_daily < 0 or v_daily > 20 then
    raise exception 'daily target must be between 0 and 20';
  end if;

  if exists (
    select 1
    from public.groups g
    where lower(trim(g.name)) = lower(v_name)
  ) then
    raise exception 'group name already taken';
  end if;

  begin
    insert into public.groups as g (name, visibility, join_mode, created_by)
    values (v_name, p_visibility, p_join_mode, v_uid)
    returning g.id into v_gid;
  exception when unique_violation then
    raise exception 'group name already taken';
  end;

  update public.group_pace_settings
  set default_daily_new_target = v_daily, updated_at = now()
  where group_id = v_gid;

  -- Public/open groups are joined through Discover, so an automatic invite
  -- would be redundant. Owners can still create one from Manage.
  if not (p_visibility = 'public' and p_join_mode = 'open') then
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
  end if;

  update public.profiles as pr
  set focused_group_id = v_gid, updated_at = now()
  where pr.id = v_uid;

  insert into public.member_targets as mt (
    user_id,
    group_id,
    daily_new_target
  )
  values (v_uid, v_gid, v_daily)
  on conflict (user_id, group_id) do update
    set daily_new_target = excluded.daily_new_target,
        updated_at = now();

  perform app_private.rebuild_progress_for_user(v_uid);

  return query select v_gid, v_code;
end;
$$;

revoke execute on function public.create_group(
  text,
  public.group_visibility,
  public.group_join_mode,
  integer
) from public, anon;

grant execute on function public.create_group(
  text,
  public.group_visibility,
  public.group_join_mode,
  integer
) to authenticated, service_role;
