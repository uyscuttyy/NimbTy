"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "./SessionProvider";

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`;

export function ConnectWalletButton() {
  const { user, status, busy, error, adapterLabel, signIn, signOut, clearError } = useSession();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex min-h-touch items-center gap-2">
        {status === "loading" && <span className="text-sm text-slate2">…</span>}

        {status === "connected" && user && (
          <div className="relative">
            <button
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary-dark"
              title={user.walletAddress}
            >
              🟢 {short(user.walletAddress)}
            </button>
            {open && (
              <>
                <button aria-label="Close menu" onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default" />
                <div role="menu" className="absolute right-0 z-50 mt-1 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
                  <Link
                    href="/me" onClick={() => setOpen(false)} role="menuitem"
                    className="block px-4 py-2.5 text-left text-sm font-bold text-navy hover:bg-slate-50"
                  >
                    My profile
                  </Link>
                  <button
                    onClick={() => { setOpen(false); signOut(); }} role="menuitem"
                    className="block w-full px-4 py-2.5 text-left text-sm font-bold text-rose-600 hover:bg-rose-50"
                  >
                    Disconnect
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {status === "disconnected" && (
          <button
            onClick={signIn}
            disabled={!!busy}
            className="min-h-touch rounded-2xl bg-primary px-5 text-sm font-extrabold text-white shadow-[0_4px_0_0_#0369A1] transition active:translate-y-0.5 active:shadow-none disabled:opacity-60"
          >
            {busy ? busy.step : connectorLabel(adapterLabel)}
          </button>
        )}
      </div>
      {busy && status === "connected" && (
        <span className="text-xs text-slate2">{busy.step}</span>
      )}
      {error && (
        <button
          onClick={() => { clearError(); }}
          role="alert"
          className="max-w-[78vw] rounded-xl bg-rose-50 px-3 py-1.5 text-left text-xs text-rose-700 ring-1 ring-rose-200 sm:max-w-[320px]"
        >
          {error} <span className="underline">dismiss</span>
        </button>
      )}
    </div>
  );
}

function connectorLabel(label: string) {
  return label.includes("Dev") ? "Connect dev wallet" : "Connect wallet";
}
