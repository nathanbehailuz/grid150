-- Grid150 P2: auth profile trigger, group bootstrap, RLS helpers + policies.
-- Domain unlock/score/invite RPCs remain P3.

-- ---------------------------------------------------------------------------
-- Private helpers schema
-- ---------------------------------------------------------------------------

create schema if not exists app_private;

revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;
grant usage on schema app_private to service_role;

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer to avoid RLS recursion)
-- ---------------------------------------------------------------------------

create or replace function app_private.is_active_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_memberships m
    where m.group_id = p_group_id
      and m.user_id = auth.uid()
      and m.left_at is null
  );
$$;

create or replace function app_private.has_group_role(
  p_group_id uuid,
  p_roles public.membership_role[]
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_memberships m
    where m.group_id = p_group_id
      and m.user_id = auth.uid()
      and m.left_at is null
      and m.role = any (p_roles)
  );
$$;

create or replace function app_private.shares_group_with(p_other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_memberships m1
    join public.group_memberships m2
      on m1.group_id = m2.group_id
    where m1.user_id = auth.uid()
      and m2.user_id = p_other_user_id
      and m1.left_at is null
      and m2.left_at is null
  );
$$;

create or replace function app_private.is_attempt_owner(p_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.attempts a
    where a.id = p_attempt_id
      and a.user_id = auth.uid()
  );
$$;

create or replace function app_private.can_admin_attempt(p_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.attempt_group_attributions aga
    where aga.attempt_id = p_attempt_id
      and app_private.has_group_role(
        aga.group_id,
        array['owner', 'admin']::public.membership_role[]
      )
  );
$$;

grant execute on function app_private.is_active_member(uuid) to authenticated;
grant execute on function app_private.has_group_role(uuid, public.membership_role[]) to authenticated;
grant execute on function app_private.shares_group_with(uuid) to authenticated;
grant execute on function app_private.is_attempt_owner(uuid) to authenticated;
grant execute on function app_private.can_admin_attempt(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Profile on signup
-- ---------------------------------------------------------------------------

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, timezone)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'User'
    ),
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'timezone'), ''),
      'UTC'
    )
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function app_private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Group bootstrap: owner membership + pace settings
-- ---------------------------------------------------------------------------

create or replace function app_private.handle_new_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_memberships (group_id, user_id, role)
  values (new.id, new.created_by, 'owner');

  insert into public.group_pace_settings (group_id)
  values (new.id);

  return new;
end;
$$;

drop trigger if exists on_group_created on public.groups;
create trigger on_group_created
  after insert on public.groups
  for each row
  execute function app_private.handle_new_group();

-- ---------------------------------------------------------------------------
-- Profiles updated_at
-- ---------------------------------------------------------------------------

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function app_private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Admin-safe attempt metadata (no private columns)
-- ---------------------------------------------------------------------------

create or replace function app_private.attempt_invalidation_meta_for_admin(p_group_id uuid)
returns table (
  id uuid,
  user_id uuid,
  problem_id uuid,
  attempt_type public.attempt_type,
  outcome public.attempt_outcome,
  completed_at timestamptz,
  invalidated_at timestamptz,
  invalidated_by uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.user_id,
    a.problem_id,
    a.attempt_type,
    a.outcome,
    a.completed_at,
    a.invalidated_at,
    a.invalidated_by
  from public.attempts a
  join public.attempt_group_attributions aga
    on aga.attempt_id = a.id
  where aga.group_id = p_group_id
    and app_private.has_group_role(
      p_group_id,
      array['owner', 'admin']::public.membership_role[]
    );
$$;

grant execute on function app_private.attempt_invalidation_meta_for_admin(uuid) to authenticated;

-- Public RPC wrapper for PostgREST
create or replace function public.attempt_invalidation_meta_for_admin(p_group_id uuid)
returns table (
  id uuid,
  user_id uuid,
  problem_id uuid,
  attempt_type public.attempt_type,
  outcome public.attempt_outcome,
  completed_at timestamptz,
  invalidated_at timestamptz,
  invalidated_by uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select * from app_private.attempt_invalidation_meta_for_admin(p_group_id);
$$;

grant execute on function public.attempt_invalidation_meta_for_admin(uuid) to authenticated;

-- Admin invalidate without exposing private columns
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
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not app_private.can_admin_attempt(p_attempt_id) then
    raise exception 'not authorized to invalidate attempt';
  end if;

  return query
  update public.attempts a
  set
    invalidated_at = now(),
    invalidated_by = auth.uid(),
    updated_at = now()
  where a.id = p_attempt_id
    and a.invalidated_at is null
  returning a.id, a.invalidated_at, a.invalidated_by;

  if not found then
    raise exception 'attempt not found or already invalidated';
  end if;
end;
$$;

grant execute on function public.invalidate_attempt(uuid) to authenticated;

-- Default privileges grant EXECUTE to PUBLIC; lock down anon.
revoke execute on function public.attempt_invalidation_meta_for_admin(uuid) from public;
revoke execute on function public.attempt_invalidation_meta_for_admin(uuid) from anon;
revoke execute on function public.invalidate_attempt(uuid) from public;
revoke execute on function public.invalidate_attempt(uuid) from anon;
grant execute on function public.attempt_invalidation_meta_for_admin(uuid) to service_role;
grant execute on function public.invalidate_attempt(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

-- topics / problems: read-only syllabus for authenticated
create policy topics_select_authenticated
  on public.topics for select to authenticated
  using (true);

create policy problems_select_authenticated
  on public.problems for select to authenticated
  using (true);

-- profiles
create policy profiles_select_self_or_comember
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or app_private.shares_group_with(id)
  );

create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and (
      focused_group_id is null
      or app_private.is_active_member(focused_group_id)
    )
  );

-- groups
create policy groups_select_member_or_public
  on public.groups for select to authenticated
  using (
    visibility = 'public'
    or created_by = auth.uid()
    or app_private.is_active_member(id)
  );

create policy groups_insert_self
  on public.groups for insert to authenticated
  with check (created_by = auth.uid());

create policy groups_update_owner_admin
  on public.groups for update to authenticated
  using (
    app_private.has_group_role(
      id,
      array['owner', 'admin']::public.membership_role[]
    )
  )
  with check (
    app_private.has_group_role(
      id,
      array['owner', 'admin']::public.membership_role[]
    )
  );

create policy groups_delete_owner
  on public.groups for delete to authenticated
  using (
    app_private.has_group_role(
      id,
      array['owner']::public.membership_role[]
    )
  );

-- group_memberships
create policy group_memberships_select_member
  on public.group_memberships for select to authenticated
  using (app_private.is_active_member(group_id));

create policy group_memberships_insert_open_or_admin
  on public.group_memberships for insert to authenticated
  with check (
    (
      user_id = auth.uid()
      and exists (
        select 1
        from public.groups g
        where g.id = group_id
          and g.visibility = 'public'
          and g.join_mode = 'open'
      )
    )
    or app_private.has_group_role(
      group_id,
      array['owner', 'admin']::public.membership_role[]
    )
  );

create policy group_memberships_update_admin_or_self_leave
  on public.group_memberships for update to authenticated
  using (
    app_private.has_group_role(
      group_id,
      array['owner', 'admin']::public.membership_role[]
    )
    or user_id = auth.uid()
  )
  with check (
    app_private.has_group_role(
      group_id,
      array['owner', 'admin']::public.membership_role[]
    )
    or user_id = auth.uid()
  );

-- group_join_requests
create policy group_join_requests_select
  on public.group_join_requests for select to authenticated
  using (
    user_id = auth.uid()
    or app_private.has_group_role(
      group_id,
      array['owner', 'admin']::public.membership_role[]
    )
  );

create policy group_join_requests_insert_self
  on public.group_join_requests for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1
      from public.groups g
      where g.id = group_id
        and g.visibility = 'public'
        and g.join_mode = 'approval'
    )
  );

create policy group_join_requests_update_admin
  on public.group_join_requests for update to authenticated
  using (
    app_private.has_group_role(
      group_id,
      array['owner', 'admin']::public.membership_role[]
    )
  )
  with check (
    app_private.has_group_role(
      group_id,
      array['owner', 'admin']::public.membership_role[]
    )
  );

create policy group_join_requests_delete_self_pending
  on public.group_join_requests for delete to authenticated
  using (
    user_id = auth.uid()
    and status = 'pending'
  );

-- group_invites (redeem-by-code is P3 RPC; P2 is owner/admin only)
create policy group_invites_select_admin
  on public.group_invites for select to authenticated
  using (
    app_private.has_group_role(
      group_id,
      array['owner', 'admin']::public.membership_role[]
    )
  );

create policy group_invites_insert_admin
  on public.group_invites for insert to authenticated
  with check (
    created_by = auth.uid()
    and app_private.has_group_role(
      group_id,
      array['owner', 'admin']::public.membership_role[]
    )
  );

create policy group_invites_update_admin
  on public.group_invites for update to authenticated
  using (
    app_private.has_group_role(
      group_id,
      array['owner', 'admin']::public.membership_role[]
    )
  )
  with check (
    app_private.has_group_role(
      group_id,
      array['owner', 'admin']::public.membership_role[]
    )
  );

create policy group_invites_delete_admin
  on public.group_invites for delete to authenticated
  using (
    app_private.has_group_role(
      group_id,
      array['owner', 'admin']::public.membership_role[]
    )
  );

-- group_pace_settings
create policy group_pace_settings_select_member
  on public.group_pace_settings for select to authenticated
  using (app_private.is_active_member(group_id));

create policy group_pace_settings_update_admin
  on public.group_pace_settings for update to authenticated
  using (
    app_private.has_group_role(
      group_id,
      array['owner', 'admin']::public.membership_role[]
    )
  )
  with check (
    app_private.has_group_role(
      group_id,
      array['owner', 'admin']::public.membership_role[]
    )
  );

-- member_targets
create policy member_targets_select_self_or_comember
  on public.member_targets for select to authenticated
  using (
    user_id = auth.uid()
    or app_private.is_active_member(group_id)
  );

create policy member_targets_insert_self
  on public.member_targets for insert to authenticated
  with check (
    user_id = auth.uid()
    and app_private.is_active_member(group_id)
  );

create policy member_targets_update_self
  on public.member_targets for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and app_private.is_active_member(group_id)
  );

-- attempts: owner only for direct table access
create policy attempts_select_owner
  on public.attempts for select to authenticated
  using (user_id = auth.uid());

create policy attempts_insert_owner
  on public.attempts for insert to authenticated
  with check (user_id = auth.uid());

create policy attempts_update_owner
  on public.attempts for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy attempts_delete_owner
  on public.attempts for delete to authenticated
  using (user_id = auth.uid());

-- attempt_group_attributions
create policy attempt_attributions_select
  on public.attempt_group_attributions for select to authenticated
  using (
    app_private.is_attempt_owner(attempt_id)
    or app_private.is_active_member(group_id)
  );

create policy attempt_attributions_insert_owner
  on public.attempt_group_attributions for insert to authenticated
  with check (
    app_private.is_attempt_owner(attempt_id)
    and app_private.is_active_member(group_id)
  );

create policy attempt_attributions_delete_owner
  on public.attempt_group_attributions for delete to authenticated
  using (app_private.is_attempt_owner(attempt_id));

-- problem_progress
create policy problem_progress_select_self_or_comember
  on public.problem_progress for select to authenticated
  using (
    user_id = auth.uid()
    or app_private.shares_group_with(user_id)
  );

create policy problem_progress_insert_self
  on public.problem_progress for insert to authenticated
  with check (user_id = auth.uid());

create policy problem_progress_update_self
  on public.problem_progress for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- review_tasks: owner only
create policy review_tasks_select_owner
  on public.review_tasks for select to authenticated
  using (user_id = auth.uid());

create policy review_tasks_insert_owner
  on public.review_tasks for insert to authenticated
  with check (user_id = auth.uid());

create policy review_tasks_update_owner
  on public.review_tasks for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy review_tasks_delete_owner
  on public.review_tasks for delete to authenticated
  using (user_id = auth.uid());

-- weekly_score_snapshots: members read; writes via service/P3 only
create policy weekly_score_snapshots_select_member
  on public.weekly_score_snapshots for select to authenticated
  using (app_private.is_active_member(group_id));

-- reactions
create policy reactions_select_comember
  on public.reactions for select to authenticated
  using (
    user_id = auth.uid()
    or app_private.shares_group_with(user_id)
  );

create policy reactions_insert_self
  on public.reactions for insert to authenticated
  with check (user_id = auth.uid());

create policy reactions_delete_self
  on public.reactions for delete to authenticated
  using (user_id = auth.uid());

-- attempt_audit_log: owner or group admin of attributed groups
create policy attempt_audit_log_select
  on public.attempt_audit_log for select to authenticated
  using (
    app_private.is_attempt_owner(attempt_id)
    or app_private.can_admin_attempt(attempt_id)
  );
