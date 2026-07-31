import { prisma } from "@/lib/prisma";

/**
 * Resolves (upserting as needed) every name in one bulk pass — 2-3 queries
 * total regardless of how many names, instead of one upsert per name. That
 * matters a lot for imports: through a pooled/PgBouncer connection, each
 * standalone query pays real per-call overhead, so 100+ individual upserts
 * (as a large import's tags can easily produce) added up to nearly a minute
 * on their own.
 */
export async function resolveTags(names: string[]) {
  const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (unique.length === 0) return [];

  const existing = await prisma.tag.findMany({ where: { name: { in: unique } } });
  const existingNames = new Set(existing.map((t) => t.name));
  const missing = unique.filter((n) => !existingNames.has(n));
  if (missing.length === 0) return existing;

  await prisma.tag.createMany({ data: missing.map((name) => ({ name })), skipDuplicates: true });
  return prisma.tag.findMany({ where: { name: { in: unique } } });
}
