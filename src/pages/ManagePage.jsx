import React, { useEffect, useMemo, useState } from "react";
import BrandLogoMark from '../components/BrandLogoMark';
import { Link, useLocation, useNavigate } from "react-router-dom";
import axios from "../api/axios";
import TemplateMessagesPage from "./TemplateMessagesPage";
import ManageAnalyticsPage from "./ManageAnalyticsPage";
import CannedMessagesPage from "./CannedMessagesPage";
import OptinManagementPage from "./OptinManagementPage";
import TagsPage from "./TagsPage";
import UserAttributesPage from "./UserAttributesPage";
import MainSidebarNav from "../components/MainSidebarNav";
import AppShellSidebar from "../components/AppShellSidebar";
import AdminHeaderProjectSwitch from "../components/AdminHeaderProjectSwitch";
import HeaderRightActions from "../components/HeaderRightActions";
import PasswordInput from "../components/PasswordInput";
import { readSessionUser } from "../services/authService";
import {
  getEnabledManagerPermissionLabels,
  MANAGER_MODULE_OPTIONS,
  normalizeManagerPermissions,
} from "../utils/managerAccess";
import PlanLimitModal from "../components/PlanLimitModal";
import { assertCanAddResource, extractPlanLimitError } from "../services/planLimitService";

function agentAvatarGradient(id) {
  const palettes = [
    "from-sky-500 via-sky-600 to-blue-900",
    "from-teal-500 via-cyan-600 to-sky-900",
    "from-indigo-500 via-violet-600 to-blue-900",
    "from-blue-500 via-sky-500 to-cyan-800",
    "from-sky-600 via-blue-700 to-indigo-900",
  ];
  let h = 0;
  const s = String(id ?? "");
  for (let i = 0; i < s.length; i += 1) h += s.charCodeAt(i) * (i + 1);
  return palettes[Math.abs(h) % palettes.length];
}

const emptyManagerPermissions = () => normalizeManagerPermissions();

const buildAgentFormState = (agent = null) => ({
  name: agent?.name || "",
  email: agent?.email || "",
  role: String(agent?.role || "").toLowerCase(),
  permissions: normalizeManagerPermissions(agent?.permissions),
});

const formatRoleLabel = (role) => {
  const normalized = String(role || "agent").toLowerCase();
  if (normalized === "admin") return "Admin";
  if (normalized === "manager") return "Manager";
  return "Agent";
};

function ManagePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedProject = useMemo(() => {
    const fromState = location?.state?.project;
    if (fromState) return fromState;
    try {
      const raw = localStorage.getItem("selectedProject");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }, [location?.state?.project]);

  const currentRole = (() => {
    try {
      const storedRole = String(localStorage.getItem("role") || "").toLowerCase();
      if (storedRole) return storedRole;
      const raw = localStorage.getItem("user");
      const u = raw ? JSON.parse(raw) : null;
      return String(u?.role || "").toLowerCase();
    } catch (e) {
      return "";
    }
  })();

  const [activeSub, setActiveSub] = useState(currentRole === "agent" ? "canned" : "agents");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");

  const [agents, setAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [agentsError, setAgentsError] = useState("");
  const [roleUpdatingId, setRoleUpdatingId] = useState(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [roleToast, setRoleToast] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "",
    permissions: emptyManagerPermissions(),
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editAgent, setEditAgent] = useState(null);
  const [editForm, setEditForm] = useState(buildAgentFormState());
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [planLimitModal, setPlanLimitModal] = useState(null);

  useEffect(() => {
    // Agents should only be able to manage canned messages.
    if (currentRole === "agent" && activeSub !== "canned") setActiveSub("canned");
  }, [currentRole, activeSub]);

  const canManageRoles = currentRole === "admin";

  useEffect(() => {
    if (!createOpen && !editOpen) return undefined;

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [createOpen, editOpen]);

  const fetchAgents = async () => {
    setAgentsError("");
    setLoadingAgents(true);
    try {
      const res = await axios.get("/auth/agents");
      setAgents(res.data?.agents || []);
    } catch (e) {
      setAgentsError(e?.response?.data?.message || e?.message || "Failed to load agents");
    } finally {
      setLoadingAgents(false);
    }
  };

  useEffect(() => {
    if (activeSub === "agents") fetchAgents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSub]);

  const toggleCreatePermission = (key) => {
    setCreateForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions?.[key],
      },
    }));
  };

  const toggleEditPermission = (key) => {
    setEditForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [key]: !prev.permissions?.[key],
      },
    }));
  };

  const handleAccessLevelChange = async (agent, nextRoleRaw) => {
    const agentId = agent?.id;
    const nextRole = String(nextRoleRaw || "").toLowerCase().trim();
    const currentRole = String(agent?.role || "agent").toLowerCase().trim();

    if (!agentId) return;
    if (!["agent", "manager", "admin"].includes(nextRole)) return;
    if (nextRole === currentRole) return;
    if (!canManageRoles) return;

    if (nextRole === "manager") {
      setEditAgent(agent);
      setEditForm({
        ...buildAgentFormState(agent),
        role: "manager",
      });
      setEditError("");
      setEditOpen(true);
      return;
    }

    try {
      setRoleUpdatingId(agentId);
      setRoleToast("");
      setAgentsError("");

      await axios.put(`/auth/agents/${agentId}`, { role: nextRole, permissions: null });
      await fetchAgents();

      setRoleToast(`Successfully changed access level of ${agent?.name || "member"}.`);
      setTimeout(() => setRoleToast(""), 3500);
    } catch (e) {
      setAgentsError(e?.response?.data?.message || e?.message || "Failed to change access level");
    } finally {
      setRoleUpdatingId(null);
    }
  };

  const filteredAgents = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return agents;
    return agents.filter((a) => {
      const name = String(a?.name || "").toLowerCase();
      const email = String(a?.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [agents, search]);

  const onCreateAgent = async () => {
    setCreateError("");
    const name = String(createForm.name || "").trim();
    const email = String(createForm.email || "").trim();
    const password = String(createForm.password || "").trim();
    const role = String(createForm.role || "").trim().toLowerCase();
    if (!name || !email || !password || !role) {
      setCreateError("Name, email, password and role are required.");
      return;
    }
    if (!["agent", "manager", "admin"].includes(role)) {
      setCreateError("Role must be agent, manager or admin.");
      return;
    }

    setCreating(true);
    try {
      const precheck = await assertCanAddResource("agents");
      if (!precheck.allowed) {
        setPlanLimitModal(precheck);
        setCreateError("");
        return;
      }

      const projectId =
        selectedProject?.id != null && String(selectedProject.id).trim() !== ""
          ? Number(selectedProject.id)
          : null;

      await axios.post("/auth/register", {
        name,
        email,
        password,
        role,
        projectId,
        permissions: role === "manager" ? normalizeManagerPermissions(createForm.permissions) : null,
      });
      setCreateOpen(false);
      setCreateForm({ name: "", email: "", password: "", role: "", permissions: emptyManagerPermissions() });
      await fetchAgents();
    } catch (e) {
      const limitPayload = extractPlanLimitError(e);
      if (limitPayload) {
        setPlanLimitModal(limitPayload);
        setCreateError("");
      } else {
        setCreateError(e?.response?.data?.message || e?.message || "Failed to create agent");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleStatusChange = async (agent, nextStatusRaw) => {
    const agentId = agent?.id;
    const nextStatus = String(nextStatusRaw || "").toLowerCase().trim();
    const currentStatus = String(agent?.status || "active").toLowerCase().trim();
    if (!agentId) return;
    if (!["active", "inactive"].includes(nextStatus)) return;
    if (nextStatus === currentStatus) return;

    try {
      setStatusUpdatingId(agentId);
      setRoleToast("");
      setAgentsError("");
      await axios.put(`/auth/agents/${agentId}`, { status: nextStatus });
      await fetchAgents();
      setRoleToast(`Status updated for ${agent?.name || "agent"}.`);
      setTimeout(() => setRoleToast(""), 3500);
    } catch (e) {
      setAgentsError(e?.response?.data?.message || e?.message || "Failed to update status");
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleDeleteAgent = async (agent) => {
    const agentId = agent?.id;
    if (!agentId) return;
    const ok = window.confirm(`Delete ${agent?.name || "this agent"}?`);
    if (!ok) return;

    try {
      setDeletingId(agentId);
      setAgentsError("");
      await axios.delete(`/auth/agents/${agentId}`);
      await fetchAgents();
      setRoleToast(`Deleted ${agent?.name || "agent"} successfully.`);
      setTimeout(() => setRoleToast(""), 3500);
    } catch (e) {
      setAgentsError(e?.response?.data?.message || e?.message || "Failed to delete agent");
    } finally {
      setDeletingId(null);
    }
  };

  const manageMenu = [
    { id: "template", label: "Template Message" },
    { id: "canned", label: "Canned Message" },
    { id: "optin", label: "Opt-in Management" },
    { id: "tags", label: "Tags" },
    { id: "userAttributes", label: "User attributes" },
    { id: "agents", label: "Agents" },
    { id: "analytics", label: "Analytics" },
  ].filter((item) => {
    if (currentRole === "agent") return item.id === "canned";
    return true;
  });

  const user = (() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  })();
  const userName = user?.name || "User";
  const userInitial = (userName || "U").charAt(0).toUpperCase();
  const headerAvatar = user?.avatar || readSessionUser()?.avatar || "";

  const renderPermissionSelector = (permissions, onToggle, disabled = false) => (
    <div className="rounded-xl border border-sky-100/90 bg-sky-50/40 p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold text-gray-900">Manager Permissions</p>
        <p className="mt-1 text-xs text-gray-600">Choose the sections this manager can access.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {MANAGER_MODULE_OPTIONS.map((option) => {
          const checked = Boolean(permissions?.[option.key]);
          return (
            <label
              key={option.key}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition-all ${
                checked
                  ? "border-sky-300 bg-white text-sky-900 shadow-sm"
                  : "border-gray-200 bg-white/80 text-gray-700"
              } ${disabled ? "opacity-70" : "cursor-pointer hover:border-sky-200"}`}
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                checked={checked}
                onChange={() => onToggle(option.key)}
                disabled={disabled}
              />
              <span className="font-medium">{option.label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Top header - same style as Dashboard */}
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2.5 rounded-xl hover:bg-gray-100/80 active:scale-95 transition lg:hidden shrink-0"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link to="/dashboard" className="flex items-center gap-3 transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] shrink-0"><BrandLogoMark size="md" />
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent hidden sm:block">
              Waabizx
            </h1>
          </Link>
          <span className="text-gray-300 hidden sm:block shrink-0">|</span>
          <h2 className="text-base sm:text-lg font-semibold text-sky-700 tracking-tight truncate">Manage</h2>
          <AdminHeaderProjectSwitch />
        </div>
        <HeaderRightActions>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/35 hover:shadow-lg hover:ring-2 ring-sky-300/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none overflow-hidden"
          >
            {headerAvatar ? (
              <img src={headerAvatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-semibold text-sm">{userInitial}</span>
            )}
          </button>
        </HeaderRightActions>
      </header>

      <div className="flex flex-1 min-h-0">
      {/* Dashboard-style compact left sidebar */}
      <AppShellSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
        <MainSidebarNav onNavigate={() => setSidebarOpen(false)} />
      </AppShellSidebar>

      {/* Page content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <div className="flex flex-1 min-h-0 min-w-0 flex-col lg:flex-row">
          {/* Left manage menu */}
          <aside className="w-full lg:w-64 shrink-0 border-b lg:border-b-0 lg:border-r border-gray-200/80 bg-white/95 backdrop-blur-sm flex flex-col min-h-0 lg:overflow-y-auto shadow-sm shadow-gray-200/20 z-[1]">
            <div className="px-4 pt-3 pb-2 lg:pt-4 lg:pb-3 border-b border-gray-100/90 bg-gradient-to-r from-white to-sky-50/30 hidden lg:block">
              <h1 className="text-lg font-bold text-gray-900 tracking-tight">Manage</h1>
            </div>
            <nav className="p-2 lg:p-3 overflow-x-auto lg:overflow-visible">
              <div className="manage-menu-stagger flex flex-row lg:flex-col gap-2 lg:gap-1 min-w-max lg:min-w-0">
                {manageMenu.map((item) => {
                  const isActive = activeSub === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActiveSub(item.id)}
                      className={`shrink-0 lg:w-full text-left px-3 py-2 rounded-xl text-xs whitespace-nowrap transition-all duration-300 ease-out active:scale-[0.98] lg:hover:translate-x-1 hover:shadow-sm ${
                        isActive ? "bg-sky-50 text-sky-800 font-semibold shadow-sm ring-1 ring-sky-100/80" : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </nav>
          </aside>

          {/* Right content */}
          <main className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
            <div className="pointer-events-none absolute inset-0 overflow-hidden z-0" aria-hidden>
              <div className="absolute -top-24 -right-16 w-[18rem] h-[18rem] bg-sky-400/25 motion-page-blob" />
              <div className="absolute top-1/2 -left-20 w-[16rem] h-[16rem] bg-blue-400/20 motion-page-blob motion-page-blob--b" />
            </div>
            <div className="relative z-[1] min-h-full">
            {activeSub === "template" ? (
              <TemplateMessagesPage />
            ) : activeSub === "optin" ? (
              <OptinManagementPage />
            ) : activeSub === "analytics" ? (
              <ManageAnalyticsPage />
            ) : activeSub === "canned" ? (
              <CannedMessagesPage />
            ) : activeSub === "tags" ? (
              <div className="p-6 md:p-8 motion-enter">
                <TagsPage embedded />
              </div>
            ) : activeSub === "userAttributes" ? (
              <div className="p-6 md:p-8 motion-enter">
                <UserAttributesPage embedded />
              </div>
            ) : activeSub !== "agents" ? (
              <div className="p-6 md:p-8 motion-enter">
                <div className="motion-hover-lift bg-white/95 backdrop-blur-sm border border-gray-100/90 rounded-2xl p-8 shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 max-w-lg">
                  <h2 className="text-lg font-bold text-gray-900 mb-2 tracking-tight">Coming soon</h2>
                  <p className="text-gray-600 text-sm leading-relaxed">This section will be available next.</p>
                </div>
              </div>
            ) : (
              <div className="p-6 md:p-8">
                <div className="motion-enter motion-delay-1 motion-hover-lift bg-white/95 backdrop-blur-sm border border-gray-100/90 rounded-2xl p-6 md:p-7 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 hover:shadow-xl hover:border-sky-100/60 transition-all duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-bold text-gray-900 tracking-tight">Agents</h2>
                      <p className="text-sm text-gray-600 mt-1">You can add members with varying access level to manage your business.</p>
                    </div>
                    {canManageRoles && (
                      <button
                        type="button"
                        onClick={async () => {
                          setCreateError("");
                          try {
                            const precheck = await assertCanAddResource('agents');
                            if (!precheck.allowed) {
                              setPlanLimitModal(precheck);
                              return;
                            }
                          } catch (_) {
                            /* open modal; backend enforces limits on submit */
                          }
                          setCreateForm({ name: "", email: "", password: "", role: "", permissions: emptyManagerPermissions() });
                          setCreateOpen(true);
                        }}
                        className="group relative shrink-0 overflow-hidden inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-600 via-sky-500 to-blue-600 shadow-lg shadow-sky-600/30 hover:shadow-xl hover:shadow-sky-500/35 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
                      >
                        <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" aria-hidden />
                        <span className="relative text-lg leading-none">+</span>
                        <span className="relative">Add Agent</span>
                      </button>
                    )}
                  </div>

                  <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                    <div className="flex-1 relative">
                      <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search by Agent Name or Email"
                        className="w-full border-2 border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-sm bg-gray-50/80 hover:bg-white focus:outline-none focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 transition-all shadow-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={fetchAgents}
                      className="px-4 py-2.5 bg-white border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-sky-50/80 hover:border-sky-200/70 transition-all duration-200 active:scale-[0.98]"
                    >
                      Refresh
                    </button>
                  </div>

                  {agentsError && (
                    <div className="motion-enter mt-4 p-4 bg-red-50 border border-red-200/90 rounded-xl text-sm text-red-700 shadow-sm ring-1 ring-red-100/50">
                      {agentsError}
                    </div>
                  )}
                  {roleToast && (
                    <div className="motion-enter mt-4 p-4 bg-emerald-50 border border-emerald-200/90 rounded-xl text-sm text-emerald-800 shadow-sm ring-1 ring-emerald-100/50">
                      {roleToast}
                    </div>
                  )}

                  <div className="mt-6">
                    {loadingAgents ? (
                      <div className="py-12 text-center motion-enter">
                        <div className="inline-block h-9 w-9 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
                        <p className="mt-3 text-gray-600 text-sm">Loading agents...</p>
                      </div>
                    ) : filteredAgents.length === 0 ? (
                      <div className="py-10 text-center text-gray-500 text-sm motion-enter">No agents found.</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 md:gap-7 motion-stagger-children">
                        {filteredAgents.map((a) => {
                          const name = a?.name || "Agent";
                          const email = a?.email || "";
                          const initial = String(name).trim().charAt(0).toUpperCase();
                          const status = (a?.status || "active").toString().toLowerCase();
                          const isActiveStatus = status === "active";
                          const canOpenAgentWorkspace = isActiveStatus && currentRole !== "admin";
                          const avatarGrad = agentAvatarGradient(a.id);
                          const managerPermissionLabels = getEnabledManagerPermissionLabels(a?.permissions);
                          return (
                            <div
                              key={a.id}
                              role="button"
                              tabIndex={canOpenAgentWorkspace ? 0 : -1}
                              onClick={() => {
                                if (!canOpenAgentWorkspace) return;
                                navigate("/agent", {
                                  state: selectedProject ? { project: selectedProject, agent: a } : { agent: a },
                                });
                              }}
                              onKeyDown={(e) => {
                                if (!canOpenAgentWorkspace) return;
                                if (e.key !== "Enter") return;
                                navigate("/agent", {
                                  state: selectedProject ? { project: selectedProject, agent: a } : { agent: a },
                                });
                              }}
                              className={`group relative motion-card-rich overflow-hidden rounded-2xl border border-gray-200/80 backdrop-blur-md shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-sky-50/50 ${
                                canOpenAgentWorkspace
                                  ? "bg-white/95 cursor-pointer motion-hover-lift hover:border-sky-300/60 hover:shadow-2xl hover:shadow-sky-500/15 hover:-translate-y-1"
                                  : "bg-gray-100/70 cursor-not-allowed opacity-75"
                              }`}
                            >
                              <div
                                className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-sky-400 via-blue-500 to-cyan-400 z-[5]"
                                aria-hidden
                              />
                              <span
                                className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-sky-400/20 blur-2xl transition-all duration-500 group-hover:bg-sky-400/30"
                                aria-hidden
                              />
                              <span
                                className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-blue-500/15 blur-2xl transition-all duration-500 group-hover:bg-blue-500/25"
                                aria-hidden
                              />
                              <span
                                className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white via-white to-sky-50/30 opacity-100 transition-all duration-500 group-hover:via-sky-50/40 group-hover:to-sky-100/50 z-0"
                                aria-hidden
                              />
                              <span className="motion-card-shine pointer-events-none absolute inset-0 overflow-hidden rounded-2xl z-[2]" aria-hidden>
                                <span className="motion-card-shine__beam absolute inset-0" />
                              </span>

                              <div className="relative z-[3] p-5 pt-6">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex items-center gap-4 min-w-0 flex-1">
                                    <div
                                      className={`motion-avatar-breathe relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${avatarGrad} text-lg font-bold text-white shadow-lg shadow-sky-900/25 ring-4 ring-white/90 transition-transform duration-300 group-hover:scale-[1.04] group-hover:shadow-xl group-hover:shadow-sky-600/20`}
                                    >
                                      {initial}
                                      <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-white shadow-sm">
                                        <span
                                          className={`h-2.5 w-2.5 rounded-full ${isActiveStatus ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]" : "bg-gray-300"}`}
                                        />
                                      </span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="truncate text-base font-bold tracking-tight text-gray-900 transition-colors duration-300 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-sky-800 group-hover:to-blue-800 group-hover:bg-clip-text">
                                          {name}
                                        </h3>
                                        <select
                                          value={String(a?.role || "agent").toLowerCase()}
                                          disabled={!canManageRoles || roleUpdatingId === a.id || deletingId === a.id}
                                          onClick={(e) => e.stopPropagation()}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            handleAccessLevelChange(a, e.target.value);
                                          }}
                                          className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-700 ring-1 ring-sky-200/80 focus:outline-none focus:ring-2 focus:ring-sky-400/45"
                                          title="Access level"
                                        >
                                          <option value="agent">Agent</option>
                                          <option value="manager">Manager</option>
                                          <option value="admin">Admin</option>
                                        </select>
                                      </div>
                                      <p className="mt-1 truncate text-sm text-gray-500 transition-colors group-hover:text-gray-600">{email}</p>
                                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                                        {formatRoleLabel(a?.role)}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-2">
                                    <button
                                      className="group/edit rounded-xl border border-gray-100 bg-white/80 p-2.5 text-gray-400 shadow-sm transition-all duration-200 hover:border-sky-200 hover:bg-sky-50 hover:text-sky-600 hover:shadow-md active:scale-95"
                                      title="Edit"
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditAgent(a);
                                        setEditForm(buildAgentFormState(a));
                                        setEditError("");
                                        setEditOpen(true);
                                      }}
                                    >
                                      <svg
                                        className="h-4 w-4 transition-transform duration-300 group-hover/edit:scale-110 group-hover/edit:-rotate-6"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                      </svg>
                                    </button>
                                    {currentRole === "admin" && (
                                      <button
                                        className="rounded-xl border border-red-100 bg-white/80 p-2.5 text-red-400 shadow-sm transition-all duration-200 hover:border-red-200 hover:bg-red-50 hover:text-red-600 hover:shadow-md active:scale-95 disabled:opacity-60"
                                        title="Delete"
                                        type="button"
                                        disabled={deletingId === a.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteAgent(a);
                                        }}
                                      >
                                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0h8m-1-2a1 1 0 00-1-1h-2a1 1 0 00-1 1l-.2 1h4.4l-.2-1z" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {String(a?.role || "").toLowerCase() === "manager" && (
                                  <div className="mt-4 rounded-2xl border border-sky-100/90 bg-gradient-to-br from-sky-50/75 via-white to-sky-100/55 p-3.5 shadow-sm ring-1 ring-sky-100/70">
                                    <div className="mb-2.5 flex items-center justify-between gap-2">
                                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-700/80">
                                        Access
                                      </p>
                                      <span className="text-[10px] font-semibold text-sky-600/80">
                                        {managerPermissionLabels.length} permission{managerPermissionLabels.length === 1 ? "" : "s"}
                                      </span>
                                    </div>
                                    {managerPermissionLabels.length > 0 ? (
                                      <div className="grid grid-cols-2 gap-2">
                                        {managerPermissionLabels.map((label) => (
                                          <div
                                            key={label}
                                            className="flex min-w-0 items-center gap-2 rounded-xl border border-sky-100/90 bg-white/95 px-3 py-2 text-[11px] font-semibold text-sky-800 shadow-sm"
                                          >
                                            <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500 shadow-[0_0_0_3px_rgba(14,165,233,0.12)]" />
                                            <span className="truncate">{label}</span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="rounded-xl border border-dashed border-gray-200 bg-white/70 px-3 py-2 text-[11px] text-gray-500">
                                        No permissions assigned
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div className="mt-5 grid grid-cols-2 gap-3">
                                  <div className="rounded-xl border border-gray-100/90 bg-gradient-to-br from-gray-50/90 to-white px-3 py-2.5 shadow-sm transition-all duration-300 group-hover:border-sky-200/60 group-hover:shadow-md">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Login</div>
                                    <div className="mt-1 truncate text-xs font-semibold text-gray-800">{email || "—"}</div>
                                  </div>
                                  <div className="rounded-xl border border-gray-100/90 bg-gradient-to-br from-gray-50/90 to-white px-3 py-2.5 shadow-sm transition-all duration-300 group-hover:border-sky-200/60 group-hover:shadow-md">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</div>
                                    <div className="mt-1.5">
                                      <select
                                        value={isActiveStatus ? "active" : "inactive"}
                                        disabled={statusUpdatingId === a.id || deletingId === a.id}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          handleStatusChange(a, e.target.value);
                                        }}
                                        className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 focus:outline-none focus:ring-2 focus:ring-sky-400/45 ${
                                          isActiveStatus
                                            ? "bg-emerald-50 text-emerald-800 ring-emerald-200/90"
                                            : "bg-gray-100 text-gray-600 ring-gray-200/80"
                                        }`}
                                      >
                                        <option value="active">Active</option>
                                        <option value="inactive">Not Active</option>
                                      </select>
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-4 flex items-center justify-between border-t border-gray-100/80 pt-4 text-xs">
                                  <span className="font-medium text-gray-400 transition-colors group-hover:text-sky-600/80">
                                    {!isActiveStatus
                                      ? "Not active - cannot open"
                                      : currentRole === "admin"
                                      ? "Admin cannot open agent workspace"
                                      : "Open agent workspace"}
                                  </span>
                                  <span className="flex items-center gap-1 font-semibold text-sky-600 opacity-70 transition-all duration-300 group-hover:translate-x-0.5 group-hover:opacity-100">
                                    {canOpenAgentWorkspace ? "Continue" : "Locked"}
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            </div>
          </main>
        </div>
      </div>
      </div>

      {/* Create Agent Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => (!creating ? setCreateOpen(false) : null)}
            aria-hidden
          />
          <div className="relative z-[1] flex min-h-full items-start justify-center p-4 sm:items-center sm:p-6">
            <div className="motion-pop flex w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.22)] ring-1 ring-black/5 backdrop-blur-xl max-h-[min(88vh,760px)]">
              <div className="shrink-0 border-b border-gray-100 bg-gradient-to-r from-slate-50 via-sky-50/60 to-white px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 tracking-tight">Add Agent</h3>
                    <p className="mt-1 text-xs text-gray-500">Create a team member and assign access in one place.</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-xl p-2 text-gray-500 transition-all hover:bg-white/90 hover:text-gray-800 active:scale-95"
                    onClick={() => (!creating ? setCreateOpen(false) : null)}
                    aria-label="Close"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-white via-sky-50/[0.18] to-sky-100/[0.14]">
                <div className="p-5 md:p-6">
                  {createError && (
                    <div className="mb-4 rounded-xl border border-red-200/90 bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-100/50">
                      {createError}
                    </div>
                  )}

                  <div className="space-y-4 rounded-3xl border border-gray-100/90 bg-white/95 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-gray-100/70">
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-800">Name</label>
                      <input
                        value={createForm.name}
                        onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                        className="w-full rounded-xl border-2 border-gray-200 bg-gray-50/80 px-4 py-2.5 text-sm transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/45 hover:bg-white"
                        placeholder="Agent name"
                        disabled={creating}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-800">Email</label>
                      <input
                        value={createForm.email}
                        onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                        className="w-full rounded-xl border-2 border-gray-200 bg-gray-50/80 px-4 py-2.5 text-sm transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/45 hover:bg-white"
                        placeholder="agent@example.com"
                        disabled={creating}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-800">Role</label>
                      <select
                        value={createForm.role}
                        onChange={(e) =>
                          setCreateForm((p) => ({
                            ...p,
                            role: e.target.value,
                            permissions: e.target.value === "manager" ? p.permissions : emptyManagerPermissions(),
                          }))
                        }
                        className="w-full rounded-xl border-2 border-gray-200 bg-gray-50/80 px-4 py-2.5 text-sm transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/45 hover:bg-white"
                        disabled={creating}
                      >
                        <option value="">Select role</option>
                        <option value="agent">Agent</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    {createForm.role === "manager" && renderPermissionSelector(createForm.permissions, toggleCreatePermission, creating)}
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-800">Password</label>
                      <PasswordInput
                        value={createForm.password}
                        onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                        className="w-full rounded-xl border-2 border-gray-200 bg-gray-50/80 px-4 py-2.5 text-sm transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/45 hover:bg-white"
                        placeholder="Minimum 6 characters"
                        disabled={creating}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="shrink-0 border-t border-gray-100 bg-white/95 px-5 py-4 shadow-[0_-8px_20px_rgba(15,23,42,0.04)] backdrop-blur-sm">
                <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-gray-200 text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98]"
                  onClick={() => setCreateOpen(false)}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onCreateAgent}
                  disabled={creating}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 text-white shadow-md shadow-sky-600/25 disabled:opacity-60 transition-all active:scale-[0.98]"
                >
                  {creating ? "Creating..." : "Create Agent"}
                </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Agent Modal */}
      {editOpen && editAgent && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setEditOpen(false)}
            aria-hidden
          />
          <div className="relative z-[1] flex min-h-full items-start justify-center p-4 sm:items-center sm:p-6">
            <div className="motion-pop flex w-full max-w-xl flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.22)] ring-1 ring-black/5 backdrop-blur-xl max-h-[min(88vh,760px)]">
              <div className="shrink-0 border-b border-gray-100 bg-gradient-to-r from-slate-50 via-sky-50/60 to-white px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 tracking-tight">Edit Agent</h3>
                    <p className="mt-1 text-xs text-gray-500">Update role, permissions, and member details.</p>
                  </div>
                  <button
                    type="button"
                    className="rounded-xl p-2 text-gray-500 transition-all hover:bg-white/90 hover:text-gray-800 active:scale-95"
                    onClick={() => setEditOpen(false)}
                    aria-label="Close"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-white via-sky-50/[0.18] to-sky-100/[0.14]">
                <div className="p-5 md:p-6">
                  <div className="space-y-4 rounded-3xl border border-gray-100/90 bg-white/95 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-gray-100/70">
                    {editError && (
                      <div className="rounded-xl border border-red-200/90 bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-100/50">
                        {editError}
                      </div>
                    )}
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-800">Name</label>
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                        className="w-full rounded-xl border-2 border-gray-200 bg-gray-50/80 px-4 py-2.5 text-sm transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/45 hover:bg-white"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-semibold text-gray-800">Email</label>
                      <input
                        value={editForm.email}
                        onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                        className="w-full rounded-xl border-2 border-gray-200 bg-gray-50/80 px-4 py-2.5 text-sm transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/45 hover:bg-white"
                      />
                    </div>
                    {canManageRoles && (
                      <>
                        <div>
                          <label className="mb-2 block text-sm font-semibold text-gray-800">Role</label>
                          <select
                            value={editForm.role}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                role: e.target.value,
                                permissions: e.target.value === "manager" ? prev.permissions : emptyManagerPermissions(),
                              }))
                            }
                            className="w-full rounded-xl border-2 border-gray-200 bg-gray-50/80 px-4 py-2.5 text-sm transition-all focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/45 hover:bg-white"
                          >
                            <option value="agent">Agent</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                          </select>
                        </div>
                        {editForm.role === "manager" && renderPermissionSelector(editForm.permissions, toggleEditPermission, editSaving)}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="shrink-0 border-t border-gray-100 bg-white/95 px-5 py-4 shadow-[0_-8px_20px_rgba(15,23,42,0.04)] backdrop-blur-sm">
                <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border-2 border-gray-200 text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.98]"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!editAgent?.id) return;
                    setEditSaving(true);
                    setEditError("");
                    try {
                      await axios.put(`/auth/agents/${editAgent.id}`, {
                        name: editForm.name,
                        email: editForm.email,
                        ...(canManageRoles
                          ? {
                              role: editForm.role,
                              permissions:
                                editForm.role === "manager"
                                  ? normalizeManagerPermissions(editForm.permissions)
                                  : null,
                            }
                          : {}),
                      });
                      setEditOpen(false);
                      setEditAgent(null);
                      await fetchAgents();
                    } catch (e) {
                      setEditError(e?.response?.data?.message || e?.message || "Failed to update agent");
                    } finally {
                      setEditSaving(false);
                    }
                  }}
                  disabled={editSaving}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 text-white shadow-md shadow-sky-600/25 disabled:opacity-60 transition-all active:scale-[0.98]"
                >
                  {editSaving ? "Saving..." : "Save"}
                </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <PlanLimitModal open={Boolean(planLimitModal)} payload={planLimitModal} onClose={() => setPlanLimitModal(null)} />
    </div>
  );
}

export default ManagePage;
