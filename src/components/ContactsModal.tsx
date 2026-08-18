"use client";

import { useState } from "react";
import { Plus, X, Trash2, Check } from "lucide-react";
import type { Contact, Project } from "@/types/models";

interface ContactsModalProps {
  contacts: Contact[];
  projects: Project[];
  onClose: () => void;
  onChanged: () => void;
}

export default function ContactsModal({ contacts, projects, onClose, onChanged }: ContactsModalProps) {
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newProjectId, setNewProjectId] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function addContact() {
    if (!newName.trim()) return;
    setError("");
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), projectId: newProjectId || null, email: newEmail.trim() || null }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't add contact");
      setNewName("");
      setNewEmail("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add contact");
    }
  }

  async function renameContact(id: string, name: string) {
    if (!name.trim()) return;
    await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    onChanged();
  }

  async function updateContactEmail(id: string, email: string) {
    await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() || null }),
    });
    onChanged();
  }

  async function reassignContact(id: string, projectId: string) {
    await fetch(`/api/contacts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: projectId || null }),
    });
    onChanged();
  }

  async function deleteContact(id: string) {
    await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    setConfirmingId(null);
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-2xl w-full max-w-[440px] max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[16px] text-brand-text">Manage Contacts</h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>
        <div className="text-[11.5px] text-brand-sub mb-3">
          Contacts are external people (no login) you can assign tasks to. Each one belongs to a single project —
          only assignable on that project&apos;s tasks, so people from one client don&apos;t show up on another&apos;s. Deleting
          a contact unassigns it from any tasks that used it — those tasks are kept.
        </div>
        {error && <div className="mb-3 text-xs text-red-600">{error}</div>}

        <div>
          {contacts.length === 0 && <div className="text-xs text-brand-sub py-2">No contacts yet</div>}
          {contacts.map((c) => {
            const isConfirming = confirmingId === c.id;
            return (
              <div key={c.id} className="flex items-center gap-2 py-1.5 border-b border-brand-border flex-wrap">
                <input
                  defaultValue={c.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== c.name) renameContact(c.id, v);
                  }}
                  className="flex-1 min-w-[100px] text-[13px] bg-transparent outline-none text-brand-text"
                />
                <input
                  type="email"
                  defaultValue={c.email ?? ""}
                  placeholder="email"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v !== (c.email ?? "")) updateContactEmail(c.id, v);
                  }}
                  className="w-[150px] text-[11.5px] bg-transparent outline-none text-brand-sub border-b border-transparent focus:border-brand-border"
                />
                <select
                  value={c.projectId ?? ""}
                  onChange={(e) => reassignContact(c.id, e.target.value)}
                  className="text-[11px] rounded-lg border border-brand-border px-1.5 py-1 outline-none bg-white text-brand-sub"
                >
                  <option value="">No project</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button
                  onClick={() => (isConfirming ? deleteContact(c.id) : setConfirmingId(c.id))}
                  title={isConfirming ? "Click to confirm delete" : "Delete"}
                  style={{ color: isConfirming ? "#C4443D" : "#5B6B64" }}
                >
                  {isConfirming ? <Check size={16} /> : <Trash2 size={16} />}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex gap-2 mt-3 flex-wrap">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New contact name"
            className="flex-1 min-w-[140px] rounded-lg border border-brand-border px-3 py-2 text-sm outline-none"
          />
          <input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            type="email"
            placeholder="Email (optional)"
            className="flex-1 min-w-[140px] rounded-lg border border-brand-border px-3 py-2 text-sm outline-none"
          />
          <select
            value={newProjectId}
            onChange={(e) => setNewProjectId(e.target.value)}
            className="rounded-lg border border-brand-border px-2 text-sm outline-none bg-white text-brand-text"
          >
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button onClick={addContact} className="rounded-lg px-3 bg-brand-dark text-white">
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
