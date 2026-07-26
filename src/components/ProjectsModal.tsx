"use client";

import { useState } from "react";
import { Plus, X, Trash2, Check } from "lucide-react";
import type { Project } from "@/types/models";

interface ProjectsModalProps {
  projects: Project[];
  onClose: () => void;
  onChanged: () => void;
}

export default function ProjectsModal({ projects, onClose, onChanged }: ProjectsModalProps) {
  const [newName, setNewName] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function addProject() {
    if (!newName.trim()) return;
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't add project");
      setNewName("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add project");
    }
  }

  async function renameProject(id: string, name: string) {
    if (!name.trim()) return;
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    onChanged();
  }

  async function deleteProject(id: string) {
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setConfirmingId(null);
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-2xl w-full max-w-[400px] max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[16px] text-brand-text">Manage Projects</h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>
        <div className="text-[11.5px] text-brand-sub mb-3">
          Deleting a project unassigns it from any tasks that used it — those tasks are kept.
        </div>
        {error && <div className="mb-3 text-xs text-red-600">{error}</div>}

        <div>
          {projects.map((p) => {
            const isConfirming = confirmingId === p.id;
            return (
              <div key={p.id} className="flex items-center gap-2 py-1.5 border-b border-brand-border">
                <input
                  defaultValue={p.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== p.name) renameProject(p.id, v);
                  }}
                  className="flex-1 text-[13px] bg-transparent outline-none text-brand-text"
                />
                <button
                  onClick={() => (isConfirming ? deleteProject(p.id) : setConfirmingId(p.id))}
                  title={isConfirming ? "Click to confirm delete" : "Delete"}
                  style={{ color: isConfirming ? "#C4443D" : "#5B6B64" }}
                >
                  {isConfirming ? <Check size={16} /> : <Trash2 size={16} />}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 mt-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New project or client name"
            className="flex-1 rounded-lg border border-brand-border px-3 py-2 text-sm outline-none"
          />
          <button onClick={addProject} className="rounded-lg px-3 bg-brand-dark text-white">
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
