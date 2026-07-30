# Rally Point Gensan

Mobile-first **court rental + membership** web app for pickleball (Figma UI/UX → production).

**Live:** https://bapdagreat.github.io/rally-point-web/

## Stack
Vite · React · TypeScript · Tailwind v4 · HashRouter · Supabase (demo fallback)

## Features
| Area | What’s in |
|------|-----------|
| Auth | Login (member / staff / admin) |
| Member | Book court · Open play · QR pass · Pay · Messages · Profile |
| Staff | Check-in (QR) · Schedule board · Open play · Courts |
| Admin | Home KPIs · Floor ops · Board · Open play · Bookings · Members · Users |
| Public | TV board `/#/board/tv` |
| Brand | Exact Figma `rpg_logo` (RALLY POINT GENSAN) |

## Quick start (demo)
```bash
cd Rally-Point-web
npm install
npm run dev
```
| Role | Email | Password |
|------|-------|----------|
| Admin | admin@rallypoint.local | admin123 |
| Staff | staff@rallypoint.local | staff123 |
| Member | member@rallypoint.local | member123 |

*(Demo only when `.env` has no Supabase keys.)*

## Supabase (live)
1. Run SQL (in order):
   - `supabase/migrations/001_rally_point.sql`
   - `supabase/migrations/002_bookings.sql`
   - `supabase/migrations/003_open_play_qr.sql`
   - `supabase/migrations/004_member_signup.sql`
2. **Members** join themselves on the login page (“Join as member”).
3. **Staff / admin** — create manually in Supabase Auth, then:
   ```sql
   update public.profiles set role = 'admin' where email = 'you@club.com';
   -- or role = 'staff'
   ```
   Do **not** use the public join form for staff/admin.
4. Auth → optional: turn **off** “Confirm email” for instant join, or leave on and members confirm first.
5. `.env`:
```env
VITE_SUPABASE_URL=https://YOUR.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_key
```
Never put `service_role` in the frontend.

## Who sees what
| Role | Access |
|------|--------|
| **Member** | Own home, book court, open play, QR pass, pay, messages, profile. **No** desk ops, all-members list, revenue, user admin. |
| **Staff** | Check-in, schedule board, open-play manage, courts, bookings desk. |
| **Admin** | Everything staff has + members CRUD, floor ops, transactions, user list, KPIs. |


## Deploy (GitHub Pages)
```bash
npm run build
npx gh-pages -d dist
# or: npm run deploy
```
Site: **https://bapdagreat.github.io/rally-point-web/**

## UX rules
- Plain English, large type, ≥52px taps (mixed-age players)
- Phone + desktop layouts
- Exact Figma logo assets in `public/logo.png` + `logo-mark.png`

## Scripts
- `npm run dev` — local
- `npm run build` — production
- `npm run deploy` — build + gh-pages
- `npm run preview` — preview dist
