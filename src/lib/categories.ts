import { prisma } from "@/lib/prisma";

// A subcategory is only valid under its own parent; a category must be a
// top-level row. Returns an error message, or null when the pair is fine.
export async function checkCategoryPair(categoryId: string | null, subcategoryId: string | null): Promise<string | null> {
  if (!categoryId && subcategoryId) return "Pick a category before a subcategory";
  if (!categoryId) return null;
  const ids = subcategoryId ? [categoryId, subcategoryId] : [categoryId];
  const rows = await prisma.category.findMany({ where: { id: { in: ids } }, select: { id: true, parentId: true } });
  const cat = rows.find((r) => r.id === categoryId);
  if (!cat || cat.parentId) return "Unknown category";
  if (subcategoryId) {
    const sub = rows.find((r) => r.id === subcategoryId);
    if (!sub || sub.parentId !== categoryId) return "That subcategory doesn't belong to the selected category";
  }
  return null;
}
