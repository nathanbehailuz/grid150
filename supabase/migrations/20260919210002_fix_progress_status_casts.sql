-- Cast problem_progress_status in progress helpers.
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
    'completed'::public.problem_progress_status,
    coalesce(
      (select unlocked_at from public.problem_progress
       where user_id = v_attempt.user_id and problem_id = v_attempt.problem_id),
      v_attempt.completed_at
    ),
    v_attempt.completed_at
  )
  on conflict (user_id, problem_id) do update
  set
    status = 'completed'::public.problem_progress_status,
    completed_at = excluded.completed_at,
    updated_at = now();

  v_next := app_private.next_new_problem_id(v_attempt.user_id);
  if v_next is not null then
    insert into public.problem_progress (
      user_id, problem_id, status, unlocked_at
    ) values (
      v_attempt.user_id, v_next, 'available'::public.problem_progress_status, now()
    )
    on conflict (user_id, problem_id) do update
    set
      status = case
        when public.problem_progress.status = 'completed'::public.problem_progress_status
          then 'completed'::public.problem_progress_status
        else 'available'::public.problem_progress_status
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
      p_uid, r.problem_id, 'completed'::public.problem_progress_status,
      r.completed_at, r.completed_at
    );
  end loop;

  v_next := app_private.next_new_problem_id(p_uid);
  if v_next is not null then
    insert into public.problem_progress (
      user_id, problem_id, status, unlocked_at
    ) values (
      p_uid, v_next, 'available'::public.problem_progress_status, now()
    )
    on conflict (user_id, problem_id) do nothing;
  end if;
end;
$$;
