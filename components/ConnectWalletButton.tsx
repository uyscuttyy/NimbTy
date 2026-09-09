"use client";

import { useSession } from "./SessionProvider";

const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-4)}`;

export function ConnectWalletButton() {
  const { user, status, busy, error, adapterLabel, signIn, signOut, clearError } = useSession();

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex min-h-touch items-center gap-2">
        {status === "loading" && <span className="text-sm text-slate2">…</span>}

        {status === "connected" && user && (
          <>
            <span
              className="rounded-full bg-primary-soft px-3 py-1.5 text-xs font-bold text-primary-dark"
              title={user.walletAddress}
            >
              🟢 {short(user.walletAddress)}
            </span>
            <button onClick={signOut} className="text-xs text-slate2 underline underline-offset-4 hover:text-navy">
              Sign out
            </button>
          </>
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
