# Rally Point — AGENTS.md

## Product
Court rental + membership club web app for **phone browsers**. Roles: member, staff, admin. Currency PHP.

## Stack
Vite · React · TS · Tailwind v4 · React Router · Supabase (demo fallback via `src/lib/demoStore.ts`)

## Non-negotiables
- Mobile-first: max content width ~430px (`.app-shell`)
- Touch targets ≥48px (prefer 52–56px)
- Bottom nav per role
- No secrets in repo; use `.env` for Supabase
- Prefer demo mode when keys missing — never crash on empty env
- **Age-diverse players:** plain English, large type, high contrast, familiar words at a glance (no jargon)

## Key paths
- `src/pages/*` — screens
- `src/lib/api.ts` — data access (demo | supabase)
- `supabase/migrations/001_rally_point.sql` — schema + RLS
- Design source: Figma UI/UX file + whiteboard (client)

## Skills
- whatdaylewoulddo (density, verify live)
- senior-ux-ui-architect
- mobile-responsive-dashboard-audit
- ship-vs-learn
