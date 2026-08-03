import React, { useCallback, useEffect, useMemo, useState } from "react";
import BrandLogoMark from '../components/BrandLogoMark';
import MainSidebarNav from "../components/MainSidebarNav";
import AppShellSidebar from "../components/AppShellSidebar";
import AdminHeaderProjectSwitch from "../components/AdminHeaderProjectSwitch";
import HeaderRightActions from "../components/HeaderRightActions";
import { readSessionUser } from "../services/authService";
import { RESOLVE_DISPOSITIONS, getDispositionLabel } from "../constants/resolveDispositions";

function getSelectedProjectId() {
  try {
    const raw = localStorage.getItem("selectedProject");
    if (!raw) return null;
    const id = JSON.parse(raw)?.id;
    return id != null && String(id).trim() !== "" ? String(id) : null;
  } catch {
    return null;
  }
}

function buildAuthHeaders({ json = true } = {}) {
  const token = localStorage.getItem("token");
  const headers = {};
  if (json) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const projectId = getSelectedProjectId();
  if (projectId) headers["x-project-id"] = projectId;
  return headers;
}

export default function ReportsComingSoonPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // const API_URL = "https://wabizx.techwhizzc.com/api";
  const API_URL = "https://api.waabizx.com/api";

  const user = readSessionUser();

  const userName = user?.name || user?.email || "User";
  const userInitial = String(userName || "U").charAt(0).toUpperCase();
  const headerAvatar = user?.avatar || "";
  const userRole = String(user?.role || "").toLowerCase();
  const canEditDisposition = ["admin", "manager", "super_admin"].includes(userRole);

  const loggedInUserId = user?.id ?? user?._id ?? null;

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [selectedDate, setSelectedDate] = useState(today);

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ show: false, message: "" });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState({ totalIntervenedConversations: 0 });
  const [selectedAgent, setSelectedAgent] = useState(null);

  const [dispositionLoading, setDispositionLoading] = useState(false);
  const [dispositionError, setDispositionError] = useState("");
  const [dispositionLeads, setDispositionLeads] = useState([]);
  const [dispositionTotal, setDispositionTotal] = useState(0);
  const [dispositionByType, setDispositionByType] = useState([]);
  const [editLead, setEditLead] = useState(null);
  const [editDisposition, setEditDisposition] = useState("");
  const [savingDisposition, setSavingDisposition] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("selectedAgent");
      const parsed = raw ? JSON.parse(raw) : null;
      setSelectedAgent(parsed && (parsed.id || parsed._id || parsed.email || parsed.name) ? parsed : null);
    } catch {
      setSelectedAgent(null);
    }
  }, []);

  const selectedAgentId = selectedAgent
    ? (selectedAgent.id ?? selectedAgent._id ?? null)
    : null;

  const displayedRows = rows;
  const displayedTotal = total;

  const showToast = (message) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: "" }), 3000);
  };

  const fetchDispositionReport = useCallback(async () => {
    try {
      setDispositionLoading(true);
      setDispositionError("");
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No token found");

      const qs = new URLSearchParams({ date: selectedDate });
      const res = await fetch(`${API_URL}/reports/dispositions?${qs.toString()}`, {
        method: "GET",
        headers: buildAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.message || data?.error || "Failed to fetch disposition report");
      }
      setDispositionLeads(Array.isArray(data?.leads) ? data.leads : []);
      setDispositionTotal(Number(data?.totalLeads || 0));
      setDispositionByType(Array.isArray(data?.byType) ? data.byType : []);
    } catch (e) {
      setDispositionError(e?.message || String(e));
      setDispositionLeads([]);
      setDispositionTotal(0);
      setDispositionByType([]);
    } finally {
      setDispositionLoading(false);
    }
  }, [API_URL, selectedDate]);

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true);
        setError("");
        const token = localStorage.getItem("token");
        if (!token) throw new Error("No token found");

        const qs = new URLSearchParams({ date: selectedDate });
        if (selectedAgentId != null) {
          qs.set("agentId", String(selectedAgentId));
          if (loggedInUserId != null) qs.set("adminId", String(loggedInUserId));
        }

        const res = await fetch(`${API_URL}/reports/intervened/customers?${qs.toString()}`, {
          method: "GET",
          headers: buildAuthHeaders(),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.message || data?.error || "Failed to fetch report");
        }

        setRows(Array.isArray(data?.customers) ? data.customers : []);
        setTotal({
          totalIntervenedConversations: Number(data?.totalIntervenedConversations || 0),
        });
      } catch (e) {
        setError(e?.message || String(e));
        setRows([]);
        setTotal({ totalIntervenedConversations: 0 });
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [API_URL, selectedDate, selectedAgentId, loggedInUserId]);

  useEffect(() => {
    fetchDispositionReport();
  }, [fetchDispositionReport]);

  const handleExport = async () => {
    try {
      if (!displayedRows || displayedRows.length === 0) {
        showToast("No data available for the given date.");
        return;
      }

      setExporting(true);
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No token found");

      const qs = new URLSearchParams({ date: selectedDate });
      if (selectedAgentId != null) {
        qs.set("agentId", String(selectedAgentId));
        if (loggedInUserId != null) qs.set("adminId", String(loggedInUserId));
      }

      const res = await fetch(`${API_URL}/reports/intervened/customers/export?${qs.toString()}`, {
        method: "GET",
        headers: buildAuthHeaders({ json: false }),
      });

      if (!res.ok) {
        const maybeJson = await res.json().catch(() => null);
        throw new Error(maybeJson?.message || maybeJson?.error || "Failed to export CSV");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `intervened-report-${selectedDate}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setExporting(false);
    }
  };

  const openEditDisposition = (lead) => {
    setEditLead(lead);
    setEditDisposition(lead?.disposition || "");
  };

  const saveDispositionEdit = async () => {
    if (!editLead?.conversationId || !editDisposition || savingDisposition) return;
    setSavingDisposition(true);
    try {
      const res = await fetch(`${API_URL}/reports/dispositions/${editLead.conversationId}`, {
        method: "PUT",
        headers: buildAuthHeaders(),
        body: JSON.stringify({ disposition: editDisposition }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.message || data?.error || "Failed to update disposition");
      }
      showToast("Disposition updated");
      setEditLead(null);
      setEditDisposition("");
      await fetchDispositionReport();
    } catch (e) {
      showToast(e?.message || "Failed to update disposition");
    } finally {
      setSavingDisposition(false);
    }
  };

  const formatDispositionTime = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {toast.show && (
        <div className="fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-lg border border-gray-200 bg-white/95 backdrop-blur-md text-sm font-semibold text-gray-800">
          {toast.message}
        </div>
      )}
      {/* Top Navigation Bar */}
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-4 min-w-0">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-2.5 rounded-xl hover:bg-gray-100/80 active:scale-95 transition lg:hidden"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-3 min-w-0"><BrandLogoMark size="md" />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-sky-700 tracking-tight truncate">Reports</h2>
              <p className="text-xs text-gray-500 truncate">Intervened agents & lead dispositions</p>
            </div>
          </div>
          <AdminHeaderProjectSwitch />
        </div>

        <HeaderRightActions>
          <div className="hidden sm:flex items-center gap-2 text-sm text-gray-600">
            <span className="font-semibold text-gray-700">{userName}</span>
          </div>
          <div
            className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/35 ring-2 ring-white overflow-hidden"
            title={userName}
          >
            {headerAvatar ? (
              <img src={headerAvatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-semibold text-sm">{userInitial}</span>
            )}
          </div>
        </HeaderRightActions>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Collapsible Sidebar */}
        <AppShellSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
          <MainSidebarNav onNavigate={() => setSidebarOpen(false)} />
        </AppShellSidebar>

        {/* Main Content */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
          <div className="p-4 md:p-8 lg:p-10 max-w-[1600px] mx-auto">
            {/* Simple header + date picker */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-slate-900">Intervened agent report</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Pick a date to see intervened conversations and lead disposition types.
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-sky-700">Date</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-white/90 border border-gray-200 rounded-xl px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400/40 focus:border-sky-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting}
                  className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {exporting ? "Exporting..." : "Export"}
                </button>
              </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 mb-7 md:mb-9">
              <div className="bg-white rounded-2xl border border-gray-100/80 p-5 md:p-6 shadow-sm shadow-gray-200/40 hover:shadow-xl hover:shadow-sky-400/10 hover:border-sky-100 overflow-hidden relative">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 via-emerald-500 to-teal-500 opacity-90" aria-hidden />
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-500 tracking-tight">Intervened conversations</div>
                    <p className="text-3xl md:text-4xl font-bold text-gray-900 mb-1 tabular-nums tracking-tight">
                      {loading ? "..." : displayedTotal.totalIntervenedConversations.toLocaleString()}
                    </p>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a10.6 10.6 0 01-4.839-1.145L3 20l1.145-3.161A7.963 7.963 0 012 12c0-4.418 4.03-8 9-8s10 3.582 10 8z" />
                    </svg>
                  </div>
                </div>
                <p className="text-xs font-medium text-emerald-600">Total for selected date</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100/80 p-5 md:p-6 shadow-sm shadow-gray-200/40 hover:shadow-xl hover:shadow-sky-400/10 hover:border-sky-100 overflow-hidden relative">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-400 via-sky-500 to-blue-500 opacity-90" aria-hidden />
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-500 tracking-tight">Customers</div>
                    <p className="text-3xl md:text-4xl font-bold text-gray-900 mb-1 tabular-nums tracking-tight">
                      {loading ? "..." : (displayedRows?.length || 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center shadow-lg shadow-sky-500/30">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h-5a4 4 0 010-8h5v8zM7 20H4a4 4 0 010-8h3v8zM14 4v6a4 4 0 01-4 4H8a4 4 0 01-4-4V4h10z" />
                    </svg>
                  </div>
                </div>
                <p className="text-xs font-medium text-sky-600">Customers with intervened activity</p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100/80 p-5 md:p-6 shadow-sm shadow-gray-200/40 hover:shadow-xl hover:shadow-violet-400/10 hover:border-violet-100 overflow-hidden relative">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-400 via-fuchsia-500 to-purple-600 opacity-90" aria-hidden />
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-500 tracking-tight">Lead disposition types</div>
                    <p className="text-3xl md:text-4xl font-bold text-gray-900 mb-1 tabular-nums tracking-tight">
                      {dispositionLoading ? "..." : dispositionTotal.toLocaleString()}
                    </p>
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shadow-lg shadow-violet-500/30">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
                <p className="text-xs font-medium text-violet-600">Resolved leads with disposition</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>
            )}

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-7">
              <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-sky-50/30">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-gray-900">Customers</span>
                  <span className="text-xs text-gray-500">Date: {selectedDate}</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-r from-gray-50 to-sky-50/40 text-gray-600">
                    <tr>
                      <th className="text-left px-5 py-3 font-semibold">Customer Name</th>
                      <th className="text-left px-5 py-3 font-semibold">Phone</th>
                      <th className="text-left px-5 py-3 font-semibold">Intervened conversations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan="3" className="px-5 py-10">
                          <div className="flex items-center justify-center gap-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-sky-200 border-t-sky-600" />
                            <span className="text-sm font-semibold text-gray-600">Loading report...</span>
                          </div>
                        </td>
                      </tr>
                    ) : displayedRows.length === 0 ? (
                      <tr>
                        <td colSpan="3" className="px-5 py-10">
                          <div className="text-center">
                            <div className="mx-auto w-12 h-12 rounded-2xl bg-sky-50 ring-1 ring-sky-100 flex items-center justify-center">
                              <svg className="w-6 h-6 text-sky-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 014 0M9 5h6" />
                              </svg>
                            </div>
                            <p className="mt-3 text-sm font-semibold text-gray-700">No data for this date</p>
                            <p className="mt-1 text-xs text-gray-500">Try selecting another day.</p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      displayedRows.map((r) => (
                        <tr
                          key={`${r.phone}-${r.customerName}`}
                          className="border-t border-gray-100 hover:bg-sky-50/50 transition-colors"
                        >
                          <td className="px-5 py-3 font-semibold text-gray-900">{r.customerName}</td>
                          <td className="px-5 py-3 text-gray-700 tabular-nums">{r.phone}</td>
                          <td className="px-5 py-3 text-gray-700 tabular-nums">{r.intervenedConversationsCount.toLocaleString()}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Lead disposition types */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-violet-50/80 to-fuchsia-50/40">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <span className="text-sm font-bold text-gray-900">Lead disposition types</span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Resolved leads with disposition type and lead name
                    </p>
                  </div>
                  <span className="text-xs text-gray-500">Date: {selectedDate}</span>
                </div>
              </div>

              {dispositionByType.some((t) => Number(t.count) > 0) ? (
                <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap gap-2">
                  {dispositionByType
                    .filter((t) => Number(t.count) > 0)
                    .map((t) => (
                      <span
                        key={t.disposition}
                        className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800 ring-1 ring-violet-100"
                      >
                        {t.label}
                        <span className="tabular-nums text-violet-600">{t.count}</span>
                      </span>
                    ))}
                </div>
              ) : null}

              {dispositionError ? (
                <div className="m-4 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
                  {dispositionError}
                </div>
              ) : null}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gradient-to-r from-gray-50 to-violet-50/40 text-gray-600">
                    <tr>
                      <th className="text-left px-5 py-3 font-semibold">Lead name</th>
                      <th className="text-left px-5 py-3 font-semibold">Phone</th>
                      <th className="text-left px-5 py-3 font-semibold">Disposition type</th>
                      <th className="text-left px-5 py-3 font-semibold">Agent</th>
                      <th className="text-left px-5 py-3 font-semibold">Resolved at</th>
                      {canEditDisposition ? (
                        <th className="text-right px-5 py-3 font-semibold">Action</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {dispositionLoading ? (
                      <tr>
                        <td colSpan={canEditDisposition ? 6 : 5} className="px-5 py-10">
                          <div className="flex items-center justify-center gap-3">
                            <div className="animate-spin rounded-full h-8 w-8 border-2 border-violet-200 border-t-violet-600" />
                            <span className="text-sm font-semibold text-gray-600">Loading dispositions...</span>
                          </div>
                        </td>
                      </tr>
                    ) : dispositionLeads.length === 0 ? (
                      <tr>
                        <td colSpan={canEditDisposition ? 6 : 5} className="px-5 py-10">
                          <div className="text-center">
                            <p className="text-sm font-semibold text-gray-700">No disposition leads for this date</p>
                            <p className="mt-1 text-xs text-gray-500">
                              Resolve an intervened chat with a disposition to see it here.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      dispositionLeads.map((lead) => (
                        <tr
                          key={lead.conversationId}
                          className="border-t border-gray-100 hover:bg-violet-50/40 transition-colors"
                        >
                          <td className="px-5 py-3 font-semibold text-gray-900">{lead.leadName}</td>
                          <td className="px-5 py-3 text-gray-700 tabular-nums">{lead.phone}</td>
                          <td className="px-5 py-3">
                            <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800 ring-1 ring-violet-100">
                              {lead.dispositionLabel || getDispositionLabel(lead.disposition)}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-gray-700">{lead.agentName || "—"}</td>
                          <td className="px-5 py-3 text-gray-600 text-xs whitespace-nowrap">
                            {formatDispositionTime(lead.dispositionAt)}
                          </td>
                          {canEditDisposition ? (
                            <td className="px-5 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => openEditDisposition(lead)}
                                className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 transition"
                              >
                                Edit
                              </button>
                            </td>
                          ) : null}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      </div>

      {editLead ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingDisposition) {
              setEditLead(null);
            }
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-2xl">
            <div className="border-b border-gray-100 px-5 py-4">
              <h3 className="text-lg font-bold text-gray-900">Edit disposition</h3>
              <p className="mt-1 text-sm text-gray-500 truncate">
                {editLead.leadName} · {editLead.phone}
              </p>
            </div>
            <div className="max-h-[min(50vh,360px)] space-y-2 overflow-y-auto px-5 py-4">
              {RESOLVE_DISPOSITIONS.map((opt) => {
                const selected = editDisposition === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={savingDisposition}
                    onClick={() => setEditDisposition(opt.value)}
                    className={`flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                      selected
                        ? "border-violet-500 bg-violet-50 ring-1 ring-violet-200"
                        : "border-gray-200 bg-white hover:border-violet-300 hover:bg-violet-50/40"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                        selected ? "border-violet-600 bg-violet-600" : "border-gray-300"
                      }`}
                    >
                      {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{opt.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-3.5">
              <button
                type="button"
                disabled={savingDisposition}
                onClick={() => setEditLead(null)}
                className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!editDisposition || savingDisposition}
                onClick={saveDispositionEdit}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-45"
              >
                {savingDisposition ? "Saving…" : "Save disposition"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
