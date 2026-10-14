"use client";

import { useEffect, useRef, useState } from "react";
import { Star, Loader2 } from "lucide-react";

interface SurveyInfo {
  code: string | null;
  title: string;
  projectName: string;
  rating: number | null;
  comment: string | null;
}

const LABELS = ["", "Very unsatisfied", "Unsatisfied", "Okay", "Satisfied", "Very satisfied"];

export default function RatePageContent({ token, initialScore }: { token: string; initialScore: number | null }) {
  const [info, setInfo] = useState<SurveyInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [rating, setRating] = useState<number | null>(initialScore);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const autoSent = useRef(false);

  async function send(r: number, c?: string) {
    setSaving(true); setError("");
    const res = await fetch(`/api/public/rate/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(c !== undefined ? { rating: r, comment: c } : { rating: r }),
    });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Couldn't save — please try again");
      return false;
    }
    return true;
  }

  useEffect(() => {
    fetch(`/api/public/rate/${token}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "This link is no longer valid");
        setInfo(j);
        setComment(j.comment ?? "");
        if (initialScore === null && j.rating) setRating(j.rating);
        // The star in the email is the answer — record it straight away.
        if (initialScore !== null && !autoSent.current) {
          autoSent.current = true;
          send(initialScore);
        }
      })
      .catch((e) => setLoadError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loadError) {
    return <div className="min-h-screen bg-brand-bg flex items-center justify-center px-4 text-sm text-brand-sub">{loadError}</div>;
  }
  if (!info) {
    return <div className="min-h-screen bg-brand-bg flex items-center justify-center"><Loader2 className="animate-spin text-brand-dark" /></div>;
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <div className="bg-brand-dark text-white px-4 py-4">
        <div className="max-w-md mx-auto">
          <div className="font-bold">{info.projectName}</div>
          <div className="text-xs opacity-80">Rate our service</div>
        </div>
      </div>
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl border border-brand-border p-5">
          <div className="text-xs text-brand-sub">Your request</div>
          <div className="text-sm font-semibold text-brand-text mt-0.5">
            {info.code && <span className="font-mono text-xs text-brand-sub mr-1">{info.code}</span>}
            {info.title}
          </div>

          {saved ? (
            <div className="mt-6 text-center">
              <div className="text-lg font-bold text-brand-dark">Thank you!</div>
              <div className="text-sm text-brand-sub mt-1">Your feedback helps us improve.</div>
            </div>
          ) : (
            <>
              <div className="mt-5 text-sm text-brand-text">How satisfied are you with how we handled it?</div>
              <div className="flex justify-center gap-1.5 mt-3">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => { setRating(n); send(n); }}
                    aria-label={`${n} — ${LABELS[n]}`}
                    className="p-1"
                  >
                    <Star size={34} fill={rating !== null && n <= rating ? "#82B478" : "none"} color={rating !== null && n <= rating ? "#0A5A46" : "#C9D1CD"} />
                  </button>
                ))}
              </div>
              <div className="text-center text-xs text-brand-sub h-4 mt-1">{rating ? LABELS[rating] : ""}</div>

              <label className="block text-xs font-semibold text-brand-sub mt-5">Anything you&apos;d like to add? (optional)</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={1000}
                className="w-full mt-1 rounded-lg border border-brand-border px-3 py-2 text-sm outline-none resize-none"
              />
              {error && <div className="text-xs text-red-600 mt-2">{error}</div>}
              <button
                disabled={!rating || saving}
                onClick={async () => { if (rating && (await send(rating, comment))) setSaved(true); }}
                className="w-full mt-4 rounded-lg bg-brand-dark text-white py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Saving…" : "Send"}
              </button>
            </>
          )}
        </div>
        <div className="mt-6 text-[11px] text-brand-sub text-center">
          © {new Date().getFullYear()} IDEAL for Digital Transformation
        </div>
      </div>
    </div>
  );
}
