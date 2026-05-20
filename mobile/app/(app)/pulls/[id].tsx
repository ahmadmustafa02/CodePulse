import { useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ExternalLink } from "lucide-react-native";
import { AntigravityPill } from "../../../components/ui/AntigravityPill";
import { Card } from "../../../components/ui/Card";
import { ErrorState, formatQueryError } from "../../../components/ui/ErrorState";
import { LoadingSpinner } from "../../../components/ui/LoadingSpinner";
import { SeverityChip } from "../../../components/ui/SeverityChip";
import { TraceEntry } from "../../../components/ui/TraceEntry";
import { normalizeSeverity } from "../../../lib/severity";
import { usePullRequest, usePullRequestTrace } from "../../../lib/queries";
import type { AgentTraceLogEntry, ReviewIssue } from "../../../types/api";

const SEV_ORDER = ["critical", "high", "medium", "low"] as const;

function sortIssues(issues: ReviewIssue[]): ReviewIssue[] {
  return [...issues].sort((a, b) => {
    const sa = normalizeSeverity(a.severity);
    const sb = normalizeSeverity(b.severity);
    return SEV_ORDER.indexOf(sa) - SEV_ORDER.indexOf(sb);
  });
}

function githubPrUrl(repo: string, prNumber: number): string {
  return `https://github.com/${repo}/pull/${prNumber}`;
}

function githubFileUrl(repo: string, file: string, line: number): string {
  return `https://github.com/${repo}/blob/HEAD/${file}#L${line}`;
}

function filterTraces(logs: AgentTraceLogEntry[], showThinking: boolean): AgentTraceLogEntry[] {
  if (showThinking) return logs;
  return logs.filter((e) => {
    const meta = readMeta(e);
    const isEscalationMeta = meta.kind === "escalation";
    return e.kind === "tool" || e.kind === "session" || isEscalationMeta;
  });
}

function readMeta(entry: AgentTraceLogEntry): Record<string, unknown> {
  const m = entry.meta;
  if (m && typeof m === "object" && !Array.isArray(m)) return m as Record<string, unknown>;
  return {};
}

export default function PullDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const prQ = usePullRequest(String(id));
  const traceQ = usePullRequestTrace(String(id));
  const [showThinking, setShowThinking] = useState(true);

  const pr = prQ.data;
  const issues = useMemo(() => (pr ? sortIssues(pr.issues) : []), [pr]);

  const hasAntigravity = useMemo(
    () => traceQ.data?.logs.some((e) => readMeta(e).environment === "antigravity") ?? false,
    [traceQ.data?.logs],
  );

  const filteredLogs = useMemo(
    () => (traceQ.data ? filterTraces(traceQ.data.logs, showThinking) : []),
    [traceQ.data, showThinking],
  );

  const severityCounts = useMemo(() => {
    const m: Record<"critical" | "high" | "medium" | "low", number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    for (const i of issues) {
      m[normalizeSeverity(i.severity)]++;
    }
    return m;
  }, [issues]);

  const toolCalls = useMemo(
    () => traceQ.data?.logs.filter((e: AgentTraceLogEntry) => e.kind === "tool").length ?? 0,
    [traceQ.data?.logs],
  );

  const escalationHints = useMemo(
    () =>
      traceQ.data?.logs.filter((e: AgentTraceLogEntry) => e.message.toLowerCase().includes("escalation")).length ??
      0,
    [traceQ.data?.logs],
  );

  if (prQ.isLoading || traceQ.isLoading) {
    return (
      <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
        <LoadingSpinner />
      </View>
    );
  }

  if (prQ.isError) {
    return (
      <View className="flex-1 bg-background px-4" style={{ paddingTop: insets.top }}>
        <ErrorState error={prQ.error} />
      </View>
    );
  }

  if (!pr) {
    return (
      <View className="flex-1 bg-background px-4" style={{ paddingTop: insets.top }}>
        <ErrorState title="Not found" message="This pull request is not in the current reviews payload." />
      </View>
    );
  }

  const gh = githubPrUrl(pr.repo, pr.prNumber);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 48 }}>
      <View className="px-4 pt-2">
        {hasAntigravity ? (
          <View className="mb-3 flex-row items-center gap-2">
            <AntigravityPill />
          </View>
        ) : null}

        <Card className="p-4">
          <View className="flex-row gap-3">
            {pr.authorAvatar ? (
              <Image source={{ uri: pr.authorAvatar }} className="size-12 rounded-full bg-zinc-800" />
            ) : (
              <View className="size-12 items-center justify-center rounded-full bg-zinc-800">
                <Text className="text-lg text-zinc-400">@</Text>
              </View>
            )}
            <View className="min-w-0 flex-1">
              <Text className="text-base font-semibold text-zinc-100" style={{ fontFamily: "Inter_600SemiBold" }}>
                {pr.title}
              </Text>
              <Text className="mt-1 text-xs text-zinc-500" style={{ fontFamily: "Inter_400Regular" }}>
                {pr.repo} · #{pr.prNumber} · {pr.state}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => void Linking.openURL(gh)}
            className="mt-4 flex-row items-center gap-2 self-start rounded-md border border-zinc-700 px-3 py-2"
          >
            <ExternalLink size={14} color="#fafafa" />
            <Text className="text-xs font-medium text-zinc-100" style={{ fontFamily: "Inter_500Medium" }}>
              View on GitHub
            </Text>
          </Pressable>
        </Card>

        <View className="mt-4 flex-row flex-wrap gap-2">
          <StatPill label="Critical" value={severityCounts.critical} color="#ef4444" />
          <StatPill label="High" value={severityCounts.high} color="#f97316" />
          <StatPill label="Medium" value={severityCounts.medium} color="#eab308" />
          <StatPill label="Low" value={severityCounts.low} color="#22c55e" />
          <StatPill label="Tool calls" value={toolCalls} color="#a1a1aa" />
          <StatPill label="Escalations (trace)" value={escalationHints} color="#fb923c" />
        </View>

        <View className="mt-6 flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-orange-400" style={{ fontFamily: "Inter_600SemiBold" }}>
            Agent reasoning
          </Text>
          <View className="flex-row items-center gap-2">
            <Text className="text-xs text-zinc-500">Show thinking</Text>
            <Switch value={showThinking} onValueChange={setShowThinking} />
          </View>
        </View>
        <Card className="mt-2 overflow-hidden bg-agent-console p-2">
          {traceQ.isError ? (
            <Text className="p-2 font-mono text-xs text-red-400">{formatQueryError(traceQ.error)}</Text>
          ) : filteredLogs.length === 0 ? (
            <Text className="p-2 font-mono text-xs text-zinc-600">No trace entries for this filter.</Text>
          ) : (
            filteredLogs.map((entry, i) => <TraceEntry key={`${entry.timestamp}-${i}`} entry={entry} />)
          )}
        </Card>

        <Text className="mb-2 mt-8 text-sm font-semibold text-orange-400" style={{ fontFamily: "Inter_600SemiBold" }}>
          Inline findings
        </Text>
        {issues.length === 0 ? (
          <Text className="text-xs text-zinc-500">No issues recorded for this PR.</Text>
        ) : (
          issues.map((issue) => (
            <Card key={issue.id} className="mb-2 p-3">
              <View className="flex-row flex-wrap items-center gap-2">
                <SeverityChip severity={normalizeSeverity(issue.severity)} />
                <Text className="font-mono text-[10px] text-zinc-500">
                  {issue.file}:{issue.line}
                </Text>
              </View>
              <Text className="mt-2 text-xs font-medium text-zinc-200" style={{ fontFamily: "Inter_500Medium" }}>
                {issue.category}
              </Text>
              <Text className="mt-1 text-xs text-zinc-200" style={{ fontFamily: "Inter_400Regular" }}>
                {issue.title}
              </Text>
              <Pressable
                onPress={() => void Linking.openURL(githubFileUrl(pr.repo, issue.file, issue.line))}
                className="mt-3 self-start"
              >
                <Text className="text-xs text-orange-400" style={{ fontFamily: "Inter_500Medium" }}>
                  View on GitHub
                </Text>
              </Pressable>
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2">
      <Text className="text-[10px] uppercase tracking-wider text-zinc-500" style={{ fontFamily: "Inter_500Medium" }}>
        {label}
      </Text>
      <Text className="mt-1 text-lg font-semibold" style={{ fontFamily: "Inter_600SemiBold", color }}>
        {value}
      </Text>
    </View>
  );
}
