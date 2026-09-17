import React, { useEffect, useMemo, useState } from "react";
import axios from "../api/axios";
import { getDashboardStats } from "../services/dashboardService";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function ManageAnalyticsPage() {
  const [days, setDays] = useState(30); // matches backend valid values: 1, 7, 30, 90
  const [dashboardChartData, setDashboardChartData] = useState([]);
  const [agentActivityData, setAgentActivityData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState("all"); // 'all' | active | requesting | intervened | closed
  const [error, setError] = useState("");

  const loadAll = async () => {
    try {
      setError("");
      setLoading(true);

      const dashboard = await getDashboardStats(days);
      setDashboardChartData(dashboard?.chartData || []);

      const res = await axios.get("/dashboard/agent-activity");
      const data = res?.data?.data || [];
      setAgentActivityData(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || "Failed to load analytics");
      setDashboardChartData([]);
      setAgentActivityData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      if (!mounted) return;
      await loadAll();
    };
    run();

    // Auto refresh so charts are dynamically updated (not static).
    const interval = setInterval(() => {
      if (!mounted) return;
      loadAll();
    }, 10000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const agentTotals = useMemo(() => {
    const totals = { active: 0, requesting: 0, intervened: 0, closed: 0 };
    for (const row of agentActivityData || []) {
      totals.active += Number(row.active || 0);
      totals.requesting += Number(row.requesting || 0);
      totals.intervened += Number(row.intervened || 0);
      totals.closed += Number(row.closed || 0);
    }
    return totals;
  }, [agentActivityData]);

  const showAgentArea = (key) => agentFilter === "all" || agentFilter === key;

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mb-5 motion-enter">
        <h2 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Analytics</h2>
        <p className="text-sm text-gray-600 mt-1">Charts update automatically with live data.</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200/90 text-sm text-red-700 rounded-xl ring-1 ring-red-100/50 motion-enter">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:gap-6">
        {/* Chart 1 */}
        <div className="motion-enter motion-delay-1 motion-hover-lift bg-white/95 backdrop-blur-sm border border-gray-100/90 rounded-2xl p-4 md:p-6 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 transition-all duration-300 hover:shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm md:text-base font-bold text-gray-900">Chats sent over time</h3>
              <div className="text-xs text-gray-600 mt-1">
                Sent / Delivered / Read
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-medium text-gray-500">Range</span>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="text-xs bg-gray-50/90 border-2 border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-400/40 focus:border-sky-400 transition-all"
              >
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>
          </div>

          <div className="h-[240px] w-full">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center text-sm text-gray-600 motion-enter">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600 mb-2" />
                Loading...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashboardChartData || []} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />

                  <Area
                    type="monotone"
                    dataKey="messages"
                    name="Messages Sent"
                    stroke="#0EA5E9"
                    fill="#0EA5E9"
                    fillOpacity={0.18}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="delivered"
                    name="Messages Delivered"
                    stroke="#14B8A6"
                    fill="#14B8A6"
                    fillOpacity={0.18}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="read"
                    name="Messages Read"
                    stroke="#8B5CF6"
                    fill="#8B5CF6"
                    fillOpacity={0.18}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2 */}
        <div className="motion-enter motion-delay-2 motion-hover-lift bg-white/95 backdrop-blur-sm border border-gray-100/90 rounded-2xl p-4 md:p-6 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 transition-all duration-300 hover:shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <div>
              <h3 className="text-sm md:text-base font-bold text-gray-900">Login Admin Activity [year]</h3>
              <div className="text-xs text-gray-600 mt-1">
                Login admin — Active / Requesting / Intervened / Closed
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-medium text-gray-500">Filter</span>
              <select
                value={agentFilter}
                onChange={(e) => setAgentFilter(e.target.value)}
                className="text-xs bg-gray-50/90 border-2 border-gray-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-sky-400/40 focus:border-sky-400 transition-all"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="requesting">Requesting</option>
                <option value="intervened">Intervened</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-xs motion-stagger-children">
            <div className="bg-gradient-to-br from-sky-50/90 to-white rounded-xl px-3 py-2.5 border border-sky-100/70 shadow-sm ring-1 ring-sky-50/80">
              <div className="text-gray-500 font-medium">Total Active</div>
              <div className="font-bold text-gray-900 text-sm mt-0.5">{agentTotals.active}</div>
            </div>
            <div className="bg-gradient-to-br from-amber-50/80 to-white rounded-xl px-3 py-2.5 border border-amber-100/70 shadow-sm">
              <div className="text-gray-500 font-medium">Total Requesting</div>
              <div className="font-bold text-gray-900 text-sm mt-0.5">{agentTotals.requesting}</div>
            </div>
            <div className="bg-gradient-to-br from-orange-50/80 to-white rounded-xl px-3 py-2.5 border border-orange-100/70 shadow-sm">
              <div className="text-gray-500 font-medium">Total Intervened</div>
              <div className="font-bold text-gray-900 text-sm mt-0.5">{agentTotals.intervened}</div>
            </div>
            <div className="bg-gradient-to-br from-red-50/70 to-white rounded-xl px-3 py-2.5 border border-red-100/70 shadow-sm">
              <div className="text-gray-500 font-medium">Total Closed</div>
              <div className="font-bold text-gray-900 text-sm mt-0.5">{agentTotals.closed}</div>
            </div>
          </div>

          <div className="h-[240px] w-full">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center text-sm text-gray-600 motion-enter">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600 mb-2" />
                Loading...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={agentActivityData || []} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />

                  {showAgentArea("active") && (
                    <Area
                      type="monotone"
                      dataKey="active"
                      name="Active"
                      stroke="#22C55E"
                      fill="#22C55E"
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                  )}
                  {showAgentArea("requesting") && (
                    <Area
                      type="monotone"
                      dataKey="requesting"
                      name="Requesting"
                      stroke="#F59E0B"
                      fill="#F59E0B"
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                  )}
                  {showAgentArea("intervened") && (
                    <Area
                      type="monotone"
                      dataKey="intervened"
                      name="Intervened"
                      stroke="#F97316"
                      fill="#F97316"
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                  )}
                  {showAgentArea("closed") && (
                    <Area
                      type="monotone"
                      dataKey="closed"
                      name="Closed"
                      stroke="#EF4444"
                      fill="#EF4444"
                      fillOpacity={0.18}
                      strokeWidth={2}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

