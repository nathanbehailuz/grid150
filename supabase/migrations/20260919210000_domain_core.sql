-- Grid150 P3: domain helpers, RPCs, attempt edit-window guard.
-- Client is not the source of truth for unlocks, scores, or attribution.

-- ---------------------------------------------------------------------------
-- Mutation bypass flag (set by SECURITY DEFINER RPCs)
-- ---------------------------------------------------------------------------

create or replace function app_private.allow_attempt_mutation()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('app.allow_attempt_mutation', 'on', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Timezone / calendar helpers
-- ---------------------------------------------------------------------------

create or replace function app_private.user_timezone(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(trim(p.timezone), ''),
    'UTC'
  )
  from public.profiles p
  where p.id = p_uid;
$$;

create or replace function app_private.local_today(p_uid uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (timezone(app_private.user_timezone(p_uid), now()))::date;
$$;

create or replace function app_private.week_start_for(p_uid uuid, p_at timestamptz default now())
returns date
language sql
stable
security definer
set search_path = public
as $$
  select date_trunc(
    'week',
    timezone(app_private.user_timezone(p_uid), p_at)
  )::date;
$$;

create or replace function app_private.local_dow(p_uid uuid, p_at timestamptz)
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  -- Postgres DOW: 0=Sunday .. 6=Saturday (matches active_days)
  select extract(
    dow from timezone(app_private.user_timezone(p_uid), p_at)
  )::smallint;
$$;

create or replace function app_private.local_date(p_uid uuid, p_at timestamptz)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select (timezone(app_private.user_timezone(p_uid), p_at))::date;
$$;

-- ---------------------------------------------------------------------------
-- Syllabus / unlock
-- ---------------------------------------------------------------------------

create or replace function app_private.is_successful_new_solve(p_outcome public.attempt_outcome)
returns boolean
language sql
immutable
as $$
  select p_outcome in (
    'solved_independently'::public.attempt_outcome,
    'solved_with_hints'::public.attempt_outcome
  );
$$;

create or replace function app_private.problem_is_completed(p_uid uuid, p_problem_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.attempts a
    where a.user_id = p_uid
      and a.problem_id = p_problem_id
      and a.invalidated_at is null
      and a.attempt_type = 'new_problem'
      and app_private.is_successful_new_solve(a.outcome)
  );
$$;

create or replace function app_private.next_new_problem_id(p_uid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.problems p
  where not app_private.problem_is_completed(p_uid, p.id)
  order by p.global_order
  limit 1;
$$;

create or replace function app_private.has_overdue_review(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.review_tasks r
    where r.user_id = p_uid
      and r.status = 'pending'
      and r.due_at < now()
  );
$$;

-- ---------------------------------------------------------------------------
-- Review scheduling
-- ---------------------------------------------------------------------------

create or replace function app_private.review_delay_days(
  p_attempt_type public.attempt_type,
  p_outcome public.attempt_outcome,
  p_could_explain boolean
)
returns integer
language plpgsql
immutable
as $$
begin
  if p_attempt_type = 'scheduled_review' then
    if p_outcome = 'solved_independently' and p_could_explain then
      return 30;
    end if;
    return 2; -- failed scheduled review
  end if;

  if p_outcome = 'could_not_solve' then
    return 1;
  end if;
  if p_outcome = 'solved_with_hints' and not p_could_explain then
    return 1;
  end if;
  if p_outcome = 'solved_independently' and not p_could_explain then
    return 2;
  end if;
  if p_outcome = 'solved_with_hints' and p_could_explain then
    return 4;
  end if;
  if p_outcome = 'solved_independently' and p_could_explain then
    return 14;
  end if;
  return 1;
end;
$$;

create or replace function app_private.schedule_review(
  p_uid uuid,
  p_problem_id uuid,
  p_source_attempt_id uuid,
  p_due_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.review_tasks%rowtype;
begin
  select * into v_existing
  from public.review_tasks r
  where r.user_id = p_uid
    and r.problem_id = p_problem_id
    and r.status = 'pending'
  order by r.due_at
  limit 1
  for update;

  if found then
    if p_due_at < v_existing.due_at then
      update public.review_tasks
      set
        due_at = p_due_at,
        source_attempt_id = p_source_attempt_id,
        updated_at = now()
      where id = v_existing.id;
    end if;
    return;
  end if;

  insert into public.review_tasks (
    user_id, problem_id, due_at, status, source_attempt_id
  ) values (
    p_uid, p_problem_id, p_due_at, 'pending', p_source_attempt_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Attribution + progress
-- ---------------------------------------------------------------------------

create or replace function app_private.attribute_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.attempts%rowtype;
begin
  select * into strict v_attempt from public.attempts where id = p_attempt_id;

  insert into public.attempt_group_attributions (
    attempt_id, group_id, membership_id
  )
  select
    v_attempt.id,
    m.group_id,
    m.id
  from public.group_memberships m
  where m.user_id = v_attempt.user_id
    and m.left_at is null
    and v_attempt.completed_at >= m.joined_at
  on conflict (attempt_id, group_id) do nothing;
end;
$$;

create or replace function app_private.apply_progress_after_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.attempts%rowtype;
  v_next uuid;
begin
  select * into strict v_attempt from public.attempts where id = p_attempt_id;
  if v_attempt.invalidated_at is not null then
    return;
  end if;
  if v_attempt.attempt_type <> 'new_problem' then
    return;
  end if;
  if not app_private.is_successful_new_solve(v_attempt.outcome) then
    return;
  end if;

  insert into public.problem_progress (
    user_id, problem_id, status, unlocked_at, completed_at
  ) values (
    v_attempt.user_id,
    v_attempt.problem_id,
    'completed',
    coalesce(
      (select unlocked_at from public.problem_progress
       where user_id = v_attempt.user_id and problem_id = v_attempt.problem_id),
      v_attempt.completed_at
    ),
    v_attempt.completed_at
  )
  on conflict (user_id, problem_id) do update
  set
    status = 'completed',
    completed_at = excluded.completed_at,
    updated_at = now();

  v_next := app_private.next_new_problem_id(v_attempt.user_id);
  if v_next is not null then
    insert into public.problem_progress (
      user_id, problem_id, status, unlocked_at
    ) values (
      v_attempt.user_id, v_next, 'available', now()
    )
    on conflict (user_id, problem_id) do update
    set
      status = case
        when public.problem_progress.status = 'completed' then 'completed'
        else 'available'
      end,
      unlocked_at = coalesce(public.problem_progress.unlocked_at, excluded.unlocked_at),
      updated_at = now();
  end if;
end;
$$;

create or replace function app_private.rebuild_progress_for_user(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_next uuid;
begin
  delete from public.problem_progress where user_id = p_uid;

  for r in
    select distinct on (p.global_order) a.problem_id, a.completed_at, p.global_order
    from public.attempts a
    join public.problems p on p.id = a.problem_id
    where a.user_id = p_uid
      and a.invalidated_at is null
      and a.attempt_type = 'new_problem'
      and app_private.is_successful_new_solve(a.outcome)
    order by p.global_order, a.completed_at
  loop
    insert into public.problem_progress (
      user_id, problem_id, status, unlocked_at, completed_at
    ) values (
      p_uid, r.problem_id, 'completed', r.completed_at, r.completed_at
    );
  end loop;

  v_next := app_private.next_new_problem_id(p_uid);
  if v_next is not null then
    insert into public.problem_progress (
      user_id, problem_id, status, unlocked_at
    ) values (
      p_uid, v_next, 'available', now()
    )
    on conflict (user_id, problem_id) do nothing;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Targets
-- ---------------------------------------------------------------------------

create or replace function app_private.effective_daily_target(
  p_uid uuid,
  p_group_id uuid,
  p_on_date date
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.member_targets%rowtype;
begin
  select * into v_row
  from public.member_targets
  where user_id = p_uid and group_id = p_group_id;

  if not found then
    return 1; -- default personal target
  end if;

  if v_row.pending_daily_new_target is not null
     and v_row.pending_effective_week_start is not null
     and p_on_date >= v_row.pending_effective_week_start then
    return v_row.pending_daily_new_target;
  end if;

  return v_row.daily_new_target;
end;
$$;

-- ---------------------------------------------------------------------------
-- Scoring
-- ---------------------------------------------------------------------------

create or replace function app_private.active_days_in_week(
  p_group_id uuid,
  p_uid uuid,
  p_week_start date
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days smallint[];
  v_count integer := 0;
  i integer;
  d date;
begin
  select active_days into v_days
  from public.group_pace_settings
  where group_id = p_group_id;

  if v_days is null then
    v_days := array[1, 2, 3, 4, 5]::smallint[];
  end if;

  for i in 0..6 loop
    d := p_week_start + i;
    if extract(dow from d)::smallint = any (v_days) then
      -- only count days up to today for current week
      if d <= app_private.local_today(p_uid) then
        v_count := v_count + 1;
      elsif p_week_start + 6 < app_private.local_today(p_uid) then
        v_count := v_count + 1;
      end if;
    end if;
  end loop;

  -- For completed past weeks, count all configured active days in the week
  if p_week_start + 6 < app_private.local_today(p_uid) then
    v_count := 0;
    for i in 0..6 loop
      d := p_week_start + i;
      if extract(dow from d)::smallint = any (v_days) then
        v_count := v_count + 1;
      end if;
    end loop;
  end if;

  return greatest(v_count, 1);
end;
$$;

create or replace function app_private.new_solves_on_local_day(
  p_uid uuid,
  p_group_id uuid,
  p_day date
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(
    case a.outcome
      when 'solved_independently' then 1.0
      when 'solved_with_hints' then 1.0 -- target counts new problems completed, not weighted
      else 0
    end
  ), 0)
  from public.attempts a
  join public.attempt_group_attributions aga on aga.attempt_id = a.id
  where a.user_id = p_uid
    and aga.group_id = p_group_id
    and a.invalidated_at is null
    and a.attempt_type = 'new_problem'
    and app_private.is_successful_new_solve(a.outcome)
    and app_private.local_date(p_uid, a.completed_at) = p_day;
$$;

create or replace function app_private.met_target_on_day(
  p_uid uuid,
  p_group_id uuid,
  p_day date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.new_solves_on_local_day(p_uid, p_group_id, p_day)
    >= app_private.effective_daily_target(p_uid, p_group_id, p_day);
$$;

create or replace function app_private.recompute_user_group_week(
  p_uid uuid,
  p_group_id uuid,
  p_week_start date
)
returns public.weekly_score_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_indep integer := 0;
  v_hint integer := 0;
  v_weighted numeric := 0;
  v_target numeric;
  v_ratio numeric;
  v_progress numeric(5, 2);
  v_consistency numeric(5, 2);
  v_improvement numeric(5, 2);
  v_met integer := 0;
  v_active integer;
  v_days smallint[];
  i integer;
  d date;
  v_baseline numeric;
  v_prior_avg numeric;
  v_prior_count integer;
  v_result public.weekly_score_snapshots;
begin
  select coalesce(sum(case when a.outcome = 'solved_independently' then 1 else 0 end), 0),
         coalesce(sum(case when a.outcome = 'solved_with_hints' then 1 else 0 end), 0)
  into v_indep, v_hint
  from public.attempts a
  join public.attempt_group_attributions aga on aga.attempt_id = a.id
  where a.user_id = p_uid
    and aga.group_id = p_group_id
    and a.invalidated_at is null
    and a.attempt_type = 'new_problem'
    and app_private.is_successful_new_solve(a.outcome)
    and app_private.week_start_for(p_uid, a.completed_at) = p_week_start;

  v_weighted := v_indep * 1.0 + v_hint * 0.6;
  v_active := app_private.active_days_in_week(p_group_id, p_uid, p_week_start);
  v_target := app_private.effective_daily_target(p_uid, p_group_id, p_week_start)
    * v_active;

  if v_target <= 0 then
    v_progress := 0;
  else
    v_ratio := least(1.2, v_weighted / v_target);
    v_progress := round((v_ratio / 1.2) * 50, 2);
  end if;

  select active_days into v_days
  from public.group_pace_settings where group_id = p_group_id;
  if v_days is null then
    v_days := array[1, 2, 3, 4, 5]::smallint[];
  end if;

  v_met := 0;
  v_active := 0;
  for i in 0..6 loop
    d := p_week_start + i;
    if extract(dow from d)::smallint = any (v_days) then
      if p_week_start + 6 < app_private.local_today(p_uid) or d <= app_private.local_today(p_uid) then
        v_active := v_active + 1;
        if app_private.met_target_on_day(p_uid, p_group_id, d) then
          v_met := v_met + 1;
        end if;
      end if;
    end if;
  end loop;

  if v_active = 0 then
    v_consistency := 0;
  else
    v_consistency := round((v_met::numeric / v_active) * 25, 2);
  end if;

  select count(*), coalesce(avg(independent_solves), 0)
  into v_prior_count, v_prior_avg
  from (
    select independent_solves
    from public.weekly_score_snapshots s
    where s.user_id = p_uid
      and s.group_id = p_group_id
      and s.week_start < p_week_start
    order by s.week_start desc
    limit 3
  ) prior;

  if v_prior_count = 0 then
    v_improvement := 12.5;
  else
    v_baseline := greatest(v_prior_avg, 1);
    v_improvement := round(
      least(25, greatest(0,
        12.5 + 12.5 * greatest(-1, least(1, (v_indep - v_baseline) / v_baseline))
      )),
      2
    );
  end if;

  insert into public.weekly_score_snapshots (
    user_id, group_id, week_start,
    progress, consistency, improvement, total,
    independent_solves, hint_assisted_solves
  ) values (
    p_uid, p_group_id, p_week_start,
    v_progress, v_consistency, v_improvement,
    round(v_progress + v_consistency + v_improvement, 2),
    v_indep, v_hint
  )
  on conflict (user_id, group_id, week_start) do update
  set
    progress = excluded.progress,
    consistency = excluded.consistency,
    improvement = excluded.improvement,
    total = excluded.total,
    independent_solves = excluded.independent_solves,
    hint_assisted_solves = excluded.hint_assisted_solves
  returning * into v_result;

  return v_result;
end;
$$;

create or replace function app_private.recompute_after_attempt_change(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.attempts%rowtype;
  r record;
  v_latest public.attempts%rowtype;
  v_due timestamptz;
begin
  select * into strict v_attempt from public.attempts where id = p_attempt_id;

  perform app_private.rebuild_progress_for_user(v_attempt.user_id);

  -- Cancel pending reviews tied to this attempt if invalidated/deleted path
  if v_attempt.invalidated_at is not null then
    update public.review_tasks
    set status = 'cancelled', updated_at = now()
    where source_attempt_id = p_attempt_id
      and status = 'pending';

    -- Reschedule from latest valid attempt on same problem if any
    select * into v_latest
    from public.attempts a
    where a.user_id = v_attempt.user_id
      and a.problem_id = v_attempt.problem_id
      and a.invalidated_at is null
    order by a.completed_at desc
    limit 1;

    if found then
      v_due := v_latest.completed_at
        + make_interval(days => app_private.review_delay_days(
            v_latest.attempt_type, v_latest.outcome, v_latest.could_explain
          ));
      perform app_private.schedule_review(
        v_latest.user_id, v_latest.problem_id, v_latest.id, v_due
      );
    end if;
  end if;

  for r in
    select distinct aga.group_id,
           app_private.week_start_for(v_attempt.user_id, v_attempt.completed_at) as week_start
    from public.attempt_group_attributions aga
    where aga.attempt_id = p_attempt_id
  loop
    perform app_private.recompute_user_group_week(
      v_attempt.user_id, r.group_id, r.week_start
    );
  end loop;
end;
$$;

create or replace function app_private.current_streak_value(p_uid uuid, p_group_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days smallint[];
  v_day date;
  v_streak integer := 0;
  v_guard integer := 0;
begin
  select active_days into v_days
  from public.group_pace_settings where group_id = p_group_id;
  if v_days is null then
    v_days := array[1, 2, 3, 4, 5]::smallint[];
  end if;

  v_day := app_private.local_today(p_uid);

  -- If today is active and not yet met, start from yesterday
  if extract(dow from v_day)::smallint = any (v_days)
     and not app_private.met_target_on_day(p_uid, p_group_id, v_day) then
    v_day := v_day - 1;
  end if;

  while v_guard < 400 loop
    v_guard := v_guard + 1;
    if extract(dow from v_day)::smallint = any (v_days) then
      if app_private.met_target_on_day(p_uid, p_group_id, v_day) then
        v_streak := v_streak + 1;
      else
        exit;
      end if;
    end if;
    v_day := v_day - 1;
  end loop;

  return v_streak;
end;
$$;

create or replace function app_private.generate_invite_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i integer;
begin
  for i in 1..6 loop
    result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Attempt edit-window trigger
-- ---------------------------------------------------------------------------

create or replace function app_private.enforce_attempt_edit_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('app.allow_attempt_mutation', true) = 'on' then
    return coalesce(new, old);
  end if;

  if tg_op = 'DELETE' then
    if old.completed_at < now() - interval '10 minutes' then
      raise exception 'attempt can only be deleted within 10 minutes; use admin invalidation';
    end if;
    return old;
  end if;

  -- UPDATE: allow no-op; block field changes outside window except nothing
  if new.completed_at < now() - interval '10 minutes'
     and (
       new.outcome is distinct from old.outcome
       or new.could_explain is distinct from old.could_explain
       or new.confidence is distinct from old.confidence
       or new.private_reflection is distinct from old.private_reflection
       or new.time_spent_minutes is distinct from old.time_spent_minutes
       or new.attempt_type is distinct from old.attempt_type
       or new.problem_id is distinct from old.problem_id
       or (new.invalidated_at is distinct from old.invalidated_at)
     ) then
    raise exception 'attempt can only be edited within 10 minutes; use admin invalidation';
  end if;

  return new;
end;
$$;

drop trigger if exists attempts_edit_window on public.attempts;
create trigger attempts_edit_window
  before update or delete on public.attempts
  for each row
  execute function app_private.enforce_attempt_edit_window();

-- ---------------------------------------------------------------------------
-- Public RPCs
-- ---------------------------------------------------------------------------

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

create or replace function public.join_group_by_code(p_code text)
returns uuid
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

  select * into v_invite
  from public.group_invites
  where upper(code) = upper(trim(p_code))
    and revoked_at is null
    and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'invalid or expired invite code';
  end if;

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
  values (v_uid, v_invite.group_id, 1)
  on conflict (user_id, group_id) do nothing;

  return v_invite.group_id;
end;
$$;

create or replace function public.request_join_group(p_group_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_group public.groups%rowtype;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into strict v_group from public.groups where id = p_group_id;
  if v_group.visibility <> 'public' or v_group.join_mode <> 'approval' then
    raise exception 'group does not accept join requests';
  end if;

  insert into public.group_join_requests (group_id, user_id, status)
  values (p_group_id, v_uid, 'pending')
  returning id into v_id;

  return v_id;
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
    if not exists (
      select 1 from public.group_memberships
      where group_id = v_req.group_id and user_id = v_req.user_id and left_at is null
    ) then
      insert into public.group_memberships (group_id, user_id, role)
      values (v_req.group_id, v_req.user_id, 'member');
    end if;

    insert into public.member_targets (user_id, group_id, daily_new_target)
    values (v_req.user_id, v_req.group_id, 1)
    on conflict (user_id, group_id) do nothing;
  end if;
end;
$$;

create or replace function public.set_focused_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_group_id is not null and not exists (
    select 1 from public.group_memberships m
    where m.group_id = p_group_id and m.user_id = v_uid and m.left_at is null
  ) then
    raise exception 'not a member of group';
  end if;

  update public.profiles
  set focused_group_id = p_group_id, updated_at = now()
  where id = v_uid;
end;
$$;

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

create or replace function public.log_attempt(
  p_problem_id uuid,
  p_attempt_type public.attempt_type,
  p_outcome public.attempt_outcome,
  p_confidence smallint,
  p_could_explain boolean,
  p_time_spent_minutes integer default null,
  p_private_reflection text default null,
  p_completed_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_task public.review_tasks%rowtype;
  v_due timestamptz;
  v_next uuid;
  r record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_confidence < 1 or p_confidence > 5 then
    raise exception 'confidence must be 1-5';
  end if;

  if p_attempt_type = 'new_problem' then
    if app_private.has_overdue_review(v_uid) then
      raise exception 'overdue review blocks new problems';
    end if;
    v_next := app_private.next_new_problem_id(v_uid);
    if v_next is distinct from p_problem_id then
      raise exception 'can only log the next unlocked new problem';
    end if;
  elsif p_attempt_type = 'scheduled_review' then
    select * into v_task
    from public.review_tasks
    where user_id = v_uid
      and problem_id = p_problem_id
      and status = 'pending'
    order by due_at
    limit 1;
    if not found then
      raise exception 'no pending review for this problem';
    end if;
  end if;

  perform app_private.allow_attempt_mutation();

  insert into public.attempts (
    user_id, problem_id, attempt_type, outcome, completed_at,
    time_spent_minutes, confidence, could_explain, private_reflection
  ) values (
    v_uid, p_problem_id, p_attempt_type, p_outcome, coalesce(p_completed_at, now()),
    p_time_spent_minutes, p_confidence, p_could_explain, p_private_reflection
  ) returning id into v_id;

  perform app_private.attribute_attempt(v_id);
  perform app_private.apply_progress_after_attempt(v_id);

  if p_attempt_type = 'scheduled_review' then
    update public.review_tasks
    set
      status = 'completed',
      completed_attempt_id = v_id,
      updated_at = now()
    where id = v_task.id;
  end if;

  v_due := coalesce(p_completed_at, now())
    + make_interval(days => app_private.review_delay_days(
        p_attempt_type, p_outcome, p_could_explain
      ));
  perform app_private.schedule_review(v_uid, p_problem_id, v_id, v_due);

  for r in
    select aga.group_id
    from public.attempt_group_attributions aga
    where aga.attempt_id = v_id
  loop
    perform app_private.recompute_user_group_week(
      v_uid,
      r.group_id,
      app_private.week_start_for(v_uid, coalesce(p_completed_at, now()))
    );
  end loop;

  return v_id;
end;
$$;

create or replace function public.edit_attempt(
  p_attempt_id uuid,
  p_outcome public.attempt_outcome default null,
  p_confidence smallint default null,
  p_could_explain boolean default null,
  p_time_spent_minutes integer default null,
  p_private_reflection text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_attempt public.attempts%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into strict v_attempt from public.attempts where id = p_attempt_id;
  if v_attempt.user_id <> v_uid then
    raise exception 'not authorized';
  end if;
  if v_attempt.invalidated_at is not null then
    raise exception 'attempt invalidated';
  end if;
  if v_attempt.completed_at < now() - interval '10 minutes' then
    raise exception 'edit window expired';
  end if;

  perform app_private.allow_attempt_mutation();

  update public.attempts
  set
    outcome = coalesce(p_outcome, outcome),
    confidence = coalesce(p_confidence, confidence),
    could_explain = coalesce(p_could_explain, could_explain),
    time_spent_minutes = coalesce(p_time_spent_minutes, time_spent_minutes),
    private_reflection = coalesce(p_private_reflection, private_reflection),
    updated_at = now()
  where id = p_attempt_id;

  insert into public.attempt_audit_log (attempt_id, actor_id, action, payload)
  values (
    p_attempt_id, v_uid, 'edit',
    jsonb_build_object('at', now())
  );

  perform app_private.recompute_after_attempt_change(p_attempt_id);
end;
$$;

create or replace function public.delete_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_attempt public.attempts%rowtype;
  v_groups uuid[];
  v_week date;
  g uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into strict v_attempt from public.attempts where id = p_attempt_id;
  if v_attempt.user_id <> v_uid then
    raise exception 'not authorized';
  end if;
  if v_attempt.completed_at < now() - interval '10 minutes' then
    raise exception 'delete window expired';
  end if;

  select array_agg(group_id), app_private.week_start_for(v_uid, v_attempt.completed_at)
  into v_groups, v_week
  from public.attempt_group_attributions
  where attempt_id = p_attempt_id;

  insert into public.attempt_audit_log (attempt_id, actor_id, action, payload)
  values (
    p_attempt_id, v_uid, 'delete',
    jsonb_build_object('snapshot', to_jsonb(v_attempt))
  );

  perform app_private.allow_attempt_mutation();
  delete from public.attempts where id = p_attempt_id;

  perform app_private.rebuild_progress_for_user(v_uid);
  if v_groups is not null then
    foreach g in array v_groups loop
      perform app_private.recompute_user_group_week(v_uid, g, v_week);
    end loop;
  end if;
end;
$$;

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
declare
  v_uid uuid := auth.uid();
  v_attempt public.attempts%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into strict v_attempt from public.attempts where id = p_attempt_id;

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

create or replace function public.add_reaction(
  p_kind public.reaction_kind,
  p_target_type public.reaction_target_type,
  p_target_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_target_type = 'activity' then
    select user_id into v_owner from public.attempts where id = p_target_id;
    if v_owner is null then
      raise exception 'unknown activity';
    end if;
    if v_owner <> v_uid and not app_private.shares_group_with(v_owner) then
      raise exception 'not authorized';
    end if;
  else
    -- milestone: require at least one active membership
    if not exists (
      select 1 from public.group_memberships m
      where m.user_id = v_uid and m.left_at is null
    ) then
      raise exception 'join a group before reacting';
    end if;
  end if;

  insert into public.reactions (user_id, kind, target_type, target_id)
  values (v_uid, p_kind, p_target_type, p_target_id)
  on conflict (user_id, kind, target_type, target_id) do update
  set created_at = public.reactions.created_at
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.refresh_weekly_score(
  p_group_id uuid,
  p_week_start date default null
)
returns setof public.weekly_score_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_week date;
  m record;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.group_memberships gm
    where gm.group_id = p_group_id and gm.user_id = v_uid and gm.left_at is null
  ) then
    raise exception 'not a member of group';
  end if;

  v_week := coalesce(p_week_start, app_private.week_start_for(v_uid, now()));

  for m in
    select user_id from public.group_memberships
    where group_id = p_group_id and left_at is null
  loop
    return next app_private.recompute_user_group_week(m.user_id, p_group_id, v_week);
  end loop;
end;
$$;

create or replace function public.current_streak(p_group_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  return app_private.current_streak_value(v_uid, p_group_id);
end;
$$;

create or replace function public.next_unlocked_problem()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  return app_private.next_new_problem_id(auth.uid());
end;
$$;

-- Grants
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'create_group(text, public.group_visibility, public.group_join_mode)',
    'join_group_by_code(text)',
    'request_join_group(uuid)',
    'resolve_join_request(uuid, boolean)',
    'set_focused_group(uuid)',
    'set_daily_target(uuid, integer)',
    'log_attempt(uuid, public.attempt_type, public.attempt_outcome, smallint, boolean, integer, text, timestamptz)',
    'edit_attempt(uuid, public.attempt_outcome, smallint, boolean, integer, text)',
    'delete_attempt(uuid)',
    'invalidate_attempt(uuid)',
    'add_reaction(public.reaction_kind, public.reaction_target_type, uuid)',
    'refresh_weekly_score(uuid, date)',
    'current_streak(uuid)',
    'next_unlocked_problem()'
  ]
  loop
    execute format('revoke execute on function public.%s from public', fn);
    execute format('revoke execute on function public.%s from anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;
end $$;
