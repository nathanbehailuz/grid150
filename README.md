# Grid150

Competitive accountability dashboard for groups finishing the NeetCode 150. Honor-based logging, scheduled reviews, and group leaderboards — not a LeetCode sync or chat app.

## Docs

- [Product brief](docs/PRODUCT_BRIEF.md) — product rules
- [Design / feature map](docs/design.md) — what each mockup screen does
- [Implementation PRD](docs/PRD.md) — build order (P0–P6)
- [Build log](BUILD_LOG.md) — decisions and verification notes

## Repo layout

| Path | Purpose |
| --- | --- |
| `web/` | React + TypeScript app (Vite) |
| `supabase/` | Local Supabase CLI config and future migrations |
| `mockups/` | Static HTML mockups (UI reference until P5) |
| `docs/` | Brief, design, PRD |

## Web app

```bash
cd web
npm install
cp .env.example .env.local   # if you do not already have .env.local
# Fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (publishable/anon only)
npm run dev
```

P2 ships a minimal email/password signup and login shell (not the full dashboard). After signup, a `profiles` row is created by a database trigger.

**Auth dashboard note:** Email provider must be enabled on the Supabase project. For local smoke you may turn off “Confirm email”; re-enable before production (P6).

Other scripts:

```bash
npm run typecheck
npm test
npm run build
npm run lint
```

**Never** put the Supabase service role key in Vite env. It is for server / Edge Functions only (later phases).

### Env

Requires **Node ≥ 20.19** (or ≥ 22.12). This repo pins **Vite 5** so Node 22.9 still works.

Remote project: `grid150` (`gvtprsfkvhdwbfvwynog`, region `us-east-1`).

```bash
VITE_SUPABASE_URL=https://gvtprsfkvhdwbfvwynog.supabase.co
VITE_SUPABASE_ANON_KEY=<anon or publishable key from dashboard>
```

### Supabase CLI

```bash
# From repo root (after supabase login once)
npx supabase link --project-ref gvtprsfkvhdwbfvwynog
```

Local `supabase start` needs Docker and is optional. Schema is in `supabase/migrations/` (P1+); push with `npx supabase db push --linked`.

## Mockups

Open `mockups/index.html` (or any page under `mockups/`) via a static server until the React app replaces them in P5.
