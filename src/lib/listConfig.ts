import type { ListConfig, ModuleOption } from "@/types/models";
import { PRIORITIES } from "@/lib/taskHelpers";
import { TICKET_TYPES, toTypeMeta } from "@/lib/ticketMeta";

// Applies the configured lists to the shared PRIORITIES / TICKET_TYPES arrays
// in place, so every component that reads them picks up the configured
// labels and colours on its next render.
// Configured modules (active and hidden), filled by applyListConfig.
export const MODULE_OPTIONS: ModuleOption[] = [];

export function applyListConfig(cfg: ListConfig): void {
  MODULE_OPTIONS.splice(0, MODULE_OPTIONS.length, ...cfg.modules);
  for (const p of PRIORITIES) {
    const o = cfg.priorities.find((x) => x.code === p.id);
    if (o) { p.label = o.label; p.color = o.color; }
  }
  if (cfg.ticketTypes.length > 0) {
    TICKET_TYPES.splice(0, TICKET_TYPES.length, ...[...cfg.ticketTypes].sort((a, b) => a.sortOrder - b.sortOrder).map(toTypeMeta));
  }
}
