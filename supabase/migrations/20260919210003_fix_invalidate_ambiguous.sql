-- Fix RETURNS TABLE column ambiguity in invalidate_attempt.
create or replace function public.invalidate_attempt(p_attempt_id uuid)
returns table (
  id uuid,
  invalidated_at timestamptz,
  invalidated_by uuid
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_attempt public.attempts%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into strict v_attempt
  from public.attempts a
  where a.id = p_attempt_id;

  if not app_private.can_admin_attempt(p_attempt_id) then
    raise exception 'not authorized to invalidate attempt';
  end if;

  if v_attempt.completed_at >= now() - interval '10 minutes' then
    raise exception 'edit window still open; member should edit or delete';
  end if;

  if v_attempt.invalidated_at is not null then
    raise exception 'attempt already invalidated';
  end if;

  perform app_private.allow_attempt_mutation();

  return query
  update public.attempts a
  set
    invalidated_at = now(),
    invalidated_by = v_uid,
    updated_at = now()
  where a.id = p_attempt_id
  returning a.id, a.invalidated_at, a.invalidated_by;

  insert into public.attempt_audit_log (attempt_id, actor_id, action, reason)
  values (p_attempt_id, v_uid, 'invalidate', null);

  perform app_private.recompute_after_attempt_change(p_attempt_id);
end;
$$;

revoke execute on function public.invalidate_attempt(uuid) from public;
revoke execute on function public.invalidate_attempt(uuid) from anon;
grant execute on function public.invalidate_attempt(uuid) to authenticated;
grant execute on function public.invalidate_attempt(uuid) to service_role;
