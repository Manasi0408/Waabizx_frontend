import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { isAuthenticated } from '../services/authService';
import { sendAIMessage } from '../api/aiApi';
import { resolveActiveProjectId } from '../utils/activeProject';
import {
  endCustomerLiveSession,
  fetchMyLiveSession,
  requestManualAgent,
  sendCustomerLiveMessage,
  fetchLiveSessionHistory,
} from '../services/chatbotLiveService';
import {
  initializeSocket,
  onSocketEvent,
  offSocketEvent,
} from '../services/socketService';

const STORAGE_PREFIX = 'waabizx.ai-chat.v1';

function createWelcomeMessage() {
  return {
    id: 1,
    text: "Hello! 👋 I'm the WaabizX assistant. Ask me anything about WaabizX.",
    sender: 'bot',
    timestamp: new Date(),
  };
}

/** Stable per-account key (admin / agent / manager login). */
function readSessionAccountKey() {
  try {
    const raw = localStorage.getItem('user');
    const user = raw ? JSON.parse(raw) : null;
    const id = user?.id ?? user?.userId ?? user?.user_id;
    if (id != null && String(id).trim() !== '') {
      return `uid:${String(id).trim()}`;
    }
    const email = user?.email;
    if (email != null && String(email).trim() !== '') {
      return `email:${String(email).trim().toLowerCase()}`;
    }
  } catch {
    /* ignore */
  }
  return 'anon';
}

function chatStorageKey(projectId, accountKey) {
  const account =
    accountKey != null && String(accountKey).trim() !== ''
      ? String(accountKey).trim()
      : readSessionAccountKey();
  const pid =
    projectId != null && String(projectId).trim() !== ''
      ? String(projectId)
      : 'no-project';
  return `${STORAGE_PREFIX}:${account}:${pid}`;
}

function loadPersistedMessages(projectId, accountKey) {
  try {
    const raw = localStorage.getItem(chatStorageKey(projectId, accountKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map((m) => ({
      id: m.id,
      text: String(m.text || ''),
      sender: m.sender === 'user' ? 'user' : 'bot',
      timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
    }));
  } catch {
    return null;
  }
}

const MANUAL_HELP_INTENT_PATTERNS = [
  /\bmanual\s+(help|assist(ance)?|support)\b/i,
  /\b(manual|human|live)\s+agent\b/i,
  /\btalk\s+(to|with)\s+(a\s+)?(human|person|agent|someone|support)\b/i,
  /\bwant\s+to\s+talk\s+(with|to)\s+(a\s+)?human\b/i,
  /\b(need|want|connect)\s+(to\s+)?(a\s+)?(human|manual|live)\b/i,
  /\breal\s+person\b/i,
  /\bhuman\s+(help|support|assist)/i,
];

function messageRequestsManualHelp(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return MANUAL_HELP_INTENT_PATTERNS.some((p) => p.test(t));
}

const BOT_HUMAN_OFFER_PATTERNS = [
  /\bconnect with (a )?human\b/i,
  /\bconnect you with (a )?(human|agent|team)\b/i,
  /\bwould you like to connect with (a )?(human|agent)\b/i,
  /\bwould you like.*human agent\b/i,
  /\btalk to (a )?human (agent)?\b/i,
  /\blike to connect with.*human\b/i,
];

function textOffersHumanHelp(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  return BOT_HUMAN_OFFER_PATTERNS.some((p) => p.test(t));
}

const HUMAN_CONFIRM_PATTERNS = [
  /^yes\b/i,
  /^yeah\b/i,
  /^yep\b/i,
  /^yup\b/i,
  /^sure\b/i,
  /^ok(ay)?[!.]?$/i,
  /^please\b/i,
  /\byes[,.]?\s*(please|connect|i\s+want)/i,
  /\bi\s+want( to)?\s+(connect|talk|speak)/i,
  /\bconnect\s+me\b/i,
  /\bplease\s+connect\b/i,
  /\bgo\s+ahead\b/i,
  /\babsolutely\b/i,
  /\bdefinitely\b/i,
];

function messageConfirmsHumanHelp(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  if (messageRequestsManualHelp(t)) return true;
  return HUMAN_CONFIRM_PATTERNS.some((p) => p.test(t));
}

function messageDeclinesHumanHelp(text) {
  return /\b(no|nope|nah|not\s+now|maybe\s+later|cancel)\b/i.test(String(text || '').trim());
}

function mapLiveApiMessages(rows) {
  return (Array.isArray(rows) ? rows : []).map((m) => ({
    id: `live-${m.id}`,
    text: String(m.body || ''),
    sender:
      m.senderRole === 'customer'
        ? 'user'
        : m.senderRole === 'agent'
          ? 'agent'
          : 'system',
    timestamp: m.createdAt ? new Date(m.createdAt) : new Date(),
  }));
}

function persistMessages(projectId, accountKey, messages) {
  try {
    const payload = (Array.isArray(messages) ? messages : []).map((m) => ({
      id: m.id,
      text: m.text,
      sender: m.sender,
      timestamp:
        m.timestamp instanceof Date
          ? m.timestamp.toISOString()
          : m.timestamp || new Date().toISOString(),
    }));
    localStorage.setItem(chatStorageKey(projectId, accountKey), JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

function Chatbot() {
  const location = useLocation();
  const authed = isAuthenticated();
  const [activeProjectId, setActiveProjectId] = useState(() => resolveActiveProjectId());
  const [activeAccountKey, setActiveAccountKey] = useState(() => readSessionAccountKey());
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => {
    const stored = loadPersistedMessages(
      resolveActiveProjectId(),
      readSessionAccountKey()
    );
    return stored || [createWelcomeMessage()];
  });
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [liveSession, setLiveSession] = useState(null);
  const [liveBusy, setLiveBusy] = useState(false);
  /** True only after customer confirms human help in this browser session. */
  const [showManualHelpOffer, setShowManualHelpOffer] = useState(false);
  /** Bot asked "connect with human?" — wait for yes/no before showing Manual help. */
  const [awaitingHumanConfirm, setAwaitingHumanConfirm] = useState(false);
  const aiPrefixRef = useRef(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const messagesRef = useRef(messages);
  const skipNextPersistRef = useRef(false);
  const contextRef = useRef({
    projectId: resolveActiveProjectId(),
    accountKey: readSessionAccountKey(),
  });

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const applyContextSwitch = useCallback((nextProjectId, nextAccountKey) => {
    const prev = contextRef.current;
    const projectSame = String(prev.projectId ?? '') === String(nextProjectId ?? '');
    const accountSame = String(prev.accountKey ?? '') === String(nextAccountKey ?? '');
    if (projectSame && accountSame) {
      return;
    }

    persistMessages(prev.projectId, prev.accountKey, messagesRef.current);

    contextRef.current = { projectId: nextProjectId, accountKey: nextAccountKey };
    setActiveProjectId(nextProjectId);
    setActiveAccountKey(nextAccountKey);

    skipNextPersistRef.current = true;
    setLiveSession(null);
    aiPrefixRef.current = null;
    setShowManualHelpOffer(false);
    setAwaitingHumanConfirm(false);
    const stored = loadPersistedMessages(nextProjectId, nextAccountKey);
    setMessages(stored || [createWelcomeMessage()]);
    setInputMessage('');
  }, []);

  const syncContext = useCallback(() => {
    if (!isAuthenticated()) {
      return;
    }
    applyContextSwitch(resolveActiveProjectId(), readSessionAccountKey());
  }, [applyContextSwitch]);

  useEffect(() => {
    if (!authed) {
      skipNextPersistRef.current = true;
      return;
    }
    syncContext();
  }, [authed, location.pathname, location.key, syncContext]);

  useEffect(() => {
    window.addEventListener('waabiz-project-changed', syncContext);
    return () => {
      window.removeEventListener('waabiz-project-changed', syncContext);
    };
  }, [syncContext]);

  useEffect(() => {
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    const ctx = contextRef.current;
    if (
      String(activeProjectId ?? '') !== String(ctx.projectId ?? '') ||
      String(activeAccountKey ?? '') !== String(ctx.accountKey ?? '')
    ) {
      return;
    }
    persistMessages(activeProjectId, activeAccountKey, messages);
  }, [messages, activeProjectId, activeAccountKey]);

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isTyping]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  const finishLiveSession = useCallback(() => {
    setLiveSession(null);
    aiPrefixRef.current = null;
    setShowManualHelpOffer(false);
    setAwaitingHumanConfirm(false);
  }, []);

  const mergeLiveIntoView = useCallback(
    (apiMessages, session) => {
      const prefix = aiPrefixRef.current;
      const liveRows = mapLiveApiMessages(apiMessages);
      if (Array.isArray(prefix)) {
        setMessages([...prefix, ...liveRows]);
      } else {
        setMessages((prev) => {
          const kept = prev.filter((m) => !String(m.id).startsWith('live-'));
          return [...kept, ...liveRows];
        });
      }
      if (!session?.id) return;
      if (session.status === 'closed') {
        finishLiveSession();
        return;
      }
      setLiveSession({ id: session.id, status: session.status });
      setShowManualHelpOffer(false);
      setAwaitingHumanConfirm(false);
    },
    [finishLiveSession]
  );

  const loadClosedSessionTranscript = useCallback(
    async (sessionId) => {
      if (!sessionId) return;
      try {
        const hist = await fetchLiveSessionHistory(sessionId);
        mergeLiveIntoView(hist?.messages || [], { id: sessionId, status: 'closed' });
      } catch {
        finishLiveSession();
      }
    },
    [mergeLiveIntoView, finishLiveSession]
  );

  const refreshLiveSession = useCallback(async () => {
    if (!resolveActiveProjectId()) return;
    try {
      const data = await fetchMyLiveSession();
      const session = data?.session;
      if (!session?.id) {
        if (liveSession?.id) {
          await loadClosedSessionTranscript(liveSession.id);
        }
        return;
      }
      mergeLiveIntoView(data?.messages, session);
    } catch {
      /* ignore poll errors */
    }
  }, [liveSession?.id, mergeLiveIntoView, loadClosedSessionTranscript]);

  useEffect(() => {
    if (!authed) return undefined;
    refreshLiveSession();
  }, [authed, activeProjectId, refreshLiveSession]);

  useEffect(() => {
    if (!authed || !isOpen) return undefined;
    refreshLiveSession();
    if (!liveSession?.id) return undefined;
    const t = setInterval(refreshLiveSession, 3000);
    return () => clearInterval(t);
  }, [authed, isOpen, liveSession?.id, refreshLiveSession]);

  useEffect(() => {
    if (!authed) return undefined;
    const token = localStorage.getItem('token');
    let userId = null;
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        userId = u?.id ?? u?.userId;
      }
    } catch {
      /* ignore */
    }
    if (!token || !userId) return undefined;

    initializeSocket(userId, token);

    const onSessionUpdate = (payload) => {
      if (payload?.session) {
        mergeLiveIntoView(payload.messages || [], payload.session);
      } else {
        refreshLiveSession();
      }
    };
    const onActivity = () => {
      refreshLiveSession();
    };
    const onSessionEnded = (payload) => {
      const sid = payload?.sessionId;
      if (sid) {
        loadClosedSessionTranscript(sid);
      } else {
        finishLiveSession();
      }
      refreshLiveSession();
    };

    onSocketEvent('chatbot-live:session-update', onSessionUpdate);
    onSocketEvent('chatbot-live:activity', onActivity);
    onSocketEvent('chatbot-live:session-ended', onSessionEnded);

    return () => {
      offSocketEvent('chatbot-live:session-update', onSessionUpdate);
      offSocketEvent('chatbot-live:activity', onActivity);
      offSocketEvent('chatbot-live:session-ended', onSessionEnded);
    };
  }, [authed, mergeLiveIntoView, refreshLiveSession, finishLiveSession, loadClosedSessionTranscript]);

  const handleRequestManualAgent = async () => {
    if (liveBusy || liveSession?.status === 'requesting' || liveSession?.status === 'active') {
      return;
    }
    setLiveBusy(true);
    try {
      aiPrefixRef.current = messagesRef.current.filter((m) => !String(m.id).startsWith('live-'));
      const data = await requestManualAgent();
      setShowManualHelpOffer(false);
      setAwaitingHumanConfirm(false);
      mergeLiveIntoView(data?.messages, data?.session);
    } catch (error) {
      const errText =
        error?.response?.data?.message ||
        error?.message ||
        'Could not request a manual assistant. Try again.';
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          text: errText,
          sender: 'system',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLiveBusy(false);
    }
  };

  const handleEndLiveChat = async () => {
    if (!liveSession?.id || liveBusy) return;
    setLiveBusy(true);
    try {
      await endCustomerLiveSession(liveSession.id);
      finishLiveSession();
      await refreshLiveSession();
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          text:
            error?.response?.data?.message ||
            error?.message ||
            'Could not end the session.',
          sender: 'system',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLiveBusy(false);
    }
  };

  const inLiveChat =
    liveSession?.status === 'requesting' || liveSession?.status === 'active';

  const showManualHelpButton = showManualHelpOffer && !inLiveChat;

  const handleSendMessage = async (e) => {
    e.preventDefault();
    const text = inputMessage.trim();
    if (!text || isTyping) return;

    const userMessage = {
      id: Date.now(),
      text,
      sender: 'user',
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');

    if (messageRequestsManualHelp(text)) {
      setShowManualHelpOffer(true);
      setAwaitingHumanConfirm(false);
    } else if (awaitingHumanConfirm) {
      if (messageConfirmsHumanHelp(text)) {
        setShowManualHelpOffer(true);
        setAwaitingHumanConfirm(false);
      } else if (messageDeclinesHumanHelp(text)) {
        setAwaitingHumanConfirm(false);
        setShowManualHelpOffer(false);
      }
    }

    setIsTyping(true);

    try {
      if (inLiveChat && liveSession?.id) {
        await sendCustomerLiveMessage(liveSession.id, text);
        await refreshLiveSession();
        return;
      }

      const data = await sendAIMessage(text);
      const replyText =
        data?.success && data?.reply
          ? String(data.reply)
          : "Sorry, I couldn't generate a reply. Please try again.";

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          text: replyText,
          sender: 'bot',
          timestamp: new Date(),
        },
      ]);
      if (textOffersHumanHelp(replyText)) {
        setAwaitingHumanConfirm(true);
        setShowManualHelpOffer(false);
      }
    } catch (error) {
      console.error('Error sending AI message:', error);
      const errText =
        error?.response?.data?.message ||
        "Sorry, I'm having trouble connecting right now. Please try again later.";
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          text: errText,
          sender: 'bot',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(e);
    }
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!authed) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-[100]">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="relative flex items-center justify-center rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 p-3.5 text-white shadow-xl shadow-sky-600/40 ring-2 ring-white/30 transition-all duration-300 hover:scale-110 hover:shadow-2xl hover:shadow-sky-500/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 focus-visible:ring-offset-2"
          aria-label="Open chatbot"
        >
          <svg className="relative z-[1] h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="absolute inset-0 rounded-full bg-sky-400/30 animate-ping opacity-40" aria-hidden />
        </button>
      )}

      {isOpen && (
        <div className="flex h-[600px] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] animate-fade-in-up flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-2xl shadow-sky-900/15 ring-1 ring-gray-100/90 sm:w-96">
          <div className="relative flex items-center justify-between rounded-t-2xl bg-gradient-to-r from-sky-600 via-sky-600 to-blue-700 px-4 py-4 text-white shadow-md shadow-sky-900/20 sm:px-5 sm:py-5">
            <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/25" aria-hidden />
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 shadow-inner ring-1 ring-white/30 backdrop-blur-sm sm:h-12 sm:w-12">
                <svg className="h-6 w-6 sm:h-7 sm:w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-[15px] font-bold tracking-tight sm:text-base">WaabizX Assistant</h3>
                <p className="text-xs font-medium text-sky-100/95">
                  {inLiveChat
                    ? liveSession?.status === 'active'
                      ? 'Live · manual assistant'
                      : 'Waiting for an agent…'
                    : 'Powered by AI'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="shrink-0 rounded-full p-2 text-white/95 transition-all hover:bg-white/15 active:scale-95"
              aria-label="Close chatbot"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-gradient-to-b from-sky-50/60 via-white to-gray-50/80 p-4 sm:p-5">
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className="animate-fade-in">
                  <div
                    className={`mb-2 flex ${
                      message.sender === 'user'
                        ? 'justify-end'
                        : message.sender === 'system'
                          ? 'justify-center'
                          : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm transition-all duration-200 sm:max-w-[85%] ${
                        message.sender === 'user'
                          ? 'rounded-br-md bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-md shadow-sky-600/25 ring-1 ring-sky-500/30'
                          : message.sender === 'agent'
                            ? 'rounded-bl-md border border-emerald-100 bg-emerald-50/90 text-gray-800 ring-1 ring-emerald-100/80'
                            : message.sender === 'system'
                              ? 'rounded-xl bg-amber-50/90 px-3 py-2 text-xs italic text-amber-900 ring-1 ring-amber-100/80'
                              : 'rounded-bl-md border border-gray-100/90 bg-white/95 text-gray-800 ring-1 ring-gray-100/80'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>
                      <p
                        className={`mt-2 text-[11px] tabular-nums ${
                          message.sender === 'user' ? 'text-sky-100/90' : 'text-gray-400'
                        }`}
                      >
                        {formatTime(message.timestamp)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {isTyping && (
                <div className="flex justify-start animate-fade-in">
                  <div className="rounded-2xl rounded-bl-md border border-gray-100/90 bg-white/95 px-5 py-3 shadow-sm ring-1 ring-gray-100/80">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-sky-500" style={{ animationDelay: '0ms' }} />
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-sky-500" style={{ animationDelay: '150ms' }} />
                      <span className="h-2.5 w-2.5 animate-bounce rounded-full bg-sky-500" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="rounded-b-2xl border-t border-gray-100/90 bg-gradient-to-r from-white via-sky-50/20 to-white p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] sm:p-4">
            <form onSubmit={handleSendMessage} className="flex gap-2 sm:gap-3">
              <div className="relative min-w-0 flex-1">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={
                    inLiveChat ? 'Message the manual assistant…' : 'Ask about WaabizX…'
                  }
                  className="w-full rounded-xl border-2 border-gray-200/90 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none transition-all placeholder:text-gray-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-500/15 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:py-3"
                  disabled={isTyping}
                />
              </div>
              {inLiveChat ? (
                <button
                  type="button"
                  onClick={handleEndLiveChat}
                  disabled={liveBusy || isTyping}
                  className="shrink-0 rounded-xl border-2 border-red-200 bg-white px-2.5 py-2 text-[11px] font-bold leading-tight text-red-700 shadow-sm transition-all hover:border-red-300 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:py-2.5 sm:text-xs"
                  title="End live chat with agent"
                >
                  End
                  <span className="hidden sm:inline"> live</span>
                </button>
              ) : showManualHelpButton ? (
                <button
                  type="button"
                  onClick={handleRequestManualAgent}
                  disabled={liveBusy || isTyping}
                  className="shrink-0 rounded-xl border-2 border-sky-200 bg-white px-2.5 py-2 text-[11px] font-bold leading-tight text-sky-700 shadow-sm transition-all hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3 sm:py-2.5 sm:text-xs"
                  title="Connect with a human agent"
                >
                  Manual
                  <span className="hidden sm:inline"> help</span>
                </button>
              ) : null}
              <button
                type="submit"
                disabled={!inputMessage.trim() || isTyping}
                className="flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2.5 text-white shadow-lg shadow-sky-600/25 transition-all hover:from-sky-500 hover:to-blue-500 hover:shadow-xl active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none sm:px-5 sm:py-3"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Chatbot;
