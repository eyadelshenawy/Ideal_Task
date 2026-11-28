import type { Prisma, Status } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STATUSES } from "@/lib/taskHelpers";
import { CLOSE_REASONS } from "@/lib/closeReason";
import { utcToDateStr } from "@/lib/serverDates";
import type { McpCaller } from "./tokens";
import { deckSchema, buildReportDeck } from "./reportDeck";
import { sendEmail } from "@/lib/email";

// Tools for the MCP server at /api/mcp. Nothing here writes to a task. The
// only tool with an effect is send_report, which emails a PowerPoint built
// by IDT Desk to the addresses saved for that project — never anywhere else. Every tool that returns tickets works on ONE project, and only on a
// project linked to the caller's token, so two clients' data never mix.
//
// The same tasks are left out as everywhere else in the app: private tasks,
// tasks in Trash and tasks on hold. Tasks with no project are never returned.

const LIST_LIMIT = 1000;
const CHANGES_LIMIT = 5000;

export class ToolError extends Error {
  constructor(message: string, public outcome: "invalid" | "denied" | "not_found" | "error") {
    super(message);
  }
}

export interface ToolResult {
  data: unknown;
  resultCount: number;
  projectCode?: string;
  ticketCode?: string;
}

const statusLabel = (s: Status) => STATUSES.find((x) => x.id === s)?.label ?? s;
const closeLabel = (r: string | null) => (r ? CLOSE_REASONS.find((x) => x.id === r)?.label ?? r : null);

const baseWhere: Prisma.TaskWhereInput = { deletedAt: null, isPrivate: false, onHoldAt: null };

function str(args: Record<string, unknown>, key: string, required: boolean): string | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === "") {
    if (required) throw new ToolError(`"${key}" is required`, "invalid");
    return undefined;
  }
  if (typeof v !== "string" || v.length > 100) throw new ToolError(`"${key}" must be a short text value`, "invalid");
  return v.trim();
}

function parseSince(value: string, key: string): Date {
  const ok = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2})?)?$/.test(value);
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);
  if (!ok || Number.isNaN(d.getTime())) throw new ToolError(`"${key}" must be a date like 2026-11-01 or 2026-11-01T09:00:00Z`, "invalid");
  return d;
}

function parseStatus(value: string): Status {
  const v = value.toLowerCase().replace(/[\s_-]/g, "");
  const hit = STATUSES.find((s) => s.id.toLowerCase().replace(/_/g, "") === v || s.label.toLowerCase().replace(/\s/g, "") === v);
  if (!hit) throw new ToolError(`Unknown status "${value}". Use one of: ${STATUSES.map((s) => s.label).join(", ")}`, "invalid");
  return hit.id;
}

/** The one project a call is about — only if this token may read it. */
function projectFor(caller: McpCaller, code: string) {
  const p = caller.projects.find((x) => x.code.toLowerCase() === code.toLowerCase());
  // Same answer whether the project doesn't exist or isn't on this token,
  // so a token can't be used to find out which other clients exist.
  if (!p) throw new ToolError(`Project "${code}" was not found or this token can't read it. Call list_projects to see the projects you can read.`, "denied");
  return p;
}

function owners(t: { assignees: { name: string }[]; contactAssignees: { name: string }[] }): string[] {
  return [...t.assignees.map((a) => a.name), ...t.contactAssignees.map((c) => c.name)];
}

export const TOOL_DEFINITIONS: { name: string; [key: string]: unknown }[] = [
  {
    name: "list_projects",
    title: "List projects",
    description: "Lists the IDT Desk projects this token can read (code and name). Use a project's code in the other tools.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_tickets",
    title: "List tickets in a project",
    description:
      `Lists the tickets of ONE project: code, title, status, area (module), owner (assignees), created, due and closed date. ` +
      `Optional filters: status (${STATUSES.map((s) => s.label).join(", ")}) and updated_since (a date). At most ${LIST_LIMIT} tickets, ordered by code.`,
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project code, e.g. ABM" },
        status: { type: "string", description: "Only tickets in this status, e.g. In Progress or Done" },
        updated_since: { type: "string", description: "Only tickets changed on or after this date, e.g. 2026-11-01" },
      },
      required: ["project"],
      additionalProperties: false,
    },
  },
  {
    name: "get_ticket",
    title: "Get one ticket",
    description: "Full details of one ticket by its code (e.g. ABM-0041), with its comments, oldest first.",
    inputSchema: {
      type: "object",
      properties: { code: { type: "string", description: "Ticket code, e.g. ABM-0041" } },
      required: ["code"],
      additionalProperties: false,
    },
  },
  {
    name: "get_status_changes",
    title: "Status changes in a project",
    description:
      `Every status change of the tickets in ONE project since a date, oldest first: ticket code, from status, to status and when. ` +
      `"from" is empty for the status a ticket was created in. At most ${CHANGES_LIMIT} rows.`,
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project code, e.g. ABM" },
        since: { type: "string", description: "Changes on or after this date, e.g. 2026-11-01" },
      },
      required: ["project", "since"],
      additionalProperties: false,
    },
  },
].map((t) => ({ ...t, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));

const textList = (max: number) => ({ type: "array", items: { type: "string" }, maxItems: max });

TOOL_DEFINITIONS.push({
  name: "send_report",
  title: "Email a PowerPoint report",
  description:
    "Builds a PowerPoint in IDEAL colours from the slide content you give and emails it, from IDT Desk's own address, to the report " +
    "recipients saved for ONE project in IDT Desk (Settings → MCP access → Report emails). You can't choose or see the addresses. " +
    "At most one report per project every 20 hours. Show formulas next to calculated figures (kpis[].formula). Use British English.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string", description: "Project code, e.g. ABM" },
      subject: { type: "string", maxLength: 120, description: "Email subject" },
      summary: { type: "string", maxLength: 3000, description: "Short plain-text message for the email body (paragraphs separated by blank lines)" },
      deck: {
        type: "object",
        description: "The slides. A cover slide with title, subtitle and today's date is added automatically.",
        properties: {
          title: { type: "string", maxLength: 90 },
          subtitle: { type: "string", maxLength: 140 },
          slides: {
            type: "array",
            maxItems: 20,
            items: {
              type: "object",
              properties: {
                title: { type: "string", maxLength: 90 },
                kpis: {
                  type: "array", maxItems: 6,
                  items: {
                    type: "object",
                    properties: { label: { type: "string" }, value: { type: "string" }, formula: { type: "string", description: "e.g. Resolved ÷ Received = 18 ÷ 20" } },
                    required: ["label", "value"],
                  },
                },
                bullets: textList(10),
                table: {
                  type: "object",
                  properties: { headers: textList(8), rows: { type: "array", maxItems: 20, items: textList(8) } },
                  required: ["headers", "rows"],
                },
                chart: {
                  type: "object",
                  properties: {
                    type: { type: "string", enum: ["bar", "line", "pie"] },
                    categories: textList(24),
                    series: {
                      type: "array", maxItems: 4,
                      items: { type: "object", properties: { name: { type: "string" }, values: { type: "array", items: { type: "number" } } }, required: ["name", "values"] },
                    },
                  },
                  required: ["type", "categories", "series"],
                },
                note: { type: "string", maxLength: 300 },
              },
              required: ["title"],
            },
          },
        },
        required: ["title", "slides"],
      },
    },
    required: ["project", "subject", "summary", "deck"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
});

const SEND_GAP_MS = 20 * 60 * 60 * 1000;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

async function sendReport(args: Record<string, unknown>, caller: McpCaller): Promise<ToolResult> {
  const project = projectFor(caller, str(args, "project", true)!);
  const subject = typeof args.subject === "string" ? args.subject.replace(/[\r\n]+/g, " ").trim().slice(0, 120) : "";
  const summary = typeof args.summary === "string" ? args.summary.trim() : "";
  if (!subject) throw new ToolError('"subject" is required', "invalid");
  if (!summary || summary.length > 3000) throw new ToolError('"summary" is required and must be at most 3,000 characters', "invalid");
  const parsed = deckSchema.safeParse(args.deck);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new ToolError(`"deck" is not valid at ${["deck", ...i.path].join(".")}: ${i.message}`, "invalid");
  }

  const row = await prisma.project.findUnique({ where: { id: project.id }, select: { name: true, reportEmails: true } });
  const to = row?.reportEmails ?? [];
  if (to.length === 0) {
    throw new ToolError(`No report emails are saved for ${project.code}. A Super Admin can add them in IDT Desk: Settings → MCP access → Report emails.`, "denied");
  }
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new ToolError("Email sending isn't set up on this IDT Desk server.", "denied");

  const recent = await prisma.mcpRequestLog.findFirst({
    where: { tool: "send_report", projectCode: project.code, outcome: "ok", createdAt: { gte: new Date(Date.now() - SEND_GAP_MS) } },
    select: { createdAt: true },
  });
  if (recent) {
    throw new ToolError(`A report for ${project.code} was already sent at ${recent.createdAt.toISOString()}. Only one every 20 hours.`, "denied");
  }

  const today = new Date();
  const dateLabel = today.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Cairo" });
  const file = await buildReportDeck(parsed.data, row!.name, dateLabel);
  const filename = `${project.code}-report-${today.toISOString().slice(0, 10)}.pptx`;

  const paragraphs = summary.split(/\n\s*\n/).map((p) => `<p style="margin:0 0 12px;">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
  const html =
    `<div style="font-family:Calibri,Arial,sans-serif;color:#16261F;font-size:14px;line-height:1.5;max-width:640px;">` +
    `<div style="background:#0A5A46;color:#fff;padding:14px 18px;border-radius:8px 8px 0 0;font-weight:bold;font-size:16px;">${escapeHtml(parsed.data.title)}</div>` +
    `<div style="border:1px solid #E1E8E4;border-top:4px solid #82B478;padding:16px 18px;border-radius:0 0 8px 8px;">${paragraphs}` +
    `<p style="margin:12px 0 0;color:#5B6B64;font-size:12px;">Attached: ${escapeHtml(filename)}<br>IDEAL for Digital Transformation</p></div></div>`;

  const sent = await sendEmail({ to, subject, html, attachments: [{ filename, content: file }] }).catch(() => false);
  if (!sent) throw new ToolError("The email couldn't be sent. Nothing was delivered — try again later.", "error");
  return {
    data: { sent: true, project: project.code, recipients: to.length, file: filename, slides: parsed.data.slides.length + 1 },
    resultCount: to.length,
    projectCode: project.code,
  };
}

export async function runTool(name: string, args: Record<string, unknown>, caller: McpCaller): Promise<ToolResult> {
  switch (name) {
    case "list_projects": {
      const projects = caller.projects.map((p) => ({ code: p.code, name: p.name }));
      return { data: { projects }, resultCount: projects.length };
    }

    case "list_tickets": {
      const project = projectFor(caller, str(args, "project", true)!);
      const status = str(args, "status", false);
      const since = str(args, "updated_since", false);
      const where: Prisma.TaskWhereInput = {
        ...baseWhere,
        projectId: project.id,
        ...(status ? { status: parseStatus(status) } : {}),
        ...(since ? { updatedAt: { gte: parseSince(since, "updated_since") } } : {}),
      };
      const rows = await prisma.task.findMany({
        where,
        orderBy: [{ code: "asc" }, { createdAt: "asc" }],
        take: LIST_LIMIT + 1,
        select: {
          code: true, title: true, status: true, module: true, createdAt: true, dueDate: true, completedAt: true,
          assignees: { select: { name: true } }, contactAssignees: { select: { name: true } },
        },
      });
      const tickets = rows.slice(0, LIST_LIMIT).map((t) => ({
        code: t.code,
        title: t.title,
        status: statusLabel(t.status),
        area: t.module,
        owner: owners(t),
        created: t.createdAt.toISOString(),
        due: utcToDateStr(t.dueDate),
        closed: t.status === "DONE" && t.completedAt ? t.completedAt.toISOString() : null,
      }));
      return {
        data: { project: project.code, count: tickets.length, truncated: rows.length > LIST_LIMIT, tickets },
        resultCount: tickets.length,
        projectCode: project.code,
      };
    }

    case "get_ticket": {
      const code = str(args, "code", true)!;
      const t = await prisma.task.findFirst({
        where: { ...baseWhere, code: { equals: code, mode: "insensitive" }, projectId: { in: caller.projects.map((p) => p.id) } },
        select: {
          code: true, title: true, description: true, status: true, priority: true, type: true, module: true,
          createdAt: true, updatedAt: true, startDate: true, dueDate: true, completedAt: true, closeReason: true, isMilestone: true,
          project: { select: { code: true, name: true } },
          category: { select: { name: true } }, subcategory: { select: { name: true } },
          parent: { select: { code: true, deletedAt: true, isPrivate: true, onHoldAt: true } },
          children: { where: baseWhere, select: { code: true }, orderBy: { code: "asc" } },
          tags: { select: { name: true } },
          assignees: { select: { name: true } }, contactAssignees: { select: { name: true } },
          events: {
            where: { type: "COMMENT" },
            orderBy: { createdAt: "asc" },
            select: { message: true, createdAt: true, editedAt: true, author: { select: { name: true } } },
          },
        },
      });
      // Same answer for "no such code" and "another client's ticket".
      if (!t || !t.project) throw new ToolError(`Ticket "${code}" was not found or this token can't read it.`, "not_found");
      const parentVisible = t.parent && !t.parent.deletedAt && !t.parent.isPrivate && !t.parent.onHoldAt;
      const ticket = {
        code: t.code,
        title: t.title,
        project: t.project.code,
        status: statusLabel(t.status),
        close_reason: t.status === "DONE" ? closeLabel(t.closeReason) : null,
        priority: t.priority,
        type: t.type,
        area: t.module,
        category: t.category?.name ?? null,
        subcategory: t.subcategory?.name ?? null,
        tags: t.tags.map((x) => x.name),
        owner: owners(t),
        milestone: t.isMilestone,
        parent: parentVisible ? t.parent!.code : null,
        subtasks: t.children.map((c) => c.code),
        created: t.createdAt.toISOString(),
        updated: t.updatedAt.toISOString(),
        start: utcToDateStr(t.startDate),
        due: utcToDateStr(t.dueDate),
        closed: t.status === "DONE" && t.completedAt ? t.completedAt.toISOString() : null,
        description: t.description,
        comments: t.events.map((e) => ({
          // A comment with no author came from the customer (tracking page or shared link).
          author: e.author?.name ?? "Customer",
          at: e.createdAt.toISOString(),
          edited: e.editedAt ? e.editedAt.toISOString() : null,
          text: e.message,
        })),
      };
      return { data: { ticket }, resultCount: 1, projectCode: t.project.code, ticketCode: t.code ?? code };
    }

    case "get_status_changes": {
      const project = projectFor(caller, str(args, "project", true)!);
      const since = parseSince(str(args, "since", true)!, "since");
      const rows = await prisma.taskStatusChange.findMany({
        where: { changedAt: { gte: since }, task: { ...baseWhere, projectId: project.id } },
        orderBy: [{ changedAt: "asc" }, { id: "asc" }],
        take: CHANGES_LIMIT + 1,
        select: { fromStatus: true, toStatus: true, changedAt: true, task: { select: { code: true, title: true } } },
      });
      const changes = rows.slice(0, CHANGES_LIMIT).map((c) => ({
        code: c.task.code,
        title: c.task.title,
        from: c.fromStatus ? statusLabel(c.fromStatus) : null,
        to: statusLabel(c.toStatus),
        at: c.changedAt.toISOString(),
      }));
      return {
        data: { project: project.code, since: since.toISOString(), count: changes.length, truncated: rows.length > CHANGES_LIMIT, changes },
        resultCount: changes.length,
        projectCode: project.code,
      };
    }

    case "send_report":
      return sendReport(args, caller);

    default:
      throw new ToolError(`Unknown tool "${name}"`, "invalid");
  }
}
