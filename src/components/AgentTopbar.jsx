import React, { useEffect, useMemo, useRef, useState } from "react";
import BrandLogoMark from '../components/BrandLogoMark';
import { useLocation, useNavigate, Link } from "react-router-dom";
import axios from "../api/axios";
import { logout } from "../services/authService";
import HeaderThemeToggle from "./HeaderThemeToggle";
import {
  persistSelectedProject,
  readSelectedProject,
  syncSelectedProjectWithAllowed,
} from "../utils/activeProject";

function readSessionUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function resolveProjectLabel(project) {
  if (!project) return null;
  const name = String(project.project_name || project.name || "").trim();
  return name || null;
}

function isTeamMember(role) {
  const r = String(role || "").toLowerCase();
  return r === "agent" || r === "manager";
}

const listScrollClass =
  "max-h-[min(14rem,50vh)] overflow-y-auto overscroll-contain py-1 " +
  "[scrollbar-width:thin] [scrollbar-color:rgb(203_213_225)_rgb(248_250_252)]";

function AgentTopbar({ onMenuClick }) {
  const location = useLocation();
  const navigate = useNavigate();
  const wrapRef = useRef(null);
  const [selectedProject, setSelectedProject] = useState(() => readSelectedProject());
  const [assignedProjects, setAssignedProjects] = useState([]);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);

  const sessionUser = readSessionUser();
  const userRole = String(sessionUser?.role || localStorage.getItem("role") || "").toLowerCase();
  const showProjectSwitcher = isTeamMember(userRole);

  const agent = useMemo(() => {
    if (sessionUser) {
      return {
        id: sessionUser.id ?? sessionUser._id,
        name: sessionUser.name,
        email: sessionUser.email,
      };
    }
    const fromState = location?.state?.agent;
    if (fromState && (fromState.id || fromState.name || fromState.email)) return fromState;
    try {
      const raw = localStorage.getItem("selectedAgent");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.id || parsed.name || parsed.email)) return parsed;
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }, [sessionUser?.id, sessionUser?.name, sessionUser?.email, location?.state?.agent]);

  const displayAgentName = agent?.name || agent?.email || "—";
  const displayProjectName =
    resolveProjectLabel(selectedProject) ||
    (selectedProject?.id != null ? `Project #${selectedProject.id}` : "Project: —");
  const userInitial = (displayAgentName !== "—" ? displayAgentName : "A").charAt(0).toUpperCase();

  useEffect(() => {
    try {
      if (agent) localStorage.setItem("selectedAgent", JSON.stringify(agent));
    } catch (e) {
      /* ignore */
    }
  }, [agent]);

  useEffect(() => {
    if (!showProjectSwitcher) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get("/projects/list");
        const projects = res.data?.projects || [];
        if (cancelled) return;
        setAssignedProjects(projects);
        const synced = syncSelectedProjectWithAllowed(projects);
        if (synced) setSelectedProject(synced);
      } catch (_) {
        if (!cancelled) setAssignedProjects([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [showProjectSwitcher]);

  useEffect(() => {
    const projectId = selectedProject?.id;
    if (projectId == null || String(projectId).trim() === "") return undefined;
    if (resolveProjectLabel(selectedProject)) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get(`/projects/${projectId}`);
        const fetched = res.data?.project;
        if (cancelled || !fetched) return;
        const enriched = persistSelectedProject({
          ...selectedProject,
          ...fetched,
          id: fetched.id ?? projectId,
          project_name: fetched.project_name || fetched.name || selectedProject?.project_name,
        });
        if (enriched) setSelectedProject(enriched);
      } catch (e) {
        /* keep Project #id fallback */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedProject?.id, selectedProject?.project_name, selectedProject?.name]);

  useEffect(() => {
    if (!projectMenuOpen) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setProjectMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [projectMenuOpen]);

  const handleProjectPick = (picked) => {
    const same =
      selectedProject?.id != null && String(selectedProject.id) === String(picked?.id);
    if (same) {
      setProjectMenuOpen(false);
      return;
    }

    persistSelectedProject(picked);
    setProjectMenuOpen(false);
    window.location.reload();
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="motion-header-enter relative z-40 shrink-0 overflow-visible bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-6 py-3 md:py-4 shadow-sm shadow-gray-200/50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1 overflow-visible">
          {onMenuClick && (
            <button
              type="button"
              onClick={onMenuClick}
              className="p-2.5 rounded-xl hover:bg-gray-100/80 active:scale-95 transition md:hidden"
              aria-label="Toggle sidebar"
            >
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          )}

          <Link
            to="/agent-dashboard"
            className="hidden sm:flex items-center gap-2.5 shrink-0 transition hover:opacity-90"
            state={selectedProject ? { project: selectedProject } : undefined}
          >
            <BrandLogoMark size="sm" />
            <span className="text-sm font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
              Waabizx
            </span>
          </Link>

          <div className="min-w-0 flex-1 overflow-visible flex flex-col gap-1.5 border-l border-gray-200/80 pl-3 md:pl-4 ml-0 sm:ml-1 sm:max-w-[min(24rem,calc(100vw-10rem))]">
            <span className="font-semibold text-gray-900 truncate text-sm md:text-base">{displayAgentName}</span>
            {showProjectSwitcher && assignedProjects.length > 0 ? (
              <div className="relative w-full min-w-0 overflow-visible" ref={wrapRef}>
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-sky-700/90">
                  Project
                </span>
                <button
                  type="button"
                  onClick={() => setProjectMenuOpen((v) => !v)}
                  className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-sky-200/90 bg-white px-3 py-2 text-left text-xs md:text-sm font-semibold text-sky-900 shadow-sm hover:border-sky-300 hover:bg-sky-50/80 transition"
                  aria-expanded={projectMenuOpen}
                  aria-haspopup="listbox"
                >
                  <span className="truncate flex-1">{displayProjectName}</span>
                  <svg
                    className={`h-4 w-4 shrink-0 text-sky-600 transition-transform ${projectMenuOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {projectMenuOpen && (
                  <div className="absolute left-0 right-0 top-full z-[200] mt-1.5 overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-2xl ring-1 ring-sky-100/80">
                    <div className="px-3 py-2 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-sky-50/40">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-sky-700">Select project</p>
                    </div>
                    <ul className={listScrollClass} role="listbox">
                      {assignedProjects.map((p) => {
                        const name = resolveProjectLabel(p) || `Project #${p.id}`;
                        const active =
                          selectedProject?.id != null && String(selectedProject.id) === String(p.id);
                        return (
                          <li key={p.id}>
                            <button
                              type="button"
                              role="option"
                              aria-selected={active}
                              onClick={() => handleProjectPick(p)}
                              className={`w-full px-3 py-2.5 text-left text-xs md:text-sm transition ${
                                active
                                  ? "bg-sky-50 text-sky-900 font-semibold"
                                  : "text-gray-800 hover:bg-slate-50"
                              }`}
                            >
                              <span className="block truncate">{name}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <span className="text-xs md:text-sm text-sky-700/90 truncate">{displayProjectName}</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 md:gap-3 w-full sm:w-auto">
          <HeaderThemeToggle showDivider={false} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
              API LIVE
            </span>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-800 ring-1 ring-sky-200/80">
              Plan: BASIC
            </span>
          </div>

          <div className="flex items-center gap-2 border-l border-gray-200/80 pl-2 md:pl-3">
            <button
              type="button"
              onClick={() => navigate("/settings")}
              className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center shadow-md shadow-sky-500/30 ring-2 ring-sky-100 hover:ring-sky-300 hover:scale-[1.03] transition-all focus:outline-none"
              title="Your Profile"
              aria-label="Open profile"
            >
              <span className="text-white font-semibold text-xs">{userInitial}</span>
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 border-2 border-gray-200/90 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition-all"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden md:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export default AgentTopbar;
