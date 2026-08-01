import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { importRawRowsSchema } from "@/lib/validation/import";
import { parseSheetRows } from "@/lib/excelImport";
import type { ImportPreview } from "@/types/import";

export async function POST(req: NextRequest) {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const parsedBody = importRawRowsSchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid file data" }, { status: 400 });
  }

  const { parsed, warnings } = parseSheetRows(parsedBody.data.rows);

  const [existingProjects, existingMembers, existingTasks] = await Promise.all([
    prisma.project.findMany(),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
    prisma.task.findMany({ where: { code: { not: null } }, select: { id: true, code: true } }),
  ]);

  const projectByName = new Map(existingProjects.map((p) => [p.name.toLowerCase(), p.id]));
  const memberByName = new Map(existingMembers.map((m) => [m.name.toLowerCase(), m.id]));
  const existingCodeToId = new Map<string, string>();
  existingTasks.forEach((t) => {
    if (t.code) existingCodeToId.set(t.code.trim().toLowerCase(), t.id);
  });
  const batchCodeToTempId = new Map<string, string>();
  parsed.forEach((t) => {
    if (t.code) batchCodeToTempId.set(t.code.trim().toLowerCase(), t.tempId);
  });

  const newProjectNamesSet = new Set<string>();

  const tasksToAdd = parsed.map((t) => {
    let projectId: string | null = null;
    let newProjectName: string | null = null;
    if (t.projectName) {
      const existingId = projectByName.get(t.projectName.toLowerCase());
      if (existingId) {
        projectId = existingId;
      } else {
        newProjectName = t.projectName;
        newProjectNamesSet.add(t.projectName);
      }
    }

    let assigneeId: string | null = null;
    if (t.assigneeName) {
      const existingId = memberByName.get(t.assigneeName.toLowerCase());
      if (existingId) {
        assigneeId = existingId;
      } else {
        warnings.push(
          `"${t.title}": no active team member named "${t.assigneeName}" — left unassigned. Add them from Team Management and re-import if needed.`,
        );
      }
    }

    const dependsOnTempIds: string[] = [];
    const dependsOnExistingIds: string[] = [];
    t.dependsOnCodes.forEach((c) => {
      const key = c.toLowerCase();
      const tempMatch = batchCodeToTempId.get(key);
      if (tempMatch && tempMatch !== t.tempId) {
        dependsOnTempIds.push(tempMatch);
        return;
      }
      const existingMatch = existingCodeToId.get(key);
      if (existingMatch) {
        dependsOnExistingIds.push(existingMatch);
        return;
      }
      warnings.push(`"${t.title}" depends on unknown code "${c}"`);
    });

    let parentTempId: string | null = null;
    let parentExistingId: string | null = null;
    if (t.parentCode) {
      const key = t.parentCode.toLowerCase();
      const tempMatch = batchCodeToTempId.get(key);
      if (tempMatch && tempMatch !== t.tempId) {
        parentTempId = tempMatch;
      } else {
        const existingMatch = existingCodeToId.get(key);
        if (existingMatch) {
          parentExistingId = existingMatch;
        } else {
          warnings.push(`"${t.title}": parent code "${t.parentCode}" not found — imported as a top-level task instead.`);
        }
      }
    }

    return {
      tempId: t.tempId,
      code: t.code,
      title: t.title,
      description: t.description,
      module: t.module,
      tags: t.tags,
      comment: t.comment,
      projectId,
      newProjectName,
      assigneeId,
      priority: t.priority,
      status: t.status,
      startDate: t.startDate || null,
      dueDate: t.dueDate || null,
      progress: t.progress,
      isMilestone: t.isMilestone,
      dependsOnTempIds,
      dependsOnExistingIds,
      parentTempId,
      parentExistingId,
    };
  });

  const preview: ImportPreview = { tasksToAdd, newProjectNames: Array.from(newProjectNamesSet), warnings };
  return NextResponse.json(preview);
}
