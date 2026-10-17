# Rally Point — Claude Code guide

@AGENTS.md

`AGENTS.md`, imported above, is the shared rulebook for every coding agent in this repo. This file adds what Claude Code needs on top of it: where current information lives, what is still unresolved, and how to use the tools connected to this workspace. If the two disagree, follow `AGENTS.md` and point out the conflict.

## Start of every session

- Run `git status -sb`. Note the branch, whether it is behind or ahead of its remote, and any uncommitted edits. Never revert, move, or tidy changes you did not make.
- If the branch is behind its remote, say so before relying on file paths. Do not pull, merge, rebase, commit, or push unless asked.
- Know which data mode you are in before describing behavior. `npm run dev` runs the seeded browser demo unless a local env file sets both Supabase values. `npm run build:staging` bakes in `.env.staging` and accepts only the staging project pinned in `vite.config.ts`, so its output (and `preview:staging`) talks to hosted staging. Treat using it as a hosted operation.

## Where current information lives

Most of `docs/` is Git-ignored. Only `docs/README.md`, `docs/CODEX.md`, and `docs/HELP-AND-INQUIRY-WORKFLOW.md` are shared, so a fresh clone lacks the rest. If a file is missing, say so instead of guessing what it says.

| Need | Read | Watch out |
| --- | --- | --- |
| Doc index | `docs/README.md` | |
| Product scope and open decisions | `docs/PRD.md` | Local-only. Written at `f8f9fa2` (2026-09-19), before the tenancy and SaaS work. |
| Implementation map | `docs/ARCHITECTURE-ESSENTIALS.md`, `docs/ARCHITECTURE.md` | Same age as the PRD. Confirm against `src/` and `supabase/migrations/`. |
| Feature tracing and PR packet | `docs/CODEX-NAVIGATION-GUIDE.md` | Local-only. Applies to Claude as well as Codex. |
| Club/venue tenancy map | `git show b0a5110:TENANCY-HANDOFF.md` (removed from the working tree) | 2026-09-26 snapshot. Re-check its environment facts. |
| Club/venue design diagrams | `architecture/tenant-ready/README.md` | Proposals. Physical tables are still `members` and `courts`. |
| Tenancy release gates | `docs/TENANT-READY-ROLLOUT.md`, `docs/TENANT-READY-GATE-EVIDENCE.md` | Local-only, dated checkpoints. Not proof of hosted state. |
| Branches, superadmin, commissions (history) | `RALLY-POINT-TENANCY-HANDOFF.pdf` (text source: `scripts/generate_handoff_pdf.py`) | PR #3's handoff, superseded by the club-based platform layer below. Its migration was removed, so its "apply the migration" step no longer applies. |
| Help and inquiries | `docs/HELP-AND-INQUIRY-WORKFLOW.md` | Its migrations were recorded as not applied to any hosted database. |

Never edit, move, or regenerate anything under `docs/release-private/`. Those are frozen release packages, and tests read their files and hashes.

## Current state (checked 2026-10-17; re-verify before relying on it)

- **One tenancy model: clubs and venues.** PR #3's "branches" became clubs. Its migration `20261014000000_multi_tenant_superadmin.sql` could not even apply (55P04, unsafe use of a new enum value) and was removed. It was replaced by `20261017090000_club_context.sql`, `20261017090100_platform_control.sql`, `20261017090200_club_membership.sql`, and `20261017090300_support_sessions.sql`.
- **The active club is request-scoped.** The browser sends `x-club-id` on `/rest/v1/` requests (`src/lib/clubContext.ts`). `private.current_club_id()` uses it for an active club and returns NULL for any other value. Only when the header is absent does it fall back to Rally Point Gensan, which keeps the hash-pinned September suites valid. Access still needs a trusted role in that club; never treat the header as authority. The app replaces every fixed club id with `requireActiveClubId()`.
- **People and clubs.** Membership is per club (`members`); staff and admin come from `club_staff_roles`. `list_my_clubs()` drives the club switcher, and the default club wins when nothing is remembered. Join links are `#/join/<club-slug>`, the TV board is `#/board/tv/<club-slug>`, and sign-up sends `club_slug` only from a join link.
- **Platform superadmins** come only from `platform_roles` (trusted provisioning). They work only through the audited `platform_*` functions. No policy gives them club rows, and `/admin` is admin-only.
- **Support sessions** (first version) let a superadmin open a read-only view of one club. Each view needs a reason, lasts 5–120 minutes, and every open, read and close is logged in `platform_audit_log`.
  - The snapshot shows counts, venues, today's schedule and open inquiry subjects, never member contact details.
  - Superadmins still cannot open club screens or change club data.
- **Logo.** The current artwork says "Gensan", so only Rally Point Gensan shows it. Other clubs and the platform portal show a neutral initials badge (`ClubMark` in `src/components/Shell.tsx`) until they have their own artwork.
- **Commission.** A trigger turns court-time charges (`booking`, `court_rental`, `extension`) into `platform_commissions` rows at the club's rate. Payments are still simulated (`src/lib/payments.ts`), so these are recorded charges, not collected money; real checkout waits on a provider decision and its credentials. While the pause holds, the live ledger stays empty.
- **Staging (2026-10-17, owner-approved)** now has all 21 migrations: tenant enforcement, the two support-inquiry migrations, and the four October 17 club-platform migrations.
  - **How it was applied:**
    - a fresh backup was captured (`scripts/run-staging-backup-capture.mjs`);
    - the backup was restored and verified locally (`scripts/run-staging-backup-restore-verify.mjs`);
    - the package was dry-run on a restored copy;
    - the package (`docs/release-private/club-platform-20261017-r1/`) was applied by `scripts/run-club-platform-staging-apply.mjs`, one transaction per migration.
  - **Isolation checked:** two-club isolation passed on staging (55 checks, rolled back) and over the live API.
  - **Clubs:** staging has two active clubs, Rally Point Gensan and the September `tenant-fixture-second-club`. No platform superadmin exists yet.
  - **Still paused:** the reservation-write pause holds. The frozen resume package no longer matches staging, so a resume needs a new package.
  - **Published site:** the published staging site still runs the earlier build, which keeps working on the Gensan default. This branch's frontend is not published.
  - **Production** is unchanged and stays one club.
  - **Details and evidence:** `docs/TENANT-READY-ROLLOUT.md`; evidence is under `docs/release-private/` (local only).
- **Local SQL** runs through `npx supabase test db` (482 checks in 14 suites as of 2026-10-17). On the plain chain, `null_role_guards` and `tenant_boundary` fail where they call the nine paused RPCs; this predates the multi-club work. With those RPCs temporarily granted in the local database (as `scripts/run-reservation-resume-gate23-local.mjs` does), every suite passes.

## Hosted systems and connected tools

- **Permission prompts.** `.claude/settings.json` makes Claude ask before Supabase write and SQL tools, any Supabase CLI command, `npm run deploy`, `gh-pages`, `git push`, and the database runner scripts. Approving one prompt is not release approval; the rules below still apply.
- **Supabase MCP.** Documentation search is fine. Anything that reaches a project, including read-only SQL, table listings, logs, and advisors, needs an explicit task and a confirmed project ref (staging is pinned in `vite.config.ts`). Release checks fingerprint the database and look for other connected clients, so even a read can spoil evidence. Never use `apply_migration` on staging or production. Migrations reach them only through reviewed release packages, one named migration at a time, never through a blanket `supabase db push` or `--include-all`.
  - On the owner's machine, a local-scope override (`claude mcp add --scope local`) pins the `supabase` server for this repo to staging in read-only mode.
  - That override lives in `~/.claude.json`, not in the repo, so other machines may still connect with write access. The rules above apply either way.
- **Publishing.** `npm run deploy` (the legacy script) publishes `dist` to the `gh-pages` branch, which serves https://zylush.github.io/rally-point-web/, the recorded staging site. Never run it, `git push`, or make any third-party change without explicit approval.
- **Scripts.** Many `scripts/run-*.mjs` and `supabase/verification/*.mjs` files connect to local or hosted databases, and some write. Read the whole script and confirm its target before running it. `scripts/run-migration.mjs` applies only migration `001`.
- **Browser checks.** Use the repo-local Playwright CLI (`npx --no-install playwright cli`) against `npm run dev`, and close the session afterwards. Do not use browser MCP tools (Playwright, Chrome DevTools) for this repo.
- **CodeScene** is wired for Codex only (`.codex/config.toml`). Do not start a CodeScene login.
- **`graphify-out/`**, if present, is a generated snapshot. Check when it was built and confirm its answers against the source.

## Working rules

- For any data change, trace route → page → `api.ts` → both the demo store and the live branch → SQL policy, as `AGENTS.md` requires.
- Keep each file's existing line endings and leave bytes outside your change untouched. Release tooling compares exact bytes.
- Never edit the hash-pinned files: the 15 September migrations, `supabase/seed.sql`, the 8 original SQL suites, and `vitest.config.ts`. `tests/fixtures/reservation-resume-baseline.ts` pins them. Change behaviour with new migrations and new suites instead.
- When a fixture or frozen-inventory test fails, find out why. Do not update hashes or inventories just to make it pass.
- The pgTAP suites in `supabase/tests/database/` need a prepared local Supabase, and the Supabase CLI or `psql` may be missing. Report them as not run rather than implying a pass.
- Report work with the PR diff packet in `docs/CODEX-NAVIGATION-GUIDE.md`: affected roles and routes, data path, boundary impact, checks that actually ran, and what remains unverified.
