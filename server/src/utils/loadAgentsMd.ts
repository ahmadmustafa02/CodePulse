/** Loads `.agent/AGENTS.md` from the repository root (parent of `server/`). */

import fs from 'node:fs';
import path from 'node:path';

export function loadAgentsMd(): string {
  const candidates = [
    path.join(__dirname, '..', '..', '..', '.agent', 'AGENTS.md'),
    path.join(process.cwd(), '.agent', 'AGENTS.md'),
    path.join(process.cwd(), '..', '.agent', 'AGENTS.md'),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        return fs.readFileSync(p, 'utf8').trim();
      }
    } catch {
      /* continue */
    }
  }
  return '';
}
