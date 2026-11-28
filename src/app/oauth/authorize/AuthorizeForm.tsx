"use client";

import { useState } from "react";

export default function AuthorizeForm({ clientName, redirectHost, projects, request }: {
  clientName: string;
  redirectHost: string;
  projects: { id: string; code: string; name: string }[];
  request: Record<string, string>;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function decide(decision: "allow" | "deny") {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...request, decision, projectIds: picked }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || typeof body.redirect !== "string") throw new Error(body.error ?? "Something went wrong");
      window.location.href = body.redirect;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2.5 mb-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static icon */}
        <img src="/icons/icon-48.png" alt="" width={32} height={32} className="rounded-lg" />
        <div className="font-bold text-[16px] text-brand-text">Connect to IDT Desk</div>
      </div>
      <p className="text-[13px] text-brand-text mb-1">
        <strong>{clientName}</strong> wants to read tickets from IDT Desk.
      </p>
      <p className="text-[11.5px] text-brand-sub mb-3">Returns to {redirectHost}</p>
      <ul className="text-[12px] text-brand-sub list-disc pl-5 mb-3 space-y-0.5">
        <li>It can read tickets, comments and status history of the projects you tick — one project at a time.</li>
        <li>It can email a report to the addresses saved for a project in Settings → MCP access → Report emails, and to no one else.</li>
        <li>It can&apos;t create, change or delete tickets. Private tasks, Trash and tasks on hold stay hidden.</li>
        <li>You can disconnect it any time in Settings → MCP access.</li>
      </ul>
      <div className="text-[12px] font-semibold text-brand-text mb-1">Projects it can read</div>
      <div className="max-h-[220px] overflow-y-auto border border-brand-border rounded-lg p-2 mb-3 flex flex-col gap-1">
        {projects.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-[12.5px] text-brand-text">
            <input
              type="checkbox"
              checked={picked.includes(p.id)}
              onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((x) => x !== p.id)))}
            />
            <span className="font-mono text-[11.5px] text-brand-sub">{p.code}</span> {p.name}
          </label>
        ))}
      </div>
      {error && <div className="text-[12px] text-red-700 mb-2">{error}</div>}
      <div className="flex gap-2">
        <button
          onClick={() => decide("allow")}
          disabled={busy || picked.length === 0}
          className="flex-1 rounded-lg bg-brand-dark text-white py-2 text-[13px] font-semibold disabled:opacity-50"
        >
          Allow
        </button>
        <button onClick={() => decide("deny")} disabled={busy} className="flex-1 rounded-lg border border-brand-border py-2 text-[13px] text-brand-text">
          Deny
        </button>
      </div>
    </div>
  );
}
