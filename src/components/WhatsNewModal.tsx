"use client";

import { X, Sparkles } from "lucide-react";

// Newest first. Add one entry here whenever a user-facing feature ships —
// same habit as updating guide.html, just a shorter, more visible summary.
const ENTRIES: { title: string; description: string }[] = [
  {
    title: "Overdue counts working days only",
    description: "Weekends and holidays (Settings → Work calendar) no longer count towards overdue. Days overdue = working days after the due date up to today, and a task is overdue once that reaches 1 — so a task due on Thursday isn't overdue on Friday or Saturday and shows 1d overdue on Sunday. The same rule applies to the badge on cards, the Overdue count and filter, Needs attention, Reports (including overdue % in Team performance), the client report and the weekly email. \"Due in 2d\" and the 3-day high-priority list also count working days. The daily overdue and due-soon emails are no longer sent on weekends or holidays; the due-soon reminder now goes out on the last working day before the due date.",
  },
  {
    title: "Fewer tabs, a Select button and a simpler My Tasks",
    description: "Needs attention is now a red button in List's filter bar (with a count) instead of its own tab — click it for the same overdue and due-soon high-priority lists, click again to go back. Selecting several tasks starts from a Select button next to the filters on Board and List, instead of the icon in the green bar. My Tasks has three columns — To do, Doing and Done — and its Status field the same three. In Reports, Overview keeps the overall numbers, projects and team workload; time logged per person moved to Time & billing, the SLA summary to SLA & speed, and Customer satisfaction to Quality.",
  },
  {
    title: "Nine new reports, with an Excel export that keeps the formulas",
    description: "Reports now has tabs. Customers: tickets per customer per month, and the top 5 modules and categories problems come from. SLA & speed: resolution SLA met % per customer per month, average response and resolution time per priority, and the age of open tickets. Team: closed per person, average resolution and overdue %. Time & billing: hours logged per customer per month. Quality: opened vs closed per week and the reopened rate. Pick a period (3, 6 or 12 months) and projects; each card shows its formula, and Export to Excel downloads all nine with real Excel formulas for every total, average and percentage. The original reports are on the Overview tab.",
  },
  {
    title: "One Settings window and a simpler top bar",
    description: "Every admin screen — Team, Contacts, Projects, Ticket Categories, Lists, Checklist Templates, Work Calendar, Security Policy, Audit Log and Trash — now opens inside one Settings window (⋯ menu → Settings), picked from the list on its left. Each screen works exactly as before, and you only see the ones your role allows. The ⋯ menu is down to User Guide, What's New, Settings and the Excel options. Your name and the Log out button moved into the circle with your initials at the top right, together with Two-factor (MFA). On a phone the top bar now fits on one row.",
  },
  {
    title: "A cleaner Timeline with Days and Weeks",
    description: "The Timeline drops the day-by-day grid lines (weekends are still lightly shaded), uses slimmer rows, and shows the assignees' initials beside each bar. It now opens scrolled to today, with a Today button to jump back. A new Days / Weeks switch shows one column per week, so a long project fits on one screen. Clicking a bar or a task name still opens the task, and dependency arrows are unchanged.",
  },
  {
    title: "A cleaner List view and filter bar",
    description: "List rows now read in one line: project, modules, category, tags, subtasks and comment/file/checklist counts are plain grey text beside the title, status, SLA and due date line up in columns, and progress is a thin line along the bottom of each row. On a computer, the Edit, Duplicate and Delete icons appear when the mouse is over a row. Above the List and Board, the count cards are smaller, and Priorities, Types, Categories and Modules moved under a new More filters button (a number on it shows how many of them are in use). Group, Compact and Save sit at the right.",
  },
  {
    title: "User Guide shows the new cards and task form",
    description: "The User Guide (⋯ menu → User Guide) now has fresh screenshots and text for the simpler Board cards, the tabbed task form with More options, and automatic ticket codes.",
  },
  {
    title: "Ticket codes are now assigned automatically and can't be changed",
    description: "When you save a new ticket, the app gives it the next number for its project (e.g. APEX-0008), or the next subtask number under its parent (e.g. APEX-0001-03). The Code field shows the expected number greyed out. Once saved, a ticket's code stays fixed — only a Super Admin can change it, and so only a Super Admin can move a ticket to another project or under a different parent (both change the code). To record a customer's own reference number, add it as a tag.",
  },
  {
    title: "A shorter, tidier task form",
    description: "Opening a task now shows its title and code at the top, with tabs for Details, Checklist, Time, Files and Comments instead of one long page. Status, progress and the SLA countdown sit together at the top of Details (click the SLA tag for the response and resolve times). Priority shows on its own, with Impact × Urgency one click away under \"change\". Assignees are picked from a drop-down and shown as names you can remove. Less-used settings — code, tags, milestone, repeat, depends on, parent task and duplicate — are folded under More options. A new task opens on the same Details layout. Nothing was removed: every field is still there.",
  },
  {
    title: "Cleaner ticket cards on the Board",
    description: "Board cards are simpler to read. The ticket code sits on its own line with the full title underneath. Only the ticket type, SLA countdown and Blocked keep a coloured tag; project, modules, category, tags and subtask info share one grey line. Comment, attachment and checklist counts moved to the bottom line beside the due date. On a computer, the Edit, Duplicate and Delete icons appear when the mouse is over a card, and the ‹ › arrows are hidden — drag the card to change its status. On a phone or tablet, the icons and arrows stay visible as before.",
  },
  {
    title: "Super Admins can switch off a member's two-factor sign-in",
    description: "If someone loses the phone with their Authenticator app, a Super Admin can now help: in Manage Team, a shield-off icon appears next to anyone using two-factor sign-in. Click it twice to confirm and that member can sign in with just their password, then set two-factor up again on their new phone. It's recorded in the Audit Log.",
  },
  {
    title: "Excel template no longer triggers a module warning",
    description: "The sample rows in Download Excel Template used a made-up module name (\"Billing\") that isn't in the Modules list, so importing the template unchanged showed a warning. The sample now leaves Module empty.",
  },
  {
    title: "User Guide brought up to date",
    description: "The User Guide (⋯ menu → User Guide) now covers everything added recently — two-factor sign-in, automatic sign-out and password rules, ticket types and the Impact × Urgency matrix, categories, the SLA countdown, customer satisfaction ratings, multi-select filters, and the new Lists, Ticket Categories, Work Calendar and Security Policy screens — with fresh screenshots throughout.",
  },
  {
    title: "Modules, ticket types and priority names are now editable lists",
    description: "Super Admins have a new Admin menu → Lists screen with three tabs. Modules: the list starts from every module already typed on a task, with how many tasks use each, so you can tidy it first — rename one (every task using it changes too; renaming to a name already in the list merges the two), hide one, or add a new one. Ticket Types: rename, change the short tag and colour, hide, or add a new type (Task, Incident and Service Request can't be hidden). Priorities: change the name shown and the colour. Hiding only removes an entry from the drop-downs — tickets that already have it keep it. In a task, Module is now picked from the list instead of typed, and the bulk Module change works the same way. Excel import matches modules against the list; unknown ones are reported in the preview and left empty.",
  },
  {
    title: "Pick more than one value in every filter",
    description: "Assignees, Priorities, Projects, Types and Categories now work like Statuses and Modules: click the filter, tick as many values as you need (for example Critical + High, or two projects together), and the list shows tasks matching any of them. The button shows the name when one value is picked, or a count when several are, and each list has a Clear link. Filters you saved earlier keep working.",
  },
  {
    title: "Filter by status, clickable stat cards, Done hidden on every visit",
    description: "A new \"All Statuses\" filter next to Modules lets you show one or several statuses (To Do, In Progress, Internal Test, Done, …). The In Progress and Done cards at the top now work as one-click filters too (click again to clear), and the Total card clears the status, Overdue and Milestones filters in one go. Picking Done in the status filter shows Done tasks even while Hide Done is on. Hide Done is now switched on every time you open the app; turning it off only lasts until you leave.",
  },
  {
    title: "Audit Log filters, categories in Excel import, security updates",
    description: "The Audit Log now has a search box, a person filter and a date range, and shows how many entries match. Excel import reads Category and Subcategory columns (matched by name against Ticket Categories; unknown names are reported in the preview and left empty), and Excel export now writes them as two separate columns so an export can be imported straight back. Behind the scenes the app moved to the latest Next.js 15 release to close known security holes, the unused image-processing endpoint is switched off, and the old Excel library with unfixed vulnerabilities was replaced — .xlsx and .csv files are supported; older .xls files need saving as .xlsx first.",
  },
  {
    title: "Customer satisfaction rating + faster SLA warnings",
    description: "When a customer ticket in an SLA-tracked project is marked Done for the first time, the customer gets one email asking them to rate how it was handled from 1 to 5 stars — one click records the answer, and they can add a comment. The rating appears in the ticket's activity, assignees get a notification, and Reports has a new Customer satisfaction section with the average score, response rate, per-project averages and the latest comments. Separately, SLA warnings (\"only a quarter of the time left\") are now checked every 15 minutes during working hours instead of once a day, so short deadlines such as a 4-hour Critical response get warned in time.",
  },
  {
    title: "Help desk: ticket types, Impact × Urgency priority, categories and a live SLA timer",
    description: "Every task now has a Type — Task (the default, so nothing changes for project work), Incident, Service Request, Change Request or Problem — shown as a short coloured tag (INC, SR, CHG, PRB) on cards and rows, with a new \"All Types\" filter. Instead of guessing a priority, pick Impact (who is affected) and Urgency (how soon it's needed) and the priority fills itself in from the standard matrix (e.g. High impact + High urgency = Critical); you can still change it by hand. Tickets can also carry a Category and Subcategory from one shared list that Super Admins manage in Admin menu → Ticket Categories (starter list included), with an \"All Categories\" filter. In SLA-tracked projects each open ticket now shows a countdown chip (\"Respond in 2h\", \"Resolve in 1d 4h\" or \"SLA breached\") and an SLA panel inside the ticket. Each project can now choose whether its SLA clock runs 24/7 or only during working hours (Manage Projects → \"Working hours only\"); working hours and time zone are set in Work Calendar. The customer ticket form now asks what they need, who is affected and how urgent it is, and works out the priority itself. Excel export includes Type, Impact, Urgency and Category; Excel import reads a Type column.",
  },
  {
    title: "Security: two-factor sign-in, auto sign-out, stronger passwords",
    description: "You can now protect your account with an Authenticator app (Admin menu → Two-factor (MFA)): scan the QR code once, then sign-in asks for a 6-digit code, with an option to trust a device for 30 days. Wrong codes count towards the same 5-attempt lockout as wrong passwords. You're signed out automatically after 15 minutes without activity, with a one-minute warning and a \"Stay signed in\" button. New passwords need at least 8 characters with an uppercase letter, a number and a symbol, can't repeat the current one, and expire after 90 days. Super Admins can change all of these in Admin menu → Security Policy. The Audit Log now also records tickets moved to or restored from Trash, two-factor changes and password changes.",
  },
  {
    title: "Parent-task date rollup, dependency conflict warnings, Recurring keeps Duration, Clone carries the SLA config",
    description: "Four connected upgrades to the scheduling model. Parent tasks now roll their date span up from their subtasks — the parent's Start / Due / Duration automatically become the earliest child start through the latest child due. Manual edits to a parent still stick, but the next child change recomputes on top. Any task whose Start Date lands before one of its predecessors' Due Dates now shows a small ⚠️ Dep chip on the card and the row, with a banner in the Task modal showing which predecessor is the blocker (and the same chip cascades onto anything further downstream that's blocked by that same chain). Recurring tasks now carry Duration onto every next occurrence — a weekly 3-day task stays 3 days each time. And cloning a project (including template clones) now copies the source project's per-project SLA targets along with the shape, so an Onboarding or Support template doesn't quietly reset to org defaults.",
  },
  {
    title: "New Critical priority + SLA-driven Duration auto-fill",
    description: "Tasks now have a Critical priority level above High — for anything that has to be resolved right away. Defaults: Critical 4h response / 2 days resolution, High 24h / 4 days, Medium 48h / 7 days, Low 72h / 10 days. Change these per project in Manage Projects → SLA targets, or org-wide in Reports → Default SLA. On top of that, when you create a task in an SLA-tracked project and pick a priority, Duration is now pre-filled from that project's SLA resolution days — so the Due Date computes itself from your Start Date without extra typing. Changing the priority later always rewrites Duration (a Low task escalated to Critical MUST tighten the deadline). Typing your own Duration keeps it until the priority changes again.",
  },
  {
    title: "Duration on a task — the app fills in the missing side of Start / Duration / Due",
    description: "Every task now has a Duration field alongside Start and Due Date. Enter any two of the three and the app computes the missing one on save — skipping weekends and any dates in the new Work Calendar (Admin menu → Work Calendar), where a Super Admin sets which weekdays count as working days and lists holidays your team observes. Cloning a template also honors the calendar: dates shift by working days from your new start, so a clone that would have landed on a Friday is pushed to the next working day automatically. Excel import and export both pick up the new Duration column. Only Super Admins and Project Admins can edit dates or duration — everyone else still just moves status and progress.",
  },
  {
    title: "Cloning a project keeps its task codes and dependencies",
    description: "When you clone a template into a fresh project, task codes now carry their author's readable suffix onto the new prefix — a source task coded ONBOARD-W1 becomes ADEL-W1 under a new project coded ADEL, instead of being renumbered. Dependencies (\"Week 2 waits for Week 1\") also survive the clone now, remapped to the new tasks — so a template's sequencing works as designed on the first hire and every hire after.",
  },
  {
    title: "Templates — keep reusable project shapes out of the Dashboard",
    description: "Any project can now be flagged as a Template (Projects → \"Mark as template\"). A template disappears from the Dashboard and its task lists, and only shows up in a dedicated Templates section inside the Projects modal. Perfect for onboarding checklists, training paths, or any \"stamp out a fresh copy per client\" workflow — clone it from there, dates shift to the new start date, and the working project is a real one on your Dashboard.",
  },
  {
    title: "Cleaner share-link privacy + a nudge if notifications are off",
    description: "Two safety tweaks: on the project share link, only files your team explicitly shared with the customer (via Email customer or a customer reply) are downloadable now — internal-only uploads stay hidden. And if your browser has notifications turned off, a small banner nudges you to re-enable them so you stop missing pings about assignments and customer replies. Dismiss it and it stays quiet for a week.",
  },
  {
    title: "More fields you can bulk-edit at once",
    description: "The bulk action bar (visible when you multi-select tasks) now covers priority, start/due dates, progress %, module, and adding or removing a tag — plus a quick \"Mark Done\" shortcut. All hidden behind a compact \"More…\" popover so the bar stays tidy. In Trash, you can tick multiple tasks and restore them together instead of one-by-one.",
  },
  {
    title: "Customers can comment from the project tracking link",
    description: "The project tracking link a customer opens now lets them add a comment on any specific ticket — no need to wait for you to email them first. They type their name once and can send. And any internal comments your team writes on a ticket now stay internal on that view — only messages sent via \"Email customer\" (and customer replies) appear in the customer's thread.",
  },
  {
    title: "Log time in bulk",
    description: "New \"Log in bulk\" button in Reports opens a modal where you can enter many time entries at once — one row per task/date/hours — instead of opening every task one by one. Handy after a busy week that didn't get logged in real time.",
  },
  {
    title: "Log or edit time on behalf of someone else",
    description: "Super Admins and Project Managers can now pick who a time entry is for when logging (drop-down next to hours/date), and can edit or re-assign anyone's existing entry. Everyone else still logs and edits their own only.",
  },
  {
    title: "Reset a leaked tracking link",
    description: "If a customer's tracking link ends up in the wrong hands, Super Admins can hit \"Reset link\" in the Email customer box to invalidate the old one on the spot, then send a fresh email to hand out the new one.",
  },
  {
    title: "Dashboard numbers follow your filters",
    description: "The five stat cards at the top of the dashboard now reflect whatever project, assignee, priority, module, or search you've filtered by — not the whole workspace.",
  },
  {
    title: "Attachments both ways in Email customer",
    description: "Both your team and the customer can now attach files to any message — as many as you like, up to 10MB each and 25MB combined. Files show as clickable download links right inside the conversation thread.",
  },
  {
    title: "Conversation thread on the tracking page",
    description: "The customer's tracking link now shows the back-and-forth of messages between them and your team, so they see what was said before they reply.",
  },
  {
    title: "Email the customer, right from the task",
    description: "New \"Email customer\" button sends them the task code, title, and a tracking link, and logs it as a comment. They can reply from that same tracking page — no account needed — and your team gets notified. Also send to extra addresses (comma-separated) for tasks with no contact on file yet.",
  },
  {
    title: "Delete a comment",
    description: "You can now remove your own comments (or any comment, if you're a Super Admin) straight from a task.",
  },
  {
    title: "Cleaner Excel exports",
    description: "Comments now export as real multi-line cells instead of one squished line, and activity log entries are left out of the export.",
  },
  {
    title: "Shorter, easier-to-open public links",
    description: "Ticket, tracking, and status links are now much shorter, and each one can be added to a phone or desktop home screen as its own icon.",
  },
  {
    title: "Contacts scoped to a project",
    description: "External contacts now belong to a single project, so people from one client no longer show up when assigning another client's tasks.",
  },
  {
    title: "Proactive SLA warnings",
    description: "For SLA-tracked projects, you now get an email before a response or resolution deadline is missed — not just after.",
  },
  {
    title: "Printable client report",
    description: "Generate a clean, print-ready project status report for a client, with an optional date range.",
  },
];

export default function WhatsNewModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-none sm:max-w-[480px] h-full sm:h-auto max-h-none sm:max-h-[85vh] overflow-y-auto p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-1.5 font-bold text-[16px] text-brand-text">
            <Sparkles size={16} className="text-brand-dark" /> What&apos;s New
          </h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          {ENTRIES.map((e, i) => (
            <div key={i} className="border-b border-brand-border pb-3 last:border-0 last:pb-0">
              <div className="text-[13px] font-semibold text-brand-text mb-0.5">{e.title}</div>
              <div className="text-[12px] text-brand-sub leading-relaxed">{e.description}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
