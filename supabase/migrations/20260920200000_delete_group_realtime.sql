-- Owner delete group + Realtime publication for standings/manage/analytics.
-- Never touches public.alba_* tables.

create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if not app_private.has_group_role(
    p_group_id,
    array['owner']::public.membership_role[]
  ) then
    raise exception 'only the owner can delete this group';
  end if;

  -- attempt_group_attributions.membership_id is ON DELETE RESTRICT;
  -- remove attributions for this group first. Attempts themselves stay.
  delete from public.attempt_group_attributions
  where group_id = p_group_id;

  update public.profiles
  set focused_group_id = null, updated_at = now()
  where focused_group_id = p_group_id;

  delete from public.groups where id = p_group_id;
end;
$$;

revoke execute on function public.delete_group(uuid) from public;
revoke execute on function public.delete_group(uuid) from anon;
grant execute on function public.delete_group(uuid) to authenticated;
grant execute on function public.delete_group(uuid) to service_role;

-- Realtime: peers refresh standings / join requests / reactions.
-- Do not publish attempts (owner-only SELECT; private reflections).
do $$
begin
  begin
    alter publication supabase_realtime add table public.weekly_score_snapshots;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.group_join_requests;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.reactions;
  exception when duplicate_object then null;
  end;
end $$;
