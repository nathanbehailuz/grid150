-- P5.1: invite create/revoke RPCs for group admin UI

create or replace function public.create_group_invite(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_try integer;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not app_private.has_group_role(
    p_group_id,
    array['owner', 'admin']::public.membership_role[]
  ) then
    raise exception 'not authorized';
  end if;

  for v_try in 1..8 loop
    v_code := app_private.generate_invite_code();
    begin
      insert into public.group_invites (group_id, code, created_by)
      values (p_group_id, v_code, v_uid);
      return v_code;
    exception when unique_violation then
      if v_try = 8 then
        raise;
      end if;
    end;
  end loop;

  raise exception 'could not generate invite code';
end;
$$;

create or replace function public.revoke_group_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.group_invites%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into strict v_invite from public.group_invites where id = p_invite_id;

  if not app_private.has_group_role(
    v_invite.group_id,
    array['owner', 'admin']::public.membership_role[]
  ) then
    raise exception 'not authorized';
  end if;

  if v_invite.revoked_at is not null then
    raise exception 'invite already revoked';
  end if;

  update public.group_invites
  set revoked_at = now()
  where id = p_invite_id;
end;
$$;

revoke execute on function public.create_group_invite(uuid) from public;
revoke execute on function public.create_group_invite(uuid) from anon;
grant execute on function public.create_group_invite(uuid) to authenticated;
grant execute on function public.create_group_invite(uuid) to service_role;

revoke execute on function public.revoke_group_invite(uuid) from public;
revoke execute on function public.revoke_group_invite(uuid) from anon;
grant execute on function public.revoke_group_invite(uuid) to authenticated;
grant execute on function public.revoke_group_invite(uuid) to service_role;
