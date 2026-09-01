/**
 * Recover "empty findings" intent when Groq rejects a malformed tool call / parse
 * but the failed_generation (or message body) clearly means no issues.
 */

export function extractFailedGeneration(message: string): string | null {
  const markers = ['failed_generation\\":\\"', 'failed_generation":"'];
  for (const m of markers) {
    const idx = message.indexOf(m);
    if (idx === -1) continue;
    let i = idx + m.length;
    let out = '';
    while (i < message.length) {
      if (m.includes('\\"')) {
        if (message.startsWith('\\"}', i) || message.startsWith('\\"}}', i)) break;
        if (message[i] === '\\' && i + 1 < message.length) {
          out += message[i] + message[i + 1];
          i += 2;
          continue;
        }
      } else if (message[i] === '"' && message[i - 1] !== '\\') {
        break;
      }
      out += message[i];
      i += 1;
    }
    try {
      return JSON.parse(`"${out}"`);
    } catch {
      return out
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  }
  return null;
}

/** True when text clearly expresses empty findings (not a malformed non-empty issues array). */
export function looksLikeEmptyIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  // Non-empty issues payload → do not treat as clean.
  if (/\\?"issues\\?"\s*:\s*\[[\s\S]*\{/.test(t) && /category|title|severity/.test(t)) {
    return false;
  }

  if (/\\?"issues\\?"\s*:\s*\[\s*\]/.test(t)) return true;
  if (/arguments\\?"\s*:\s*\{\s*\\?"issues\\?"\s*:\s*\[\s*\]/.test(t)) return true;
  if (/```json\s*\{\s*"issues"\s*:\s*\[\s*\]\s*\}\s*```/i.test(t)) return true;
  if (/```json\s*\[\s*\]\s*```/.test(t)) return true;
  if (/^\s*\{\s*"issues"\s*:\s*\[\s*\]\s*\}\s*$/.test(t)) return true;
  if (/^\s*\[\s*\]\s*$/.test(t)) return true;

  if (/no issues? (identified|found|were identified)/i.test(t)) return true;
  if (/no code quality.*issues/i.test(t)) return true;
  if (/no actionable defects/i.test(t)) return true;
  if (/no apparent[\s\S]{0,40}defects/i.test(t)) return true;
  if (/likely no significant issues/i.test(t)) return true;
  if (/no significant issues/i.test(t)) return true;

  return false;
}

export function canRecoverEmptyIssuesFromError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  const isFormatFailure =
    msg.includes('tool_use_failed') ||
    msg.includes('output_parse_failed') ||
    msg.includes('did not return a tool call') ||
    msg.includes('Failed to parse Groq tool call') ||
    msg.includes('Tool choice is required');

  if (!isFormatFailure) return false;
  if (msg.includes('429') || msg.includes('rate_limit')) return false;

  const fg = extractFailedGeneration(msg);
  if (fg && looksLikeEmptyIntent(fg)) return true;
  return looksLikeEmptyIntent(msg);
}
