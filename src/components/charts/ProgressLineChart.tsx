'use client';

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';

interface DataPoint {
  date: string;
  value: number | null;
  label?: string;
}

interface ProgressLineChartProps {
  data: DataPoint[];
  color?: string;
  yAxisLabel?: string;
  height?: number;
  showGoalLine?: number;
  unit?: string;
  gradientId?: string;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function CustomTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
  unit?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-card px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-bold text-foreground">
        {payload[0]?.value?.toFixed(1)}
        {unit ? ` ${unit}` : ''}
      </p>
    </div>
  );
}

export default function ProgressLineChart({
  data,
  color = 'hsl(var(--primary))',
  yAxisLabel,
  height = 220,
  showGoalLine,
  unit,
  gradientId = 'progressGrad',
}: ProgressLineChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-muted-foreground text-sm"
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  const values = data.map((d) => d.value).filter((v): v is number => v != null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.2, 1);
  const domainMin = +(min - padding).toFixed(1);
  const domainMax = +(max + padding).toFixed(1);

  const first = values[0];
  const last = values[values.length - 1];
  const trend = last != null && first != null ? last - first : null;
  const trendUp = trend != null && trend > 0;
  const hasMeaningfulTrend = trend != null && Math.abs(trend) >= 0.05;

  const chartData = data
    .filter((d) => d.value != null)
    .map((d) => ({ date: formatDate(d.date), value: d.value, rawDate: d.date }));

  // Single data point — chart would be mostly empty, show a nudge instead
  if (chartData.length === 1) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-6 text-center">
        <p className="text-2xl font-bold">
          {last?.toFixed(1)}
          {unit ? ` ${unit}` : ''}
        </p>
        <p className="text-xs text-muted-foreground">
          Log more measurements to see your trend chart
        </p>
      </div>
    );
  }

  return (
    <div>
      {hasMeaningfulTrend && (
        <div className="flex items-center gap-3 mb-3 px-1">
          <span className="text-2xl font-bold">
            {last?.toFixed(1)}
            {unit ? ` ${unit}` : ''}
          </span>
          <span
            className={`flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
              trendUp ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
            }`}
          >
            {trendUp ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}
            {unit ? ` ${unit}` : ''}
            <span className="text-muted-foreground font-normal ml-1">since start</span>
          </span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#888', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            domain={[domainMin, domainMax]}
            tick={{ fill: '#888', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}${unit ?? ''}`}
            width={yAxisLabel ? 56 : 52}
          />
          <Tooltip content={<CustomTooltip unit={unit ?? yAxisLabel} />} />
          {showGoalLine != null && (
            <ReferenceLine
              y={showGoalLine}
              stroke={color}
              strokeDasharray="6 3"
              strokeOpacity={0.5}
              label={{ value: 'Goal', fill: 'hsl(var(--muted-foreground))', fontSize: 10 }}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#${gradientId})`}
            dot={{ fill: color, r: 3.5, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: color, stroke: 'hsl(var(--background))', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
