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
2. Auth users with `user_metadata.role` = `admin` | `staff` | `member`
3. Link members: `members.user_id` = auth user id (needed for book / open / pass)
4. `.env`:
```env
VITE_SUPABASE_URL=https://YOUR.supabase.co
VITE_SUPABASE_ANON_KEY=your_publishable_key
```
Never put `service_role` in the frontend.

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
