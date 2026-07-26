"use client";

import { useState } from "react";
import { Plus, X, Shield, ToggleLeft, ToggleRight, RotateCcw } from "lucide-react";
import type { TeamMember } from "@/types/models";

interface TeamModalProps {
  team: TeamMember[];
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}

export default function TeamModal({ team, currentUserId, onClose, onChanged }: TeamModalProps) {
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [tempPasswordInfo, setTempPasswordInfo] = useState<{ name: string; password: string } | null>(null);

  async function addMember() {
    if (!newName.trim() || !newEmail.trim()) return;
    setError("");
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), email: newEmail.trim(), role: "MEMBER" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't add member");
      setTempPasswordInfo({ name: newName.trim(), password: body.tempPassword });
      setNewName("");
      setNewEmail("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add member");
    }
  }

  async function patchMember(id: string, data: Record<string, unknown>) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/team/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Couldn't update member");
      if (body.tempPassword) {
        setTempPasswordInfo({ name: body.user.name, password: body.tempPassword });
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update member");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-2xl w-full max-w-[420px] max-h-[85vh] overflow-y-auto p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[16px] text-brand-text">Manage Team</h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>
        <div className="text-[11.5px] text-brand-sub mb-3">
          Toggle a member to Inactive when they leave — their past tasks stay untouched. The shield marks who can
          create tasks, projects and team members.
        </div>

        {tempPasswordInfo && (
          <div className="mb-3 rounded-lg px-3 py-2 text-xs" style={{ background: "#E4EFE8", color: "#0A5A46" }}>
            Temporary password for <b>{tempPasswordInfo.name}</b>:{" "}
            <span className="font-mono">{tempPasswordInfo.password}</span>
            <div className="text-[11px] mt-1">Share this with them — they&apos;ll set their own password on first login.</div>
            <button onClick={() => setTempPasswordInfo(null)} className="text-[11px] underline mt-1">Dismiss</button>
          </div>
        )}
        {error && <div className="mb-3 text-xs text-red-600">{error}</div>}

        <div>
          {team.map((m) => {
            const isSelf = m.id === currentUserId;
            return (
              <div
                key={m.id}
                className="flex items-center gap-2 py-1.5 border-b border-brand-border"
                style={{ opacity: m.active ? 1 : 0.55 }}
              >
                <div className="flex-1 min-w-0">
                  <input
                    defaultValue={m.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== m.name) patchMember(m.id, { name: v });
                    }}
                    className="text-[13px] bg-transparent outline-none w-full text-brand-text"
                  />
                  <div className="text-[11px] text-brand-sub truncate">{m.email}</div>
                </div>
                <button
                  onClick={() => !isSelf && patchMember(m.id, { role: m.role === "ADMIN" ? "MEMBER" : "ADMIN" })}
                  disabled={isSelf || busyId === m.id}
                  title={isSelf ? "You can't change your own admin access here" : (m.role === "ADMIN" ? "Remove admin access" : "Grant admin access")}
                  style={{ color: m.role === "ADMIN" ? "#0A5A46" : "#C7CFCB", cursor: isSelf ? "not-allowed" : "pointer" }}
                >
                  <Shield size={17} fill={m.role === "ADMIN" ? "#0A5A46" : "none"} />
                </button>
                <button
                  onClick={() => !isSelf && patchMember(m.id, { active: !m.active })}
                  disabled={isSelf || busyId === m.id}
                  title={isSelf ? "You can't deactivate yourself" : (m.active ? "Mark as inactive" : "Mark as active")}
                  style={{ color: m.active ? "#0A5A46" : "#5B6B64", cursor: isSelf ? "not-allowed" : "pointer" }}
                >
                  {m.active ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                </button>
                <button
                  onClick={() => patchMember(m.id, { resetPassword: true })}
                  disabled={busyId === m.id}
                  title="Reset password"
                  className="text-brand-sub"
                >
                  <RotateCcw size={15} />
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 mt-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New team member name"
            className="rounded-lg border border-brand-border px-3 py-2 text-sm outline-none"
          />
          <div className="flex gap-2">
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email"
              type="email"
              className="flex-1 rounded-lg border border-brand-border px-3 py-2 text-sm outline-none"
            />
            <button onClick={addMember} className="rounded-lg px-3 bg-brand-dark text-white">
              <Plus size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
