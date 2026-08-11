"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader2, CheckCircle2, Paperclip, Copy } from "lucide-react";

interface IntakeMeta {
  projectName: string;
}

const fetcher = (url: string) => fetch(url).then(async (r) => {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "This link is no longer valid");
  return r.json();
});

const MAX_FILE_MB = 10;

export default function IntakePageContent({ token }: { token: string }) {
  const { data, error, isLoading } = useSWR<IntakeMeta>(`/api/public/intake/${token}`, fetcher);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [website, setWebsite] = useState(""); // honeypot
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function onFileChange(f: File | null) {
    setFileError("");
    if (f && f.size > MAX_FILE_MB * 1024 * 1024) {
      setFileError(`File is too large (max ${MAX_FILE_MB}MB)`);
      setFile(null);
      return;
    }
    setFile(f);
  }

  async function submit() {
    if (!title.trim() || !description.trim() || !contactName.trim() || !contactEmail.trim()) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const form = new FormData();
      form.set("title", title.trim());
      form.set("description", description.trim());
      form.set("contactName", contactName.trim());
      form.set("contactEmail", contactEmail.trim());
      form.set("priority", priority);
      form.set("website", website);
      if (file) form.set("file", file);

      const res = await fetch(`/api/public/intake/${token}`, { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't submit — please try again");
      setTrackingToken(body.trackingToken ?? null);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't submit — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  function trackUrl() {
    return `${window.location.origin}/track/${trackingToken}`;
  }

  async function copyTrackLink() {
    try {
      await navigator.clipboard.writeText(trackUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard access can fail silently in some browser contexts — no harm done
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center">
        <Loader2 className="animate-spin text-brand-dark" size={28} />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
        <div className="text-center text-brand-sub text-sm">This link is no longer valid.</div>
      </div>
    );
  }

  if (trackingToken) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
        <div className="text-center max-w-[360px]">
          <CheckCircle2 className="text-brand-dark mx-auto mb-3" size={36} />
          <div className="font-bold text-[16px] text-brand-text mb-1">Thanks — we&apos;ve got it</div>
          <div className="text-sm text-brand-sub mb-4">Your request was received and our team will follow up soon.</div>
          <div className="bg-white border border-brand-border rounded-[10px] px-3 py-3">
            <div className="text-xs font-semibold text-brand-sub mb-1.5">Keep this link to check its status later</div>
            <div className="flex items-center gap-1.5">
              <input readOnly value={trackUrl()} className="flex-1 min-w-0 rounded-lg border border-brand-border px-2 py-1.5 text-[11px] outline-none bg-brand-bg" />
              <button onClick={copyTrackLink} className="flex-shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-brand-dark text-white flex items-center gap-1">
                <Copy size={12} /> {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="bg-brand-dark px-4 py-4">
        <div className="max-w-[480px] mx-auto">
          <div className="text-white font-bold text-[16px]">{data.projectName}</div>
          <div className="text-[#CFE3D8] text-[12px]">Submit a new request</div>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 py-5 flex flex-col gap-3">
        <div>
          <label className="text-xs font-semibold text-brand-sub">What&apos;s the issue? *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short summary"
            className="w-full mt-1 rounded-lg border border-brand-border px-3 py-2 text-sm outline-none bg-white"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-brand-sub">Details *</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Anything that helps us understand the request"
            className="w-full mt-1 rounded-lg border border-brand-border px-3 py-2 text-sm outline-none bg-white resize-none"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-brand-sub">Priority</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full mt-1 rounded-lg border border-brand-border px-3 py-2 text-sm outline-none bg-white"
          >
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-brand-sub">Raised by *</label>
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className="w-full mt-1 rounded-lg border border-brand-border px-3 py-2 text-sm outline-none bg-white"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-brand-sub">Your email *</label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className="w-full mt-1 rounded-lg border border-brand-border px-3 py-2 text-sm outline-none bg-white"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-brand-sub">Attach a screenshot or file (optional)</label>
          <label className="mt-1 flex items-center gap-2 rounded-lg border border-dashed border-brand-border px-3 py-2 text-sm bg-white cursor-pointer text-brand-sub">
            <Paperclip size={14} />
            {file ? file.name : `Choose a file — image, PDF, or Word (max ${MAX_FILE_MB}MB)`}
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.doc,.docx"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>
          {fileError && <div className="text-[11px] text-red-600 mt-1">{fileError}</div>}
        </div>
        {/* Honeypot — positioned off-screen (not just visually hidden), since
            opacity:0 fields are still sometimes auto-filled by browsers or
            password managers, which would silently reject a real visitor. */}
        <div style={{ position: "absolute", left: "-9999px", top: "-9999px" }} aria-hidden="true">
          <input
            type="text"
            name="hp_company_website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        {submitError && <div className="text-xs text-red-600">{submitError}</div>}
        <button
          onClick={submit}
          disabled={submitting || !title.trim() || !description.trim() || !contactName.trim() || !contactEmail.trim()}
          className="rounded-lg bg-brand-dark text-white py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Submit request"}
        </button>
      </div>

      <div className="px-4 py-4 text-[11px] text-brand-sub text-center">
        © {new Date().getFullYear()} IDEAL for Digital Transformation (ايدل للتحول الرقمي)
      </div>
    </div>
  );
}
