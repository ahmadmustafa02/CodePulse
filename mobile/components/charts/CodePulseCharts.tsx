import { severityColor } from "../../lib/severity";
import { View } from "react-native";
import { StackedAreaChart, StackedBarChart, LineChart, Grid } from "react-native-svg-charts";
import * as shape from "d3-shape";

export function SeverityStackBarMobile({
  data,
  height = 220,
}: {
  data: { week: string; critical: number; high: number; medium: number; low: number }[];
  height?: number;
}) {
  const colors = [severityColor.critical, severityColor.high, severityColor.medium, severityColor.low];
  return (
    <View style={{ height }}>
      <StackedBarChart
        style={{ flex: 1 }}
        keys={["critical", "high", "medium", "low"]}
        colors={colors}
        data={data}
        curve={shape.curveLinear}
        contentInset={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Grid direction={Grid.Direction.HORIZONTAL} svg={{ stroke: "#27272a" }} />
      </StackedBarChart>
    </View>
  );
}

export function PRVolumeAreaMobile({
  data,
  height = 220,
}: {
  data: { week: string; opened: number; reviewed: number }[];
  height?: number;
}) {
  const colors = ["#fafafa", severityColor.low];
  return (
    <View style={{ height }}>
      <StackedAreaChart
        style={{ flex: 1 }}
        data={data}
        keys={["opened", "reviewed"]}
        colors={colors}
        curve={shape.curveNatural}
        contentInset={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Grid direction={Grid.Direction.HORIZONTAL} svg={{ stroke: "#27272a" }} />
      </StackedAreaChart>
    </View>
  );
}

export function LatencyLineMobile({
  data,
  height = 160,
}: {
  data: { day: string; seconds: number }[];
  height?: number;
}) {
  const series = data.map((d) => d.seconds);
  return (
    <View style={{ height }}>
      <LineChart
        style={{ flex: 1 }}
        data={series}
        contentInset={{ top: 12, bottom: 12, left: 8, right: 8 }}
        svg={{ stroke: severityColor.high, strokeWidth: 2 }}
        curve={shape.curveNatural}
      >
        <Grid direction={Grid.Direction.HORIZONTAL} svg={{ stroke: "#27272a" }} />
      </LineChart>
    </View>
  );
}
