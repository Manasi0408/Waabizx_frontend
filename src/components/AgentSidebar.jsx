import React, { useMemo } from "react";
import BrandLogoMark from '../components/BrandLogoMark';
import { Link, useLocation } from "react-router-dom";

const iconClass = "w-5 h-5 flex-shrink-0";

const icons = {
  dashboard: (
    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  liveChat: (
    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
    </svg>
  ),
  history: (
    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  manage: (
    <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

const navItems = [
  { to: "/agent-dashboard", label: "Dashboard", icon: icons.dashboard },
  { to: "/live-chat", label: "Live Chat", icon: icons.liveChat },
  { to: "/campaign-reports", label: "History", icon: icons.history },
  { to: "/agent-manage", label: "Manage", icon: icons.manage },
];

function AgentSidebar({ open = true }) {
  const location = useLocation();
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

  return (
    <aside
      className={`bg-sky-950 text-white border-r border-sky-900 h-full shrink-0 flex flex-col items-center py-6 transition-all duration-300 overflow-hidden ${
        open ? "w-20" : "w-0 md:w-20"
      }`}
    >
      <div className="mb-10">
        <BrandLogoMark size="md" tone="contrast" />
      </div>

      <nav className="flex flex-col items-center gap-1 w-full px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <Link
              key={item.to}
              to={item.to}
              state={selectedProject ? { project: selectedProject } : undefined}
              className={`w-full flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-xl transition-all duration-200 ${
                isActive
                  ? "bg-sky-600 text-white shadow-lg shadow-sky-900/50 ring-1 ring-sky-400/40"
                  : "text-sky-100/90 hover:bg-sky-800/90 hover:text-white hover:scale-[1.02]"
              }`}
              title={item.label}
            >
              {item.icon}
              <span className="text-xs leading-tight text-center">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export default AgentSidebar;
