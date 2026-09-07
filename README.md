# SRM UI

Web frontend for the [SRM](../srm) scheduler & resource management API.

**Vue 3 · Vuetify 3 · Pinia · Vue Router · Vite**

## Screens

- **Login / Register** — sign in with email + password. If the account belongs to
  more than one company, a **workspace picker** follows; a **company switcher** in
  the nav changes workspaces later. Plus self-service company creation.
- **Schedule** — a **Day** board (per-team columns) and a **Week** view (a
  teams × 7-days matrix with today highlighted). Create, reschedule, re-status,
  and cancel jobs; a double-booking is refused inline, naming the conflicting job.
  Team leaders see only the teams they lead (matching the API's scoping).
- **Teams** — teams with leaders and rosters; add/remove members.
- **Users** — company users with roles and active state.
- **Support** — file bugs/requests and follow the thread.
- **Admin** (platform staff) — cross-company overview and support triage, plus
  **admin tools** to manage any company's users, teams and schedule
  (`/admin/companies/:id`). Support is scoped (non-owners); superadmin does
  everything and additionally gets **Staff** (appoint/revoke support) and
  **Audit** tabs and the suspend-company control. Staff with no company sign in to
  a platform-only session that lands here.

Navigation and controls are gated by the signed-in user's permissions — the same
rules the API enforces, so a hidden button never leads to a 403.

## Quick start

Requires Node 18+ and the [SRM API](../srm) running on `:2020` (`cd ../srm && make seed && make run`).

```bash
npm install
npm run dev          # http://localhost:4100
```

The dev port (4100) is in the API's CORS allowlist out of the box. Point the UI
at a different API with `VITE_API_BASE_URL` (see `.env.example`).

Sign in with a seeded account (all use password `password123`), e.g.
`sam@northwind.example`, or the platform admin `admin@srm.io` to see the admin
panel.

## Structure

```
src/
  main.js              App bootstrap (restores session before mounting)
  plugins/vuetify.js   Theme + icon aliases
  utils/api.js         Fetch wrapper: attaches the JWT, typed ApiError
  stores/              Pinia stores (auth, jobs, teams, users, support, admin)
  router/              Routes + auth/permission guard
  router/views/        One component per screen
  components/          nav-bar, job-dialog, job-status-chip, app-snackbar
```

## Build

```bash
npm run build         # -> dist/
npm run preview
```
