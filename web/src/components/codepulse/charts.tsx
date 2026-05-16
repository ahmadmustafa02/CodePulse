import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { severityColor } from "@/lib/severity";

const axis = { stroke: "#27272a", tick: { fill: "#71717a", fontSize: 11 } } as const;
const tooltipStyle = {
  backgroundColor: "#09090b",
  border: "1px solid #27272a",
  borderRadius: 8,
  fontSize: 12,
  color: "#e4e4e7",
};

export function SeverityStackBar({ data }: { data: { week: string; critical: number; high: number; medium: number; low: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data}>
        <CartesianGrid stroke="#1f1f23" vertical={false} />
        <XAxis dataKey="week" {...axis} />
        <YAxis {...axis} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
        <Bar dataKey="critical" stackId="s" fill={severityColor.critical} />
        <Bar dataKey="high" stackId="s" fill={severityColor.high} />
        <Bar dataKey="medium" stackId="s" fill={severityColor.medium} />
        <Bar dataKey="low" stackId="s" fill={severityColor.low} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PRVolumeArea({ data }: { data: { week: string; opened: number; reviewed: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="opened" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fafafa" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#fafafa" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="reviewed" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={severityColor.low} stopOpacity={0.35} />
            <stop offset="100%" stopColor={severityColor.low} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1f1f23" vertical={false} />
        <XAxis dataKey="week" {...axis} />
        <YAxis {...axis} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }} />
        <Area type="monotone" dataKey="opened" stroke="#fafafa" fill="url(#opened)" strokeWidth={1.5} />
        <Area type="monotone" dataKey="reviewed" stroke={severityColor.low} fill="url(#reviewed)" strokeWidth={1.5} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function LatencyLine({ data }: { data: { day: string; seconds: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={data}>
        <CartesianGrid stroke="#1f1f23" vertical={false} />
        <XAxis dataKey="day" {...axis} />
        <YAxis {...axis} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="seconds" stroke={severityColor.high} strokeWidth={1.8} dot={{ r: 3, fill: severityColor.high }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MistakeRadar({ data }: { data: { axis: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <RadarChart data={data} outerRadius="75%">
        <PolarGrid stroke="#27272a" />
        <PolarAngleAxis dataKey="axis" tick={{ fill: "#a1a1aa", fontSize: 11 }} />
        <Radar dataKey="value" stroke={severityColor.low} fill={severityColor.low} fillOpacity={0.18} />
        <Tooltip contentStyle={tooltipStyle} />
      </RadarChart>
    </ResponsiveContainer>
  );
}