"use client";

import { useState } from "react";
import useSWR from "swr";
import { X, Copy, Check, KeyRound } from "lucide-react";
import { api } from "@/lib/apiClient";

interface McpTokenRow {
  id: string;
  name: string;
  hint: string;
  createdBy: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  projects: { id: string; code: string; name: string }[];
}

interface McpLogRow {
  id: string;
  tokenName: string;
  method: string;
  tool: string | null;
  projectCode: string | null;
  ticketCode: string | null;
  outcome: string;
  resultCount: number | null;
  ip: string | null;
  createdAt: string;
}

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error("Failed to load");
    return r.json();
  });

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const OUTCOME_LABEL: Record<string, string> = {
  ok: "OK",
  denied: "Not allowed",
  not_found: "Not found",
  invalid: "Bad request",
  error: "Error",
  unauthorised: "Invalid token",
};

function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="inline-flex items-center gap-1 rounded-md border border-brand-border px-2 py-1 text-[11.5px] text-brand-dark bg-white"
    >
      {done ? <Check size={12} /> : <Copy size={12} />} {done ? "Copied" : label}
    </button>
  );
}

/**
 * Settings → MCP access (Super Admin): tokens that let an AI assistant read
 * tickets through the read-only MCP server at /api/mcp, one project per call,
 * and the log of every request made with them.
 */
export default function McpAccessModal({ projects, onClose }: {
  projects: { id: string; code: string; name: string }[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"tokens" | "log">("tokens");
  const { data: tokens, mutate } = useSWR<McpTokenRow[]>("/api/mcp-tokens", fetcher);
  const { data: log } = useSWR<McpLogRow[]>(tab === "log" ? "/api/mcp-tokens/log" : null, fetcher, { refreshInterval: 15000 });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const serverUrl = typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`;

  async function create() {
    setBusy(true);
    setError("");
    try {
      const r = await api.createMcpToken({ name: name.trim(), projectIds: picked });
      setNewToken(r.token);
      setCreating(false);
      setName("");
      setPicked([]);
      await mutate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the token");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(t: McpTokenRow) {
    if (!window.confirm(`Revoke "${t.name}"? Anything using it stops working straight away. This can't be undone.`)) return;
    try {
      await api.revokeMcpToken(t.id);
      await mutate();
    } catch {
      setError("Couldn't revoke the token — please try again");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(20,30,26,0.45)" }}>
      <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-none sm:max-w-[680px] h-full sm:h-auto max-h-none sm:max-h-[85vh] overflow-y-auto p-4 sm:p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-bold text-[16px] text-brand-text">MCP access</h2>
          <button onClick={onClose} className="text-brand-sub" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="text-[11.5px] text-brand-sub mb-3">
          Lets an AI assistant such as Claude read tickets — one project at a time, and only the projects you pick for its token. It can&apos;t create, change or delete anything. Private tasks, tasks in Trash and tasks on hold are never shared.
        </div>

        <div className="flex items-center gap-2 flex-wrap rounded-lg bg-brand-bg border border-brand-border px-3 py-2 mb-3">
          <span className="text-[11.5px] text-brand-sub">Server address</span>
          <code className="text-[12px] text-brand-text break-all">{serverUrl}</code>
          <CopyButton value={serverUrl} label="Copy" />
        </div>

        <div className="flex gap-1 mb-3 border-b border-brand-border">
          {(["tokens", "log"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-[12.5px] -mb-px border-b-2 ${tab === t ? "border-brand-dark text-brand-dark font-semibold" : "border-transparent text-brand-sub"}`}
            >
              {t === "tokens" ? "Tokens" : "Request log"}
            </button>
          ))}
        </div>

        {error && <div className="text-[12px] text-red-700 mb-2">{error}</div>}

        {tab === "tokens" && (
          <>
            {newToken && (
              <div className="rounded-lg border border-brand-light bg-[#F1F7EF] p-3 mb-3">
                <div className="text-[12.5px] font-semibold text-brand-dark mb-1">Copy this token now — it won&apos;t be shown again</div>
                <code className="block text-[12px] text-brand-text break-all bg-white rounded border border-brand-border px-2 py-1.5 mb-2">{newToken}</code>
                <div className="flex gap-2">
                  <CopyButton value={newToken} label="Copy token" />
                  <button onClick={() => setNewToken(null)} className="rounded-md bg-brand-dark text-white px-3 py-1 text-[11.5px]">Done</button>
                </div>
              </div>
            )}

            {creating ? (
              <div className="rounded-lg border border-brand-border p-3 mb-3">
                <label className="block text-[11.5px] text-brand-sub mb-1">Name (who or what will use it)</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  placeholder="e.g. Eyad — Claude weekly report"
                  className="w-full rounded-lg border border-brand-border px-2 py-1.5 text-[12.5px] outline-none mb-2"
                />
                <div className="text-[11.5px] text-brand-sub mb-1">Projects it can read</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-[180px] overflow-y-auto mb-2">
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
                <div className="flex gap-2">
                  <button
                    onClick={create}
                    disabled={busy || !name.trim() || picked.length === 0}
                    className="rounded-md bg-brand-dark text-white px-3 py-1.5 text-[12px] disabled:opacity-50"
                  >
                    Create token
                  </button>
                  <button onClick={() => { setCreating(false); setError(""); }} className="text-[12px] text-brand-sub px-2">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setCreating(true); setNewToken(null); }}
                className="inline-flex items-center gap-1.5 rounded-md bg-brand-dark text-white px-3 py-1.5 text-[12px] mb-3"
              >
                <KeyRound size={13} /> New token
              </button>
            )}

            {!tokens && <div className="text-sm text-brand-sub text-center py-6">Loading…</div>}
            {tokens?.length === 0 && <div className="text-sm text-brand-sub text-center py-6">No tokens yet</div>}
            <div className="flex flex-col">
              {tokens?.map((t) => (
                <div key={t.id} className={`py-2 border-b border-brand-border ${t.revokedAt ? "opacity-55" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12.5px] text-brand-text font-semibold">
                        {t.name} <span className="font-mono font-normal text-brand-sub">…{t.hint}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {t.projects.map((p) => (
                          <span key={p.id} title={p.name} className="rounded bg-brand-bg border border-brand-border px-1.5 py-0.5 text-[10.5px] font-mono text-brand-text">{p.code}</span>
                        ))}
                      </div>
                      <div className="text-[10.5px] text-brand-sub mt-1">
                        Created {when(t.createdAt)} by {t.createdBy} · {t.lastUsedAt ? `Last used ${when(t.lastUsedAt)}` : "Never used"}
                        {t.revokedAt ? ` · Revoked ${when(t.revokedAt)}` : ""}
                      </div>
                    </div>
                    {!t.revokedAt && (
                      <button onClick={() => revoke(t)} className="text-[11.5px] text-red-700 border border-red-200 rounded-md px-2 py-1 flex-shrink-0">Revoke</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "log" && (
          <>
            <div className="text-[11px] text-brand-sub mb-1">
              {log ? (log.length === 300 ? "Showing the latest 300 requests" : `${log.length} request${log.length === 1 ? "" : "s"}`) : ""}
            </div>
            {!log && <div className="text-sm text-brand-sub text-center py-6">Loading…</div>}
            {log?.length === 0 && <div className="text-sm text-brand-sub text-center py-6">No requests yet</div>}
            <div className="flex flex-col">
              {log?.map((r) => (
                <div key={r.id} className="py-1.5 border-b border-brand-border flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[12.5px] text-brand-text">
                      <span className="font-semibold">{r.tokenName}</span> — {r.tool ?? r.method}
                      {r.projectCode ? <span className="font-mono text-[11.5px] text-brand-sub"> · {r.projectCode}</span> : null}
                      {r.ticketCode ? <span className="font-mono text-[11.5px] text-brand-sub"> · {r.ticketCode}</span> : null}
                      {r.resultCount !== null && r.tool ? <span className="text-[11.5px] text-brand-sub"> · {r.resultCount} row{r.resultCount === 1 ? "" : "s"}</span> : null}
                    </div>
                    <div className="text-[10.5px] text-brand-sub">{when(r.createdAt)}{r.ip ? ` · ${r.ip}` : ""}</div>
                  </div>
                  <span className={`text-[10.5px] rounded px-1.5 py-0.5 flex-shrink-0 ${r.outcome === "ok" ? "bg-[#E6F0E3] text-brand-dark" : "bg-red-50 text-red-700"}`}>
                    {OUTCOME_LABEL[r.outcome] ?? r.outcome}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
