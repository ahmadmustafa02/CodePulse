/** Injection-defense public API — pre-Groq gate over untrusted PR content. */

export { scanUntrustedContent, findDecisionForJob } from './gate';
export type {
  InjectionGateResult,
  InjectionOutcome,
  ScanUntrustedContentInput,
  ChunkScore,
} from './types';
