/** Validates process environment with Zod and exports a typed `env` object; exits on failure. */

import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z
    .string()
    .default('3001')
    .transform((value) => Number.parseInt(value, 10))
    .refine((n) => Number.isInteger(n) && n >= 1 && n <= 65535, 'PORT must be between 1 and 65535'),
  GITHUB_WEBHOOK_SECRET: z.string().min(20, 'GITHUB_WEBHOOK_SECRET must be at least 20 characters'),
  GITHUB_APP_ID: z.string().min(1, 'GITHUB_APP_ID is required'),
  GITHUB_PRIVATE_KEY: z.string().min(1, 'GITHUB_PRIVATE_KEY is required'),
  GITHUB_OAUTH_CLIENT_ID: z.string().min(1, 'GITHUB_OAUTH_CLIENT_ID is required'),
  GITHUB_OAUTH_CLIENT_SECRET: z.string().min(1, 'GITHUB_OAUTH_CLIENT_SECRET is required'),
  GITHUB_OAUTH_CALLBACK_URL: z.string().url('GITHUB_OAUTH_CALLBACK_URL must be a valid URL'),
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required').default('redis://127.0.0.1:6380'),
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  DIGEST_FROM_EMAIL: z.string().min(1, 'DIGEST_FROM_EMAIL is required'),
  DIGEST_CRON_SECRET: z
    .string()
    .min(20, 'DIGEST_CRON_SECRET must be at least 20 characters'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  WEB_APP_URL: z.string().url('WEB_APP_URL must be a valid URL'),
  /** Pre-Groq injection gate. Default off so production is unchanged until dry-run. */
  INJECTION_DEFENSE_ENABLED: z
    .string()
    .optional()
    .default('false')
    .transform((value) => value === 'true' || value === '1'),
  /** Required when INJECTION_DEFENSE_ENABLED=true. */
  OPENAI_API_KEY: z.string().min(1).optional(),
  /**
   * Comma-separated GitHub App installation IDs allowed to use the gate.
   * When non-empty, all other installs no-op (skipped) — use this to keep
   * OpenAI spend on test installs only while the flag is on in production.
   */
  INJECTION_DEFENSE_INSTALLATION_ALLOWLIST: z
    .string()
    .optional()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => Number.parseInt(part, 10))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  INJECTION_BLOCK_THRESHOLD: z
    .string()
    .optional()
    .default('0.55')
    .transform((value) => Number.parseFloat(value))
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= 1, 'INJECTION_BLOCK_THRESHOLD must be 0..1'),
  INJECTION_FLAG_THRESHOLD: z
    .string()
    .optional()
    .default('0.42')
    .transform((value) => Number.parseFloat(value))
    .refine((n) => Number.isFinite(n) && n >= 0 && n <= 1, 'INJECTION_FLAG_THRESHOLD must be 0..1'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const flattened = parsed.error.flatten();
  const payload = {
    message: 'Environment validation failed',
    fieldErrors: flattened.fieldErrors,
    formErrors: flattened.formErrors,
  };
  process.stderr.write(JSON.stringify(payload, null, 2) + '\n');
  process.exit(1);
}

if (parsed.data.INJECTION_DEFENSE_ENABLED && !parsed.data.OPENAI_API_KEY) {
  process.stderr.write(
    JSON.stringify(
      {
        message: 'Environment validation failed',
        formErrors: ['OPENAI_API_KEY is required when INJECTION_DEFENSE_ENABLED=true'],
      },
      null,
      2,
    ) + '\n',
  );
  process.exit(1);
}

if (parsed.data.INJECTION_FLAG_THRESHOLD > parsed.data.INJECTION_BLOCK_THRESHOLD) {
  process.stderr.write(
    JSON.stringify(
      {
        message: 'Environment validation failed',
        formErrors: ['INJECTION_FLAG_THRESHOLD must be <= INJECTION_BLOCK_THRESHOLD'],
      },
      null,
      2,
    ) + '\n',
  );
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
