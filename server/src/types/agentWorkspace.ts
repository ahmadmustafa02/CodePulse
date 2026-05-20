/** Antigravity-style agent workspace: trace entries and analyzeDiff context. */

export type AntigravityAgent = '@Triager' | '@HabitAnalyzer' | '@ReviewerSwarm' | '@Orchestrator';

export type AgentTraceLogEntry = {
  timestamp: string;
  kind: 'session' | 'transition' | 'step' | 'thought' | 'tool';
  agent: AntigravityAgent;
  message: string;
  meta?: Record<string, unknown>;
};

export type AnalyzeDiffWorkspaceContext = {
  pullRequestId: string;
  developerId: string;
  organizationId: string;
  repositoryId: string;
};
