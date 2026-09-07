# SRM UI

Web frontend for the [SRM](https://github.com/ajm6052/srm) scheduler &
resource-management API.

**Vue 3 · Vuetify 3 · Pinia · Vue Router · vue-i18n · Luxon · Vite**

Fully localized in **English and Spanish** with a live language toggle, themed for
light and dark, and updated in real time over a server-sent notification stream.

## Screens

- **Login / Register** — sign in with email + password. If the account belongs to
  more than one company, a **workspace picker** follows; a **company switcher** in
  the nav changes workspaces later. Plus self-service company creation.
- **Schedule** — **Day**, **Week**, and **Month** views, with per-company timezones
  and drag-to-reschedule. Create, reschedule, re-status, and cancel jobs booked to
  a team or an individual; a double-booking is refused inline, naming the
  conflicting job, and unavailable members (off / outside hours) are blocked. Team
  leaders see only the teams they lead (matching the API's scoping).
- **Teams** — teams with leaders and rosters; add/remove members.
- **Users** — company users with roles and active state.
- **Customers** — customers and their sites; jobs are scheduled against them
  (create/edit is owner/admin only).
- **Reports** — jobs by status, team, member, and customer over any window, with
  KPI tiles and **CSV / PDF export**.
- **Permissions** — the role × capability matrix (gated to owners and platform staff).
- **Support** — file bugs/requests and follow the thread.
- **Admin** (platform staff) — cross-company overview and support triage, plus
  **admin tools** to manage any company's users, teams and schedule
  (`/admin/companies/:id`). Support is scoped to its assigned companies;
  superadmin does everything and additionally gets **Staff** (appoint/revoke
  support, scope company access) and **Audit** tabs and the suspend-company
  control. Staff with no company sign in to a platform-only session that lands here.

Navigation and controls are gated by the signed-in user's permissions — the same
rules the API enforces, so a hidden button never leads to a 403. A **notification
bell** in the nav updates live as work changes.

## Quick start

Requires **Node ≥ 18** and **[Yarn](https://classic.yarnpkg.com/) (1.22.x)**, and
the [SRM API](https://github.com/ajm6052/srm) running on `:2020`
(`cd ../srm && make seed && make dev-air`).

```bash
cp .env.example .env       # optional — defaults point at the local API on :2020
yarn install
yarn dev                   # http://localhost:4100
```

The dev port (4100) is in the API's CORS allowlist out of the box. Point the UI at
a different API with `VITE_API_BASE_URL` (see [`.env.example`](.env.example)).

Sign in with a seeded account (all use password `password123`), e.g.
`sam@northwind.example`, or the platform admin `admin@srm.io` to see the admin panel.

## Internationalization

Every screen and message is externalized into message catalogs at
[`src/i18n/en.js`](src/i18n/en.js) and [`src/i18n/es.js`](src/i18n/es.js); the
top-bar toggle switches languages live and persists the choice, and dates/weekday
names follow the selected locale. The two catalogs must stay in lockstep — a CI
check enforces exact key parity:

```bash
node scripts/check-i18n.mjs   # fails if any key is missing from either catalog
```

Adding a language is translation work alone: add `src/i18n/<code>.js` and register
it — no screen changes.

## Structure

```
src/
  main.js              App bootstrap (restores session before mounting)
  plugins/vuetify.js   Theme + icon aliases
  i18n/                en.js / es.js catalogs + setup
  utils/api.js         Fetch wrapper: attaches the JWT, typed ApiError, SSE stream helper
  utils/calendar.js    Timezone-aware date helpers (Luxon)
  stores/              Pinia stores (auth, jobs, teams, users, customers,
                       notifications, reports, support, admin)
  router/              Routes + auth/permission guard
  router/views/        One component per screen
  components/          nav-bar, dialogs, chips, language toggle, snackbar
```

## Scripts

```bash
yarn dev       # start the Vite dev server (:4100)
yarn build     # production build to dist/
yarn preview   # serve the production build locally
```

## CI

[GitHub Actions](.github/workflows/ci.yml) runs on every push and PR: installs with
a frozen lockfile, verifies **EN/ES catalog parity**, and runs the production build.
