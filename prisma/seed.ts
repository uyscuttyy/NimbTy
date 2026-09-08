/**
 * NimBty seed — DEV ONLY.
 * Refuses to run in production or unless ALLOW_SEED=true.
 * Marketplace seed data (demo bounties etc.) is added in Phase 7; the guard
 * and isolation ship now so no fake data can ever reach production.
 */
async function main() {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_SEED !== "true") {
    console.log("[seed] Disabled. Set ALLOW_SEED=true (and NODE_ENV !== production) to run.");
    return;
  }
  console.log("[seed] Running development seeds... (Phase 7 adds demo bounties)");
  // Phase 7: insert demo users/bounties here.
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
