import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { logout } from '../services/authService';
import HeaderRightActions from './HeaderRightActions';
import BrandLogoMark from './BrandLogoMark';

export const SUPER_ADMIN_SECTIONS = [
  { id: 'admins', label: 'Admins & contacts', path: '/super-admin' },
  { id: 'plans', label: 'Plans', path: '/super-admin/plans' },
  { id: 'leads', label: 'Website leads', path: '/super-admin/leads' },
  { id: 'demos', label: 'Demo bookings', path: '/super-admin/demos' },
  { id: 'blogs', label: 'Blogs', path: '/super-admin/blogs' },
  { id: 'businesses', label: 'Businesses', path: '/super-admin/businesses' },
];

export function resolveSuperAdminSection(pathname) {
  const tail = String(pathname || '')
    .replace(/^\/super-admin\/?/, '')
    .replace(/\/$/, '')
    .toLowerCase();

  const match = SUPER_ADMIN_SECTIONS.find((item) => {
    const itemTail = item.path.replace(/^\/super-admin\/?/, '').replace(/\/$/, '').toLowerCase();
    return itemTail === tail;
  });

  if (match) return match.id;
  if (!tail) return 'admins';
  if (tail === 'plans') return 'plans';
  if (tail === 'leads') return 'leads';
  if (tail === 'demos') return 'demos';
  if (tail === 'blogs') return 'blogs';
  if (tail === 'businesses') return 'businesses';
  return 'admins';
}

const sectionSubtitle = {
  admins: 'View admins and their uploaded contacts',
  plans: 'Manage subscription plans and pricing',
  leads: 'Website contact form submissions',
  demos: 'Schedule a demo popup submissions',
  blogs: 'Create and manage blog posts',
  businesses: 'Businesses with active plan purchases',
};

function SuperAdminLayout({ children, userName, userInitial }) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeSection = resolveSuperAdminSection(location.pathname);
  const subtitle = sectionSubtitle[activeSection] || 'SuperAdmin workspace';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      <header className="motion-header-enter z-20 flex shrink-0 items-center justify-between border-b border-gray-200/80 bg-white/90 px-4 py-3.5 shadow-sm shadow-gray-200/50 backdrop-blur-md md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <BrandLogoMark size="md" />
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-sky-700">SuperAdmin</h2>
            <p className="hidden truncate text-xs text-gray-500 sm:block">{subtitle}</p>
          </div>
        </div>

        <HeaderRightActions>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 shadow-md shadow-sky-500/35 transition-all duration-200 hover:scale-[1.03] hover:shadow-lg hover:ring-2 hover:ring-sky-300/60 focus:outline-none"
            aria-label="Settings"
          >
            <span className="text-sm font-semibold text-white">{userInitial}</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-red-500 via-red-600 to-rose-700 shadow-md shadow-red-500/25 transition-all duration-200 hover:scale-[1.03] hover:shadow-lg hover:ring-2 hover:ring-red-200/60 focus:outline-none"
            aria-label="Logout"
            title="Logout"
          >
            <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m10 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h8a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </HeaderRightActions>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-gray-200/80 bg-white/95 lg:flex">
          <div className="border-b border-gray-100 px-4 py-4">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-gray-400">Navigation</p>
            <p className="mt-1 truncate text-sm font-semibold text-gray-800">{userName}</p>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {SUPER_ADMIN_SECTIONS.map((item) => {
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                    active
                      ? 'bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-md shadow-sky-500/20'
                      : 'text-gray-700 hover:bg-sky-50 hover:text-sky-800'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
            <div className="motion-page-blob absolute -right-16 -top-24 h-[18rem] w-[18rem] bg-sky-400/25" />
            <div className="motion-page-blob motion-page-blob--b absolute -left-20 top-1/2 h-[16rem] w-[16rem] bg-blue-400/20" />
          </div>

          <div className="relative z-[1] min-h-full">
            <div className="border-b border-gray-200/80 bg-white/80 px-4 py-3 backdrop-blur-sm lg:hidden">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-gray-500">Section</label>
              <select
                value={activeSection}
                onChange={(e) => {
                  const next = SUPER_ADMIN_SECTIONS.find((item) => item.id === e.target.value);
                  if (next) navigate(next.path);
                }}
                className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
              >
                {SUPER_ADMIN_SECTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">{children}</div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default SuperAdminLayout;
