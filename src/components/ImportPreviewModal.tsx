"use client";

import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import type { ImportPreview } from "@/types/import";
import type { Project } from "@/types/models";

interface ImportPreviewModalProps {
  preview: ImportPreview;
  projects: Project[];
  /** Called with a fallback project id (or null to keep tasks without a project). */
  onConfirm: (fallbackProjectId: string | null) => void;
  onCancel: () => void;
  submitting: boolean;
}

export default function ImportPreviewModal({ preview, projects, onConfirm, onCancel, submitting }: ImportPreviewModalProps) {
  // Rows whose Project column was blank AND whose row didn't create a new
  // project of its own. Before this picker existed they landed as orphan
  // tasks in the workspace — easy to miss until they showed up under "no
  // project" filters. Now the modal makes the user pick one (or explicitly
  // opt out) before the import can go through.
  const orphanCount = preview.tasksToAdd.filter((t) => !t.projectId && !t.newProjectName).length;
  const [fallbackProjectId, setFallbackProjectId] = useState<string>("__unset__");

  const needsPick = orphanCount > 0 && fallbackProjectId === "__unset__";

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
        {orphanCount > 0 && (
          <div className="rounded-lg mt-2 p-2 border" style={{ background: "#FBEEDD", borderColor: "#EBD9BC" }}>
            <div className="flex items-center gap-1 text-[11.5px] font-semibold text-[#8A5A20] mb-1.5">
              <AlertTriangle size={12} /> {orphanCount} task{orphanCount === 1 ? "" : "s"} without a project
            </div>
            <div className="text-[11px] text-[#8A5A20] mb-1.5">
              These rows had the Project column blank. Pick where they should land:
            </div>
            <select
              value={fallbackProjectId}
              onChange={(e) => setFallbackProjectId(e.target.value)}
              className="w-full rounded-md px-2 py-1.5 text-xs border border-[#EBD9BC] bg-white text-brand-text"
            >
              <option value="__unset__" disabled>Select a project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              <option value="__none__">Leave without a project</option>
            </select>
          </div>
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
            onClick={() => onConfirm(fallbackProjectId === "__none__" || fallbackProjectId === "__unset__" ? null : fallbackProjectId)}
            disabled={preview.tasksToAdd.length === 0 || submitting || needsPick}
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-brand-dark text-white"
            style={{ opacity: preview.tasksToAdd.length === 0 || submitting || needsPick ? 0.5 : 1 }}
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
