"use client";

import { X } from "lucide-react";
import type { ImportPreview } from "@/types/import";

interface ImportPreviewModalProps {
  preview: ImportPreview;
  onConfirm: () => void;
  onCancel: () => void;
  submitting: boolean;
}

export default function ImportPreviewModal({ preview, onConfirm, onCancel, submitting }: ImportPreviewModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-2xl w-full max-w-[440px] max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[16px] text-brand-text">Import Preview</h2>
          <button onClick={onCancel} className="text-brand-sub"><X size={18} /></button>
        </div>

        <div className="text-sm text-brand-text mb-2">
          Found <b>{preview.tasksToAdd.length}</b> task{preview.tasksToAdd.length === 1 ? "" : "s"} to import.
        </div>
        {preview.newProjectNames.length > 0 && (
          <div className="text-xs text-brand-sub mb-1">New projects: {preview.newProjectNames.join(", ")}</div>
        )}
        {preview.warnings.length > 0 && (
          <div className="rounded-lg mt-1.5 p-2 text-[11.5px]" style={{ background: "#FBEEDD", color: "#8A5A20", maxHeight: 100, overflowY: "auto" }}>
            {preview.warnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
        )}
        <div className="rounded-lg mt-2.5 p-2 border border-brand-border" style={{ maxHeight: 180, overflowY: "auto" }}>
          {preview.tasksToAdd.length === 0 && (
            <div className="text-xs text-brand-sub">No valid rows found — check the template format.</div>
          )}
          {preview.tasksToAdd.slice(0, 25).map((t) => (
            <div key={t.tempId} className="text-xs py-0.5 text-brand-text">
              {t.code ? `[${t.code}] ` : ""}{t.title}
            </div>
          ))}
          {preview.tasksToAdd.length > 25 && (
            <div className="text-[11px] text-brand-sub">and {preview.tasksToAdd.length - 25} more…</div>
          )}
        </div>

        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={onConfirm}
            disabled={preview.tasksToAdd.length === 0 || submitting}
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-brand-dark text-white"
            style={{ opacity: preview.tasksToAdd.length === 0 || submitting ? 0.5 : 1 }}
          >
            {submitting ? "Importing…" : `Import ${preview.tasksToAdd.length} task${preview.tasksToAdd.length === 1 ? "" : "s"}`}
          </button>
          <button onClick={onCancel} className="flex-1 rounded-lg py-2.5 text-sm font-semibold border border-brand-border text-brand-text">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
