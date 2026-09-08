import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SessionProvider } from "@/components/SessionProvider";
import { ConnectWalletButton } from "@/components/ConnectWalletButton";
import { BottomNav } from "@/components/BottomNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "NimBty — Tiny tasks. Real rewards.",
  description: "Put a bounty on anything that needs doing. Funded in Nimiq. Paid the moment it's done.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-[#FAFAFA] antialiased">
        <SessionProvider>
          <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur">
            <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-2 sm:px-4 md:px-6">
              <div className="flex items-center gap-4">
                <Link href="/" className="flex items-baseline gap-2">
                  <span className="font-display text-xl font-bold tracking-tight">
                    Nim<span className="text-primary">Bty</span>
                  </span>
                  <span className="hidden sm:inline text-xs text-slate2">Tiny tasks. Real rewards.</span>
                </Link>
                <nav aria-label="Desktop" className="hidden items-center gap-1 text-sm font-bold text-navy md:flex">
                  <Link href="/explore" className="rounded-xl px-3 py-2 hover:bg-slate-100">Explore</Link>
                  <Link href="/work" className="rounded-xl px-3 py-2 hover:bg-slate-100">Work</Link>
                  <Link href="/me" className="rounded-xl px-3 py-2 hover:bg-slate-100">Me</Link>
                </nav>
              </div>
              <div className="flex items-center gap-2">
                <Link href="/post" className="hidden min-h-touch items-center rounded-2xl bg-primary px-4 py-2 text-sm font-extrabold text-white md:inline-flex">
                  ＋ Post a bounty
                </Link>
                <ConnectWalletButton />
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-2 pb-28 sm:px-4 md:px-6 md:pb-16">{children}</main>
          <BottomNav />
        </SessionProvider>
      </body>
    </html>
  );
}
