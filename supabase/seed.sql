-- Grid150 demo cohort. Idempotent for emails *@grid150.demo.
-- Password for all demo users: Grid150Demo!
-- Primary invite: FAANG1
--
-- Surfaces this seed is meant to fill:
--   Today / Reviews / Log / Recent attempts / Roadmap
--   Leaderboard (week + all-time) / Analytics (heatmap, mastery, feed)
--   Groups manage (invites, join requests, pace, invalidation)
--   Discover (several public groups)
--
-- Off-limits: this database also hosts another project’s public.alba_* tables.
-- Never SELECT/UPDATE/DELETE/DROP those tables. Mutations are limited to
-- Grid150 public tables and auth.users rows with *@grid150.demo emails.

create extension if not exists pgcrypto;

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
  if p_email not like '%@grid150.demo' then
    raise exception 'demo seed will not mutate non-demo auth users';
  end if;

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

-- Honor-based history for one user: new solves 1..through, mixed outcomes,
-- some failed first tries, some later reviews, last `p_recent` packed into
-- the last few days so calendars / heatmaps / activity feeds are not empty.
create or replace function pg_temp.seed_solves(
  p_uid uuid,
  p_through integer,
  p_start timestamptz,
  p_hint_mod integer default 5,
  p_fail_mod integer default 11,
  p_review_mod integer default 8,
  p_recent integer default 5
)
returns void
language plpgsql
as $$
declare
  p record;
  i integer;
  attempt_id uuid;
  completed_at timestamptz;
  review_at timestamptz;
  outcome public.attempt_outcome;
  explain boolean;
  conf smallint;
  mins integer;
  hist_end timestamptz;
  hist_n integer;
  reflection text;
  recent_n integer;
begin
  recent_n := least(greatest(coalesce(p_recent, 0), 0), p_through);
  hist_n := p_through - recent_n;
  hist_end := now() - make_interval(days => recent_n);

  for p in
    select id, global_order
    from public.problems
    where global_order between 1 and p_through
    order by global_order
  loop
    i := p.global_order;

    if i > hist_n then
      completed_at :=
        date_trunc('hour', now())
        - make_interval(days => (p_through - i))
        - make_interval(hours => (i % 6))
        - make_interval(mins => (i * 7) % 50);
      if completed_at > now() - interval '20 minutes' then
        completed_at := now() - interval '3 hours' - make_interval(mins => i % 25);
      end if;
      if completed_at < p_start then
        completed_at := p_start + make_interval(hours => i);
      end if;
    elsif hist_n <= 1 then
      completed_at := p_start;
    else
      completed_at := p_start + (
        (least(hist_end, now()) - p_start)
        * ((i - 1)::numeric / greatest(hist_n - 1, 1))
      );
    end if;

    if p_hint_mod > 0 and i % p_hint_mod = 0 then
      outcome := 'solved_with_hints';
      explain := (i % 3 <> 0);
      conf := 2 + (i % 3);
    else
      outcome := 'solved_independently';
      explain := (i % 4 <> 0);
      conf := 3 + (i % 3);
    end if;

    mins := 12 + (i % 48);
    reflection := case
      when i % 9 = 0 then 'Second pass made the invariant obvious.'
      when i % 13 = 0 then 'Hint on the window bound; would retry independently.'
      else null
    end;

    if p_fail_mod > 0 and i % p_fail_mod = 0 then
      insert into public.attempts (
        user_id, problem_id, attempt_type, outcome, completed_at,
        confidence, could_explain, time_spent_minutes, private_reflection
      ) values (
        p_uid, p.id, 'new_problem', 'could_not_solve',
        completed_at - interval '90 minutes',
        2, false, 25 + (i % 20),
        'Stuck on the edge case; came back later.'
      ) returning id into attempt_id;
      perform app_private.attribute_attempt(attempt_id);
    end if;

    insert into public.attempts (
      user_id, problem_id, attempt_type, outcome, completed_at,
      confidence, could_explain, time_spent_minutes, private_reflection
    ) values (
      p_uid, p.id, 'new_problem', outcome, completed_at,
      conf, explain, mins, reflection
    ) returning id into attempt_id;
    perform app_private.attribute_attempt(attempt_id);

    if p_review_mod > 0 and i % p_review_mod = 0 and i < p_through - 1 then
      review_at := completed_at + interval '6 days' + make_interval(days => i % 3);
      if review_at < now() - interval '2 hours' then
        insert into public.attempts (
          user_id, problem_id, attempt_type, outcome, completed_at,
          confidence, could_explain, time_spent_minutes
        ) values (
          p_uid, p.id, 'scheduled_review',
          case when i % 10 = 0 then 'solved_with_hints'::public.attempt_outcome
               else 'solved_independently'::public.attempt_outcome end,
          review_at,
          4, true, 10 + (i % 15)
        ) returning id into attempt_id;
        perform app_private.attribute_attempt(attempt_id);
      end if;
    end if;
  end loop;

  perform app_private.rebuild_progress_for_user(p_uid);
end;
$$;

-- Extra last-week reviews so the group heatmap/feed is not only new solves.
create or replace function pg_temp.seed_recent_reviews(
  p_uid uuid,
  p_count integer,
  p_span_days integer default 6
)
returns void
language plpgsql
as $$
declare
  p record;
  n integer := 0;
  attempt_id uuid;
  at timestamptz;
begin
  for p in
    select pr.id, pr.global_order
    from public.problem_progress pp
    join public.problems pr on pr.id = pp.problem_id
    where pp.user_id = p_uid
      and pp.status = 'completed'
    order by pr.global_order
    limit greatest(p_count, 0)
  loop
    n := n + 1;
    at := now()
      - make_interval(days => least(p_span_days, n))
      - make_interval(hours => 4 + (n % 8))
      - make_interval(mins => (n * 11) % 45);
    insert into public.attempts (
      user_id, problem_id, attempt_type, outcome, completed_at,
      confidence, could_explain, time_spent_minutes
    ) values (
      p_uid, p.id, 'scheduled_review',
      case when n % 4 = 0 then 'solved_with_hints'::public.attempt_outcome
           else 'solved_independently'::public.attempt_outcome end,
      at, 4, n % 5 <> 0, 8 + n
    ) returning id into attempt_id;
    perform app_private.attribute_attempt(attempt_id);
  end loop;
end;
$$;

create or replace function pg_temp.seed_pending_reviews(
  p_uid uuid,
  p_orders integer[],
  p_due_offsets interval[]
)
returns void
language plpgsql
as $$
declare
  i integer;
begin
  if p_orders is null or p_due_offsets is null then
    return;
  end if;
  if array_length(p_orders, 1) is null then
    return;
  end if;

  for i in 1..array_length(p_orders, 1) loop
    insert into public.review_tasks (
      user_id, problem_id, due_at, status, source_attempt_id
    )
    select
      p_uid,
      pr.id,
      now() + p_due_offsets[i],
      'pending',
      (
        select a.id from public.attempts a
        where a.user_id = p_uid and a.problem_id = pr.id and a.invalidated_at is null
        order by a.completed_at desc
        limit 1
      )
    from public.problems pr
    where pr.global_order = p_orders[i];
  end loop;
end;
$$;

create or replace function pg_temp.recompute_history(
  p_uid uuid,
  p_gid uuid,
  p_weeks integer default 8
)
returns void
language plpgsql
as $$
declare
  v_week date;
  w integer;
begin
  v_week := app_private.week_start_for(p_uid, now());
  for w in 0..p_weeks loop
    perform app_private.recompute_user_group_week(
      p_uid, p_gid, v_week - (w * 7)
    );
  end loop;
end;
$$;

create or replace function pg_temp.pin_invite(
  p_gid uuid,
  p_code text,
  p_created_by uuid,
  p_expires timestamptz default null,
  p_revoked timestamptz default null
)
returns void
language plpgsql
as $$
begin
  update public.group_invites
  set code = p_code, expires_at = p_expires, revoked_at = p_revoked
  where id = (
    select gi.id from public.group_invites gi
    where gi.group_id = p_gid
    order by gi.created_at
    limit 1
  );
  if not found then
    insert into public.group_invites (group_id, code, created_by, expires_at, revoked_at)
    values (p_gid, p_code, p_created_by, p_expires, p_revoked);
  end if;
end;
$$;

do $$
declare
  alex uuid := 'a1111111-1111-1111-1111-111111111111';
  marcus uuid := 'a2222222-2222-2222-2222-222222222222';
  jordan uuid := 'a3333333-3333-3333-3333-333333333333';
  sam uuid := 'a4444444-4444-4444-4444-444444444444';
  riley uuid := 'a5555555-5555-5555-5555-555555555555';
  priya uuid := 'a6666666-6666-6666-6666-666666666666';
  devon uuid := 'a7777777-7777-7777-7777-777777777777';
  casey uuid := 'a8888888-8888-8888-8888-888888888888';
  taylor uuid := 'a9999999-9999-9999-9999-999999999999';
  elena uuid := 'aa111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  noah uuid := 'ab222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
  mina uuid := 'ac333333-cccc-4ccc-cccc-cccccccccccc';
  chris uuid := 'ad444444-dddd-4ddd-dddd-dddddddddddd';
  demo_ids uuid[] := array[
    'a1111111-1111-1111-1111-111111111111'::uuid,
    'a2222222-2222-2222-2222-222222222222'::uuid,
    'a3333333-3333-3333-3333-333333333333'::uuid,
    'a4444444-4444-4444-4444-444444444444'::uuid,
    'a5555555-5555-5555-5555-555555555555'::uuid,
    'a6666666-6666-6666-6666-666666666666'::uuid,
    'a7777777-7777-7777-7777-777777777777'::uuid,
    'a8888888-8888-8888-8888-888888888888'::uuid,
    'a9999999-9999-9999-9999-999999999999'::uuid,
    'aa111111-aaaa-4aaa-aaaa-aaaaaaaaaaaa'::uuid,
    'ab222222-bbbb-4bbb-bbbb-bbbbbbbbbbbb'::uuid,
    'ac333333-cccc-4ccc-cccc-cccccccccccc'::uuid,
    'ad444444-dddd-4ddd-dddd-dddddddddddd'::uuid
  ];
  faang uuid;
  weekend uuid;
  campus uuid;
  sprint uuid;
  nyu uuid;
  trees_id uuid;
  heap_id uuid;
  backtrack_id uuid;
  v_week date;
  invalid_id uuid;
  recent_id uuid;
begin
  raise notice 'Grid150 seed: public.alba_* tables are off-limits and will not be modified';

  delete from public.attempt_audit_log where actor_id = any (demo_ids);
  delete from public.reactions where user_id = any (demo_ids);
  update public.profiles set focused_group_id = null where id = any (demo_ids);
  delete from public.groups
  where created_by = any (demo_ids)
     or name in (
       'FAANG Grind Club',
       'Weekend Warriors',
       'Campus Algorithms',
       'Interview Sprint 2026',
       'NYU Grind'
     );

  perform pg_temp.ensure_demo_user(alex, 'alex@grid150.demo', 'Alex Rivera', 'America/New_York');
  perform pg_temp.ensure_demo_user(marcus, 'marcus@grid150.demo', 'Marcus Vance', 'America/New_York');
  perform pg_temp.ensure_demo_user(jordan, 'jordan@grid150.demo', 'Jordan Lee', 'America/Chicago');
  perform pg_temp.ensure_demo_user(sam, 'sam@grid150.demo', 'Sam Ortiz', 'America/Los_Angeles');
  perform pg_temp.ensure_demo_user(riley, 'riley@grid150.demo', 'Riley Chen', 'UTC');
  perform pg_temp.ensure_demo_user(priya, 'priya@grid150.demo', 'Priya Nair', 'America/Chicago');
  perform pg_temp.ensure_demo_user(devon, 'devon@grid150.demo', 'Devon Walsh', 'America/Denver');
  perform pg_temp.ensure_demo_user(casey, 'casey@grid150.demo', 'Casey Kim', 'America/Los_Angeles');
  perform pg_temp.ensure_demo_user(taylor, 'taylor@grid150.demo', 'Taylor Brooks', 'America/New_York');
  perform pg_temp.ensure_demo_user(elena, 'elena@grid150.demo', 'Elena Vasquez', 'America/New_York');
  perform pg_temp.ensure_demo_user(noah, 'noah@grid150.demo', 'Noah Patel', 'America/Chicago');
  perform pg_temp.ensure_demo_user(mina, 'mina@grid150.demo', 'Mina Park', 'America/New_York');
  perform pg_temp.ensure_demo_user(chris, 'chris@grid150.demo', 'Chris Okonkwo', 'America/Chicago');

  select id into trees_id from public.topics where slug = 'trees';
  select id into heap_id from public.topics where slug = 'heap-priority-queue';
  select id into backtrack_id from public.topics where slug = 'backtracking';

  -- Groups ------------------------------------------------------------
  perform pg_temp.set_auth(alex);
  execute 'set local role authenticated';
  select g.group_id into faang
  from public.create_group('FAANG Grind Club', 'private', 'approval', 2) g;
  select g.group_id into weekend
  from public.create_group('Weekend Warriors', 'public', 'open', 1) g;

  perform pg_temp.set_auth(elena);
  select g.group_id into campus
  from public.create_group('Campus Algorithms', 'public', 'open', 2) g;

  perform pg_temp.set_auth(noah);
  select g.group_id into sprint
  from public.create_group('Interview Sprint 2026', 'public', 'approval', 3) g;

  perform pg_temp.set_auth(jordan);
  select g.group_id into nyu
  from public.create_group('NYU Grind', 'public', 'open', 1) g;
  execute 'reset role';

  update public.groups set created_at = now() - interval '60 days' where id = faang;
  update public.groups set created_at = now() - interval '24 days' where id = weekend;
  update public.groups set created_at = now() - interval '40 days' where id = campus;
  update public.groups set created_at = now() - interval '12 days' where id = sprint;
  update public.groups set created_at = now() - interval '8 days' where id = nyu;

  perform pg_temp.pin_invite(faang, 'FAANG1', alex, null, null);
  insert into public.group_invites (group_id, code, created_by, expires_at)
  values (faang, 'FAANG2', alex, now() + interval '7 days');
  insert into public.group_invites (group_id, code, created_by, revoked_at)
  values (faang, 'OLDFAANG', alex, now() - interval '5 days');
  perform pg_temp.pin_invite(weekend, 'WEEKND', alex);
  perform pg_temp.pin_invite(campus, 'CAMPUS', elena);
  perform pg_temp.pin_invite(sprint, 'SPRNT1', noah);
  perform pg_temp.pin_invite(nyu, 'NYU150', jordan);

  delete from public.group_invites
  where group_id = faang
    and code not in ('FAANG1', 'FAANG2', 'OLDFAANG');

  update public.group_pace_settings
  set
    problems_per_week = 7,
    deadline = date '2026-12-18',
    active_days = array[1, 2, 3, 4, 5]::smallint[],
    pace_marker_topic_id = heap_id,
    pace_marker_note = 'Finish heaps this week, then backtracking.',
    default_daily_new_target = 2,
    updated_at = now()
  where group_id = faang;

  update public.group_pace_settings
  set
    problems_per_week = 4,
    deadline = null,
    active_days = array[0, 6]::smallint[],
    pace_marker_topic_id = trees_id,
    pace_marker_note = 'Weekend tree drills.',
    default_daily_new_target = 1,
    updated_at = now()
  where group_id = weekend;

  update public.group_pace_settings
  set
    problems_per_week = 5,
    deadline = date '2026-11-30',
    active_days = array[1, 2, 3, 4]::smallint[],
    pace_marker_topic_id = trees_id,
    pace_marker_note = 'Club is on Trees through October.',
    default_daily_new_target = 2,
    updated_at = now()
  where group_id = campus;

  update public.group_pace_settings
  set
    problems_per_week = 10,
    deadline = date '2026-10-31',
    active_days = array[0, 1, 2, 3, 4, 5, 6]::smallint[],
    pace_marker_topic_id = backtrack_id,
    pace_marker_note = 'Sprint: backtracking by end of month.',
    default_daily_new_target = 3,
    updated_at = now()
  where group_id = sprint;

  update public.group_pace_settings
  set
    problems_per_week = 3,
    active_days = array[1, 3, 5]::smallint[],
    default_daily_new_target = 1,
    updated_at = now()
  where group_id = nyu;

  -- Memberships (owners already present from create_group)
  update public.group_memberships
  set joined_at = now() - interval '60 days'
  where group_id = faang and user_id = alex and left_at is null;

  insert into public.group_memberships (group_id, user_id, role, joined_at)
  values
    (faang, marcus, 'admin', now() - interval '58 days'),
    (faang, priya, 'member', now() - interval '50 days'),
    (faang, jordan, 'member', now() - interval '45 days'),
    (faang, sam, 'member', now() - interval '30 days'),
    (faang, devon, 'member', now() - interval '22 days'),
    (faang, casey, 'member', now() - interval '18 days'),
    (faang, riley, 'member', now() - interval '10 days'),
    (faang, taylor, 'member', now() - interval '8 days')
  on conflict do nothing;

  update public.group_memberships
  set joined_at = now() - interval '24 days'
  where group_id = weekend and user_id = alex and left_at is null;

  insert into public.group_memberships (group_id, user_id, role, joined_at)
  values
    (weekend, jordan, 'member', now() - interval '20 days'),
    (weekend, casey, 'member', now() - interval '14 days'),
    (weekend, riley, 'member', now() - interval '3 days')
  on conflict do nothing;

  update public.group_memberships
  set joined_at = now() - interval '40 days'
  where group_id = campus and user_id = elena and left_at is null;

  insert into public.group_memberships (group_id, user_id, role, joined_at)
  values
    (campus, priya, 'member', now() - interval '21 days'),
    (campus, devon, 'member', now() - interval '14 days'),
    (campus, mina, 'member', now() - interval '10 days'),
    (campus, chris, 'member', now() - interval '9 days')
  on conflict do nothing;

  update public.group_memberships
  set joined_at = now() - interval '12 days'
  where group_id = sprint and user_id = noah and left_at is null;

  insert into public.group_memberships (group_id, user_id, role, joined_at)
  values
    (sprint, mina, 'member', now() - interval '8 days'),
    (sprint, chris, 'member', now() - interval '7 days')
  on conflict do nothing;

  update public.group_memberships
  set joined_at = now() - interval '8 days'
  where group_id = nyu and user_id = jordan and left_at is null;

  insert into public.group_memberships (group_id, user_id, role, joined_at)
  values (nyu, sam, 'member', now() - interval '6 days')
  on conflict do nothing;

  insert into public.member_targets (user_id, group_id, daily_new_target)
  values
    (alex, faang, 2),
    (marcus, faang, 3),
    (priya, faang, 2),
    (jordan, faang, 2),
    (sam, faang, 1),
    (devon, faang, 1),
    (casey, faang, 1),
    (riley, faang, 1),
    (taylor, faang, 1),
    (jordan, weekend, 1),
    (casey, weekend, 1),
    (riley, weekend, 1),
    (priya, campus, 2),
    (devon, campus, 1),
    (mina, campus, 1),
    (chris, campus, 1),
    (mina, sprint, 2),
    (chris, sprint, 2),
    (sam, nyu, 1)
  on conflict (user_id, group_id) do update
  set daily_new_target = excluded.daily_new_target,
      pending_daily_new_target = null,
      pending_effective_week_start = null,
      updated_at = now();

  v_week := app_private.week_start_for(alex, now());
  update public.member_targets
  set
    pending_daily_new_target = 3,
    pending_effective_week_start = v_week + 7,
    updated_at = now()
  where user_id = alex and group_id = faang;

  insert into public.group_join_requests (group_id, user_id, status, created_at)
  values
    (faang, mina, 'pending', now() - interval '2 days'),
    (faang, chris, 'pending', now() - interval '18 hours')
  on conflict do nothing;

  -- Attempts ----------------------------------------------------------
  perform set_config('app.allow_attempt_mutation', 'on', true);
  delete from public.attempts where user_id = any (demo_ids);
  delete from public.problem_progress where user_id = any (demo_ids);
  delete from public.review_tasks where user_id = any (demo_ids);
  delete from public.weekly_score_snapshots where user_id = any (demo_ids);
  perform set_config('app.allow_attempt_mutation', 'on', true);

  perform pg_temp.seed_solves(alex, 68, now() - interval '55 days', 5, 11, 7, 4);
  perform pg_temp.seed_solves(marcus, 82, now() - interval '54 days', 9, 17, 8, 7);
  perform pg_temp.seed_solves(priya, 72, now() - interval '48 days', 6, 13, 8, 5);
  perform pg_temp.seed_solves(jordan, 50, now() - interval '42 days', 4, 10, 7, 4);
  perform pg_temp.seed_solves(sam, 40, now() - interval '28 days', 3, 9, 6, 4);
  perform pg_temp.seed_solves(devon, 33, now() - interval '20 days', 5, 12, 8, 4);
  perform pg_temp.seed_solves(casey, 28, now() - interval '16 days', 4, 11, 7, 4);
  perform pg_temp.seed_solves(riley, 20, now() - interval '9 days', 6, 0, 5, 5);
  perform pg_temp.seed_solves(taylor, 12, now() - interval '7 days', 5, 0, 6, 5);
  perform pg_temp.seed_solves(elena, 55, now() - interval '38 days', 5, 12, 8, 4);
  perform pg_temp.seed_solves(noah, 44, now() - interval '11 days', 7, 14, 8, 6);
  perform pg_temp.seed_solves(mina, 16, now() - interval '9 days', 4, 0, 5, 4);
  perform pg_temp.seed_solves(chris, 14, now() - interval '8 days', 5, 0, 5, 4);

  perform pg_temp.seed_recent_reviews(alex, 4, 6);
  perform pg_temp.seed_recent_reviews(marcus, 3, 6);
  perform pg_temp.seed_recent_reviews(priya, 3, 6);
  perform pg_temp.seed_recent_reviews(jordan, 3, 6);
  perform pg_temp.seed_recent_reviews(sam, 2, 5);
  perform pg_temp.seed_recent_reviews(devon, 2, 5);
  perform pg_temp.seed_recent_reviews(casey, 2, 5);
  perform pg_temp.seed_recent_reviews(riley, 2, 4);
  perform pg_temp.seed_recent_reviews(taylor, 2, 4);
  perform pg_temp.seed_recent_reviews(elena, 3, 6);

  -- Alex: still-editable review (inside 10-minute window) + richer reflections
  insert into public.attempts (
    user_id, problem_id, attempt_type, outcome, completed_at,
    confidence, could_explain, time_spent_minutes, private_reflection
  )
  select
    alex, pr.id, 'scheduled_review', 'solved_independently',
    now() - interval '4 minutes',
    4, true, 11,
    'Review of Two Sum. Hash map complement still clicks.'
  from public.problems pr
  where pr.global_order = 1
  returning id into recent_id;
  perform app_private.attribute_attempt(recent_id);

  update public.attempts a
  set private_reflection = 'Heap frequency map, then cooldown math. Keep this one.'
  from public.problems pr
  where a.user_id = alex
    and a.problem_id = pr.id
    and pr.global_order = 68
    and a.attempt_type = 'new_problem'
    and a.invalidated_at is null;

  -- Invalidated mistaken log (does not change completions)
  insert into public.attempts (
    user_id, problem_id, attempt_type, outcome, completed_at,
    confidence, could_explain, time_spent_minutes, private_reflection,
    invalidated_at, invalidated_by
  )
  select
    sam, pr.id, 'scheduled_review', 'solved_independently',
    now() - interval '3 days',
    5, true, 6,
    'Logged the wrong problem as a review.',
    now() - interval '2 days 4 hours',
    marcus
  from public.problems pr
  where pr.global_order = 2
  returning id into invalid_id;
  perform app_private.attribute_attempt(invalid_id);

  insert into public.attempt_audit_log (attempt_id, actor_id, action, reason, payload)
  values (
    invalid_id, marcus, 'invalidate',
    'Wrong problem logged as a review',
    jsonb_build_object('at', now() - interval '2 days 4 hours')
  );

  insert into public.attempt_audit_log (attempt_id, actor_id, action, payload)
  values (
    recent_id, alex, 'edit',
    jsonb_build_object('at', now() - interval '2 minutes', 'note', 'tweaked minutes')
  );

  -- Pending reviews (Alex overdue block + a real queue)
  perform pg_temp.seed_pending_reviews(
    alex,
    array[48, 55, 60, 63, 41, 22, 8],
    array[
      interval '-4 days',
      interval '-2 days',
      interval '-1 days',
      interval '8 hours',
      interval '2 days',
      interval '5 days',
      interval '12 days'
    ]
  );
  perform pg_temp.seed_pending_reviews(
    marcus,
    array[70, 44],
    array[interval '1 day', interval '6 days']
  );
  perform pg_temp.seed_pending_reviews(
    priya,
    array[50, 31],
    array[interval '-6 hours', interval '3 days']
  );
  perform pg_temp.seed_pending_reviews(
    jordan,
    array[18],
    array[interval '1 day']
  );
  perform pg_temp.seed_pending_reviews(
    riley,
    array[6],
    array[interval '2 days']
  );

  -- Weekly history (viewer week for FAANG so Alex's leaderboard is populated)
  perform pg_temp.recompute_history(alex, faang, 8);
  perform pg_temp.recompute_history(marcus, faang, 8);
  perform pg_temp.recompute_history(priya, faang, 8);
  perform pg_temp.recompute_history(jordan, faang, 8);
  perform pg_temp.recompute_history(sam, faang, 8);
  perform pg_temp.recompute_history(devon, faang, 8);
  perform pg_temp.recompute_history(casey, faang, 8);
  perform pg_temp.recompute_history(riley, faang, 8);
  perform pg_temp.recompute_history(taylor, faang, 8);

  perform app_private.recompute_user_group_week(alex, faang, v_week);
  perform app_private.recompute_user_group_week(marcus, faang, v_week);
  perform app_private.recompute_user_group_week(priya, faang, v_week);
  perform app_private.recompute_user_group_week(jordan, faang, v_week);
  perform app_private.recompute_user_group_week(sam, faang, v_week);
  perform app_private.recompute_user_group_week(devon, faang, v_week);
  perform app_private.recompute_user_group_week(casey, faang, v_week);
  perform app_private.recompute_user_group_week(riley, faang, v_week);
  perform app_private.recompute_user_group_week(taylor, faang, v_week);

  perform pg_temp.recompute_history(alex, weekend, 4);
  perform pg_temp.recompute_history(jordan, weekend, 4);
  perform pg_temp.recompute_history(casey, weekend, 4);
  perform pg_temp.recompute_history(riley, weekend, 4);

  perform pg_temp.recompute_history(elena, campus, 6);
  perform pg_temp.recompute_history(priya, campus, 4);
  perform pg_temp.recompute_history(devon, campus, 3);
  perform pg_temp.recompute_history(mina, campus, 2);
  perform pg_temp.recompute_history(chris, campus, 2);

  perform pg_temp.recompute_history(noah, sprint, 2);
  perform pg_temp.recompute_history(mina, sprint, 2);
  perform pg_temp.recompute_history(chris, sprint, 2);

  perform pg_temp.recompute_history(jordan, nyu, 2);
  perform pg_temp.recompute_history(sam, nyu, 2);

  -- Mockup narrative: Marcus #1, Alex #2 this week in FAANG
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
      (marcus, 42.00::numeric, 23.00::numeric, 18.00::numeric, 14, 1),
      (alex, 36.00::numeric, 20.00::numeric, 15.00::numeric, 9, 3),
      (priya, 33.00::numeric, 18.00::numeric, 16.00::numeric, 8, 2),
      (jordan, 28.00::numeric, 15.00::numeric, 12.50::numeric, 5, 2),
      (sam, 22.00::numeric, 12.00::numeric, 12.50::numeric, 3, 4),
      (devon, 18.00::numeric, 11.00::numeric, 12.50::numeric, 3, 1),
      (casey, 16.00::numeric, 10.00::numeric, 12.50::numeric, 2, 2),
      (riley, 14.00::numeric, 9.00::numeric, 12.50::numeric, 2, 1),
      (taylor, 10.00::numeric, 8.00::numeric, 12.50::numeric, 1, 1)
  ) as v(uid, progress, consistency, improvement, indep, hint)
  where s.user_id = v.uid and s.group_id = faang and s.week_start = v_week;

  -- Reactions on recent FAANG activity
  insert into public.reactions (user_id, kind, target_type, target_id)
  select marcus, 'fire', 'activity', a.id
  from public.attempts a
  join public.attempt_group_attributions aga on aga.attempt_id = a.id
  where aga.group_id = faang
    and a.user_id = alex
    and a.invalidated_at is null
  order by a.completed_at desc
  limit 3
  on conflict do nothing;

  insert into public.reactions (user_id, kind, target_type, target_id)
  select priya, 'applause', 'activity', a.id
  from public.attempts a
  join public.attempt_group_attributions aga on aga.attempt_id = a.id
  where aga.group_id = faang
    and a.user_id = marcus
    and a.invalidated_at is null
  order by a.completed_at desc
  limit 2
  on conflict do nothing;

  insert into public.reactions (user_id, kind, target_type, target_id)
  select jordan, 'respect', 'activity', a.id
  from public.attempts a
  join public.attempt_group_attributions aga on aga.attempt_id = a.id
  where aga.group_id = faang
    and a.user_id = priya
    and a.invalidated_at is null
  order by a.completed_at desc
  limit 2
  on conflict do nothing;

  insert into public.reactions (user_id, kind, target_type, target_id)
  select alex, 'comeback', 'activity', a.id
  from public.attempts a
  join public.attempt_group_attributions aga on aga.attempt_id = a.id
  where aga.group_id = faang
    and a.user_id = riley
    and a.invalidated_at is null
  order by a.completed_at desc
  limit 1
  on conflict do nothing;

  insert into public.reactions (user_id, kind, target_type, target_id)
  select casey, 'challenge', 'activity', a.id
  from public.attempts a
  join public.attempt_group_attributions aga on aga.attempt_id = a.id
  where aga.group_id = faang
    and a.user_id = taylor
    and a.invalidated_at is null
  order by a.completed_at desc
  limit 1
  on conflict do nothing;

  update public.profiles
  set focused_group_id = faang, updated_at = now()
  where id in (alex, marcus, priya, jordan, sam, devon, casey, riley, taylor);

  update public.profiles
  set focused_group_id = campus, updated_at = now()
  where id in (elena, mina, chris);

  update public.profiles
  set focused_group_id = sprint, updated_at = now()
  where id = noah;

  execute 'reset role';
end $$;
