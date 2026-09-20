# Grid150 Implementation PRD

Build roadmap for shipping Grid150. This is not a second product brief.

| Document | Role |
| --- | --- |
| [PRODUCT_BRIEF.md](PRODUCT_BRIEF.md) | Product rules: curriculum, scoring, privacy, MVP scope |
| [design.md](design.md) + `mockups/` | Screen inventory and feature map from HTML mockups |
| **This file** | Build order, phase deliverables, brief coverage, exit checks |

## Goals and non-goals

**Ship (MVP)** — authentication and profiles; seeded NeetCode 150; honor-based logging; review scheduling and new-problem blocking; personal targets and streaks; public/private groups; open and approval join; owner/admin/member roles; multi-group attribution; weekly and average-weekly leaderboards; core personal and group analytics; 10-minute attempt edit and admin invalidation; preset reactions on milestones; responsive dashboard.

**Do not ship** — LeetCode/NeetCode sync; code execution or submission verification; chat, comments, or DMs; shared solutions or tutoring; live study sessions; custom syllabi or out-of-order unlocks; AI coaching; native mobile apps.

## Success criteria

Taken from the product brief. Treat these as release gates for P5–P6:

- A new user can create an account, join or create a group, set a target, and log a first attempt without guidance.
- The system never unlocks a new problem out of order.
- An overdue required review blocks new-problem logging.
- An attempt is attributed only to groups the user belonged to at that moment.
- Weekly scores are explainable from visible Progress / Consistency / Improvement components.
- Private attempt details (reflections, confidence, exact history) are inaccessible to other members.
- The dashboard stays useful across a full NeetCode 150 cohort journey.

## Phase overview

Frontend is wired only after the schema, authz, and domain rules exist so Today / Log / Leaderboard are not rebuilt twice against fake data shapes.

```text
P0 Foundations → P1 Schema → P2 Auth/RLS → P3 Domain logic → P4 Demo seed → P5 Frontend → P6 Hardening
```

| Phase | Goal |
| --- | --- |
| **P0 Foundations** | React + TypeScript app scaffold, Supabase project, env, lint/test harness |
| **P1 Schema** | Postgres migrations for the brief’s data model; syllabus seed shape |
| **P2 Auth / authz** | Supabase Auth, profile on signup, RLS, roles |
| **P3 Domain logic** | Unlock, reviews, attribution, streaks, scores, corrections, invites |
| **P4 Demo data** | NeetCode 150 + cohort-shaped seed so the UI loads without manual clicking |
| **P5 Frontend** | Wired React app from mockups, then screens the mockups still miss |
| **P6 Hardening** | Tests, realtime smoke, success-criteria checklist |

Stack (unchanged from the brief): React + TypeScript, Supabase (Postgres, Auth, RLS, Realtime, Edge Functions / Postgres functions), charts via the project’s React chart library once chosen in P0/P5.

---

## P0 Foundations

**Depends on:** nothing.

**Deliverables**

- App package (Vite or equivalent) with React + TypeScript
- Supabase CLI linked project (local and remote)
- Env template for anon/service keys (no secrets in git)
- Lint, format, and a minimal test runner
- README pointers to brief, design, this PRD

**Exit criteria**

- `npm`/`pnpm` install and typecheck succeed
- Empty app boots
- Supabase CLI can start or connect to a project

**P0 status (2026-09-19):** Done. See `web/`, `supabase/`, root `README.md`. Verified typecheck, Vitest smoke test, and production build. Remote project `grid150` (`gvtprsfkvhdwbfvwynog`) is live; browser env uses anon key. CLI is linked for migration push.

---

## P1 Schema

**Depends on:** P0.

**Deliverables**

Migrations for the brief’s suggested model (DDL lives here, not in this PRD):

| Table | Purpose |
| --- | --- |
| `profiles` | Display name, timezone, focused-group preference |
| `topics` | Ordered NeetCode topics |
| `problems` | Global ordered NeetCode 150 problems |
| `groups` | Group identity, visibility, join mode |
| `group_memberships` | Role, joined_at, left_at |
| `group_join_requests` | Approval-mode joins |
| `group_invites` | Invite codes / links |
| `group_pace_settings` | Problems/week, deadline, active days, pace markers |
| `member_targets` | Personal daily new-problem target; effective next week |
| `attempts` | Honor-based log (type, outcome, time, confidence, explain, private reflection) |
| `attempt_group_attributions` | Which groups an attempt counts for |
| `problem_progress` | Per-user syllabus unlock / completion state |
| `review_tasks` | Due reviews and schedule |
| `weekly_score_snapshots` | Progress / Consistency / Improvement and totals |
| `reactions` | Preset reactions on eligible activity |
| `attempt_audit_log` | Edits and invalidations |

Indexes for membership lookups, due reviews, weekly snapshots by group/week, and problem sequence.

**Exit criteria**

- Migrations apply cleanly on a fresh database
- Syllabus tables can hold 150 ordered problems (seed content can wait for P4)
- No application logic yet beyond constraints and FKs

**P1 status (2026-09-19):** Done. Migration `supabase/migrations/20260919190000_init_schema.sql` applied to remote `grid150`. All 16 public tables exist with RLS enabled and no policies (locked until P2). Smoke insert/delete of one topic + problem (`global_order = 1`) succeeded; tables left empty for P4 seed. No auth trigger, scoring functions, or NeetCode seed yet.

---

## P2 Auth / authz

**Depends on:** P1.

**Deliverables**

- Email (or provider) signup/login via Supabase Auth
- `profiles` row created on signup
- RLS policies:

| Data | Who can read | Who can write |
| --- | --- | --- |
| Private reflections, confidence, exact attempt history | Owner only | Owner (within edit rules) |
| Group-visible summaries (scores, streaks, indep/hint counts, topic progress) | Group members | System / owner via allowed paths |
| Invalidate attempt | Owner/admin of eligible group | Owner/admin after edit window |
| Group settings, invites, roles | Per brief Owner/Admin rules | Owner/Admin |

- Role enum on membership: owner, admin, member
- Focused group stored on profile (last opened group; else earliest membership)

**Exit criteria**

- Unauthenticated users cannot read member data
- Member A cannot read member B’s private reflection
- Owner/admin can perform admin-only mutations; members cannot

**P2 status (2026-09-19):** Done. Migrations `20260919200000_auth_rls.sql`, `20260919200001_auth_rls_revoke_anon.sql`, `20260919200002_fix_groups_select_creator.sql` applied to remote `grid150`. Profile-on-signup trigger, group bootstrap (owner membership + pace settings), `app_private` helpers, RLS on all public tables, owner-only `attempts`, admin `invalidate_attempt` / meta RPCs (anon execute revoked). Thin email/password UI in `web/`. Domain unlock/score/invite redeem remain P3.

---

## P3 Domain logic

**Depends on:** P2.

Enforce brief rules in Postgres functions and/or Edge Functions. Client must not be the source of truth for unlocks, scores, or attribution.

**Deliverables**

- Strict new-problem unlock (next unlocked only; fail does not unlock)
- Review schedule from the brief’s table; earliest date wins
- Overdue required review blocks new-problem logging
- Attempt attribution: `attempt.completed_at >= membership.joined_at` for each active membership; no retroactive credit
- Daily target = new problems only; target changes take effect next week
- Streaks: meet target on group active days; no freezes; timezone-aware
- Weekly score = Progress 50 + Consistency 25 + Improvement 25; all-time = average weekly (min one completed week)
- 10-minute member edit/delete; after that admin invalidation + audit log + recalculation
- Create group (name → invite code); join by code; public discovery + approval join paths
- Preset reactions on milestones / eligible activity (not score-affecting)

**Exit criteria**

- Automated tests (or SQL fixtures) prove unlock, review block, attribution, and weekly score math
- Invalidated attempts stop affecting progress, reviews, scores, and streaks

**P3 status (2026-09-19):** Done. Domain RPCs live in `supabase/migrations/20260919210000_domain_core.sql` (+ follow-up fixes). Profile timezone drives day/week boundaries. Fixtures: `supabase/tests/p3_domain.sql` (unlock, review block, attribution, score, invalidate). Full NeetCode seed and UI remain P4/P5.

---

## P4 Demo data

**Depends on:** P3.

**Deliverables**

- Seed all 150 problems and topics in order
- Demo users (e.g. Alex Rivera + cohort peers)
- One primary group (FAANG Grind Club–style) plus optional secondary memberships
- Memberships with joined_at timestamps that exercise attribution
- Attempts, due reviews, streaks, and weekly snapshots matching mockup narrative (~68/150, #2 rank, review due)
- Invite code for join flow demos

**Exit criteria**

- Fresh migrate + seed produces a browsable focused-group leaderboard and a blocked new-problem case
- No hand-authored UI state required to demo core flows

**P4 status (2026-09-19):** Done. Syllabus in `supabase/migrations/20260919220000_neetcode150_syllabus.sql` (source `supabase/seeds/neetcode150.json`). Demo cohort in `supabase/seed.sql`: Alex Rivera 68/150, FAANG Grind Club, Marcus #1 / Alex #2 this week, overdue review blocks new problems, invite `FAANG1`. Demo password `Grid150Demo!` (`*@grid150.demo`).

**P4 seed expansion (2026-09-20):** 13 demo users, 5 groups (FAANG private/approval plus four public), mixed attempt outcomes/reviews/reflections, 8-week snapshots, reactions, pending join requests, extra invites, pace markers. Remote `public.alba_*` tables belong to another project and are not touched.

**Submission polish (2026-09-20):** Live URL documented; `docs/DATA_MODEL.md`; owner `delete_group`; Realtime on snapshots/join requests/reactions; skeletons / empty / offline; optimistic delete + reactions; CI workflow.

---

## P5 Frontend

**Depends on:** P4 (can scaffold routes earlier; ship wired screens here).

**P5 status (2026-09-19):** Done for this pass (demo-complete app in `web/`). React Router + AppShell chrome, auth gate, Today / Roadmap / Reviews / Log / Leaderboard / Join-Create / Profile wired to P3 RPCs and seeded data. Search and notifications remain inert chrome.

**P5 mockup parity (2026-09-20):** Today calendar + week breakdown (CSS bars), Log dual review/new panels with lock, Roadmap overview/filters/mastery/current-topic panel, Leaderboard Your Standing + richer columns, Groups dropdown ranks. Chart library still deferred with P5.1 analytics.

**P5.1 phase 1 (2026-09-20):** Group manage (`/groups/manage`) + recent attempts edit/delete (`/attempts`) + invite create/revoke RPCs.

**P5.1b (2026-09-20):** Leaderboard **Standings | Analytics** (pace marker, CSS heatmap, Recharts mastery/weak/indep, milestone feed + `add_reaction`); Discover (`/groups/discover` + `list_public_groups` / `request_join_group`); Manage pace marker fields; `group_recent_activity` RPC.

**Defaults**

- Standings table stays reaction-free (current mockup). Reactions live on a milestone / activity feed per brief Social Layer.
- Header search and notifications stay non-functional chrome until after core screens.

**Deliverables (from mockups first)**

| Screen | Source | Status |
| --- | --- | --- |
| Shared chrome (logo, nav, Groups dropdown, focused rank, Log attempt) | All mockups | Done |
| Today | `personal_dashboard.html` | Done (calendar + week breakdown) |
| Roadmap | `neetcode_150_syllabus.html` | Done |
| Log attempt | `log_attempt.html` | Done (dual review/new panels) |
| Leaderboard (week / all-time) | `group_standings.html` | Done (Your Standing + table) |
| Join or create group | `join_or_create_group.html` | Done |

**Deliverables (brief gaps)**

| Screen | Notes | Status |
| --- | --- | --- |
| Auth / profiles | Signup, login, display name, timezone | Done |
| Review queue | Overdue first; open Log as scheduled review | Done (reason / previous outcome polish deferred) |
| Group management | Visibility, open vs approval, invites, members/roles, pace, invalidation | **P5.1 phase 1 done** (`/groups/manage`) |
| Attempt correction UI | 10-minute edit/delete; admin invalidate | **P5.1 phase 1 done** (`/attempts` + manage invalidate) |
| Group analytics beyond table | Pace marker, heatmap, weak topics, mastery, milestones + reactions | **P5.1b done** (Leaderboard Analytics) |
| Public discovery | Browse/search public groups (join-by-code covered) | **P5.1b done** (`/groups/discover`) |
| Chart library | Recharts for analytics panels | **P5.1b done** (Today CSS bars unchanged) |

**Exit criteria**

- Brief success criteria can be walked through in the UI against seed data (Alex demo path)
- Private fields never appear in group views
- Responsive layout usable on laptop and phone widths (~375px drawer + bottom nav)

---

## P6 Hardening

**Depends on:** P5.

**Deliverables**

- Unit tests: review schedule, unlock, weekly score components, attribution
- Integration tests: RLS denials; join/create; edit window; invalidation recalculation
- Realtime smoke: leaderboard or activity update when another member logs
- Checklist against Success criteria and MVP Scope in the brief
- Known cut list (if any) written down rather than silently dropped

**Exit criteria**

- CI runs typecheck + critical domain tests
- Success criteria checklist signed off or explicitly deferred with reason

---

## Brief coverage matrix

### Primary screens

| Brief screen | Phase | Mockup today | App (P5) |
| --- | --- | --- | --- |
| Personal Dashboard | P5 | Yes (`personal_dashboard.html`) | Done |
| Syllabus | P5 | Yes (`neetcode_150_syllabus.html`) | Done |
| Review Queue | P5 | Missing mockup | Done (`/reviews`) |
| Group Dashboard (standings + analytics) | P5 / P5.1b | Standings only | **Done** (Standings + Analytics) |
| Join or Create Group | P5 | Yes (`join_or_create_group.html`) | Done (+ Discover P5.1b) |
| Group Management | P5.1 | Missing | Phase 1 + pace marker (P5.1b) |
| Auth / profiles | P2 + P5 | Missing mockup | Done |
| Honor-based log | P3 + P5 | Yes (`log_attempt.html`) | Done |

### Backend responsibilities

| Responsibility | Phase |
| --- | --- |
| Authentication and authorization | P2 |
| RLS for private data | P2 |
| Syllabus ordering and unlock validation | P3 |
| Review scheduling and new-problem blocking | P3 |
| Multi-group attempt attribution | P3 |
| Group-specific progress snapshots | P3 |
| Weekly score and history | P3 |
| Average weekly leaderboard | P3 |
| Streaks (active days + timezone) | P3 |
| Delayed target changes | P3 |
| Edit window and invalidation audit | P3 |
| Realtime leaderboard / activity | P3 + P6 |

### Mockup gaps vs brief (tracked for P5 / P5.1)

- Auth and profiles — **done in app (P5)**
- Dedicated review queue — **done in app (P5)**
- Group management (visibility, invites, roles, pace, invalidation) — **P5.1 phase 1 done**
- Attempt correction (10-minute edit/delete, admin invalidate) — **P5.1 phase 1 done**
- Group analytics (heatmap, weak topics, mastery distribution, milestones + reactions) — **P5.1b done**
- Public discovery and join-approval UX (join-by-code exists) — **P5.1b done** (`/groups/discover`)
- Preset reactions: keep in MVP; attach to milestones/activity, not the standings table — **P5.1b done**

---

## Authz summary

| Action | Owner | Admin | Member |
| --- | --- | --- | --- |
| Log attempts / reviews | Yes | Yes | Yes |
| Set personal target | Yes | Yes | Yes |
| View group standings and summaries | Yes | Yes | Yes |
| React to eligible activity | Yes | Yes | Yes |
| Approve joins, manage members, pace settings | Yes | Yes | No |
| Invalidate attempt after edit window | Yes | Yes | No |
| Edit group settings, promote admins, transfer, delete group | Yes | No | No |
| Read another member’s private reflection | No | No | No |

RLS is the default enforcement. Domain functions must re-check role and membership before mutating scores or progress.

---

## Open decisions (post-P5)

1. **Timezone source of truth** — **Resolved (P3):** `profiles.timezone` (ISO week Monday in that zone) for streaks and weekly snapshots.
2. **Search and notifications** — remain chrome-only for MVP (**P5 choice**); optional minimal pass later.
3. **Public discovery ranking** — **Resolved (P5.1b):** active member count desc, then `created_at` desc; name `ilike` filter.
4. **Milestone feed shape** — **Resolved (P5.1b):** successful solves (+ first-indep flag), week #1 banner, self streak chips (7/14/30); reactions on attempt `activity` ids.

---

## What this PRD deliberately leaves out

- Visual design system (mockups are not the long-term look)
- Exact SQL DDL and Edge Function signatures (P1 / P3 artifacts)
- Hosting and CI vendor choices beyond “typecheck + tests in CI” (P0 / P6)
