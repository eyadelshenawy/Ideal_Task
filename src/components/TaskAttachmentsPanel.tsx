"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { Paperclip, X, Download } from "lucide-react";

interface Attachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  uploadedByName: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TaskAttachmentsPanel({ taskId }: { taskId: string }) {
  const { data: attachments, mutate } = useSWR<Attachment[]>(`/api/tasks/${taskId}/attachments`, fetcher);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: form });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Upload failed");
          break;
        }
      }
      await mutate();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function download(a: Attachment) {
    const res = await fetch(`/api/tasks/${taskId}/attachments/${a.id}`);
    if (!res.ok) return;
    const { url } = await res.json();
    window.open(url, "_blank");
  }

  async function remove(id: string) {
    await fetch(`/api/tasks/${taskId}/attachments/${id}`, { method: "DELETE" });
    await mutate();
  }

  return (
    <div className="border-t border-brand-border mt-4 pt-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-sub mb-2">
        <Paperclip size={13} /> Attachments {attachments && attachments.length > 0 && `(${attachments.length})`}
      </div>

      <div className="flex flex-col gap-1 mb-2">
        {attachments?.map((a) => (
          <div key={a.id} className="flex items-center gap-2 group">
            <button onClick={() => download(a)} className="flex items-center gap-1.5 flex-1 min-w-0 text-left">
              <Download size={12} className="text-brand-sub shrink-0" />
              <span className="text-[12.5px] text-brand-text truncate">{a.fileName}</span>
              <span className="text-[10.5px] text-brand-sub shrink-0">{formatSize(a.fileSize)}</span>
            </button>
            <button onClick={() => remove(a.id)} className="p-0.5 rounded hover:bg-gray-100 text-brand-sub opacity-0 group-hover:opacity-100">
              <X size={12} />
            </button>
          </div>
        ))}
      </div>

      {error && <div className="text-[11px] text-red-600 mb-1.5">{error}</div>}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
        id={`file-upload-${taskId}`}
      />
      <label
        htmlFor={`file-upload-${taskId}`}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold border border-brand-border text-brand-text cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}
      >
        <Paperclip size={12} /> {uploading ? "Uploading…" : "Attach file"}
      </label>
    </div>
  );
}
