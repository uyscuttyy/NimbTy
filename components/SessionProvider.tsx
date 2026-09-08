"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { pickAdapter } from "@/lib/wallet/adapters";
import { WalletError } from "@/lib/wallet/types";

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
      setError("Network unavailable — can't reach NimBty.");
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signIn = useCallback(async () => {
    setError(null);
    try {
      if (!adapter.isAvailable())
        throw new WalletError("WALLET_UNAVAILABLE", "No wallet adapter available. Enable the dev wallet (NEXT_PUBLIC_ALLOW_DEV_WALLET=true) or install the Nimiq Hub adapter.");
      setBusy({ step: `Opening ${adapter.label}…` });
      const { walletAddress } = await adapter.connect();

      setBusy({ step: "Preparing sign-in…" });
      const nRes = await fetch("/api/auth/nonce", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const nonce = await nRes.json();
      if (!nonce.ok) throw new Error(nonce.message ?? "Could not start sign-in.");

      setBusy({ step: "Waiting for your signature…" });
      const signed = await adapter.sign(nonce.message, walletAddress);

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
    } catch (e) {
      setError(e instanceof WalletError || e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      setBusy(null);
    }
  }, [adapter]);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setStatus("disconnected");
  }, []);

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
