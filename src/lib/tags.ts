import { prisma } from "@/lib/prisma";

/** Upserts each tag name (case-sensitive, exact match) and returns the resolved rows. */
export async function resolveTags(names: string[]) {
  const unique = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  return Promise.all(unique.map((name) => prisma.tag.upsert({ where: { name }, create: { name }, update: {} })));
}
