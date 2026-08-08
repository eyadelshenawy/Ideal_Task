"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader2, CheckCircle2 } from "lucide-react";

interface IntakeMeta {
  projectName: string;
}

const fetcher = (url: string) => fetch(url).then(async (r) => {
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "This link is no longer valid");
  return r.json();
});

export default function IntakePageContent({ token }: { token: string }) {
  const { data, error, isLoading } = useSWR<IntakeMeta>(`/api/public/intake/${token}`, fetcher);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function submit() {
    if (!title.trim() || !contactName.trim() || !contactEmail.trim()) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(`/api/public/intake/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), contactName: contactName.trim(), contactEmail: contactEmail.trim(), website }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't submit — please try again");
      }
      setSubmitted(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't submit — please try again");
    } finally {
      setSubmitting(false);
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

  if (submitted) {
    return (
      <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4">
        <div className="text-center max-w-[360px]">
          <CheckCircle2 className="text-brand-dark mx-auto mb-3" size={36} />
          <div className="font-bold text-[16px] text-brand-text mb-1">Thanks — we&apos;ve got it</div>
          <div className="text-sm text-brand-sub">Your request was received and our team will follow up soon.</div>
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
          <label className="text-xs font-semibold text-brand-sub">Details</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Anything that helps us understand the request"
            className="w-full mt-1 rounded-lg border border-brand-border px-3 py-2 text-sm outline-none bg-white resize-none"
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-brand-sub">Your name *</label>
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
        <input
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          className="absolute opacity-0 pointer-events-none h-0 w-0"
          aria-hidden="true"
        />
        {submitError && <div className="text-xs text-red-600">{submitError}</div>}
        <button
          onClick={submit}
          disabled={submitting || !title.trim() || !contactName.trim() || !contactEmail.trim()}
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
