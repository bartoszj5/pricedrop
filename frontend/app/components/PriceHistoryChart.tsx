"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ProductPriceHistoryRead } from "../types";

const STORE_COLORS = [
  "#ad4d2e",
  "#1c7b62",
  "#2f5d7c",
  "#c9912b",
  "#7a4a8f",
  "#d26c4b",
  "#355f48",
  "#516987",
];

interface PriceHistoryChartProps {
  history: ProductPriceHistoryRead[];
}

export default function PriceHistoryChart({ history }: PriceHistoryChartProps) {
  if (history.length === 0) {
    return (
      <p className="text-text-muted text-sm py-4">
        Brak historii zmian cen dla tego produktu.
      </p>
    );
  }

  // Group by recorded_at date, with one key per store
  const stores = [...new Set(history.map((h) => h.store_name))];
  const storeColorMap: Record<string, string> = {};
  stores.forEach((s, i) => {
    storeColorMap[s] = STORE_COLORS[i % STORE_COLORS.length];
  });

  // Build chart data: for each history entry, create a data point
  // We need chronological order
  const sorted = [...history].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );

  const dataMap = new Map<string, Record<string, number | string>>();
  for (const entry of sorted) {
    const date = new Date(entry.recorded_at).toLocaleDateString("pl-PL", {
      day: "2-digit",
      month: "2-digit",
    });
    if (!dataMap.has(date)) {
      dataMap.set(date, { date });
    }
    const point = dataMap.get(date)!;
    point[entry.store_name] = Number(entry.new_price);
  }

  const chartData = Array.from(dataMap.values());

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2D3148" />
        <XAxis
          dataKey="date"
          stroke="#7a796f"
          tick={{ fontSize: 12 }}
        />
        <YAxis
          stroke="#7a796f"
          tick={{ fontSize: 12 }}
          tickFormatter={(v: number) => `${v} zł`}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#fffaf2",
            border: "1px solid #dacdb7",
            borderRadius: "16px",
            fontSize: "13px",
          }}
          labelStyle={{ color: "#556072" }}
          formatter={(value) => [`${Number(value).toFixed(2)} zł`]}
        />
        <Legend wrapperStyle={{ fontSize: "13px" }} />
        {stores.map((store) => (
          <Line
            key={store}
            type="monotone"
            dataKey={store}
            stroke={storeColorMap[store]}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
