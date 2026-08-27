"use client";

import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

const DISMISSED_KEY = "push.bannerDismissedAt";
// Reappear a week after being dismissed — long enough not to nag, short
// enough that a user who missed a real notification will see the nudge
// again fairly soon.
const REAPPEAR_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Small dismissible banner shown to signed-in users whose browser has never
 * granted push permission (either they clicked Block, or the auto-prompt
 * fired at an inopportune moment and got dismissed). The browser will not
 * re-prompt on its own — this points them at their own browser settings so
 * they can turn notifications back on. Silent for anyone who has already
 * granted permission, or where the browser doesn't support Web Push at all
 * (mobile Safari outside of an installed PWA, mostly).
 */
export default function PushPermissionBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (typeof Notification === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission === "granted") return;
    const dismissedAt = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
    if (dismissedAt && Date.now() - dismissedAt < REAPPEAR_MS) return;
    setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2 mb-3 bg-[#FBEEDD] text-[#8A5A20] border border-[#EBD9BC]">
      <Bell size={14} className="flex-shrink-0" />
      <div className="text-[12px] leading-snug flex-1">
        <span className="font-semibold">Notifications are off.</span>{" "}
        Turn them on in your browser settings (click the lock icon next to the URL) so you get pinged about assignments and customer replies.
      </div>
      <button
        onClick={() => {
          localStorage.setItem(DISMISSED_KEY, String(Date.now()));
          setShow(false);
        }}
        title="Dismiss for a week"
        className="p-1 rounded hover:bg-[#EBD9BC]"
      >
        <X size={13} />
      </button>
    </div>
  );
}
