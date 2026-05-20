/** Maps Gemini Interactions API SSE events into persisted Antigravity-style AgentTrace rows. */

import type { AntigravityAgent } from '../types/agentWorkspace';
import { withAntigravityMeta } from '../utils/antigravityMeta';
import { AntigravityWorkspaceSession } from './antigravityWorkspaceSession';

type SseEvent = {
  event_type?: string;
  interaction?: { id?: string; status?: string };
  interaction_id?: string;
  status?: string;
  error?: { message?: string; code?: string };
  index?: number;
  step?: { type?: string; name?: string };
  delta?: {
    type?: string;
    text?: string;
    arguments?: string;
    content?: { type?: string; text?: string };
    result?: string;
    is_error?: boolean;
  };
};

function inferAgentFromStepType(stepType: string | undefined): AntigravityAgent {
  if (!stepType) {
    return '@ReviewerSwarm';
  }
  if (stepType === 'thought') {
    return '@ReviewerSwarm';
  }
  if (stepType === 'function_call' || stepType === 'function_result') {
    return '@ReviewerSwarm';
  }
  if (stepType === 'code_execution_call' || stepType === 'code_execution_result') {
    return '@ReviewerSwarm';
  }
  return '@ReviewerSwarm';
}

export async function appendGeminiSseToSession(
  session: AntigravityWorkspaceSession,
  raw: unknown,
): Promise<void> {
  if (!session.isEnabled()) {
    return;
  }
  const ev = raw as SseEvent;
  const et = ev.event_type;
  if (!et) {
    return;
  }

  if (et === 'interaction.created') {
    await session.step(
      '@Orchestrator',
      `Gemini Interactions: session created (interaction_id=${ev.interaction?.id ?? 'unknown'}).`,
      withAntigravityMeta({ source: 'gemini_interactions_sse', status: ev.interaction?.status }),
    );
    return;
  }

  if (et === 'interaction.status_update') {
    await session.step(
      '@Orchestrator',
      `Gemini Interactions: status → ${ev.status ?? 'unknown'}`,
      withAntigravityMeta({ source: 'gemini_interactions_sse', interaction_id: ev.interaction_id }),
    );
    return;
  }

  if (et === 'error') {
    await session.step(
      '@Orchestrator',
      `Gemini Interactions SSE error: ${ev.error?.message ?? JSON.stringify(ev.error)}`,
      withAntigravityMeta({ source: 'gemini_interactions_sse', code: ev.error?.code }),
    );
    return;
  }

  if (et === 'step.start') {
    const st = ev.step?.type;
    const agent = inferAgentFromStepType(st);
    await session.step(agent, `Gemini step.start: ${st ?? 'unknown'}`, withAntigravityMeta({
      source: 'gemini_interactions_sse',
      index: ev.index,
    }));
    return;
  }

  if (et === 'step.delta') {
    const d = ev.delta;
    if (!d?.type) {
      return;
    }
    if (d.type === 'text' && d.text) {
      return;
    }
    if (d.type === 'thought_summary') {
      const t =
        d.content && typeof d.content === 'object' && 'text' in d.content
          ? String((d.content as { text?: string }).text ?? '')
          : '';
      if (t) {
        await session.thought(
          '@ReviewerSwarm',
          t,
          withAntigravityMeta({ source: 'gemini_interactions_sse', delta: 'thought_summary' }),
        );
      }
      return;
    }
    if (d.type === 'arguments_delta' && d.arguments) {
      return;
    }
    if (d.type === 'code_execution_call') {
      await session.tool('@ReviewerSwarm', 'code_execution_call', { source: 'gemini_interactions_sse' });
      return;
    }
    if (d.type === 'code_execution_result') {
      const preview = (d.result ?? '').slice(0, 500);
      await session.tool('@ReviewerSwarm', `code_execution_result (is_error=${String(d.is_error)})`, {
        source: 'gemini_interactions_sse',
        preview,
      });
      return;
    }
    await session.thought(
      '@ReviewerSwarm',
      `step.delta: ${d.type}`,
      withAntigravityMeta({ source: 'gemini_interactions_sse', index: ev.index }),
    );
    return;
  }

  if (et === 'step.stop') {
    await session.step(
      '@ReviewerSwarm',
      `step.stop index=${ev.index ?? '?'}`,
      withAntigravityMeta({ source: 'gemini_interactions_sse' }),
    );
    return;
  }

  if (et === 'interaction.completed') {
    const usage = (ev.interaction as { usage?: { total_tokens?: number; totalTokenCount?: number } } | undefined)
      ?.usage;
    const tokens = usage?.total_tokens ?? usage?.totalTokenCount;
    await session.step(
      '@Orchestrator',
      `Gemini Interactions: interaction.completed${tokens != null ? ` (tokens≈${tokens})` : ''}.`,
      withAntigravityMeta({ source: 'gemini_interactions_sse', status: ev.interaction?.status }),
    );
  }
}