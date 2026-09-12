"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { pickAdapter } from "@/lib/wallet/adapters";
import { WalletError } from "@/lib/wallet/types";

const LAST_WALLET_KEY = "nimbTy_last_wallet";

type SessionUser = { id: string; walletAddress: string; displayName: string | null };
type Status = "loading" | "connected" | "disconnected";

interface SessionCtx {
  user: SessionUser | null;
  status: Status;
  busy: null | { step: string };
  error: string | null;
  adapterLabel: string;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  clearError(): void;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState<null | { step: string }>(null);
  const [error, setError] = useState<string | null>(null);
  const adapter = useMemo(() => pickAdapter(), []);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/session", { cache: "no-store" });
      const d = await r.json();
      setUser(d.user ?? null);
      setStatus(d.user ? "connected" : "disconnected");
    } catch {
      setStatus("disconnected");
      setError("Network unavailable — can't reach NimbTy.");
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signIn = useCallback(async () => {
    setError(null);
    // Re-pick at click time: inside Nimiq Pay the injected provider can arrive
    // after first render, so a memoized choice could miss it.
    const liveAdapter = pickAdapter();
    try {
      if (!liveAdapter.isAvailable())
        throw new WalletError("WALLET_UNAVAILABLE", "No wallet found. Open this page inside the Nimiq Pay app, or connect via Nimiq Hub in a regular browser.");
      setBusy({ step: `Opening ${liveAdapter.label}…` });
      const { walletAddress } = await liveAdapter.connect();

      setBusy({ step: "Preparing sign-in…" });
      const nRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const nonce = await nRes.json();
      if (!nonce.ok) throw new Error(nonce.message ?? "Could not start sign-in.");

      setBusy({ step: "Waiting for your signature…" });
      const signed = await liveAdapter.sign(nonce.message, walletAddress);

      setBusy({ step: "Verifying signature…" });
      const vRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...signed, walletAddress: signed.walletAddress || walletAddress, nonce: nonce.nonce }),
      });
      const v = await vRes.json();
      if (!v.ok) throw new Error(v.message ?? "Verification failed.");

      setUser(v.user);
      setStatus("connected");
      try { localStorage.setItem(LAST_WALLET_KEY, v.user.walletAddress); } catch { /* private mode */ }
    } catch (e) {
      setError(e instanceof WalletError || e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(null);
    }
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    try { localStorage.removeItem(LAST_WALLET_KEY); } catch { /* private mode */ }
    setUser(null);
    setStatus("disconnected");
  }, []);

  // Auto sign-in for returning wallets: if this device signed in before and we
  // are inside Nimiq Pay (injected provider), reconnect silently on load.
  // Outside Pay we never auto-popup the Hub — the user taps Connect.
  const autoTried = useRef(false);
  useEffect(() => {
    if (status !== "disconnected" || autoTried.current) return;
    autoTried.current = true;
    let remembered: string | null = null;
    try { remembered = localStorage.getItem(LAST_WALLET_KEY); } catch { remembered = null; }
    if (!remembered) return;
    let stopped = false;
    let tries = 0;
    const t = setInterval(() => {
      if (stopped) { clearInterval(t); return; }
      if ((window as unknown as { nimiq?: unknown }).nimiq) {
        clearInterval(t);
        if (!stopped) signIn();
      } else if (++tries > 12) clearInterval(t);
    }, 500);
    return () => { stopped = true; clearInterval(t); };
  }, [status, signIn]);

  const value: SessionCtx = {
    user, status, busy, error, adapterLabel: adapter.label,
    signIn, signOut, clearError: () => setError(null),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
