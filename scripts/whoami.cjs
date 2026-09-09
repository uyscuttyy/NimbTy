const fs = require("fs");
const { pbkdf2Sync } = require("node:crypto");
const N = require("@nimiq/core");
const env = {};
for (const line of fs.readFileSync("/home/uyscutty/projects/NimbTy/.env", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)="(.*)"\s*$/);
  if (m) env[m[1]] = m[2];
}
const seed = pbkdf2Sync(Buffer.from(env.CREATOR_MNEMONIC.trim().normalize("NFKD"), "utf8"), Buffer.from("mnemonic", "utf8"), 2048, 64, "sha512");
const xpk = N.ExtendedPrivateKey.derivePathFromSeed("m/44'/242'/0'/0'", seed);
console.log("creator:", xpk.toAddress().toUserFriendlyAddress());
console.log("match NQ64:", xpk.toAddress().toUserFriendlyAddress().replace(/\s+/g, "") === "NQ64EA584N13TDG3B9LL9QTHS3BUAJ34FXJY");
