"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Couldn't reset password.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 2000);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-brand-bg px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-brand-border p-6">
        <div className="flex items-center gap-2.5 mb-6">
          <div className="relative w-8 h-8 flex-shrink-0">
            <div className="absolute top-0 left-0 w-5 h-5 rounded-md bg-brand-dark" />
            <div className="absolute bottom-0 right-0 w-5 h-5 rounded-md bg-brand-light" />
          </div>
          <div>
            <div className="font-bold text-brand-text leading-tight">IDEAL Tasks</div>
            <div className="text-xs text-brand-sub">Team Task Manager</div>
          </div>
        </div>

        {!token ? (
          <div className="text-sm text-red-600">This reset link is missing its token — please use the link from your email.</div>
        ) : done ? (
          <div className="text-sm text-brand-text">Password updated — taking you to the login page…</div>
        ) : (
          <>
            <h1 className="font-bold text-brand-text mb-1 text-sm">Choose a new password</h1>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3 mt-3">
              <div>
                <label className="text-xs font-semibold text-brand-sub">New password</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full mt-1 rounded-lg border border-brand-border px-3 py-2 text-sm outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-brand-sub">Confirm new password</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full mt-1 rounded-lg border border-brand-border px-3 py-2 text-sm outline-none"
                />
              </div>
              {error && <div className="text-xs text-red-600">{error}</div>}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 rounded-lg bg-brand-dark text-white py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {loading ? "Saving…" : "Reset password"}
              </button>
            </form>
          </>
        )}
      </div>
      <div className="mt-6 text-[11px] text-brand-sub text-center">
        © {new Date().getFullYear()} IDEAL for Digital Transformation (ايدل للتحول الرقمي). All rights reserved.
      </div>
    </div>
  );
}
