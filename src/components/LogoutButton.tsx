"use client";

import { signOut } from "next-auth/react";

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-xs font-semibold rounded-lg border border-brand-border px-3 py-1.5 text-brand-text bg-white"
    >
      Log out
    </button>
  );
}
