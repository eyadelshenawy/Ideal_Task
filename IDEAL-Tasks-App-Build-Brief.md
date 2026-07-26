# IDEAL Tasks App — Build Brief for Claude Code

This is the starting brief for turning the Claude.ai prototype into a real, multi-user
app with genuine accounts and enforced permissions. Hand this file directly to
Claude Code and ask it to scaffold the project from here.

## 1. What this is

A task management web app for **IDEAL for Digital Transformation**. It replaces the
in-chat prototype's "pick your name from a dropdown" convention with real accounts,
so permissions are actually enforced by the server — not just hidden in the UI.

## 2. Goals

- Real login — every team member has their own account (email + password is enough).
- Server-enforced roles: only Admins can create tasks, projects, and team members.
  This must be checked in backend code, not just hidden in the UI.
- Same feature set as the working prototype: Board / List / Timeline views,
  task dependencies, milestones, progress tracking, Excel import.
- Deployable on a free or near-free hosting plan suited to a 9-person internal tool.

## 3. Non-goals for v1

- Native mobile app — a responsive web app is enough.
- Real-time multi-user sync — a page refresh to see others' changes is acceptable.
- SSO / enterprise auth — plain email + password is enough for 9 people.
- Drag-to-resize Gantt bars — editing dates via a form is enough.

## 4. Users & roles

- **Admin** (Eyad and Esraa by default, configurable later): create/edit/delete
  tasks, create/edit/delete projects, add/manage team members, import from Excel.
- **Member** (everyone else): view everything, update status and progress on any
  task, cannot create tasks/projects/team members.
- Roles are stored per user in the database and checked on every write request
  server-side, not just by hiding buttons in the UI.

## 5. Data model

**User**
- id, name, email, passwordHash, role (`admin` | `member`), active (bool)

**Project**
- id, name

**Task**
- id, code (free text, e.g. "IDT-001"), title, description
- projectId (nullable), assigneeId (nullable)
- priority (`high` | `medium` | `low`)
- status (`todo` | `inprogress` | `review` | `done`)
- startDate, dueDate (nullable dates)
- progress (0–100)
- isMilestone (bool)
- dependsOn (array of task ids — predecessor tasks)
- createdBy, createdAt, updatedAt

## 6. Features — P0 (must have)

- Auth: sign up, log in, log out, password reset
- Board view (Kanban) with status columns; move tasks between statuses
- List view with filters (assignee, priority, project, search) and sorting
- Timeline / Gantt view: bars from start to due date, dependency arrows between
  tasks, milestone markers (diamond, single date), progress fill inside each bar,
  a "today" marker line
- Team management screen (admin-only): add member, rename, activate/deactivate,
  promote/demote admin
- Projects management screen (admin-only): add / rename / delete project
- Excel import (admin-only): downloadable template, parses uploaded file, shows a
  preview of what will be created before committing
- IDEAL branding: dark green `#0A5A46`, light green `#82B478`, company name in the header

## 7. Features — P1 (nice to have, later)

- Export the current task list back to Excel/CSV
- Activity log (who changed what, and when)
- Email notification when a task becomes overdue or gets assigned
- Comments on a task

## 8. Suggested tech stack

- **Framework**: Next.js (React) — one codebase for frontend and backend
- **Database**: PostgreSQL
- **Auth**: NextAuth.js (Credentials provider) or Supabase Auth
- **ORM**: Prisma
- **Hosting**: Render — free web service + free PostgreSQL instance, no credit
  card required (see deployment steps below)

## 9. Deployment (free hosting on Render)

1. Push the project to a GitHub repository.
2. Create a free Render account → **New** → **Web Service** → connect the repo.
3. Add a free PostgreSQL instance on Render and copy its connection string into
   the app's environment variables.
4. Render redeploys automatically on every push to the main branch.
5. Note: free Render web services sleep after inactivity — the first visit after
   idle time takes roughly 10–30 seconds to wake up. This is fine for a 9-person
   internal tool, but worth knowing about in advance.

## 10. How to use this brief with Claude Code

1. Install Claude Code and open a terminal in an empty project folder.
2. Run `claude`.
3. Say: *"Read IDEAL-Tasks-App-Build-Brief.md and scaffold the project from it,
   starting with authentication."*
4. Suggested build order: auth → task CRUD + database → Board/List views →
   Timeline view → Excel import → polish/branding.
5. Ask Claude Code to commit to Git after each working phase, so you can always
   roll back if something breaks.
