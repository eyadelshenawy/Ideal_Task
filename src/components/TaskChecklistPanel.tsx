"use client";

import { useState } from "react";
import useSWR from "swr";
import { ListTodo, X } from "lucide-react";

interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  order: number;
}
interface ChecklistTemplate {
  id: string;
  name: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function TaskChecklistPanel({ taskId }: { taskId: string }) {
  const { data: items, mutate } = useSWR<ChecklistItem[]>(`/api/tasks/${taskId}/checklist`, fetcher);
  const { data: templates } = useSWR<ChecklistTemplate[]>("/api/checklist-templates", fetcher);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState(false);

  async function applyTemplate(templateId: string) {
    if (!templateId) return;
    setApplyingTemplate(true);
    try {
      await fetch(`/api/tasks/${taskId}/checklist/apply-template`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId }),
      });
      await mutate();
    } finally {
      setApplyingTemplate(false);
    }
  }

  async function addItem() {
    if (!draft.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`/api/tasks/${taskId}/checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft.trim() }),
      });
      setDraft("");
      await mutate();
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleItem(item: ChecklistItem) {
    await fetch(`/api/tasks/${taskId}/checklist/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !item.done }),
    });
    await mutate();
  }

  async function deleteItem(id: string) {
    await fetch(`/api/tasks/${taskId}/checklist/${id}`, { method: "DELETE" });
    await mutate();
  }

  const doneCount = items?.filter((i) => i.done).length ?? 0;

  return (
    <div className="border-t border-brand-border mt-4 pt-3">
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-sub">
          <ListTodo size={13} /> Checklist {items && items.length > 0 && `(${doneCount}/${items.length})`}
        </div>
        {templates && templates.length > 0 && (
          <select
            value=""
            disabled={applyingTemplate}
            onChange={(e) => applyTemplate(e.target.value)}
            className="text-[11px] rounded-lg border border-brand-border px-1.5 py-1 outline-none text-brand-sub disabled:opacity-50"
          >
            <option value="" disabled>{applyingTemplate ? "Applying…" : "Apply template…"}</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
      </div>

      <div className="flex flex-col gap-1 mb-2">
        {items?.map((item) => (
          <div key={item.id} className="flex items-center gap-2 group">
            <input type="checkbox" checked={item.done} onChange={() => toggleItem(item)} />
            <span className={`text-[12.5px] flex-1 ${item.done ? "line-through text-brand-sub" : "text-brand-text"}`}>
              {item.text}
            </span>
            <button onClick={() => deleteItem(item.id)} className="p-0.5 rounded hover:bg-gray-100 text-brand-sub opacity-0 group-hover:opacity-100">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
          onBlur={addItem}
          placeholder="Add a step…"
          className="flex-1 min-w-0 rounded-lg border border-brand-border px-2.5 py-1.5 text-xs outline-none"
        />
        <button
          onClick={addItem}
          disabled={submitting || !draft.trim()}
          className="rounded-lg px-3 text-xs font-semibold bg-brand-dark text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
