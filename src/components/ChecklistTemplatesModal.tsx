"use client";

import { useState } from "react";
import useSWR from "swr";
import { X, Trash2, Plus, ListChecks } from "lucide-react";

interface TemplateItem {
  id: string;
  text: string;
  order: number;
}
interface Template {
  id: string;
  name: string;
  items: TemplateItem[];
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function ChecklistTemplatesModal({ onClose }: { onClose: () => void }) {
  const { data: templates, mutate } = useSWR<Template[]>("/api/checklist-templates", fetcher);
  const [name, setName] = useState("");
  const [itemsText, setItemsText] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function addTemplate() {
    const items = itemsText.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!name.trim() || items.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/checklist-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), items }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't create template");
      setName("");
      setItemsText("");
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create template");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    await fetch(`/api/checklist-templates/${id}`, { method: "DELETE" });
    await mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-2xl w-full max-w-[420px] max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[16px] text-brand-text">Checklist Templates</h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>
        <div className="text-[11.5px] text-brand-sub mb-3">
          A named, reusable set of steps — apply it to any task&apos;s checklist in one click instead of typing them each time.
        </div>

        <div className="flex flex-col gap-2 mb-4">
          {(templates ?? []).map((t) => (
            <div key={t.id} className="border border-brand-border rounded-[10px] px-3 py-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-text">
                  <ListChecks size={13} /> {t.name}
                </span>
                <button onClick={() => deleteTemplate(t.id)} className="text-brand-sub hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
              <ul className="mt-1 pl-4 list-disc text-[11.5px] text-brand-sub">
                {t.items.map((i) => <li key={i.id}>{i.text}</li>)}
              </ul>
            </div>
          ))}
          {templates && templates.length === 0 && (
            <div className="text-[12px] text-brand-sub text-center py-4">No templates yet</div>
          )}
        </div>

        <div className="border-t border-brand-border pt-3 flex flex-col gap-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Template name, e.g. SAP PO ticket diagnosis"
            className="rounded-lg border border-brand-border px-3 py-2 text-sm outline-none"
          />
          <textarea
            value={itemsText}
            onChange={(e) => setItemsText(e.target.value)}
            placeholder={"One step per line, e.g.\nConfirm the PO number\nCheck the transaction log\nIdentify the affected module"}
            rows={4}
            className="rounded-lg border border-brand-border px-3 py-2 text-sm outline-none resize-none"
          />
          {error && <div className="text-xs text-red-600">{error}</div>}
          <button
            onClick={addTemplate}
            disabled={saving || !name.trim() || !itemsText.trim()}
            className="flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold bg-brand-dark text-white disabled:opacity-50"
          >
            <Plus size={14} /> {saving ? "Creating…" : "Create template"}
          </button>
        </div>
      </div>
    </div>
  );
}
