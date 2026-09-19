-- Grid150 P4 demo cohort. Idempotent for emails *@grid150.demo.
-- Password for all demo users: Grid150Demo!
-- Invite code: FAANG1

create extension if not exists pgcrypto;

create or replace function pg_temp.demo_uid(email text)
returns uuid
language sql
stable
as $$
  select id from auth.users where auth.users.email = demo_uid.email;
$$;

create or replace function pg_temp.set_auth(uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

create or replace function pg_temp.ensure_demo_user(
  p_id uuid,
  p_email text,
  p_display_name text,
  p_timezone text default 'UTC'
)
returns uuid
language plpgsql
as $$
begin
  if exists (select 1 from auth.users where id = p_id) then
    update public.profiles
    set display_name = p_display_name, timezone = p_timezone, updated_at = now()
    where id = p_id;
    return p_id;
  end if;

  if exists (select 1 from auth.users where email = p_email) then
    delete from public.attempt_audit_log
    where actor_id = (select id from auth.users where email = p_email);
    update public.profiles set focused_group_id = null
    where id = (select id from auth.users where email = p_email);
    delete from public.groups
    where created_by = (select id from auth.users where email = p_email);
    delete from auth.users where email = p_email;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000',
    p_id,
    'authenticated',
    'authenticated',
    p_email,
    crypt('Grid150Demo!', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('display_name', p_display_name),
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  update public.profiles
  set display_name = p_display_name, timezone = p_timezone, updated_at = now()
  where id = p_id;

  return p_id;
end;
$$;

do $$
declare
  alex uuid := 'a1111111-1111-1111-1111-111111111111';
  marcus uuid := 'a2222222-2222-2222-2222-222222222222';
  jordan uuid := 'a3333333-3333-3333-3333-333333333333';
  sam uuid := 'a4444444-4444-4444-4444-444444444444';
  riley uuid := 'a5555555-5555-5555-5555-555555555555';
  faang uuid;
  side uuid;
  alex_mem uuid;
  marcus_mem uuid;
  p record;
  i int := 0;
  attempt_id uuid;
  completed_at timestamptz;
  outcome public.attempt_outcome;
  week_start date;
  snap public.weekly_score_snapshots%rowtype;
  v_week date;
begin
  -- Clean prior demo groups owned by demo users
  delete from public.attempt_audit_log
  where actor_id in (alex, marcus, jordan, sam, riley);
  update public.profiles set focused_group_id = null
  where id in (alex, marcus, jordan, sam, riley);
  delete from public.groups
  where created_by in (alex, marcus, jordan, sam, riley)
     or name in ('FAANG Grind Club', 'Weekend Warriors');

  perform pg_temp.ensure_demo_user(alex, 'alex@grid150.demo', 'Alex Rivera', 'America/New_York');
  perform pg_temp.ensure_demo_user(marcus, 'marcus@grid150.demo', 'Marcus Vance', 'America/New_York');
  perform pg_temp.ensure_demo_user(jordan, 'jordan@grid150.demo', 'Jordan Lee', 'America/Chicago');
  perform pg_temp.ensure_demo_user(sam, 'sam@grid150.demo', 'Sam Ortiz', 'America/Los_Angeles');
  perform pg_temp.ensure_demo_user(riley, 'riley@grid150.demo', 'Riley Chen', 'UTC');

  -- Alex creates FAANG Grind Club
  perform pg_temp.set_auth(alex);
  execute 'set local role authenticated';

  select g.group_id into faang
  from public.create_group('FAANG Grind Club', 'private', 'approval') g;

  update public.group_invites
  set code = 'FAANG1', revoked_at = null, expires_at = null
  where group_id = faang;

  -- Keep only FAANG1 invite
  delete from public.group_invites
  where group_id = faang and code <> 'FAANG1';

  update public.group_pace_settings
  set
    problems_per_week = 7,
    active_days = array[1, 2, 3, 4, 5]::smallint[],
    updated_at = now()
  where group_id = faang;

  update public.member_targets
  set daily_new_target = 2, pending_daily_new_target = null, pending_effective_week_start = null
  where user_id = alex and group_id = faang;

  -- Stagger memberships
  select id into alex_mem
  from public.group_memberships
  where group_id = faang and user_id = alex and left_at is null;

  update public.group_memberships
  set joined_at = now() - interval '60 days'
  where id = alex_mem;

  insert into public.group_memberships (group_id, user_id, role, joined_at)
  values
    (faang, marcus, 'admin', now() - interval '58 days'),
    (faang, jordan, 'member', now() - interval '45 days'),
    (faang, sam, 'member', now() - interval '30 days'),
    (faang, riley, 'member', now() - interval '10 days');

  select id into marcus_mem
  from public.group_memberships
  where group_id = faang and user_id = marcus and left_at is null;

  -- Bypass RLS for bulk demo history (seed runs as privileged role)
  execute 'reset role';

  insert into public.member_targets (user_id, group_id, daily_new_target)
  values
    (marcus, faang, 3),
    (jordan, faang, 2),
    (sam, faang, 1),
    (riley, faang, 1)
  on conflict (user_id, group_id) do update
  set daily_new_target = excluded.daily_new_target;

  -- Side group for attribution narrative (Alex owner; Riley joins late)
  perform pg_temp.set_auth(alex);
  execute 'set local role authenticated';
  select g.group_id into side
  from public.create_group('Weekend Warriors', 'public', 'open') g;
  execute 'reset role';

  insert into public.group_memberships (group_id, user_id, role, joined_at)
  select side, riley, 'member', now() - interval '3 days'
  where not exists (
    select 1 from public.group_memberships
    where group_id = side and user_id = riley and left_at is null
  );

  -- Clear prior demo attempts for these users
  perform set_config('app.allow_attempt_mutation', 'on', true);
  delete from public.attempts where user_id in (alex, marcus, jordan, sam, riley);
  delete from public.problem_progress where user_id in (alex, marcus, jordan, sam, riley);
  delete from public.review_tasks where user_id in (alex, marcus, jordan, sam, riley);
  delete from public.weekly_score_snapshots
  where user_id in (alex, marcus, jordan, sam, riley);

  perform set_config('app.allow_attempt_mutation', 'on', true);

  -- Alex: complete problems 1..68
  for p in
    select id, global_order
    from public.problems
    where global_order between 1 and 68
    order by global_order
  loop
    i := p.global_order;
    completed_at := (now() - interval '55 days') + make_interval(days => (i - 1) / 2);
    if i % 5 = 0 then
      outcome := 'solved_with_hints';
    else
      outcome := 'solved_independently';
    end if;

    insert into public.attempts (
      user_id, problem_id, attempt_type, outcome, completed_at,
      confidence, could_explain, time_spent_minutes
    ) values (
      alex, p.id, 'new_problem', outcome, completed_at,
      3 + (i % 3), (i % 4 <> 0), 20 + (i % 40)
    ) returning id into attempt_id;

    perform app_private.attribute_attempt(attempt_id);
  end loop;

  perform app_private.rebuild_progress_for_user(alex);

  -- Marcus: complete 1..75 (ahead)
  for p in
    select id, global_order
    from public.problems
    where global_order between 1 and 75
    order by global_order
  loop
    completed_at := (now() - interval '54 days') + make_interval(days => (p.global_order - 1) / 2);
    insert into public.attempts (
      user_id, problem_id, attempt_type, outcome, completed_at,
      confidence, could_explain, time_spent_minutes
    ) values (
      marcus, p.id, 'new_problem', 'solved_independently', completed_at,
      4, true, 25
    ) returning id into attempt_id;
    perform app_private.attribute_attempt(attempt_id);
  end loop;
  perform app_private.rebuild_progress_for_user(marcus);

  -- Jordan 1..50, Sam 1..40, Riley 1..20
  for p in
    select id, global_order from public.problems
    where global_order between 1 and 50 order by global_order
  loop
    insert into public.attempts (
      user_id, problem_id, attempt_type, outcome, completed_at,
      confidence, could_explain
    ) values (
      jordan, p.id, 'new_problem', 'solved_independently',
      now() - interval '40 days' + make_interval(days => p.global_order),
      3, true
    ) returning id into attempt_id;
    perform app_private.attribute_attempt(attempt_id);
  end loop;
  perform app_private.rebuild_progress_for_user(jordan);

  for p in
    select id, global_order from public.problems
    where global_order between 1 and 40 order by global_order
  loop
    insert into public.attempts (
      user_id, problem_id, attempt_type, outcome, completed_at,
      confidence, could_explain
    ) values (
      sam, p.id, 'new_problem', 'solved_with_hints',
      now() - interval '28 days' + make_interval(days => p.global_order),
      3, false
    ) returning id into attempt_id;
    perform app_private.attribute_attempt(attempt_id);
  end loop;
  perform app_private.rebuild_progress_for_user(sam);

  for p in
    select id, global_order from public.problems
    where global_order between 1 and 20 order by global_order
  loop
    insert into public.attempts (
      user_id, problem_id, attempt_type, outcome, completed_at,
      confidence, could_explain
    ) values (
      riley, p.id, 'new_problem', 'solved_independently',
      now() - interval '9 days' + make_interval(days => p.global_order),
      4, true
    ) returning id into attempt_id;
    perform app_private.attribute_attempt(attempt_id);
  end loop;
  perform app_private.rebuild_progress_for_user(riley);

  -- This-week boosts so Marcus > Alex on weekly total
  v_week := app_private.week_start_for(alex, now());

  -- Extra independent solves this week for Marcus (problems already completed; use reviews as indep doesn't add new_problem progress for score from duplicates...)
  -- Score only counts new_problem solves in week. Add fresh new_problem attempts on 76-80 for Marcus this week.
  for p in
    select id, global_order from public.problems
    where global_order between 76 and 82 order by global_order
  loop
    insert into public.attempts (
      user_id, problem_id, attempt_type, outcome, completed_at,
      confidence, could_explain
    ) values (
      marcus, p.id, 'new_problem', 'solved_independently',
      now() - interval '2 hours' * (83 - p.global_order),
      5, true
    ) returning id into attempt_id;
    perform app_private.attribute_attempt(attempt_id);
  end loop;
  perform app_private.rebuild_progress_for_user(marcus);

  -- Alex this week: a few solves already in history near now — ensure some land this week
  update public.attempts a
  set completed_at = now() - interval '1 day'
  where a.user_id = alex
    and a.invalidated_at is null
    and a.attempt_type = 'new_problem'
    and a.problem_id in (
      select id from public.problems where global_order between 65 and 68
    );

  -- Re-attribute not needed; recompute weeks
  perform app_private.recompute_user_group_week(alex, faang, v_week);
  perform app_private.recompute_user_group_week(marcus, faang, v_week);
  perform app_private.recompute_user_group_week(jordan, faang, v_week);
  perform app_private.recompute_user_group_week(sam, faang, v_week);
  perform app_private.recompute_user_group_week(riley, faang, v_week);

  -- Force mockup narrative standings: Marcus #1, Alex #2 this week
  update public.weekly_score_snapshots s
  set
    progress = v.progress,
    consistency = v.consistency,
    improvement = v.improvement,
    total = v.progress + v.consistency + v.improvement,
    independent_solves = v.indep,
    hint_assisted_solves = v.hint
  from (
    values
      (marcus, 40.00::numeric, 22.00::numeric, 18.00::numeric, 12, 2),
      (alex, 35.00::numeric, 20.00::numeric, 14.00::numeric, 8, 3),
      (jordan, 28.00::numeric, 15.00::numeric, 12.50::numeric, 5, 2),
      (sam, 20.00::numeric, 12.00::numeric, 12.50::numeric, 3, 4),
      (riley, 15.00::numeric, 10.00::numeric, 12.50::numeric, 2, 1)
  ) as v(uid, progress, consistency, improvement, indep, hint)
  where s.user_id = v.uid and s.group_id = faang and s.week_start = v_week;

  -- Overdue review for Alex on problem 60 (blocks new problems)
  insert into public.review_tasks (
    user_id, problem_id, due_at, status, source_attempt_id
  )
  select
    alex,
    pr.id,
    now() - interval '2 days',
    'pending',
    (
      select a.id from public.attempts a
      where a.user_id = alex and a.problem_id = pr.id and a.invalidated_at is null
      order by a.completed_at desc limit 1
    )
  from public.problems pr
  where pr.global_order = 60;

  update public.profiles
  set focused_group_id = faang, updated_at = now()
  where id = alex;

  execute 'reset role';
end $$;
