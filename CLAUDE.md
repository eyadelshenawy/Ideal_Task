# Working rules for this repository

IDEAL Tasks is currently used **internally** at IDEAL for Digital
Transformation. Keep it simple and fit for how the team works today: no
approval chains, escalation hierarchies, auto-assignment, complex org
structures or other process overhead the team doesn't need. Selling the app
may come later; features that would only matter then are added at that
point, when the owner asks.

## 1. Approval before change — mandatory

- **Never change what users see or how the app behaves without approval
  first.** Before writing code for any visible change, describe it in plain
  language and, for anything on screen, show a before/after screenshot.
  Wait for an explicit "yes".
- **Name every side effect.** If a change moves, resizes, renames, hides or
  alters any existing button, filter, field, menu item or default, say so
  by name before starting.
- **Do only what was asked.** No extra improvements, refactors or
  "while I'm here" changes. Suggest them separately and wait.
- **Major changes need their own approval**: framework or library major
  upgrades, database schema changes, removing features, changing defaults,
  security settings. Explain the risk and what the user will notice first.

## 2. Pull requests and merging

- Work on a branch and open a **draft** pull request. Never commit to `main`
  directly.
- **Never merge without the owner's explicit approval for that specific pull
  request**, given after they have seen what it changes.
- Merge using **the PR number returned when the PR was created** — never a
  number that is guessed or assumed. Before merging, fetch the PR and check
  that its title, author and branch match.
- **Never merge Dependabot or any other automated pull request** unless the
  owner asks for that specific one.
- Every user-visible change gets an entry at the top of
  `src/components/WhatsNewModal.tsx`.

## 3. Testing before asking for approval

- `npx tsc --noEmit -p .` and `npx next lint` must be clean.
- `npm run build` must succeed.
- Run the app and check the changed screens in a browser; include
  screenshots in the report.
- Database changes: add a migration in `prisma/migrations/` and confirm it
  applies both to an empty database and to one shaped like production
  (`prisma migrate diff` must come back empty).

## 4. Communicating with the owner

- Reply in Arabic, short and in bullet points.
- Put English words and technical terms on their own line, not mixed into
  an Arabic sentence.
- Avoid jargon; explain with a simple example where needed.
- Ask questions as multiple-choice options.
- Documentation and in-app text use British English.
- Brand colours: dark green `#0A5A46`, light green `#82B478`.
- Any generated file with calculations must include the formulas, not just
  the results.

## 5. Project facts

- Next.js 15 (App Router), React 19, Prisma + PostgreSQL, NextAuth.
- Hosted on Render; deploys automatically when `main` changes. The build
  runs `prisma migrate deploy`.
- Scheduled jobs run from `.github/workflows/` (daily notifications,
  15-minute SLA check, daily backup, keep-warm, monthly clean-ups).
