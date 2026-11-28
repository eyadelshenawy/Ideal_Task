import type { Prisma, Status } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STATUSES } from "@/lib/taskHelpers";
import { CLOSE_REASONS } from "@/lib/closeReason";
import { utcToDateStr } from "@/lib/serverDates";
import type { McpCaller } from "./tokens";

// Read-only tools for the MCP server at /api/mcp. Nothing here writes to a
// task. Every tool that returns tickets works on ONE project, and only on a
// project linked to the caller's token, so two clients' data never mix.
//
// The same tasks are left out as everywhere else in the app: private tasks,
// tasks in Trash and tasks on hold. Tasks with no project are never returned.

const LIST_LIMIT = 1000;
const CHANGES_LIMIT = 5000;

export class ToolError extends Error {
  constructor(message: string, public outcome: "invalid" | "denied" | "not_found") {
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

export const TOOL_DEFINITIONS = [
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

    default:
      throw new ToolError(`Unknown tool "${name}"`, "invalid");
  }
}
