import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthSessionProvider from "@/components/AuthSessionProvider";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
  title: "IDEAL Tasks",
  description: "Team Task Manager for IDEAL for Digital Transformation",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
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
