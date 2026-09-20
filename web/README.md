# Grid150 web

React + TypeScript + Vite app for the Grid150 dashboard.

**Production:** [https://grid150.vercel.app/](https://grid150.vercel.app/)

## Setup

```bash
cp .env.example .env.local
# set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Scripts

- `npm run dev` — local Vite server
- `npm run typecheck` / `npm test` / `npm run build` — CI gates (also `.github/workflows/web.yml`)
- `npm run lint` — oxlint

## Demo

Sign in as `alex@grid150.demo` / `Grid150Demo!` after seeding. Walk Today → overdue reviews → Leaderboard → Join with `FAANG1` (already a member) or create a group on a fresh account. Reviewers should use demo accounts (email confirmation is on for new signups).
