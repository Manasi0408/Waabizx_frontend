import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BrandLogoMark from '../components/BrandLogoMark';
import MainSidebarNav from '../components/MainSidebarNav';
import AppShellSidebar from '../components/AppShellSidebar';
import AdminHeaderProjectSwitch from '../components/AdminHeaderProjectSwitch';
import HeaderRightActions from '../components/HeaderRightActions';
import { getProfile, isAuthenticated, logout } from '../services/authService';
import { listForms, deleteForm } from '../utils/formStorage';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export default function FormsPage() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [forms, setForms] = useState([]);
  const [search, setSearch] = useState('');

  const loadForms = () => setForms(listForms());

  useEffect(() => {
    const init = async () => {
      try {
        if (!isAuthenticated()) {
          navigate('/login');
          return;
        }
        const userData = await getProfile();
        setUser(userData);
        loadForms();
      } catch {
        logout();
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [navigate]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return forms;
    return forms.filter(
      (f) =>
        String(f.name || '').toLowerCase().includes(q) ||
        String(f.category || '').toLowerCase().includes(q)
    );
  }, [forms, search]);

  const handleDelete = (id) => {
    if (!window.confirm('Delete this form?')) return;
    deleteForm(id);
    loadForms();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-sky-200 border-t-sky-600" />
      </div>
    );
  }


  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <header className="shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 flex justify-between items-center shadow-sm">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2.5 rounded-xl hover:bg-gray-100 lg:hidden"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link to="/dashboard" className="flex items-center gap-3 shrink-0">
            <BrandLogoMark size="md" />
            <span className="text-xl font-bold text-gray-800 hidden sm:block">Waabizx</span>
          </Link>
          <span className="text-gray-300 hidden md:block">|</span>
          <h2 className="text-lg font-semibold text-sky-700 hidden md:block">Forms</h2>
          <AdminHeaderProjectSwitch />
        </div>
        <HeaderRightActions />
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AppShellSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
          <MainSidebarNav onNavigate={() => setSidebarOpen(false)} />
        </AppShellSidebar>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Forms</h1>
                <p className="text-sm text-gray-500 mt-1">Quick Guide: Build WhatsApp-style forms for your business</p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/form/create')}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 shadow-md transition"
              >
                Create +
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search Forms..."
                  className="w-full sm:max-w-xs px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
                <span className="text-sm text-gray-500">{filtered.length} form{filtered.length !== 1 ? 's' : ''}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-sm">
                  <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-3 w-10">
                        <input type="checkbox" className="rounded border-gray-300" readOnly />
                      </th>
                      <th className="px-4 py-3">Form Name</th>
                      <th className="px-4 py-3">Form Category</th>
                      <th className="px-4 py-3">Created At</th>
                      <th className="px-4 py-3">Linked Templates</th>
                      <th className="px-4 py-3">Responses</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-16 text-center text-gray-500">
                          No forms yet. Click <strong>Create +</strong> to build your first form.
                        </td>
                      </tr>
                    ) : (
                      filtered.map((form) => (
                        <tr key={form.id} className="hover:bg-gray-50/80">
                          <td className="px-4 py-3">
                            <input type="checkbox" className="rounded border-gray-300" readOnly />
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">{form.name}</td>
                          <td className="px-4 py-3">
                            <span className="text-xs font-semibold text-gray-600 uppercase">{form.category || 'SURVEY'}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(form.createdAt)}</td>
                          <td className="px-4 py-3">
                            <button type="button" className="px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50">
                              List
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <button type="button" className="px-3 py-1 text-xs border border-gray-300 rounded-md hover:bg-gray-50">
                              view ({form.responses || 0})
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                title="Edit"
                                onClick={() => navigate(`/form/edit/${form.id}`)}
                                className="p-2 rounded-lg hover:bg-sky-50 text-sky-700"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                title="Preview"
                                onClick={() => navigate(`/form/edit/${form.id}`)}
                                className="p-2 rounded-lg hover:bg-gray-100 text-gray-700"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                title="Delete"
                                onClick={() => handleDelete(form.id)}
                                className="p-2 rounded-lg hover:bg-red-50 text-red-600"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </div>
                          </td>
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
    </div>
  );
}
