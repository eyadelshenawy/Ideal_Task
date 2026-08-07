"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X, FileText, MessageSquare, Paperclip } from "lucide-react";

interface SearchResults {
  tasks: { id: string; code: string | null; title: string; status: string }[];
  comments: { id: string; message: string; taskId: string; taskCode: string | null; taskTitle: string }[];
  attachments: { id: string; fileName: string; taskId: string; taskCode: string | null; taskTitle: string }[];
}

const EMPTY: SearchResults = { tasks: [], comments: [], attachments: [] };

function highlight(text: string, max = 120): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default function GlobalSearchModal({ onClose, onOpenTask }: { onClose: () => void; onOpenTask: (taskId: string) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(EMPTY);
      return;
    }
    setLoading(true);
    const handle = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data) => setResults(data))
        .catch(() => setResults(EMPTY))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  function pick(taskId: string) {
    onOpenTask(taskId);
    onClose();
  }

  const q = query.trim();
  const hasAny = results.tasks.length + results.comments.length + results.attachments.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[10vh]"
      style={{ background: "rgba(20,30,26,0.45)" }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-[480px] max-h-[70vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-brand-border flex-shrink-0">
          <Search size={16} className="text-brand-sub flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
            placeholder="Search tasks, comments, attachments…"
            className="flex-1 outline-none text-sm"
          />
          <button onClick={onClose} className="text-brand-sub flex-shrink-0"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {q.length < 2 && (
            <div className="text-sm text-brand-sub py-8 text-center">Type at least 2 characters to search</div>
          )}
          {q.length >= 2 && loading && (
            <div className="text-sm text-brand-sub py-8 text-center">Searching…</div>
          )}
          {q.length >= 2 && !loading && !hasAny && (
            <div className="text-sm text-brand-sub py-8 text-center">No results for &quot;{q}&quot;</div>
          )}

          {results.tasks.length > 0 && (
            <div className="px-2 pt-2">
              <div className="text-[10px] font-bold text-brand-sub uppercase tracking-wide px-2 mb-1">Tasks</div>
              {results.tasks.map((t) => (
                <button
                  key={t.id}
                  onClick={() => pick(t.id)}
                  className="w-full text-left flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-brand-bg"
                >
                  <FileText size={13} className="text-brand-sub flex-shrink-0" />
                  {t.code && <span className="font-mono text-[11px] text-brand-sub flex-shrink-0">{t.code}</span>}
                  <span className="text-[13px] text-brand-text truncate">{t.title}</span>
                </button>
              ))}
            </div>
          )}

          {results.comments.length > 0 && (
            <div className="px-2 pt-2">
              <div className="text-[10px] font-bold text-brand-sub uppercase tracking-wide px-2 mb-1">Comments</div>
              {results.comments.map((c) => (
                <button
                  key={c.id}
                  onClick={() => pick(c.taskId)}
                  className="w-full text-left flex flex-col gap-0.5 px-2 py-2 rounded-lg hover:bg-brand-bg"
                >
                  <div className="flex items-center gap-1.5">
                    <MessageSquare size={13} className="text-brand-sub flex-shrink-0" />
                    {c.taskCode && <span className="font-mono text-[11px] text-brand-sub flex-shrink-0">{c.taskCode}</span>}
                    <span className="text-[12px] text-brand-sub truncate">{c.taskTitle}</span>
                  </div>
                  <span className="text-[12.5px] text-brand-text pl-[19px] truncate">{highlight(c.message)}</span>
                </button>
              ))}
            </div>
          )}

          {results.attachments.length > 0 && (
            <div className="px-2 pt-2 pb-2">
              <div className="text-[10px] font-bold text-brand-sub uppercase tracking-wide px-2 mb-1">Attachments</div>
              {results.attachments.map((a) => (
                <button
                  key={a.id}
                  onClick={() => pick(a.taskId)}
                  className="w-full text-left flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-brand-bg"
                >
                  <Paperclip size={13} className="text-brand-sub flex-shrink-0" />
                  <span className="text-[13px] text-brand-text truncate">{a.fileName}</span>
                  {a.taskCode && <span className="font-mono text-[11px] text-brand-sub flex-shrink-0 ml-auto">{a.taskCode}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
