"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface MerchantChartProps {
  data: Array<{ month: string; total: number }>;
  color?: string;
}

export function VendorChart({ data, color = "var(--pastel-coral)" }: MerchantChartProps) {
  // Mobile detection
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  const formatMonth = (monthStr: string) => {
    const [year, month] = monthStr.split("-");
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-AU", {
      month: "short",
      year: isMobile ? undefined : "2-digit"
    });
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      // Derive tooltip text color from chart color
      const tooltipColor = color.includes('mint') ? 'var(--pastel-mint-dark)' : 'var(--pastel-coral-dark)';
      return (
        <div className="bg-white/95 backdrop-blur-sm border-2 rounded-xl p-3 shadow-lg"
          style={{ borderColor: 'var(--sand-7)' }}>
          <p className="font-[family-name:var(--font-nunito)] font-bold"
            style={{ color: 'var(--slate-12)' }}>
            {formatMonth(payload[0].payload.month)}
          </p>
          <p className="font-[family-name:var(--font-dm-sans)] text-sm"
            style={{ color: tooltipColor }}>
            {formatCurrency(payload[0].value)}
          </p>
        </div>
      );
    }
    return null;
  };

  // Mobile-responsive sizing
  const xAxisFontSize = isMobile ? 9 : 12;
  const yAxisFontSize = isMobile ? 10 : 12;
  const bottomMargin = isMobile ? 40 : 5;

  return (
    <div className="h-[250px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: bottomMargin }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--sand-7)"
            opacity={0.5}
          />
          <XAxis
            dataKey="month"
            tick={{ fontSize: xAxisFontSize, fontFamily: "var(--font-dm-sans)" }}
            tickFormatter={formatMonth}
            stroke="var(--slate-11)"
            angle={isMobile ? -45 : 0}
            textAnchor={isMobile ? "end" : "middle"}
            height={isMobile ? 50 : 30}
          />
          <YAxis
            tick={{ fontSize: yAxisFontSize, fontFamily: "var(--font-dm-sans)" }}
            tickFormatter={(value) => `$${(value / 100).toFixed(0)}`}
            stroke="var(--slate-11)"
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="total"
            stroke={color}
            fill={color}
            fillOpacity={0.2}
            strokeWidth={3}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
