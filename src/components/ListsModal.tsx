"use client";

import { useState } from "react";
import useSWR from "swr";
import { X, Plus, Pencil, Check, Eye, EyeOff, ListTree } from "lucide-react";
import type { ListConfig, ModuleOption, PriorityOption, TicketTypeOption } from "@/types/models";

type Usage = { types: Record<string, number>; modules: Record<string, number> };
type Tab = "types" | "modules" | "priorities";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

async function call(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.ok) return null;
  const j = await res.json().catch(() => ({}));
  return j.error ?? "Something went wrong";
}

function usageText(n: number | undefined): string {
  return n ? `${n} task${n === 1 ? "" : "s"}` : "Not used";
}

function Swatch({ color, label }: { color: string; label: string }) {
  return <span className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold" style={{ color, background: `${color}1A` }}>{label}</span>;
}

function TypeRow({ t, used, onChanged, onError }: {
  t: TicketTypeOption; used: number | undefined; onChanged: () => void; onError: (e: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(t.label);
  const [short, setShort] = useState(t.short);
  const [color, setColor] = useState(t.color);

  async function save() {
    const err = await call(`/api/settings/lists/types/${t.code}`, "PATCH", { label, short, color });
    if (err) return onError(err);
    setEditing(false);
    onChanged();
  }
  async function toggle() {
    const err = await call(`/api/settings/lists/types/${t.code}`, "PATCH", { active: !t.active });
    if (err) return onError(err);
    onChanged();
  }

  return (
    <div className={`flex items-center gap-1.5 py-1.5 ${t.active ? "" : "opacity-60"}`}>
      {editing ? (
        <>
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name" className="flex-1 min-w-0 rounded-md border border-brand-border px-2 py-1 text-xs outline-none" />
          <input value={short} onChange={(e) => setShort(e.target.value)} placeholder="Tag" className="w-14 rounded-md border border-brand-border px-2 py-1 text-xs outline-none" />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Colour" className="w-7 h-7 rounded border border-brand-border" />
          <button onClick={save} title="Save" className="p-1 text-brand-dark"><Check size={13} /></button>
        </>
      ) : (
        <>
          <span className="flex-1 min-w-0 text-[12.5px] font-semibold text-brand-text truncate">
            {t.label} {!t.active && <span className="ml-1 text-[10px] font-normal text-brand-sub">Hidden</span>}
          </span>
          <Swatch color={t.color} label={t.short} />
          <span className="w-16 text-right text-[11px] text-brand-sub">{usageText(used)}</span>
          <button onClick={() => setEditing(true)} title="Edit" className="p-1 text-brand-sub"><Pencil size={13} /></button>
        </>
      )}
      <button
        onClick={toggle}
        disabled={t.system}
        title={t.system ? "Used by the app — can't be hidden" : t.active ? "Hide (tickets keep it)" : "Show again"}
        className="p-1 text-brand-sub disabled:opacity-30"
      >
        {t.active ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>
    </div>
  );
}

function ModuleRow({ m, all, used, onChanged, onError }: {
  m: ModuleOption; all: ModuleOption[]; used: number | undefined; onChanged: () => void; onError: (e: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(m.name);
  const [confirmMerge, setConfirmMerge] = useState(false);
  const target = all.find((x) => x.id !== m.id && x.name.toLowerCase() === name.trim().toLowerCase());

  async function save() {
    if (name.trim() === m.name) { setEditing(false); return; }
    if (target && !confirmMerge) { setConfirmMerge(true); return; }
    const err = await call(`/api/settings/lists/modules/${m.id}`, "PATCH", { name: name.trim() });
    if (err) return onError(err);
    setEditing(false);
    setConfirmMerge(false);
    onChanged();
  }
  async function toggle() {
    const err = await call(`/api/settings/lists/modules/${m.id}`, "PATCH", { active: !m.active });
    if (err) return onError(err);
    onChanged();
  }

  return (
    <div className="py-1.5">
      <div className={`flex items-center gap-1.5 ${m.active ? "" : "opacity-60"}`}>
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => { setName(e.target.value); setConfirmMerge(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setName(m.name); setConfirmMerge(false); } }}
            className="flex-1 rounded-md border border-brand-border px-2 py-1 text-xs outline-none"
          />
        ) : (
          <span className="flex-1 text-[12.5px] font-semibold text-brand-text">
            {m.name} {!m.active && <span className="ml-1 text-[10px] font-normal text-brand-sub">Hidden</span>}
          </span>
        )}
        {!editing && <span className="text-[11px] text-brand-sub">{usageText(used)}</span>}
        {editing ? (
          <button onClick={save} title={confirmMerge ? "Click to confirm the merge" : "Save"} className="p-1" style={{ color: confirmMerge ? "#C4443D" : "#0A5A46" }}><Check size={13} /></button>
        ) : (
          <button onClick={() => setEditing(true)} title="Rename" className="p-1 text-brand-sub"><Pencil size={13} /></button>
        )}
        <button onClick={toggle} title={m.active ? "Hide (tickets keep it)" : "Show again"} className="p-1 text-brand-sub">
          {m.active ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
      </div>
      {editing && (
        <div className="text-[11px] mt-1" style={{ color: confirmMerge ? "#C4443D" : "#5B6B64" }}>
          {target
            ? `"${target.name}" is already in the list. ${confirmMerge ? "Click ✓ again to" : "Saving will"} merge them: ${used ? `${usageText(used)} ${used === 1 ? "moves" : "move"}` : "no tasks move"} to "${target.name}" and "${m.name}" is removed.`
            : `Every task using "${m.name}" changes to the new name.`}
        </div>
      )}
    </div>
  );
}

function PriorityRow({ p, onChanged, onError }: {
  p: PriorityOption; onChanged: () => void; onError: (e: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(p.label);
  const [color, setColor] = useState(p.color);

  async function save() {
    const err = await call(`/api/settings/lists/priorities/${p.code}`, "PATCH", { label, color });
    if (err) return onError(err);
    setEditing(false);
    onChanged();
  }

  return (
    <div className="flex items-center gap-1.5 py-1.5">
      {editing ? (
        <>
          <input autoFocus value={label} onChange={(e) => setLabel(e.target.value)} className="flex-1 rounded-md border border-brand-border px-2 py-1 text-xs outline-none" />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Colour" className="w-7 h-7 rounded border border-brand-border" />
          <button onClick={save} title="Save" className="p-1 text-brand-dark"><Check size={13} /></button>
        </>
      ) : (
        <>
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />
          <span className="flex-1 text-[12.5px] font-semibold text-brand-text">{p.label}</span>
          <button onClick={() => setEditing(true)} title="Edit" className="p-1 text-brand-sub"><Pencil size={13} /></button>
        </>
      )}
    </div>
  );
}

function AddType({ onChanged, onError }: { onChanged: () => void; onError: (e: string) => void }) {
  const [label, setLabel] = useState("");
  const [short, setShort] = useState("");
  const [color, setColor] = useState("#0A5A46");
  async function add() {
    if (!label.trim() || !short.trim()) return onError("Enter a name and a short tag");
    const err = await call("/api/settings/lists/types", "POST", { label: label.trim(), short: short.trim(), color });
    if (err) return onError(err);
    setLabel(""); setShort("");
    onChanged();
  }
  return (
    <div className="flex items-center gap-1.5 py-1">
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="New ticket type…" className="flex-1 min-w-0 rounded-md border border-dashed border-brand-border px-2 py-1 text-xs outline-none" />
      <input value={short} onChange={(e) => setShort(e.target.value)} placeholder="Tag" className="w-14 rounded-md border border-dashed border-brand-border px-2 py-1 text-xs outline-none" />
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} title="Colour" className="w-7 h-7 rounded border border-brand-border" />
      <button onClick={add} title="Add" className="p-1 text-brand-dark"><Plus size={14} /></button>
    </div>
  );
}

function AddModule({ onChanged, onError }: { onChanged: () => void; onError: (e: string) => void }) {
  const [name, setName] = useState("");
  async function add() {
    if (!name.trim()) return;
    const err = await call("/api/settings/lists/modules", "POST", { name: name.trim() });
    if (err) return onError(err);
    setName("");
    onChanged();
  }
  return (
    <div className="flex items-center gap-1.5 py-1">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        placeholder="New module…"
        className="flex-1 rounded-md border border-dashed border-brand-border px-2 py-1 text-xs outline-none"
      />
      <button onClick={add} title="Add" className="p-1 text-brand-dark"><Plus size={14} /></button>
    </div>
  );
}

const TAB_HINTS: Record<Tab, string> = {
  types: "Hiding a type removes it from the Type drop-down; tickets that already have it keep it. Task, Incident and Service Request are used by the app and can't be hidden.",
  modules: "Review this list first — it was started from every module already typed on a task. Renaming changes every task that uses the module; renaming to a name already in the list merges the two. Hiding removes it from the drop-downs only.",
  priorities: "The four priority levels are fixed because SLA targets depend on them. You can change the name shown and the colour.",
};

export default function ListsModal({ onChanged, onClose }: { onChanged: () => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("modules");
  const [error, setError] = useState("");
  const { data: lists, mutate } = useSWR<ListConfig>("/api/settings/lists", fetcher);
  const { data: usage, mutate: mutateUsage } = useSWR<Usage>("/api/settings/lists/usage", fetcher);
  const changed = () => { setError(""); mutate(); mutateUsage(); onChanged(); };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-none sm:max-w-[520px] h-full sm:h-auto max-h-none sm:max-h-[85vh] overflow-y-auto p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-1.5 font-bold text-[16px] text-brand-text">
            <ListTree size={16} className="text-brand-dark" /> Lists
          </h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>

        <div className="flex gap-1 mb-3 border-b border-brand-border">
          {([["modules", "Modules"], ["types", "Ticket Types"], ["priorities", "Priorities"]] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setTab(id); setError(""); }}
              className={`px-3 py-1.5 text-xs font-semibold -mb-px border-b-2 ${tab === id ? "border-brand-dark text-brand-dark" : "border-transparent text-brand-sub"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="text-[11.5px] text-brand-sub mb-3">{TAB_HINTS[tab]}</div>
        {error && <div className="mb-2 text-xs text-red-600">{error}</div>}

        {!lists ? (
          <div className="text-xs text-brand-sub">Loading…</div>
        ) : (
          <>
            <div className="flex flex-col divide-y divide-brand-border">
              {tab === "types" && lists.ticketTypes.map((t) => (
                <TypeRow key={`${t.code}-${t.label}-${t.short}-${t.color}`} t={t} used={usage?.types[t.code]} onChanged={changed} onError={setError} />
              ))}
              {tab === "modules" && lists.modules.map((m) => (
                <ModuleRow key={`${m.id}-${m.name}`} m={m} all={lists.modules} used={usage?.modules[m.name]} onChanged={changed} onError={setError} />
              ))}
              {tab === "priorities" && lists.priorities.map((p) => (
                <PriorityRow key={`${p.code}-${p.label}-${p.color}`} p={p} onChanged={changed} onError={setError} />
              ))}
            </div>
            {tab === "types" && <div className="mt-2"><AddType onChanged={changed} onError={setError} /></div>}
            {tab === "modules" && <div className="mt-2"><AddModule onChanged={changed} onError={setError} /></div>}
          </>
        )}
      </div>
    </div>
  );
}
