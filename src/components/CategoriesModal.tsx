"use client";

import { useState } from "react";
import { X, Plus, Pencil, Trash2, Check, FolderTree, CornerDownRight } from "lucide-react";
import type { Category } from "@/types/models";

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

function Row({ cat, isSub, onChanged, onError }: {
  cat: Category; isSub: boolean; onChanged: () => void; onError: (e: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function save() {
    const err = await call(`/api/categories/${cat.id}`, "PATCH", { name });
    if (err) return onError(err);
    setEditing(false);
    onChanged();
  }

  async function remove() {
    const err = await call(`/api/categories/${cat.id}`, "DELETE");
    if (err) return onError(err);
    onChanged();
  }

  return (
    <div className={`flex items-center gap-1.5 py-1 ${isSub ? "pl-5" : ""}`}>
      {isSub && <CornerDownRight size={12} className="text-brand-sub flex-shrink-0" />}
      {editing ? (
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setName(cat.name); } }}
          className="flex-1 rounded-md border border-brand-border px-2 py-1 text-xs outline-none"
        />
      ) : (
        <span className={`flex-1 text-[12.5px] ${isSub ? "text-brand-text" : "font-semibold text-brand-text"}`}>{cat.name}</span>
      )}
      {editing ? (
        <button onClick={save} title="Save" className="p-1 text-brand-dark"><Check size={13} /></button>
      ) : (
        <button onClick={() => setEditing(true)} title="Rename" className="p-1 text-brand-sub"><Pencil size={13} /></button>
      )}
      <button
        onClick={() => (confirmingDelete ? remove() : setConfirmingDelete(true))}
        title={confirmingDelete ? (isSub ? "Click to confirm" : "Click to confirm — its subcategories go too") : "Delete"}
        className="p-1"
        style={{ color: confirmingDelete ? "#C4443D" : "#5B6B64" }}
      >
        {confirmingDelete ? <Check size={13} /> : <Trash2 size={13} />}
      </button>
    </div>
  );
}

function AddRow({ parentId, placeholder, onChanged, onError }: {
  parentId: string | null; placeholder: string; onChanged: () => void; onError: (e: string) => void;
}) {
  const [name, setName] = useState("");
  async function add() {
    if (!name.trim()) return;
    const err = await call("/api/categories", "POST", { name: name.trim(), parentId });
    if (err) return onError(err);
    setName("");
    onChanged();
  }
  return (
    <div className={`flex items-center gap-1.5 py-1 ${parentId ? "pl-5" : ""}`}>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        placeholder={placeholder}
        className="flex-1 rounded-md border border-dashed border-brand-border px-2 py-1 text-xs outline-none"
      />
      <button onClick={add} title="Add" className="p-1 text-brand-dark"><Plus size={14} /></button>
    </div>
  );
}

export default function CategoriesModal({ categories, onChanged, onClose }: {
  categories: Category[]; onChanged: () => void; onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const top = categories.filter((c) => !c.parentId);
  const changed = () => { setError(""); onChanged(); };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-none sm:max-w-[480px] h-full sm:h-auto max-h-none sm:max-h-[85vh] overflow-y-auto p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="flex items-center gap-1.5 font-bold text-[16px] text-brand-text">
            <FolderTree size={16} className="text-brand-dark" /> Ticket Categories
          </h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>
        <div className="text-[11.5px] text-brand-sub mb-3">
          One list for every project. Click a category to manage its subcategories. Deleting a category clears it from tickets that use it — nothing else on those tickets changes.
        </div>
        {error && <div className="mb-2 text-xs text-red-600">{error}</div>}

        <div className="flex flex-col divide-y divide-brand-border">
          {top.map((c) => {
            const subs = categories.filter((x) => x.parentId === c.id);
            return (
              <div key={c.id} className="py-1">
                <div onClick={() => setOpenId(openId === c.id ? null : c.id)} className="cursor-pointer">
                  <Row cat={c} isSub={false} onChanged={changed} onError={setError} />
                </div>
                {openId !== c.id && subs.length > 0 && (
                  <div className="pl-5 text-[11px] text-brand-sub">{subs.length} subcategor{subs.length === 1 ? "y" : "ies"}</div>
                )}
                {openId === c.id && (
                  <>
                    {subs.map((sub) => <Row key={sub.id} cat={sub} isSub onChanged={changed} onError={setError} />)}
                    <AddRow parentId={c.id} placeholder={`New subcategory under ${c.name}…`} onChanged={changed} onError={setError} />
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2">
          <AddRow parentId={null} placeholder="New category…" onChanged={changed} onError={setError} />
        </div>
      </div>
    </div>
  );
}
