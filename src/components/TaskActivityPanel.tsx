"use client";

import { useState } from "react";
import useSWR from "swr";
import { MessageSquare, Pencil, Trash2, Mail, Paperclip, X } from "lucide-react";
import { api } from "@/lib/apiClient";

const TO_CUSTOMER_PREFIX = "[To customer] ";
const FROM_CUSTOMER_PREFIX = "[Customer] ";
const MAX_FILE_MB = 10;
const MAX_TOTAL_MB = 25;

interface TaskEvent {
  id: string;
  type: "COMMENT" | "ACTIVITY";
  message: string;
  authorId: string | null;
  authorName: string | null;
  createdAt: string;
  editedAt: string | null;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface TaskActivityPanelProps {
  taskId: string;
  currentUserId?: string;
  isSuperAdmin?: boolean;
}

export default function TaskActivityPanel({ taskId, currentUserId, isSuperAdmin }: TaskActivityPanelProps) {
  const { data: events, mutate } = useSWR<TaskEvent[]>(`/api/tasks/${taskId}/events`, fetcher);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showEmailBox, setShowEmailBox] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailRecipients, setEmailRecipients] = useState("");
  const [emailFiles, setEmailFiles] = useState<File[]>([]);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState("");

  function onEmailFilesChange(picked: FileList | null) {
    setEmailError("");
    if (!picked || picked.length === 0) return;
    const next = [...emailFiles];
    for (const f of Array.from(picked)) {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        setEmailError(`"${f.name}" is too large (max ${MAX_FILE_MB}MB each)`);
        continue;
      }
      const totalMB = [...next, f].reduce((sum, x) => sum + x.size, 0) / (1024 * 1024);
      if (totalMB > MAX_TOTAL_MB) {
        setEmailError(`Attachments are too large together (max ${MAX_TOTAL_MB}MB combined)`);
        break;
      }
      next.push(f);
    }
    setEmailFiles(next);
  }

  function removeEmailFile(index: number) {
    setEmailFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function sendCustomerEmail() {
    if (!emailDraft.trim()) return;
    setSendingEmail(true);
    setEmailError("");
    try {
      const recipients = emailRecipients.split(",").map((r) => r.trim()).filter(Boolean);
      await api.emailCustomer(taskId, emailDraft.trim(), recipients, emailFiles);
      setEmailDraft("");
      setEmailRecipients("");
      setEmailFiles([]);
      setShowEmailBox(false);
      await mutate();
    } catch (e) {
      setEmailError(e instanceof Error ? e.message : "Couldn't send email");
    } finally {
      setSendingEmail(false);
    }
  }

  async function submit() {
    if (!draft.trim()) return;
    setSubmitting(true);
    try {
      await api.addTaskComment(taskId, draft.trim());
      setDraft("");
      await mutate();
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(e: TaskEvent) {
    setEditingId(e.id);
    setEditDraft(e.message);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
  }

  async function saveEdit(eventId: string) {
    if (!editDraft.trim()) return;
    setSavingEdit(true);
    try {
      await api.updateTaskComment(taskId, eventId, editDraft.trim());
      setEditingId(null);
      setEditDraft("");
      await mutate();
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteComment(eventId: string) {
    setDeletingId(eventId);
    try {
      await api.deleteTaskComment(taskId, eventId);
      setConfirmDeleteId(null);
      await mutate();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="border-t border-brand-border mt-4 pt-3">
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-sub">
          <MessageSquare size={13} /> Comments & Activity
        </div>
        <button
          onClick={() => setShowEmailBox((v) => !v)}
          className="flex items-center gap-1 text-[11px] font-semibold text-brand-dark hover:underline"
        >
          <Mail size={12} /> Email customer
        </button>
      </div>

      {showEmailBox && (
        <div className="mb-2 rounded-lg border border-brand-border bg-brand-bg px-2.5 py-2 flex flex-col gap-1.5">
          <input
            value={emailRecipients}
            onChange={(ev) => setEmailRecipients(ev.target.value)}
            placeholder="Also send to (optional) — email addresses separated by commas"
            className="w-full rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none bg-white"
          />
          <textarea
            value={emailDraft}
            onChange={(ev) => setEmailDraft(ev.target.value)}
            placeholder="Message to the customer — sent by email, with a link to view status and reply"
            rows={3}
            maxLength={5000}
            className="w-full rounded-lg border border-brand-border px-2 py-1.5 text-xs outline-none resize-y bg-white"
          />
          {emailFiles.length > 0 && (
            <div className="flex flex-col gap-1">
              {emailFiles.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[11px] text-brand-text bg-white rounded-lg border border-brand-border px-2 py-1">
                  <Paperclip size={11} className="flex-shrink-0 text-brand-sub" />
                  <span className="flex-1 truncate">{f.name}</span>
                  <button onClick={() => removeEmailFile(i)} className="flex-shrink-0 text-brand-sub hover:text-red-600">
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {emailFiles.reduce((sum, f) => sum + f.size, 0) < MAX_TOTAL_MB * 1024 * 1024 && (
            <label className="flex items-center gap-1.5 rounded-lg border border-dashed border-brand-border px-2 py-1.5 text-xs bg-white cursor-pointer text-brand-sub">
              <Paperclip size={12} />
              {`Attach files (optional, max ${MAX_FILE_MB}MB each, ${MAX_TOTAL_MB}MB combined)`}
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.doc,.docx"
                onChange={(ev) => { onEmailFilesChange(ev.target.files); ev.target.value = ""; }}
                className="hidden"
              />
            </label>
          )}
          {emailError && <div className="text-[11px] text-red-600">{emailError}</div>}
          <div className="flex gap-1.5 justify-end">
            <button onClick={() => { setShowEmailBox(false); setEmailError(""); setEmailRecipients(""); setEmailFiles([]); }} className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-brand-sub hover:bg-gray-100">
              Cancel
            </button>
            <button
              onClick={sendCustomerEmail}
              disabled={sendingEmail || !emailDraft.trim()}
              className="rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-brand-dark text-white disabled:opacity-50"
            >
              {sendingEmail ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}

      <div className="max-h-[180px] overflow-y-auto flex flex-col gap-1.5 mb-2">
        {(!events || events.length === 0) && (
          <div className="text-[11px] text-brand-sub">No activity yet</div>
        )}
        {events?.map((e) => {
          if (e.type !== "COMMENT") {
            return (
              <div key={e.id} className="text-[11px] text-brand-sub whitespace-pre-wrap">
                <span className="font-medium">{e.authorName ?? "Former member"}</span> — {e.message}
                <span className="ml-1 text-[10px]">· {formatWhen(e.createdAt)}</span>
              </div>
            );
          }
          const canEdit = !!currentUserId && (e.authorId === currentUserId || !!isSuperAdmin);
          const isEditing = editingId === e.id;
          const isToCustomer = e.message.startsWith(TO_CUSTOMER_PREFIX);
          const isFromCustomer = e.message.startsWith(FROM_CUSTOMER_PREFIX);
          const displayMessage = isToCustomer
            ? e.message.slice(TO_CUSTOMER_PREFIX.length)
            : isFromCustomer
              ? e.message.slice(FROM_CUSTOMER_PREFIX.length)
              : e.message;
          return (
            <div key={e.id} className="bg-brand-bg rounded-lg px-2.5 py-1.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11.5px] font-semibold text-brand-text">
                  {isFromCustomer ? "Customer" : e.authorName ?? "Former member"}
                </span>
                {isToCustomer && (
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold text-brand-dark bg-brand-dark/10 rounded px-1 py-0.5">
                    <Mail size={9} /> to customer
                  </span>
                )}
                {isFromCustomer && (
                  <span className="text-[10px] font-semibold text-brand-dark bg-brand-dark/10 rounded px-1 py-0.5">via tracking link</span>
                )}
                <span className="text-[10px] text-brand-sub">{formatWhen(e.createdAt)}</span>
                {e.editedAt && <span className="text-[10px] text-brand-sub italic">(edited)</span>}
                {canEdit && !isEditing && (
                  <div className="ml-auto flex items-center gap-1.5">
                    <button onClick={() => startEdit(e)} title="Edit comment" className="p-0.5 text-brand-sub hover:text-brand-text">
                      <Pencil size={11} />
                    </button>
                    {confirmDeleteId === e.id ? (
                      <button
                        onClick={() => deleteComment(e.id)}
                        disabled={deletingId === e.id}
                        title="Click to confirm delete"
                        className="text-[10px] font-semibold text-red-600 disabled:opacity-50"
                      >
                        Confirm?
                      </button>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(e.id)} title="Delete comment" className="p-0.5 text-brand-sub hover:text-red-600">
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {isEditing ? (
                <div className="flex flex-col gap-1.5 mt-1">
                  <textarea
                    value={editDraft}
                    onChange={(ev) => setEditDraft(ev.target.value)}
                    rows={3}
                    maxLength={20000}
                    className="w-full rounded-lg border border-brand-border px-2 py-1 text-xs outline-none resize-y"
                  />
                  <div className="flex gap-1.5 justify-end">
                    <button onClick={cancelEdit} className="rounded-lg px-2.5 py-1 text-[11px] font-semibold text-brand-sub hover:bg-gray-100">
                      Cancel
                    </button>
                    <button
                      onClick={() => saveEdit(e.id)}
                      disabled={savingEdit || !editDraft.trim()}
                      className="rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-brand-dark text-white disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-[12px] text-brand-text whitespace-pre-wrap">{displayMessage}</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <textarea
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => { if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) submit(); }}
          placeholder="Add a comment… (Ctrl/Cmd + Enter to post)"
          rows={4}
          maxLength={20000}
          className="w-full rounded-lg border border-brand-border px-2.5 py-1.5 text-xs outline-none resize-y"
        />
        <button
          onClick={submit}
          disabled={submitting || !draft.trim()}
          className="self-end rounded-lg px-3 py-1.5 text-xs font-semibold bg-brand-dark text-white disabled:opacity-50"
        >
          Post
        </button>
      </div>
    </div>
  );
}
