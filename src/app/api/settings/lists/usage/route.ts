import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";
import { splitModules } from "@/lib/taskHelpers";

// How many tasks use each ticket type and module, so the Lists screen can
// show which entries are in use before tidying them.
export async function GET() {
  const { error } = await requireSuperAdmin();
  if (error) return error;
  const [byType, withModule] = await Promise.all([
    prisma.task.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.task.findMany({ where: { module: { not: null } }, select: { module: true } }),
  ]);
  const types: Record<string, number> = {};
  for (const row of byType) types[row.type] = row._count._all;
  const modules: Record<string, number> = {};
  for (const t of withModule) {
    for (const name of splitModules(t.module)) {
      modules[name] = (modules[name] ?? 0) + 1;
    }
  }
  return NextResponse.json({ types, modules });
}
