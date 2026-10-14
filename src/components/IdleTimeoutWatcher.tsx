"use client";

import { useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";

const WARNING_SECONDS = 60; // Show the warning banner this long before signing out.
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"] as const;
const BC_CHANNEL = "idl-idle";

// Signs the user out after `idleMinutes` of no activity on the page, with a
// 60-second warning dialog. Resets whenever any user input happens. Also
// syncs across open tabs — activity in one tab counts for the others, and a
// sign-out in one shuts them all. Zero or negative idleMinutes disables it.
export default function IdleTimeoutWatcher({ idleMinutes }: { idleMinutes: number }) {
  const [warning, setWarning] = useState<null | number>(null);
  const idleMs = idleMinutes > 0 ? idleMinutes * 60_000 : 0;

  const lastActivityRef = useRef<number>(Date.now());
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    if (idleMs <= 0) return;

    function clearTimers() {
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      if (tickTimerRef.current) clearInterval(tickTimerRef.current);
      warningTimerRef.current = null;
      logoutTimerRef.current = null;
      tickTimerRef.current = null;
    }

    function scheduleFromNow(now: number) {
      clearTimers();
      lastActivityRef.current = now;
      setWarning(null);
      const warnAt = Math.max(0, idleMs - WARNING_SECONDS * 1000);
      warningTimerRef.current = setTimeout(() => {
        setWarning(WARNING_SECONDS);
        tickTimerRef.current = setInterval(() => {
          setWarning((s) => (s == null ? null : Math.max(0, s - 1)));
        }, 1000);
        logoutTimerRef.current = setTimeout(() => {
          try { channelRef.current?.postMessage({ type: "logout" }); } catch {}
          signOut({ callbackUrl: "/login" });
        }, WARNING_SECONDS * 1000);
      }, warnAt);
    }

    function onActivity() {
      // Any input within the warning window dismisses the warning and
      // resets the idle clock; broadcast to peers so the whole account
      // stays alive while any one tab is being used.
      scheduleFromNow(Date.now());
      try { channelRef.current?.postMessage({ type: "activity", at: Date.now() }); } catch {}
    }

    try {
      channelRef.current = new BroadcastChannel(BC_CHANNEL);
      channelRef.current.onmessage = (ev) => {
        if (ev.data?.type === "activity") scheduleFromNow(Date.now());
        if (ev.data?.type === "logout") signOut({ callbackUrl: "/login" });
      };
    } catch {
      channelRef.current = null;
    }

    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    scheduleFromNow(Date.now());

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      try { channelRef.current?.close(); } catch {}
      channelRef.current = null;
    };
  }, [idleMs]);

  if (warning === null) return null;

  return (
    <div className="fixed inset-x-0 top-14 z-50 flex justify-center px-3 pointer-events-none">
      <div className="pointer-events-auto bg-amber-50 border border-amber-300 text-amber-900 rounded-lg px-4 py-2 shadow-sm text-xs flex items-center gap-3">
        <span>Signing you out for inactivity in <b>{warning}s</b>.</span>
        <button
          onClick={() => {
            // Any click counts as activity — reuse the same reset path.
            const ev = new Event("mousedown");
            window.dispatchEvent(ev);
          }}
          className="rounded-md bg-amber-600 text-white px-2 py-1 text-[11px] font-semibold"
        >
          Stay signed in
        </button>
      </div>
    </div>
  );
}
