import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { logout, readSessionUser } from '../services/authService';
import {
  initializeSocket,
  onSocketEvent,
  offSocketEvent,
} from '../services/socketService';
import {
  acceptLiveSession,
  closeLiveSessionAsAgent,
  fetchAgentQueue,
  fetchLiveSessionHistory,
  fetchLiveSessionMessages,
  sendAgentLiveMessage,
} from '../services/chatbotLiveService';

function liveToUiMessages(rows) {
  return (Array.isArray(rows) ? rows : []).map((m) => ({
    id: `live-${m.id}`,
    text: m.body,
    sender: m.senderRole === 'customer' ? 'user' : m.senderRole === 'agent' ? 'agent' : 'system',
    timestamp: m.createdAt ? new Date(m.createdAt) : new Date(),
  }));
}

function initialsFromName(name) {
  const parts = String(name || 'A')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(parts[0] || 'A').slice(0, 2).toUpperCase();
}

function formatMessageTime(date) {
  try {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function formatRelativeTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60_000) return 'Just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return d.toLocaleDateString();
}

function StatusBadge({ status }) {
  const map = {
    requesting: 'bg-amber-100 text-amber-800 ring-amber-200/80',
    active: 'bg-emerald-100 text-emerald-800 ring-emerald-200/80',
    closed: 'bg-slate-100 text-slate-600 ring-slate-200/80',
  };
  const label = status === 'requesting' ? 'Waiting' : status === 'active' ? 'Live' : 'Closed';
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${map[status] || map.closed}`}
    >
      {label}
    </span>
  );
}

function EmptyInboxIllustration() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-blue-100 text-sky-600 shadow-inner ring-1 ring-sky-200/60">
        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
      <p className="text-sm font-semibold text-slate-700">No conversations here</p>
      <p className="mt-1 max-w-xs text-xs text-slate-500">
        New customer requests appear under Requesting. Accept to start helping.
      </p>
    </div>
  );
}

function ChatPlaceholder({ tab }) {
  const tabLabel = tab === 'requesting' ? 'Requesting' : tab === 'active' ? 'Active' : 'History';
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-b from-slate-50/80 to-white p-6 text-center md:p-10">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-white shadow-lg shadow-sky-900/5 ring-1 ring-slate-200/80">
        <svg className="h-10 w-10 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z"
          />
        </svg>
      </div>
      <h2 className="text-lg font-bold text-slate-800">Select a conversation</h2>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        Choose a customer from the <span className="font-medium text-sky-700">{tabLabel}</span> list to view
        messages and reply.
      </p>
    </div>
  );
}

export default function ChatbotAgentPanel() {
  const navigate = useNavigate();
  const user = readSessionUser();
  const [tab, setTab] = useState('requesting');
  const [requesting, setRequesting] = useState([]);
  const [active, setActive] = useState([]);
  const [history, setHistory] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const agentDisplayName = user?.name || user?.email || 'Agent';

  const selectedSession = useMemo(() => {
    const all = [...requesting, ...active, ...history];
    return all.find((s) => Number(s.id) === Number(selectedId)) || null;
  }, [requesting, active, history, selectedId]);

  const loadQueues = useCallback(async () => {
    try {
      const [reqRes, actRes, histRes] = await Promise.all([
        fetchAgentQueue('requesting'),
        fetchAgentQueue('active'),
        fetchAgentQueue('history'),
      ]);
      setRequesting(Array.isArray(reqRes?.sessions) ? reqRes.sessions : []);
      setActive(Array.isArray(actRes?.sessions) ? actRes.sessions : []);
      setHistory(Array.isArray(histRes?.sessions) ? histRes.sessions : []);
      setError('');
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (sessionId, closed = false) => {
    if (!sessionId) return;
    try {
      const data = closed
        ? await fetchLiveSessionHistory(sessionId)
        : await fetchLiveSessionMessages(sessionId);
      setMessages(liveToUiMessages(data?.messages));
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load messages');
    }
  }, []);

  useEffect(() => {
    loadQueues();
    const t = setInterval(loadQueues, 2000);
    return () => clearInterval(t);
  }, [loadQueues]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userId = user?.id ?? user?.userId;
    if (!token || !userId) return undefined;

    initializeSocket(userId, token);

    const onLiveRequest = () => {
      loadQueues();
    };
    const onLiveAccepted = () => {
      loadQueues();
    };

    const onActivity = (payload) => {
      const sid = payload?.sessionId;
      if (sid && Number(selectedId) === Number(sid)) {
        loadMessages(sid, false);
      }
    };

    onSocketEvent('chatbot-live:request', onLiveRequest);
    onSocketEvent('chatbot-live:accepted', onLiveAccepted);
    onSocketEvent('chatbot-live:activity', onActivity);

    return () => {
      offSocketEvent('chatbot-live:request', onLiveRequest);
      offSocketEvent('chatbot-live:accepted', onLiveAccepted);
      offSocketEvent('chatbot-live:activity', onActivity);
    };
  }, [user?.id, user?.userId, loadQueues, loadMessages, selectedId]);

  useEffect(() => {
    if (!selectedId) return undefined;
    const closed = selectedSession?.status === 'closed';
    loadMessages(selectedId, closed);
    if (closed) return undefined;
    const t = setInterval(() => loadMessages(selectedId, false), 2500);
    return () => clearInterval(t);
  }, [selectedId, selectedSession?.status, loadMessages]);

  const listForTab =
    tab === 'requesting' ? requesting : tab === 'active' ? active : history;

  const onAccept = async (sessionId) => {
    setError('');
    try {
      await acceptLiveSession(sessionId);
      setTab('active');
      setSelectedId(sessionId);
      await loadQueues();
      await loadMessages(sessionId, false);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Could not accept');
    }
  };

  const onSend = async (e) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !selectedId || sending) return;
    setSending(true);
    try {
      await sendAgentLiveMessage(selectedId, text);
      setInput('');
      await loadMessages(selectedId, false);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const onCloseSession = async () => {
    if (!selectedId) return;
    try {
      await closeLiveSessionAsAgent(selectedId);
      await loadQueues();
      setSelectedId(null);
      setMessages([]);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Could not close session');
    }
  };

  const onLogout = () => {
    logout();
    navigate('/login');
  };

  const tabs = [
    { key: 'requesting', label: 'Requesting', count: requesting.length, accent: 'amber' },
    { key: 'active', label: 'Active', count: active.length, accent: 'emerald' },
    { key: 'history', label: 'History', count: history.length, accent: 'slate' },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#eef2f7]">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-sky-100/50 via-transparent to-transparent" />

      <header className="relative z-10 shrink-0 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-8 md:py-4">
          <div className="flex items-center gap-3 md:gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-600 to-blue-700 text-base font-bold text-white shadow-lg shadow-sky-600/25 ring-2 ring-white md:h-12 md:w-12 md:text-lg">
              W
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 md:text-xl">
                Chatbot Agent Desk
              </h1>
              <p className="text-xs text-slate-500 md:text-sm">WaabizX · Manual assistant console</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <div className="flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-slate-50/90 px-3 py-1.5 md:px-4 md:py-2">
              {[
                { label: 'Pending', value: requesting.length, color: 'text-amber-600' },
                { label: 'Live', value: active.length, color: 'text-emerald-600' },
                { label: 'History', value: history.length, color: 'text-slate-600' },
              ].map((stat, i) => (
                <div key={stat.label} className={`flex items-baseline gap-1.5 ${i > 0 ? 'border-l border-slate-200 pl-4' : ''}`}>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{stat.label}</span>
                  <span className={`text-lg font-bold tabular-nums leading-none ${stat.color}`}>{stat.value}</span>
                </div>
              ))}
            </div>
            <div className="hidden items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-3 py-1.5 sm:flex">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-[10px] font-bold text-white">
                {initialsFromName(agentDisplayName)}
              </div>
              <div className="text-left">
                <p className="max-w-[120px] truncate text-xs font-semibold text-slate-800">{agentDisplayName}</p>
                <p className="flex items-center gap-1 text-[10px] text-emerald-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Online
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 md:px-4 md:py-2.5"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-[1400px] flex-1 flex-col gap-3 overflow-hidden p-3 md:flex-row md:gap-5 md:p-5 md:px-8">
        <section className="flex min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/5 ring-1 ring-slate-100 md:h-full md:w-[340px] md:shrink-0 lg:w-[360px]">
          <div className="shrink-0 border-b border-slate-100 bg-slate-50/50 p-2">
            <div className="flex gap-1 rounded-xl bg-slate-100/80 p-1">
              {tabs.map(({ key, label, count }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setTab(key);
                    setSelectedId(null);
                    setMessages([]);
                  }}
                  className={`flex flex-1 flex-col items-center rounded-lg px-2 py-2.5 text-center transition ${
                    tab === key
                      ? 'bg-white text-sky-800 shadow-sm ring-1 ring-slate-200/80'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
                  <span
                    className={`mt-0.5 text-lg font-bold tabular-nums ${tab === key ? 'text-sky-600' : 'text-slate-400'}`}
                  >
                    {count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <div className="mx-3 mt-2 shrink-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {error}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain scroll-smooth">
            {loading ? (
              <div className="space-y-3 p-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse rounded-xl bg-slate-100 p-4">
                    <div className="h-3 w-2/3 rounded bg-slate-200" />
                    <div className="mt-2 h-2 w-1/2 rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : listForTab.length === 0 ? (
              <EmptyInboxIllustration />
            ) : (
              <ul className="divide-y divide-slate-100 p-2">
                {listForTab.map((s) => {
                  const name = s.customerName || `Customer #${s.customerUserId}`;
                  const selected = Number(selectedId) === Number(s.id);
                  return (
                    <li key={s.id} className="py-1">
                      <div
                        className={`rounded-xl border transition ${
                          selected
                            ? 'border-sky-200 bg-sky-50/80 shadow-sm ring-1 ring-sky-100'
                            : 'border-transparent hover:border-slate-200 hover:bg-slate-50/80'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(s.id)}
                          className="flex w-full items-start gap-3 px-3 py-3 text-left"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-300 text-xs font-bold text-slate-700">
                            {initialsFromName(name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate font-semibold text-slate-900">{name}</p>
                              <StatusBadge status={s.status} />
                            </div>
                            <p className="mt-0.5 text-xs text-slate-500">
                              Project {s.projectId}
                              {s.lastMessageAt ? ` · ${formatRelativeTime(s.lastMessageAt)}` : ''}
                            </p>
                          </div>
                        </button>
                        {tab === 'requesting' ? (
                          <div className="border-t border-slate-100/80 px-3 pb-3 pt-0">
                            <button
                              type="button"
                              onClick={() => onAccept(s.id)}
                              className="mt-2 w-full rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 py-2 text-xs font-bold uppercase tracking-wide text-white shadow-md shadow-emerald-600/20 transition hover:from-emerald-500 hover:to-teal-500"
                            >
                              Accept chat
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xl shadow-slate-900/5 ring-1 ring-slate-100">
          {!selectedId ? (
            <ChatPlaceholder tab={tab} />
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-sky-600 via-sky-600 to-blue-700 px-4 py-3 text-white md:px-5 md:py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-bold ring-2 ring-white/30">
                    {initialsFromName(selectedSession?.customerName || 'C')}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold">
                      {selectedSession?.customerName || `Customer #${selectedSession?.customerUserId}`}
                    </p>
                    <p className="text-xs font-medium text-sky-100/90">
                      Session #{selectedId} · Project {selectedSession?.projectId}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={selectedSession?.status} />
                  {selectedSession?.status === 'active' ? (
                    <button
                      type="button"
                      onClick={onCloseSession}
                      className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white ring-1 ring-white/25 transition hover:bg-white/25"
                    >
                      End chat
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain scroll-smooth bg-gradient-to-b from-slate-50/90 via-white to-slate-50/50 p-4 md:p-5">
                {messages.length === 0 ? (
                  <p className="text-center text-sm text-slate-400">No messages yet.</p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.sender === 'user' ? 'justify-start' : m.sender === 'agent' ? 'justify-end' : 'justify-center'}`}
                    >
                      <div
                        className={`max-w-[min(85%,420px)] ${
                          m.sender === 'user'
                            ? 'rounded-2xl rounded-bl-md bg-white px-4 py-3 text-sm text-slate-800 shadow-md ring-1 ring-slate-200/80'
                            : m.sender === 'agent'
                              ? 'rounded-2xl rounded-br-md bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-3 text-sm text-white shadow-lg shadow-sky-600/20'
                              : 'rounded-xl bg-amber-50 px-4 py-2 text-center text-xs italic text-amber-900 ring-1 ring-amber-100'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words leading-relaxed">{m.text}</p>
                        {m.sender !== 'system' ? (
                          <p
                            className={`mt-2 text-[10px] tabular-nums ${
                              m.sender === 'agent' ? 'text-sky-100/80' : 'text-slate-400'
                            }`}
                          >
                            {formatMessageTime(m.timestamp)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {selectedSession?.status === 'active' ? (
                <form
                  onSubmit={onSend}
                  className="shrink-0 border-t border-slate-100 bg-white p-3 shadow-[0_-4px_24px_rgba(15,23,42,0.04)] md:p-4"
                >
                  <div className="flex gap-3">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Type your reply to the customer…"
                      className="flex-1 rounded-xl border-2 border-slate-200 bg-slate-50/50 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:bg-white focus:ring-4 focus:ring-sky-500/10 disabled:opacity-50"
                      disabled={sending}
                    />
                    <button
                      type="submit"
                      disabled={sending || !input.trim()}
                      className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/25 transition hover:from-sky-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {sending ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                      )}
                      Send
                    </button>
                  </div>
                </form>
              ) : (
                <div className="shrink-0 border-t border-slate-100 bg-slate-50/80 px-4 py-3 text-center">
                  <p className="text-xs font-medium text-slate-500">
                    {selectedSession?.status === 'closed'
                      ? 'This session is closed — transcript is read-only.'
                      : 'Accept this request from the list to start chatting.'}
                  </p>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
