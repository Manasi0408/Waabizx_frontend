import React, { useEffect, useMemo } from "react";
import BrandLogoMark from '../components/BrandLogoMark';
import { useLocation, useNavigate, Link } from "react-router-dom";
import { logout } from "../services/authService";
import HeaderThemeToggle from "./HeaderThemeToggle";

function AgentTopbar({ onMenuClick }) {
  const location = useLocation();
  const navigate = useNavigate();
  const project = useMemo(() => {
    const fromState = location?.state?.project;
    if (fromState) return fromState;
    try {
      const raw = localStorage.getItem("selectedProject");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }, [location?.state?.project]);

  const agent = useMemo(() => {
    const fromState = location?.state?.agent;
    if (fromState && (fromState.id || fromState.name || fromState.email)) return fromState;
    try {
      const raw = localStorage.getItem("selectedAgent");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.id || parsed.name || parsed.email)) return parsed;
      }
      const rawUser = localStorage.getItem("user");
      if (rawUser) {
        const u = JSON.parse(rawUser);
        if (u) return { id: u.id ?? u._id, name: u.name, email: u.email };
      }
    } catch (e) {}
    return null;
  }, [location?.state?.agent]);

  const displayAgentName = agent?.name || agent?.email || "—";
  const displayProjectName = project?.project_name ? project.project_name : "Project: —";
  const userInitial = (displayAgentName !== "—" ? displayAgentName : "A").charAt(0).toUpperCase();

  useEffect(() => {
    try {
      if (agent) localStorage.setItem("selectedAgent", JSON.stringify(agent));
      if (project) localStorage.setItem("selectedProject", JSON.stringify(project));
    } catch (e) {}
  }, [agent, project]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-6 py-3 md:py-4 shadow-sm shadow-gray-200/50">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
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
            state={project ? { project } : undefined}
          ><BrandLogoMark size="sm" />
            <span className="text-sm font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
              Waabizx
            </span>
          </Link>

          <div className="min-w-0 flex flex-col border-l border-gray-200/80 pl-3 md:pl-4 ml-0 sm:ml-1">
            <span className="font-semibold text-gray-900 truncate text-sm md:text-base">{displayAgentName}</span>
            <span className="text-xs md:text-sm text-sky-700/90 truncate">{displayProjectName}</span>
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
