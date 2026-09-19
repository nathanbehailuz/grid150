-- PL/pgSQL RETURNS TABLE column names collide with INSERT targets.
create or replace function public.create_group(
  p_name text,
  p_visibility public.group_visibility default 'private',
  p_join_mode public.group_join_mode default 'approval'
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
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if nullif(trim(p_name), '') is null then
    raise exception 'name required';
  end if;

  insert into public.groups as g (name, visibility, join_mode, created_by)
  values (trim(p_name), p_visibility, p_join_mode, v_uid)
  returning g.id into v_gid;

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
  values (v_uid, v_gid, 1)
  on conflict (user_id, group_id) do nothing;

  perform app_private.rebuild_progress_for_user(v_uid);

  return query select v_gid, v_code;
end;
$$;

revoke execute on function public.create_group(text, public.group_visibility, public.group_join_mode) from public;
revoke execute on function public.create_group(text, public.group_visibility, public.group_join_mode) from anon;
grant execute on function public.create_group(text, public.group_visibility, public.group_join_mode) to authenticated;
grant execute on function public.create_group(text, public.group_visibility, public.group_join_mode) to service_role;
