import { prisma } from "@/lib/prisma";
import { utcToDateStr } from "@/lib/serverDates";
import { STATUSES, PRIORITIES } from "@/lib/taskHelpers";

export async function logActivity(taskId: string, actorId: string | null, message: string) {
  await prisma.taskEvent.create({ data: { taskId, authorId: actorId, type: "ACTIVITY", message } });
}

export async function addComment(taskId: string, authorId: string, message: string) {
  return prisma.taskEvent.create({ data: { taskId, authorId, type: "COMMENT", message } });
}

function statusLabel(id: string): string {
  return STATUSES.find((s) => s.id === id)?.label ?? id;
}
function priorityLabel(id: string): string {
  return PRIORITIES.find((p) => p.id === id)?.label ?? id;
}
function dateLabel(d: Date | null): string {
  return d ? utcToDateStr(d) ?? "" : "none";
}

interface TaskSnapshot {
  title: string;
  status: string;
  priority: string;
  projectId: string | null;
  dueDate: Date | null;
  startDate: Date | null;
  isMilestone: boolean;
  assigneeIds: string[];
  contactAssigneeIds: string[];
}

interface Lookups {
  userNames: Map<string, string>;
  contactNames: Map<string, string>;
  projectNames: Map<string, string>;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((x) => setB.has(x));
}

/** Builds one human-readable line per changed field between two task snapshots. */
export function describeTaskChanges(before: TaskSnapshot, after: TaskSnapshot, lookups: Lookups): string[] {
  const lines: string[] = [];

  if (before.title !== after.title) lines.push(`Title changed to "${after.title}"`);
  if (before.status !== after.status) lines.push(`Status changed from ${statusLabel(before.status)} to ${statusLabel(after.status)}`);
  if (before.priority !== after.priority) lines.push(`Priority changed from ${priorityLabel(before.priority)} to ${priorityLabel(after.priority)}`);

  if (before.projectId !== after.projectId) {
    const from = before.projectId ? lookups.projectNames.get(before.projectId) ?? "Unknown project" : "No project";
    const to = after.projectId ? lookups.projectNames.get(after.projectId) ?? "Unknown project" : "No project";
    lines.push(`Project changed from ${from} to ${to}`);
  }

  if (dateLabel(before.dueDate) !== dateLabel(after.dueDate)) {
    lines.push(`Due date changed from ${dateLabel(before.dueDate)} to ${dateLabel(after.dueDate)}`);
  }
  if (dateLabel(before.startDate) !== dateLabel(after.startDate)) {
    lines.push(`Start date changed from ${dateLabel(before.startDate)} to ${dateLabel(after.startDate)}`);
  }

  if (!sameSet(before.assigneeIds, after.assigneeIds) || !sameSet(before.contactAssigneeIds, after.contactAssigneeIds)) {
    const beforeNames = [...before.assigneeIds.map((id) => lookups.userNames.get(id) ?? "Unknown"), ...before.contactAssigneeIds.map((id) => lookups.contactNames.get(id) ?? "Unknown")];
    const afterNames = [...after.assigneeIds.map((id) => lookups.userNames.get(id) ?? "Unknown"), ...after.contactAssigneeIds.map((id) => lookups.contactNames.get(id) ?? "Unknown")];
    lines.push(`Assignees changed from ${beforeNames.length ? beforeNames.join(", ") : "no one"} to ${afterNames.length ? afterNames.join(", ") : "no one"}`);
  }

  if (before.isMilestone !== after.isMilestone) {
    lines.push(after.isMilestone ? "Marked as a milestone" : "Unmarked as a milestone");
  }

  return lines;
}

/** Loads the name lookups needed by describeTaskChanges for an arbitrary set of ids. */
export async function loadNameLookups(params: {
  userIds: string[];
  contactIds: string[];
  projectIds: string[];
}): Promise<Lookups> {
  const [users, contacts, projects] = await Promise.all([
    params.userIds.length ? prisma.user.findMany({ where: { id: { in: params.userIds } }, select: { id: true, name: true } }) : [],
    params.contactIds.length ? prisma.contact.findMany({ where: { id: { in: params.contactIds } }, select: { id: true, name: true } }) : [],
    params.projectIds.length ? prisma.project.findMany({ where: { id: { in: params.projectIds } }, select: { id: true, name: true } }) : [],
  ]);
  return {
    userNames: new Map(users.map((u) => [u.id, u.name])),
    contactNames: new Map(contacts.map((c) => [c.id, c.name])),
    projectNames: new Map(projects.map((p) => [p.id, p.name])),
  };
}
