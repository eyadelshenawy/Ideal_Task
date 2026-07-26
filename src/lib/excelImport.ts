// Ported from parseImportRows() in ideal-tasks.jsx. Field-matching/normalization
// runs server-side (not in the browser) so it shares one source of truth with the
// DB-resolution step in /api/import/preview, which needs server access anyway.

import type { Priority, Status } from "@/types/models";
import { PRIORITIES, STATUSES } from "./taskHelpers";

function normalizeKeyRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.keys(row).forEach((k) => {
    out[String(k).trim().toLowerCase()] = row[k];
  });
  return out;
}

function pick(nrow: Record<string, unknown>, aliases: string[]): string {
  for (const a of aliases) {
    const v = nrow[a];
    if (v !== undefined && v !== "") return String(v);
  }
  return "";
}

export function excelValueToDateStr(value: unknown): string {
  if (value === "" || value === undefined || value === null) return "";
  if (typeof value === "number") {
    const utcDays = Math.floor(value - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }
  return "";
}

function matchStatus(s: unknown): Status {
  const v = String(s || "").trim().toLowerCase();
  const found = STATUSES.find((st) => st.label.toLowerCase() === v || st.id.toLowerCase() === v);
  return found ? found.id : "TODO";
}

function matchPriority(s: unknown): Priority {
  const v = String(s || "").trim().toLowerCase();
  const found = PRIORITIES.find((p) => p.label.toLowerCase() === v || p.id.toLowerCase() === v);
  return found ? found.id : "MEDIUM";
}

function matchBool(s: unknown): boolean {
  const v = String(s || "").trim().toLowerCase();
  return v === "yes" || v === "y" || v === "true" || v === "1";
}

export interface RawParsedRow {
  tempId: string;
  code: string;
  title: string;
  description: string;
  projectName: string;
  assigneeName: string;
  priority: Priority;
  status: Status;
  startDate: string;
  dueDate: string;
  progress: number;
  isMilestone: boolean;
  dependsOnCodes: string[];
}

export function parseSheetRows(rows: Record<string, unknown>[]): { parsed: RawParsedRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const parsed: RawParsedRow[] = [];

  rows.forEach((row, idx) => {
    const nrow = normalizeKeyRow(row);
    const title = pick(nrow, ["title", "task", "name", "task name"]);
    if (!title) {
      warnings.push(`Row ${idx + 2}: skipped — no title`);
      return;
    }
    const code = pick(nrow, ["code", "id", "task id", "wbs"]);
    const projectRaw = pick(nrow, ["project", "client", "project/client", "project / client"]);
    const assigneeRaw = pick(nrow, ["assignee", "owner", "assigned to"]);
    const priorityRaw = pick(nrow, ["priority"]);
    const statusRaw = pick(nrow, ["status"]);
    const startRaw = nrow["start date"] ?? nrow["start"];
    const dueRaw = nrow["due date"] ?? nrow["due"] ?? nrow["end date"] ?? nrow["end"] ?? nrow["deadline"];
    const progressRaw = pick(nrow, ["progress", "%", "% complete", "percent complete"]);
    const milestoneRaw = pick(nrow, ["milestone", "is milestone"]);
    const dependsRaw = pick(nrow, ["depends on", "dependencies", "predecessor", "predecessors"]);

    parsed.push({
      tempId: `row-${idx}`,
      code: code.trim(),
      title: title.trim(),
      description: "",
      projectName: projectRaw.trim(),
      assigneeName: assigneeRaw.trim(),
      priority: matchPriority(priorityRaw),
      status: matchStatus(statusRaw),
      startDate: excelValueToDateStr(startRaw),
      dueDate: excelValueToDateStr(dueRaw),
      progress: Math.max(0, Math.min(100, Number(progressRaw) || 0)),
      isMilestone: matchBool(milestoneRaw),
      dependsOnCodes: dependsRaw ? dependsRaw.split(",").map((c) => c.trim()).filter(Boolean) : [],
    });
  });

  return { parsed, warnings };
}
