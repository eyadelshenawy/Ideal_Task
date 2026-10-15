"use client";

import { useEffect, useRef, useState } from "react";

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Optional colour dot shown before the label. */
  color?: string;
}

// Checkbox dropdown used by every Dashboard filter. Empty selection = no filter.
export default function MultiSelectFilter({
  allLabel, pluralNoun, options, selected, onChange, width = 200,
}: {
  allLabel: string;
  pluralNoun: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const label =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? `1 ${pluralNoun}`
        : `${selected.length} ${pluralNoun}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg px-2 py-1.5 text-xs bg-white border text-brand-text max-w-[180px] truncate"
        style={{ borderColor: selected.length ? "#0A5A46" : "#E1E7E4" }}
        title={selected.length > 1 ? options.filter((o) => selected.includes(o.value)).map((o) => o.label).join(", ") : undefined}
      >
        {label}
      </button>
      {open && (
        <div
          className="absolute left-0 top-[calc(100%+4px)] z-20 max-h-[260px] overflow-y-auto rounded-lg bg-white border border-brand-border shadow-lg p-2"
          style={{ width }}
        >
          {options.length === 0 && <div className="text-[11px] text-brand-sub px-1 py-1">Nothing to filter yet</div>}
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-xs py-0.5 text-brand-text cursor-pointer">
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={() => onChange(selected.includes(o.value) ? selected.filter((x) => x !== o.value) : [...selected, o.value])}
              />
              {o.color && <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: o.color }} />}
              <span className="truncate">{o.label}</span>
            </label>
          ))}
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="text-[11px] text-brand-dark underline mt-1">
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
