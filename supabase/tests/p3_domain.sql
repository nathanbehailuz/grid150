-- P3 domain fixture tests (run against remote via SQL editor / MCP).
-- Not a migration; leaves DB clean on success.

create or replace function pg_temp.set_auth(p_uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
    true
  );
end;
$$;

do $$
declare
  alice uuid := 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  bob uuid := 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  topic_id uuid;
  p1 uuid;
  p2 uuid;
  p3 uuid;
  gid uuid;
  gid2 uuid;
  code text;
  a1 uuid;
  a_fail uuid;
  a2 uuid;
  a_review uuid;
  next_id uuid;
  n int;
  snap public.weekly_score_snapshots%rowtype;
  err text;
begin
  delete from public.attempt_audit_log where actor_id in (alice, bob);
  update public.profiles set focused_group_id = null where id in (alice, bob);
  delete from public.groups where created_by in (alice, bob);
  delete from auth.users where id in (alice, bob);
  delete from public.problems where slug like 'p3-fixture-%';
  delete from public.topics where slug = 'p3-fixture-topic';

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) values
  ('00000000-0000-0000-0000-000000000000', alice, 'authenticated', 'authenticated',
   'alice-p3@grid150.test', crypt('test-pass', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Alice P3"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', bob, 'authenticated', 'authenticated',
   'bob-p3@grid150.test', crypt('test-pass', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Bob P3"}'::jsonb, now(), now(), '', '', '', '');

  insert into public.topics (slug, name, sort_order)
  values ('p3-fixture-topic', 'P3 Fixture', 900)
  returning id into topic_id;

  insert into public.problems (topic_id, slug, title, difficulty, global_order) values
    (topic_id, 'p3-fixture-1', 'P3 One', 'easy', 140),
    (topic_id, 'p3-fixture-2', 'P3 Two', 'easy', 141),
    (topic_id, 'p3-fixture-3', 'P3 Three', 'easy', 142)
  returning id into p1;
  -- returning only last; fetch explicitly
  select id into p1 from public.problems where slug = 'p3-fixture-1';
  select id into p2 from public.problems where slug = 'p3-fixture-2';
  select id into p3 from public.problems where slug = 'p3-fixture-3';

  perform pg_temp.set_auth(alice);
  execute 'set local role authenticated';

  select g.group_id, g.invite_code into gid, code
  from public.create_group('P3 Fixture Group', 'private', 'approval') g;

  if gid is null or code is null then
    raise exception 'create_group failed';
  end if;

  -- 1) Unlock: cannot log p2 first
  begin
    perform public.log_attempt(p2, 'new_problem'::public.attempt_type, 'solved_independently'::public.attempt_outcome, 4::smallint, true);
    raise exception 'expected unlock failure for p2';
  exception when others then
    if sqlerrm not like '%next unlocked%' then
      raise;
    end if;
  end;

  -- Fail on p1 does not unlock p2
  a_fail := public.log_attempt(p1, 'new_problem'::public.attempt_type, 'could_not_solve'::public.attempt_outcome, 2::smallint, false);
  next_id := public.next_unlocked_problem();
  if next_id is distinct from p1 then
    raise exception 'fail should keep p1 unlocked, got %', next_id;
  end if;

  -- Succeed p1 unlocks p2
  a1 := public.log_attempt(p1, 'new_problem'::public.attempt_type, 'solved_independently'::public.attempt_outcome, 5::smallint, true);
  next_id := public.next_unlocked_problem();
  if next_id is distinct from p2 then
    raise exception 'expected p2 next, got %', next_id;
  end if;

  -- Attribution: alice attempt attributed to gid
  select count(*) into n from public.attempt_group_attributions where attempt_id = a1 and group_id = gid;
  if n <> 1 then
    raise exception 'expected 1 attribution, got %', n;
  end if;

  -- Bob joins later — no retroactive attribution
  perform pg_temp.set_auth(bob);
  perform public.join_group_by_code(code);
  select count(*) into n from public.attempt_group_attributions where attempt_id = a1;
  if n <> 1 then
    raise exception 'retroactive attribution leaked: %', n;
  end if;

  -- Dual membership attribution for new attempt
  perform pg_temp.set_auth(alice);
  select g.group_id into gid2
  from public.create_group('P3 Second', 'private', 'approval') g;
  a2 := public.log_attempt(p2, 'new_problem'::public.attempt_type, 'solved_with_hints'::public.attempt_outcome, 3::smallint, true);
  select count(*) into n from public.attempt_group_attributions where attempt_id = a2;
  if n <> 2 then
    raise exception 'expected 2 attributions for dual membership, got %', n;
  end if;

  -- 2) Overdue review blocks new problem
  update public.review_tasks
  set due_at = now() - interval '1 day'
  where user_id = alice and problem_id = p2 and status = 'pending';

  begin
    perform public.log_attempt(p3, 'new_problem'::public.attempt_type, 'solved_independently'::public.attempt_outcome, 4::smallint, true);
    raise exception 'expected overdue review block';
  exception when others then
    if sqlerrm not like '%overdue review%' then
      raise;
    end if;
  end;

  a_review := public.log_attempt(p2, 'scheduled_review'::public.attempt_type, 'solved_independently'::public.attempt_outcome, 4::smallint, true);
  -- clear any other overdue from p1
  update public.review_tasks
  set due_at = now() + interval '7 days'
  where user_id = alice and status = 'pending' and due_at < now();

  -- 4) Weekly score snapshot exists after logging
  select * into snap
  from public.weekly_score_snapshots
  where user_id = alice and group_id = gid
  order by week_start desc
  limit 1;
  if not found then
    raise exception 'missing weekly snapshot';
  end if;
  if snap.total < 0 or snap.total > 100 then
    raise exception 'total out of range: %', snap.total;
  end if;
  if snap.independent_solves < 1 then
    raise exception 'expected independent solves >= 1';
  end if;
  -- first week improvement is neutral 12.5
  if snap.improvement <> 12.5 then
    raise exception 'expected neutral improvement 12.5, got %', snap.improvement;
  end if;

  -- 5) Invalidate strips from progress (admin after edit window)
  -- Force completed_at older than 10 minutes
  perform set_config('app.allow_attempt_mutation', 'on', true);
  update public.attempts
  set completed_at = now() - interval '15 minutes'
  where id = a1;

  perform public.invalidate_attempt(a1);

  select count(*) into n from public.attempt_audit_log
  where attempt_id = a1 and action = 'invalidate';
  if n < 1 then
    raise exception 'missing invalidate audit';
  end if;

  if app_private.problem_is_completed(alice, p1) then
    raise exception 'invalidated solve still counts as completed';
  end if;

  -- cleanup
  execute 'reset role';
  delete from public.attempt_audit_log where actor_id in (alice, bob);
  update public.profiles set focused_group_id = null where id in (alice, bob);
  delete from public.groups where created_by in (alice, bob);
  delete from auth.users where id in (alice, bob);
  delete from public.problems where slug like 'p3-fixture-%';
  delete from public.topics where slug = 'p3-fixture-topic';

  raise notice 'P3 domain tests OK';
end $$;

select 'P3 domain tests OK' as status;
