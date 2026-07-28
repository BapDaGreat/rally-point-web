# Rally Point

Mobile-first **court rental + membership** web app (Figma UI/UX).

**MODE:** SHIP · phone browser primary (≤430px shell) · Supabase backend

## Stack
- Vite + React + TypeScript
- Tailwind CSS v4
- React Router
- Supabase Auth + Postgres (optional; demo mode without keys)

## Quick start (demo, no Supabase)
```bash
cd Rally-Point-web
npm install
npm run dev
```
Open the printed localhost URL on desktop or phone.

### Demo logins
| Role   | Email                     | Password   |
|--------|---------------------------|------------|
| Admin  | admin@rallypoint.local    | admin123   |
| Staff  | staff@rallypoint.local    | staff123   |
| Member | member@rallypoint.local   | member123  |

## Connect Supabase
1. Create a project (or use Babap).
2. SQL Editor → run `supabase/migrations/001_rally_point.sql`.
3. Authentication → create users (set `user_metadata.role` to `admin` | `staff` | `member`).
4. Copy URL + anon key:
```bash
cp .env.example .env
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_ANON_KEY=...
```
5. Restart `npm run dev`.

## Screens (from Figma)
- Login
- Member: Home, Pay, Transactions, Notifications, Profile
- Staff: Home, Members, Check-in, Court ops (rent / playing / extend / walk-in)
- Admin: Home (Members / Active / Revenue), Members CRUD, Floor ops, Transactions, Users

## Project notes
- Currency: PHP (`Php 20,040.00` style)
- Desktop: centered phone chrome on dark gradient
- Without env keys the app uses localStorage demo data

## Scripts
- `npm run dev` — local server
- `npm run build` — production build
- `npm run preview` — preview build
