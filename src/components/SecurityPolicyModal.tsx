"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { X, ShieldCheck, Loader2 } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface Policy {
  sessionIdleTimeoutMinutes: number;
  passwordExpiryDays: number;
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireNumber: boolean;
  passwordRequireSymbol: boolean;
}

export default function SecurityPolicyModal({ onClose }: { onClose: () => void }) {
  const { data } = useSWR<Policy>("/api/settings/security", fetcher);
  const [draft, setDraft] = useState<Policy | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (data) setDraft(data); }, [data]);

  async function save() {
    if (!draft) return;
    setSaving(true); setError("");
    const r = await fetch("/api/settings/security", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Couldn't save.");
      return;
    }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-none sm:max-w-[520px] h-full sm:h-auto max-h-none sm:max-h-[90vh] overflow-y-auto p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[16px] text-brand-text flex items-center gap-2">
            <ShieldCheck size={18} className="text-brand-dark" /> Security Policy
          </h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>

        <div className="text-[12.5px] text-brand-sub mb-4">
          Org-wide rules. Applies to every account on the next sign-in or password change.
        </div>

        {!draft && <div className="text-sm text-brand-sub text-center py-8">Loading…</div>}

        {draft && (
          <div className="flex flex-col gap-4">
            <section>
              <div className="font-semibold text-[13px] text-brand-text mb-1">Session</div>
              <label className="block text-xs text-brand-sub">Auto-logout after inactivity (minutes)</label>
              <input
                type="number"
                min={0}
                max={240}
                value={draft.sessionIdleTimeoutMinutes}
                onChange={(e) => setDraft({ ...draft, sessionIdleTimeoutMinutes: Number(e.target.value) || 0 })}
                className="w-28 mt-1 rounded-lg border border-brand-border px-3 py-1.5 text-sm outline-none"
              />
              <div className="text-[11px] text-brand-sub mt-1">Set 0 to disable idle logout.</div>
            </section>

            <section>
              <div className="font-semibold text-[13px] text-brand-text mb-1">Passwords</div>

              <label className="block text-xs text-brand-sub mt-2">Expire passwords after (days)</label>
              <input
                type="number"
                min={0}
                max={365}
                value={draft.passwordExpiryDays}
                onChange={(e) => setDraft({ ...draft, passwordExpiryDays: Number(e.target.value) || 0 })}
                className="w-28 mt-1 rounded-lg border border-brand-border px-3 py-1.5 text-sm outline-none"
              />
              <div className="text-[11px] text-brand-sub mt-1">Set 0 to never expire.</div>

              <label className="block text-xs text-brand-sub mt-3">Minimum length</label>
              <input
                type="number"
                min={6}
                max={64}
                value={draft.passwordMinLength}
                onChange={(e) => setDraft({ ...draft, passwordMinLength: Number(e.target.value) || 0 })}
                className="w-28 mt-1 rounded-lg border border-brand-border px-3 py-1.5 text-sm outline-none"
              />

              <div className="flex flex-col gap-1 mt-3">
                <label className="flex items-center gap-2 text-xs text-brand-text">
                  <input
                    type="checkbox"
                    checked={draft.passwordRequireUppercase}
                    onChange={(e) => setDraft({ ...draft, passwordRequireUppercase: e.target.checked })}
                  />
                  Require an uppercase letter
                </label>
                <label className="flex items-center gap-2 text-xs text-brand-text">
                  <input
                    type="checkbox"
                    checked={draft.passwordRequireNumber}
                    onChange={(e) => setDraft({ ...draft, passwordRequireNumber: e.target.checked })}
                  />
                  Require a number
                </label>
                <label className="flex items-center gap-2 text-xs text-brand-text">
                  <input
                    type="checkbox"
                    checked={draft.passwordRequireSymbol}
                    onChange={(e) => setDraft({ ...draft, passwordRequireSymbol: e.target.checked })}
                  />
                  Require a symbol
                </label>
              </div>
            </section>

            {error && <div className="text-xs text-red-600">{error}</div>}

            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 rounded-lg border border-brand-border py-2 text-sm">Cancel</button>
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 rounded-lg bg-brand-dark text-white py-2 text-sm font-semibold disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
