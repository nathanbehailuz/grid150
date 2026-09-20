# Grid150

Competitive accountability dashboard for groups finishing the NeetCode 150. Honor-based logging, scheduled reviews, and group leaderboards — not a LeetCode sync or chat app.

**Live app:** [https://grid150.vercel.app/](https://grid150.vercel.app/)

## Quick start for reviewers

1. Open the live app and log in with a demo account (email confirmation is on for new signups; use these instead).
2. Walk Today → overdue reviews → Leaderboard → Manage / Discover.

| Email | Password | Role in demo |
| --- | --- | --- |
| `alex@grid150.demo` | `Grid150Demo!` | Primary walkthrough; FAANG owner; overdue reviews; 68/150 |
| `marcus@grid150.demo` | `Grid150Demo!` | FAANG admin; weekly #1 |

Invite code: `FAANG1` (also `WEEKND`, `CAMPUS`, `SPRNT1`, `NYU150`). Full demo roster is in the seed notes below.

## Docs

- [Data model](docs/DATA_MODEL.md) — schema, ERD, RPCs, RLS proof, how to stand up the backend
- [Product brief](docs/PRODUCT_BRIEF.md) — product rules
- [Implementation PRD](docs/PRD.md) — build order
- [Build log](BUILD_LOG.md) — decisions and verification
- [Design / feature map](docs/design.md) — mockup inventory

## Repo layout

| Path | Purpose |
| --- | --- |
| `web/` | React + TypeScript app (Vite) |
| `supabase/` | Migrations, `seed.sql`, NeetCode JSON |
| `docs/` | Brief, PRD, data model |

## Local run

Requires **Node ≥ 20.19**.

```bash
cd web
npm install
cp .env.example .env.local
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (anon / publishable only)
npm run dev
```

```bash
npm run typecheck
npm test
npm run build
npm run lint
```

Production is already deployed at [grid150.vercel.app](https://grid150.vercel.app/) (`web/` as Vercel root, SPA rewrite in `web/vercel.json`). After any Auth URL change, allowlist that origin in Supabase **Authentication → URL configuration**.

## Backend

Supabase project `grid150` (`gvtprsfkvhdwbfvwynog`). Grid150 tables live under `public` alongside an unrelated `alba_*` schema from another app — seed and migrations never touch those.

```bash
# From repo root (after supabase login once)
npx supabase link --project-ref gvtprsfkvhdwbfvwynog
npx supabase db push --linked
npx supabase db query --linked -f supabase/seed.sql
```

Local Docker (`supabase start`) is optional. See [docs/DATA_MODEL.md](docs/DATA_MODEL.md) for the full schema and RLS walkthrough.

### Demo seed accounts

Password for all: `Grid150Demo!`

| Email | Name | Notes |
| --- | --- | --- |
| `alex@grid150.demo` | Alex Rivera | FAANG owner; 68/150; overdue reviews |
| `marcus@grid150.demo` | Marcus Vance | FAANG admin; weekly #1 |
| `priya@grid150.demo` | Priya Nair | FAANG #3; Campus Algorithms |
| `jordan@grid150.demo` | Jordan Lee | FAANG + Weekend; owns NYU Grind |
| `sam@grid150.demo` | Sam Ortiz | FAANG; NYU Grind |
| `devon@grid150.demo` | Devon Walsh | FAANG + Campus |
| `casey@grid150.demo` | Casey Kim | FAANG + Weekend |
| `riley@grid150.demo` | Riley Chen | Late FAANG joiner |
| `taylor@grid150.demo` | Taylor Brooks | Newest FAANG member |
| `elena@grid150.demo` | Elena Vasquez | Owns Campus Algorithms |
| `noah@grid150.demo` | Noah Patel | Owns Interview Sprint 2026 |
| `mina@grid150.demo` | Mina Park | Pending FAANG join request |
| `chris@grid150.demo` | Chris Okonkwo | Pending FAANG join request |
