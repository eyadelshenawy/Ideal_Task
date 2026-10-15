import { prisma } from "@/lib/prisma";
import type { ListConfig, Priority } from "@/types/models";
import { splitModules } from "@/lib/taskHelpers";

const PRIORITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export async function loadListConfig(): Promise<ListConfig> {
  const [ticketTypes, modules, priorities] = await Promise.all([
    prisma.ticketTypeOption.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.moduleOption.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, sortOrder: true, active: true } }),
    prisma.priorityOption.findMany(),
  ]);
  return {
    ticketTypes,
    modules,
    priorities: [...priorities].sort((a, b) => PRIORITY_ORDER.indexOf(a.code) - PRIORITY_ORDER.indexOf(b.code)).map((p) => ({ code: p.code as Priority, label: p.label, color: p.color })),
  };
}

/** Error message when `code` isn't a configured ticket type, else null. */
export async function checkTicketType(code: string): Promise<string | null> {
  const row = await prisma.ticketTypeOption.findUnique({ where: { code } });
  return row ? null : `Unknown ticket type "${code}"`;
}

/**
 * Maps typed module names onto the configured list (case-insensitive) and
 * returns the canonical comma-separated value, plus any names not found.
 */
export async function normaliseModules(
  input: string | null | undefined,
  preloaded?: { name: string }[],
): Promise<{ value: string | null; unknown: string[] }> {
  const names = splitModules(input);
  if (names.length === 0) return { value: null, unknown: [] };
  const all = preloaded ?? await prisma.moduleOption.findMany({ select: { name: true } });
  const byLower = new Map(all.map((m) => [m.name.toLowerCase(), m.name]));
  const known: string[] = [];
  const unknown: string[] = [];
  for (const n of names) {
    const match = byLower.get(n.toLowerCase());
    if (match) { if (!known.includes(match)) known.push(match); } else unknown.push(n);
  }
  return { value: known.length ? known.join(", ") : null, unknown };
}

/**
 * Validates a task's type and module against the configured lists. Returns an
 * error message, or the module value rewritten to the list's spelling.
 */
export async function checkTaskLists(
  type: string | undefined,
  module: string | null | undefined,
): Promise<{ error: string | null; module: string | null | undefined }> {
  if (type !== undefined) {
    const typeError = await checkTicketType(type);
    if (typeError) return { error: typeError, module };
  }
  if (module === undefined) return { error: null, module };
  const { value, unknown } = await normaliseModules(module);
  if (unknown.length > 0) {
    return { error: `Unknown module${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")} — add it in Lists first`, module };
  }
  return { error: null, module: value };
}

// Light background for the chip, mixed from the text colour.
export function bgFor(color: string): string {
  const n = parseInt(color.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * 0.88).toString(16).padStart(2, "0");
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`.toUpperCase();
}
