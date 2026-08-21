/**
 * Eval-only Groq API key pool. Rotates on rate-limit (429/TPD/TPM), not on tool/parse errors.
 * Keys come from EVAL_GROQ_API_KEYS (comma-separated) plus GROQ_API_KEY as fallback/primary.
 * Never log key values.
 */

export type GroqKeyPool = {
  /** Number of unique keys loaded. */
  size: number;
  /** 1-based index of the active key. */
  currentIndex: number;
  /** Apply the current key to process.env + optional callback (e.g. recreate SDK client). */
  applyCurrent: () => void;
  /**
   * Advance to the next unused key. Returns false when every key has already hit a limit
   * this process (caller should exit RESUME TOMORROW).
   */
  rotate: () => boolean;
};

function uniqueKeys(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of raw) {
    const t = k.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function createGroqKeyPool(onApply?: (apiKey: string) => void): GroqKeyPool {
  const fromList = (process.env.EVAL_GROQ_API_KEYS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const primary = (process.env.GROQ_API_KEY ?? '').trim();
  const keys = uniqueKeys([...fromList, primary]);

  if (keys.length === 0) {
    throw new Error('No Groq API keys: set GROQ_API_KEY and/or EVAL_GROQ_API_KEYS');
  }

  let index = 0;
  const exhausted = new Set<number>();

  const applyCurrent = (): void => {
    const key = keys[index];
    process.env.GROQ_API_KEY = key;
    onApply?.(key);
  };

  applyCurrent();

  return {
    size: keys.length,
    get currentIndex() {
      return index + 1;
    },
    applyCurrent,
    rotate(): boolean {
      exhausted.add(index);
      if (exhausted.size >= keys.length) {
        return false;
      }
      // Prefer the next key that is not exhausted this run.
      for (let step = 1; step <= keys.length; step++) {
        const next = (index + step) % keys.length;
        if (!exhausted.has(next)) {
          index = next;
          applyCurrent();
          return true;
        }
      }
      return false;
    },
  };
}
