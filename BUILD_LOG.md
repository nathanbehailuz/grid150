# Build Log: Grid150

## Goal & scope decision

- Building a competitive accountability dashboard for groups finishing the NeetCode 150. The product is honor-based self-reporting, not LeetCode/NeetCode sync, and not a tutoring or chat app.
- Left out of MVP: code execution, shared solutions, comments/DMs, live study sessions, custom syllabi, AI coaching, native mobile apps.
- 2026-09-19: Wrote `docs/design.md` as a feature map of the mockups (which page includes what). Skipped styling and layout on purpose; the mockup look is not the visual source of truth.
- 2026-09-19: Linked the four Stitch HTML mockups to each other and gap-checked them against the product brief. Did not add missing screens; documented gaps in `docs/design.md` instead.
- 2026-09-19: Calmed the mockup UI across all pages. Neon greens/oranges/purples, glows, pulse dots, and fake HUD copy were making a dark theme feel loud. Kept Geist + JetBrains Mono only.
- 2026-09-19: Today is questions of the day plus a split stats/calendar. Sidebar Groups is a membership dropdown; create/join is its own screen. Sidebar Leaderboard rank is the focused group.
- 2026-09-19: Removed the Roadmap "Review timing" bar chart. Topic list already shows due/mastery; the spark matrix was extra chrome.
- 2026-09-19: Removed the Roadmap Mastery definition banner. It restated a product rule already in the brief.
- 2026-09-19: Dropped the top-right header avatar. Profile stays in the sidebar only.
- 2026-09-19: Replaced the header Grid150 wordmark with a grid mark. No product name in chrome.
- 2026-09-19: Removed the Roadmap "Dependency Graph Link" card. It was decorative and had no destination.
- 2026-09-19: Removed fire emojis and the Reactions column from Leaderboard. Streak stays as days of text.
- 2026-09-19: Moved the logo to the sidebar top-left and put Grid150 beside it. Header is search, notifications, and Log attempt only.
- 2026-09-19: Removed the sidebar "Pages" label. Nav items sit under the progress card.
- 2026-09-19: Wrote `docs/PRD.md` as the implementation roadmap (P0–P6). Product rules stay in the brief; build order and brief/mockup gaps live in the PRD.
- 2026-09-19: Shipped P1 empty data contract (enums + tables + indexes + RLS on, no policies/seed/domain logic).
- 2026-09-19: Shipped P2 auth/RLS (profile trigger, membership helpers, policies, thin email/password smoke UI).
- 2026-09-19: Shipped P3 domain RPCs (unlock/review/attribution/scores/invites/edit window) with SQL fixtures.

## Stack & tooling

- Planned and started: React + TypeScript frontend (`web/`), Supabase (Postgres, Auth, RLS, Realtime, Edge Functions).
- 2026-09-19: Completed **P0 Foundations**. Vite React+TS app in `web/`, remote Supabase project `grid150` (`gvtprsfkvhdwbfvwynog`), local `supabase/` init, env template, Vitest smoke test, README.
- App connects via `web/.env.local` anon URL/key from the dashboard. Remote is linked for CLI `db push`.
- 2026-09-19: Completed **P1 Schema**. Single migration `supabase/migrations/20260919190000_init_schema.sql` (enums, 16 tables, FKs, indexes, RLS enabled with no policies). Applied to remote via `npx supabase db push --linked`.
- 2026-09-19: Completed **P2 Auth / authz**. Migrations `20260919200000_auth_rls.sql` (+ revoke-anon + groups creator SELECT fix). Email/password smoke UI in `web/`.
- 2026-09-19: Completed **P3 Domain logic**. Migrations `20260919210000_domain_core.sql` (+ create_group / progress cast / invalidate ambiguity fixes). Fixtures in `supabase/tests/p3_domain.sql`.

## Key decisions & trade-offs

- Decision: one global NeetCode 150 syllabus in strict order because groups need a shared sequence they can compete on (alternative considered: custom or per-group syllabi).
- Decision: reviews can revisit any completed problem and overdue reviews block new-problem logging because retention is a first-class goal, not just completion count.
- Decision: weekly score is Progress 50 + Consistency 25 + Improvement 25; all-time rank is average weekly score, not accumulated points, so late joiners are not permanently behind.
- Decision: attempts count only for groups the user already belonged to at log time because retroactive credit would let people join, dump history, and distort standings.
- Decision: social layer is preset reactions only (alternative considered: comments/chat) to keep the product accountability-focused.
- Decision: `docs/design.md` inventories mockup **features** only. Visual design will be redone; do not treat mockup CSS as the UI spec.
- Decision: always update this build log after meaningful work so assignment history stays current instead of being reconstructed at the end.
- Decision: mockup visual language is muted sage on charcoal, two typefaces, no em dashes, and no fake version/live chrome (alternative considered: leaving the Stitch defaults).
- Decision: chrome rank is the focused group (last opened, else earliest membership) because a global rank across groups is undefined (alternative considered: average rank or hiding the number).
- Decision: implementation order is schema → auth/RLS → domain logic → demo seed → wired frontend (alternative considered: frontend-first against mock data). Documented in `docs/PRD.md`.
- Decision: pin Vite 5 + Vitest 2 for P0 because the machine Node is `v22.9.0` and Vite 8 wants `>=22.12` (native binding install failed).
- Decision: P1 enables RLS on every table with zero policies so anon/authenticated stay locked until P2; service role can still seed later (alternative considered: delaying RLS until policies land).
- Decision: `profiles.focused_group_id` is added after `groups` exists to avoid a circular create-order FK problem.
- Decision: `problem_difficulty` and `join_request_status` are enums in SQL even though the plan table glance listed some as free text — keeps syllabus and join flows constrained at the DB layer.
- Decision: P2 helpers and admin RPCs live under `app_private` / narrow public wrappers; attempts stay owner-only SELECT so private reflections never leak via RLS (alternative considered: column grants, which cannot vary by user).
- Decision: admin invalidate uses `public.invalidate_attempt` SECURITY DEFINER returning only id/timestamps — not a full attempt row.
- Decision: groups SELECT includes `created_by = auth.uid()` because INSERT RETURNING evaluates SELECT before the AFTER bootstrap trigger adds owner membership.
- Decision: P3 timezone source of truth is `profiles.timezone` (ISO week Monday in that zone) for streaks and weekly snapshots.
- Decision: P3 enforces rules in Postgres SECURITY DEFINER RPCs (not Edge Functions); clients call `log_attempt`, `create_group`, `join_group_by_code`, etc.
- Decision: weekly Progress uses weighted solves (1.0 indep / 0.6 hint) vs `daily_target * active_days`, capped at 120% before scaling to 50; Improvement is neutral 12.5 on the first week.

## Hard parts / dead ends

- Today’s review modal used both `hidden` and `flex`, so the overlay sat on top of the page and ate clicks. Removed the conflicting `flex` until the modal is opened.
- P0: Vite 8 / Vitest 4 from `create-vite` failed to load rolldown native bindings on Node 22.9. Pinned Vite 5.4 + Vitest 2.1 instead.
- P2: first groups INSERT under RLS failed until SELECT allowed the creator — RETURNING runs before the owner-membership AFTER trigger.
- P3: RETURNS TABLE column names collided with INSERT/SELECT targets in `create_group` / `invalidate_attempt`; fixed with `#variable_conflict use_column`.

## How I verified it works

- Served `mockups/` locally and loaded Today, Roadmap, Leaderboard, Groups. Confirmed sidebar `data-path` hrefs point at the four HTML files, brand goes to Today, and group/standings CTAs go to Leaderboard.
- Compared those pages to `docs/PRODUCT_BRIEF.md` primary screens and logged gaps in `docs/design.md`. Did not click-test create/join stubs beyond noting they are modals.
- Rechecked all four pages after the mute pass: icons render as outlined symbols, v2.4/LIVE/glows are gone, type is Geist + JetBrains Mono.
- After the Today rebuild, checked questions-of-the-day links, Groups dropdown, create/join, and log screens.
- Reloaded Roadmap after dropping Review timing and confirmed the bar chart is gone while topics and the current-topic panel remain.
- Reloaded Roadmap after dropping the Mastery banner; search/filters sit under the progress strip.
- Reloaded Today after dropping the header avatar; Log attempt is the last control in the top bar.
- Reloaded Today after swapping the header wordmark for `logo.svg`.
- Reloaded Roadmap after dropping Dependency Graph Link; the page ends on the Log LRU Cache review CTA.
- Reloaded Leaderboard after dropping fire emojis and the Reactions column.
- Reloaded Today after moving the logo and Grid150 name to the top of the sidebar.
- Reloaded Today after dropping the Pages label.
- P0 exit checks: `npm run typecheck`, `npm test`, and `npm run build` succeed in `web/`. Remote project `grid150` is ACTIVE_HEALTHY; `.env.local` has URL + anon key. `npx oxlint .` is clean.
- P1 exit checks: `npx supabase db push --linked` applied `20260919190000_init_schema.sql`. `list_tables` shows 16 public tables, all `rls_enabled: true`, 0 rows. Smoke: insert topic `arrays` + problem `two-sum` at `global_order = 1`, then delete both; counts back to 0.
- P2 exit checks: auth_rls (+ revoke + groups SELECT fix) applied. SQL smoke: signup trigger creates profile; anon sees 0 profiles/attempts; Bob cannot read Alice attempts or update her group; Alice owner can update group. `anon` cannot execute `invalidate_attempt`. `web/` typecheck, test, and build pass with auth form.
- P3 exit checks: domain migrations applied. `supabase/tests/p3_domain.sql` proves unlock, fail-does-not-unlock, overdue review block, no retroactive attribution, dual-group attribution, weekly snapshot + neutral improvement, invalidate clears completion + writes audit.

## Known limitations

- Mockups still missing: auth polish, review queue, group admin, recent private attempts, group analytics (heatmap, weak topics, mastery distribution), and 10-minute edit / invalidation UI.
- Standings mockup score tooltip contradicts the brief (point sum vs weekly score out of 100).
- Search and notifications still go nowhere. `my_study_groups.html` is leftover and not in nav.
- GitHub CLI on this machine had an invalid token for `nathanbehailuz`; terminal auth still needs `gh auth login` if pushing.
- Git commit identity is still the old global name/email unless changed to `nathanbehailuz` / `nz2212@nyu.edu`.
- Syllabus empty until P4. No dashboard UI for domain RPCs until P5. Realtime leaderboards are P6.
- Advisors may WARN on intentional SECURITY DEFINER RPCs callable by authenticated; anon execute revoked.
- 2026-09-19: Signup copy assumes email confirmation is required; `signUp` passes `emailRedirectTo` to the app origin. Supabase Dashboard must allowlist that URL or the confirm link fails / expires oddly.
- 2026-09-19: Trimmed auth shell copy (no P2/smoke/Supabase status line; no timezone on signed-in view).

## Time spent

- Product definition / brief: majority of current work.
- Mockup review → `docs/design.md`, then a visual pass to mute color, copy, and type.
- Implementation: P0–P3 (foundations, schema, auth/RLS, domain RPCs).
