"use client";

import { useState } from "react";
import { Plus, X, Trash2, Check, Link2, Copy, FolderPlus } from "lucide-react";
import type { Project } from "@/types/models";
import { todayStr } from "@/lib/taskHelpers";

interface ProjectsModalProps {
  projects: Project[];
  onClose: () => void;
  onChanged: () => void;
}

export default function ProjectsModal({ projects, onClose, onChanged }: ProjectsModalProps) {
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [cloneName, setCloneName] = useState("");
  const [cloneCode, setCloneCode] = useState("");
  const [cloneStartDate, setCloneStartDate] = useState(todayStr());
  const [cloning, setCloning] = useState(false);

  async function addProject() {
    if (!newName.trim() || !newCode.trim()) return;
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), code: newCode.trim() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't add project");
      setNewName("");
      setNewCode("");
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

  async function recodeProject(id: string, code: string) {
    if (!code.trim()) return;
    setError("");
    const res = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Couldn't update code");
    }
    onChanged();
  }

  async function deleteProject(id: string) {
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setConfirmingId(null);
    onChanged();
  }

  async function generateShareLink(id: string) {
    const res = await fetch(`/api/projects/${id}/share`, { method: "POST" });
    if (res.ok) onChanged();
  }

  async function revokeShareLink(id: string) {
    const res = await fetch(`/api/projects/${id}/share`, { method: "DELETE" });
    if (res.ok) onChanged();
  }

  function shareUrl(token: string) {
    return `${window.location.origin}/share/${token}`;
  }

  async function copyShareLink(token: string) {
    try {
      await navigator.clipboard.writeText(shareUrl(token));
    } catch {
      // clipboard access can fail silently in some browser contexts — no harm done
    }
  }

  function startCloning(p: Project) {
    setCloningId(p.id);
    setCloneName(`${p.name} (copy)`);
    setCloneCode("");
    setCloneStartDate(todayStr());
    setError("");
  }

  async function confirmClone() {
    if (!cloningId || !cloneName.trim() || !cloneCode.trim()) return;
    setCloning(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${cloningId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cloneName.trim(), code: cloneCode.trim(), startDate: cloneStartDate }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't clone project");
      setCloningId(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't clone project");
    } finally {
      setCloning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-2xl w-full max-w-[400px] max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[16px] text-brand-text">Manage Projects</h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>
        <div className="text-[11.5px] text-brand-sub mb-3">
          Deleting a project moves it to Trash — its tasks are kept as-is and can be restored together.
        </div>
        {error && <div className="mb-3 text-xs text-red-600">{error}</div>}

        <div>
          {projects.map((p) => {
            const isConfirming = confirmingId === p.id;
            return (
              <div key={p.id} className="py-1.5 border-b border-brand-border">
                <div className="flex items-center gap-2">
                  <input
                    defaultValue={p.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== p.name) renameProject(p.id, v);
                    }}
                    className="flex-1 text-[13px] bg-transparent outline-none text-brand-text"
                  />
                  <input
                    defaultValue={p.code}
                    onBlur={(e) => {
                      const v = e.target.value.trim().toUpperCase();
                      if (v && v !== p.code) recodeProject(p.id, v);
                    }}
                    title="Task code prefix"
                    className="w-[70px] flex-shrink-0 text-[12px] font-mono bg-transparent outline-none text-brand-sub uppercase"
                  />
                  <button
                    onClick={() => (isConfirming ? deleteProject(p.id) : setConfirmingId(p.id))}
                    title={isConfirming ? "Click to confirm delete" : "Delete"}
                    style={{ color: isConfirming ? "#C4443D" : "#5B6B64" }}
                  >
                    {isConfirming ? <Check size={16} /> : <Trash2 size={16} />}
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {p.shareToken ? (
                    <>
                      <span className="flex items-center gap-1 text-[11px] text-brand-dark">
                        <Link2 size={11} /> Shared publicly
                      </span>
                      <button onClick={() => copyShareLink(p.shareToken!)} title="Copy link" className="p-0.5 text-brand-sub hover:text-brand-text">
                        <Copy size={12} />
                      </button>
                      <button onClick={() => revokeShareLink(p.id)} className="text-[11px] text-red-600 underline">
                        Revoke
                      </button>
                    </>
                  ) : (
                    <button onClick={() => generateShareLink(p.id)} className="flex items-center gap-1 text-[11px] text-brand-sub underline">
                      <Link2 size={11} /> Create public status link
                    </button>
                  )}
                  <button onClick={() => startCloning(p)} className="flex items-center gap-1 text-[11px] text-brand-sub underline">
                    <FolderPlus size={11} /> Use as template
                  </button>
                </div>

                {cloningId === p.id && (
                  <div className="mt-2 p-2 rounded-lg bg-brand-bg flex flex-col gap-1.5">
                    <div className="text-[10.5px] text-brand-sub">
                      Creates a new project with every task from &quot;{p.name}&quot; copied over (structure and dates only — no assignees, comments, or files), shifted to start on the date below.
                    </div>
                    <input
                      value={cloneName}
                      onChange={(e) => setCloneName(e.target.value)}
                      placeholder="New project name"
                      className="rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none"
                    />
                    <div className="flex gap-1.5">
                      <input
                        value={cloneCode}
                        onChange={(e) => setCloneCode(e.target.value.toUpperCase())}
                        placeholder="CODE"
                        className="w-[80px] rounded-lg border border-brand-border px-2 py-1.5 text-xs font-mono outline-none uppercase"
                      />
                      <input
                        type="date"
                        value={cloneStartDate}
                        onChange={(e) => setCloneStartDate(e.target.value)}
                        className="flex-1 rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none"
                      />
                    </div>
                    <div className="flex gap-1.5 justify-end">
                      <button onClick={() => setCloningId(null)} className="text-[11px] text-brand-sub px-2 py-1">Cancel</button>
                      <button
                        onClick={confirmClone}
                        disabled={cloning || !cloneName.trim() || !cloneCode.trim()}
                        className="rounded-lg px-3 py-1 text-[11px] font-semibold bg-brand-dark text-white disabled:opacity-50"
                      >
                        {cloning ? "Cloning…" : "Create"}
                      </button>
                    </div>
                  </div>
                )}
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
          <input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            placeholder="CODE"
            title="Task code prefix, e.g. APEX"
            className="w-[80px] rounded-lg border border-brand-border px-2 py-2 text-sm font-mono outline-none uppercase"
          />
          <button onClick={addProject} className="rounded-lg px-3 bg-brand-dark text-white">
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
