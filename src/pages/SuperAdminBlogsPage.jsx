import React from 'react';
import { useNavigate } from 'react-router-dom';
import { logout } from '../services/authService';
import HeaderRightActions from '../components/HeaderRightActions';
import BrandLogoMark from '../components/BrandLogoMark';
import SuperAdminBlogsPanel from '../components/SuperAdminBlogsPanel';

function SuperAdminBlogsPage() {
  const navigate = useNavigate();

  const user = (() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  })();
  const userName = user?.name || 'SuperAdmin';
  const userInitial = String(userName || 'S').charAt(0).toUpperCase();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-3 shrink-0">
            <BrandLogoMark size="md" />
            <h2 className="text-lg font-semibold text-sky-700 hidden md:block tracking-tight">SuperAdmin</h2>
          </div>
          <span className="text-gray-300 hidden md:block shrink-0">|</span>
          <p className="text-xs md:text-sm text-gray-500 truncate">Blog management</p>
        </div>

        <HeaderRightActions>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/35 hover:shadow-lg hover:ring-2 ring-sky-300/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none"
            aria-label="Settings"
          >
            <span className="text-white font-semibold text-sm">{userInitial}</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-rose-700 flex items-center justify-center cursor-pointer shadow-md shadow-red-500/25 hover:shadow-lg hover:ring-2 ring-red-200/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none"
            aria-label="Logout"
            title="Logout"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m10 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h8a3 3 0 013 3v1" />
            </svg>
          </button>
        </HeaderRightActions>
      </header>

      <main className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
        <div className="pointer-events-none absolute inset-0 overflow-hidden z-0" aria-hidden>
          <div className="absolute -top-24 -right-16 w-[18rem] h-[18rem] bg-sky-400/25 motion-page-blob" />
          <div className="absolute top-1/2 -left-20 w-[16rem] h-[16rem] bg-blue-400/20 motion-page-blob motion-page-blob--b" />
        </div>

        <div className="relative z-[1] min-h-full">
          <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
            <div className="mb-6 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate('/super-admin')}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Admins & contacts
              </button>
              <button
                type="button"
                onClick={() => navigate('/super-admin')}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Plans
              </button>
              <button
                type="button"
                onClick={() => navigate('/super-admin')}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Website leads
              </button>
              <button
                type="button"
                onClick={() => navigate('/super-admin')}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
              >
                Demo bookings
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-xl text-sm font-semibold transition bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md"
              >
                Blogs
              </button>
              <button
                type="button"
                onClick={() => navigate('/super-admin/businesses')}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition bg-white text-gray-700 border border-gray-200 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-800"
              >
                Businesses
              </button>
            </div>

            <SuperAdminBlogsPanel />
          </div>
        </div>
      </main>
    </div>
  );
}

export default SuperAdminBlogsPage;
