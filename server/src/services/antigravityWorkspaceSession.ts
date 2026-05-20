/** Antigravity Agent Workspace session: lifecycle + persisted AgentTrace append stream. */

import { Prisma } from '@prisma/client';
import type {
  AgentTraceLogEntry,
  AnalyzeDiffWorkspaceContext,
  AntigravityAgent,
} from '../types/agentWorkspace';
import { databaseService } from './databaseService';

export class AntigravityWorkspaceSession {
  private traceId: string | null = null;

  private readonly entries: AgentTraceLogEntry[] = [];

  constructor(private readonly ctx: AnalyzeDiffWorkspaceContext | undefined) {}

  isEnabled(): boolean {
    return this.ctx !== undefined;
  }

  async open(): Promise<void> {
    if (!this.ctx) {
      return;
    }
    const row = await databaseService.createAgentTrace(this.ctx.pullRequestId);
    this.traceId = row.id;
    await this.persistAppend({
      timestamp: new Date().toISOString(),
      kind: 'session',
      agent: '@Orchestrator',
      message: 'Antigravity workspace session opened.',
      meta: { pullRequestId: this.ctx.pullRequestId },
    });
  }

  async transition(
    from: AntigravityAgent | 'workspace',
    to: AntigravityAgent,
    thought: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await this.persistAppend({
      timestamp: new Date().toISOString(),
      kind: 'transition',
      agent: to,
      message: thought,
      meta: { from, to, ...meta },
    });
  }

  async thought(agent: AntigravityAgent, message: string, meta?: Record<string, unknown>): Promise<void> {
    await this.persistAppend({
      timestamp: new Date().toISOString(),
      kind: 'thought',
      agent,
      message,
      meta,
    });
  }

  async step(agent: AntigravityAgent, message: string, meta?: Record<string, unknown>): Promise<void> {
    await this.persistAppend({
      timestamp: new Date().toISOString(),
      kind: 'step',
      agent,
      message,
      meta,
    });
  }

  async tool(agent: AntigravityAgent, message: string, meta?: Record<string, unknown>): Promise<void> {
    await this.persistAppend({
      timestamp: new Date().toISOString(),
      kind: 'tool',
      agent,
      message,
      meta,
    });
  }

  async close(message: string, meta?: Record<string, unknown>): Promise<void> {
    if (!this.isEnabled()) {
      return;
    }
    await this.persistAppend({
      timestamp: new Date().toISOString(),
      kind: 'session',
      agent: '@Orchestrator',
      message,
      meta: { phase: 'close', ...meta },
    });
  }

  private async persistAppend(entry: AgentTraceLogEntry): Promise<void> {
    if (!this.ctx) {
      return;
    }
    this.entries.push(entry);
    if (this.traceId !== null) {
      await databaseService.setAgentTraceLogs(this.traceId, this.entries as Prisma.InputJsonValue);
    }
  }
}
