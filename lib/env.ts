import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  SESSION_SECRET: z.string().min(16).optional(),
  CRON_SECRET: z.string().optional(),
  ARBITER_KEY: z.string().optional(),
  NIMIQ_NETWORK: z.enum(["mainnet", "testnet"]).default("testnet"),
  NIMIQ_RPC_URL: z.string().optional(),
  ESCROW_ACCOUNT_ADDRESS: z.string().optional(),
  ESCROW_ACCOUNT_PRIVATE_KEY: z.string().optional(),
  NIMIQ_NETWORK_ID: z.string().optional(),
  ALLOW_UNVERIFIED_WALLET_LOGIN: z.enum(["true", "false"]).default("false"),
  NEXT_PUBLIC_ALLOW_DEV_WALLET: z.string().optional(),
  NEXT_PUBLIC_HUB_BASE_URL: z.string().optional(),
  ALLOW_SEED: z.enum(["true", "false"]).default("false")
});

const parsed = schema.safeParse(process.env);

if (!parsed.success && process.env.NODE_ENV === "production") {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment configuration");
}

type Env = z.infer<typeof schema>;

export const env = parsed.success ? parsed.data : (schema.partial().parse(process.env) as unknown as Env);

export function requireEnv(key: keyof Env): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}
