"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import type { ProjectionYear } from "@/lib/fire-calculations";

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);

interface FireProjectionChartProps {
  data: ProjectionYear[];
  fireTargetCents: number;
}

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ProjectionYear;
  return (
    <div
      className="px-3 py-2 rounded-lg shadow-lg text-xs"
      style={{
        backgroundColor: "var(--surface-elevated)",
        border: "1px solid var(--border)",
      }}
    >
      <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
        Age {d.age} ({d.year})
      </p>
      <p style={{ color: "#f97316" }}>
        Outside Super: {formatCurrency(d.outsideSuperCents)}
      </p>
      <p style={{ color: "var(--pastel-mint-dark)" }}>
        Super: {formatCurrency(d.superCents)}
      </p>
      <p className="font-semibold mt-1" style={{ color: "var(--text-primary)" }}>
        Total: {formatCurrency(d.totalCents)}
      </p>
    </div>
  );
}

export function FireProjectionChart({
  data,
  fireTargetCents,
}: FireProjectionChartProps) {
  if (data.length < 2) {
    return (
      <div className="h-80 flex items-center justify-center">
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Not enough data to show projection
        </p>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    outsideSuper: Math.round(d.outsideSuperCents / 100),
    super: Math.round(d.superCents / 100),
    total: Math.round(d.totalCents / 100),
    target: Math.round(d.fireTargetCents / 100),
  }));

  const targetDollars = Math.round(fireTargetCents / 100);

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 5, right: 5, left: -10, bottom: 0 }}
        >
          <defs>
            <linearGradient id="fireOutsideGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f97316" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="fireSuperGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--pastel-mint)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--pastel-mint)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="age"
            tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
            tickLine={false}
            axisLine={false}
            label={{
              value: "Age",
              position: "insideBottomRight",
              offset: -5,
              style: { fontSize: 10, fill: "var(--text-tertiary)" },
            }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) =>
              v >= 1_000_000
                ? `$${(v / 1_000_000).toFixed(1)}M`
                : v >= 1_000
                  ? `$${(v / 1_000).toFixed(0)}k`
                  : `$${v}`
            }
          />
          <Tooltip content={<ChartTooltip />} />
          <ReferenceLine
            y={targetDollars}
            stroke="var(--pastel-coral)"
            strokeDasharray="6 4"
            strokeWidth={1.5}
            label={{
              value: "FIRE Target",
              position: "right",
              style: { fontSize: 10, fill: "var(--pastel-coral)" },
            }}
          />
          <Area
            type="monotone"
            dataKey="super"
            stackId="1"
            stroke="var(--pastel-mint)"
            strokeWidth={1.5}
            fill="url(#fireSuperGrad)"
          />
          <Area
            type="monotone"
            dataKey="outsideSuper"
            stackId="1"
            stroke="#f97316"
            strokeWidth={1.5}
            fill="url(#fireOutsideGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
