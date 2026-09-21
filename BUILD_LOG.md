# Build Log: Grid150 (Data Dashboard on a Backend Service)

## Goal & scope decision

- Built a competitive accountability dashboard for groups finishing the NeetCode 150: honor-based attempt logging, scheduled reviews, group standings, and analytics.
- Chose this domain because it has many related entities (users, groups, memberships, attempts, reviews, scores) and data worth charting (pace, mastery, weekly scores).
- Left out to fit scope: LeetCode/NeetCode sync, code execution, chat/DMs, shared solutions, custom syllabi, file uploads, native mobile.

## Stack & tooling

- Frontend: React + TypeScript + Vite (`web/`), React Router, Recharts.
- Backend: Supabase (Postgres, Auth, RLS, Realtime, SECURITY DEFINER RPCs). Chosen for SQL schema, row-level security, and server-side scoring without Edge Functions.
- Deploy: Vercel (`web/` root) at https://grid150.vercel.app/
- AI: Cursor for implementation; decisions and verification recorded here.
- CI: GitHub Actions (`typecheck` / `test` / `build` in `web/`).

## Key decisions & trade-offs

- Decision: Supabase over Convex/Appwrite because the product needs strict unlock rules, attribution, and weekly score math that belong in Postgres RPCs (alternative: Convex realtime-first with app-layer rules).
- Decision: one global NeetCode 150 order so groups compete on the same sequence (alternative: custom syllabi).
- Decision: overdue reviews block new-problem logging so retention is enforced, not optional.
- Decision: attempts attribute only to groups joined at log time (no retroactive credit).
- Decision: weekly score = Progress 50 + Consistency 25 + Improvement 25; all-time = average weekly score so late joiners are not permanently behind.
- Decision: enforce rules in Postgres RPCs (`log_attempt`, scoring, invites); client is not the source of truth (alternative: Edge Functions).
- Decision: attempts are owner-only SELECT so private reflections never leak via RLS (alternative: column grants, which cannot vary by user).
- Decision: Realtime on `weekly_score_snapshots`, `group_join_requests`, and `reactions` — not `attempts` (peers must not see private fields).
- Decision: owner `delete_group` clears attributions first because `membership_id` is ON DELETE RESTRICT (alternative: raw table DELETE, which fails).
- Decision: muted sage-on-charcoal UI; no neon mockup chrome (alternative: shipping Stitch defaults).
- Decision: brand mark is the sage 3×3 grid SVG (`logo.svg` / favicon), not the Vite purple bolt wordmark that briefly replaced it.
- Decision: document the full schema in `docs/DATA_MODEL.md` for reviewers instead of leaving it only in migrations.

## Hard parts / dead ends

- Vite 8 / Vitest 4 failed on Node 22.9 (native bindings). Pinned Vite 5.4 + Vitest 2.1.
- Groups INSERT under RLS failed until SELECT allowed the creator (RETURNING runs before the owner-membership trigger).
- RPC `RETURNS TABLE` column names collided with INSERT targets; fixed with `#variable_conflict use_column`.
- Today page stuck on loading from unstable refresh callback identities; stabilized hook deps.
- Shared DB also has unrelated `public.alba_*` tables; seed/migrations never touch them.
- Leaderboard → Analytics black-screened because `useGroupRealtime` reused channel topic `group-${id}`; mounting a second subscriber called `.on()` after `subscribe()`. Fixed with a unique topic per mount.
- YOUR STANDING stayed on this-week rank while All-time avg table used averages (`#1 of 1` vs table `#3`). Card now uses `allTimeStanding` when that mode is selected.
- Today never felt “done”: next unlock stayed in the queue after the daily target, and review tally was stubbed at 0. Gate new by remaining, count review solves today, show Done for today. Log stays on `/log` after submit (no `/attempts` bounce). Verified `review_delay_days` in prod: 1/1/2/4/14/30/2 matches the brief.
- Removed the Done for today card — meeting the daily target still shows the next unlock (labeled beyond daily target) so users can keep logging; edits stay on Attempts within the 10‑minute window.
- Summary TODAY block and queue footer call out extras when solves exceed the daily target (`3/2` → `+1 beyond plan`).
- All-time leaderboard Indep/Hint used this week’s snapshot only (e.g. 58 NeetCode vs 3/0). Now sums group weekly indep/hint across weeks.
- Group creation now rejects case-insensitive duplicate names at the database, guards double-submit in the client, validates names/targets, and skips redundant auto-invites for public/open groups. Removed the empty duplicate while preserving the newer focused group.
- `/groups/join` is now create-only: the invite-code join form and “Create / join” labels were removed. Creation now requires at least one active day and saves the chosen rest-day schedule atomically in `create_group`.

## How I verified it works

- Automated: `npm run typecheck`, Vitest (11 tests), `npm run build`; SQL fixtures in `supabase/tests/p3_domain.sql` (unlock, review block, attribution, weekly score, invalidate).
- Manual: login as `alex@grid150.demo` → Today (overdue review block) → Leaderboard / Analytics charts → Manage (invites, delete confirm) → Discover.
- RLS: owner-only attempt SELECT; documented proof path in `docs/DATA_MODEL.md` (Marcus cannot read Alex’s `private_reflection`).
- Realtime: subscribe + refetch on standings/manage/analytics when snapshots/reactions/join requests change.
- Group creation: production migrations recorded; normalized-name unique index present; duplicate count is 0; retained the newer focused test group. Verified create-only UI with Mon–Fri active by default, plus typecheck, 11 Vitest tests, production build, and Supabase advisors (only pre-existing warnings).
- With more time: E2E two-tab realtime smoke in CI; broader RLS matrix tests as Vitest against a local Supabase.

## Known limitations

- Signup requires email confirmation; reviewers should use seeded demo accounts.
- Demo FAANG this-week scores are narrative-adjusted after recompute so Marcus stays #1 for walkthroughs.
- Header search/notifications not implemented.
- Peer attempt streams are not realtime (by design for privacy).
- Same Supabase project hosts leftover `alba_*` tables from another app; Grid150 only owns its own tables.
- Bundle is large (~Recharts); code-splitting deferred.

## Time spent

- Product brief / design / mockup pass: ~30%
- Schema, RLS, domain RPCs, seed: ~40%
- Frontend screens + analytics + submission polish (docs, UX states, realtime, CI): ~30%
