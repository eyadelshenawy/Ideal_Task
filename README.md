# IDEAL Tasks

Team task manager for IDEAL for Digital Transformation. Next.js (App Router) +
Prisma + PostgreSQL + NextAuth. Built from
[`IDEAL-Tasks-App-Build-Brief.md`](./IDEAL-Tasks-App-Build-Brief.md), using
[`ideal-tasks.jsx`](./ideal-tasks.jsx) (a Claude.ai sandbox prototype) as the UI/
behavior reference.

## Features

- Real accounts (email + password), Admin/Member roles enforced server-side on
  every write — not just hidden buttons.
- Board (Kanban), List, and Timeline (Gantt with dependency arrows, milestones,
  progress fill, today marker) views, with filters/search/sort and a stats bar.
- Task dependencies, blocked-task indicator, milestones.
- Team management (admin): add member (temp password), rename, activate/
  deactivate, promote/demote admin, reset password.
- Projects management (admin): add / rename / delete.
- Excel import (admin): downloadable template, preview before committing.
- IDEAL branding (`#0A5A46` dark green / `#82B478` light green).

### Not built (see brief §7/§3 — later or explicitly out of scope)

Excel/CSV export, activity log, email notifications, comments, native mobile,
real-time sync, SSO, drag-to-resize Gantt bars.

### One deliberate deviation from the prototype

The prototype auto-creates a new "team member" from an unrecognized name in an
Excel import. This app can't do that: a real account needs a real email + login,
which a spreadsheet cell can't provide. Unmatched assignee names are left
unassigned with a warning in the import preview instead — add the person via
Team Management and re-import if needed. Unmatched **project** names are still
auto-created (no login implications there), same as the prototype.

## Local setup

1. Install [Node.js LTS](https://nodejs.org) (20.x or later) if you don't have it.
2. Get a PostgreSQL database — see [Database](#database) below.
3. Copy `.env.example` to `.env` and fill in `DATABASE_URL` and a `NEXTAUTH_SECRET`
   (`openssl rand -base64 32`, or any random 32+ character string).
4. Install dependencies and set up the database:

   ```bash
   npm install
   npx prisma migrate dev
   npx prisma db seed
   ```

   The seed step prints a temporary password for the bootstrap admin account
   (`eyadelshenawy@gmail.com`) — copy it, you'll need it to log in the first time.
   It also seeds the 9 default projects from the prototype's client list.
5. Run the app:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000, log in with the bootstrap admin email + the temp
   password, and set a real password when prompted. From there, add the rest of
   the team from the Team screen (top-right, admin only) — each new member gets
   their own temp password shown once to hand off.

## Database

Postgres is required — Render's free web service has no persistent disk, so
SQLite would be wiped on every restart/deploy.

Easiest option for both local dev and production: create one free Postgres
instance on Render and point `DATABASE_URL` at its **External Database URL**
locally, and its internal URL once deployed (the blueprint below wires this up
automatically for the deployed app).

**Render's free Postgres plan expires 30 days after creation** and is deleted
unless upgraded to a paid plan. For a small internal tool this is worth budgeting
for — either upgrade before the 30 days are up, or plan to migrate the data to a
fresh instance (`pg_dump` / `pg_restore`).

## Deploying to Render

1. Push this repository to GitHub.
2. In Render: **New → Blueprint**, point it at the repo. `render.yaml` in this
   repo defines the web service and the Postgres database together — Render will
   create both and wire `DATABASE_URL` automatically.
3. Set `NEXTAUTH_URL` in the web service's environment to its public Render URL
   (e.g. `https://ideal-tasks-app.onrender.com`) — `render.yaml` leaves this one
   for you to fill in since it isn't known until the service exists.
4. On first deploy, the build step runs `prisma migrate deploy` automatically —
   the schema is created for you. Run the seed once, either from the Render shell
   or by temporarily running `npx prisma db seed` locally against the deployed
   `DATABASE_URL`, to create the bootstrap admin.
5. Every push to the main branch redeploys automatically. Free web services sleep
   after inactivity — the first request after idle time takes ~10–30 seconds to
   wake up, which is fine for a 9-person internal tool.

If you'd rather not use the blueprint, the same steps work manually: New → Web
Service (build command `npm install && npx prisma generate && npx prisma migrate
deploy && npm run build`, start command `npm run start`) plus a separate New →
PostgreSQL, with `DATABASE_URL` copied into the web service's env vars by hand.

## Notes

- Only Admins can create tasks, projects, and team members — enforced server-side
  in every API route (see `src/lib/permissions.ts`), not just hidden in the UI.
- Members can update a task's status and progress; only Admins can edit the rest
  (title, dates, assignee, priority, project, dependencies) — this is an
  interpretation of a slightly ambiguous line in the brief, see the plan notes.
- New member accounts are created by an Admin with a temporary password; the
  member sets their own password on first login. There's no public sign-up page.
  Password resets work the same way (admin-issued temp password) — no email
  service is configured.
