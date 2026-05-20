import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import type { ApiResponse } from "../types/api";
import type {
  AgentTraceLogEntry,
  AgentTracePollPayload,
  DashboardStats,
  DigestPreferences,
  EscalationRecord,
  RecentAntigravityTraceFeedItem,
  RepositoryItem,
  ReviewItem,
  TeamMember,
  UserSession,
} from "../types/api";

const DEVICE_TOKEN_KEY = "device_token";

export function getApiBaseUrl(): string {
  const fromExtra =
    (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl?.replace(/\/$/, "") ??
    null;
  return (
    (typeof process !== "undefined" && process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "")) ??
    fromExtra ??
    "https://thecodepulse.azurewebsites.net/api/v1"
  );
}

async function readDeviceToken(): Promise<string | null> {
  try {
    const t = await SecureStore.getItemAsync(DEVICE_TOKEN_KEY);
    return t?.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

export async function setDeviceToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(DEVICE_TOKEN_KEY, token.trim());
}

export async function clearDeviceToken(): Promise<void> {
  await SecureStore.deleteItemAsync(DEVICE_TOKEN_KEY);
}

export async function getStoredDeviceToken(): Promise<string | null> {
  return readDeviceToken();
}

async function parseErrorMessage(response: Response): Promise<string> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return `HTTP ${response.status}`;
  }
  if (body && typeof body === "object") {
    const o = body as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    const err = o.error;
    if (err && typeof err === "object" && typeof (err as Record<string, unknown>).message === "string") {
      return String((err as Record<string, unknown>).message);
    }
  }
  return `HTTP ${response.status}`;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetchJson<T>(
  path: string,
  init?: RequestInit & { tokenOverride?: string | null },
): Promise<T> {
  const base = getApiBaseUrl();
  // Visual testing: no token → omit Authorization (expect 401); never throw before the request.
  const token = init?.tokenOverride !== undefined ? init.tokenOverride : await readDeviceToken();
  const { tokenOverride: _t, ...rest } = init ?? {};
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(rest.headers as Record<string, string> | undefined),
  };
  if (rest.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
    ...rest,
    headers,
  });

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }

  const json = (await response.json()) as ApiResponse<T>;
  if (!json.success) {
    throw new ApiError(response.status, json.message ?? "API request failed");
  }
  return json.data;
}

const AGENT_TRACE_KINDS = new Set<AgentTraceLogEntry["kind"]>([
  "session",
  "transition",
  "step",
  "thought",
  "tool",
]);

const AGENT_TRACE_AGENTS = new Set<AgentTraceLogEntry["agent"]>([
  "@Triager",
  "@HabitAnalyzer",
  "@ReviewerSwarm",
  "@Orchestrator",
]);

function normalizeAgentTraceLogEntry(raw: unknown): AgentTraceLogEntry | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = raw as Record<string, unknown>;
  const timestamp = typeof o.timestamp === "string" ? o.timestamp : "";
  const kind = o.kind;
  const agent = o.agent;
  const message = typeof o.message === "string" ? o.message : "";
  if (typeof kind !== "string" || typeof agent !== "string") {
    return null;
  }
  if (!AGENT_TRACE_KINDS.has(kind as AgentTraceLogEntry["kind"])) {
    return null;
  }
  if (!AGENT_TRACE_AGENTS.has(agent as AgentTraceLogEntry["agent"])) {
    return null;
  }
  const meta =
    o.meta !== undefined && o.meta !== null && typeof o.meta === "object" && !Array.isArray(o.meta)
      ? (o.meta as Record<string, unknown>)
      : undefined;
  return {
    timestamp,
    kind: kind as AgentTraceLogEntry["kind"],
    agent: agent as AgentTraceLogEntry["agent"],
    message,
    meta,
  };
}

export async function getAgentTracesForPullRequest(pullRequestId: string): Promise<AgentTracePollPayload> {
  const id = encodeURIComponent(pullRequestId);
  const base = getApiBaseUrl();
  const token = await readDeviceToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${base}/traces/${id}`, { headers });

  if (response.status === 404) {
    return { logs: [], traceId: null, fetchedAt: new Date().toISOString() };
  }

  if (!response.ok) {
    throw new ApiError(response.status, await parseErrorMessage(response));
  }

  const json = (await response.json()) as ApiResponse<{
    logs: unknown[];
    traceId: string | null;
    fetchedAt: string;
  }>;
  if (!json.success) {
    throw new ApiError(response.status, json.message ?? "API request failed");
  }
  const rawLogs = Array.isArray(json.data.logs) ? json.data.logs : [];
  const logs = rawLogs.map(normalizeAgentTraceLogEntry).filter((e): e is AgentTraceLogEntry => e !== null);
  return {
    logs,
    traceId: json.data.traceId ?? null,
    fetchedAt: json.data.fetchedAt,
  };
}

export const getStats = () => apiFetchJson<DashboardStats>("/stats");
export const getRepositories = () => apiFetchJson<RepositoryItem[]>("/repositories");
export const getReviews = () => apiFetchJson<ReviewItem[]>("/reviews");
export const getTeam = () => apiFetchJson<TeamMember[]>("/team");
export const getSession = () => apiFetchJson<UserSession | null>("/auth/session");
export const getAuthMe = () => apiFetchJson<UserSession>("/auth/me");
export const getDigestPreferences = () => apiFetchJson<DigestPreferences>("/digest/preferences");
export const updateDigestPreferences = (digestEmailEnabled: boolean) =>
  apiFetchJson<DigestPreferences>("/digest/preferences", {
    method: "PATCH",
    body: JSON.stringify({ digestEmailEnabled }),
  });

export const getRecentAntigravityTraceFeed = () =>
  apiFetchJson<RecentAntigravityTraceFeedItem[]>("/antigravity/recent-traces");

export const getEscalations = () => apiFetchJson<EscalationRecord[]>("/escalations");

export async function notifyEscalation(escalationId: string): Promise<{ ok: boolean }> {
  return apiFetchJson<{ ok: boolean }>(`/escalations/${encodeURIComponent(escalationId)}/notify`, {
    method: "POST",
  });
}

export function testAuthMe(token: string) {
  return apiFetchJson<UserSession>("/auth/me", { tokenOverride: token });
}
