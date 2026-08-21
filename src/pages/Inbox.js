import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import BrandLogoMark from '../components/BrandLogoMark';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import InfiniteScroll from 'react-infinite-scroll-component';
import { getProfile, isAuthenticated, logout, readSessionUser } from '../services/authService';
import { getNotifications, markAsRead as markNotificationAsRead, markAllAsRead } from '../services/notificationService';
import { getInboxList, getContactMessages, sendMessage, markAsRead } from '../services/inboxService';
import { getConversationQuota } from '../services/dashboardService';
import { sendMetaMessage, getAllMetaMessages, getWebhookLogs } from '../services/metaMessageService';
import { initializeSocket, disconnectSocket, joinContactRoom, leaveContactRoom, sendTypingStart, sendTypingStop, onSocketEvent, offSocketEvent } from '../services/socketService';
import { getPaginatedMessages, sendTemplateMessage } from '../services/messageService';
import { uploadMedia, sendMediaMessage } from '../services/mediaService';
import { sendChatbotMessage } from '../services/chatbotService';
import { getTemplates } from '../services/templateService';
import { getManagerRequesting, getUnassignedRequestingChats, assignChatToAgent, interveneByPhone, acceptChat, assignAgentTakeover, closeChat } from '../api/chatApi';
import axios from '../api/axios';
import MainSidebarNav from '../components/MainSidebarNav';
import AppShellSidebar from '../components/AppShellSidebar';
import AdminHeaderProjectSwitch from '../components/AdminHeaderProjectSwitch';
import HeaderRightActions from '../components/HeaderRightActions';
import ContactTagsBar from '../components/ContactTagsBar';
import ChatMessageItem from '../components/ChatMessageItem';
import InsertMessagePreview from '../components/InsertMessagePreview';
import ResolveDispositionModal from '../components/ResolveDispositionModal';
import { getDispositionLabel } from '../constants/resolveDispositions';
import { fetchTags } from '../services/tagService';
import {
  buildTemplatePreview,
  normalizeTemplateKey,
  extractTemplateHeaderMediaUrl,
  templateHasImageHeader,
  templateNeedsHeaderMedia,
} from '../utils/whatsappTemplatePreview';
import { mergeChatMessages, messagesMatchForDedupe, messageHasTemplateCard, dedupeChatMessages } from '../utils/mergeChatMessages';
import { getApiOrigin } from '../utils/apiBase';

const API_BASE = `${getApiOrigin()}/`;
const INTERVENED_STORAGE_KEY = 'inboxIntervenedPhones';

const normalizePhoneKey = (phone) => String(phone || '').replace(/\D/g, '');

/** Match conversation ↔ contact phones even if one has country code (91…) and the other does not. */
function phonesMatchKey(a, b) {
  const da = normalizePhoneKey(a);
  const db = normalizePhoneKey(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const ta = da.length > 10 ? da.slice(-10) : da;
  const tb = db.length > 10 ? db.slice(-10) : db;
  return ta.length >= 10 && tb.length >= 10 && ta === tb;
}

function phoneLookupKeys(phone) {
  const d = normalizePhoneKey(phone);
  if (!d) return [];
  const keys = [d];
  if (d.length > 10) keys.push(d.slice(-10));
  return [...new Set(keys)];
}

function parseInboxTimestamp(value) {
  if (!value) return 0;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const raw = String(value).trim();
  if (!raw) return 0;
  // MySQL "YYYY-MM-DD HH:mm:ss" → ISO-ish for reliable Date parsing
  const normalized = /^\d{4}-\d{2}-\d{2} /.test(raw) ? raw.replace(' ', 'T') : raw;
  const t = new Date(normalized).getTime();
  if (!Number.isNaN(t)) return t;
  const t2 = new Date(raw).getTime();
  return Number.isNaN(t2) ? 0 : t2;
}

const INBOX_FILTER_ATTRS = [
  { value: 'intervened', label: 'Intervened' },
  { value: 'intervened_by_agent', label: 'Intervened by agent' },
  { value: 'tags', label: 'Tags' },
  { value: 'opted_in', label: 'Opted In' },
];

function newInboxFilterAttrRow() {
  return {
    id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    attribute: '',
    operator: 'is',
    value: '',
    join: 'and',
  };
}

function emptyInboxFilterDraft() {
  return {
    lastSeenPreset: '',
    lastSeenFrom: '',
    lastSeenTo: '',
    createdPreset: '',
    createdFrom: '',
    createdTo: '',
    attrs: [newInboxFilterAttrRow()],
  };
}

function cloneInboxFilterDraft(src) {
  const base = src || emptyInboxFilterDraft();
  return {
    ...base,
    attrs: (base.attrs || [newInboxFilterAttrRow()]).map((r) => ({ ...r })),
  };
}

function toDateInputValue(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function resolveInboxDateRange(preset, fromStr, toStr, presetKind) {
  const now = new Date();
  let from = null;
  let to = null;

  // Prefer preset when set (from/to may be mirror values for display only)
  if (preset) {
    to = new Date(now);
    to.setHours(23, 59, 59, 999);
    from = new Date(now);
    if (presetKind === 'lastSeen' && preset === '24h') {
      from = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (preset === 'today') {
      from.setHours(0, 0, 0, 0);
    } else if (preset === 'week') {
      const day = from.getDay();
      from.setDate(from.getDate() - day);
      from.setHours(0, 0, 0, 0);
    } else if (preset === 'month') {
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
    } else {
      from = null;
      to = null;
    }
    return { from, to };
  }

  if (fromStr) {
    const d = new Date(`${fromStr}T00:00:00`);
    if (!Number.isNaN(d.getTime())) from = d;
  }
  if (toStr) {
    const d = new Date(`${toStr}T23:59:59.999`);
    if (!Number.isNaN(d.getTime())) to = d;
  }
  return { from, to };
}

function countInboxAppliedFilters(applied) {
  if (!applied) return 0;
  let n = 0;
  if (applied.lastSeenPreset || applied.lastSeenFrom || applied.lastSeenTo) n += 1;
  if (applied.createdPreset || applied.createdFrom || applied.createdTo) n += 1;
  (applied.attrs || []).forEach((row) => {
    if (row?.attribute && String(row.value ?? '') !== '') n += 1;
  });
  return n;
}

function readAgentPickupAllowed(user) {
  try {
    const perms = user?.permissions;
    if (!perms) return true;
    const parsed = typeof perms === 'string' ? JSON.parse(perms) : perms;
    if (!parsed || typeof parsed !== 'object') return true;
    if ('inbox' in parsed || 'liveChat' in parsed) {
      return Boolean(parsed.inbox || parsed.liveChat);
    }
    return true;
  } catch {
    return true;
  }
}

function personalizeSystemText(text, userName) {
  const raw = String(userName || '').trim();
  if (!raw || !text) return text;
  let out = String(text);
  for (const name of [raw, raw.toUpperCase(), raw.toLowerCase()]) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\bby ${esc}\\b`, 'i'), 'by you');
    out = out.replace(new RegExp(`\\bto ${esc}\\b`, 'i'), 'to you');
    out = out.replace(new RegExp(`\\bfrom ${esc}\\b`, 'i'), 'from you');
  }
  return out;
}

function mergeInboxIntoRequesting(apiRows, inboxList) {
  const byKey = new Map();
  (apiRows || []).forEach((row) => {
    const key = normalizePhoneKey(row.phone);
    if (key) byKey.set(key, row);
  });
  (inboxList || []).forEach((c) => {
    const key = normalizePhoneKey(c.phone);
    if (!key || byKey.has(key)) return;
    const status = String(c.chatStatus || '').toLowerCase();
    if (status === 'intervened' || status === 'closed') return;
    if (!c.hasCustomerReply) return;
    byKey.set(key, {
      id: c.conversationId || null,
      contactId: c.contactId ?? c.id ?? null,
      phone: c.phone,
      customer_name: c.name || c.phone,
      last_message: c.lastMessage || '',
      last_message_time: c.lastMessageTime,
      unread_count: c.unreadCount || 0,
      status: 'requesting',
    });
  });
  return [...byKey.values()].sort((a, b) => {
    const ta = new Date(a.last_message_time || 0).getTime();
    const tb = new Date(b.last_message_time || 0).getTime();
    return tb - ta;
  });
}

function mergeInboxIntoActive(apiRows, inboxList) {
  const byKey = new Map();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  (apiRows || []).forEach((row) => {
    const key = normalizePhoneKey(row.phone);
    if (key) byKey.set(key, row);
  });
  (inboxList || []).forEach((c) => {
    const key = normalizePhoneKey(c.phone);
    if (!key || byKey.has(key)) return;
    const ts = new Date(c.lastMessageTime || 0).getTime();
    if (!ts || ts < cutoff) return;
    const status = String(c.chatStatus || '').toLowerCase();
    if (status === 'closed' || status === 'intervened' || status === 'requesting') return;
    byKey.set(key, {
      id: c.conversationId || null,
      contactId: c.contactId ?? c.id ?? null,
      phone: c.phone,
      customer_name: c.name || c.phone,
      last_message: c.lastMessage || '',
      last_message_time: c.lastMessageTime,
      unread_count: c.unreadCount || 0,
      status: status || 'active',
    });
  });
  return [...byKey.values()].sort((a, b) => {
    const ta = new Date(a.last_message_time || 0).getTime();
    const tb = new Date(b.last_message_time || 0).getTime();
    return tb - ta;
  });
}

function mergeInboxIntoHistory(apiRows, inboxList) {
  const byKey = new Map();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  (apiRows || []).forEach((row) => {
    const key = normalizePhoneKey(row.phone);
    if (key) byKey.set(key, row);
  });
  (inboxList || []).forEach((c) => {
    const key = normalizePhoneKey(c.phone);
    if (!key || byKey.has(key)) return;
    const ts = new Date(c.lastMessageTime || 0).getTime();
    if (!ts || ts >= cutoff) return;
    byKey.set(key, {
      id: c.conversationId || null,
      contactId: c.contactId ?? c.id ?? null,
      phone: c.phone,
      customer_name: c.name || c.phone,
      last_message: c.lastMessage || '',
      last_message_time: c.lastMessageTime,
      unread_count: 0,
      status: 'history',
    });
  });
  return [...byKey.values()].sort((a, b) => {
    const ta = new Date(a.last_message_time || 0).getTime();
    const tb = new Date(b.last_message_time || 0).getTime();
    return tb - ta;
  });
}

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker']);

function mapMetaMessageToInbox(metaMsg) {
  const msgType = String(metaMsg.message_type || metaMsg.messageType || 'text').toLowerCase();
  const rawText = String(metaMsg.text || metaMsg.message_text || '').trim();
  const isMedia = MEDIA_TYPES.has(msgType);
  const looksLikeUrl = /^https?:\/\//i.test(rawText);
  const isTemplate =
    msgType === 'template' ||
    Boolean(metaMsg.isTemplateSend) ||
    /^Template:\s*\S+/i.test(rawText) ||
    /^\[Template\]\s*\S+/i.test(rawText);
  const templateName =
    metaMsg.templateName ||
    metaMsg.template_name ||
    (rawText.match(/^Template:\s*(.+)$/i)?.[1]?.trim() ||
      rawText.match(/^\[Template\]\s*(.+)$/i)?.[1]?.trim() ||
      null);
  return {
    id: `meta_${metaMsg.id}`,
    content: isMedia && !looksLikeUrl && rawText.startsWith('[') ? '' : rawText,
    type: metaMsg.direction === 'inbound' ? 'incoming' : 'outgoing',
    status: metaMsg.status === 'received' ? 'delivered' : metaMsg.status,
    sentAt: metaMsg.created_at,
    createdAt: metaMsg.created_at,
    metaMessageId: metaMsg.id,
    messageType: msgType,
    mediaType: isMedia ? msgType : 'text',
    mediaUrl: isMedia && looksLikeUrl ? rawText : null,
    source: 'meta_message',
    isTemplate,
    isTemplateSend: isTemplate,
    templateName,
    reactions: Array.isArray(metaMsg.reactions) ? metaMsg.reactions : [],
  };
}

function resolveMediaSrc(mediaUrl) {
  if (!mediaUrl) return '';
  const raw = String(mediaUrl).trim();
  if (/^https?:\/\//i.test(raw)) return raw;
  const base = API_BASE.replace(/\/$/, '');
  return raw.startsWith('/') ? `${base}${raw}` : `${base}/${raw}`;
}

const readSelectedProjectId = () => {
  try {
    const raw = localStorage.getItem('selectedProject');
    if (!raw) return '';
    const id = JSON.parse(raw)?.id;
    return id != null && String(id).trim() !== '' ? String(id) : '';
  } catch {
    return '';
  }
};

function enrichWithContactNames(list, inboxFallback) {
  const nameByPhone = new Map();
  (inboxFallback || []).forEach((c) => {
    const key = normalizePhoneKey(c.phone);
    const name = String(c.name || '').trim();
    if (key && name && normalizePhoneKey(name) !== key) {
      nameByPhone.set(key, name);
    }
  });
  return (list || []).map((row) => {
    const key = normalizePhoneKey(row.phone);
    const resolved = nameByPhone.get(key);
    return resolved ? { ...row, customer_name: resolved } : row;
  });
}

function resolveConversationDisplayName(conv, inboxList) {
  const phone = String(conv?.phone || '').trim();
  const phoneKey = normalizePhoneKey(phone);
  const inboxHit = (inboxList || []).find((c) => normalizePhoneKey(c.phone) === phoneKey);
  const fromInbox = String(inboxHit?.name || '').trim();
  if (fromInbox && normalizePhoneKey(fromInbox) !== phoneKey) return fromInbox;

  const fromConv = String(conv?.customer_name || '').trim();
  if (fromConv && normalizePhoneKey(fromConv) !== phoneKey && !/^\d{8,}$/.test(fromConv.replace(/\D/g, ''))) {
    return fromConv;
  }
  return fromInbox || fromConv || phone || 'Unknown';
}

function formatPhoneDisplay(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  if (raw.startsWith('+')) return raw;
  const digits = normalizePhoneKey(raw);
  return digits ? `+${digits}` : raw;
}

function isSamePhoneValue(a, b) {
  const da = normalizePhoneKey(a);
  const db = normalizePhoneKey(b);
  return Boolean(da && db && da === db);
}

function getAgentInitials(nameOrEmail) {
  const raw = String(nameOrEmail || '').trim();
  if (!raw) return 'A';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return raw.slice(0, 2).toUpperCase();
}

function Inbox({ pageMode = 'inbox' }) {
  const isHistoryPage = pageMode === 'history';
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false);
  // Seed from session so /inbox chrome (search + filter) paints immediately on navigate
  const [user, setUser] = useState(() => readSessionUser());
  const [loading, setLoading] = useState(() => !readSessionUser());
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [inboxList, setInboxList] = useState([]);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [interveneCannedOptions, setInterveneCannedOptions] = useState([]);
  const [interveneTemplateOptions, setInterveneTemplateOptions] = useState([]);
  const [loadingInterveneOptions, setLoadingInterveneOptions] = useState(false);
  const [interveneOptionsError, setInterveneOptionsError] = useState('');
  const [selectedInterveneCannedId, setSelectedInterveneCannedId] = useState('');
  const [selectedInterveneTemplateId, setSelectedInterveneTemplateId] = useState('');
  const interveneOptionsLoadedRef = useRef(false);
  const [interveneQuickPickerOpen, setInterveneQuickPickerOpen] = useState(false);
  const interveneQuickPickerRef = useRef(null);
  const [intervenePreviewItem, setIntervenePreviewItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typingContacts, setTypingContacts] = useState({});
  const [onlineContacts, setOnlineContacts] = useState({});
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [botFlowState, setBotFlowState] = useState({}); // { phone: flowState }
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [requestingList, setRequestingList] = useState([]);
  const [loadingRequesting, setLoadingRequesting] = useState(false);
  const [agentsList, setAgentsList] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [assigningId, setAssigningId] = useState(null);
  const [assignMenuConvId, setAssignMenuConvId] = useState(null);
  const assignMenuRef = useRef(null);
  const [interventionAlert, setInterventionAlert] = useState(null);
  const [intervenedPhones, setIntervenedPhones] = useState({});
  const [inboxTab, setInboxTab] = useState(isHistoryPage ? 'history' : 'requesting');
  const [sectionByTab, setSectionByTab] = useState(() => ({
    active: [],
    requesting: [],
    intervened: [],
    history: [],
  }));
  const [loadingSectionChats, setLoadingSectionChats] = useState(false);
  const [intervenedFilterOpen, setIntervenedFilterOpen] = useState(false);
  // Default "any" so admins see agent-intervened chats (not only agent_id === me)
  const [intervenedFilter, setIntervenedFilter] = useState('any');
  const [intervenedAgentSearch, setIntervenedAgentSearch] = useState('');
  const [listFilterOpen, setListFilterOpen] = useState(false);
  const [filterDraft, setFilterDraft] = useState(() => emptyInboxFilterDraft());
  const [filterApplied, setFilterApplied] = useState(null);
  const [filterTagsList, setFilterTagsList] = useState([]);
  const [filterContactMeta, setFilterContactMeta] = useState(() => new Map()); // phone -> { optedIn, createdAt }
  const [filterTagPhoneSets, setFilterTagPhoneSets] = useState(() => new Map()); // tagId -> Set(phones)
  const [filterContactsLoading, setFilterContactsLoading] = useState(false);
  const listFilterRef = useRef(null);
  const [insertOptionSearch, setInsertOptionSearch] = useState('');
  const transferMenuRef = useRef(null);
  const [transferMenuOpen, setTransferMenuOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveDispositionOpen, setResolveDispositionOpen] = useState(false);
  const [planInfo, setPlanInfo] = useState(null);
  const [planInfoLoaded, setPlanInfoLoaded] = useState(false);
  const [selectedDisposition, setSelectedDisposition] = useState(null);
  const [resolvedConvIds, setResolvedConvIds] = useState(() => new Set());
  const [templateCatalog, setTemplateCatalog] = useState(() => new Map());
  const notificationRef = useRef(null);
  const fetchSectionChatsRef = useRef(() => {});
  const inboxListRef = useRef([]);
  const sectionFetchSeqRef = useRef(0);
  const inboxTabRef = useRef(isHistoryPage ? 'history' : 'requesting');
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const userScrolledUpRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const [activeProjectId, setActiveProjectId] = useState(readSelectedProjectId);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastOpenChatFromContactsRef = useRef(null);
  const handleContactSelectRef = useRef(null);

  useEffect(() => {
    inboxListRef.current = inboxList || [];
  }, [inboxList]);

  useEffect(() => {
    inboxTabRef.current = isHistoryPage ? 'history' : inboxTab;
  }, [inboxTab, isHistoryPage]);

  const sectionConversations = sectionByTab[isHistoryPage ? 'history' : inboxTab] || [];

  // Fetch user profile (UI already visible when session user exists)
  useEffect(() => {
    let cancelled = false;
    const fetchProfile = async () => {
      try {
        if (!isAuthenticated()) {
          navigate('/login');
          return;
        }
        const userData = await getProfile();
        if (!cancelled) setUser(userData);
      } catch (error) {
        console.error('Error fetching profile:', error);
        logout();
        navigate('/login');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const refreshPlanInfo = useCallback(async () => {
    const accountId = user?.id;
    if (!isAuthenticated() || accountId == null) {
      setPlanInfo(null);
      setPlanInfoLoaded(false);
      return;
    }
    try {
      const quota = await getConversationQuota(accountId);
      setPlanInfo(quota?.planInfo ?? null);
      setPlanInfoLoaded(true);
    } catch (_) {
      setPlanInfo(null);
      setPlanInfoLoaded(true);
    }
  }, [user?.id]);

  useEffect(() => {
    refreshPlanInfo();
  }, [refreshPlanInfo, activeProjectId]);

  useEffect(() => {
    const onPlanOrWccUpdate = () => {
      refreshPlanInfo();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshPlanInfo();
    };
    window.addEventListener('wcc-quota-updated', onPlanOrWccUpdate);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('wcc-quota-updated', onPlanOrWccUpdate);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshPlanInfo]);

  const isAdminOrManager = user && ['admin', 'manager'].includes(String(user.role || '').toLowerCase());
  const isAgentUser = user && String(user.role || '').toLowerCase() === 'agent';
  const agentCanPickup = isAgentUser ? readAgentPickupAllowed(user) : false;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const localRes = await getTemplates({ page: 1, limit: 500, status: 'approved' });
        let metaTemplates = [];
        try {
          const metaRes = await axios.get('/templates/meta');
          metaTemplates = Array.isArray(metaRes?.data?.templates) ? metaRes.data.templates : [];
        } catch (_) {
          /* WhatsApp may not be linked yet for this project */
        }
        const map = new Map();
        (localRes?.templates || []).forEach((t) => {
          if (t?.name) map.set(normalizeTemplateKey(t.name), t);
        });
        metaTemplates.forEach((t) => {
          if (!t?.name) return;
          const key = normalizeTemplateKey(t.name);
          const existing = map.get(key);
          if (existing) {
            const localVars =
              existing.variables && typeof existing.variables === 'object' && !Array.isArray(existing.variables)
                ? existing.variables
                : {};
            const metaVars =
              t.variables && typeof t.variables === 'object' && !Array.isArray(t.variables)
                ? t.variables
                : {};
            const headerMediaUrl =
              localVars.headerMediaUrl ||
              localVars.header_media_url ||
              existing.headerMediaUrl ||
              metaVars.headerMediaUrl ||
              metaVars.header_media_url ||
              t.headerMediaUrl ||
              null;
            map.set(key, {
              ...existing,
              ...t,
              content: existing.content || t.content,
              variables: {
                ...metaVars,
                ...localVars,
                ...(headerMediaUrl ? { headerMediaUrl, header_media_url: headerMediaUrl } : {}),
                templateType:
                  localVars.templateType ||
                  metaVars.templateType ||
                  (String(
                    (t.components || []).find((c) => String(c?.type || '').toUpperCase() === 'HEADER')?.format || ''
                  ).toUpperCase() === 'IMAGE'
                    ? 'image'
                    : undefined),
              },
            });
            return;
          }
          map.set(key, t);
        });
        if (!cancelled) setTemplateCatalog(map);
      } catch (_) {
        if (!cancelled) setTemplateCatalog(new Map());
      }
    })();
    return () => { cancelled = true; };
  }, [activeProjectId]);

  useEffect(() => {
    interveneOptionsLoadedRef.current = false;
    setInterveneTemplateOptions([]);
    setInterveneCannedOptions([]);
  }, [activeProjectId]);

  const chatFetchWithProject = useCallback(async (path) => {
    const token = localStorage.getItem('token');
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (activeProjectId) headers['x-project-id'] = activeProjectId;
    const base = API_BASE.replace(/\/$/, '');
    const res = await fetch(`${base}${path}`, { headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || data?.message || 'Request failed');
    }
    return data;
  }, [activeProjectId]);

  const filterConversationsByTab = useCallback((rows, tabName) => {
    const list = Array.isArray(rows) ? rows : [];
    if (tabName === 'intervened') {
      return list.filter((c) => String(c?.status || '').toLowerCase() === 'intervened');
    }
    if (tabName === 'active') {
      return list.filter((c) => String(c?.status || '').toLowerCase() === 'active');
    }
    if (tabName === 'requesting') {
      // Requesting tab = waiting queue only (never intervened/closed/active human chats)
      return list.filter((c) => String(c?.status || '').toLowerCase() === 'requesting');
    }
    return list;
  }, []);

  const fetchSectionChats = useCallback(async (showLoading = true) => {
    if (!isAuthenticated() || !activeProjectId || !user?.id) {
      setSectionByTab({ active: [], requesting: [], intervened: [], history: [] });
      setLoadingSectionChats(false);
      return;
    }
    const role = String(user.role || '').toLowerCase();
    const isManager = ['admin', 'manager'].includes(role);
    const isAgent = role === 'agent';
    const requestedTab = isHistoryPage ? 'history' : inboxTabRef.current;
    // Only bump seq for user-driven loads. Background polls must not cancel in-flight tab loads.
    const seq = showLoading ? ++sectionFetchSeqRef.current : sectionFetchSeqRef.current;

    try {
      if (showLoading && requestedTab === inboxTabRef.current) {
        setLoadingSectionChats(true);
      }
      let data = [];
      if (requestedTab === 'active') {
        data = await chatFetchWithProject('/api/chat/active');
      } else if (requestedTab === 'history') {
        data = await chatFetchWithProject('/api/chat/history');
      } else if (requestedTab === 'requesting') {
        if (isManager) {
          data = await chatFetchWithProject('/api/manager/requesting');
        } else if (isAgent) {
          data = await chatFetchWithProject(`/api/agent/requesting?agentId=${encodeURIComponent(user.id)}`);
          if (agentCanPickup) {
            try {
              const pool = await getUnassignedRequestingChats();
              const unassigned = (Array.isArray(pool) ? pool : []).filter(
                (c) => String(c?.status || '').toLowerCase() === 'requesting' && (c.agent_id == null || c.agent_id === '')
              );
              const byId = new Map();
              [...(Array.isArray(data) ? data : []), ...unassigned].forEach((c) => {
                if (c?.id != null) byId.set(c.id, c);
              });
              data = [...byId.values()];
            } catch (_) {
              /* keep assigned-only list */
            }
          }
        } else {
          data = await chatFetchWithProject('/api/chat/requesting');
        }
      } else if (requestedTab === 'intervened') {
        data = await chatFetchWithProject('/api/chat/intervened');
      } else {
        data = [];
      }

      // Stale if user switched tabs (or a newer user-driven fetch started)
      if (requestedTab !== inboxTabRef.current) return;
      if (showLoading && seq !== sectionFetchSeqRef.current) return;

      let list = Array.isArray(data) ? data : [];
      const inboxFallback = inboxListRef.current || [];
      if (requestedTab === 'requesting') {
        list = mergeInboxIntoRequesting(list, inboxFallback);
      } else if (requestedTab === 'active') {
        list = mergeInboxIntoActive(list, inboxFallback);
      } else if (requestedTab === 'history') {
        list = mergeInboxIntoHistory(list, inboxFallback);
      }
      // Never merge non-intervened into intervened
      list = filterConversationsByTab(list, requestedTab);
      list = enrichWithContactNames(list, inboxFallback);

      if (requestedTab !== inboxTabRef.current) return;
      if (showLoading && seq !== sectionFetchSeqRef.current) return;

      setSectionByTab((prev) => ({
        ...prev,
        [requestedTab]: list,
      }));
    } catch (e) {
      if (requestedTab !== inboxTabRef.current) return;
      if (showLoading && seq !== sectionFetchSeqRef.current) return;
      console.error('Error fetching inbox section chats:', e);
      setSectionByTab((prev) => ({
        ...prev,
        [requestedTab]: [],
      }));
    } finally {
      if (
        showLoading &&
        seq === sectionFetchSeqRef.current &&
        requestedTab === inboxTabRef.current
      ) {
        setLoadingSectionChats(false);
      }
    }
  }, [activeProjectId, user?.id, user?.role, chatFetchWithProject, isHistoryPage, agentCanPickup, filterConversationsByTab]);

  // Never leave Assign UI open on Active/Intervened
  useEffect(() => {
    if (inboxTab !== 'requesting') {
      setAssignMenuConvId(null);
      setAssigningId(null);
    }
  }, [inboxTab]);

  useEffect(() => {
    if (!assignMenuConvId) return undefined;
    const onDoc = (e) => {
      if (assignMenuRef.current && !assignMenuRef.current.contains(e.target)) {
        setAssignMenuConvId(null);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [assignMenuConvId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get('/auth/agents');
        if (!cancelled) setAgentsList(Array.isArray(res.data?.agents) ? res.data.agents : []);
      } catch {
        if (!cancelled) setAgentsList([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, activeProjectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tags = await fetchTags();
        if (!cancelled) setFilterTagsList(Array.isArray(tags) ? tags : []);
      } catch {
        if (!cancelled) setFilterTagsList([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeProjectId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const applied = filterApplied;
      if (!applied) {
        setFilterContactMeta(new Map());
        setFilterTagPhoneSets(new Map());
        setFilterContactsLoading(false);
        return;
      }
      const attrs = (applied.attrs || []).filter((r) => r?.attribute && String(r.value ?? '') !== '');
      const needsContacts =
        Boolean(applied.createdPreset || applied.createdFrom || applied.createdTo) ||
        attrs.some((r) => r.attribute === 'opted_in' || r.attribute === 'tags');
      if (!needsContacts) {
        setFilterContactMeta(new Map());
        setFilterTagPhoneSets(new Map());
        setFilterContactsLoading(false);
        return;
      }
      setFilterContactsLoading(true);
      try {
        const meta = new Map();
        const tagSets = new Map();

        const putMeta = (phone, data) => {
          phoneLookupKeys(phone).forEach((key) => {
            meta.set(key, data);
          });
        };
        const putTagPhone = (tagId, phone) => {
          if (!tagSets.has(tagId)) tagSets.set(tagId, new Set());
          const set = tagSets.get(tagId);
          phoneLookupKeys(phone).forEach((key) => set.add(key));
        };

        const res = await axios.get('/contacts', { params: { page: 1, limit: 10000 } });
        (res.data?.contacts || []).forEach((c) => {
          if (!c?.phone) return;
          putMeta(c.phone, {
            optedIn: Boolean(c.whatsappOptInAt) && String(c.status || '').toLowerCase() !== 'unsubscribed',
            createdAt: c.createdAt || c.created_at || null,
          });
        });
        const tagIds = [
          ...new Set(
            attrs
              .filter((r) => r.attribute === 'tags' && r.value)
              .map((r) => String(r.value))
          ),
        ];
        await Promise.all(
          tagIds.map(async (tagId) => {
            try {
              const tagRes = await axios.get('/contacts', {
                params: { page: 1, limit: 10000, tagId },
              });
              tagSets.set(tagId, new Set());
              (tagRes.data?.contacts || []).forEach((c) => {
                if (c?.phone) putTagPhone(tagId, c.phone);
              });
            } catch {
              tagSets.set(tagId, new Set());
            }
          })
        );
        if (!cancelled) {
          setFilterContactMeta(meta);
          setFilterTagPhoneSets(tagSets);
        }
      } catch (err) {
        console.warn('[Inbox] filter contacts load failed', err?.message || err);
        if (!cancelled) {
          setFilterContactMeta(new Map());
          setFilterTagPhoneSets(new Map());
        }
      } finally {
        if (!cancelled) setFilterContactsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filterApplied, activeProjectId]);

  // Ensure intervened chats are loaded when filters need them (even if user is on another tab)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!filterApplied || !activeProjectId || !isAuthenticated()) return;
      const attrs = (filterApplied.attrs || []).filter(
        (r) => r?.attribute && String(r.value ?? '') !== ''
      );
      const needsIntervenedList = attrs.some(
        (r) => r.attribute === 'intervened' || r.attribute === 'intervened_by_agent'
      );
      if (!needsIntervenedList) return;
      try {
        const data = await chatFetchWithProject('/api/chat/intervened');
        if (cancelled) return;
        let list = Array.isArray(data) ? data : [];
        list = filterConversationsByTab(list, 'intervened');
        setSectionByTab((prev) => ({
          ...prev,
          intervened: list,
        }));
      } catch (e) {
        console.warn('[Inbox] filter intervened prefetch failed', e?.message || e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filterApplied, activeProjectId, chatFetchWithProject, filterConversationsByTab]);

  useEffect(() => {
    if (!listFilterOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setListFilterOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [listFilterOpen]);

  useEffect(() => {
    fetchSectionChatsRef.current = fetchSectionChats;
  }, [fetchSectionChats]);

  const fetchRequesting = useCallback(async () => {
    if (!isAdminOrManager) return;
    setLoadingRequesting(true);
    try {
      const data = await getManagerRequesting();
      setRequestingList(Array.isArray(data) ? data : []);
    } catch (e) {
      setRequestingList([]);
    } finally {
      setLoadingRequesting(false);
    }
  }, [isAdminOrManager]);

  const fetchAgentsForAssign = useCallback(async () => {
    if (!isAdminOrManager) return;
    setLoadingAgents(true);
    try {
      const res = await axios.get('/auth/agents');
      setAgentsList(Array.isArray(res.data?.agents) ? res.data.agents : []);
    } catch (e) {
      setAgentsList([]);
    } finally {
      setLoadingAgents(false);
    }
  }, [isAdminOrManager, activeProjectId]);

  useEffect(() => {
    if (isAdminOrManager) {
      fetchRequesting();
      fetchAgentsForAssign();
    }
  }, [isAdminOrManager, fetchRequesting, fetchAgentsForAssign, activeProjectId]);

  const handleAssignToAgent = async (conversationId, agentId) => {
    if (!conversationId || !agentId) return;
    setAssigningId(conversationId);
    try {
      const result = await assignChatToAgent(conversationId, agentId);
      if (result?.success !== false && !result?.error) {
        await fetchRequesting();
        await fetchSectionChats(false);
      } else {
        alert(result?.message || result?.error || 'Assign failed');
      }
    } catch (e) {
      alert(e?.message || 'Failed to assign');
    } finally {
      setAssigningId(null);
    }
  };

  // Fetch notifications
  const fetchNotifications = async (forceRefresh = false) => {
    try {
      setLoadingNotifications(true);
      if (forceRefresh) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const data = await getNotifications();
      const sortedData = (data || []).sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
      });
      setNotifications(sortedData);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated()) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 10000);
      return () => clearInterval(interval);
    }
  }, []);

  // Initialize Socket.IO when user is loaded
  useEffect(() => {
    if (isAuthenticated() && user) {
      const token = localStorage.getItem('token');
      const socket = initializeSocket(user.id, token);

      // Set up socket event listeners
      const handleNewMessage = async (message) => {
        console.log('📨 Socket: new-message received', message);
        
        // Check if this message is for the currently selected contact
        const isForSelectedContact = selectedContact && (
          message.contactId === selectedContact.id || 
          message.phone === selectedContact.phone ||
          (selectedContact.phone && message.phone && selectedContact.phone.replace(/\D/g, '') === message.phone.replace(/\D/g, ''))
        );

        if (isForSelectedContact) {
          // Check if bot flow is active and this is an incoming message
          const phone = selectedContact.phone;
          const currentFlowState = botFlowState[phone];
          
          // Auto-respond to incoming messages if bot flow is active
          if (message.type === 'incoming' && currentFlowState && currentFlowState !== 'completed') {
            // Wait a bit before responding (simulate bot thinking)
            setTimeout(async () => {
              try {
                if (currentFlowState === 'template_sent') {
                  // User responded to template - ask for salary
                  const response = await sendChatbotMessage('__YES_CLICKED__', 0, currentFlowState);
                  
                  // Send bot response as message
                  const botResponseText = response.message || "Great! To help you better, could you please tell me your current salary? (Please enter numbers only, e.g., 50000)";
                  await sendMessage(phone, botResponseText);
                  
                  // Update flow state
                  setBotFlowState(prev => ({
                    ...prev,
                    [phone]: response.flowState || 'asking_salary'
                  }));
                } else if (currentFlowState === 'asking_salary' || currentFlowState === 'salary_retry') {
                  // User sent salary - validate it
                  const userMessageText = message.content || '';
                  const response = await sendChatbotMessage(`__SALARY_INPUT__:${userMessageText}`, 0, currentFlowState);
                  
                  if (response.isValid === false) {
                    // Invalid salary - ask again
                    await sendMessage(phone, response.message || "Please enter a valid salary amount. It should be a positive number (e.g., 50000).");
                    setBotFlowState(prev => ({
                      ...prev,
                      [phone]: 'salary_retry'
                    }));
                  } else {
                    // Valid salary - continue flow
                    await sendMessage(phone, response.message || "Thank you! Your information has been recorded. How else can I help you?");
                    setBotFlowState(prev => ({
                      ...prev,
                      [phone]: response.flowState || 'completed'
                    }));
                  }
                }
              } catch (error) {
                console.error('Error in auto bot response:', error);
              }
            }, 1000); // 1 second delay
          }
          
          setMessages(prev => {
            // Normalize content and phone for comparison
            const normalizeContent = (content) => {
              return String(content || '').trim().replace(/\s+/g, ' ');
            };
            const normalizePhone = (phone) => {
              return String(phone || '').replace(/\D/g, '');
            };
            
            const msgContent = normalizeContent(message.content);
            const msgPhone = normalizePhone(message.phone || selectedContact?.phone || '');
            const msgContactId = String(message.contactId || '');
            const msgTimestamp = new Date(message.sentAt || message.createdAt || 0).getTime();
            
            // Check if message already exists (by ID, waMessageId, or content+timestamp+contact)
            const exists = prev.find(m => {
              // Exact ID match (most reliable)
              if (m.id === message.id && message.id) return true;
              
              // Match by waMessageId if available (WhatsApp message ID is globally unique)
              if (m.waMessageId && message.waMessageId && m.waMessageId === message.waMessageId) {
                return true;
              }
              
              // For incoming messages: very strict matching to prevent duplicates
              if (message.type === 'incoming' && m.type === 'incoming') {
                const mContent = normalizeContent(m.content);
                const mPhone = normalizePhone(m.phone || selectedContact?.phone || '');
                const mContactId = String(m.contactId || '');
                const mTimestamp = new Date(m.sentAt || m.createdAt || 0).getTime();
                
                // Check if content matches (normalized)
                if (mContent === msgContent) {
                  // Check if same contact (by ID, phone, or normalized phone)
                  const sameContact = 
                    mContactId === msgContactId || 
                    mPhone === msgPhone ||
                    (mPhone && msgPhone && mPhone === msgPhone);
                  
                  if (sameContact) {
                    // Check if timestamp is close (within 60 seconds - increased window for socket events)
                    const timeDiff = Math.abs(mTimestamp - msgTimestamp);
                    if (timeDiff < 60000) {
                      console.log('🔄 Socket: Incoming message duplicate detected:', {
                        existingId: m.id,
                        newId: message.id,
                        content: msgContent.substring(0, 30),
                        timeDiff: timeDiff,
                        existingSource: m.source,
                        newSource: message.source
                      });
                      return true; // Duplicate found
                    }
                  }
                }
              }
              
              // For outgoing messages: match by content + time (to replace optimistic messages)
              if (message.type === 'outgoing' && m.type === 'outgoing') {
                const mContent = normalizeContent(m.content);
                if (mContent === msgContent) {
                  const mTimestamp = new Date(m.sentAt || m.createdAt || 0).getTime();
                  const timeDiff = Math.abs(mTimestamp - msgTimestamp);
                  if (timeDiff < 10000) return true; // Within 10 seconds
                }
                
                // Also match by waMessageId for outgoing
                if (m.waMessageId && message.waMessageId && m.waMessageId === message.waMessageId) {
                  return true;
                }
              }
              
              return false;
            });
            
            if (exists) {
              // Update existing message (replace optimistic with real one OR prevent duplicate)
              console.log('🔄 Socket: Duplicate message detected - preventing duplicate:', {
                messageId: message.id,
                type: message.type,
                content: msgContent.substring(0, 30),
                waMessageId: message.waMessageId
              });
              
              // For incoming messages: just return prev (don't add duplicate)
              if (message.type === 'incoming') {
                return prev;
              }
              
              // For outgoing messages: update optimistic with real data
              return prev.map(m => {
                // Match by ID
                if (m.id === message.id) {
                  // Preserve template content if it's a template message
                  const updatedMessage = { ...message, isOptimistic: false, source: 'socket' };
                  if (m.isTemplate && (m.templateName || m.content)) {
                    updatedMessage.content = m.content || message.content;
                    updatedMessage.isTemplate = true;
                    if (m.templateName) updatedMessage.templateName = m.templateName;
                    updatedMessage.templatePreview = m.templatePreview || message.templatePreview || null;
                  }
                  return updatedMessage;
                }
                
                // Match optimistic message by content + time or waMessageId (for templates)
                if (m.isOptimistic && message.type === 'outgoing') {
                  const contentMatch = m.content === message.content;
                  const waMessageIdMatch = m.waMessageId && message.waMessageId && m.waMessageId === message.waMessageId;
                  const templateMatch = m.isTemplate && m.templateName && (
                    message.content?.startsWith('Template:') ||
                    (m.content && message.content && m.content === message.content)
                  );
                  
                  if (contentMatch || waMessageIdMatch || templateMatch) {
                    const timeDiff = Math.abs(
                      new Date(m.sentAt || m.createdAt) - new Date(message.sentAt || message.createdAt)
                    );
                    if (timeDiff < 5000) {
                      // Preserve template content if it's a template message
                      const updatedMessage = { ...message, isOptimistic: false, source: 'socket' };
                      if (m.isTemplate && (m.templateName || m.content)) {
                        updatedMessage.content = m.content || message.content;
                        updatedMessage.isTemplate = true;
                        if (m.templateName) updatedMessage.templateName = m.templateName;
                        updatedMessage.templatePreview = m.templatePreview || message.templatePreview || null;
                      }
                      return updatedMessage;
                    }
                  }
                }
                
                // Also update by waMessageId for template messages
                if (m.isTemplate && message.waMessageId && m.waMessageId === message.waMessageId) {
                  return {
                    ...m,
                    ...message,
                    content: m.content || message.content,
                    isTemplate: true,
                    templateName: m.templateName || message.templateName,
                    templatePreview: m.templatePreview || message.templatePreview,
                    isOptimistic: false,
                    source: 'socket',
                  };
                }
                
                return m;
              }).sort((a, b) => {
                const dateA = new Date(a.sentAt || a.createdAt || 0);
                const dateB = new Date(b.sentAt || b.createdAt || 0);
                return dateA - dateB;
              });
            }
            
            // Message doesn't exist - add it (but double-check for duplicates first)
            // Final check: make sure we're not adding a duplicate by content+time+contact
            const isDuplicate = prev.some(m => {
              if (message.type === 'incoming' && m.type === 'incoming') {
                const mContent = normalizeContent(m.content);
                const mPhone = normalizePhone(m.phone || selectedContact?.phone || '');
                const mContactId = String(m.contactId || '');
                const mTimestamp = new Date(m.sentAt || m.createdAt || 0).getTime();
                
                if (mContent === msgContent) {
                  const sameContact = 
                    mContactId === msgContactId || 
                    mPhone === msgPhone ||
                    (mPhone && msgPhone && mPhone === msgPhone);
                  
                  if (sameContact) {
                    const timeDiff = Math.abs(mTimestamp - msgTimestamp);
                    if (timeDiff < 60000) {
                      console.log('🔄 Socket: Final duplicate check - preventing duplicate:', {
                        existingId: m.id,
                        newId: message.id,
                        content: msgContent.substring(0, 30)
                      });
                      return true;
                    }
                  }
                }
              }
              return false;
            });
            
            if (isDuplicate) {
              console.log('🔄 Socket: Duplicate prevented at final check');
              return prev;
            }
            
            // Message is truly new - add it
            console.log('➕ Adding new message from socket:', {
              messageId: message.id,
              type: message.type,
              content: msgContent.substring(0, 30),
              waMessageId: message.waMessageId
            });
            return [...prev, { ...message, isOptimistic: false, source: 'socket' }].sort((a, b) => {
              const dateA = new Date(a.sentAt || a.createdAt || 0);
              const dateB = new Date(b.sentAt || b.createdAt || 0);
              return dateA - dateB;
            });
          });
        } else {
          console.log('📬 Message received for different contact, updating inbox list');
        }
        
        // Always refresh inbox list when new message arrives
        fetchInboxList(false);
        fetchSectionChatsRef.current?.(false);
      };

      const handleStatusUpdate = (data) => {
        console.log('📊 Socket: message-status-update received', data);
        setMessages(prev => prev.map(msg => {
          const isMatch =
            msg.id === data.messageId ||
            msg.id === `inbox_${data.messageId}` ||
            msg.waMessageId === data.waMessageId;
          if (!isMatch) return msg;

          const incomingPreview = data.templatePreview || data.templateSnapshot || null;
          const existingPreview = msg.templatePreview || msg.templateSnapshot || null;
          const preservedHeaderUrl =
            existingPreview?.headerImageUrl ||
            existingPreview?.header?.url ||
            msg.mediaUrl ||
            msg.header?.url ||
            null;
          const incomingHeaderUrl =
            incomingPreview?.headerImageUrl ||
            incomingPreview?.header?.url ||
            data.mediaUrl ||
            null;
          const headerImageUrl = preservedHeaderUrl || incomingHeaderUrl || null;
          const mergedPreview =
            incomingPreview || existingPreview
              ? {
                  ...(incomingPreview && typeof incomingPreview === 'object' ? incomingPreview : {}),
                  ...(existingPreview && typeof existingPreview === 'object' ? existingPreview : {}),
                  ...(incomingPreview && typeof incomingPreview === 'object' ? incomingPreview : {}),
                  body:
                    (incomingPreview && incomingPreview.body) ||
                    (existingPreview && existingPreview.body) ||
                    msg.content ||
                    '',
                  headerImageUrl,
                  header: headerImageUrl
                    ? { type: 'image', url: headerImageUrl }
                    : (incomingPreview?.header || existingPreview?.header || msg.header || null),
                  headerFormat:
                    (incomingPreview && incomingPreview.headerFormat) ||
                    (existingPreview && existingPreview.headerFormat) ||
                    (headerImageUrl ? 'IMAGE' : null),
                  footer:
                    (incomingPreview && incomingPreview.footer) ||
                    (existingPreview && existingPreview.footer) ||
                    '',
                  buttons:
                    (Array.isArray(incomingPreview?.buttons) && incomingPreview.buttons.length
                      ? incomingPreview.buttons
                      : null) ||
                    (Array.isArray(existingPreview?.buttons) ? existingPreview.buttons : []) ||
                    msg.buttons ||
                    [],
                }
              : null;

          return {
            ...msg,
            status: data.status,
            deliveredAt: data.deliveredAt,
            readAt: data.readAt,
            errorMessage: data.errorMessage || msg.errorMessage || null,
            mediaUrl: data.mediaUrl || msg.mediaUrl || headerImageUrl || null,
            header: mergedPreview?.header || msg.header || (headerImageUrl ? { type: 'image', url: headerImageUrl } : null),
            templatePreview: mergedPreview,
            templateSnapshot: mergedPreview,
          };
        }));
        if (String(data?.status || '').toLowerCase() === 'failed') {
          if (data?.sentViaTemplate) return;
          const errText = String(data?.errorMessage || '').trim();
          if (/re-engagement/i.test(errText)) return;
          if (errText) {
            alert(`Message failed: ${errText}`);
          } else {
            alert('Message failed to deliver on WhatsApp.');
          }
        }
        if (data?.wccCredits != null && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('wcc-quota-updated', {
              detail: { wccCredits: Number(data.wccCredits) },
            })
          );
        }
      };

      const handleTyping = (data) => {
        setTypingContacts(prev => ({
          ...prev,
          [data.contactId]: data.isTyping
        }));
      };

      const handleOnlineStatus = (data) => {
        setOnlineContacts(prev => ({
          ...prev,
          [data.contactId]: { isOnline: data.isOnline, lastSeen: data.lastSeen }
        }));
      };

      const handleInboxUpdate = () => {
        fetchInboxList(false);
        fetchSectionChatsRef.current?.(false);
      };

      onSocketEvent('new-message', handleNewMessage);
      onSocketEvent('message-status-update', handleStatusUpdate);
      onSocketEvent('typing', handleTyping);
      onSocketEvent('online-status', handleOnlineStatus);
      onSocketEvent('inbox-update', handleInboxUpdate);
      const handleIntervention = (data) => {
        setInterventionAlert(data);
        setTimeout(() => setInterventionAlert(null), 6000);
      };
      onSocketEvent('intervention', handleIntervention);

      return () => {
        offSocketEvent('new-message', handleNewMessage);
        offSocketEvent('message-status-update', handleStatusUpdate);
        offSocketEvent('typing', handleTyping);
        offSocketEvent('online-status', handleOnlineStatus);
        offSocketEvent('inbox-update', handleInboxUpdate);
        offSocketEvent('intervention', handleIntervention);
        disconnectSocket();
      };
    }
  }, [user, selectedContact]);

  useEffect(() => {
    if (notificationDropdownOpen && isAuthenticated()) {
      fetchNotifications(true);
    }
  }, [notificationDropdownOpen]);

  useEffect(() => {
    const syncProject = () => {
      const next = readSelectedProjectId();
      setActiveProjectId((prev) => (prev !== next ? next : prev));
    };
    const timer = setInterval(syncProject, 800);
    window.addEventListener('storage', syncProject);
    return () => {
      clearInterval(timer);
      window.removeEventListener('storage', syncProject);
    };
  }, []);

  useEffect(() => {
    if (!activeProjectId) return;
    setSelectedContact(null);
    setMessages([]);
  }, [activeProjectId]);

  // Track last message timestamp for polling
  const lastMessageTimeRef = useRef(null);
  
  // Track if we're currently fetching to prevent duplicate calls and blinking
  const fetchingInboxRef = useRef(false);
  const fetchingInboundRef = useRef(false);
  const fetchingMessagesRef = useRef(false);

  const fetchInboundListFallback = async () => {
    const token = localStorage.getItem('token');
    if (!token) return [];

    const selectedProjectRaw = localStorage.getItem('selectedProject');
    const selectedProject = selectedProjectRaw ? JSON.parse(selectedProjectRaw) : null;
    const projectId = selectedProject?.id;

    const headers = { 'Authorization': `Bearer ${token}` };
    if (projectId != null && String(projectId).trim() !== '') {
      headers['x-project-id'] = String(projectId);
    }

    const res = await fetch(`${API_BASE}messages/inbound?limit=500`, { method: 'GET', headers });
    const text = await res.text();
    if (!res.ok) return [];
    if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<html')) return [];

    const parsed = JSON.parse(text);
    const rows = parsed?.messages || parsed?.data || [];
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const byPhone = new Map();
    rows.forEach((m) => {
      const phone = String(m?.phone || '').trim();
      if (!phone) return;
      const ts = m?.received_at || m?.created_at || new Date().toISOString();
      const existing = byPhone.get(phone);
      if (!existing || new Date(ts).getTime() > new Date(existing.lastMessageTime).getTime()) {
        byPhone.set(phone, {
          contactId: null,
          phone,
          name: phone,
          email: null,
          status: 'active',
          lastContacted: ts,
          whatsappOptInAt: null,
          lastMessage: m?.text || '',
          lastMessageTime: ts,
          unreadCount: 0,
          chatStatus: null
        });
      }
    });

    return Array.from(byPhone.values()).sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));
  };
  
  // Fetch inbox list
  const fetchInboxList = async (showLoading = false) => {
    // Prevent duplicate calls
    if (fetchingInboxRef.current) {
      return;
    }
    
    try {
      fetchingInboxRef.current = true;
      if (showLoading) {
        setLoadingInbox(true);
      }
      const data = await getInboxList();
      let finalList = data || [];
      if (finalList.length === 0) {
        finalList = await fetchInboundListFallback();
        if (finalList.length > 0) {
          console.log('Inbox fallback from inbound messages:', finalList.length, 'contacts');
        }
      }
      // Normalize shape so the rest of inbox code can always use `id`.
      finalList = (finalList || []).map((item) => ({
        ...item,
        id: item?.id ?? item?.contactId ?? null
      }));
      console.log('Inbox list fetched:', finalList?.length || 0, 'contacts');

      // Persist intervene state from backend chat status across refresh/navigation.
      const nextIntervened = {};
      (finalList || []).forEach((item) => {
        const status = String(item?.chatStatus || '').toLowerCase();
        if (status === 'intervened' && item?.phone) {
          nextIntervened[item.phone] = true;
        }
      });
      let persistedIntervened = {};
      try {
        const rawIntervened = localStorage.getItem(INTERVENED_STORAGE_KEY);
        persistedIntervened = rawIntervened ? JSON.parse(rawIntervened) : {};
      } catch (e) {
        persistedIntervened = {};
      }
      const mergedIntervened = { ...(persistedIntervened || {}), ...nextIntervened };
      setIntervenedPhones(mergedIntervened);
      try {
        localStorage.setItem(INTERVENED_STORAGE_KEY, JSON.stringify(mergedIntervened));
      } catch (e) {}
      
      // Only update state if data actually changed (prevent unnecessary re-renders)
      setInboxList(prev => {
        const prevStr = JSON.stringify(prev);
        const newStr = JSON.stringify(finalList || []);
        if (prevStr !== newStr) {
          return finalList || [];
        }
        return prev; // Return same reference if no change
      });
      fetchSectionChatsRef.current?.(false);
    } catch (error) {
      console.error('Error fetching inbox list:', error);
      // Only set empty array on error if we don't have data
      setInboxList(prev => prev.length === 0 ? [] : prev);
    } finally {
      if (showLoading) {
        setLoadingInbox(false);
      }
      fetchingInboxRef.current = false;
    }
  };

  // Fetch inbound messages from metaMessage API
  const fetchInboundMessages = async () => {
    // Prevent duplicate calls
    if (fetchingInboundRef.current) {
      return;
    }
    
    try {
      fetchingInboundRef.current = true;
      const since = lastMessageTimeRef.current ? new Date(lastMessageTimeRef.current).toISOString() : null;
      const token = localStorage.getItem('token');
      const selectedProjectRaw = localStorage.getItem('selectedProject');
      const selectedProject = selectedProjectRaw ? JSON.parse(selectedProjectRaw) : null;
      const projectId = selectedProject?.id;

      // Correct backend route is /messages/inbound (not /api/inbound-messages)
      let url = `${API_BASE}messages/inbound?limit=500`;
      if (since) {
        url += `&since=${encodeURIComponent(since)}`;
      }

      const headers = {
        'Authorization': `Bearer ${token}`
      };
      if (projectId != null && String(projectId).trim() !== '') {
        headers['x-project-id'] = String(projectId);
      }

      const res = await fetch(url, { method: 'GET', headers });
      const text = await res.text();
      console.log(text);

      if (!res.ok) {
        throw new Error(`Failed to fetch inbound messages (${res.status})`);
      }

      if (text.trim().startsWith('<!doctype') || text.trim().startsWith('<html')) {
        throw new Error('Inbound endpoint returned HTML (wrong route/domain)');
      }

      const data = JSON.parse(text);
      const inboundMessages = data?.data || data?.messages || [];
      
      if (inboundMessages && inboundMessages.length > 0) {
        // Update last message time
        const latestMessage = inboundMessages[0];
        if (latestMessage.received_at) {
          lastMessageTimeRef.current = latestMessage.received_at;
        }

        // Refresh inbox list to show new messages (without loading state)
        fetchInboxList(false);

        // If we have a selected contact and new message is for them, refresh messages
        // But only if we're not already fetching (prevent race condition with socket)
        if (selectedContact && !fetchingMessagesRef.current) {
          const hasNewMessage = inboundMessages.some(msg => msg.phone === selectedContact.phone);
          if (hasNewMessage) {
            // Small delay to let socket events process first (socket is faster)
            setTimeout(() => {
              if (!fetchingMessagesRef.current) {
                fetchMessages(selectedContact.phone, false); // false = don't show loading
              }
            }, 500); // 500ms delay
          }
        }
      }
    } catch (error) {
      console.error('Error fetching inbound messages:', error);
    } finally {
      fetchingInboundRef.current = false;
    }
  };

  useEffect(() => {
    if (loading || !isAuthenticated() || !activeProjectId) {
      return undefined;
    }
    fetchInboxList(true);
    fetchInboundMessages();

    const inboxInterval = setInterval(() => fetchInboxList(false), 15000);
    const inboundInterval = setInterval(fetchInboundMessages, 10000);

    return () => {
      clearInterval(inboxInterval);
      clearInterval(inboundInterval);
    };
  }, [loading, activeProjectId]);

  useEffect(() => {
    if (loading || !activeProjectId) return undefined;
    fetchSectionChats(true);
    // Slower poll reduces race/hang when switching tabs quickly
    const pollMs = isHistoryPage ? 45000 : 20000;
    const sectionInterval = setInterval(() => fetchSectionChats(false), pollMs);
    return () => clearInterval(sectionInterval);
  }, [inboxTab, loading, activeProjectId, fetchSectionChats, isHistoryPage]);

  // Fetch messages for selected contact - integrates data from Message, MetaMessage, and WebhookLogs
  const fetchMessages = async (phone, showLoading = true) => {
    if (!phone) {
      console.error('No phone number provided to fetchMessages');
      setLoadingMessages(false);
      fetchingMessagesRef.current = false;
      return;
    }

    // Prevent duplicate calls
    if (fetchingMessagesRef.current) {
      console.log('Already fetching messages, skipping duplicate call');
      return;
    }

    // Set a timeout to ensure loading state is cleared even if fetch hangs
    const timeoutId = setTimeout(() => {
      if (fetchingMessagesRef.current) {
        console.warn('fetchMessages timeout - clearing loading state');
        setLoadingMessages(false);
        fetchingMessagesRef.current = false;
      }
    }, 30000); // 30 second timeout

    try {
      fetchingMessagesRef.current = true;
      if (showLoading) {
        setLoadingMessages(true);
      }
      let allMessages = [];
      let contactData = null;

      const sectionHit = (sectionConversations || []).find(
        (c) => normalizePhoneKey(c.phone) === normalizePhoneKey(phone)
      );
      let conversationId =
        selectedContact?.conversationId != null && Number(selectedContact.conversationId) > 0
          ? Number(selectedContact.conversationId)
          : sectionHit?.conversationId != null && Number(sectionHit.conversationId) > 0
            ? Number(sectionHit.conversationId)
            : sectionHit?.id != null && Number(sectionHit.id) > 0
              ? Number(sectionHit.id)
              : null;

      const applyContactFromApi = (contact, convIdOverride = null) => {
        if (!contact) return;
        contactData = contact;
        setSelectedContact((prev) => ({
          ...(prev || {}),
          ...contact,
          id: contact.id ?? prev?.id,
          contactId: contact.id ?? prev?.contactId,
          phone: contact.phone || prev?.phone,
          inboxTab: prev?.inboxTab ?? inboxTab,
          agentName: prev?.agentName,
          conversationId:
            convIdOverride != null && Number(convIdOverride) > 0
              ? Number(convIdOverride)
              : prev?.conversationId != null && Number(prev.conversationId) > 0
                ? Number(prev.conversationId)
                : conversationId,
        }));
      };

      let chatMessages = [];
      let systemMessages = [];

      if (conversationId) {
        try {
          const chatRows = await chatFetchWithProject(`/api/chat/messages/${conversationId}`);
          const rows = Array.isArray(chatRows) ? chatRows : [];
          chatMessages = rows.filter((m) => {
            const sender = String(m.sender || '').toLowerCase();
            const type = String(m.type || '').toLowerCase();
            return sender !== 'system' && type !== 'system' && m.source !== 'system';
          });
          systemMessages = rows
            .filter((m) => {
              const sender = String(m.sender || '').toLowerCase();
              const type = String(m.type || '').toLowerCase();
              return sender === 'system' || type === 'system' || m.source === 'system';
            })
            .map((m) => ({
              id: `chat_system_${m.id || Date.now()}`,
              content: m.message || m.content,
              type: 'system',
              source: 'system',
              sender: 'system',
              sentAt: m.created_at || m.sentAt || m.createdAt,
              createdAt: m.created_at || m.createdAt || m.sentAt,
              phone,
            }));
        } catch (chatErr) {
          if (/not found/i.test(String(chatErr?.message || ''))) {
            conversationId = null;
            setSelectedContact((prev) =>
              prev && normalizePhoneKey(prev.phone) === normalizePhoneKey(phone)
                ? { ...prev, conversationId: null }
                : prev
            );
          }
          console.log('Chat messages not loaded:', chatErr.message);
        }
      }

      let inboxMessages = [];
      try {
        const inboxData = await getContactMessages(phone);
        inboxMessages = inboxData.messages || [];
        applyContactFromApi(inboxData.contact, conversationId);
      } catch (error) {
        console.log('Inbox messages not loaded from contact API:', error.message);
        if (!selectedContact || selectedContact.phone !== phone) {
          setSelectedContact({
            phone: phone,
            name: phone,
            id: null,
          });
        }
      }

      allMessages = dedupeChatMessages([...chatMessages, ...inboxMessages, ...systemMessages]);

      if (!allMessages.length) {
        try {
          const metaMessages = await getAllMetaMessages(phone, 10000);
          if (metaMessages && metaMessages.length > 0) {
            const convertedMetaMessages = metaMessages.map(mapMetaMessageToInbox);
            allMessages = [...allMessages, ...convertedMetaMessages];
          }
        } catch (error) {
          console.error('Error fetching meta messages:', error);
        }

        if (!allMessages.length) {
          try {
            const token = localStorage.getItem('token');
            const selectedProjectRaw = localStorage.getItem('selectedProject');
            const selectedProject = selectedProjectRaw ? JSON.parse(selectedProjectRaw) : null;
            const projectId = selectedProject?.id;
            const headers = { Authorization: `Bearer ${token}` };
            if (projectId != null && String(projectId).trim() !== '') {
              headers['x-project-id'] = String(projectId);
            }
            const fallbackUrl = `${API_BASE}messages/inbound?limit=500&phone=${encodeURIComponent(phone)}`;
            const fallbackRes = await fetch(fallbackUrl, { method: 'GET', headers });
            const fallbackText = await fallbackRes.text();
            if (fallbackRes.ok && !fallbackText.trim().startsWith('<')) {
              const fallbackData = JSON.parse(fallbackText);
              const fallbackRows = fallbackData?.messages || fallbackData?.data || [];
              if (Array.isArray(fallbackRows) && fallbackRows.length > 0) {
                allMessages = fallbackRows.map((m) => ({
                  id: `inbound_${m.id}`,
                  content: m.text || '',
                  type: 'incoming',
                  status: m.status === 'received' ? 'delivered' : (m.status || 'delivered'),
                  sentAt: m.received_at,
                  createdAt: m.received_at,
                  source: 'inbound_fallback',
                  phone,
                }));
              }
            }
          } catch (fallbackError) {
            console.error('Error fetching inbound fallback messages:', fallbackError);
          }
        }

        try {
          const webhookLogs = await getWebhookLogs(1000, 'message_received', phone);
          if (webhookLogs && webhookLogs.length > 0) {
            const convertedWebhookMessages = webhookLogs
              .filter((log) => {
                try {
                  const payload = typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload;
                  return payload.event === 'message_received' && payload.from === phone;
                } catch (e) {
                  return false;
                }
              })
              .map((log) => {
                try {
                  const payload = typeof log.payload === 'string' ? JSON.parse(log.payload) : log.payload;
                  return {
                    id: `webhook_${log.id}`,
                    content: payload?.message?.text || '',
                    type: 'incoming',
                    status: 'delivered',
                    sentAt: log.received_at || log.created_at,
                    createdAt: log.received_at || log.created_at,
                    webhookLogId: log.id,
                    eventType: log.event_type,
                    source: 'webhook_log',
                    rawPayload: payload,
                  };
                } catch (e) {
                  return null;
                }
              })
              .filter((msg) => msg !== null);
            allMessages = [...allMessages, ...convertedWebhookMessages];
          }
        } catch (error) {
          console.error('Error fetching webhook logs:', error);
        }
      }

      // 4. Merge with existing optimistic messages (preserve messages that haven't been confirmed by server yet)
      setMessages(prev => {
        // Get optimistic messages (messages that are not yet confirmed by server)
        // Only keep optimistic messages for the current contact
        const optimisticMessages = prev.filter(m => 
          (m.isOptimistic || m.source === 'optimistic' || m.source === 'api' || m.source === 'inbox_message') && 
          (m.phone === phone || !m.phone) &&
          (
            m.isOptimistic ||
            m.source === 'optimistic' ||
            m.source === 'api' ||
            (m.isTemplate && (m.templatePreview || m.templateName))
          )
        );
        
        // Create a copy of allMessages to avoid mutating the outer variable
        let processedMessages = allMessages.map((msg, index) => {
          // Ensure content field exists (convert from message field if needed)
          const messageContent = msg.content || msg.message || '';
          const resolvedTimestamp = msg.sentAt || msg.createdAt || msg.timestamp || msg.received_at || msg.created_at || null;
          
          if (!msg.id) {
            // Generate a unique ID if missing
            const timestamp = new Date(resolvedTimestamp || Date.now()).getTime();
            const source = msg.source || 'message';
            return {
              ...msg,
              id: `${source}_${timestamp}_${index}`,
              content: messageContent,
              sentAt: msg.sentAt || resolvedTimestamp,
              createdAt: msg.createdAt || resolvedTimestamp
            };
          }
          return {
            ...msg,
            content: messageContent,
            isTemplate: !!(msg.isTemplate || msg.isTemplateSend),
            templateName: msg.templateName || null,
            templatePreview: msg.templatePreview || null,
            sentAt: msg.sentAt || resolvedTimestamp,
            createdAt: msg.createdAt || resolvedTimestamp,
            mediaType:
              msg.mediaType ||
              (MEDIA_TYPES.has(String(msg.messageType || '').toLowerCase())
                ? String(msg.messageType).toLowerCase()
                : msg.type && MEDIA_TYPES.has(String(msg.type).toLowerCase()) && msg.type !== 'incoming' && msg.type !== 'outgoing'
                  ? String(msg.type).toLowerCase()
                  : undefined),
            mediaUrl: msg.mediaUrl || null,
          };
        });
        
        // Combine fetched messages with optimistic messages
        const combinedMessages = [...processedMessages, ...optimisticMessages];
        
        // Helper function to determine message priority (lower = higher priority)
        const getMessagePriority = (msg) => {
          if (msg.waMessageId) return 1;
          // Inbox rows with template snapshot beat plain duplicates from messages table
          if (msg.source === 'inbox_message' && (msg.isTemplateSend || msg.templatePreview || msg.isTemplate)) {
            return 2;
          }
          if (!msg.source || msg.source === 'message' || msg.source === 'socket') return 3;
          if (msg.source === 'inbox_message') return 4;
          if (msg.source === 'meta_message') return 5;
          if (msg.source === 'webhook_log') return 6;
          if (msg.source === 'live_chat') return 9;
          return 7;
        };
        
        // Normalize content for comparison
        const normalizeContent = (content) => {
          return String(content || '').trim().replace(/\s+/g, ' ');
        };
        
        // Normalize phone for comparison
        const normalizePhone = (phone) => {
          return String(phone || '').replace(/\D/g, '');
        };
        
        // Sort all messages by timestamp first
        combinedMessages.sort((a, b) => {
          const dateA = new Date(a.sentAt || a.createdAt || 0);
          const dateB = new Date(b.sentAt || b.createdAt || 0);
          return dateA - dateB;
        });
        
        // Use a Map for efficient deduplication
        const messageMap = new Map();
        const currentPhone = normalizePhone(selectedContact?.phone || phone || '');
        
        for (const msg of combinedMessages) {
          const msgTimestamp = new Date(msg.sentAt || msg.createdAt || 0).getTime();
          const msgContent = normalizeContent(msg.content);
          const msgType = String(msg.type || '');
          const msgContactId = String(msg.contactId || '');
          const msgPhone = normalizePhone(msg.phone || selectedContact?.phone || '');
          
          // Primary dedup key: waMessageId (most reliable, globally unique)
          let dedupKey = null;
          if (msg.waMessageId) {
            dedupKey = `wa_${msg.waMessageId}`;
          } else if (msg.id) {
            const msgIdStr = String(msg.id);
            // For prefixed IDs (meta_, webhook_, temp_), use content-based key
            if (msgIdStr.startsWith('meta_') || msgIdStr.startsWith('webhook_') || msgIdStr.startsWith('temp_')) {
              dedupKey = `${msgType}_${msgContent}_${msgTimestamp}_${msgContactId || msgPhone || currentPhone}`;
            } else {
              // For regular IDs, use ID + contact (same ID might exist in different tables)
              dedupKey = `id_${msgIdStr}_${msgContactId || msgPhone || currentPhone}`;
            }
          } else {
            // Fallback: content + timestamp + contact
            dedupKey = `${msgType}_${msgContent}_${msgTimestamp}_${msgContactId || msgPhone || currentPhone}`;
          }
          
          // Check if we've seen this message before
          const existingMsg = messageMap.get(dedupKey);
          
          if (existingMsg) {
            // Duplicate found - prefer message with higher priority
            const existingPriority = getMessagePriority(existingMsg);
            const newPriority = getMessagePriority(msg);
            
            const existingLen = String(existingMsg.content || '').length;
            const newLen = String(msg.content || '').length;
            const preferNew =
              newPriority < existingPriority ||
              (newPriority === existingPriority && newLen > existingLen);

            if (preferNew) {
              messageMap.set(dedupKey, mergeChatMessages(msg, existingMsg));
            } else {
              messageMap.set(dedupKey, mergeChatMessages(existingMsg, msg));
            }
            continue;
          }
          
          // Also check for content-based duplicates (same content, same contact, close timestamp)
          let isContentDuplicate = false;
          for (const [key, existingMsg] of messageMap.entries()) {
            // Skip ID-based keys for content matching
            if (key.startsWith('wa_') || key.startsWith('id_')) continue;
            
            const existingContent = normalizeContent(existingMsg.content);
            const existingTimestamp = new Date(existingMsg.sentAt || existingMsg.createdAt || 0).getTime();
            const existingContactId = String(existingMsg.contactId || '');
            const existingPhone = normalizePhone(existingMsg.phone || selectedContact?.phone || '');
            
            // Check if same type, same content, same contact, and within 30 seconds
            // Never dedupe on empty/very short content — prevents template metadata leaking.
            if (
              msgContent.length >= 2 &&
              existingMsg.type === msgType &&
                existingContent === msgContent &&
                (existingContactId === msgContactId || existingPhone === msgPhone || 
                 (existingPhone && msgPhone && existingPhone === msgPhone)) &&
                Math.abs(existingTimestamp - msgTimestamp) < 30000) {
              isContentDuplicate = true;
              const existingPriority = getMessagePriority(existingMsg);
              const newPriority = getMessagePriority(msg);
              
              if (newPriority < existingPriority) {
                messageMap.delete(key);
                messageMap.set(dedupKey, mergeChatMessages(msg, existingMsg));
              } else {
                messageMap.set(key, mergeChatMessages(existingMsg, msg));
              }
              break;
            }
          }
          
          if (!isContentDuplicate) {
            messageMap.set(dedupKey, msg);
          }
        }
        
        // Convert map to array
        const uniqueMessages = Array.from(messageMap.values());

        // Final strict dedupe pass across ALL sources to prevent
        // message/message+inbox_message+webhook triplicates in UI.
        const sourcePriority = (msg) => {
          if (msg.waMessageId) return 1;
          if (msg.source === 'inbox_message' && (msg.isTemplateSend || msg.templatePreview || msg.isTemplate)) {
            return 2;
          }
          if (!msg.source || msg.source === 'message' || msg.source === 'socket') return 3;
          if (msg.source === 'inbox_message') return 4;
          if (msg.source === 'meta_message') return 5;
          if (msg.source === 'webhook_log') return 6;
          if (msg.source === 'optimistic' || msg.isOptimistic) return 7;
          if (msg.source === 'live_chat') return 9;
          return 8;
        };

        const finalMessages = [];
        for (const msg of uniqueMessages) {
          const msgTimestamp = new Date(msg.sentAt || msg.createdAt || 0).getTime();
          const msgContent = normalizeContent(msg.content);
          const msgType = String(msg.type || '');
          const msgContactId = String(msg.contactId || '');
          const msgPhone = normalizePhone(msg.phone || selectedContact?.phone || '');

          const duplicateIdx = finalMessages.findIndex((existing) => {
            if (messagesMatchForDedupe(existing, msg)) return true;

            // Exact WA ID match is always duplicate.
            if (existing.waMessageId && msg.waMessageId && existing.waMessageId === msg.waMessageId) {
              return true;
            }

            const exTimestamp = new Date(existing.sentAt || existing.createdAt || 0).getTime();
            const exContent = normalizeContent(existing.content);
            const exType = String(existing.type || '');
            const exContactId = String(existing.contactId || '');
            const exPhone = normalizePhone(existing.phone || selectedContact?.phone || '');

            if (exType !== msgType) return false;
            if (!msgContent || msgContent.length < 2) return false;
            if (exContent !== msgContent) return false;

            const sameContact =
              (exContactId && msgContactId && exContactId === msgContactId) ||
              (exPhone && msgPhone && exPhone === msgPhone);
            if (!sameContact) return false;

            // Same message arriving from different sources usually lands within a few seconds.
            return Math.abs(exTimestamp - msgTimestamp) <= 5000;
          });

          if (duplicateIdx === -1) {
            finalMessages.push(msg);
          } else {
            const existing = finalMessages[duplicateIdx];
            const preferMsg =
              messageHasTemplateCard(msg) && !messageHasTemplateCard(existing)
                ? msg
                : sourcePriority(msg) < sourcePriority(existing)
                  ? msg
                  : existing;
            const other = preferMsg === msg ? existing : msg;
            finalMessages[duplicateIdx] = mergeChatMessages(preferMsg, other);
          }
        }

        finalMessages.sort((a, b) => {
          const dateA = new Date(a.sentAt || a.createdAt || 0);
          const dateB = new Date(b.sentAt || b.createdAt || 0);
          return dateA - dateB;
        });
        
        console.log('Final merged messages count:', finalMessages.length, 'Optimistic:', optimisticMessages.length, 'All messages:', allMessages.length);
        
        // Always update state with the new messages (even if empty)
        // This ensures loading state is cleared and UI shows "No messages" if needed
        return finalMessages;
      });
      
      // Mark messages as read (only if contact exists)
      if (contactData) {
        try {
          await markAsRead(phone);
          // Update inbox list to reflect read status (without loading state)
          fetchInboxList(false);
        } catch (error) {
          console.error('Error marking as read:', error);
        }
      }
      
      console.log('Messages fetched successfully. Total:', allMessages.length);
    } catch (error) {
      console.error('Error fetching messages:', error);
      // Set empty messages on error to prevent UI issues
      setMessages(prev => {
        // Only clear if we have no messages, otherwise keep existing
        if (prev.length === 0) {
          return [];
        }
        return prev;
      });
    } finally {
      // Clear timeout
      clearTimeout(timeoutId);
      // Always clear loading state and reset flag
      setLoadingMessages(false);
      fetchingMessagesRef.current = false;
      console.log('fetchMessages completed, loading cleared');
    }
  };

  // Auto-scroll only when user is already near the bottom (manual scroll up stays put)
  useEffect(() => {
    if (userScrolledUpRef.current && !isNearBottomRef.current) return;
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  const handleChatScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    const threshold = 100;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < threshold;
    isNearBottomRef.current = nearBottom;
    userScrolledUpRef.current = !nearBottom;
  };

  // Refresh messages when contact is selected and join/leave socket rooms
  useEffect(() => {
    if (selectedContact?.phone) {
      userScrolledUpRef.current = false;
      isNearBottomRef.current = true;
      console.log('Contact selected, fetching messages for:', selectedContact.phone);
      
      // Reset loading state when switching contacts
      setLoadingMessages(false);
      fetchingMessagesRef.current = false;
      
      // Join contact room for real-time updates (only if contact has ID)
      if (selectedContact.id) {
        joinContactRoom(selectedContact.id);
      }
      
      // Small delay to ensure state is reset before fetching
      const fetchTimeout = setTimeout(() => {
        // Fetch messages for the selected contact
        fetchMessages(selectedContact.phone, true).catch(err => {
          console.error('Error in fetchMessages:', err);
          setLoadingMessages(false);
          fetchingMessagesRef.current = false;
        });
      }, 100);
      
      // Refresh messages every 10 seconds for active chat (reduced frequency)
      const interval = setInterval(() => {
        // Only refresh if not already fetching
        if (!fetchingMessagesRef.current && selectedContact?.phone) {
          fetchMessages(selectedContact.phone, false).catch(err => {
            console.error('Error in background fetchMessages:', err);
            fetchingMessagesRef.current = false;
          });
        }
      }, 10000);
      
      return () => {
        clearTimeout(fetchTimeout);
        clearInterval(interval);
        // Leave contact room when switching contacts
        if (selectedContact?.id) {
          leaveContactRoom(selectedContact.id);
        }
        // Reset fetching flag when component unmounts or contact changes
        fetchingMessagesRef.current = false;
      };
    } else {
      // No contact selected, clear loading state
      setLoadingMessages(false);
      fetchingMessagesRef.current = false;
    }
  }, [selectedContact?.phone]); // Depend on phone number, which is always available

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setNotificationDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      try {
        await markNotificationAsRead(notification.id);
        setNotifications(prev => 
          prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
        );
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }
    setNotificationDropdownOpen(false);
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const formatTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  const formatMessageTime = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return '';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getMessageTimestamp = (msg) => {
    if (!msg || typeof msg !== 'object') return null;
    return msg.sentAt || msg.createdAt || msg.timestamp || msg.received_at || msg.created_at || msg.updatedAt || null;
  };

  const handleSendMessage = async (e, overrideText) => {
    if (e?.preventDefault) e.preventDefault();
    if (isHistoryPage) {
      alert('Only approved templates can be sent from History. Use Insert to choose a template.');
      return;
    }
    const phone = selectedContact?.phone;
    const textToSend = overrideText !== undefined ? String(overrideText || "") : String(messageText || "");
    if (!textToSend.trim() || !selectedContact || sending) return;

    if (planBlocked) {
      alert('Your plan has ended. Recharge now to send messages.');
      return;
    }

    const currentFlowState = botFlowState[phone];
    const isIntervened = intervenedPhones[phone];

    // Prevent manual sending when bot flow is active (unless admin has intervened)
    if (!isIntervened && currentFlowState && currentFlowState !== 'completed') {
      console.log('🚫 Manual sending disabled - bot is handling conversation');
      alert('Bot is currently handling this conversation. Please wait for the bot to complete.');
      return;
    }

    // Stop typing indicator
    handleTypingStop();

    const text = textToSend.trim();

    setMessageText('');
    setSending(true);

    // Create unique temp ID for optimistic message
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create optimistic message FIRST (before API call)
    const optimisticMessage = {
      id: tempId,
      content: text,
      type: 'outgoing',
      status: 'sent',
      sentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      source: 'optimistic',
      isOptimistic: true,
      phone: phone,
      contactId: selectedContact.id
    };

    // Add optimistic message immediately
    setMessages(prev => {
      // Double-check: avoid duplicates by checking content + time
      const exists = prev.find(m => 
        m.content === text && 
        m.type === 'outgoing' &&
        m.isOptimistic &&
        Math.abs(new Date(m.sentAt || m.createdAt) - new Date(optimisticMessage.sentAt)) < 2000
      );
      if (exists) {
        console.log('⚠️ Duplicate optimistic message prevented');
        return prev;
      }
      return [...prev, optimisticMessage].sort((a, b) => {
        const dateA = new Date(a.sentAt || a.createdAt || 0);
        const dateB = new Date(b.sentAt || b.createdAt || 0);
        return dateA - dateB;
      });
    });

    try {
      // Use ONLY inbox API endpoint (not both sendMetaMessage and sendMessage)
      // This prevents duplicate messages from being created
      const newMessage = await sendMessage(phone, text);
      console.log('✅ Message sent via inbox API:', newMessage);
      
      // Replace optimistic message with real message (if socket hasn't already)
      if (newMessage?.id) {
        setMessages(prev => {
          // Check if socket already added it
          const alreadyExists = prev.find(m => m.id === newMessage.id);
          if (alreadyExists) {
            // Socket already handled it, remove optimistic
            return prev.filter(m => m.id !== tempId);
          }
          
          // Replace optimistic with real message
          return prev.map(m => 
            m.id === tempId 
              ? { ...newMessage, isOptimistic: false, source: 'api' }
              : m
          ).sort((a, b) => {
            const dateA = new Date(a.sentAt || a.createdAt || 0);
            const dateB = new Date(b.sentAt || b.createdAt || 0);
            return dateA - dateB;
          });
        });
      }
      
      // Refresh inbox list to update last message (without loading state)
      fetchInboxList(false);
      
      // Note: Socket event will also update/replace the message if it arrives
    } catch (error) {
      console.error('Error sending message:', error);
      
      // Remove optimistic message on error
      setMessages(prev => prev.filter(m => !(m.id === tempId || (m.isOptimistic && m.content === text))));
      
      alert(`Failed to send message: ${error.message || 'Please try again.'}`);
      setMessageText(text); // Restore message text on error
    } finally {
      setSending(false);
    }
  };

  const handleContactSelect = (contact) => {
    console.log('Contact clicked:', contact);
    const selectedPhone = contact?.phone;
    if (selectedPhone) {
      // Optimistically clear unread badge for opened chat.
      setInboxList((prev) =>
        (prev || []).map((c) =>
          c?.phone === selectedPhone ? { ...c, unreadCount: 0 } : c
        )
      );
      setSectionByTab((prev) => {
        const tabKey = isHistoryPage ? 'history' : inboxTab;
        const nextList = (prev[tabKey] || []).map((c) =>
          c?.phone === selectedPhone ? { ...c, unread_count: 0 } : c
        );
        return { ...prev, [tabKey]: nextList };
      });
    }
    setSelectedContact({
      ...contact,
      id: contact?.contactId ?? contact?.id ?? null,
      contactId: contact?.contactId ?? contact?.id ?? null,
      conversationId:
        contact?.conversationId != null && Number(contact.conversationId) > 0
          ? Number(contact.conversationId)
          : null,
    });
    setMessages([]);
    setCurrentPage(1);
    setHasMoreMessages(true);
    // Note: Don't reset botFlowState here - keep it per contact so flow continues
    
    // The useEffect will handle joining contact room and fetching messages
  };

  handleContactSelectRef.current = handleContactSelect;

  const conversationToContact = (conv) => {
    const phoneKey = normalizePhoneKey(conv.phone);
    const inboxHit = (inboxList || []).find((c) => normalizePhoneKey(c.phone) === phoneKey);
    const resolvedContactId = conv.contactId ?? inboxHit?.contactId ?? inboxHit?.id ?? null;
    const resolvedConversationId =
      conv.conversationId != null && Number(conv.conversationId) > 0
        ? Number(conv.conversationId)
        : conv.id != null && Number(conv.id) > 0
          ? Number(conv.id)
          : inboxHit?.conversationId != null && Number(inboxHit.conversationId) > 0
            ? Number(inboxHit.conversationId)
            : null;
    return {
      id: resolvedContactId,
      contactId: resolvedContactId,
      conversationId: resolvedConversationId,
      phone: conv.phone,
      name: resolveConversationDisplayName(conv, inboxList),
      status: conv.status || 'active',
      chatStatus: conv.status || null,
      agentName: conv.agent_name || null,
      agentId: conv.agent_id ?? null,
      inboxTab,
      lastMessage: conv.last_message || '',
      lastMessageTime: conv.last_message_time || null,
      unreadCount: Number(conv.unread_count) || 0,
      whatsappOptInAt: null,
    };
  };

  const handleSectionChatSelect = (conv) => {
    handleContactSelect(conversationToContact(conv));
  };

  const handleAcceptSectionChat = async (e, conv) => {
    e.stopPropagation();
    if (!conv?.id) return;
    if (isAgentUser && !agentCanPickup) {
      const assignedToMe = Number(conv.agent_id) === Number(user?.id);
      if (!assignedToMe) {
        alert('You do not have permission to pick up unassigned chats.');
        return;
      }
    }
    try {
      await acceptChat(conv.id);
      setInboxTab('active');
      await fetchSectionChats(true);
      handleSectionChatSelect(conv);
    } catch (err) {
      alert(err?.message || 'Failed to accept chat');
    }
  };

  const appendSystemMessageLocal = (systemMessage) => {
    if (!systemMessage) return;
    const text = systemMessage.content || systemMessage.message || '';
    if (!String(text).trim()) return;
    const row = {
      id: systemMessage.id ? `chat_system_${systemMessage.id}` : `chat_system_${Date.now()}`,
      content: text,
      message: text,
      type: 'system',
      source: 'system',
      sender: 'system',
      sentAt: systemMessage.sentAt || systemMessage.createdAt || new Date().toISOString(),
      createdAt: systemMessage.createdAt || systemMessage.sentAt || new Date().toISOString(),
    };
    setMessages((prev) => dedupeChatMessages([...(prev || []), row]));
  };

  const handleTransferToAgent = async (agent) => {
    const convId =
      selectedContact?.conversationId != null && Number(selectedContact.conversationId) > 0
        ? Number(selectedContact.conversationId)
        : selectedContact?.id != null && Number(selectedContact.id) > 0
          ? Number(selectedContact.id)
          : null;
    const phone = selectedContact?.phone;
    if (!convId || !agent?.id || !phone || transferring) return;

    const fromName = String(
      selectedContact?.agentName ||
        (Number(selectedContact?.agentId) === Number(user?.id)
          ? user?.name || user?.email
          : selectedContact?.agentId
            ? `Agent ${selectedContact.agentId}`
            : 'AGENT')
    )
      .trim()
      .toUpperCase();
    const toName = String(agent?.name || agent?.email || `Agent ${agent.id}`)
      .trim()
      .toUpperCase();
    const byName = String(user?.name || user?.email || 'you').trim().toUpperCase();

    setTransferring(true);
    setTransferMenuOpen(false);
    try {
      const result = await assignAgentTakeover(convId, agent.id);
      if (result && result.success === false) {
        alert(result?.message || result?.error || 'Failed to transfer chat');
        return;
      }

      const banner =
        result?.systemMessage ||
        {
          content:
            fromName && fromName !== toName
              ? `Chat transferred from ${fromName} to ${toName} by ${byName}`
              : `Chat transferred to ${toName} by ${byName}`,
        };
      appendSystemMessageLocal(banner);

      setSelectedContact((prev) =>
        prev
          ? {
              ...prev,
              conversationId: convId,
              agentId: agent.id,
              agentName: agent.name || agent.email,
              chatStatus: 'intervened',
            }
          : prev
      );

      await fetchSectionChats(false);
      // Soft reload messages, then ensure transfer banner is still present
      setTimeout(async () => {
        try {
          await fetchMessages(phone, false);
        } catch (_) {}
        const needle = String(banner.content || banner.message || '').trim();
        if (!needle) return;
        setMessages((prev) => {
          const has = (prev || []).some((m) => {
            const t = String(m.content || m.message || '').trim();
            return (
              (m.type === 'system' || m.sender === 'system' || m.source === 'system') &&
              t === needle
            );
          });
          if (has) return prev;
          return dedupeChatMessages([
            ...(prev || []),
            {
              id: banner.id ? `chat_system_${banner.id}` : `chat_system_${Date.now()}`,
              content: needle,
              message: needle,
              type: 'system',
              source: 'system',
              sender: 'system',
              sentAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            },
          ]);
        });
      }, 600);
    } catch (err) {
      alert(err?.message || 'Failed to transfer chat');
    } finally {
      setTransferring(false);
    }
  };

  const handleResolveIntervenedChat = () => {
    const convId = selectedContact?.conversationId;
    const phone = selectedContact?.phone;
    if (!convId || !phone || resolving) return;
    setSelectedDisposition(null);
    setResolveDispositionOpen(true);
  };

  const confirmResolveIntervenedChat = async () => {
    const convId = selectedContact?.conversationId;
    const phone = selectedContact?.phone;
    if (!convId || !phone || resolving || !selectedDisposition) return;
    setResolving(true);
    setTransferMenuOpen(false);
    try {
      const result = await closeChat(convId, selectedDisposition);
      if (result?.systemMessage) {
        appendSystemMessageLocal(result.systemMessage);
      } else {
        const dispositionLabel =
          result?.dispositionLabel || getDispositionLabel(selectedDisposition);
        appendSystemMessageLocal({
          content: `Chat resolved by ${String(user?.name || user?.email || 'you').toUpperCase()} · Disposition: ${dispositionLabel}`,
        });
      }
      // Brief pause so resolve banner is visible in-thread (AiSensy-style)
      await new Promise((r) => setTimeout(r, 900));
      setResolvedConvIds((prev) => new Set([...prev, convId]));
      setSectionByTab((prev) => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          next[key] = (next[key] || []).filter((c) => c.id !== convId);
        }
        return next;
      });
      setResolveDispositionOpen(false);
      setSelectedDisposition(null);
      setSelectedContact(null);
      await fetchSectionChats(false);
    } catch (err) {
      alert(err?.message || 'Failed to resolve chat');
    } finally {
      setResolving(false);
    }
  };

  useEffect(() => {
    setTransferMenuOpen(false);
  }, [inboxTab, selectedContact?.conversationId]);

  useEffect(() => {
    if (!transferMenuOpen) return;
    const onDocClick = (e) => {
      if (transferMenuRef.current && !transferMenuRef.current.contains(e.target)) {
        setTransferMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [transferMenuOpen]);

  useEffect(() => {
    if (loading) return;
    const p = location.state?.openChatContact;
    const phoneNorm = p?.phone != null ? String(p.phone).trim() : '';
    if (!phoneNorm) return;

    const dedupe = `${location.key}:${phoneNorm}`;
    if (lastOpenChatFromContactsRef.current === dedupe) return;
    lastOpenChatFromContactsRef.current = dedupe;

    const digitsOnly = (x) => String(x || '').replace(/\D/g, '');
    const targetDigits = digitsOnly(phoneNorm);

    const inboxEntry = {
      id: p.id ?? p.contactId ?? null,
      contactId: p.id ?? p.contactId ?? null,
      phone: phoneNorm,
      name: (p.name && String(p.name).trim()) || phoneNorm,
      email: p.email ?? null,
      status: p.status ?? 'active',
      lastMessage: '',
      lastMessageTime: null,
      unreadCount: 0,
      whatsappOptInAt: p.whatsappOptInAt ?? null,
    };

    setInboxList((prev) => {
      const list = prev || [];
      const hit = list.some(
        (c) =>
          c?.phone === phoneNorm ||
          (targetDigits.length >= 10 && digitsOnly(c?.phone) === targetDigits)
      );
      if (hit) return list;
      return [inboxEntry, ...list];
    });

    handleContactSelectRef.current?.(inboxEntry);

    navigate('/inbox', { replace: true, state: {} });
  }, [loading, location.key, location.state, navigate]);

  // Fetch approved templates
  const fetchApprovedTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const result = await getTemplates({ status: 'approved', limit: 100 });
      setTemplates(result.templates || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      alert('Failed to fetch templates: ' + error.message);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const appendToMessageText = (insertValue) => {
    const v = String(insertValue || "");
    if (!v.trim()) return;
    setMessageText((prev) => {
      const base = String(prev || "");
      return base.trim() ? `${base} ${v}` : v;
    });
  };

  // Resolve template placeholders like {{1}}, {{2}} to contact-specific values.
  const resolveTemplatePlaceholders = (rawText, contact) => {
    const text = String(rawText || "");
    if (!text.includes('{{')) return text;

    const phone = String(contact?.phone || '').trim();
    const normalizedPhone = phone.replace(/^\+/, '');
    const contactName = String(contact?.name || '').trim();
    const email = String(contact?.email || '').trim();

    const defaultName = contactName && contactName !== phone ? contactName : (normalizedPhone || 'Customer');

    const valueMap = {
      1: defaultName,
      2: normalizedPhone || defaultName,
      3: email || defaultName,
      4: normalizedPhone ? normalizedPhone.slice(-4) : defaultName,
    };

    return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (full, idxRaw) => {
      const idx = Number(idxRaw);
      if (!Number.isFinite(idx)) return full;
      const mapped = valueMap[idx];
      if (mapped && String(mapped).trim()) return String(mapped);
      return defaultName;
    });
  };

  const resolveTemplateHeaderMediaUrl = (template) => extractTemplateHeaderMediaUrl(template);

  const buildTemplateParamsFromTemplate = (template, contact) => {
    const bodyText = String(template?.content || '');
    const explicitParams = Array.isArray(template?.variables)
      ? template.variables.filter((v) => String(v || '').trim() !== '')
      : [];
    const matches = [...bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)];
    const indices = [...new Set(matches.map((m) => Number(m[1])).filter((n) => Number.isFinite(n) && n > 0))].sort(
      (a, b) => a - b
    );
    if (indices.length === 0) {
      return explicitParams;
    }
    return indices.map((idx, arrPos) => String(explicitParams[arrPos] || getTemplateParamValue(idx, contact)));
  };

  const getTemplateParamValue = (idx, contact) => {
    const phone = String(contact?.phone || '').trim();
    const normalizedPhone = phone.replace(/^\+/, '');
    const contactName = String(contact?.name || '').trim();
    const email = String(contact?.email || '').trim();
    const defaultName = contactName && contactName !== phone ? contactName : (normalizedPhone || 'Customer');
    const valueMap = {
      1: defaultName,
      2: normalizedPhone || defaultName,
      3: email || defaultName,
      4: normalizedPhone ? normalizedPhone.slice(-4) : defaultName,
    };
    return String(valueMap[idx] || defaultName);
  };

  const buildTemplateParams = (item, contact) => {
    const bodyText = String(item?.insertValue || '');
    const explicitParams = Array.isArray(item?.templateParams) ? item.templateParams.filter((v) => String(v || '').trim() !== '') : [];
    const matches = [...bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)];
    const indices = [...new Set(matches.map((m) => Number(m[1])).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
    if (indices.length === 0) {
      return explicitParams;
    }
    // Meta requires exact number of params matching placeholders.
    return indices.map((idx, arrPos) => String(explicitParams[arrPos] || getTemplateParamValue(idx, contact)));
  };

  const selectInterveneItemForPreview = (item) => {
    if (isHistoryPage && item?.mode !== 'template') {
      alert('Only approved templates can be sent from History.');
      return;
    }
    const raw = typeof item === 'string' ? item : String(item?.insertValue || '');
    const resolvedText = resolveTemplatePlaceholders(raw, selectedContact) || raw || String(item?.label || '');
    if (!resolvedText && item?.mode !== 'template') return;

    let templatePreview = null;
    if (item && typeof item === 'object' && item.mode === 'template') {
      const templateName = String(item.templateName || '').trim();
      const catalogHit = templateCatalog.get(normalizeTemplateKey(templateName));
      const needsHeaderMedia =
        templateNeedsHeaderMedia(catalogHit) || templateNeedsHeaderMedia(item);
      const stripStoredHeaderMediaVars = (vars) => {
        if (!vars || typeof vars !== 'object' || Array.isArray(vars)) return {};
        const { headerMediaUrl, header_media_url, ...rest } = vars;
        return rest;
      };
      const imageVars = needsHeaderMedia
        ? {
            templateType:
              String(catalogHit?.variables?.templateType || item?.variables?.templateType || 'image')
                .toLowerCase() || 'image',
          }
        : {};
      const previewSource = catalogHit
        ? {
            ...catalogHit,
            variables: {
              ...stripStoredHeaderMediaVars(
                catalogHit.variables &&
                typeof catalogHit.variables === 'object' &&
                !Array.isArray(catalogHit.variables)
                  ? catalogHit.variables
                  : {}
              ),
              ...imageVars,
            },
          }
        : {
            name: templateName,
            content: resolvedText,
            variables: {
              ...stripStoredHeaderMediaVars(
                item.variables && typeof item.variables === 'object' && !Array.isArray(item.variables)
                  ? item.variables
                  : {}
              ),
              ...imageVars,
            },
            components: Array.isArray(item.components) ? item.components : undefined,
          };
      templatePreview = buildTemplatePreview(previewSource, {
        content: resolvedText,
        templateName,
        isTemplate: true,
      });
      if (templatePreview && needsHeaderMedia) {
        const fmt =
          String(templatePreview.headerFormat || '').toUpperCase() ||
          (imageVars.templateType === 'video'
            ? 'VIDEO'
            : imageVars.templateType === 'document'
              ? 'DOCUMENT'
              : 'IMAGE');
        templatePreview = {
          ...templatePreview,
          headerFormat: fmt,
          headerImageUrl: null,
          header: { type: fmt === 'IMAGE' ? 'image' : fmt.toLowerCase() },
        };
      }
    }

    setIntervenePreviewItem({
      ...(typeof item === 'object' && item ? item : { insertValue: raw }),
      resolvedText: resolvedText || String(item?.templateName || 'Template'),
      headerMediaUrl: null,
      templatePreview,
    });
  };

  const cancelIntervenePreview = () => {
    setIntervenePreviewItem(null);
  };

  const closeIntervenePicker = () => {
    setInterveneQuickPickerOpen(false);
    setIntervenePreviewItem(null);
    setInsertOptionSearch('');
  };

  const confirmInterveneSend = async () => {
    const item = intervenePreviewItem;
    if (!item) return;
    try {
      if (isHistoryPage && item?.mode !== 'template') {
        alert('Only approved templates can be sent from History.');
        return;
      }
      // Template option: send as real approved template (not plain text insert).
      if (item && typeof item === 'object' && item.mode === 'template') {
        const phone = selectedContact?.phone;
        if (!phone) return;
        const templateName = String(item.templateName || '').trim();
        if (!templateName) {
          throw new Error('Template name is missing');
        }
        const nowIso = new Date().toISOString();
        const resolvedBody = String(item.resolvedText || resolveTemplatePlaceholders(String(item?.insertValue || ''), selectedContact));
        const catalogHit = templateCatalog.get(normalizeTemplateKey(templateName));
        const headerMediaUrl = item.headerMediaUrl || null;
        const needsHeaderMedia =
          templateNeedsHeaderMedia(catalogHit) ||
          templateNeedsHeaderMedia(item) ||
          templateHasImageHeader(catalogHit) ||
          templateHasImageHeader(item) ||
          String(item.templatePreview?.headerFormat || '').toUpperCase() === 'IMAGE';
        if (needsHeaderMedia && !headerMediaUrl) {
          throw new Error('Choose header media from Media Library before sending this template.');
        }

        setInterveneQuickPickerOpen(false);
        setIntervenePreviewItem(null);
        setSelectedInterveneCannedId("");
        setSelectedInterveneTemplateId("");

        const isImageTemplate = needsHeaderMedia;
        const imageVars = isImageTemplate
          ? {
              ...(headerMediaUrl ? { headerMediaUrl, header_media_url: headerMediaUrl } : {}),
              templateType: 'image',
            }
          : {};
        const previewSource = catalogHit
          ? {
              ...catalogHit,
              variables: {
                ...(catalogHit.variables &&
                typeof catalogHit.variables === 'object' &&
                !Array.isArray(catalogHit.variables)
                  ? catalogHit.variables
                  : {}),
                ...imageVars,
              },
            }
          : item;
        let templatePreview = previewSource
          ? buildTemplatePreview(previewSource, {
              content: resolvedBody,
              templateName,
              isTemplate: true,
              mediaUrl: headerMediaUrl,
              headerImageUrl: headerMediaUrl,
            })
          : null;
        if (templatePreview && isImageTemplate) {
          templatePreview = {
            ...templatePreview,
            headerFormat: templatePreview.headerFormat || 'IMAGE',
            headerImageUrl: templatePreview.headerImageUrl || headerMediaUrl || null,
            header:
              templatePreview.header ||
              (headerMediaUrl ? { type: 'image', url: headerMediaUrl } : null),
          };
        }
        const optimisticTemplateMessage = {
          id: `template_quick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          content: resolvedBody,
          type: 'outgoing',
          messageType: 'template',
          status: 'sent',
          sentAt: nowIso,
          createdAt: nowIso,
          source: 'inbox_message',
          isTemplate: true,
          isTemplateSend: true,
          templateName,
          templatePreview,
          templateSnapshot: templatePreview,
          mediaUrl: headerMediaUrl || null,
          phone,
          contactId: selectedContact?.id || null
        };
        setMessages((prev) => {
          const updated = [...prev, optimisticTemplateMessage].sort((a, b) => {
            const dateA = new Date(getMessageTimestamp(a) || 0);
            const dateB = new Date(getMessageTimestamp(b) || 0);
            return dateA - dateB;
          });
          return updated;
        });
        await sendTemplateMessage(
          phone,
          templateName,
          item.templateLanguage || 'en_US',
          buildTemplateParams(item, selectedContact),
          headerMediaUrl
        );
        fetchInboxList(false);
        setTimeout(() => {
          if (selectedContact?.phone) {
            fetchMessages(selectedContact.phone, false).catch(() => {});
          }
        }, 500);
        return;
      }

      setInterveneQuickPickerOpen(false);
      setIntervenePreviewItem(null);
      setSelectedInterveneCannedId("");
      setSelectedInterveneTemplateId("");

      const insertValue = typeof item === 'string' ? item : String(item?.insertValue || '');
      const resolvedText = String(item?.resolvedText || resolveTemplatePlaceholders(insertValue, selectedContact));
      await handleSendMessage(null, resolvedText);
    } catch (e) {
      if (String(e?.message || '').includes('Upload a header')) {
        alert(e.message);
        return;
      }
      setInterveneQuickPickerOpen(false);
      setIntervenePreviewItem(null);
      setMessages((prev) =>
        prev.filter((m) => !(m.source === 'optimistic' && m.isTemplate && m.phone === selectedContact?.phone))
      );
      if (e?.message) {
        alert(`Failed to send: ${e.message}`);
      }
    }
  };

  const fetchInterveneInsertOptions = async () => {
    try {
      setLoadingInterveneOptions(true);
      setInterveneOptionsError("");

      const [cannedRes, localApprovedRes, metaResult] = await Promise.all([
        axios.get("/canned-messages"),
        getTemplates({ status: "approved", limit: 200 }),
        axios.get("/templates/meta").catch(() => ({ data: { templates: [] } })),
      ]);
      const metaRes = metaResult;

      const cannedMessages = Array.isArray(cannedRes?.data?.messages) ? cannedRes.data.messages : [];
      setInterveneCannedOptions(
        cannedMessages.map((m) => ({
          id: String(m.id),
          label: `${m.name} (${m.type})`,
          insertValue:
            m.type === "TEXT"
              ? String(m.text || "")
              : m.type === "IMAGE"
                ? `[image:${String(m.text || "").trim() || "image"}]`
                : `[file:${String(m.text || "").trim() || "file"}]`,
        }))
      );

      const localApprovedTemplates = Array.isArray(localApprovedRes?.templates)
        ? localApprovedRes.templates
        : [];

      const localOptions = localApprovedTemplates
        .filter((t) => String(t?.status || "").toLowerCase() === "approved")
        .map((t) => ({
          id: `local_${t.id}`,
          label: String(t?.name || "Template"),
          insertValue: String(t?.content || ""),
          mode: 'template',
          templateName: String(t?.name || ''),
          templateLanguage: String(t?.language || 'en_US'),
          templateParams: Array.isArray(t?.variables) ? t.variables : [],
          headerMediaUrl: extractTemplateHeaderMediaUrl(t),
          variables:
            t?.variables && typeof t.variables === 'object' && !Array.isArray(t.variables)
              ? t.variables
              : null,
          components: Array.isArray(t?.components)
            ? t.components
            : Array.isArray(t?.variables?.components)
              ? t.variables.components
              : undefined,
        }));

      const metaTemplates = Array.isArray(metaRes?.data?.templates) ? metaRes.data.templates : [];
      const localByName = new Map(
        localApprovedTemplates.map((t) => [normalizeTemplateKey(t?.name), t])
      );
      const metaOptions = metaTemplates
        .filter((t) => String(t?.metaStatus || t?.status || "").toUpperCase() === "APPROVED")
        .map((t) => {
          const body = t?.components?.find((c) => String(c?.type || "").toUpperCase() === "BODY");
          const bodyText = body?.text || t?.name || "";
          const localMatch = localByName.get(normalizeTemplateKey(t?.name));
          const catalogHit = templateCatalog.get(normalizeTemplateKey(t?.name));
          return {
            id: `meta_${t.id}`,
            label: String(t?.name || "Meta Template"),
            insertValue: String(bodyText),
            mode: 'template',
            templateName: String(t?.name || ''),
            templateLanguage: String(t?.language || t?.language_code || 'en_US'),
            templateParams: [],
            headerMediaUrl:
              extractTemplateHeaderMediaUrl(localMatch) ||
              extractTemplateHeaderMediaUrl(catalogHit) ||
              extractTemplateHeaderMediaUrl(t) ||
              null,
            variables:
              (localMatch?.variables &&
              typeof localMatch.variables === 'object' &&
              !Array.isArray(localMatch.variables)
                ? localMatch.variables
                : null) ||
              (t?.variables && typeof t.variables === 'object' && !Array.isArray(t.variables)
                ? t.variables
                : null),
            components: Array.isArray(t?.components) ? t.components : undefined,
          };
        });

      setInterveneTemplateOptions([...localOptions, ...metaOptions]);
      interveneOptionsLoadedRef.current = true;
    } catch (e) {
      setInterveneOptionsError(e?.response?.data?.message || e?.message || "Failed to load intervene options");
    } finally {
      setLoadingInterveneOptions(false);
    }
  };

  useEffect(() => {
    if (!interveneQuickPickerOpen) return;
    fetchInterveneInsertOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interveneQuickPickerOpen, activeProjectId]);

  useEffect(() => {
    if (!interveneQuickPickerOpen) return;
    const onDocMouseDown = (e) => {
      const el = interveneQuickPickerRef.current;
      if (!el) return;
      if (e.target?.closest?.('[data-flow-media-library]')) return;
      if (!el.contains(e.target)) {
        closeIntervenePicker();
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [interveneQuickPickerOpen]);

  // Handle Start Bot flow - show template modal
  const handleStartBot = async () => {
    if (!selectedContact || sending) return;
    
    // Fetch approved templates and show modal
    await fetchApprovedTemplates();
    setShowTemplateModal(true);
  };

  // Handle template selection
  const handleTemplateSelect = async (template) => {
    if (!selectedContact || sending) return;

    const phone = selectedContact.phone;
    setSending(true);
    setShowTemplateModal(false);

    try {
      // Send template via API to user's phone
      const templateName = template.name || template.templateName;
      const templateLanguage = template.language || 'en_US';
      const templateParams = buildTemplateParamsFromTemplate(template, selectedContact);
      const headerMediaUrl = resolveTemplateHeaderMediaUrl(template);

      const response = await sendTemplateMessage(
        phone,
        templateName,
        templateLanguage,
        templateParams,
        headerMediaUrl
      );

      // Get template content for display
      const templateContent = resolveTemplatePlaceholders(
        template.content || `Template: ${templateName}`,
        selectedContact
      );
      const catalogHit = templateCatalog.get(normalizeTemplateKey(templateName)) || template;
      const templatePreview =
        response?.templatePreview ||
        response?.templateSnapshot ||
        buildTemplatePreview(catalogHit, {
          content: templateContent,
          templateName,
          isTemplate: true,
          mediaUrl: headerMediaUrl,
        });
      
      const templateMessage = {
        id: response.messageId ? `inbox_${response.messageId}` : `template_${Date.now()}`,
        content: templatePreview?.body || templateContent,
        type: 'outgoing',
        messageType: 'template',
        status: 'sent',
        sentAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        source: 'inbox_message',
        phone: phone,
        contactId: selectedContact.id,
        waMessageId: response.waMessageId || null,
        isTemplate: true,
        isTemplateSend: true,
        templateName: templateName,
        templatePreview,
        templateSnapshot: templatePreview,
        header: templatePreview?.header || (templatePreview?.headerImageUrl ? { type: 'image', url: templatePreview.headerImageUrl } : null),
        footer: templatePreview?.footer,
        buttons: templatePreview?.buttons,
        mediaUrl: templatePreview?.headerImageUrl || templatePreview?.header?.url || null,
      };

      setMessages(prev => {
        // Check if message already exists
        const exists = prev.find(m => 
          m.id === templateMessage.id || 
          (m.waMessageId && m.waMessageId === templateMessage.waMessageId) ||
          (m.content === templateContent && m.type === 'outgoing' && m.isTemplate && Math.abs(new Date(m.sentAt || m.createdAt) - new Date(templateMessage.sentAt)) < 5000)
        );
        if (exists) {
          console.log('Template message already exists, skipping duplicate');
          return prev;
        }
        
        console.log('Adding template message to chat:', templateMessage);
        const updatedMessages = [...prev, templateMessage].sort((a, b) => {
          const dateA = new Date(a.sentAt || a.createdAt || 0);
          const dateB = new Date(b.sentAt || b.createdAt || 0);
          return dateA - dateB;
        });
        
        return updatedMessages;
      });
      
      // Set flow state to wait for user response
      setBotFlowState(prev => ({
        ...prev,
        [phone]: 'template_sent'
      }));

      // Refresh inbox list
      fetchInboxList(false);
      
      // Refresh messages after a short delay to ensure we get the saved message from backend
      // Socket will also update it when it arrives
      setTimeout(() => {
        if (selectedContact?.phone) {
          fetchMessages(selectedContact.phone, false).catch(err => {
            console.error('Error refreshing messages after template send:', err);
          });
        }
      }, 1000);
    } catch (error) {
      console.error('Error sending template:', error);
      alert('Failed to send template: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  // Handle bot button click
  const handleBotButtonClick = async (buttonValue, message) => {
    if (!selectedContact || sending) return;

    const phone = selectedContact.phone;
    const currentFlowState = botFlowState[phone];

    // Handle YES button click
    if (currentFlowState === 'template_sent' && buttonValue === 'yes') {
      setSending(true);
      try {
        const response = await sendChatbotMessage('__YES_CLICKED__', 0, currentFlowState);
        
        // Add user's selection as outgoing message
        const userMessage = {
          id: `user_${Date.now()}`,
          content: 'YES',
          type: 'outgoing',
          status: 'sent',
          sentAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          source: 'user',
          phone: phone,
          contactId: selectedContact.id
        };

        // Add bot's response as incoming message
        const botResponse = {
          id: `bot_${Date.now()}`,
          content: response.message || "Great! To help you better, could you please tell me your current salary? (Please enter numbers only, e.g., 50000)",
          type: 'incoming',
          status: 'read',
          sentAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          source: 'bot',
          phone: phone,
          contactId: selectedContact.id
        };

        setMessages(prev => {
          const newMessages = [...prev, userMessage, botResponse];
          return newMessages.sort((a, b) => {
            const dateA = new Date(a.sentAt || a.createdAt || 0);
            const dateB = new Date(b.sentAt || b.createdAt || 0);
            return dateA - dateB;
          });
        });

        setBotFlowState(prev => ({
          ...prev,
          [phone]: response.flowState || 'asking_salary'
        }));

        fetchInboxList(false);
      } catch (error) {
        console.error('Error handling bot button:', error);
        alert('Failed to process: ' + error.message);
      } finally {
        setSending(false);
      }
    }
  };

  // Handle salary input in message
  const handleSalaryInput = async (salaryText) => {
    if (!selectedContact || sending) return;

    const phone = selectedContact.phone;
    const currentFlowState = botFlowState[phone];

    if (currentFlowState === 'asking_salary' || currentFlowState === 'salary_retry') {
      setSending(true);
      try {
        const response = await sendChatbotMessage(`__SALARY_INPUT__:${salaryText}`, 0, currentFlowState);
        
        if (response.isValid === false) {
          // Invalid salary - add bot error message
          const botError = {
            id: `bot_${Date.now()}`,
            content: response.message || "Please enter a valid salary amount. It should be a positive number (e.g., 50000).",
            type: 'incoming',
            status: 'read',
            sentAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            source: 'bot',
            phone: phone,
            contactId: selectedContact.id
          };

          setMessages(prev => {
            const newMessages = [...prev, botError];
            return newMessages.sort((a, b) => {
              const dateA = new Date(a.sentAt || a.createdAt || 0);
              const dateB = new Date(b.sentAt || b.createdAt || 0);
              return dateA - dateB;
            });
          });

          setBotFlowState(prev => ({
            ...prev,
            [phone]: 'salary_retry'
          }));
        } else {
          // Valid salary - continue flow
          const botSuccess = {
            id: `bot_${Date.now()}`,
            content: response.message || "Thank you! Your information has been recorded. How else can I help you?",
            type: 'incoming',
            status: 'read',
            sentAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            source: 'bot',
            phone: phone,
            contactId: selectedContact.id,
            buttons: response.suggestions?.map((sug, idx) => ({
              id: Date.now() + idx,
              text: sug,
              value: sug.toLowerCase().replace(/\s+/g, '_')
            })) || undefined
          };

          setMessages(prev => {
            const newMessages = [...prev, botSuccess];
            return newMessages.sort((a, b) => {
              const dateA = new Date(a.sentAt || a.createdAt || 0);
              const dateB = new Date(b.sentAt || b.createdAt || 0);
              return dateA - dateB;
            });
          });

          setBotFlowState(prev => ({
            ...prev,
            [phone]: response.flowState || 'completed'
          }));
        }

        fetchInboxList(false);
      } catch (error) {
        console.error('Error handling salary input:', error);
        alert('Failed to process: ' + error.message);
      } finally {
        setSending(false);
      }
    }
  };

  // Typing indicator handlers
  const handleTypingStart = useCallback(() => {
    if (!selectedContact?.id || !user?.id) return;
    
    sendTypingStart(selectedContact.id, user.id);
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingStop(selectedContact.id, user.id);
    }, 3000);
  }, [selectedContact, user]);

  const handleTypingStop = useCallback(() => {
    if (!selectedContact?.id || !user?.id) return;
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    sendTypingStop(selectedContact.id, user.id);
  }, [selectedContact, user]);

  // Handle message input with typing indicator
  const handleMessageInputChange = (e) => {
    setMessageText(e.target.value);
    handleTypingStart();
  };

  // Load more messages (pagination)
  const loadMoreMessages = async () => {
    const phone = selectedContact?.phone;
    const contactId = selectedContact?.contactId || selectedContact?.id;
    const conversationId = selectedContact?.conversationId;
    const hasRealContactId =
      contactId &&
      (!conversationId || Number(contactId) !== Number(conversationId));

    if (!hasRealContactId || !phone || loadingMessages || !hasMoreMessages) {
      if (!hasRealContactId) setHasMoreMessages(false);
      return;
    }

    try {
      setLoadingMessages(true);
      const nextPage = currentPage + 1;
      const result = await getPaginatedMessages(contactId, nextPage, 50, phone);
      
      if (result.messages && result.messages.length > 0) {
        setMessages(prev => [...result.messages, ...prev]);
        setCurrentPage(nextPage);
        setHasMoreMessages(result.pagination.page < result.pagination.pages);
      } else {
        setHasMoreMessages(false);
      }
    } catch (error) {
      console.error('Error loading more messages:', error);
      setHasMoreMessages(false);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Handle media upload
  const handleMediaUpload = async (file) => {
    if (!selectedContact?.id) return;

    try {
      setUploadingMedia(true);
      const uploadResult = await uploadMedia(selectedContact.id, file);
      
      // Send media message
      await sendMediaMessage(selectedContact.id, uploadResult.media, '');
      
      setShowMediaPicker(false);
      fetchInboxList(false);
      
      // Refresh messages
      setTimeout(() => {
        fetchMessages(selectedContact.phone, false);
      }, 500);
    } catch (error) {
      console.error('Error uploading media:', error);
      alert('Failed to upload media: ' + error.message);
    } finally {
      setUploadingMedia(false);
    }
  };

  const filteredSectionList = (() => {
    let list = sectionConversations.filter((conv) => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      const phone = String(conv.phone || '').toLowerCase();
      const name = String(conv.customer_name || '').toLowerCase();
      const agentFromList = (agentsList || []).find((a) => Number(a?.id) === Number(conv?.agent_id));
      const agentName = String(
        conv.agent_name || agentFromList?.name || agentFromList?.email || ''
      ).toLowerCase();
      return phone.includes(query) || name.includes(query) || agentName.includes(query);
    });

    const appliedAttrRows = (filterApplied?.attrs || []).filter(
      (r) => r?.attribute && String(r.value ?? '') !== ''
    );
    const filteringIntervenedYes = appliedAttrRows.some((r) => {
      if (r.attribute !== 'intervened') return false;
      const wantsYes = r.value === 'yes';
      return r.operator === 'is_not' ? !wantsYes : wantsYes;
    });
    const filteringByAgent = appliedAttrRows.some((r) => r.attribute === 'intervened_by_agent');

    // When filtering for intervened chats / agent, include intervened list even if
    // the current tab is Active/Requesting (otherwise matches look "missing").
    if (!isHistoryPage && (filteringIntervenedYes || filteringByAgent)) {
      const intervenedRows = sectionByTab.intervened || [];
      const byId = new Map();
      [...list, ...intervenedRows].forEach((c) => {
        const key = c?.id != null ? `id:${c.id}` : `p:${normalizePhoneKey(c?.phone)}`;
        if (key !== 'p:' && !byId.has(key)) byId.set(key, c);
      });
      list = [...byId.values()];
    } else if (!isHistoryPage && inboxTab === 'intervened') {
      list = list.filter((c) => String(c?.status || '').toLowerCase() === 'intervened');
      if (user?.id) {
        const uid = Number(user.id);
        if (intervenedFilter === 'me') {
          list = list.filter((c) => Number(c.agent_id) === uid);
        } else if (intervenedFilter === 'other') {
          list = list.filter((c) => c.agent_id != null && Number(c.agent_id) !== uid);
        } else if (intervenedFilter.startsWith('agent:')) {
          const aid = Number(intervenedFilter.split(':')[1]);
          list = list.filter((c) => Number(c.agent_id) === aid);
        }
      }
    } else if (!isHistoryPage && inboxTab === 'active') {
      list = list.filter((c) => String(c?.status || '').toLowerCase() === 'active');
    } else if (!isHistoryPage && inboxTab === 'requesting') {
      list = list.filter((c) => String(c?.status || '').toLowerCase() === 'requesting');
    }

    // AiSensy-style filters (applied only after Apply)
    if (filterApplied) {
      const getContactMeta = (phone) => {
        for (const key of phoneLookupKeys(phone)) {
          if (filterContactMeta.has(key)) return filterContactMeta.get(key);
        }
        return null;
      };
      const phoneInTagSet = (phone, tagId) => {
        const set = filterTagPhoneSets.get(String(tagId));
        if (!set || set.size === 0) return false;
        return phoneLookupKeys(phone).some((key) => set.has(key));
      };

      const lastSeenRange = resolveInboxDateRange(
        filterApplied.lastSeenPreset,
        filterApplied.lastSeenFrom,
        filterApplied.lastSeenTo,
        'lastSeen'
      );
      if (lastSeenRange.from || lastSeenRange.to) {
        list = list.filter((c) => {
          const ts = parseInboxTimestamp(c.last_message_time || c.lastMessageTime);
          // Keep chats that are already in this tab when timestamp is missing
          // (backend active/requesting lists are already time-scoped).
          if (!ts) return true;
          if (lastSeenRange.from && ts < lastSeenRange.from.getTime()) return false;
          if (lastSeenRange.to && ts > lastSeenRange.to.getTime()) return false;
          return true;
        });
      }

      const createdRange = resolveInboxDateRange(
        filterApplied.createdPreset,
        filterApplied.createdFrom,
        filterApplied.createdTo,
        'created'
      );
      const needsCreatedMeta = Boolean(createdRange.from || createdRange.to);
      const attrRows = (filterApplied.attrs || []).filter(
        (r) => r?.attribute && String(r.value ?? '') !== ''
      );
      const needsContactAttrs = attrRows.some(
        (r) => r.attribute === 'opted_in' || r.attribute === 'tags'
      );

      // Wait for contact enrichment before applying contact-based filters
      // (avoids briefly / permanently showing an empty list).
      if ((needsCreatedMeta || needsContactAttrs) && filterContactsLoading) {
        // keep current list until meta is ready
      } else {
        if (needsCreatedMeta) {
          list = list.filter((c) => {
            const meta = getContactMeta(c.phone);
            const ts = parseInboxTimestamp(meta?.createdAt);
            if (!ts) return false;
            if (createdRange.from && ts < createdRange.from.getTime()) return false;
            if (createdRange.to && ts > createdRange.to.getTime()) return false;
            return true;
          });
        }

        if (attrRows.length) {
          list = list.filter((c) => {
            const meta = getContactMeta(c.phone);
            const rowMatches = attrRows.map((row) => {
              const opIs = row.operator !== 'is_not';
              let hit = false;
              if (row.attribute === 'intervened') {
                const isIntervened = String(c?.status || '').toLowerCase() === 'intervened';
                hit = row.value === 'yes' ? isIntervened : !isIntervened;
              } else if (row.attribute === 'intervened_by_agent') {
                hit =
                  c.agent_id != null &&
                  String(c.agent_id) !== '' &&
                  Number(c.agent_id) === Number(row.value);
              } else if (row.attribute === 'opted_in') {
                // If contact meta is missing, fall back to inbox list / selected fields
                let opted = meta?.optedIn;
                if (opted == null) {
                  const inboxHit = (inboxList || []).find((x) => phonesMatchKey(x.phone, c.phone));
                  opted = Boolean(
                    inboxHit?.whatsappOptInAt || c.whatsappOptInAt || c.opted_in || c.optedIn
                  );
                }
                hit = row.value === 'yes' ? Boolean(opted) : !opted;
              } else if (row.attribute === 'tags') {
                hit = phoneInTagSet(c.phone, row.value);
              }
              return opIs ? hit : !hit;
            });
            let result = rowMatches[0];
            for (let i = 1; i < rowMatches.length; i += 1) {
              const join = attrRows[i - 1]?.join === 'or' ? 'or' : 'and';
              result = join === 'or' ? result || rowMatches[i] : result && rowMatches[i];
            }
            return result;
          });
        }
      }
    }

    list = list.filter((c) => !resolvedConvIds.has(c.id));
    return list;
  })();

  const listFilterActiveCount = countInboxAppliedFilters(filterApplied);

  const openListFilterPanel = () => {
    setFilterDraft(cloneInboxFilterDraft(filterApplied || emptyInboxFilterDraft()));
    setListFilterOpen(true);
  };

  const updateFilterDraft = (patch) => {
    setFilterDraft((prev) => ({ ...prev, ...patch }));
  };

  const updateFilterAttrRow = (id, patch) => {
    setFilterDraft((prev) => ({
      ...prev,
      attrs: (prev.attrs || []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const addFilterAttrRow = () => {
    setFilterDraft((prev) => ({
      ...prev,
      attrs: [...(prev.attrs || []), newInboxFilterAttrRow()],
    }));
  };

  const removeFilterAttrRow = (id) => {
    setFilterDraft((prev) => {
      const next = (prev.attrs || []).filter((r) => r.id !== id);
      return { ...prev, attrs: next.length ? next : [newInboxFilterAttrRow()] };
    });
  };

  const applyListFilters = () => {
    const draft = cloneInboxFilterDraft(filterDraft);
    const hasSomething =
      draft.lastSeenPreset ||
      draft.lastSeenFrom ||
      draft.lastSeenTo ||
      draft.createdPreset ||
      draft.createdFrom ||
      draft.createdTo ||
      (draft.attrs || []).some((r) => r.attribute && String(r.value ?? '') !== '');
    setFilterApplied(hasSomething ? draft : null);
    setListFilterOpen(false);
  };

  const clearListFilters = () => {
    const empty = emptyInboxFilterDraft();
    setFilterDraft(empty);
    setFilterApplied(null);
  };

  const setLastSeenPreset = (preset) => {
    const range = resolveInboxDateRange(preset, '', '', 'lastSeen');
    updateFilterDraft({
      lastSeenPreset: preset,
      lastSeenFrom: toDateInputValue(range.from),
      lastSeenTo: toDateInputValue(range.to),
    });
  };

  const setCreatedPreset = (preset) => {
    const range = resolveInboxDateRange(preset, '', '', 'created');
    updateFilterDraft({
      createdPreset: preset,
      createdFrom: toDateInputValue(range.from),
      createdTo: toDateInputValue(range.to),
    });
  };

  const intervenedFilterOptions = (() => {
    const uid = Number(user?.id);
    const all = (sectionConversations || []).filter(
      (c) => String(c?.status || '').toLowerCase() === 'intervened'
    );
    const countFor = (predicate) => all.filter(predicate).length;
    const agentSearch = intervenedAgentSearch.trim().toLowerCase();
    const agents = (agentsList || []).filter((a) => {
      if (!agentSearch) return true;
      const label = `${a?.name || ''} ${a?.email || ''}`.toLowerCase();
      return label.includes(agentSearch);
    });
    return {
      me: countFor((c) => Number(c.agent_id) === uid),
      any: all.length,
      other: countFor((c) => c.agent_id != null && Number(c.agent_id) !== uid),
      agents,
    };
  })();

  const intervenedFilterTitle = (() => {
    if (intervenedFilter === 'me') return 'Intervened By Me';
    if (intervenedFilter === 'any') return 'Intervened By Any';
    if (intervenedFilter === 'other') return 'Intervened By Other';
    if (intervenedFilter.startsWith('agent:')) {
      const aid = Number(intervenedFilter.split(':')[1]);
      const agent = (agentsList || []).find((a) => Number(a.id) === aid);
      const name = agent?.name || agent?.email || 'Agent';
      return `Intervened By ${name}`;
    }
    return 'Intervened';
  })();

  const sectionTabCount = filteredSectionList.length;

  const isHistoryTab = isHistoryPage;
  const isIntervenedTab = !isHistoryPage && inboxTab === 'intervened';
  const selectedPhone = selectedContact?.phone;
  const contactStatusLower = String(selectedContact?.chatStatus || selectedContact?.status || '').toLowerCase();
  const isIntervenedChat =
    isIntervenedTab ||
    (selectedPhone && intervenedPhones[selectedPhone]) ||
    contactStatusLower === 'intervened';
  const isHistoryIntervened =
    isHistoryTab &&
    Boolean(selectedPhone) &&
    (Boolean(intervenedPhones[selectedPhone]) || contactStatusLower === 'intervened');
  const planBlocked = planInfoLoaded && !planInfo?.active;
  const canHumanReply =
    !planBlocked &&
    Boolean(selectedContact?.conversationId || selectedContact?.phone) &&
    (isHistoryIntervened ||
      (!isHistoryTab &&
        (isIntervenedChat || contactStatusLower === 'active' || inboxTab === 'active')));
  const showAdminIntervenedActions =
    isAdminOrManager &&
    Boolean(selectedContact?.conversationId) &&
    !isHistoryTab &&
    (isIntervenedTab ||
      contactStatusLower === 'intervened' ||
      contactStatusLower === 'active' ||
      inboxTab === 'active');
  const showInterveneBar =
    selectedContact?.phone &&
    !canHumanReply &&
    ((isHistoryTab && !isHistoryIntervened) ||
      (!isHistoryTab &&
        !isIntervenedTab &&
        messages.some((m) => m.type === 'incoming')));

  if (loading && !user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50 flex items-center justify-center">
        <div className="text-center motion-enter">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-sky-200 border-t-sky-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const userName = user?.name || 'User';
  const userInitial = userName.charAt(0).toUpperCase();
  const headerAvatar = user?.avatar || readSessionUser()?.avatar || '';

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Intervention popup for admin when agent clicks Intervene */}
      {interventionAlert && isAdminOrManager && (
        <div className="motion-enter fixed top-4 left-1/2 transform -translate-x-1/2 z-[9999] px-5 py-4 md:px-6 bg-gradient-to-r from-sky-600 via-sky-600 to-blue-700 text-white rounded-2xl shadow-xl shadow-sky-900/25 ring-1 ring-white/20 flex items-center gap-3 min-w-[320px] max-w-md backdrop-blur-sm">
          <span className="font-semibold shrink-0">Intervention</span>
          <span className="text-sm text-sky-50">
            <strong className="text-white">{interventionAlert.agentName}</strong> intervened
            {interventionAlert.dateTime && (
              <> at {new Date(interventionAlert.dateTime).toLocaleString()}</>
            )}
            {interventionAlert.phone && <> (phone: {interventionAlert.phone})</>}.
          </span>
          <button
            type="button"
            onClick={() => setInterventionAlert(null)}
            className="ml-auto p-2 rounded-xl hover:bg-white/15 active:scale-95 transition-all duration-200"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      {/* Top Navigation Bar */}
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
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

          <Link to="/dashboard" className="flex items-center gap-3 transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] shrink-0"><BrandLogoMark size="md" />
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent hidden sm:block">
              Waabizx
            </h1>
          </Link>

          <span className="text-gray-300 hidden sm:block shrink-0">|</span>
          <h2 className="text-base sm:text-lg font-semibold text-sky-700 tracking-tight truncate">
            {isHistoryPage ? 'History' : 'Inbox'}
          </h2>
          <AdminHeaderProjectSwitch />
        </div>

        <HeaderRightActions>
          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => {
                setNotificationDropdownOpen(!notificationDropdownOpen);
                if (!notificationDropdownOpen) {
                  fetchNotifications(true);
                }
              }}
              className="relative w-10 h-10 rounded-full bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200/80 flex items-center justify-center cursor-pointer hover:from-sky-50 hover:to-sky-100/80 hover:border-sky-200/70 hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <>
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1.5 border-2 border-white shadow-sm">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                </>
              )}
            </button>

            {notificationDropdownOpen && (
              <div className="motion-pop absolute right-0 mt-3 w-80 md:w-96 bg-white rounded-2xl shadow-2xl shadow-gray-900/10 border border-gray-100 z-50 max-h-[500px] flex flex-col overflow-hidden ring-1 ring-black/5 origin-top-right">
                <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-gray-50/80">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-800">Notifications</h3>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-semibold rounded-full">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        await handleMarkAllAsRead();
                        fetchNotifications();
                      }}
                      className="text-xs text-sky-600 hover:text-sky-700 font-medium transition"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
                <div className="overflow-y-auto flex-1">
                  {loadingNotifications ? (
                    <div className="px-4 py-8 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-sky-200 border-t-sky-600 mx-auto" />
                      <p className="mt-2 text-sm text-gray-500">Loading notifications...</p>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      <p className="text-sm text-gray-500">No notifications</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {notifications.map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => handleNotificationClick(notification)}
                          className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition border-l-4 ${
                            !notification.is_read
                              ? 'bg-sky-50 border-sky-500'
                              : 'bg-white border-transparent'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                                notification.type === 'campaign'
                                  ? 'bg-sky-100'
                                  : notification.type === 'template'
                                    ? 'bg-green-100'
                                    : notification.type === 'message'
                                      ? 'bg-purple-100'
                                      : 'bg-gray-100'
                              }`}
                            >
                              {notification.type === 'campaign' && (
                                <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                              )}
                              {notification.type === 'template' && (
                                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              )}
                              {notification.type === 'message' && (
                                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                </svg>
                              )}
                              {!['campaign', 'template', 'message'].includes(notification.type) && (
                                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <p
                                    className={`text-sm font-medium ${
                                      !notification.is_read ? 'text-gray-900' : 'text-gray-700'
                                    }`}
                                  >
                                    {notification.title}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                    {notification.body}
                                  </p>
                                </div>
                                {!notification.is_read && (
                                  <div className="flex-shrink-0 w-2 h-2 bg-sky-600 rounded-full mt-1" />
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-1">
                                {formatTime(notification.created_at)}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/35 hover:shadow-lg hover:ring-2 ring-sky-300/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none overflow-hidden"
          >
            {headerAvatar ? (
              <img src={headerAvatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-semibold text-sm">{userInitial}</span>
            )}
          </button>
        </HeaderRightActions>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar - Navigation */}
        <AppShellSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
          <MainSidebarNav onNavigate={() => setSidebarOpen(false)} />
        </AppShellSidebar>

        {/* Main Inbox Area */}
        <div className="relative flex-1 flex min-w-0 overflow-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50 flex-col lg:flex-row">
          <div className="pointer-events-none absolute inset-0 overflow-hidden z-0" aria-hidden>
            <div className="absolute -top-28 -right-16 w-[20rem] h-[20rem] bg-sky-400/25 motion-page-blob" />
            <div className="absolute bottom-0 -left-20 w-[18rem] h-[18rem] bg-blue-400/20 motion-page-blob motion-page-blob--b" />
          </div>
          {/* Left Panel - Chat List */}
          <div
            className={`relative z-[1] w-full lg:w-80 shrink-0 lg:border-r border-sky-100/80 bg-white/95 backdrop-blur-sm flex flex-col shadow-[0_12px_32px_-18px_rgba(14,165,233,0.45)] ring-1 ring-sky-100/50 min-h-0 ${
              selectedContact ? 'hidden lg:flex' : 'flex'
            }`}
          >
            {/* Search Bar + Filter button — always visible on /inbox */}
            <div className="relative z-20 shrink-0 p-4 border-b border-sky-100/70 bg-gradient-to-b from-white to-sky-50/40 overflow-visible">
              <div className="flex flex-nowrap items-center gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    type="text"
                    placeholder={
                      inboxTab === 'intervened'
                        ? 'Search contact, phone, or agent name...'
                        : 'Search conversations...'
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-200 rounded-xl bg-gray-50/80 hover:bg-white focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none transition-all shadow-sm text-sm"
                  />
                  <svg className="absolute left-3 top-2.5 w-5 h-5 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <button
                  type="button"
                  onClick={openListFilterPanel}
                  className={`relative z-20 flex-none shrink-0 inline-flex h-10 w-10 min-w-[2.5rem] min-h-[2.5rem] items-center justify-center rounded-xl border-2 transition ${
                    listFilterOpen || listFilterActiveCount > 0
                      ? 'border-teal-500 bg-teal-50 text-teal-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-teal-300 hover:text-teal-700'
                  }`}
                  aria-label="Filter conversations"
                  title="Filters"
                >
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                  {listFilterActiveCount > 0 ? (
                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-teal-600 ring-2 ring-white" />
                  ) : null}
                </button>
              </div>
            </div>

            {listFilterOpen
              ? createPortal(
                  <div
                    className="fixed inset-0 z-[200] flex items-center justify-center p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Filters"
                  >
                    <button
                      type="button"
                      className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
                      aria-label="Close filters"
                      onClick={() => setListFilterOpen(false)}
                    />
                    <div
                      ref={listFilterRef}
                      className="relative z-[1] flex w-full max-w-xl max-h-[min(88vh,40rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.22)]"
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
                        <div>
                          <h3 className="text-base font-semibold text-gray-900">Filters</h3>
                          <p className="text-xs text-gray-500 mt-0.5">Refine conversations by date and attributes</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setListFilterOpen(false)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                          aria-label="Close"
                        >
                          Close
                          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                        <section>
                          <div className="mb-2 flex items-center gap-2">
                            <h4 className="text-[13px] font-semibold text-gray-800">Last Seen</h4>
                            {(filterDraft.lastSeenPreset || filterDraft.lastSeenFrom || filterDraft.lastSeenTo) ? (
                              <button
                                type="button"
                                onClick={() => updateFilterDraft({ lastSeenPreset: '', lastSeenFrom: '', lastSeenTo: '' })}
                                className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                title="Clear Last Seen"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            ) : null}
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="flex flex-wrap gap-1.5">
                              {[
                                { id: '24h', label: 'In 24hr' },
                                { id: 'week', label: 'This Week' },
                                { id: 'month', label: 'This Month' },
                              ].map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => setLastSeenPreset(p.id)}
                                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                                    filterDraft.lastSeenPreset === p.id
                                      ? 'bg-gray-800 text-white'
                                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                  }`}
                                >
                                  {p.label}
                                </button>
                              ))}
                            </div>
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <input
                                type="date"
                                value={filterDraft.lastSeenFrom}
                                onChange={(e) =>
                                  updateFilterDraft({ lastSeenFrom: e.target.value, lastSeenPreset: '' })
                                }
                                className="w-full rounded-md border border-gray-200 bg-[#f3f4f6] px-2.5 py-1.5 text-xs text-gray-800 outline-none focus:border-teal-500 focus:bg-white focus:ring-1 focus:ring-teal-500/30"
                              />
                              <input
                                type="date"
                                value={filterDraft.lastSeenTo}
                                onChange={(e) =>
                                  updateFilterDraft({ lastSeenTo: e.target.value, lastSeenPreset: '' })
                                }
                                className="w-full rounded-md border border-gray-200 bg-[#f3f4f6] px-2.5 py-1.5 text-xs text-gray-800 outline-none focus:border-teal-500 focus:bg-white focus:ring-1 focus:ring-teal-500/30"
                              />
                            </div>
                          </div>
                        </section>

                        <section>
                          <div className="mb-2 flex items-center gap-2">
                            <h4 className="text-[13px] font-semibold text-gray-800">Created At</h4>
                            {(filterDraft.createdPreset || filterDraft.createdFrom || filterDraft.createdTo) ? (
                              <button
                                type="button"
                                onClick={() => updateFilterDraft({ createdPreset: '', createdFrom: '', createdTo: '' })}
                                className="inline-flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                title="Clear Created At"
                              >
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            ) : null}
                          </div>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <div className="flex flex-wrap gap-1.5">
                              {[
                                { id: 'today', label: 'Today' },
                                { id: 'week', label: 'This Week' },
                                { id: 'month', label: 'This Month' },
                              ].map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => setCreatedPreset(p.id)}
                                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
                                    filterDraft.createdPreset === p.id
                                      ? 'bg-gray-800 text-white'
                                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                  }`}
                                >
                                  {p.label}
                                </button>
                              ))}
                            </div>
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <input
                                type="date"
                                value={filterDraft.createdFrom}
                                onChange={(e) =>
                                  updateFilterDraft({ createdFrom: e.target.value, createdPreset: '' })
                                }
                                className="w-full rounded-md border border-gray-200 bg-[#f3f4f6] px-2.5 py-1.5 text-xs text-gray-800 outline-none focus:border-teal-500 focus:bg-white focus:ring-1 focus:ring-teal-500/30"
                              />
                              <input
                                type="date"
                                value={filterDraft.createdTo}
                                onChange={(e) =>
                                  updateFilterDraft({ createdTo: e.target.value, createdPreset: '' })
                                }
                                className="w-full rounded-md border border-gray-200 bg-[#f3f4f6] px-2.5 py-1.5 text-xs text-gray-800 outline-none focus:border-teal-500 focus:bg-white focus:ring-1 focus:ring-teal-500/30"
                              />
                            </div>
                          </div>
                        </section>

                        <section>
                          <h4 className="mb-2.5 text-[13px] font-semibold text-gray-800">Attributes</h4>
                          <div className="space-y-2.5">
                            {(filterDraft.attrs || []).map((row, idx) => {
                              const isLast = idx === (filterDraft.attrs || []).length - 1;
                              const fieldCls =
                                'h-9 rounded-md border border-gray-200 bg-[#f3f4f6] px-2.5 text-xs text-gray-800 outline-none focus:border-teal-500 focus:bg-white focus:ring-1 focus:ring-teal-500/30';
                              return (
                                <div key={row.id} className="flex flex-wrap items-center gap-2">
                                  <select
                                    value={row.attribute}
                                    onChange={(e) =>
                                      updateFilterAttrRow(row.id, { attribute: e.target.value, value: '' })
                                    }
                                    className={`${fieldCls} min-w-[9rem] flex-[1.4]`}
                                  >
                                    <option value="">Select Attribute</option>
                                    {INBOX_FILTER_ATTRS.map((a) => (
                                      <option key={a.value} value={a.value}>
                                        {a.label}
                                      </option>
                                    ))}
                                  </select>
                                  <select
                                    value={row.operator}
                                    onChange={(e) => updateFilterAttrRow(row.id, { operator: e.target.value })}
                                    className={`${fieldCls} w-[5rem] shrink-0`}
                                  >
                                    <option value="is">is</option>
                                    <option value="is_not">is not</option>
                                  </select>
                                  {row.attribute === 'intervened' || row.attribute === 'opted_in' ? (
                                    <select
                                      value={row.value}
                                      onChange={(e) => updateFilterAttrRow(row.id, { value: e.target.value })}
                                      className={`${fieldCls} min-w-[6rem] flex-1`}
                                    >
                                      <option value="">Select</option>
                                      <option value="yes">Yes</option>
                                      <option value="no">No</option>
                                    </select>
                                  ) : row.attribute === 'intervened_by_agent' ? (
                                    <select
                                      value={row.value}
                                      onChange={(e) => updateFilterAttrRow(row.id, { value: e.target.value })}
                                      className={`${fieldCls} min-w-[7rem] flex-1`}
                                    >
                                      <option value="">Select agent</option>
                                      {(agentsList || []).map((agent) => (
                                        <option key={agent.id} value={String(agent.id)}>
                                          {agent.name || agent.email || `Agent ${agent.id}`}
                                        </option>
                                      ))}
                                    </select>
                                  ) : row.attribute === 'tags' ? (
                                    <select
                                      value={row.value}
                                      onChange={(e) => updateFilterAttrRow(row.id, { value: e.target.value })}
                                      className={`${fieldCls} min-w-[7rem] flex-1`}
                                    >
                                      <option value="">Select tag</option>
                                      {(filterTagsList || []).map((tag) => (
                                        <option key={tag.id} value={String(tag.id)}>
                                          {tag.name}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      disabled
                                      placeholder="Value"
                                      className={`${fieldCls} min-w-[6rem] flex-1 text-gray-400`}
                                    />
                                  )}
                                  {!isLast ? (
                                    <select
                                      value={row.join || 'and'}
                                      onChange={(e) => updateFilterAttrRow(row.id, { join: e.target.value })}
                                      className={`${fieldCls} w-16 shrink-0 font-medium`}
                                    >
                                      <option value="and">and</option>
                                      <option value="or">or</option>
                                    </select>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={addFilterAttrRow}
                                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                                      title="Add filter"
                                    >
                                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                      </svg>
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => removeFilterAttrRow(row.id)}
                                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                                    title="Remove"
                                  >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      </div>

                      <div className="flex items-center gap-4 border-t border-gray-100 bg-white px-5 py-3.5">
                        <button
                          type="button"
                          onClick={applyListFilters}
                          className="rounded-lg bg-[#0f766e] px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0d9488]"
                        >
                          Apply
                        </button>
                        <button
                          type="button"
                          onClick={clearListFilters}
                          className="text-sm font-medium text-gray-500 hover:text-gray-800"
                        >
                          Clear All
                        </button>
                        {filterContactsLoading ? (
                          <span className="ml-auto text-[11px] text-gray-400">Loading…</span>
                        ) : null}
                      </div>
                    </div>
                  </div>,
                  document.body
                )
              : null}

            {/* Active / Requesting / Intervened tabs (Inbox only) */}
            {!isHistoryPage && (
            <div className="flex p-1.5 gap-1 flex-shrink-0 bg-gradient-to-b from-gray-100/90 to-gray-50/80 border-b border-gray-200/60 overflow-x-auto [scrollbar-width:none]">
              {[
                { id: 'active', label: 'Active' },
                { id: 'requesting', label: 'Requesting' },
                { id: 'intervened', label: 'Intervened' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    if (tab.id === inboxTab) return;
                    sectionFetchSeqRef.current += 1; // invalidate in-flight fetch
                    inboxTabRef.current = tab.id;
                    setAssignMenuConvId(null);
                    setAssigningId(null);
                    setIntervenedFilterOpen(false);
                    setLoadingSectionChats(!(sectionByTab[tab.id] || []).length);
                    setInboxTab(tab.id);
                  }}
                  className={`flex-1 min-w-[4.5rem] py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-wide transition-all duration-200 rounded-lg whitespace-nowrap px-2 ${
                    inboxTab === tab.id
                      ? 'bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-md shadow-sky-600/25 ring-1 ring-sky-400/30'
                      : 'text-sky-900/80 hover:bg-white/70'
                  }`}
                >
                  {tab.label}{inboxTab === tab.id ? ` (${sectionTabCount})` : ''}
                </button>
              ))}
            </div>
            )}

            {/* Intervened agent filter — dropdown overlay (list stays visible underneath) */}
            {!isHistoryPage && inboxTab === 'intervened' && (
              <div className="border-b border-gray-200/80 bg-white shrink-0 relative z-30">
                <button
                  type="button"
                  onClick={() => setIntervenedFilterOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-gray-800 bg-gray-100/90 hover:bg-gray-100"
                >
                  <span className="truncate">
                    {intervenedFilterTitle} ({sectionTabCount})
                  </span>
                  <svg
                    className={`w-4 h-4 shrink-0 transition-transform ${intervenedFilterOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {intervenedFilterOpen ? (
                  <div className="absolute left-0 right-0 top-full max-h-72 overflow-y-auto bg-white border-b border-gray-200 shadow-xl z-40">
                    <div className="p-2 border-b border-gray-100 sticky top-0 bg-white z-10">
                      <div className="relative">
                        <input
                          type="text"
                          value={intervenedAgentSearch}
                          onChange={(e) => setIntervenedAgentSearch(e.target.value)}
                          placeholder="Search agent by name"
                          className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-sky-400/40 focus:border-sky-400 outline-none"
                        />
                        <svg className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                    </div>
                    {[
                      { id: 'me', short: 'ME', label: 'Intervened By Me', count: intervenedFilterOptions.me, ring: 'text-red-600' },
                      { id: 'any', short: 'AY', label: 'Intervened By Any', count: intervenedFilterOptions.any, ring: 'text-red-600' },
                      { id: 'other', short: 'OT', label: 'Intervened By Other', count: intervenedFilterOptions.other, ring: 'text-red-600' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setIntervenedFilter(opt.id);
                          setIntervenedFilterOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-sky-50/80 border-b border-gray-50 ${
                          intervenedFilter === opt.id ? 'bg-sky-50' : ''
                        }`}
                      >
                        <span className={`w-9 h-9 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-[10px] font-bold ${opt.ring}`}>
                          {opt.short}
                        </span>
                        <span className="flex-1 truncate text-gray-800">{opt.label}</span>
                        <span className="text-xs text-gray-500 shrink-0">({opt.count})</span>
                      </button>
                    ))}
                    {intervenedFilterOptions.agents.map((agent) => {
                      const aid = agent.id;
                      const filterId = `agent:${aid}`;
                      const name = agent.name || agent.email || `Agent ${aid}`;
                      return (
                        <button
                          key={filterId}
                          type="button"
                          onClick={() => {
                            setIntervenedFilter(filterId);
                            setIntervenedFilterOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-sky-50/80 border-b border-gray-50 ${
                            intervenedFilter === filterId ? 'bg-sky-50' : ''
                          }`}
                        >
                          <span className="w-9 h-9 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center text-xs font-bold text-emerald-700">
                            {getAgentInitials(name)}
                          </span>
                          <span className="flex-1 truncate text-gray-800">Intervened By {name}</span>
                          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden />
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )}

            {isHistoryPage && (
              <div className="px-3 py-2 border-b border-gray-200/80 bg-slate-50 text-xs text-slate-600 shrink-0">
                Chats older than 24 hours — intervene to send approved templates
              </div>
            )}

            {/* Chat list only (never mix Assign UI into Intervened) */}
            <div className="flex-1 overflow-y-auto bg-gradient-to-b from-white via-sky-50/20 to-sky-100/20 min-h-0">
              {loadingSectionChats ? (
                <div className="p-8 text-center motion-enter">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-sky-200 border-t-sky-600 mx-auto" />
                  <p className="mt-2 text-sm text-gray-500">
                    {isHistoryPage ? 'Loading history...' : `Loading ${inboxTab} chats...`}
                  </p>
                </div>
              ) : filteredSectionList.length === 0 ? (
                <div className="p-8 text-center motion-enter">
                  <svg className="w-16 h-16 text-sky-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-600 mb-2">
                    {isHistoryPage
                      ? 'No history conversations'
                      : `No ${inboxTab} conversations`}
                  </p>
                  <p className="text-sm text-gray-500">
                    {isHistoryPage
                      ? 'Chats with no activity in the last 24 hours appear here'
                      : inboxTab === 'requesting'
                      ? 'New customer messages appear here until an agent takes over'
                      : inboxTab === 'intervened'
                        ? 'Chats where an agent or admin has intervened'
                        : 'All chats with activity in the last 24 hours'}
                  </p>
                </div>
              ) : (
                <div className={inboxTab === 'requesting' ? 'space-y-0' : 'motion-stagger-children'}>
                  {filteredSectionList.map((conv, index) => {
                    const displayName = resolveConversationDisplayName(conv, inboxList);
                    const phoneLabel = formatPhoneDisplay(conv.phone);
                    const nameIsPhone = isSamePhoneValue(displayName, conv.phone);
                    const titleName = nameIsPhone ? (phoneLabel || displayName) : displayName;
                    const avatarLetter = String(titleName || '')
                      .replace(/^\++/, '')
                      .trim()
                      .charAt(0)
                      .toUpperCase() || '?';
                    const convIdNum = Number(conv?.id);
                    const hasConvId = Number.isInteger(convIdNum) && convIdNum > 0;
                    const isAssigningThis =
                      hasConvId &&
                      assigningId != null &&
                      Number(assigningId) === convIdNum;
                    const isAssignMenuOpen =
                      hasConvId &&
                      assignMenuConvId != null &&
                      Number(assignMenuConvId) === convIdNum;
                    const rowKey = hasConvId
                      ? `inbox-${inboxTab}-id-${convIdNum}`
                      : `inbox-${inboxTab}-row-${normalizePhoneKey(conv.phone) || 'x'}-${index}`;
                    const isSelected =
                      selectedContact?.phone === conv.phone ||
                      selectedContact?.conversationId === conv.id ||
                      selectedContact?.id === conv.id;
                    return (
                      <div
                        key={rowKey}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSectionChatSelect(conv)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSectionChatSelect(conv);
                          }
                        }}
                        className={`relative w-full flex flex-col gap-2 p-3 text-left border-b border-gray-100/90 cursor-pointer transition-all duration-200 ${
                          isAssignMenuOpen ? 'z-30' : 'z-0'
                        } ${
                          isSelected
                            ? 'bg-gradient-to-r from-sky-50 to-white border-l-4 border-l-sky-600 shadow-inner'
                            : 'hover:bg-sky-50/60'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center flex-shrink-0 shadow-md shadow-sky-500/25 ring-2 ring-white">
                            <span className="text-white font-semibold text-lg leading-none">
                              {avatarLetter}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0 overflow-hidden">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="text-sm font-semibold text-gray-900 truncate leading-snug">
                                {titleName}
                              </p>
                              {conv.last_message_time ? (
                                <p className="text-xs text-gray-500 flex-shrink-0 leading-snug whitespace-nowrap">
                                  {formatTime(conv.last_message_time)}
                                </p>
                              ) : null}
                            </div>
                            {!nameIsPhone && phoneLabel ? (
                              <p className="text-xs text-sky-600 font-medium truncate mb-0.5 leading-snug">
                                {phoneLabel}
                              </p>
                            ) : null}
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm text-gray-600 truncate flex-1 min-w-0 leading-snug">
                                {conv.last_message || 'No messages'}
                              </p>
                              {Number(conv.unread_count) > 0 && (
                                <span className="ml-2 px-2 py-0.5 bg-sky-600 text-white text-xs font-semibold rounded-full flex-shrink-0 shadow-sm shadow-sky-600/30">
                                  {Number(conv.unread_count) > 9 ? '9+' : conv.unread_count}
                                </span>
                              )}
                            </div>
                            {inboxTab === 'intervened' && conv.agent_name ? (
                              <p className="text-[11px] font-semibold text-violet-700 mt-1 truncate">
                                Intervened by {conv.agent_name}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {inboxTab === 'requesting' &&
                          String(conv.status || '').toLowerCase() === 'requesting' &&
                          isAgentUser &&
                          (agentCanPickup || Number(conv.agent_id) === Number(user?.id)) ? (
                          <button
                            type="button"
                            onClick={(e) => handleAcceptSectionChat(e, conv)}
                            className="w-full py-2 px-2 text-xs font-bold rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-md shadow-sky-600/20 hover:from-sky-500 hover:to-blue-500 transition"
                          >
                            Accept chat
                          </button>
                          ) : null}
                        {inboxTab === 'requesting' &&
                          String(conv.status || '').toLowerCase() === 'requesting' &&
                          isAdminOrManager ? (
                          <div className="relative" ref={isAssignMenuOpen ? assignMenuRef : null}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!hasConvId || isAssigningThis) return;
                                setAssignMenuConvId((prev) =>
                                  prev != null && Number(prev) === convIdNum ? null : convIdNum
                                );
                              }}
                              disabled={!hasConvId || isAssigningThis}
                              className="w-full py-2 px-2 text-xs font-bold rounded-xl bg-white border border-sky-200 text-sky-800 hover:bg-sky-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                              {isAssigningThis
                                ? 'Assigning…'
                                : !hasConvId
                                  ? 'Assign unavailable'
                                  : conv.agent_id
                                    ? 'Reassign agent'
                                    : 'Assign to agent'}
                            </button>
                            {isAssignMenuOpen ? (
                              <div className="absolute left-0 right-0 top-full mt-1 z-40 max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl py-1">
                                {agentsList.length === 0 ? (
                                  <div className="px-3 py-2 text-xs text-gray-500">No agents available</div>
                                ) : (
                                  agentsList.map((agent) => {
                                    const label = agent?.name || agent?.email || `Agent ${agent?.id}`;
                                    return (
                                      <button
                                        key={agent.id ?? label}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setAssignMenuConvId(null);
                                          handleAssignToAgent(convIdNum, agent.id);
                                        }}
                                        className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-sky-50 transition"
                                      >
                                        {label}
                                      </button>
                                    );
                                  })
                                )}
                              </div>
                            ) : null}
                          </div>
                          ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Chat Window */}
          <div
            className={`relative z-[1] flex-1 flex flex-col min-w-0 min-h-0 bg-gradient-to-b from-sky-50/35 via-white/40 to-sky-100/35 backdrop-blur-[1px] ${
              selectedContact ? 'flex' : 'hidden lg:flex'
            }`}
          >
            {selectedContact ? (
              <>
                {/* Chat Header */}
                <div className="relative bg-white/95 backdrop-blur-md border-b border-sky-100/80 px-3 sm:px-6 py-3 sm:py-4 flex items-center shadow-[0_8px_20px_-14px_rgba(14,165,233,0.5)]">
                  <button
                    type="button"
                    onClick={() => setSelectedContact(null)}
                    className="lg:hidden shrink-0 mr-2 p-2 rounded-xl hover:bg-gray-100/80 active:scale-95 transition"
                    aria-label="Back to conversations"
                  >
                    <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center shadow-md shadow-sky-500/25 ring-2 ring-white">
                        <span className="text-white font-semibold">
                          {selectedContact.name?.charAt(0).toUpperCase() || selectedContact.phone.charAt(0)}
                        </span>
                      </div>
                      {/* Online status indicator */}
                      {onlineContacts[selectedContact.id]?.isOnline && (
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {(() => {
                            const phoneLabel = formatPhoneDisplay(selectedContact.phone);
                            const rawName = String(selectedContact.name || '').trim();
                            const nameIsPhone = !rawName || isSamePhoneValue(rawName, selectedContact.phone);
                            if (nameIsPhone) return phoneLabel || selectedContact.phone || 'Unknown';
                            return phoneLabel ? `${rawName} (${phoneLabel})` : rawName;
                          })()}
                        </p>
                        {onlineContacts[selectedContact.id]?.isOnline ? (
                          <span className="text-xs text-green-600">Online</span>
                        ) : onlineContacts[selectedContact.id]?.lastSeen ? (
                          <span className="text-xs text-gray-500">
                            Last seen {formatTime(onlineContacts[selectedContact.id].lastSeen)}
                          </span>
                        ) : null}
                      </div>
                      <ContactTagsBar
                        contactId={selectedContact.contactId || selectedContact.id}
                        phone={selectedContact.phone}
                        onContactResolved={(id) => {
                          setSelectedContact((prev) =>
                            prev ? { ...prev, id, contactId: id } : prev
                          );
                        }}
                      />
                      {selectedContact.whatsappOptInAt && (
                        <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 text-xs font-medium text-green-700 bg-green-100 rounded-full" title={`Consent via START/YES on ${formatTime(selectedContact.whatsappOptInAt)}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                          Opted in
                        </span>
                      )}
                    </div>
                  </div>
                  {showAdminIntervenedActions && (
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <div className="relative" ref={transferMenuRef}>
                        <button
                          type="button"
                          onClick={() => {
                            setTransferMenuOpen((v) => {
                              const next = !v;
                              if (next) fetchAgentsForAssign();
                              return next;
                            });
                          }}
                          disabled={transferring || resolving}
                          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-gray-800 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                          Transfer To
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {transferMenuOpen && (
                          <div className="absolute right-0 top-full mt-1 w-56 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-[1000] py-1">
                            {loadingAgents ? (
                              <div className="px-3 py-2 text-xs text-gray-500">Loading agents…</div>
                            ) : agentsList.length === 0 ? (
                              <div className="px-3 py-2 text-xs text-gray-500">
                                No agents available. Add agents for this project, then reopen Transfer To.
                              </div>
                            ) : (
                              agentsList.map((agent) => {
                                const label = agent?.name || agent?.email || `Agent ${agent?.id}`;
                                return (
                                  <button
                                    key={agent.id ?? label}
                                    type="button"
                                    onClick={() => handleTransferToAgent(agent)}
                                    disabled={transferring || Number(agent.id) === Number(selectedContact?.agentId)}
                                    className="w-full text-left px-3 py-2.5 text-sm text-gray-800 hover:bg-sky-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                  >
                                    {label}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleResolveIntervenedChat}
                        disabled={resolving || transferring || resolveDispositionOpen}
                        className="px-4 py-2 text-sm font-semibold text-gray-800 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {resolving ? 'Resolving…' : 'Resolve'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Typing indicator */}
                {typingContacts[selectedContact.id] && (
                  <div className="bg-white/90 backdrop-blur-sm border-b border-sky-100/80 px-6 py-2 motion-enter">
                    <p className="text-sm text-sky-700/80 italic">
                      {selectedContact.name || selectedContact.phone} is typing...
                    </p>
                  </div>
                )}

                {/* Messages Area */}
                <div
                  ref={chatContainerRef}
                  onScroll={handleChatScroll}
                  className="flex-1 overflow-y-auto p-4 md:p-6 space-y-0 bg-[#e5ddd5]"
                >
                  {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full min-h-[200px]">
                      <div className="text-center motion-enter">
                        <svg className="w-16 h-16 text-sky-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                        <p className="text-gray-600">No messages yet</p>
                        <p className="text-sm text-gray-500 mt-1">Start the conversation!</p>
                      </div>
                    </div>
                  ) : (
                    <InfiniteScroll
                      dataLength={messages.length}
                      next={loadMoreMessages}
                      hasMore={hasMoreMessages}
                      loader={null}
                      inverse={false}
                      scrollableTarget={chatContainerRef.current}
                    >
                      {messages.map((message, index) => {
                        const messageKey = message.id || `msg_${message.source || 'unknown'}_${index}_${message.sentAt || message.createdAt || Date.now()}`;
                        if (
                          message.type === 'system' ||
                          message.source === 'system' ||
                          message.sender === 'system'
                        ) {
                          return (
                            <div key={messageKey} className="flex justify-center mb-3">
                              <span className="text-xs font-medium text-gray-600 px-4 py-2 rounded-lg bg-gray-100 border border-gray-200/90 text-center max-w-md shadow-sm">
                                {personalizeSystemText(
                                  message.content || message.message,
                                  user?.name || user?.email
                                )}
                              </span>
                            </div>
                          );
                        }
                        return (
                          <ChatMessageItem
                            key={messageKey}
                            message={message}
                            source={message.source || 'inbox'}
                            templateCatalog={templateCatalog}
                            apiBase={API_BASE}
                            formatTime={() => formatMessageTime(getMessageTimestamp(message))}
                            status={message.status}
                            onButtonClick={
                              message.buttons?.length > 0 &&
                              message.type === 'incoming' &&
                              !message.isTemplate &&
                              !message.isTemplateSend
                                ? (button) =>
                                    handleBotButtonClick(button.value || button.text, message)
                                : undefined
                            }
                          />
                        );
                      })}
                    </InfiniteScroll>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* In-chat Intervene bar — requesting / bot / history */}
                {showInterveneBar && (
                  <div className="bg-gradient-to-r from-amber-50/95 via-amber-50/80 to-orange-50/60 border-t border-amber-200/80 px-6 py-3 flex items-center justify-center gap-3 flex-wrap shadow-inner motion-enter">
                    <span className="text-sm text-amber-900/90 font-medium">
                      {isHistoryTab
                        ? 'History chat — intervene to send an approved template'
                        : 'New customer message — take over the conversation'}
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const phone = selectedContact.phone;
                        if (!phone) return;
                        try {
                          let selectedAgentId = null;
                          try {
                            const raw = localStorage.getItem('selectedAgent');
                            const parsed = raw ? JSON.parse(raw) : null;
                            selectedAgentId = parsed?.id ?? parsed?._id ?? null;
                          } catch (e) {}
                          const result = await interveneByPhone(phone, selectedAgentId);
                          if (result?.success) {
                            setIntervenedPhones((prev) => {
                              const next = { ...prev, [phone]: true };
                              try {
                                localStorage.setItem(INTERVENED_STORAGE_KEY, JSON.stringify(next));
                              } catch (e) {}
                              return next;
                            });
                            setSelectedContact((prev) =>
                              prev && prev.phone === phone
                                ? { ...prev, chatStatus: 'intervened', status: 'intervened' }
                                : prev
                            );
                            fetchInboxList(false);
                            fetchSectionChatsRef.current?.(false);
                          } else {
                            alert(result?.message || 'Failed to intervene');
                          }
                        } catch (e) {
                          alert(e?.message || 'Failed to intervene');
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700 shadow-md shadow-sky-600/25 hover:shadow-lg transition-all duration-200 active:scale-[0.98]"
                    >
                      Intervene
                    </button>
                  </div>
                )}

                {planBlocked && selectedContact?.phone && (!isHistoryTab || isHistoryIntervened) && (
                  <div className="bg-gradient-to-r from-rose-50 via-orange-50 to-amber-50 border-t border-rose-200/80 px-6 py-4 text-center shadow-inner">
                    <p className="text-sm font-semibold text-rose-900">
                      Your plan has ended. Recharge now to send messages.
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard')}
                      className="mt-3 inline-flex items-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:from-emerald-500 hover:to-teal-500 transition"
                    >
                      Get plan
                    </button>
                  </div>
                )}

                {/* Message Input — Active + Intervened; History allows approved templates only after intervene */}
                {(!isHistoryTab || isHistoryIntervened) && (
                <div className="bg-white/95 backdrop-blur-md border-t border-sky-100/80 px-6 py-4 flex justify-center items-center flex-wrap gap-2 shadow-[0_-8px_28px_-12px_rgba(14,165,233,0.18)]">
                  {selectedContact?.phone && (
                    canHumanReply ? (
                      <form onSubmit={handleSendMessage} className="flex flex-col gap-2 flex-1 min-w-[220px] max-w-2xl">
                        <div className="relative w-full">
                          <div className={`flex items-center ${isHistoryIntervened ? 'justify-between' : 'justify-end'} mb-2`}>
                            {isHistoryIntervened && (
                              <span className="text-xs font-medium text-sky-800/90">
                                Send approved template only
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (interveneQuickPickerOpen) closeIntervenePicker();
                                else {
                                  setIntervenePreviewItem(null);
                                  setInterveneQuickPickerOpen(true);
                                }
                              }}
                              disabled={loadingInterveneOptions || sending}
                              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border-2 border-gray-200/90 rounded-xl text-xs font-semibold text-gray-800 hover:bg-sky-50/80 hover:border-sky-200/70 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-sm"
                              title={isHistoryIntervened ? 'Choose an approved template to send' : 'Insert canned message or approved template'}
                            >
                              <span className="text-base leading-none">📋</span>
                              {isHistoryIntervened ? 'Choose Template' : 'Insert'}
                            </button>
                          </div>

                          {interveneQuickPickerOpen && (
                            <div
                              ref={interveneQuickPickerRef}
                              className="motion-pop absolute right-0 bottom-full mb-2 w-[min(440px,94vw)] max-h-[min(78vh,640px)] bg-white rounded-2xl border border-sky-100/90 shadow-2xl shadow-sky-900/15 z-50 overflow-hidden ring-1 ring-black/5 flex flex-col"
                            >
                              <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-sky-50/40 border-b border-gray-100 flex items-center justify-between gap-2 shrink-0">
                                <div className="text-sm font-bold text-gray-900 tracking-tight">
                                  {intervenePreviewItem
                                    ? 'Preview message'
                                    : isHistoryIntervened
                                      ? 'Approved Templates'
                                      : 'Quick Insert'}
                                </div>
                                <button
                                  type="button"
                                  onClick={closeIntervenePicker}
                                  className="w-8 h-8 rounded-xl hover:bg-white text-gray-500 hover:text-gray-900 transition border border-transparent hover:border-gray-200"
                                  aria-label="Close"
                                >
                                  ×
                                </button>
                              </div>

                              {intervenePreviewItem ? (
                                <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
                                  <InsertMessagePreview
                                    title={intervenePreviewItem.label || intervenePreviewItem.templateName || 'Message'}
                                    bodyText={intervenePreviewItem.resolvedText}
                                    preview={intervenePreviewItem.templatePreview}
                                    apiBase={API_BASE}
                                    hint="Review the message, then click Send to deliver it."
                                    allowHeaderUpload={intervenePreviewItem.mode === 'template'}
                                    templateName={intervenePreviewItem.templateName || ''}
                                    onHeaderMediaChange={(url) => {
                                      setIntervenePreviewItem((prev) => {
                                        if (!prev) return prev;
                                        const fmt =
                                          String(prev.templatePreview?.headerFormat || 'IMAGE').toUpperCase() ||
                                          'IMAGE';
                                        return {
                                          ...prev,
                                          headerMediaUrl: url,
                                          templatePreview: {
                                            ...(prev.templatePreview || {}),
                                            headerFormat: fmt,
                                            headerImageUrl: url,
                                            header: {
                                              type: fmt === 'IMAGE' ? 'image' : fmt.toLowerCase(),
                                              url,
                                            },
                                          },
                                        };
                                      });
                                    }}
                                  />
                                  <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-white shrink-0">
                                    <button
                                      type="button"
                                      onClick={cancelIntervenePreview}
                                      disabled={sending}
                                      className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                    >
                                      Back
                                    </button>
                                    <button
                                      type="button"
                                      onClick={confirmInterveneSend}
                                      disabled={sending}
                                      className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 text-white text-sm font-semibold shadow-md disabled:opacity-50"
                                    >
                                      {sending ? 'Sending…' : 'Send'}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                              <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
                                <div className="px-3 py-2 border-b border-gray-100 shrink-0">
                                  <input
                                    type="text"
                                    value={insertOptionSearch}
                                    onChange={(e) => setInsertOptionSearch(e.target.value)}
                                    placeholder={isHistoryIntervened ? 'Search template by name' : 'Search canned or template by name'}
                                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-sky-400/40 focus:border-sky-400 outline-none"
                                  />
                                </div>
                              <div className="flex-1 min-h-0 overflow-y-auto max-h-[min(55vh,440px)]">
                                {loadingInterveneOptions ? (
                                  <div className="px-4 py-6 flex items-center gap-2 text-sm text-gray-500">
                                    <div className="h-5 w-5 rounded-full border-2 border-sky-200 border-t-sky-600 animate-spin" />
                                    Loading options...
                                  </div>
                                ) : (
                                  <>
                                    {interveneOptionsError && (
                                      <div className="px-4 py-2 text-xs text-red-600 border-b border-red-100 bg-red-50/50">
                                        {interveneOptionsError}
                                      </div>
                                    )}

                                    {!isHistoryIntervened && (
                                    <div className="px-4 py-3">
                                      <div className="text-xs font-bold text-sky-700 uppercase tracking-wide mb-2">Canned Messages</div>
                                      {(() => {
                                        const q = insertOptionSearch.trim().toLowerCase();
                                        const canned = interveneCannedOptions.filter((opt) => {
                                          if (!q) return true;
                                          return (
                                            String(opt.label || '').toLowerCase().includes(q) ||
                                            String(opt.insertValue || '').toLowerCase().includes(q)
                                          );
                                        });
                                        if (canned.length === 0) {
                                          return <div className="text-xs text-gray-500">No canned messages.</div>;
                                        }
                                        return (
                                        <div className="space-y-1.5">
                                          {canned.map((opt) => {
                                            const preview = String(opt.insertValue || "").trim();
                                            const previewText =
                                              preview.length > 72 ? `${preview.slice(0, 72)}...` : preview;
                                            return (
                                              <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => selectInterveneItemForPreview(opt)}
                                                disabled={sending}
                                                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-sky-50/80 border-2 border-gray-100 hover:border-sky-200/80 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                              >
                                                <div className="text-sm font-semibold text-gray-900 truncate">{opt.label}</div>
                                                <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap break-words line-clamp-3">{previewText || "—"}</div>
                                              </button>
                                            );
                                          })}
                                        </div>
                                        );
                                      })()}
                                    </div>
                                    )}

                                    {!isHistoryIntervened && <div className="border-t border-gray-100" />}

                                    <div className="px-4 py-3">
                                      <div className="text-xs font-bold text-sky-700 uppercase tracking-wide mb-2">Approved Templates</div>
                                      {(() => {
                                        const q = insertOptionSearch.trim().toLowerCase();
                                        const templates = interveneTemplateOptions.filter((opt) => {
                                          if (!q) return true;
                                          return (
                                            String(opt.label || '').toLowerCase().includes(q) ||
                                            String(opt.templateName || '').toLowerCase().includes(q) ||
                                            String(opt.insertValue || '').toLowerCase().includes(q)
                                          );
                                        });
                                        if (templates.length === 0) {
                                          return <div className="text-xs text-gray-500">No approved templates.</div>;
                                        }
                                        return (
                                        <div className="space-y-1.5">
                                          {templates.map((opt) => {
                                            const preview = String(opt.insertValue || "").trim();
                                            const previewText =
                                              preview.length > 72 ? `${preview.slice(0, 72)}...` : preview;
                                            return (
                                              <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => selectInterveneItemForPreview(opt)}
                                                disabled={sending}
                                                className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-sky-50/80 border-2 border-gray-100 hover:border-sky-200/80 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                              >
                                                <div className="text-sm font-semibold text-gray-900 truncate">{opt.label}</div>
                                                <div className="text-xs text-gray-500 mt-0.5 whitespace-pre-wrap break-words line-clamp-3">{previewText || "—"}</div>
                                              </button>
                                            );
                                          })}
                                        </div>
                                        );
                                      })()}
                                    </div>
                                  </>
                                )}
                              </div>
                              </div>
                              )}
                            </div>
                          )}
                        </div>

                        {isHistoryIntervened ? (
                          <p className="text-xs text-gray-500 text-center py-1">
                            Choose an approved template above to re-engage this customer.
                          </p>
                        ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={messageText}
                            onChange={(e) => setMessageText(e.target.value)}
                            placeholder="Type a message..."
                            className="flex-1 px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none bg-gray-50/80 hover:bg-white transition-all text-sm"
                            disabled={sending || planBlocked}
                          />
                          <button
                            type="submit"
                            disabled={!messageText.trim() || sending || planBlocked}
                            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-sky-700 text-white font-semibold text-sm hover:from-sky-700 hover:to-sky-800 shadow-md shadow-sky-600/25 disabled:opacity-50 transition-all duration-200 active:scale-[0.98]"
                          >
                            {sending ? 'Sending...' : 'Send'}
                          </button>
                        </div>
                        )}
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          const phone = selectedContact.phone;
                          if (!phone) return;
                          try {
                            let selectedAgentId = null;
                            try {
                              const raw = localStorage.getItem('selectedAgent');
                              const parsed = raw ? JSON.parse(raw) : null;
                              selectedAgentId = parsed?.id ?? parsed?._id ?? null;
                            } catch (e) {}
                            const result = await interveneByPhone(phone, selectedAgentId);
                            if (result?.success) {
                              setIntervenedPhones((prev) => {
                                const next = { ...prev, [phone]: true };
                                try {
                                  localStorage.setItem(INTERVENED_STORAGE_KEY, JSON.stringify(next));
                                } catch (e) {}
                                return next;
                              });
                              setSelectedContact((prev) =>
                                prev && prev.phone === phone
                                  ? { ...prev, chatStatus: 'intervened', status: 'intervened' }
                                  : prev
                              );
                              fetchInboxList(false);
                              fetchSectionChatsRef.current?.(false);
                            } else {
                              alert(result?.message || 'Failed to intervene');
                            }
                          } catch (e) {
                            alert(e?.message || 'Failed to intervene');
                          }
                        }}
                        className="px-5 py-2.5 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700 shadow-md shadow-sky-600/25 transition-all duration-200 active:scale-[0.98]"
                      >
                        Intervene
                      </button>
                    )
                  )}
                </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center bg-gradient-to-b from-sky-50/40 via-transparent to-sky-100/20">
                <div className="text-center motion-enter px-6">
                  <svg className="w-24 h-24 text-sky-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                  <p className="text-xl font-bold text-gray-800 mb-2 tracking-tight">Select a conversation</p>
                  <p className="text-sm text-gray-600">Choose a contact from the list to start chatting</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Template Selection Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="motion-pop bg-white rounded-2xl shadow-2xl shadow-gray-900/15 border border-gray-100/90 w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden ring-1 ring-black/5">
            {/* Modal Header */}
            <div className="px-5 md:px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-slate-50 via-sky-50/50 to-sky-50/30 shrink-0">
              <h2 className="text-xl font-bold text-gray-900 tracking-tight">Select Template</h2>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="text-gray-400 hover:text-gray-700 rounded-xl p-2 transition-all duration-200 hover:bg-white/90 active:scale-95 ring-1 ring-transparent hover:ring-gray-200/80"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 md:p-6 bg-gradient-to-b from-white to-sky-50/20 min-h-0">
              {loadingTemplates ? (
                <div className="flex items-center justify-center py-12 motion-enter">
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-sky-200 border-t-sky-600" />
                  <p className="ml-3 text-gray-600">Loading templates...</p>
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12 motion-enter">
                  <svg className="w-16 h-16 text-sky-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-gray-700 font-semibold">No approved templates found</p>
                  <p className="text-sm text-gray-500 mt-2">Please create and approve templates first</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 motion-stagger-children">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handleTemplateSelect(template)}
                      className="text-left p-4 border-2 border-gray-100 rounded-2xl hover:border-sky-300 hover:bg-sky-50/50 transition-all duration-200 shadow-sm hover:shadow-md motion-hover-lift bg-white/90"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-gray-900">{template.name}</h3>
                            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
                              Approved
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2 line-clamp-3 whitespace-pre-wrap">
                            {template.content || 'No content'}
                          </p>
                          {template.category && (
                            <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                              {template.category}
                            </span>
                          )}
                        </div>
                        <svg className="w-5 h-5 text-gray-400 ml-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 md:px-6 py-4 border-t border-gray-100 flex justify-end bg-white/95 backdrop-blur-sm shrink-0">
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="px-5 py-2.5 text-gray-700 font-medium border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-all duration-200 active:scale-[0.98]"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <ResolveDispositionModal
        open={resolveDispositionOpen}
        selected={selectedDisposition}
        onSelect={setSelectedDisposition}
        onConfirm={confirmResolveIntervenedChat}
        confirming={resolving}
        onCancel={() => {
          if (resolving) return;
          setResolveDispositionOpen(false);
          setSelectedDisposition(null);
        }}
      />
    </div>
  );
}

export default Inbox;

