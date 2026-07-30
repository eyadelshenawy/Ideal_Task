"use client";

import { useState } from "react";
import useSWR from "swr";
import { Bell } from "lucide-react";

interface NotificationItem {
  id: string;
  message: string;
  taskId: string | null;
  read: boolean;
  createdAt: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function NotificationBell({ onOpenTask }: { onOpenTask: (taskId: string) => void }) {
  const { data, mutate } = useSWR<{ notifications: NotificationItem[]; unreadCount: number }>(
    "/api/notifications",
    fetcher,
    { refreshInterval: 20000 }
  );
  const [open, setOpen] = useState(false);

  async function handleClick(n: NotificationItem) {
    if (!n.read) {
      await fetch(`/api/notifications/${n.id}`, { method: "PATCH" });
      await mutate();
    }
    if (n.taskId) onOpenTask(n.taskId);
    setOpen(false);
  }

  async function markAllRead() {
    await fetch("/api/notifications/read-all", { method: "POST" });
    await mutate();
  }

  const unreadCount = data?.unreadCount ?? 0;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        className="relative p-2 rounded-lg text-white"
        style={{ background: open ? "#fff" : "rgba(255,255,255,0.12)", color: open ? "#0A5A46" : "#fff" }}
      >
        <Bell size={15} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -right-1 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
            style={{ background: "#C4443D", minWidth: 15, height: 15, padding: "0 3px" }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-20 w-[300px] max-h-[360px] overflow-y-auto rounded-xl bg-white border border-brand-border shadow-lg">
          <div className="flex items-center justify-between px-3 py-2 border-b border-brand-border">
            <span className="text-xs font-bold text-brand-text">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[11px] text-brand-dark underline">
                Mark all read
              </button>
            )}
          </div>
          {(!data || data.notifications.length === 0) && (
            <div className="text-[12px] text-brand-sub text-center py-6">No notifications yet</div>
          )}
          {data?.notifications.map((n) => (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className="w-full text-left px-3 py-2 border-b border-brand-border last:border-0 hover:bg-brand-bg"
              style={{ background: n.read ? "transparent" : "#EEF6F1" }}
            >
              <div className="text-[12px] text-brand-text">{n.message}</div>
              <div className="text-[10px] text-brand-sub mt-0.5">{formatWhen(n.createdAt)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
