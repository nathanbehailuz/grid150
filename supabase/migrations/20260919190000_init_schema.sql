-- Grid150 P1: initial schema (tables, enums, FKs, indexes).
-- RLS enabled with no policies yet (locked until P2).
-- No seed data (P4). No domain functions (P3).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.membership_role as enum ('owner', 'admin', 'member');
create type public.group_visibility as enum ('public', 'private');
create type public.group_join_mode as enum ('open', 'approval');
create type public.join_request_status as enum ('pending', 'approved', 'rejected');
create type public.attempt_type as enum ('new_problem', 'scheduled_review');
create type public.attempt_outcome as enum (
  'could_not_solve',
  'solved_with_hints',
  'solved_independently'
);
create type public.problem_difficulty as enum ('easy', 'medium', 'hard');
create type public.problem_progress_status as enum ('locked', 'available', 'completed');
create type public.review_task_status as enum ('pending', 'completed', 'cancelled');
create type public.reaction_kind as enum (
  'applause',
  'fire',
  'respect',
  'comeback',
  'challenge'
);
create type public.reaction_target_type as enum ('milestone', 'activity');
create type public.audit_action as enum ('edit', 'delete', 'invalidate');

-- ---------------------------------------------------------------------------
-- Syllabus
-- ---------------------------------------------------------------------------

create table public.topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  sort_order integer not null unique,
  created_at timestamptz not null default now()
);

create table public.problems (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics (id) on delete restrict,
  slug text not null unique,
  title text not null,
  difficulty public.problem_difficulty not null,
  global_order integer not null unique
    check (global_order >= 1 and global_order <= 150),
  neetcode_url text,
  created_at timestamptz not null default now()
);

create index problems_topic_id_idx on public.problems (topic_id);
create index problems_global_order_idx on public.problems (global_order);

-- ---------------------------------------------------------------------------
-- Profiles (focused_group_id added after groups)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Groups
-- ---------------------------------------------------------------------------

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  visibility public.group_visibility not null default 'private',
  join_mode public.group_join_mode not null default 'approval',
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column focused_group_id uuid references public.groups (id) on delete set null;

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.membership_role not null default 'member',
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

create unique index group_memberships_active_unique
  on public.group_memberships (group_id, user_id)
  where left_at is null;

create index group_memberships_user_id_idx on public.group_memberships (user_id);
create index group_memberships_group_id_active_idx
  on public.group_memberships (group_id)
  where left_at is null;

create table public.group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.join_request_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);

create unique index group_join_requests_pending_unique
  on public.group_join_requests (group_id, user_id)
  where status = 'pending';

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  code text not null unique
    check (char_length(code) >= 4 and char_length(code) <= 12),
  created_by uuid not null references public.profiles (id) on delete restrict,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.group_pace_settings (
  group_id uuid primary key references public.groups (id) on delete cascade,
  problems_per_week integer check (problems_per_week is null or problems_per_week > 0),
  deadline date,
  active_days smallint[] not null default '{1,2,3,4,5}'
    check (
      active_days <@ array[0,1,2,3,4,5,6]::smallint[]
      and cardinality(active_days) > 0
    ),
  pace_marker_topic_id uuid references public.topics (id) on delete set null,
  pace_marker_note text,
  updated_at timestamptz not null default now()
);

create table public.member_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  daily_new_target integer not null check (daily_new_target >= 0),
  pending_daily_new_target integer check (
    pending_daily_new_target is null or pending_daily_new_target >= 0
  ),
  pending_effective_week_start date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, group_id)
);

-- ---------------------------------------------------------------------------
-- Attempts and progress
-- ---------------------------------------------------------------------------

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  problem_id uuid not null references public.problems (id) on delete restrict,
  attempt_type public.attempt_type not null,
  outcome public.attempt_outcome not null,
  completed_at timestamptz not null default now(),
  time_spent_minutes integer check (
    time_spent_minutes is null or time_spent_minutes >= 0
  ),
  confidence smallint not null check (confidence between 1 and 5),
  could_explain boolean not null,
  private_reflection text,
  invalidated_at timestamptz,
  invalidated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index attempts_user_completed_at_idx
  on public.attempts (user_id, completed_at desc);
create index attempts_problem_id_idx on public.attempts (problem_id);
create index attempts_valid_idx
  on public.attempts (user_id, problem_id)
  where invalidated_at is null;

create table public.attempt_group_attributions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  membership_id uuid not null references public.group_memberships (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (attempt_id, group_id)
);

create index attempt_group_attributions_group_id_idx
  on public.attempt_group_attributions (group_id);

create table public.problem_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  problem_id uuid not null references public.problems (id) on delete cascade,
  status public.problem_progress_status not null default 'locked',
  unlocked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, problem_id)
);

create index problem_progress_user_status_idx
  on public.problem_progress (user_id, status);

create table public.review_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  problem_id uuid not null references public.problems (id) on delete cascade,
  due_at timestamptz not null,
  status public.review_task_status not null default 'pending',
  source_attempt_id uuid references public.attempts (id) on delete set null,
  completed_attempt_id uuid references public.attempts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index review_tasks_pending_due_idx
  on public.review_tasks (user_id, due_at)
  where status = 'pending';

create table public.weekly_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  week_start date not null,
  progress numeric(5, 2) not null default 0,
  consistency numeric(5, 2) not null default 0,
  improvement numeric(5, 2) not null default 0,
  total numeric(5, 2) not null default 0,
  independent_solves integer not null default 0,
  hint_assisted_solves integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, group_id, week_start)
);

create index weekly_score_snapshots_group_week_idx
  on public.weekly_score_snapshots (group_id, week_start);
create index weekly_score_snapshots_group_total_idx
  on public.weekly_score_snapshots (group_id, total desc);

create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.reaction_kind not null,
  target_type public.reaction_target_type not null,
  target_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, target_type, target_id)
);

create index reactions_target_idx
  on public.reactions (target_type, target_id);

create table public.attempt_audit_log (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  action public.audit_action not null,
  reason text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index attempt_audit_log_attempt_id_idx
  on public.attempt_audit_log (attempt_id, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: enabled, no policies (deny all for anon/authenticated until P2)
-- ---------------------------------------------------------------------------

alter table public.topics enable row level security;
alter table public.problems enable row level security;
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_memberships enable row level security;
alter table public.group_join_requests enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_pace_settings enable row level security;
alter table public.member_targets enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_group_attributions enable row level security;
alter table public.problem_progress enable row level security;
alter table public.review_tasks enable row level security;
alter table public.weekly_score_snapshots enable row level security;
alter table public.reactions enable row level security;
alter table public.attempt_audit_log enable row level security;
