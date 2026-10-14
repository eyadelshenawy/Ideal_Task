"use client";

import { useEffect, useState } from "react";
import useSWR, { mutate } from "swr";
import { X, Shield, Smartphone, Trash2, Check } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface MeStatus {
  totpEnabled: boolean;
}

interface SetupResponse {
  secret: string;
  qr: string;
  alreadyEnabled?: boolean;
}

interface TrustedDevice {
  id: string;
  label: string | null;
  createdAt: string;
  expiresAt: string;
}

function shortDevice(label: string | null): string {
  if (!label) return "Unknown device";
  // The label is a UA string; a browser name + "on" + os is more legible.
  if (/Chrome/i.test(label) && !/Edg/i.test(label)) {
    if (/Windows/i.test(label)) return "Chrome on Windows";
    if (/Mac/i.test(label)) return "Chrome on Mac";
    if (/Android/i.test(label)) return "Chrome on Android";
    if (/Linux/i.test(label)) return "Chrome on Linux";
  }
  if (/Edg/i.test(label)) return "Edge";
  if (/Safari/i.test(label) && /iPhone/i.test(label)) return "Safari on iPhone";
  if (/Safari/i.test(label)) return "Safari on Mac";
  if (/Firefox/i.test(label)) return "Firefox";
  return label.slice(0, 40);
}

export default function MfaSettingsModal({
  initialTotpEnabled,
  onClose,
}: {
  initialTotpEnabled: boolean;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<MeStatus>({ totpEnabled: initialTotpEnabled });
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"idle" | "enrolling" | "disabling">("idle");

  const { data: devices } = useSWR<TrustedDevice[]>(
    status.totpEnabled ? "/api/me/mfa/trusted-devices" : null,
    fetcher,
  );

  async function startEnrol() {
    setBusy(true); setError("");
    const r = await fetch("/api/me/mfa/setup");
    const data: SetupResponse = await r.json();
    setBusy(false);
    if (data.alreadyEnabled) {
      setStatus({ totpEnabled: true });
      return;
    }
    setSetup(data);
    setMode("enrolling");
  }

  async function confirmEnrol() {
    setBusy(true); setError("");
    const r = await fetch("/api/me/mfa/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Couldn't verify code.");
      return;
    }
    setStatus({ totpEnabled: true });
    setSetup(null);
    setCode("");
    setMode("idle");
    mutate("/api/me/mfa/trusted-devices");
  }

  async function confirmDisable() {
    setBusy(true); setError("");
    const r = await fetch("/api/me/mfa/disable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: disablePassword }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Couldn't disable MFA.");
      return;
    }
    setStatus({ totpEnabled: false });
    setDisablePassword("");
    setMode("idle");
  }

  async function revokeDevice(id?: string) {
    const url = id ? `/api/me/mfa/trusted-devices?id=${id}` : "/api/me/mfa/trusted-devices";
    await fetch(url, { method: "DELETE" });
    mutate("/api/me/mfa/trusted-devices");
  }

  useEffect(() => { setError(""); }, [mode]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-none sm:max-w-[520px] h-full sm:h-auto max-h-none sm:max-h-[90vh] overflow-y-auto p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-[16px] text-brand-text flex items-center gap-2">
            <Shield size={18} className="text-brand-dark" />
            Two-factor authentication
          </h2>
          <button onClick={onClose} className="text-brand-sub"><X size={18} /></button>
        </div>

        {mode === "idle" && (
          <>
            <div className="text-[12.5px] text-brand-sub mb-4">
              Add a second step at login using an Authenticator app (Google Authenticator,
              Microsoft Authenticator, 1Password, etc.). Keeps your account safe even if
              your password is leaked.
            </div>

            {!status.totpEnabled ? (
              <button
                onClick={startEnrol}
                disabled={busy}
                className="w-full rounded-lg bg-brand-dark text-white py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {busy ? "Preparing…" : "Enable two-factor"}
              </button>
            ) : (
              <>
                <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 flex items-center gap-2 mb-4">
                  <Check size={14} /> Two-factor is on.
                </div>

                <div className="mb-2 font-semibold text-[13px] text-brand-text">Trusted devices (30 days)</div>
                {!devices && <div className="text-xs text-brand-sub py-2">Loading…</div>}
                {devices && devices.length === 0 && <div className="text-xs text-brand-sub py-2">No trusted devices yet.</div>}
                {devices && devices.map((d) => (
                  <div key={d.id} className="flex items-center justify-between py-2 border-b border-brand-border text-[12px]">
                    <div className="flex items-center gap-2">
                      <Smartphone size={14} className="text-brand-sub" />
                      <div>
                        <div className="text-brand-text">{shortDevice(d.label)}</div>
                        <div className="text-[10.5px] text-brand-sub">Added {new Date(d.createdAt).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <button onClick={() => revokeDevice(d.id)} className="text-red-600"><Trash2 size={14} /></button>
                  </div>
                ))}
                {devices && devices.length > 0 && (
                  <button onClick={() => revokeDevice()} className="mt-2 text-xs text-red-600 underline">Revoke all</button>
                )}

                <div className="mt-5">
                  <button
                    onClick={() => setMode("disabling")}
                    className="w-full rounded-lg border border-red-300 text-red-700 py-2 text-sm font-semibold"
                  >
                    Disable two-factor
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {mode === "enrolling" && setup && (
          <>
            <div className="text-[12.5px] text-brand-sub mb-3">
              Open your Authenticator app and scan this QR, or enter the secret manually.
              Then type the 6-digit code it shows below.
            </div>
            <div className="flex justify-center mb-2">
              <img src={setup.qr} alt="Scan with your Authenticator app" className="rounded-lg border border-brand-border" />
            </div>
            <div className="text-center text-[11px] text-brand-sub mb-4">
              <span className="font-mono select-all break-all">{setup.secret}</span>
            </div>
            <input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-full rounded-lg border border-brand-border px-3 py-2 text-center tracking-widest font-mono text-lg outline-none"
            />
            {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setMode("idle"); setSetup(null); setCode(""); }} className="flex-1 rounded-lg border border-brand-border py-2 text-sm">Cancel</button>
              <button
                onClick={confirmEnrol}
                disabled={busy || code.length !== 6}
                className="flex-1 rounded-lg bg-brand-dark text-white py-2 text-sm font-semibold disabled:opacity-60"
              >
                {busy ? "Verifying…" : "Verify & enable"}
              </button>
            </div>
          </>
        )}

        {mode === "disabling" && (
          <>
            <div className="text-[12.5px] text-brand-sub mb-3">
              Enter your current password to turn off two-factor. All trusted devices will be revoked.
            </div>
            <input
              type="password"
              placeholder="Current password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              className="w-full rounded-lg border border-brand-border px-3 py-2 text-sm outline-none"
              autoComplete="current-password"
            />
            {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setMode("idle"); setDisablePassword(""); }} className="flex-1 rounded-lg border border-brand-border py-2 text-sm">Cancel</button>
              <button
                onClick={confirmDisable}
                disabled={busy || !disablePassword}
                className="flex-1 rounded-lg bg-red-600 text-white py-2 text-sm font-semibold disabled:opacity-60"
              >
                {busy ? "Disabling…" : "Disable"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
