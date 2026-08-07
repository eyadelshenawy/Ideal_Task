"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Plus, X, Trash2, Check, Link2, Copy, FolderPlus, SlidersHorizontal, Timer } from "lucide-react";
import type { Project, Priority } from "@/types/models";
import type { SlaTargets } from "@/lib/sla";
import type { SlaConfigDto } from "@/lib/slaConfig";
import { todayStr } from "@/lib/taskHelpers";

const SLA_ROWS: { key: Priority; label: string }[] = [
  { key: "HIGH", label: "High" },
  { key: "MEDIUM", label: "Medium" },
  { key: "LOW", label: "Low" },
];

function ProjectSlaEditor({ projectId }: { projectId: string }) {
  const { data, mutate } = useSWR<SlaConfigDto | null>(`/api/projects/${projectId}/sla`, fieldsFetcher);
  const [targets, setTargets] = useState<SlaTargets | null>(null);
  const [cutoffDate, setCutoffDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const hasOverride = data !== null && data !== undefined;

  useEffect(() => {
    if (data) {
      setTargets(data.targets);
      setCutoffDate(data.cutoffDate ?? "");
    }
  }, [data]);

  function startCustom() {
    setTargets({ HIGH: { responseHours: 4, resolutionDays: 2 }, MEDIUM: { responseHours: 24, resolutionDays: 5 }, LOW: { responseHours: 48, resolutionDays: 10 } });
  }

  function setField(priority: Priority, field: "responseHours" | "resolutionDays", value: number) {
    if (!targets) return;
    setTargets({ ...targets, [priority]: { ...targets[priority], [field]: value } });
  }

  async function save() {
    if (!targets) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/projects/${projectId}/sla`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targets, cutoffDate: cutoffDate || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't save");
      await mutate(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    setSaving(true);
    await fetch(`/api/projects/${projectId}/sla`, { method: "DELETE" });
    setTargets(null);
    setCutoffDate("");
    await mutate(null);
    setSaving(false);
  }

  return (
    <div className="mt-2 p-2 rounded-lg bg-brand-bg flex flex-col gap-1.5">
      <div className="text-[10.5px] text-brand-sub">
        Response/resolution targets for this project only. Leave as default to use the shared numbers (Reports → SLA → Edit default targets).
      </div>
      {!hasOverride ? (
        <button onClick={startCustom} className="rounded-lg px-3 py-1 text-[11px] font-semibold border border-brand-border text-brand-text self-start">
          Set custom targets for this project
        </button>
      ) : (
        <>
          <div className="grid grid-cols-[60px_1fr_1fr] gap-1.5 text-[9.5px] font-bold text-brand-sub uppercase tracking-wide">
            <span>Priority</span>
            <span>Response (h)</span>
            <span>Resolution (d)</span>
          </div>
          {targets && SLA_ROWS.map((r) => (
            <div key={r.key} className="grid grid-cols-[60px_1fr_1fr] gap-1.5 items-center">
              <span className="text-[12px] text-brand-text font-semibold">{r.label}</span>
              <input
                type="number" min={1}
                value={targets[r.key].responseHours}
                onChange={(e) => setField(r.key, "responseHours", Number(e.target.value))}
                className="rounded-lg border border-brand-border px-1.5 py-1 text-xs outline-none"
              />
              <input
                type="number" min={1}
                value={targets[r.key].resolutionDays}
                onChange={(e) => setField(r.key, "resolutionDays", Number(e.target.value))}
                className="rounded-lg border border-brand-border px-1.5 py-1 text-xs outline-none"
              />
            </div>
          ))}
          <div>
            <label className="text-[10.5px] font-semibold text-brand-sub">Only apply to tasks created on/after</label>
            <input
              type="date"
              value={cutoffDate}
              onChange={(e) => setCutoffDate(e.target.value)}
              className="w-full mt-1 rounded-lg border border-brand-border px-2 py-1 text-xs outline-none"
            />
          </div>
          {error && <div className="text-[11px] text-red-600">{error}</div>}
          <div className="flex gap-1.5 justify-end">
            <button onClick={resetToDefault} disabled={saving} className="text-[11px] text-brand-sub underline disabled:opacity-50">
              Use default instead
            </button>
            <button onClick={save} disabled={saving} className="rounded-lg px-3 py-1 text-[11px] font-semibold bg-brand-dark text-white disabled:opacity-50">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

type CustomFieldType = "TEXT" | "NUMBER" | "SELECT";
interface CustomFieldDef {
  id: string;
  name: string;
  type: CustomFieldType;
  options: string[];
}

const fieldsFetcher = (url: string) => fetch(url).then((r) => r.json());

function CustomFieldsEditor({ projectId }: { projectId: string }) {
  const { data: fields, mutate } = useSWR<CustomFieldDef[]>(`/api/projects/${projectId}/custom-fields`, fieldsFetcher);
  const [name, setName] = useState("");
  const [type, setType] = useState<CustomFieldType>("TEXT");
  const [optionsText, setOptionsText] = useState("");
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);

  async function addField() {
    if (!name.trim()) return;
    setAdding(true);
    setError("");
    try {
      const options = optionsText.split(",").map((o) => o.trim()).filter(Boolean);
      const res = await fetch(`/api/projects/${projectId}/custom-fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), type, options }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't add field");
      setName("");
      setOptionsText("");
      setType("TEXT");
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add field");
    } finally {
      setAdding(false);
    }
  }

  async function removeField(id: string) {
    await fetch(`/api/custom-fields/${id}`, { method: "DELETE" });
    await mutate();
  }

  return (
    <div className="mt-2 p-2 rounded-lg bg-brand-bg flex flex-col gap-1.5">
      <div className="text-[10.5px] text-brand-sub">
        Extra fields shown on every task in this project only — e.g. a SAP transaction code. Text, number, or a dropdown of choices.
      </div>
      {(fields ?? []).map((f) => (
        <div key={f.id} className="flex items-center gap-1.5 text-xs text-brand-text bg-white rounded-lg px-2 py-1 border border-brand-border">
          <span className="flex-1">{f.name}</span>
          <span className="text-[10px] text-brand-sub uppercase">{f.type}{f.type === "SELECT" ? ` (${f.options.length})` : ""}</span>
          <button onClick={() => removeField(f.id)} className="text-brand-sub hover:text-red-600"><Trash2 size={12} /></button>
        </div>
      ))}
      {(fields ?? []).length === 0 && <div className="text-[11px] text-brand-sub">No custom fields yet</div>}

      <div className="flex gap-1.5 mt-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Field name"
          className="flex-1 rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as CustomFieldType)}
          className="rounded-lg border border-brand-border px-1.5 py-1.5 text-xs outline-none"
        >
          <option value="TEXT">Text</option>
          <option value="NUMBER">Number</option>
          <option value="SELECT">Dropdown</option>
        </select>
      </div>
      {type === "SELECT" && (
        <input
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
          placeholder="Options, comma-separated"
          className="rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none"
        />
      )}
      {error && <div className="text-[11px] text-red-600">{error}</div>}
      <button
        onClick={addField}
        disabled={adding || !name.trim()}
        className="rounded-lg px-3 py-1 text-[11px] font-semibold bg-brand-dark text-white disabled:opacity-50 self-end"
      >
        {adding ? "Adding…" : "+ Add field"}
      </button>
    </div>
  );
}

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
  const [fieldsOpenId, setFieldsOpenId] = useState<string | null>(null);
  const [slaOpenId, setSlaOpenId] = useState<string | null>(null);

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

  async function toggleSlaTracking(id: string, enabled: boolean) {
    await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slaTrackingEnabled: enabled }),
    });
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
                  <button
                    onClick={() => setFieldsOpenId(fieldsOpenId === p.id ? null : p.id)}
                    className="flex items-center gap-1 text-[11px] text-brand-sub underline"
                  >
                    <SlidersHorizontal size={11} /> Custom fields
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <label className="flex items-center gap-1 text-[11px] text-brand-sub">
                    <input
                      type="checkbox"
                      checked={p.slaTrackingEnabled}
                      onChange={(e) => toggleSlaTracking(p.id, e.target.checked)}
                    />
                    Track SLA (support/ticket projects only)
                  </label>
                  {p.slaTrackingEnabled && (
                    <button
                      onClick={() => setSlaOpenId(slaOpenId === p.id ? null : p.id)}
                      className="flex items-center gap-1 text-[11px] text-brand-sub underline"
                    >
                      <Timer size={11} /> SLA targets
                    </button>
                  )}
                </div>

                {fieldsOpenId === p.id && <CustomFieldsEditor projectId={p.id} />}
                {slaOpenId === p.id && p.slaTrackingEnabled && <ProjectSlaEditor projectId={p.id} />}

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
