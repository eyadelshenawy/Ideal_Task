"use client";

import { useState, type FormEvent } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Something went wrong.");
      return;
    }
    setSent(true);
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

        {sent ? (
          <div className="text-sm text-brand-text">
            If an account exists for that email, we&apos;ve sent a link to reset the password. It expires in 1 hour.
          </div>
        ) : (
          <>
            <h1 className="font-bold text-brand-text mb-1 text-sm">Forgot your password?</h1>
            <p className="text-xs text-brand-sub mb-4">
              Enter your account email and we&apos;ll send you a link to reset it.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-brand-sub">Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full mt-1 rounded-lg border border-brand-border px-3 py-2 text-sm outline-none"
                  placeholder="you@company.com"
                />
              </div>
              {error && <div className="text-xs text-red-600">{error}</div>}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 rounded-lg bg-brand-dark text-white py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}

        <div className="mt-4 text-xs text-brand-sub text-center">
          <a href="/login" className="text-brand-dark font-medium">Back to log in</a>
        </div>
      </div>
      <div className="mt-6 text-[11px] text-brand-sub text-center">
        © {new Date().getFullYear()} IDEAL for Digital Transformation (ايدل للتحول الرقمي). All rights reserved.
      </div>
    </div>
  );
}
