// Nimiq identity = wallet address (spec §31). Phase 1 validates FORMAT only;
// full checksum + address↔pubkey binding lands with @nimiq/core in Phase 2.
const NIMIQ_FORMAT = /^NQ[0-9A-Z]{34}$/;

export function normalizeWalletAddress(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

export function isValidNimiqAddressFormat(addr: string): boolean {
  return NIMIQ_FORMAT.test(addr);
}
