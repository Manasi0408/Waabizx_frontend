import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BrandLogoMark from '../components/BrandLogoMark';
import MainSidebarNav from '../components/MainSidebarNav';
import AppShellSidebar from '../components/AppShellSidebar';
import AdminHeaderProjectSwitch from '../components/AdminHeaderProjectSwitch';
import HeaderRightActions from '../components/HeaderRightActions';
import { getProfile, isAuthenticated, logout } from '../services/authService';
import RcsComposer from '../components/rcs/RcsComposer';
import RcsMessage from './inbox/RcsMessage';
import {
  createRcsCampaign,
  fetchRcsCampaigns,
  fetchRcsConversations,
  fetchRcsMessages,
  fetchRcsStats,
  getRcsSettings,
  mockRcsWebhook,
  rcsButtonClick,
  seedRcsInbox,
  seedRcsStats,
  sendRcsCampaign,
  sendRcsMessage,
  updateRcsSettings,
} from '../services/rcsApi';

const TABS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'settings', label: 'Settings' },
];

const inputClass =
  'mt-1 w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 bg-white';

const primaryBtnClass =
  'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 text-white text-sm font-semibold hover:from-sky-500 hover:to-blue-500 shadow-md shadow-sky-500/25 transition disabled:opacity-60';

const cardClass =
  'bg-white/95 backdrop-blur-sm rounded-2xl border border-gray-100/90 shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 overflow-hidden';

export default function RcsPage() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('inbox');
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [stats, setStats] = useState({ sent: 0, delivered: 0, read: 0, failed: 0, clicked: 0 });
  const [campaigns, setCampaigns] = useState([]);
  const [campaignForm, setCampaignForm] = useState({
    name: 'RCS Promo',
    channel: 'rcs',
    messageType: 'text',
    message: 'Hello from RCS campaign (mock)',
    recipients: '919876543210',
  });
  const [settings, setSettings] = useState({
    agentId: '',
    apiKey: '',
    webhookUrl: '',
    brandName: '',
  });
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  };

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login');
      return;
    }
    getProfile()
      .then((u) => setUser(u))
      .catch(() => {
        logout();
        navigate('/login');
      });
  }, [navigate]);

  const loadConversations = useCallback(async () => {
    const list = await fetchRcsConversations();
    setConversations(list);
    return list;
  }, []);

  const loadMessages = useCallback(async (conv) => {
    if (!conv?.phone) {
      setMessages([]);
      return;
    }
    const list = await fetchRcsMessages({ phone: conv.phone, contactId: conv.contactId });
    setMessages(list);
  }, []);

  const loadStats = useCallback(async () => {
    const s = await fetchRcsStats('rcs');
    setStats(s || { sent: 0, delivered: 0, read: 0, failed: 0, clicked: 0 });
  }, []);

  const loadCampaigns = useCallback(async () => {
    setCampaigns(await fetchRcsCampaigns());
  }, []);

  const loadSettings = useCallback(async () => {
    const s = await getRcsSettings();
    if (s) {
      setSettings({
        agentId: s.agentId || '',
        apiKey: s.apiKey || '',
        webhookUrl: s.webhookUrl || '',
        brandName: s.brandName || '',
      });
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await Promise.all([loadConversations(), loadStats(), loadCampaigns(), loadSettings()]);
      } catch (e) {
        showToast(e?.response?.data?.message || e.message || 'Failed to load RCS');
      } finally {
        setLoading(false);
      }
    })();
  }, [loadConversations, loadStats, loadCampaigns, loadSettings]);

  useEffect(() => {
    if (selected) loadMessages(selected).catch(() => {});
  }, [selected, loadMessages]);

  const handleSend = async (payload) => {
    try {
      setSending(true);
      await sendRcsMessage(payload);
      showToast('RCS message saved (mock provider)');
      const list = await loadConversations();
      const phone = String(payload.to || '').replace(/\D/g, '');
      const conv = list.find((c) => c.phone === phone) || { phone, contactName: payload.contactName };
      setSelected(conv);
      await loadMessages(conv);
      await loadStats();
      setTab('inbox');
    } catch (e) {
      showToast(e?.response?.data?.message || e.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const handleButtonClick = async (message, btn) => {
    try {
      const text = btn?.text || 'YES';
      if (btn?.type === 'url' || btn?.type === 'open_url') {
        if (btn.url) window.open(btn.url, '_blank');
      }
      await rcsButtonClick({
        messageId: message.providerMessageId || message.id,
        id: message.id,
        buttonText: text,
      });
      showToast(`Clicked: ${text}`);
      if (selected) await loadMessages(selected);
      await loadStats();
    } catch (e) {
      showToast(e?.response?.data?.message || e.message || 'Click failed');
    }
  };

  const handleSimulateStatus = async (message, status) => {
    try {
      await mockRcsWebhook({ messageId: message.providerMessageId, status });
      showToast(`Status → ${status}`);
      if (selected) await loadMessages(selected);
      await loadStats();
    } catch (e) {
      showToast(e?.response?.data?.message || e.message || 'Status update failed');
    }
  };

  const handleSeedInbox = async () => {
    try {
      await seedRcsInbox();
      const list = await loadConversations();
      if (list[0]) setSelected(list[0]);
      await loadStats();
      showToast('Sample RCS inbox seeded');
    } catch (e) {
      showToast(e?.response?.data?.message || e.message);
    }
  };

  const handleSeedStats = async () => {
    try {
      const s = await seedRcsStats();
      setStats(s);
      showToast('Demo analytics loaded');
    } catch (e) {
      showToast(e?.response?.data?.message || e.message);
    }
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    try {
      const recipients = String(campaignForm.recipients || '')
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((phone) => ({ phone }));
      const campaign = await createRcsCampaign({
        name: campaignForm.name,
        channel: campaignForm.channel,
        messageType: campaignForm.messageType,
        message: campaignForm.message,
        recipients,
        content: {
          message: campaignForm.message,
          recipients,
        },
      });
      await sendRcsCampaign(campaign.id, { recipients });
      await loadCampaigns();
      await loadConversations();
      await loadStats();
      showToast('RCS campaign sent (mock)');
    } catch (err) {
      showToast(err?.response?.data?.message || err.message);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await updateRcsSettings(settings);
      showToast('RCS settings saved (credentials empty until Google approval)');
    } catch (err) {
      showToast(err?.response?.data?.message || err.message);
    }
  };

  const filteredConversations = conversations.filter(
    (c) => !c.channel || c.channel === 'rcs'
  );
  const userName = user?.name || user?.email || 'User';
  const userInitial = String(userName).charAt(0).toUpperCase();
  const userAvatar = user?.avatar || '';

  if (loading && !user) {
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
          <Link
            to="/dashboard"
            className="flex items-center gap-3 shrink-0 transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
          >
            <BrandLogoMark size="md" />
            <span className="text-xl font-bold text-gray-800 hidden sm:block">Waabizx</span>
          </Link>
          <span className="text-gray-300 hidden md:block shrink-0">|</span>
          <h2 className="text-lg font-semibold text-sky-700 hidden md:block tracking-tight">RCS</h2>
          <AdminHeaderProjectSwitch />
        </div>
        <HeaderRightActions>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            title="Account / Profile"
            className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/35 hover:shadow-lg hover:ring-2 ring-sky-300/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none overflow-hidden"
          >
            {userAvatar ? (
              <img src={userAvatar} alt={userName} className="w-full h-full rounded-full object-cover" />
            ) : (
              <span className="text-white font-semibold text-sm">{userInitial}</span>
            )}
          </button>
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
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">RCS</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Mock mode · Pending Google RBM approval — test inbox, cards, campaigns &amp; analytics
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200/80 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                  Mock provider
                </span>
                {tab === 'inbox' ? (
                  <button type="button" onClick={handleSeedInbox} className={primaryBtnClass}>
                    Load samples
                  </button>
                ) : null}
              </div>
            </div>

            {toast ? (
              <div className="motion-enter mb-4 p-4 bg-emerald-50 border border-emerald-200/90 rounded-xl text-sm text-emerald-800 shadow-sm ring-1 ring-emerald-100/50">
                {toast}
              </div>
            ) : null}

            <div className={`${cardClass} mb-6`}>
              <div className="px-2 pt-2 border-b border-gray-100/90 bg-gradient-to-r from-white via-sky-50/40 to-white flex flex-wrap gap-1">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`px-4 py-2.5 text-sm font-semibold rounded-t-xl transition ${
                      tab === t.id
                        ? 'bg-white text-sky-700 shadow-sm border border-b-0 border-gray-100'
                        : 'text-gray-500 hover:text-sky-700 hover:bg-white/60'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="p-4 md:p-6">
                {loading ? (
                  <div className="flex justify-center py-16">
                    <div className="animate-spin rounded-full h-10 w-10 border-2 border-sky-200 border-t-sky-600" />
                  </div>
                ) : null}

                {!loading && tab === 'inbox' ? (
                  <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
                    <aside className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden flex flex-col max-h-[68vh]">
                      <div className="border-b border-gray-100 p-3 bg-gradient-to-r from-white via-sky-50/50 to-white">
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          Channel
                        </p>
                        <span className="inline-flex rounded-full bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm shadow-sky-500/30">
                          RCS
                        </span>
                      </div>
                      <ul className="flex-1 overflow-y-auto">
                        {filteredConversations.length === 0 ? (
                          <li className="p-4 text-xs text-gray-500 leading-relaxed">
                            No RCS conversations yet. Send a message or load samples.
                          </li>
                        ) : (
                          filteredConversations.map((c) => (
                            <li key={c.phone}>
                              <button
                                type="button"
                                onClick={() => setSelected(c)}
                                className={`w-full border-b border-gray-50 px-3 py-3 text-left transition hover:bg-sky-50 ${
                                  selected?.phone === c.phone ? 'bg-sky-50 ring-1 ring-inset ring-sky-100' : ''
                                }`}
                              >
                                <p className="text-sm font-semibold text-gray-900 truncate">
                                  {c.contactName || c.phone}
                                </p>
                                <p className="text-xs text-gray-500 truncate mt-0.5">{c.lastMessage}</p>
                                <span className="mt-1.5 inline-block rounded-full bg-emerald-50 border border-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                                  rcs
                                </span>
                              </button>
                            </li>
                          ))
                        )}
                      </ul>
                    </aside>

                    <section className="rounded-2xl border border-gray-100 shadow-sm flex flex-col max-h-[68vh] min-h-[360px] overflow-hidden bg-[#e5ddd5]">
                      <div className="shrink-0 border-b border-black/5 bg-white/90 backdrop-blur px-4 py-3">
                        <p className="text-sm font-bold text-gray-900">
                          {selected ? selected.contactName || selected.phone : 'Select a conversation'}
                        </p>
                        {selected ? <p className="text-xs text-gray-500 mt-0.5">{selected.phone}</p> : null}
                      </div>
                      <div className="flex-1 overflow-y-auto p-4">
                        {!selected ? (
                          <p className="text-center text-sm text-gray-600 mt-12">
                            Choose a contact or send a new RCS message.
                          </p>
                        ) : (
                          messages.map((m) => (
                            <RcsMessage
                              key={m.id}
                              message={m}
                              onButtonClick={handleButtonClick}
                              onSimulateStatus={handleSimulateStatus}
                            />
                          ))
                        )}
                      </div>
                    </section>

                    <div>
                      <RcsComposer
                        onSend={handleSend}
                        sending={sending}
                        defaultPhone={selected?.phone || ''}
                      />
                    </div>
                  </div>
                ) : null}

                {!loading && tab === 'campaigns' ? (
                  <div className="grid gap-6 lg:grid-cols-2">
                    <form onSubmit={handleCreateCampaign} className="space-y-4">
                      <h2 className="text-base font-bold text-gray-900 tracking-tight">Create RCS Campaign</h2>
                      <fieldset>
                        <legend className="text-xs font-semibold text-gray-600 mb-2">Channel</legend>
                        <label className="inline-flex items-center gap-1.5 text-sm text-gray-800">
                          <input
                            type="radio"
                            name="campChannel"
                            checked
                            readOnly
                            className="text-sky-600"
                          />
                          RCS
                        </label>
                      </fieldset>
                      <label className="block text-xs font-semibold text-gray-600">
                        Name
                        <input
                          className={inputClass}
                          value={campaignForm.name}
                          onChange={(e) => setCampaignForm((f) => ({ ...f, name: e.target.value }))}
                          required
                        />
                      </label>
                      <label className="block text-xs font-semibold text-gray-600">
                        Message
                        <textarea
                          className={inputClass}
                          rows={3}
                          value={campaignForm.message}
                          onChange={(e) => setCampaignForm((f) => ({ ...f, message: e.target.value }))}
                          required
                        />
                      </label>
                      <label className="block text-xs font-semibold text-gray-600">
                        Recipients (comma or newline)
                        <textarea
                          className={`${inputClass} font-mono`}
                          rows={3}
                          value={campaignForm.recipients}
                          onChange={(e) => setCampaignForm((f) => ({ ...f, recipients: e.target.value }))}
                          required
                        />
                      </label>
                      <button type="submit" className={primaryBtnClass}>
                        Create &amp; Send (Mock)
                      </button>
                    </form>

                    <div>
                      <h2 className="text-base font-bold text-gray-900 tracking-tight mb-3">RCS Campaigns</h2>
                      {campaigns.length === 0 ? (
                        <p className="text-sm text-gray-500">No campaigns yet.</p>
                      ) : (
                        <ul className="space-y-2">
                          {campaigns.map((c) => (
                            <li
                              key={c.id}
                              className="rounded-xl border border-gray-100 bg-gradient-to-r from-white via-sky-50/30 to-white px-4 py-3 shadow-sm"
                            >
                              <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {c.channel} · {c.status} · sent {c.sent}/{c.totalRecipients}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : null}

                {!loading && tab === 'analytics' ? (
                  <div>
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                      <h2 className="text-base font-bold text-gray-900 tracking-tight">RCS Analytics</h2>
                      <button
                        type="button"
                        onClick={handleSeedStats}
                        className="rounded-xl border-2 border-sky-200 px-4 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-50 transition"
                      >
                        Load demo stats (100/80/65/10)
                      </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
                      {[
                        { label: 'RCS Sent', value: stats.sent, accent: 'from-sky-400 to-sky-600' },
                        { label: 'Delivered', value: stats.delivered, accent: 'from-emerald-400 to-emerald-600' },
                        { label: 'Read', value: stats.read, accent: 'from-blue-400 to-blue-600' },
                        { label: 'Failed', value: stats.failed, accent: 'from-rose-400 to-rose-600' },
                        { label: 'Clicked', value: stats.clicked, accent: 'from-amber-400 to-amber-600' },
                      ].map((statCard) => (
                        <div
                          key={statCard.label}
                          className="relative rounded-2xl border border-gray-100/80 bg-white p-4 md:p-5 shadow-sm shadow-gray-200/40 overflow-hidden"
                        >
                          <div
                            className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${statCard.accent} opacity-90`}
                            aria-hidden
                          />
                          <p className="text-xs font-semibold text-gray-500 tracking-tight">{statCard.label}</p>
                          <p className="mt-2 text-3xl font-bold tabular-nums text-gray-900 tracking-tight">
                            {statCard.value ?? 0}
                          </p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-xs text-gray-500">
                      Counts stay at 0 until you send mock messages or seed demo data. Google webhooks will fill these later.
                    </p>
                  </div>
                ) : null}

                {!loading && tab === 'settings' ? (
                  <form onSubmit={handleSaveSettings} className="max-w-lg space-y-4">
                    <div>
                      <h2 className="text-base font-bold text-gray-900 tracking-tight">RCS Settings</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Leave empty until Google RBM approval. Provider:{' '}
                        <code className="text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded text-xs">RCS_PROVIDER=mock</code>
                      </p>
                    </div>
                    {[
                      { key: 'agentId', label: 'Agent ID' },
                      { key: 'apiKey', label: 'API Key' },
                      { key: 'webhookUrl', label: 'Webhook URL' },
                      { key: 'brandName', label: 'Brand Name' },
                    ].map((f) => (
                      <label key={f.key} className="block text-xs font-semibold text-gray-600">
                        {f.label}
                        <input
                          className={inputClass}
                          value={settings[f.key] || ''}
                          onChange={(e) => setSettings((s) => ({ ...s, [f.key]: e.target.value }))}
                          placeholder="—"
                        />
                      </label>
                    ))}
                    <button type="submit" className={primaryBtnClass}>
                      Save
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
