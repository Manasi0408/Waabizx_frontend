import { useCallback, useEffect, useState } from 'react';
import { logout } from '../services/authService';
import {
  acceptAgentSession,
  closeAgentSession,
  fetchSessionMessages,
  listAgentSessions,
  sendAgentSessionMessage,
} from '../api/chatbotAgentApi';

const TABS = [
  { id: 'requesting', label: 'Requesting' },
  { id: 'active', label: 'Active' },
  { id: 'closed', label: 'History' },
];

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function mapApiMessage(row) {
  return {
    id: row.id,
    body: row.body,
    senderRole: row.senderRole,
    createdAt: row.createdAt,
  };
}

export default function ChatbotAgentPanel() {
  const [tab, setTab] = useState('requesting');
  const [sessions, setSessions] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [sessionDetail, setSessionDetail] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const user = (() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();
  const userName = user?.name || 'Chatbot Agent';

  const loadSessions = useCallback(async () => {
    setLoadingList(true);
    setError('');
    try {
      const data = await listAgentSessions(tab);
      const list = Array.isArray(data?.sessions) ? data.sessions : [];
      setSessions(list);
      if (list.length && !list.some((s) => s.id === selectedId)) {
        setSelectedId(null);
        setSessionDetail(null);
        setMessages([]);
      }
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load sessions');
      setSessions([]);
    } finally {
      setLoadingList(false);
    }
  }, [tab, selectedId]);

  const loadMessages = useCallback(async (sessionId) => {
    if (!sessionId) return;
    try {
      const data = await fetchSessionMessages(sessionId);
      setSessionDetail(data?.session || null);
      setMessages((Array.isArray(data?.messages) ? data.messages : []).map(mapApiMessage));
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load messages');
    }
  }, []);

  useEffect(() => {
    loadSessions();
    const id = setInterval(loadSessions, 8000);
    return () => clearInterval(id);
  }, [loadSessions]);

  useEffect(() => {
    if (!selectedId) return undefined;
    loadMessages(selectedId);
    const id = setInterval(() => loadMessages(selectedId), 4000);
    return () => clearInterval(id);
  }, [selectedId, loadMessages]);

  const handleSelect = (session) => {
    setSelectedId(session.id);
    setDraft('');
    loadMessages(session.id);
  };

  const handleAccept = async () => {
    if (!selectedId) return;
    setBusy(true);
    setError('');
    try {
      const data = await acceptAgentSession(selectedId);
      setSessionDetail(data?.session || null);
      setMessages((Array.isArray(data?.messages) ? data.messages : []).map(mapApiMessage));
      setTab('active');
      await loadSessions();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Could not accept session');
    } finally {
      setBusy(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !selectedId || sessionDetail?.status !== 'active') return;
    setBusy(true);
    setError('');
    try {
      const data = await sendAgentSessionMessage(selectedId, text);
      if (data?.message) {
        setMessages((prev) => [...prev, mapApiMessage(data.message)]);
      }
      setDraft('');
      if (data?.session) setSessionDetail(data.session);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Send failed');
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async () => {
    if (!selectedId) return;
    setBusy(true);
    try {
      await closeAgentSession(selectedId);
      setSelectedId(null);
      setSessionDetail(null);
      setMessages([]);
      setTab('closed');
      await loadSessions();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Could not close chat');
    } finally {
      setBusy(false);
    }
  };

  const canChat = sessionDetail?.status === 'active';
  const canAccept = sessionDetail?.status === 'requesting';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/40 to-white">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-600">WaabizX</p>
            <h1 className="text-xl font-bold text-slate-900">Chatbot Agent</h1>
            <p className="text-sm text-slate-500">Signed in as {userName}</p>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 px-4 py-6 sm:px-6 lg:grid-cols-[320px_1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex border-b border-slate-100">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setSelectedId(null);
                  setSessionDetail(null);
                  setMessages([]);
                }}
                className={`flex-1 px-2 py-3 text-xs font-semibold sm:text-sm ${
                  tab === t.id
                    ? 'border-b-2 border-sky-600 text-sky-700'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-2">
            {loadingList && sessions.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Loading…</p>
            ) : null}
            {!loadingList && sessions.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">No conversations here.</p>
            ) : null}
            {sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelect(s)}
                className={`mb-2 w-full rounded-xl border px-3 py-3 text-left transition ${
                  selectedId === s.id
                    ? 'border-sky-300 bg-sky-50'
                    : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                <p className="truncate text-sm font-semibold text-slate-900">
                  {s.customerName || `Customer #${s.customerUserId}`}
                </p>
                <p className="text-xs text-slate-500">Project {s.projectId}</p>
                <p className="mt-1 text-[11px] text-slate-400">{formatWhen(s.lastMessageAt || s.updatedAt)}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="flex min-h-[480px] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-500">
              Select a conversation to view messages.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {sessionDetail?.customerName || `Customer #${sessionDetail?.customerUserId || ''}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    Status: <span className="font-medium capitalize">{sessionDetail?.status}</span>
                    {sessionDetail?.projectId ? ` · Project ${sessionDetail.projectId}` : null}
                  </p>
                </div>
                <div className="flex gap-2">
                  {canAccept ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleAccept}
                      className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                    >
                      Accept chat
                    </button>
                  ) : null}
                  {canChat ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleClose}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      End chat
                    </button>
                  ) : null}
                </div>
              </div>

              {error ? (
                <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              ) : null}

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((m) => {
                  const isCustomer = m.senderRole === 'customer';
                  const isSystem = m.senderRole === 'system';
                  return (
                    <div
                      key={m.id}
                      className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                          isSystem
                            ? 'mx-auto bg-slate-100 text-slate-600 italic'
                            : isCustomer
                              ? 'bg-slate-100 text-slate-800'
                              : 'bg-sky-600 text-white'
                        }`}
                      >
                        {!isSystem && !isCustomer ? (
                          <p className="mb-0.5 text-[10px] font-semibold uppercase opacity-80">You</p>
                        ) : null}
                        {isCustomer ? (
                          <p className="mb-0.5 text-[10px] font-semibold uppercase text-slate-500">Customer</p>
                        ) : null}
                        <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        <p className="mt-1 text-[10px] opacity-70">{formatWhen(m.createdAt)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {canChat ? (
                <form onSubmit={handleSend} className="border-t border-slate-100 p-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Reply to customer…"
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                      disabled={busy}
                    />
                    <button
                      type="submit"
                      disabled={busy || !draft.trim()}
                      className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </form>
              ) : null}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
