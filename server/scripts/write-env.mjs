import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const content = `/** Validates process environment with Zod and exports a typed \`env\` object; exits on failure. */

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
  RESEND_API_KEY: z.string().min(1, 'RESEND_API_KEY is required'),
  DIGEST_FROM_EMAIL: z.string().email('DIGEST_FROM_EMAIL must be a valid email address'),
  DIGEST_CRON_SECRET: z
    .string()
    .min(20, 'DIGEST_CRON_SECRET must be at least 20 characters'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  WEB_APP_URL: z.string().url('WEB_APP_URL must be a valid URL'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const flattened = parsed.error.flatten();
  const payload = {
    message: 'Environment validation failed',
    fieldErrors: flattened.fieldErrors,
    formErrors: flattened.formErrors,
  };
  process.stderr.write(JSON.stringify(payload, null, 2) + '\\n');
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
`;

fs.writeFileSync(
  path.join(fileURLToPath(new URL('..', import.meta.url)), 'src', 'config', 'env.ts'),
  content,
  'utf8',
);
