"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyticsSummary } from "@xeno/shared-types";

const statusColors = ["#22d3ee", "#4ade80", "#38bdf8", "#a78bfa", "#ef4444", "#94a3b8"];

export function DashboardCharts({ analytics }: { analytics: AnalyticsSummary }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="panel p-5">
        <div className="panel-title">Engagement funnel</div>
        <div className="mt-6 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={analytics.funnel}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="label" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: "#08101b", border: "1px solid rgba(255,255,255,0.08)" }} />
              <Bar dataKey="value" radius={[12, 12, 0, 0]} fill="#22d3ee" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="panel p-5">
        <div className="panel-title">Channel mix</div>
        <div className="mt-6 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={Object.entries(analytics.byChannel).map(([name, value]) => ({ name, value }))} dataKey="value" nameKey="name" innerRadius={72} outerRadius={120} paddingAngle={2}>
                {Object.entries(analytics.byChannel).map((entry, index) => (
                  <Cell key={entry[0]} fill={statusColors[index % statusColors.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "#08101b", border: "1px solid rgba(34,211,238,0.28)", color: "#67e8f9" }}
                itemStyle={{ color: "#67e8f9" }}
                labelStyle={{ color: "#67e8f9" }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="panel p-5 xl:col-span-2">
        <div className="panel-title">Status time series</div>
        <div className="mt-6 h-96">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={analytics.timeSeries}>
              <defs>
                <linearGradient id="sentFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
              <XAxis dataKey="date" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip contentStyle={{ background: "#08101b", border: "1px solid rgba(255,255,255,0.08)" }} />
              <Area type="monotone" dataKey="sent" stroke="#22d3ee" fill="url(#sentFill)" />
              <Line type="monotone" dataKey="delivered" stroke="#4ade80" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="opened" stroke="#38bdf8" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="clicked" stroke="#facc15" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
