export const ANTIGRAVITY_ENV = 'antigravity' as const;

export function withAntigravityMeta(meta?: Record<string, unknown>): Record<string, unknown> {
  return { ...(meta ?? {}), environment: ANTIGRAVITY_ENV };
}
