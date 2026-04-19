import { z } from "zod";

/**
 * Environment schema for all runtime settings.
 *
 * Architecture role:
 * - Centralizes validation for runtime values used by config and core layers.
 * - Prevents invalid startup state before any business logic is executed.
 */

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_MODE: z.enum(["cli", "server"]).default("cli"),
  SOLANA_RPC_URL: z.url(),
  HOT_WALLET_PATH: z.string().min(1),
  JUPITER_API_BASE_URL: z.url().default("https://quote-api.jup.ag/v6"),
  JUPITER_API_KEY: z.string().optional(),
  DEFAULT_SLIPPAGE_BPS: z.coerce.number().int().min(1).max(5000).default(50),
  PRIORITY_FEE_MICROLAMPORTS: z.coerce.number().int().min(0).default(0),
  ENABLE_POST_SWAP_MEMO: booleanFromEnv.default(false),
  MAX_RETRIES: z.coerce.number().int().min(0).default(3),
  RETRY_BASE_DELAY_MS: z.coerce.number().int().min(50).default(350),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(100).default(10_000),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  PRICE_MONITOR_CRON: z.string().min(1).default("*/30 * * * * *")
});

export type AppEnv = z.infer<typeof envSchema>;