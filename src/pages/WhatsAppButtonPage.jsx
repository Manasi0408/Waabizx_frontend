import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BrandLogoMark from '../components/BrandLogoMark';
import MainSidebarNav from '../components/MainSidebarNav';
import AppShellSidebar from '../components/AppShellSidebar';
import AdminHeaderProjectSwitch from '../components/AdminHeaderProjectSwitch';
import HeaderRightActions from '../components/HeaderRightActions';
import { getProfile, isAuthenticated, logout } from '../services/authService';
import {
  createWhatsAppButton,
  deleteWhatsAppButton,
  fetchWhatsAppButtons,
} from '../services/whatsappButtonService';
import logoWaabizx from '../LogoWaabizx.png';

const POSITIONS = [
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'top-left', label: 'Top Left' },
];

const defaultProfileUrl = () => {
  if (typeof window === 'undefined') return '/LogoWaabizx.png';
  return `${window.location.origin}/LogoWaabizx.png`;
};

const emptyForm = () => ({
  name: 'Chat with us',
  ctaColor: '#4DC247',
  marginLeft: 20,
  marginRight: 20,
  marginTop: 20,
  marginBottom: 20,
  cornerRadius: 25,
  prefillMessage: 'Hi',
  position: 'bottom-right',
  widgetHeading: '',
  widgetButtonText: 'Start chat',
  widgetButtonColor: '#0A5F54',
  widgetProfileUrl: defaultProfileUrl(),
  widgetPrefillMessage: 'Hi, how can I help you?',
});

const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

async function downloadImage(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, '_blank');
  }
}

function QrModal({ title, imageUrl, chatUrl, onClose, onDownload }) {
  if (!imageUrl) return null;
  return (
    <div className="fixed inset-0 z-[420] flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-sm">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h4 className="text-base font-bold text-gray-900">{title}</h4>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex flex-col items-center gap-3">
          <img src={imageUrl} alt={title} className="w-64 h-64 rounded-xl border border-gray-100 bg-white" />
          <p className="text-xs text-center text-gray-500 break-all px-2">{chatUrl}</p>
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 hover:bg-emerald-100"
            >
              Download
            </button>
            <a
              href={chatUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-sky-700 bg-sky-50 border border-sky-100 hover:bg-sky-100"
            >
              Open chat
            </a>
          </div>
          <p className="text-[11px] text-gray-400 text-center">Scan with your phone camera to open WhatsApp chat</p>
        </div>
      </div>
    </div>
  );
}

export default function WhatsAppButtonPage() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [buttons, setButtons] = useState([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [copyFlash, setCopyFlash] = useState('');
  const [qrView, setQrView] = useState(null);

  const loadButtons = useCallback(async () => {
    setError('');
    try {
      const data = await fetchWhatsAppButtons();
      setButtons(data.buttons);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load buttons');
      setButtons([]);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      try {
        if (!isAuthenticated()) {
          navigate('/login');
          return;
        }
        const userData = await getProfile();
        setUser(userData);
        await loadButtons();
      } catch {
        logout();
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [navigate, loadButtons]);

  useEffect(() => {
    const onProject = () => {
      loadButtons();
    };
    window.addEventListener('selected-project-changed', onProject);
    return () => window.removeEventListener('selected-project-changed', onProject);
  }, [loadButtons]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return buttons;
    return buttons.filter(
      (b) =>
        String(b.name || '').toLowerCase().includes(q) ||
        String(b.prefillMessage || '').toLowerCase().includes(q)
    );
  }, [buttons, search]);

  const openAdd = () => {
    setForm(emptyForm());
    setGenerated(null);
    setError('');
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setGenerated(null);
    setForm(emptyForm());
  };

  const onGenerate = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const button = await createWhatsAppButton({
        ...form,
        widgetProfileUrl: form.widgetProfileUrl || defaultProfileUrl(),
      });
      setGenerated(button);
      await loadButtons();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to generate button');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id) => {
    if (!window.confirm('Delete this WhatsApp button?')) return;
    setError('');
    try {
      await deleteWhatsAppButton(id);
      await loadButtons();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to delete button');
    }
  };

  const handleCopyScript = async (script) => {
    const ok = await copyText(script || '');
    setCopyFlash(ok ? 'Script copied' : 'Copy failed');
    setTimeout(() => setCopyFlash(''), 2000);
  };

  const previewPosStyle = useMemo(() => {
    const base = { position: 'fixed', zIndex: 350 };
    const ml = Number(form.marginLeft) || 20;
    const mr = Number(form.marginRight) || 20;
    const mt = Number(form.marginTop) || 20;
    const mb = Number(form.marginBottom) || 20;
    if (form.position === 'bottom-left') return { ...base, bottom: mb, left: ml };
    if (form.position === 'top-right') return { ...base, top: mt, right: mr };
    if (form.position === 'top-left') return { ...base, top: mt, left: ml };
    return { ...base, bottom: mb, right: mr };
  }, [form]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-sky-200 border-t-sky-600" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <header className="shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2.5 rounded-xl hover:bg-gray-100/80 active:scale-95 transition lg:hidden"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link to="/dashboard" className="flex items-center gap-3 shrink-0 transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]">
            <BrandLogoMark size="md" />
            <span className="text-xl font-bold text-gray-800 hidden sm:block">Waabizx</span>
          </Link>
          <span className="text-gray-300 hidden md:block shrink-0">|</span>
          <h2 className="text-lg font-semibold text-sky-700 hidden md:block tracking-tight">WhatsApp Button</h2>
          <AdminHeaderProjectSwitch />
        </div>
        <HeaderRightActions>
          {user ? (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center text-white text-sm font-semibold shadow-md shadow-sky-500/35">
              {String(user.name || user.email || 'U').charAt(0).toUpperCase()}
            </div>
          ) : null}
        </HeaderRightActions>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AppShellSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
          <MainSidebarNav onNavigate={() => setSidebarOpen(false)} />
        </AppShellSidebar>

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50 p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <div className="motion-enter mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">WhatsApp Button</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Create embeddable chat buttons and QR codes for your WhatsApp number
                </p>
              </div>
              <button
                type="button"
                onClick={openAdd}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 text-white text-sm font-semibold hover:from-sky-500 hover:to-blue-500 shadow-md shadow-sky-500/25 transition"
              >
                Add +
              </button>
            </div>

            {error ? (
              <div className="motion-enter mb-4 p-4 bg-red-50 border border-red-200/90 rounded-xl text-sm text-red-700 shadow-sm ring-1 ring-red-100/50">
                {error}
              </div>
            ) : null}
            {copyFlash ? (
              <div className="motion-enter mb-4 p-4 bg-emerald-50 border border-emerald-200/90 rounded-xl text-sm text-emerald-800 shadow-sm ring-1 ring-emerald-100/50">
                {copyFlash}
              </div>
            ) : null}

            <div className="motion-enter bg-white/95 backdrop-blur-sm rounded-2xl border border-gray-100/90 shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100/90 bg-gradient-to-r from-white via-sky-50/40 to-white flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search buttons..."
                  className="w-full sm:max-w-xs px-4 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 bg-white"
                />
                <span className="text-sm text-gray-500">
                  {filtered.length} button{filtered.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-gray-50/80 text-left text-[11px] font-bold uppercase tracking-wide text-gray-500">
                    <tr className="border-b border-gray-100">
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Prefill Message</th>
                      <th className="px-4 py-3">Widget</th>
                      <th className="px-4 py-3">WhatsApp QR</th>
                      <th className="px-4 py-3">Waabizx QR</th>
                      <th className="px-4 py-3">Created At</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-16 text-center">
                          <p className="text-sm font-semibold text-gray-700">No WhatsApp buttons yet</p>
                          <p className="text-xs text-gray-500 mt-1">
                            Click <strong>Add +</strong> to create your first button.
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filtered.map((btn) => (
                        <tr key={btn.id} className="hover:bg-sky-50/40 transition-colors">
                          <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{btn.name}</td>
                          <td className="px-4 py-3 text-gray-700">{btn.prefillMessage}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => handleCopyScript(btn.embedScript)}
                              className="inline-flex items-center gap-1.5 text-sky-600 font-semibold hover:text-sky-700 hover:underline"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              Copy Script
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() =>
                                setQrView({
                                  title: 'WhatsApp QR',
                                  imageUrl: btn.whatsappQrImageUrl,
                                  chatUrl: btn.whatsappChatUrl,
                                  filename: `whatsapp-qr-${btn.publicId}.png`,
                                })
                              }
                              className="block rounded-lg overflow-hidden ring-1 ring-gray-200 hover:ring-2 hover:ring-sky-400 transition"
                            >
                              <img
                                src={btn.whatsappQrImageUrl}
                                alt="WhatsApp QR"
                                className="w-12 h-12 bg-white object-contain"
                              />
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() =>
                                setQrView({
                                  title: 'Waabizx QR',
                                  imageUrl: btn.waabizxQrImageUrl,
                                  chatUrl: btn.waabizxRedirectUrl,
                                  filename: `waabizx-qr-${btn.publicId}.png`,
                                })
                              }
                              className="block rounded-lg overflow-hidden ring-1 ring-gray-200 hover:ring-2 hover:ring-sky-400 transition"
                            >
                              <img
                                src={btn.waabizxQrImageUrl}
                                alt="Waabizx QR"
                                className="w-12 h-12 bg-white object-contain"
                              />
                            </button>
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatDate(btn.createdAt)}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => onDelete(btn.id)}
                              className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition"
                              aria-label="Delete"
                              title="Delete"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
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

      {showForm && !generated ? (
        <div className="fixed inset-0 z-[400] flex items-start justify-center p-4 pt-10 overflow-y-auto bg-slate-950/50 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-[28px] bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.22)] border border-white/70 ring-1 ring-black/5 mb-28 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 via-sky-50/60 to-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 tracking-tight">Create WhatsApp Button</h3>
                <p className="mt-0.5 text-xs text-gray-500">Configure chat button, widget, and generate embed script</p>
              </div>
              <button type="button" onClick={closeForm} className="rounded-xl p-2 text-gray-500 hover:bg-white/90 hover:text-gray-800" aria-label="Close">
                ×
              </button>
            </div>
            <form onSubmit={onGenerate} className="p-5 space-y-5 max-h-[75vh] overflow-y-auto bg-gradient-to-b from-white via-sky-50/[0.18] to-sky-100/[0.14]">
              <section className="space-y-3 rounded-2xl border border-gray-100/90 bg-white/95 p-4 shadow-sm ring-1 ring-gray-100/70">
                <h4 className="text-sm font-bold text-gray-900">Chat Button</h4>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">CTA Button Text</span>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="mt-1 w-full rounded-xl border-2 border-gray-200 bg-gray-50/80 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">CTA Button Color</span>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="color"
                      value={form.ctaColor}
                      onChange={(e) => setForm((f) => ({ ...f, ctaColor: e.target.value }))}
                      className="h-10 w-12 rounded-lg border border-gray-200 cursor-pointer"
                    />
                    <input
                      value={form.ctaColor}
                      onChange={(e) => setForm((f) => ({ ...f, ctaColor: e.target.value }))}
                      className="flex-1 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400"
                    />
                  </div>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    ['marginLeft', 'Margin Left'],
                    ['marginRight', 'Margin Right'],
                    ['marginTop', 'Margin Top'],
                    ['marginBottom', 'Margin Bottom'],
                  ].map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="text-xs font-semibold text-gray-600">{label}</span>
                      <input
                        type="number"
                        min={0}
                        value={form[key]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
                        className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
                      />
                    </label>
                  ))}
                </div>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Corner Radius</span>
                  <input
                    type="number"
                    min={0}
                    value={form.cornerRadius}
                    onChange={(e) => setForm((f) => ({ ...f, cornerRadius: Number(e.target.value) }))}
                    className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Prefill Message</span>
                  <input
                    maxLength={140}
                    value={form.prefillMessage}
                    onChange={(e) => setForm((f) => ({ ...f, prefillMessage: e.target.value }))}
                    className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400"
                  />
                  <p className="mt-1 text-[11px] text-gray-400 text-right">{String(form.prefillMessage || '').length}/140</p>
                </label>
              </section>

              <section className="space-y-3 rounded-2xl border border-gray-100/90 bg-white/95 p-4 shadow-sm ring-1 ring-gray-100/70">
                <h4 className="text-sm font-bold text-gray-900">Button Position</h4>
                <div className="grid grid-cols-2 gap-2">
                  {POSITIONS.map((p) => (
                    <label
                      key={p.value}
                      className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 cursor-pointer text-sm transition ${
                        form.position === p.value ? 'border-sky-400 bg-sky-50' : 'border-gray-200 hover:border-sky-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="position"
                        checked={form.position === p.value}
                        onChange={() => setForm((f) => ({ ...f, position: p.value }))}
                        className="text-sky-600 focus:ring-sky-500"
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </section>

              <section className="space-y-3 rounded-2xl border border-gray-100/90 bg-white/95 p-4 shadow-sm ring-1 ring-gray-100/70">
                <h4 className="text-sm font-bold text-gray-900">Chat Widget</h4>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Widget Heading Text</span>
                  <input
                    value={form.widgetHeading}
                    onChange={(e) => setForm((f) => ({ ...f, widgetHeading: e.target.value }))}
                    placeholder="Your business name"
                    className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Widget Button Text</span>
                  <input
                    value={form.widgetButtonText}
                    onChange={(e) => setForm((f) => ({ ...f, widgetButtonText: e.target.value }))}
                    className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Widget Button Color</span>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="color"
                      value={form.widgetButtonColor}
                      onChange={(e) => setForm((f) => ({ ...f, widgetButtonColor: e.target.value }))}
                      className="h-10 w-12 rounded-lg border border-gray-200 cursor-pointer"
                    />
                    <input
                      value={form.widgetButtonColor}
                      onChange={(e) => setForm((f) => ({ ...f, widgetButtonColor: e.target.value }))}
                      className="flex-1 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400"
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Widget Profile URL</span>
                  <div className="mt-1 flex items-center gap-3">
                    <img
                      src={form.widgetProfileUrl || logoWaabizx}
                      alt="Profile"
                      className="w-10 h-10 rounded-full object-cover border border-gray-200 bg-black"
                    />
                    <input
                      value={form.widgetProfileUrl}
                      onChange={(e) => setForm((f) => ({ ...f, widgetProfileUrl: e.target.value }))}
                      className="flex-1 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400"
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Prefill Message</span>
                  <input
                    value={form.widgetPrefillMessage}
                    onChange={(e) => setForm((f) => ({ ...f, widgetPrefillMessage: e.target.value }))}
                    className="mt-1 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400"
                  />
                </label>
              </section>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 text-white font-semibold hover:from-sky-500 hover:to-blue-500 disabled:opacity-50 shadow-md shadow-sky-500/25"
              >
                {saving ? 'Generating…' : 'Generate Button'}
              </button>
            </form>
          </div>

          <div style={previewPosStyle} className="pointer-events-none">
            <div
              className="inline-flex items-center gap-2 text-white text-sm font-semibold px-4 py-3 shadow-lg"
              style={{
                background: form.ctaColor || '#4DC247',
                borderRadius: `${Number(form.cornerRadius) || 25}px`,
              }}
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              {form.name || 'Chat with us'}
            </div>
          </div>
        </div>
      ) : null}

      {showForm && generated ? (
        <div className="fixed inset-0 z-[410] flex items-center justify-center p-4 bg-slate-950/55 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-[28px] bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,0.22)] border border-white/70 ring-1 ring-black/5 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-slate-50 via-sky-50/60 to-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 tracking-tight">Create WhatsApp Button</h3>
                <p className="mt-0.5 text-xs text-gray-500">Copy the script or download the QR code</p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                className="rounded-xl p-2 text-gray-500 hover:bg-white/90 hover:text-gray-800"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 bg-gradient-to-b from-white via-sky-50/[0.18] to-sky-100/[0.14]">
              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-sm font-semibold text-gray-800">Generated Button Script</p>
                  <button
                    type="button"
                    onClick={() => handleCopyScript(generated.embedScript)}
                    className="inline-flex items-center gap-1 text-sm font-semibold text-sky-600 hover:text-sky-700"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy script
                  </button>
                </div>
                <textarea
                  readOnly
                  value={generated.embedScript || ''}
                  className="w-full h-56 rounded-xl border-2 border-gray-200 bg-white p-3 text-xs font-mono text-gray-700 outline-none"
                />
              </div>
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() =>
                    downloadImage(generated.whatsappQrImageUrl, `whatsapp-qr-${generated.publicId}.png`)
                  }
                  className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-sky-600 hover:text-sky-700 self-end"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download
                </button>
                <img
                  src={generated.whatsappQrImageUrl}
                  alt="WhatsApp QR"
                  className="w-56 h-56 rounded-xl border border-gray-100 bg-white"
                />
                <p className="mt-3 text-xs text-center text-gray-500">Scan to open WhatsApp chat</p>
                <button
                  type="button"
                  onClick={() =>
                    downloadImage(generated.waabizxQrImageUrl, `waabizx-qr-${generated.publicId}.png`)
                  }
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-sky-600 hover:text-sky-700"
                >
                  Download Waabizx QR
                </button>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button
                type="button"
                onClick={closeForm}
                className="w-full py-2.5 rounded-xl border-2 border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {qrView ? (
        <QrModal
          title={qrView.title}
          imageUrl={qrView.imageUrl}
          chatUrl={qrView.chatUrl}
          onClose={() => setQrView(null)}
          onDownload={() => downloadImage(qrView.imageUrl, qrView.filename)}
        />
      ) : null}
    </div>
  );
}
