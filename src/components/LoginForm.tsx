"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const deactivated = searchParams.get("error") === "deactivated";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);

    if (!res || res.error) {
      // A thrown Error inside authorize() (the lockout case) surfaces its
      // message here verbatim; a plain `return null` (wrong password) always
      // comes through as the generic "CredentialsSignin" code.
      setError(res?.error && res.error !== "CredentialsSignin" ? res.error : "Incorrect email or password.");
      return;
    }
    router.push("/");
    router.refresh();
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

        {deactivated && (
          <div className="mb-4 rounded-lg bg-red-50 text-red-700 text-xs px-3 py-2">
            Your account has been deactivated. Contact an admin.
          </div>
        )}

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
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-brand-sub">Password</label>
              <a href="/forgot-password" className="text-xs text-brand-dark font-medium">Forgot password?</a>
            </div>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full mt-1 rounded-lg border border-brand-border px-3 py-2 text-sm outline-none"
              placeholder="••••••••"
            />
          </div>
          {error && <div className="text-xs text-red-600">{error}</div>}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-lg bg-brand-dark text-white py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Log in"}
          </button>
        </form>

        <div className="mt-4 text-xs text-brand-sub text-center">
          Don&apos;t have an account? Ask an admin to add you from Team Management.
        </div>
      </div>
      <div className="mt-6 text-[11px] text-brand-sub text-center">
        © {new Date().getFullYear()} IDEAL for Digital Transformation (ايدل للتحول الرقمي). All rights reserved.
      </div>
    </div>
  );
}
