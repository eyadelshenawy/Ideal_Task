import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthSessionProvider from "@/components/AuthSessionProvider";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "IDT Desk",
  description: "Team Task Manager for IDEAL for Digital Transformation",
  manifest: "/manifest.json",
  // favicon.ico for the browser tab, PNGs for bookmarks and Android, and a
  // 180px apple-touch-icon for the iPhone home screen.
  icons: { icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0A5A46",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-brand-bg min-h-screen">
        <AuthSessionProvider>{children}</AuthSessionProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
