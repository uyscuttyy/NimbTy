import { Currency } from "@prisma/client";

/** NIM has 5 decimals (1 luna = 1e-5 NIM). USDT displays with 2. */
export const CURRENCY_META: Record<Currency, { decimals: number; symbol: string }> = {
  NIM: { decimals: 5, symbol: "NIM" },
  USDT: { decimals: 2, symbol: "$" },
};

export function formatReward(amount: string | number, currency: Currency): string {
  const meta = CURRENCY_META[currency];
  const n = typeof amount === "string" ? Number(amount) : amount;
  const formatted = n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: meta.decimals,
  });
  return currency === "USDT" ? `${meta.symbol}${formatted}` : `${formatted} NIM`;
}

/** Normalize user input (e.g. "5", "5.00", " 5 ") into a clean decimal string. */
export function parseAmount(input: string, currency: Currency): string {
  const n = Number(input.trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid reward amount");
  const decimals = CURRENCY_META[currency].decimals;
  const parts = n.toFixed(decimals).split(".");
  parts[1] = parts[1].replace(/0+$/, "");
  return parts[1].length ? `${parts[0]}.${parts[1]}` : parts[0];
}
