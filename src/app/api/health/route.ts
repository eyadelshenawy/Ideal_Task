import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/permissions";

// Super-Admin-only operational snapshot: how much data is sitting in the
// DB and R2 today. Bookmark it, hit it now and then to spot unusual
// growth (e.g. R2 usage doubling in a week).
export async function GET() {
  const { error } = await requireSuperAdmin();
  if (error) return error;

  const [
    activeUsers,
    inactiveUsers,
    activeProjects,
    trashedProjects,
    liveTasks,
    trashedTasks,
    attachmentAgg,
    auditLogCount,
    pushSubscriptions,
  ] = await Promise.all([
    prisma.user.count({ where: { active: true } }),
    prisma.user.count({ where: { active: false } }),
    prisma.project.count({ where: { deletedAt: null } }),
    prisma.project.count({ where: { deletedAt: { not: null } } }),
    prisma.task.count({ where: { deletedAt: null } }),
    prisma.task.count({ where: { deletedAt: { not: null } } }),
    prisma.attachment.aggregate({ _count: { _all: true }, _sum: { fileSize: true } }),
    prisma.auditLog.count(),
    prisma.pushSubscription.count(),
  ]);

  const bytes = attachmentAgg._sum.fileSize ?? 0;
  return NextResponse.json({
    users: { active: activeUsers, inactive: inactiveUsers },
    projects: { live: activeProjects, trashed: trashedProjects },
    tasks: { live: liveTasks, trashed: trashedTasks },
    attachments: {
      count: attachmentAgg._count._all,
      totalBytes: bytes,
      totalMB: Math.round((bytes / (1024 * 1024)) * 10) / 10,
    },
    auditLogRows: auditLogCount,
    pushSubscriptions,
    timestamp: new Date().toISOString(),
  });
}
