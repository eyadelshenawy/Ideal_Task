import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { logAudit } from "@/lib/audit";
import { splitModules } from "@/lib/taskHelpers";

const patchSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(40).refine((n) => !n.includes(","), "Names can't contain a comma").optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

// Renaming rewrites every task that uses the old name. If the new name is
// already in the list, the two entries are merged into that one.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { session, error } = await requireSuperAdmin();
  if (error) return error;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid change" }, { status: 400 });
  const { name, active, sortOrder } = parsed.data;

  const existing = await prisma.moduleOption.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (name !== undefined && name !== existing.name) {
    const target = await prisma.moduleOption.findFirst({
      where: { id: { not: id }, name: { equals: name, mode: "insensitive" } },
    });
    const newName = target?.name ?? name;

    const updated = await prisma.$transaction(async (tx) => {
      const tasks = await tx.task.findMany({
        where: { module: { contains: existing.name, mode: "insensitive" } },
        select: { id: true, module: true },
      });
      let changed = 0;
      for (const t of tasks) {
        const parts = splitModules(t.module);
        // List names are exact (e.g. "FI" and "Fi" are separate entries).
        if (!parts.includes(existing.name)) continue;
        const next: string[] = [];
        for (const p of parts) {
          const v = p === existing.name ? newName : p;
          if (!next.some((n) => n.toLowerCase() === v.toLowerCase())) next.push(v);
        }
        await tx.task.update({ where: { id: t.id }, data: { module: next.join(", ") } });
        changed++;
      }
      if (target) {
        await tx.moduleOption.delete({ where: { id } });
        return { row: target, changed };
      }
      const row = await tx.moduleOption.update({ where: { id }, data: { name, ...(active !== undefined ? { active } : {}), ...(sortOrder !== undefined ? { sortOrder } : {}) } });
      return { row, changed };
    });

    logAudit(
      session.user.id,
      target
        ? `Merged module "${existing.name}" into "${target.name}" (${updated.changed} task${updated.changed === 1 ? "" : "s"} updated)`
        : `Renamed module "${existing.name}" to "${name}" (${updated.changed} task${updated.changed === 1 ? "" : "s"} updated)`,
    );
    const r = updated.row;
    return NextResponse.json({ id: r.id, name: r.name, sortOrder: r.sortOrder, active: r.active, merged: !!target, tasksUpdated: updated.changed });
  }

  const row = await prisma.moduleOption.update({
    where: { id },
    data: { ...(active !== undefined ? { active } : {}), ...(sortOrder !== undefined ? { sortOrder } : {}) },
  });
  if (active !== undefined && active !== existing.active) {
    logAudit(session.user.id, `Module "${existing.name}" ${active ? "shown again" : "hidden"}`);
  }
  return NextResponse.json({ id: row.id, name: row.name, sortOrder: row.sortOrder, active: row.active });
}
