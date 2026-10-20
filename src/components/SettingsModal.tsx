"use client";

import type { ReactNode } from "react";

export type SettingsSection =
  | "team" | "contacts" | "projects" | "categories" | "lists"
  | "checklists" | "calendar" | "security" | "audit" | "trash";

export interface SettingsItem {
  id: SettingsSection;
  label: string;
  group: "People" | "Work" | "Security";
}

/**
 * One place for every admin screen. The left list picks a section; the
 * section's existing modal renders inside the right-hand pane (see the
 * .settings-pane rules in globals.css), so each screen works exactly as it
 * did on its own. The section's own close button closes Settings.
 */
export default function SettingsModal({ items, section, onSelect, children }: {
  items: SettingsItem[];
  section: SettingsSection;
  onSelect: (s: SettingsSection) => void;
  children: ReactNode;
}) {
  const groups = (["People", "Work", "Security"] as const).filter((g) => items.some((i) => i.group === g));
  return (
    <div className="fixed inset-0 z-40 flex items-stretch sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-none sm:rounded-2xl w-full sm:max-w-[860px] h-full sm:h-[85vh] flex flex-col sm:flex-row overflow-hidden">
        <nav className="hidden sm:block w-[200px] flex-shrink-0 bg-brand-bg border-r border-brand-border p-2.5 overflow-y-auto">
          <div className="font-bold text-[15px] text-brand-text px-2 pt-1 pb-2">Settings</div>
          {groups.map((g) => (
            <div key={g}>
              <div className="text-[10px] uppercase tracking-wide text-brand-sub px-2 pt-2.5 pb-1">{g}</div>
              {items.filter((i) => i.group === g).map((i) => (
                <button
                  key={i.id}
                  onClick={() => onSelect(i.id)}
                  className="w-full text-left px-2 py-1.5 rounded-md text-[12.5px]"
                  style={{ background: section === i.id ? "#0A5A46" : "transparent", color: section === i.id ? "#fff" : "#16261F", fontWeight: section === i.id ? 600 : 400 }}
                >
                  {i.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        {/* On phones the list becomes a drop-down above the section. */}
        <div className="sm:hidden flex items-center gap-2 px-3 py-2 border-b border-brand-border">
          <span className="font-bold text-[14px] text-brand-text">Settings</span>
          <select
            value={section}
            onChange={(e) => onSelect(e.target.value as SettingsSection)}
            className="flex-1 rounded-lg border border-brand-border px-2 py-1.5 text-sm outline-none"
          >
            {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
          </select>
        </div>
        <div className="settings-pane relative flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}
