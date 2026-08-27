"use client";

import { X, Sparkles } from "lucide-react";

// Newest first. Add one entry here whenever a user-facing feature ships —
// same habit as updating guide.html, just a shorter, more visible summary.
const ENTRIES: { title: string; description: string }[] = [
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-2xl w-full max-w-[480px] max-h-[85vh] overflow-y-auto p-5">
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
