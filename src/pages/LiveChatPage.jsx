import React, { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import { getActiveChats, getRequestingChats, getUnassignedRequestingChats, getManagerRequesting, getAgentRequesting, getIntervenedChats, getHistoryChats, getMessages, assignChatToAgent, assignAgentTakeover, sendMessage as sendChatMessage, acceptChat, closeChat, interveneByPhone, interveneChat } from "../api/chatApi";
import AgentSidebar from "../components/AgentSidebar";
import AgentTopbar from "../components/AgentTopbar";
import { initializeSocket, onSocketEvent, offSocketEvent } from "../services/socketService";
import axios from "../api/axios";
import InboxMessageThread, { INBOX_API_BASE } from "../components/InboxMessageThread";
import InsertMessagePreview from "../components/InsertMessagePreview";
import { appendSocketMessage } from "../services/messages";
import { getContactMessages, getInboxList, getContactCampaigns, getContactPayments } from "../services/inboxService";
import { dedupeChatMessages } from "../utils/mergeChatMessages";
import { getTemplates } from "../services/templateService";
import { sendTemplateMessage } from "../services/messageService";
import { uploadMedia, sendMediaMessage } from "../services/mediaService";
import {
  buildTemplatePreview,
  normalizeTemplateKey,
  extractTemplateHeaderMediaUrl,
  templateHasImageHeader,
  templateNeedsHeaderMedia,
} from "../utils/whatsappTemplatePreview";
import {
  fetchTags,
  fetchContactTags,
  assignContactTag,
  removeContactTag,
  createTag,
} from "../services/tagService";
import ResolveDispositionModal from "../components/ResolveDispositionModal";
import { getDispositionLabel } from "../constants/resolveDispositions";

function formatTime(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString() + ", " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getInitial(nameOrPhone) {
  if (!nameOrPhone) return "?";
  const s = String(nameOrPhone).trim();
  if (s.length === 0) return "?";
  return s.charAt(0).toUpperCase();
}

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function resolveContactDisplayName(item) {
  const phone = String(item?.phone || "").trim();
  const rawName = String(item?.customer_name || item?.name || "").trim();
  if (!rawName) return phone || "Unknown";
  const nDigits = phoneDigits(rawName);
  const pDigits = phoneDigits(phone);
  if (pDigits && nDigits && nDigits === pDigits) return phone || rawName;
  if (/^unknown$/i.test(rawName)) return phone || "Unknown";
  return rawName;
}

function formatPhoneDisplay(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  if (raw.startsWith("+")) return raw;
  const digits = phoneDigits(raw);
  return digits ? `+${digits}` : raw;
}

function getAgentInitials(nameOrEmail) {
  const raw = String(nameOrEmail || "").trim();
  if (!raw) return "A";
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return raw.slice(0, 2).toUpperCase();
}

const INTERVENED_STORAGE_KEY = "liveChatIntervenedPhones";

function normalizeChatList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

function isUnassignedAgent(agentId) {
  return agentId == null || agentId === "" || Number(agentId) === 0;
}

function readAgentPickupAllowed() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return true;
    const user = JSON.parse(raw);
    const perms = user?.permissions;
    if (!perms) return true;
    const parsed = typeof perms === "string" ? JSON.parse(perms) : perms;
    if (!parsed || typeof parsed !== "object") return true;
    if ("inbox" in parsed || "liveChat" in parsed) {
      return Boolean(parsed.inbox || parsed.liveChat);
    }
    return true;
  } catch {
    return true;
  }
}

function filterChatsByStatus(list, statusName) {
  const wanted = String(statusName || "").toLowerCase();
  return (Array.isArray(list) ? list : []).filter(
    (c) => String(c?.status || "").toLowerCase() === wanted
  );
}

function filterAgentLiveChatList(list, tabName, agentId) {
  const uid = Number(agentId);
  const rows = Array.isArray(list) ? list : [];
  if (!uid) return [];

  if (tabName === "active") {
    return rows.filter((c) => {
      const status = String(c.status || "").toLowerCase();
      return Number(c.agent_id) === uid && status === "active";
    });
  }
  if (tabName === "intervened") {
    return rows.filter((c) => {
      const status = String(c.status || "").toLowerCase();
      return Number(c.agent_id) === uid && status === "intervened";
    });
  }
  return rows;
}

function listIntervenedChats(data) {
  // Backend already scopes agents to their own intervened chats
  return filterChatsByStatus(normalizeChatList(data), "intervened");
}

function listHistoryChats(data) {
  return normalizeChatList(data);
}

function normalizePhoneDigits(phone) {
  return String(phone || "").replace(/\D/g, "");
}

async function resolveContactIdByPhone(phone) {
  const digits = normalizePhoneDigits(phone);
  if (!digits) return null;
  try {
    const inbox = await getInboxList();
    const hit = (inbox || []).find((c) => {
      const p = normalizePhoneDigits(c?.phone);
      return p && (p === digits || p.endsWith(digits) || digits.endsWith(p));
    });
    const id = hit?.contactId ?? hit?.id ?? null;
    if (id != null && String(id).trim() !== "") return id;
  } catch (_) {
    /* optional */
  }
  return null;
}

function normalizeLiveChatMessages(data) {
  return normalizeChatList(data).filter(Boolean);
}

async function fetchEnrichedMessages(conversationId, phone) {
  const data = await getMessages(conversationId);
  let rows = normalizeLiveChatMessages(data);
  if (phone) {
    try {
      const inboxData = await getContactMessages(phone);
      const inboxRows = inboxData.messages || [];
      if (inboxRows.length > 0) {
        rows = dedupeChatMessages([...rows, ...inboxRows]);
      }
    } catch (_) {
      /* optional enrich */
    }
  }
  return rows;
}

async function fetchLiveChatTabData(tabName, { isManager, isAgent, currentUserId, agentCanPickup }) {
  if (!isAgent) {
    if (tabName === "active") {
      return filterChatsByStatus(normalizeChatList(await getActiveChats()), "active");
    }
    if (tabName === "requesting") {
      if (isManager) {
        return filterChatsByStatus(normalizeChatList(await getManagerRequesting()), "requesting");
      }
      return filterChatsByStatus(normalizeChatList(await getRequestingChats()), "requesting");
    }
    if (tabName === "intervened") {
      return listIntervenedChats(await getIntervenedChats());
    }
    if (tabName === "history") return listHistoryChats(await getHistoryChats());
    return [];
  }

  // Agent Requesting = assigned-to-me (AiSensy) + optional unassigned pool if pickup allowed
  if (tabName === "requesting") {
    const assigned = currentUserId
      ? normalizeChatList(await getAgentRequesting(currentUserId))
      : [];
    let unassigned = [];
    if (agentCanPickup) {
      const pool = normalizeChatList(await getUnassignedRequestingChats());
      unassigned = pool.filter((c) => {
        const status = String(c.status || "").toLowerCase();
        return status === "requesting" && isUnassignedAgent(c.agent_id);
      });
    }
    const byId = new Map();
    [...assigned, ...unassigned].forEach((c) => {
      if (c?.id != null) byId.set(c.id, c);
    });
    return [...byId.values()];
  }
  if (tabName === "active") {
    const data = await getActiveChats();
    return filterAgentLiveChatList(normalizeChatList(data), "active", currentUserId);
  }
  if (tabName === "intervened") {
    return listIntervenedChats(await getIntervenedChats());
  }
  if (tabName === "history") {
    return listHistoryChats(await getHistoryChats());
  }
  return [];
}

function LiveChatPage() {
  const location = useLocation();

  const [role, setRole] = useState(null);
  const [tab, setTab] = useState("active");
  const [conversationsByTab, setConversationsByTab] = useState(() => ({
    active: [],
    requesting: [],
    intervened: [],
    history: [],
  }));
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingChats, setLoadingChats] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [error, setError] = useState(null);
  const [optedIn, setOptedIn] = useState(true);
  const [openSections, setOpenSections] = useState({
    payments: true,
    campaigns: true,
    attributes: false,
    tags: true,
  });
  const [contactCampaigns, setContactCampaigns] = useState([]);
  const [contactPayments, setContactPayments] = useState([]);
  const [contactTags, setContactTags] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagBusy, setTagBusy] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserName, setCurrentUserName] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [agentsList, setAgentsList] = useState([]);
  const [selectedAgent, setSelectedAgentState] = useState(null);
  const [interventionAlert, setInterventionAlert] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [insertOpen, setInsertOpen] = useState(false);
  const insertPopoverRef = useRef(null);
  const [insertLoading, setInsertLoading] = useState(false);
  const [insertError, setInsertError] = useState("");
  const [insertCannedOptions, setInsertCannedOptions] = useState([]);
  const [insertTemplateOptions, setInsertTemplateOptions] = useState([]);
  const [insertPreviewItem, setInsertPreviewItem] = useState(null);
  const insertLoadedRef = useRef(false);
  const chatScrollRef = useRef(null);
  const messagesEndRef = useRef(null);
  const transferMenuRef = useRef(null);
  const [transferMenuOpen, setTransferMenuOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveDispositionOpen, setResolveDispositionOpen] = useState(false);
  const [selectedDisposition, setSelectedDisposition] = useState(null);
  const [resolvedConvIds, setResolvedConvIds] = useState(() => new Set());
  const [templateCatalog, setTemplateCatalog] = useState(() => new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [intervenedPhones, setIntervenedPhones] = useState({});
  const [intervenedFilterOpen, setIntervenedFilterOpen] = useState(false);
  // Default "any" so managers see agent-intervened chats (not only agent_id === me)
  const [intervenedFilter, setIntervenedFilter] = useState("any");
  const [intervenedAgentSearch, setIntervenedAgentSearch] = useState("");
  const [insertOptionSearch, setInsertOptionSearch] = useState("");
  const [intervening, setIntervening] = useState(false);
  const [resolvedContactId, setResolvedContactId] = useState(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [assignMenuConvId, setAssignMenuConvId] = useState(null);
  const fileInputRef = useRef(null);
  const assignMenuRef = useRef(null);
  const liveChatFetchSeqRef = useRef(0);
  const liveChatTabRef = useRef("active");

  const conversations = conversationsByTab[tab] || [];

  useEffect(() => {
    liveChatTabRef.current = tab;
  }, [tab]);

  const patchCurrentTabList = useCallback((updater) => {
    const tabKey = liveChatTabRef.current;
    setConversationsByTab((prev) => {
      const current = prev[tabKey] || [];
      const next = typeof updater === "function" ? updater(current) : updater;
      return { ...prev, [tabKey]: next };
    });
  }, []);

  const removeConvFromAllTabs = useCallback((convId) => {
    setConversationsByTab((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = (next[key] || []).filter((c) => c.id !== convId);
      }
      return next;
    });
  }, []);

  const setSelectedAgent = useCallback((agent) => {
    setSelectedAgentState(agent);
    try {
      if (agent) localStorage.setItem("selectedAgent", JSON.stringify(agent));
      else localStorage.removeItem("selectedAgent");
    } catch (e) {}
  }, []);

  // Determine logged-in role, user id, and name from localStorage
  useEffect(() => {
    let detectedRole = null;
    let userId = null;
    let userName = "";
    let userEmail = "";
    try {
      const storedRole = localStorage.getItem("role");
      if (storedRole) {
        detectedRole = String(storedRole);
      }
      const rawUser = localStorage.getItem("user");
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed) {
          if (!detectedRole && parsed.role) detectedRole = String(parsed.role);
          userId = parsed.id ?? parsed._id ?? null;
          userName = parsed.name ?? parsed.email ?? "";
          userEmail = parsed.email ?? "";
        }
      }
    } catch (e) {}
    setRole(detectedRole);
    setCurrentUserId(userId);
    setCurrentUserName(userName);
    setCurrentUserEmail(userEmail);
  }, []);

  // Initialize selected agent: from location.state, else localStorage, else self when role is agent
  useEffect(() => {
    const fromState = location?.state?.agent;
    if (fromState && fromState.id) {
      setSelectedAgentState(fromState);
      try {
        localStorage.setItem("selectedAgent", JSON.stringify(fromState));
      } catch (e) {}
      return;
    }
    try {
      const raw = localStorage.getItem("selectedAgent");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (parsed.id || parsed.name || parsed.email)) {
          setSelectedAgentState(parsed);
          return;
        }
      }
    } catch (e) {}
    const roleLower = (role || "").toLowerCase();
    if (roleLower === "agent" && currentUserId != null) {
      const self = {
        id: currentUserId,
        name: currentUserName || undefined,
        email: currentUserEmail || undefined,
      };
      setSelectedAgentState(self);
      try {
        localStorage.setItem("selectedAgent", JSON.stringify(self));
      } catch (e) {}
    } else {
      setSelectedAgentState(null);
    }
  }, [location?.state?.agent, role, currentUserId, currentUserName, currentUserEmail]);

  // Fetch agents list for Transfer / Assign (admin/manager/agent)
  useEffect(() => {
    let cancelled = false;
    const fetchAgents = async () => {
      try {
        const res = await axios.get("/auth/agents");
        const list = res.data?.agents || [];
        if (!cancelled) setAgentsList(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!cancelled) setAgentsList([]);
      }
    };
    fetchAgents();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  const getAgentDisplayName = (agent) => {
    const name = String(agent?.name || agent?.email || `Agent ${agent?.id || ""}`).trim();
    return name.toUpperCase();
  };

  const appendSystemMessageLocal = (systemMessage) => {
    if (!systemMessage) return;
    const text = systemMessage.content || systemMessage.message || "";
    if (!String(text).trim()) return;
    const row = {
      id: systemMessage.id ? `live_system_${systemMessage.id}` : `live_system_${Date.now()}`,
      content: text,
      message: text,
      type: "system",
      source: "system",
      sender: "system",
      sentAt: systemMessage.sentAt || systemMessage.createdAt || new Date().toISOString(),
      createdAt: systemMessage.createdAt || systemMessage.sentAt || new Date().toISOString(),
    };
    setMessages((prev) => dedupeChatMessages([...(prev || []), row]));
  };

  const handleTransferToAgent = async (agent) => {
    if (!selectedChat?.id || !agent?.id || transferring) return;
    const fromName =
      selectedChat.agent_name ||
      (Number(selectedChat.agent_id) === Number(currentUserId)
        ? currentUserName || currentUserEmail
        : `Agent ${selectedChat.agent_id || ""}`);
    const toName = getAgentDisplayName(agent);
    const byName = String(currentUserName || currentUserEmail || "you").toUpperCase();
    setTransferring(true);
    setTransferMenuOpen(false);
    setError(null);
    try {
      const result = await assignAgentTakeover(selectedChat.id, agent.id);
      if (result && result.success === false) {
        setError(result?.message || result?.error || "Failed to transfer chat");
        return;
      }

      const banner =
        result?.systemMessage ||
        {
          content: `Chat transferred from ${String(fromName || "AGENT").toUpperCase()} to ${toName} by ${byName}`,
        };
      appendSystemMessageLocal(banner);

      setSelectedChat((prev) =>
        prev
          ? {
              ...prev,
              agent_id: agent.id,
              agent_name: agent.name || agent.email,
              status: "intervened",
            }
          : prev
      );

      // Stay open so who→whom banner is visible; reload carefully so banner is not lost
      const convId = selectedChat.id;
      const phone = selectedChat.phone;
      setTimeout(async () => {
        try {
          await loadMessages(convId, phone);
        } catch (_) {}
        const needle = String(banner.content || banner.message || "").trim();
        if (!needle) return;
        setMessages((prev) => {
          const has = (prev || []).some((m) => {
            const t = String(m.content || m.message || "").trim();
            return (
              (m.type === "system" || m.sender === "system" || m.source === "system") &&
              t === needle
            );
          });
          if (has) return prev;
          return dedupeChatMessages([
            ...(prev || []),
            {
              id: banner.id ? `live_system_${banner.id}` : `live_system_${Date.now()}`,
              content: needle,
              message: needle,
              type: "system",
              source: "system",
              sender: "system",
              sentAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            },
          ]);
        });
      }, 600);

      const transferredAway = isAgent && Number(agent.id) !== Number(currentUserId);
      if (transferredAway) {
        await new Promise((r) => setTimeout(r, 1200));
        setConversationsByTab((prev) => {
          const tabKey = liveChatTabRef.current;
          return {
            ...prev,
            [tabKey]: (prev[tabKey] || []).filter((c) => c.id !== selectedChat.id),
          };
        });
        setSelectedChat(null);
      } else if (tab !== "intervened") {
        setTab("intervened");
      }
      await loadChats();
    } catch (err) {
      setError(err.message || "Failed to transfer chat");
    } finally {
      setTransferring(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [localRes, metaRes] = await Promise.all([
          getTemplates({ page: 1, limit: 500, status: "approved" }),
          axios.get("/templates/meta"),
        ]);
        const map = new Map();
        (localRes?.templates || []).forEach((t) => {
          if (t?.name) map.set(normalizeTemplateKey(t.name), t);
        });
        (metaRes?.data?.templates || []).forEach((t) => {
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
  }, []);

  const roleLower = (role || "").toLowerCase();
  const isAgent = roleLower === "agent";
  const isManager = roleLower === "manager" || roleLower === "admin";
  const agentCanPickup = isAgent ? readAgentPickupAllowed() : false;
  const isHistoryTab = tab === "history";
  const showIntervenedActions =
    Boolean(selectedChat?.id) &&
    !isHistoryTab &&
    (isAgent || isManager) &&
    (tab === "intervened" ||
      ["active", "intervened"].includes(String(selectedChat?.status || "").toLowerCase()));

  useEffect(() => {
    let cancelled = false;
    setResolvedContactId(null);
    if (!selectedChat?.phone) return undefined;
    (async () => {
      const id = await resolveContactIdByPhone(selectedChat.phone);
      if (!cancelled) setResolvedContactId(id);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedChat?.id, selectedChat?.phone]);

  useEffect(() => {
    let cancelled = false;
    if (!selectedChat?.phone) {
      setContactCampaigns([]);
      setContactPayments([]);
      setContactTags([]);
      return undefined;
    }
    setProfileLoading(true);
    (async () => {
      try {
        const [campaigns, payments, tags, projectTags] = await Promise.all([
          getContactCampaigns(selectedChat.phone).catch(() => []),
          getContactPayments(selectedChat.phone).catch(() => []),
          fetchContactTags({ contactId: resolvedContactId, phone: selectedChat.phone }).catch(() => []),
          fetchTags().catch(() => []),
        ]);
        if (cancelled) return;
        setContactCampaigns(Array.isArray(campaigns) ? campaigns : []);
        setContactPayments(Array.isArray(payments) ? payments : []);
        setContactTags(Array.isArray(tags) ? tags : []);
        setAllTags(Array.isArray(projectTags) ? projectTags : []);
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedChat?.phone, selectedChat?.id, resolvedContactId]);

  // Enrich chat list names from inbox contacts when customer_name is missing / phone-like
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const inbox = await getInboxList();
        if (cancelled || !Array.isArray(inbox) || !inbox.length) return;
        const byPhone = new Map();
        inbox.forEach((c) => {
          const key = phoneDigits(c.phone);
          if (key) byPhone.set(key, c);
        });
        setConversationsByTab((prev) => {
          const next = { ...prev };
          let changed = false;
          for (const key of Object.keys(next)) {
            next[key] = (next[key] || []).map((conv) => {
              const hit = byPhone.get(phoneDigits(conv.phone));
              if (!hit) return conv;
              const better = resolveContactDisplayName(hit);
              const current = resolveContactDisplayName(conv);
              if (better && better !== current && phoneDigits(better) !== phoneDigits(conv.phone)) {
                changed = true;
                return { ...conv, customer_name: better };
              }
              return conv;
            });
          }
          return changed ? next : prev;
        });
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
    };
  }, [tab]);

  const mergeIntervenedPhones = useCallback((list) => {
    const nextIntervened = {};
    (list || []).forEach((item) => {
      const status = String(item?.status || "").toLowerCase();
      if (status === "intervened" && item?.phone) {
        nextIntervened[item.phone] = true;
      }
    });
    let persistedIntervened = {};
    try {
      const raw = localStorage.getItem(INTERVENED_STORAGE_KEY);
      persistedIntervened = raw ? JSON.parse(raw) : {};
    } catch (_) {
      persistedIntervened = {};
    }
    const merged = { ...(persistedIntervened || {}), ...nextIntervened };
    setIntervenedPhones(merged);
    try {
      localStorage.setItem(INTERVENED_STORAGE_KEY, JSON.stringify(merged));
    } catch (_) {}
  }, []);

  // 1️⃣ Initialize Socket.IO once for the agent (similar to socket.js in example)
  useEffect(() => {
    const token = localStorage.getItem("token") || undefined;
    let userId = undefined;
    try {
      const rawUser = localStorage.getItem("user");
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        userId = parsed?.id || parsed?._id;
      }
    } catch (e) {}

    const socket = initializeSocket(userId, token);
    console.log("LiveChatPage: socket instance", !!socket ? "initialized" : "not initialized");
  }, []);

  // Load API based on tab – each tab keeps its own list (no cross-tab leak)
  useEffect(() => {
    let cancelled = false;
    const requestedTab = tab;
    liveChatTabRef.current = requestedTab;
    const seq = ++liveChatFetchSeqRef.current;
    const hasCache = (conversationsByTab[requestedTab] || []).length > 0;
    setLoadingChats(!hasCache);
    setError(null);

    const fetchByTab = async () => {
      try {
        const list = await fetchLiveChatTabData(requestedTab, {
          isManager,
          isAgent,
          currentUserId,
          agentCanPickup,
        });
        if (cancelled || seq !== liveChatFetchSeqRef.current || requestedTab !== liveChatTabRef.current) {
          return;
        }
        setConversationsByTab((prev) => ({ ...prev, [requestedTab]: list }));
        mergeIntervenedPhones(list);
      } catch (err) {
        if (cancelled || seq !== liveChatFetchSeqRef.current || requestedTab !== liveChatTabRef.current) {
          return;
        }
        setError(err.message || "Failed to load chats");
        setConversationsByTab((prev) => ({ ...prev, [requestedTab]: [] }));
      } finally {
        if (!cancelled && seq === liveChatFetchSeqRef.current && requestedTab === liveChatTabRef.current) {
          setLoadingChats(false);
        }
      }
    };

    fetchByTab();
    return () => {
      cancelled = true;
    };
    // intentionally omit conversationsByTab to avoid refetch loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isManager, isAgent, currentUserId, agentCanPickup, mergeIntervenedPhones]);

  useEffect(() => {
    if (tab !== "requesting") setAssignMenuConvId(null);
  }, [tab]);

  const loadMessages = useCallback(async (conversationId, phone) => {
    if (!conversationId) return;
    setLoadingMessages(true);
    setError(null);
    try {
      const rows = await fetchEnrichedMessages(conversationId, phone);
      setMessages(rows);
    } catch (err) {
      setError(err.message || "Failed to load messages");
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (selectedChat) {
      loadMessages(selectedChat.id, selectedChat.phone);
    } else {
      setMessages([]);
    }
  }, [selectedChat, loadMessages]);

  const loadChats = useCallback(async () => {
    const requestedTab = liveChatTabRef.current;
    // Soft refresh: do not bump seq (avoids cancelling tab-switch loads / sticky spinner)
    const seq = liveChatFetchSeqRef.current;
    setError(null);
    try {
      const list = await fetchLiveChatTabData(requestedTab, {
        isManager,
        isAgent,
        currentUserId,
        agentCanPickup,
      });
      if (seq !== liveChatFetchSeqRef.current || requestedTab !== liveChatTabRef.current) return;
      setConversationsByTab((prev) => ({ ...prev, [requestedTab]: list }));
      mergeIntervenedPhones(list);
    } catch (err) {
      if (seq !== liveChatFetchSeqRef.current || requestedTab !== liveChatTabRef.current) return;
      setError(err.message || "Failed to load chats");
    }
  }, [isManager, isAgent, currentUserId, agentCanPickup, mergeIntervenedPhones]);

  // 2️⃣ Listen for real-time "new-message" events (Manager Inbox + Agent)
  useEffect(() => {
    const handler = (data) => {
      try {
        // Payload: { conversationId, phone, message } from webhook (manager) or extended for agent
        const convId = data.conversation_id ?? data.conversationId;
        if (convId && (tab === "requesting" && (isManager || isAgent))) {
          loadChats();
        }

        // If this message belongs to the currently open conversation, append it
        if (selectedChat && (data.conversation_id === selectedChat.id || data.conversationId === selectedChat.id)) {
          setMessages((prev) =>
            appendSocketMessage(prev, {
              ...data,
              content: data.content || data.message || data.text || "",
              message: data.message || data.content || data.text || "",
              sender: data.sender || (data.direction === "outbound" ? "agent" : "customer"),
              created_at: data.created_at || data.timestamp || data.sentAt || new Date().toISOString(),
              sentAt: data.sentAt || data.created_at || data.timestamp,
            }, "socket")
          );
        }

        // Also update left-panel conversations: last_message, time, unread_count
        if (data.conversation_id || data.conversationId) {
          const convId = data.conversation_id || data.conversationId;
          setConversationsByTab((prev) => {
            const tabKey = liveChatTabRef.current;
            const list = (prev[tabKey] || []).map((c) => {
              if (c.id !== convId) return c;
              const isFromCustomer =
                (data.sender && String(data.sender).toLowerCase() === "customer") ||
                data.direction === "inbound";
              return {
                ...c,
                last_message: data.message || data.text || c.last_message,
                last_message_time: data.created_at || data.timestamp || c.last_message_time,
                unread_count:
                  selectedChat && selectedChat.id === convId
                    ? c.unread_count || 0
                    : isFromCustomer
                    ? (c.unread_count || 0) + 1
                    : c.unread_count,
              };
            });
            return { ...prev, [tabKey]: list };
          });
        }
      } catch (e) {
        console.error("LiveChatPage: error handling new-message event", e);
      }
    };

    onSocketEvent("new-message", handler);
    const handleIntervention = (data) => {
      setInterventionAlert(data);
      setTimeout(() => setInterventionAlert(null), 6000);
    };
    onSocketEvent("intervention", handleIntervention);
    return () => {
      offSocketEvent("new-message", handler);
      offSocketEvent("intervention", handleIntervention);
    };
  }, [selectedChat, tab, isManager, isAgent, loadChats]);

  // Poll like Waabizx: refresh conversation list and messages so new messages appear in active/requesting/intervened
  useEffect(() => {
    const POLL_MS = 20000;
    const refreshList = async () => {
      const requestedTab = liveChatTabRef.current;
      try {
        const list = await fetchLiveChatTabData(requestedTab, {
          isManager,
          isAgent,
          currentUserId,
          agentCanPickup,
        });
        if (requestedTab !== liveChatTabRef.current) return;
        const filtered = list.filter((c) => !resolvedConvIds.has(c.id));
        setConversationsByTab((prev) => ({ ...prev, [requestedTab]: filtered }));
        mergeIntervenedPhones(list);
        setSelectedChat((prev) => {
          if (!prev) return prev;
          if (resolvedConvIds.has(prev.id)) return null;
          const updated = filtered.find((c) => c.id === prev.id);
          return updated || prev;
        });
      } catch (_) {}
    };
    const refreshMessages = async () => {
      if (!selectedChat) return;
      try {
        const rows = await fetchEnrichedMessages(selectedChat.id, selectedChat.phone);
        setMessages(rows);
      } catch (_) {}
    };
    const tick = () => {
      refreshList();
      refreshMessages();
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [tab, selectedChat, isManager, isAgent, currentUserId, agentCanPickup, resolvedConvIds, mergeIntervenedPhones]);

  useEffect(() => {
    setTransferMenuOpen(false);
    setAssignMenuConvId(null);
    insertLoadedRef.current = false;
    setInsertOpen(false);
    setInsertPreviewItem(null);
  }, [tab, selectedChat?.id]);

  useEffect(() => {
    if (!transferMenuOpen) return;
    const onDocClick = (e) => {
      if (transferMenuRef.current && !transferMenuRef.current.contains(e.target)) {
        setTransferMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [transferMenuOpen]);

  useEffect(() => {
    if (!assignMenuConvId) return;
    const onDocClick = (e) => {
      if (assignMenuRef.current && !assignMenuRef.current.contains(e.target)) {
        setAssignMenuConvId(null);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [assignMenuConvId]);

  const handleResolveChat = () => {
    if (!selectedChat?.id || resolving) return;
    setSelectedDisposition(null);
    setResolveDispositionOpen(true);
  };

  const confirmResolveChat = async () => {
    if (!selectedChat?.id || resolving || !selectedDisposition) return;
    const convId = selectedChat.id;
    setResolving(true);
    setTransferMenuOpen(false);
    setError(null);
    try {
      const result = await closeChat(convId, selectedDisposition);
      if (result?.systemMessage) {
        appendSystemMessageLocal(result.systemMessage);
      } else {
        const dispositionLabel =
          result?.dispositionLabel || getDispositionLabel(selectedDisposition);
        appendSystemMessageLocal({
          content: `Chat resolved by ${String(currentUserName || currentUserEmail || "you").toUpperCase()} · Disposition: ${dispositionLabel}`,
        });
      }
      await new Promise((r) => setTimeout(r, 900));
      setResolvedConvIds((prev) => new Set([...prev, convId]));
      removeConvFromAllTabs(convId);
      setResolveDispositionOpen(false);
      setSelectedDisposition(null);
      setSelectedChat(null);
      await loadChats();
    } catch (err) {
      setError(err.message || "Failed to resolve chat");
    } finally {
      setResolving(false);
    }
  };

  const handleSelectChat = (chat) => {
    setSelectedChat(chat);
  };

  const handleAcceptChat = async (e, conv) => {
    e.stopPropagation();
    if (!isAgent) return;
    const assignedToMe = Number(conv?.agent_id) === Number(currentUserId);
    const unassigned = isUnassignedAgent(conv?.agent_id);
    if (!assignedToMe && !(agentCanPickup && unassigned)) return;
    try {
      await acceptChat(conv.id);
      liveChatTabRef.current = "active";
      setTab("active");
      const list = await fetchLiveChatTabData("active", {
        isManager,
        isAgent,
        currentUserId,
        agentCanPickup,
      });
      setConversationsByTab((prev) => ({ ...prev, active: list }));
      const updated = list.find((c) => c.id === conv.id);
      if (updated) {
        setSelectedChat(updated);
      } else {
        setSelectedChat({
          ...conv,
          agent_id: currentUserId,
          status: "active",
        });
      }
    } catch (err) {
      setError(err.message || "Failed to accept chat");
    }
  };

  const handleAssignChat = async (e, conv) => {
    e.stopPropagation();
    if (!isManager) return;
    setAssignMenuConvId((prev) => (prev === conv.id ? null : conv.id));
  };

  const handleAssignChatToAgent = async (conv, agent) => {
    if (!isManager || !conv?.id || !agent?.id) return;
    setAssignMenuConvId(null);
    try {
      const result = await assignChatToAgent(conv.id, agent.id);
      if (result && result.success !== false) {
        const data = await getManagerRequesting();
        const list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
        const requestingOnly = list.filter(
          (c) => String(c?.status || "").toLowerCase() === "requesting"
        );
        setConversationsByTab((prev) => ({ ...prev, requesting: requestingOnly }));
        if (selectedChat && selectedChat.id === conv.id) {
          setSelectedChat(null);
        }
      } else {
        setError(result?.message || result?.error || "Failed to assign chat");
      }
    } catch (err) {
      setError(err.message || "Failed to assign chat");
    }
  };

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleIntervene = async () => {
    if (!selectedChat || intervening) return;
    const phone = selectedChat.phone;
    const convId = selectedChat.id;
    if (!phone && !convId) return;

    setIntervening(true);
    setError(null);
    try {
      let result;
      if (phone) {
        result = await interveneByPhone(phone, currentUserId);
      } else {
        result = await interveneChat(convId);
      }
      if (result?.success === false) {
        setError(result?.message || result?.error || "Failed to intervene");
        return;
      }
      if (phone) {
        setIntervenedPhones((prev) => {
          const next = { ...prev, [phone]: true };
          try {
            localStorage.setItem(INTERVENED_STORAGE_KEY, JSON.stringify(next));
          } catch (_) {}
          return next;
        });
      }
      setSelectedChat((prev) => (prev ? { ...prev, status: "intervened", agent_id: currentUserId } : prev));
      setTab("intervened");
      await loadChats();
      if (convId) {
        await loadMessages(convId, phone);
      }
    } catch (err) {
      setError(err?.message || "Failed to intervene");
    } finally {
      setIntervening(false);
    }
  };

  const chatStatusLower = String(selectedChat?.status || "").toLowerCase();
  const isIntervenedChat =
    tab === "intervened" ||
    (selectedChat?.phone && intervenedPhones[selectedChat.phone]) ||
    chatStatusLower === "intervened";
  // AiSensy: after Accept (Active) agent can reply; Intervene also unlocks reply
  const canHumanReply =
    !isHistoryTab &&
    Boolean(selectedChat?.id) &&
    (isIntervenedChat || chatStatusLower === "active" || tab === "active");

  const hasIncomingCustomerMessage = messages.some(
    (m) =>
      m.type === "incoming" ||
      String(m.sender || "").toLowerCase() === "customer" ||
      m.direction === "inbound"
  );

  const showInterveneBar =
    selectedChat &&
    !isHistoryTab &&
    !canHumanReply &&
    hasIncomingCustomerMessage;

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!selectedChat?.id || !messageText.trim() || sending) return;
    const text = messageText.trim();
    setSending(true);
    setError(null);
    try {
      const data = await sendChatMessage(selectedChat.id, text);
      setMessageText("");
      const list = Array.isArray(data?.messages) ? data.messages : null;
      if (list && list.length > 0) {
        setMessages(list);
      } else {
        const rows = await fetchEnrichedMessages(selectedChat.id, selectedChat.phone);
        setMessages(rows);
      }
    } catch (err) {
      const msg = err?.message || err?.data?.error || "Failed to send message";
      setError(msg);
      console.error("Send message error:", err);
    } finally {
      setSending(false);
    }
  };

  const loadInsertOptions = async () => {
    if (!canHumanReply || insertLoadedRef.current) return;
    setInsertLoading(true);
    setInsertError("");

    try {
      const [cannedRes, localTemplatesRes, metaTemplatesRes] = await Promise.all([
        axios.get("/canned-messages"),
        axios.get("/templates", { params: { page: 1, limit: 200, status: "approved" } }),
        axios.get("/templates/meta"),
      ]);

      const cannedMessages = Array.isArray(cannedRes?.data?.messages)
        ? cannedRes.data.messages
        : [];

      setInsertCannedOptions(
        cannedMessages.map((m) => {
          const type = String(m.type || "TEXT").toUpperCase();
          const val = String(m.text || "");
          const insertValue =
            type === "TEXT"
              ? val
              : type === "IMAGE"
                ? `[image:${val.trim() || "image"}]`
                : `[file:${val.trim() || "file"}]`;

          return {
            id: String(m.id),
            label: `${m.name} (${type})`,
            insertValue,
            kind: "canned",
          };
        })
      );

      const localTemplates = Array.isArray(localTemplatesRes?.data?.templates)
        ? localTemplatesRes.data.templates
        : [];

      // Extra safety: only include approved templates in the UI.
      const localApprovedTemplates = localTemplates.filter(
        (t) => String(t?.status || "").toLowerCase() === "approved"
      );

      const localOptions = localApprovedTemplates.map((t) => ({
        id: `local_${t.id}`,
        label: String(t?.name || "Template"),
        insertValue: String(t?.content || ""),
        kind: "template",
        mode: "template",
        templateName: String(t?.name || ""),
        templateLanguage: String(t?.language || "en_US"),
        templateParams: Array.isArray(t?.variables) ? t.variables : [],
        headerMediaUrl: extractTemplateHeaderMediaUrl(t),
        variables: t?.variables && typeof t.variables === "object" && !Array.isArray(t.variables) ? t.variables : null,
        components: Array.isArray(t?.components)
          ? t.components
          : Array.isArray(t?.variables?.components)
            ? t.variables.components
            : undefined,
      }));

      const metaTemplates = Array.isArray(metaTemplatesRes?.data?.templates)
        ? metaTemplatesRes.data.templates
        : [];

      const localByName = new Map(
        localApprovedTemplates.map((t) => [normalizeTemplateKey(t?.name), t])
      );

      const metaOptions = metaTemplates
        .filter((t) => String(t?.metaStatus || t?.status || "").toUpperCase() === "APPROVED")
        .map((t) => {
          const body = t?.components?.find((c) => String(c?.type || "").toUpperCase() === "BODY");
          const bodyText = body?.text || t?.name || "";
          const sampleParams = Array.isArray(body?.example?.body_text)
            ? (Array.isArray(body.example.body_text[0]) ? body.example.body_text[0] : [])
            : [];
          const localMatch = localByName.get(normalizeTemplateKey(t?.name));
          const catalogHit = templateCatalog.get(normalizeTemplateKey(t?.name));
          return {
            id: `meta_${t.id}`,
            label: String(t?.name || "Meta Template"),
            insertValue: String(bodyText),
            kind: "template",
            mode: "template",
            templateName: String(t?.name || ""),
            templateLanguage: String(t?.language?.code || t?.language || "en_US"),
            templateParams: sampleParams.map((p) => String(p ?? "")),
            headerMediaUrl:
              extractTemplateHeaderMediaUrl(localMatch) ||
              extractTemplateHeaderMediaUrl(catalogHit) ||
              extractTemplateHeaderMediaUrl(t) ||
              null,
            variables:
              (localMatch?.variables &&
              typeof localMatch.variables === "object" &&
              !Array.isArray(localMatch.variables)
                ? localMatch.variables
                : null) ||
              (t?.variables && typeof t.variables === "object" && !Array.isArray(t.variables)
                ? t.variables
                : null),
            components: Array.isArray(t?.components) ? t.components : undefined,
          };
        });

      setInsertTemplateOptions([...localOptions, ...metaOptions]);
      insertLoadedRef.current = true;
    } catch (e) {
      setInsertError(e?.response?.data?.message || e?.message || "Failed to load inserts");
    } finally {
      setInsertLoading(false);
    }
  };

  // Resolve template placeholders like {{1}}, {{2}} using current chat values.
  const resolveTemplatePlaceholders = (rawText, chat) => {
    const text = String(rawText || "");
    if (!text.includes("{{")) return text;

    const phone = String(chat?.phone || "").trim();
    const normalizedPhone = phone.replace(/^\+/, "");
    const customerName = String(chat?.customer_name || chat?.name || "").trim();
    const email = String(chat?.email || "").trim();

    const defaultName =
      customerName && customerName !== phone ? customerName : (normalizedPhone || "Customer");

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

  const getTemplateParamValue = (idx, chat) => {
    const phone = String(chat?.phone || "").trim();
    const normalizedPhone = phone.replace(/^\+/, "");
    const customerName = String(chat?.customer_name || chat?.name || "").trim();
    const email = String(chat?.email || "").trim();
    const defaultName =
      customerName && customerName !== phone ? customerName : (normalizedPhone || "Customer");
    const valueMap = {
      1: defaultName,
      2: normalizedPhone || defaultName,
      3: email || defaultName,
      4: normalizedPhone ? normalizedPhone.slice(-4) : defaultName,
    };
    return String(valueMap[idx] || defaultName);
  };

  const buildTemplateParams = (item, chat) => {
    const bodyText = String(item?.insertValue || "");
    const explicitParams = Array.isArray(item?.templateParams)
      ? item.templateParams.filter((v) => String(v || "").trim() !== "")
      : [];
    const matches = [...bodyText.matchAll(/\{\{\s*(\d+)\s*\}\}/g)];
    const indices = [
      ...new Set(matches.map((m) => Number(m[1])).filter((n) => Number.isFinite(n) && n > 0)),
    ].sort((a, b) => a - b);
    if (indices.length === 0) return explicitParams;
    return indices.map((idx, arrPos) =>
      String(explicitParams[arrPos] || getTemplateParamValue(idx, chat))
    );
  };

  const resolveTemplateHeaderMediaUrl = (template) => extractTemplateHeaderMediaUrl(template);

  const selectInsertItemForPreview = (opt) => {
    const item = typeof opt === "string" ? { kind: "canned", insertValue: opt } : (opt || {});
    const rawText = String(item.insertValue || "").trim();
    const resolvedText =
      resolveTemplatePlaceholders(rawText, selectedChat) || rawText || String(item.label || "");
    if (!resolvedText && item.mode !== "template") return;
    setInsertError("");

    let templatePreview = null;
    let resolvedHeaderMediaUrl = null;
    if (item.mode === "template" || item.kind === "template") {
      const templateName = String(item.templateName || "").trim();
      const catalogHit = templateCatalog.get(normalizeTemplateKey(templateName));
      resolvedHeaderMediaUrl =
        resolveTemplateHeaderMediaUrl(catalogHit) ||
        resolveTemplateHeaderMediaUrl(item) ||
        item.headerMediaUrl ||
        null;
      const isImageTemplate =
        Boolean(resolvedHeaderMediaUrl) ||
        templateHasImageHeader(catalogHit) ||
        templateHasImageHeader(item);
      const needsHeaderMedia =
        templateNeedsHeaderMedia(catalogHit) ||
        templateNeedsHeaderMedia(item) ||
        isImageTemplate;
      const imageVars = needsHeaderMedia
        ? {
            ...(resolvedHeaderMediaUrl
              ? { headerMediaUrl: resolvedHeaderMediaUrl, header_media_url: resolvedHeaderMediaUrl }
              : {}),
            templateType:
              String(catalogHit?.variables?.templateType || item?.variables?.templateType || "image")
                .toLowerCase() || "image",
          }
        : {};
      const previewSource = catalogHit
        ? {
            ...catalogHit,
            variables: {
              ...(catalogHit.variables &&
              typeof catalogHit.variables === "object" &&
              !Array.isArray(catalogHit.variables)
                ? catalogHit.variables
                : {}),
              ...imageVars,
            },
          }
        : {
            name: templateName,
            content: resolvedText,
            variables: {
              ...(item.variables &&
              typeof item.variables === "object" &&
              !Array.isArray(item.variables)
                ? item.variables
                : {}),
              ...imageVars,
            },
            components: Array.isArray(item.components) ? item.components : undefined,
          };
      templatePreview = buildTemplatePreview(previewSource, {
        content: resolvedText,
        templateName,
        isTemplate: true,
        mediaUrl: resolvedHeaderMediaUrl,
        headerImageUrl: resolvedHeaderMediaUrl,
      });
      if (templatePreview && needsHeaderMedia) {
        const fmt =
          String(templatePreview.headerFormat || "").toUpperCase() ||
          (imageVars.templateType === "video"
            ? "VIDEO"
            : imageVars.templateType === "document"
              ? "DOCUMENT"
              : "IMAGE");
        templatePreview = {
          ...templatePreview,
          headerFormat: fmt,
          headerImageUrl: templatePreview.headerImageUrl || resolvedHeaderMediaUrl || null,
          header:
            templatePreview.header ||
            (resolvedHeaderMediaUrl
              ? { type: fmt === "IMAGE" ? "image" : fmt.toLowerCase(), url: resolvedHeaderMediaUrl }
              : { type: fmt === "IMAGE" ? "image" : fmt.toLowerCase() }),
        };
      }
    }

    setInsertPreviewItem({
      ...item,
      rawText,
      resolvedText: resolvedText || String(item.templateName || "Template"),
      headerMediaUrl: resolvedHeaderMediaUrl || item.headerMediaUrl || null,
      templatePreview,
    });
  };

  const cancelInsertPreview = () => {
    setInsertPreviewItem(null);
    setInsertError("");
  };

  const closeInsertPopover = () => {
    setInsertOpen(false);
    setInsertPreviewItem(null);
    setInsertError("");
    setInsertOptionSearch("");
  };

  const confirmSendInsertItem = async () => {
    if (!insertPreviewItem || !selectedChat?.id || sending) return;
    setInsertError("");
    setSending(true);

    try {
      // Real WhatsApp template send (AiSensy / Inbox parity)
      if (insertPreviewItem.mode === "template" || insertPreviewItem.kind === "template") {
        const phone = selectedChat.phone;
        if (!phone) throw new Error("Phone is required to send template");
        const templateName = String(insertPreviewItem.templateName || "").trim();
        if (!templateName) throw new Error("Template name is missing");

        const resolvedBody = String(insertPreviewItem.resolvedText || "").trim();
        const catalogHit = templateCatalog.get(normalizeTemplateKey(templateName));
        const headerMediaUrl =
          insertPreviewItem.headerMediaUrl ||
          resolveTemplateHeaderMediaUrl(insertPreviewItem) ||
          resolveTemplateHeaderMediaUrl(catalogHit) ||
          null;
        const needsHeaderMedia =
          templateNeedsHeaderMedia(catalogHit) ||
          templateNeedsHeaderMedia(insertPreviewItem) ||
          templateHasImageHeader(catalogHit) ||
          templateHasImageHeader(insertPreviewItem) ||
          String(insertPreviewItem.templatePreview?.headerFormat || "").toUpperCase() === "IMAGE";
        if (needsHeaderMedia && !headerMediaUrl) {
          throw new Error("Upload a header image before sending this template.");
        }
        const isImageTemplate = needsHeaderMedia;
        const imageVars = isImageTemplate
          ? {
              ...(headerMediaUrl ? { headerMediaUrl, header_media_url: headerMediaUrl } : {}),
              templateType: "image",
            }
          : {};
        const previewSource = catalogHit
          ? {
              ...catalogHit,
              variables: {
                ...(catalogHit.variables &&
                typeof catalogHit.variables === "object" &&
                !Array.isArray(catalogHit.variables)
                  ? catalogHit.variables
                  : {}),
                ...imageVars,
              },
            }
          : insertPreviewItem;
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
            headerFormat: templatePreview.headerFormat || "IMAGE",
            headerImageUrl: templatePreview.headerImageUrl || headerMediaUrl || null,
            header:
              templatePreview.header ||
              (headerMediaUrl ? { type: "image", url: headerMediaUrl } : null),
          };
        }

        const nowIso = new Date().toISOString();
        const optimistic = {
          id: `template_quick_${Date.now()}`,
          content: resolvedBody,
          message: resolvedBody,
          sender: "agent",
          type: "outgoing",
          messageType: "template",
          status: "sent",
          created_at: nowIso,
          sentAt: nowIso,
          isTemplate: true,
          isTemplateSend: true,
          templateName,
          templatePreview,
          templateSnapshot: templatePreview,
          mediaUrl: headerMediaUrl || null,
          headerImageUrl: headerMediaUrl || null,
          phone,
        };
        setMessages((prev) => [...(prev || []), optimistic]);

        await sendTemplateMessage(
          phone,
          templateName,
          insertPreviewItem.templateLanguage || "en_US",
          buildTemplateParams(insertPreviewItem, selectedChat),
          headerMediaUrl
        );
        closeInsertPopover();
        setMessageText("");
        const rows = await fetchEnrichedMessages(selectedChat.id, selectedChat.phone);
        setMessages(rows);
        return;
      }

      const resolvedText = String(insertPreviewItem.resolvedText || "").trim();
      if (!resolvedText) return;
      const data = await sendChatMessage(selectedChat.id, resolvedText);
      setMessageText("");
      closeInsertPopover();
      const list = Array.isArray(data?.messages) ? data.messages : null;
      if (list && list.length > 0) {
        setMessages(list);
      } else {
        const rows = await fetchEnrichedMessages(selectedChat.id, selectedChat.phone);
        setMessages(rows);
      }
    } catch (err) {
      const msg = err?.message || err?.data?.error || "Failed to send message";
      setInsertError(msg);
      setError(msg);
      console.error("Send insert message error:", err);
    } finally {
      setSending(false);
    }
  };

  const sendInsertItem = async (opt) => {
    selectInsertItemForPreview(opt);
  };

  const handleMediaFileSelected = async (e) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file || !selectedChat?.phone || uploadingMedia || !canHumanReply) return;

    let contactId = resolvedContactId;
    if (!contactId) {
      contactId = await resolveContactIdByPhone(selectedChat.phone);
      setResolvedContactId(contactId);
    }
    if (!contactId) {
      setError("Contact not found for this phone. Open Inbox once or add the contact, then retry media send.");
      return;
    }

    setUploadingMedia(true);
    setError(null);
    try {
      const uploadResult = await uploadMedia(contactId, file);
      await sendMediaMessage(contactId, uploadResult.media, "");
      const rows = await fetchEnrichedMessages(selectedChat.id, selectedChat.phone);
      setMessages(rows);
    } catch (err) {
      setError(err?.message || "Failed to send media");
    } finally {
      setUploadingMedia(false);
    }
  };

  useEffect(() => {
    if (!insertOpen) return;
    const onDocMouseDown = (e) => {
      const el = insertPopoverRef.current;
      if (!el) return;
      if (!el.contains(e.target)) closeInsertPopover();
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [insertOpen]);

  useEffect(() => {
    if (!canHumanReply) return;
    loadInsertOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canHumanReply]);

  // Keep chat pinned to latest message like /inbox.
  useEffect(() => {
    if (!selectedChat) return;
    const scroller = chatScrollRef.current;
    if (!scroller) return;

    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "auto", block: "end" });
      return;
    }

    scroller.scrollTop = scroller.scrollHeight;
  }, [selectedChat, messages, loadingMessages]);

  const filteredConversations = (() => {
    let list = (conversations || []).filter((c) => !resolvedConvIds.has(c.id));

    if (tab === "intervened") {
      list = list.filter((c) => String(c?.status || "").toLowerCase() === "intervened");
    } else if (tab === "active") {
      list = list.filter((c) => String(c?.status || "").toLowerCase() === "active");
    } else if (tab === "requesting") {
      list = list.filter((c) => String(c?.status || "").toLowerCase() === "requesting");
    }

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => {
        const phone = String(c.phone || "").toLowerCase();
        const name = String(c.customer_name || "").toLowerCase();
        const agentFromList = (agentsList || []).find((a) => Number(a?.id) === Number(c?.agent_id));
        const agentName = String(
          c.agent_name || agentFromList?.name || agentFromList?.email || ""
        ).toLowerCase();
        return phone.includes(q) || name.includes(q) || agentName.includes(q);
      });
    }

    // Admin/manager: Intervened By Me / Any / Other / agent — agents already scoped by API
    if (tab === "intervened" && currentUserId && !isAgent) {
      const uid = Number(currentUserId);
      if (intervenedFilter === "me") {
        list = list.filter((c) => Number(c.agent_id) === uid);
      } else if (intervenedFilter === "other") {
        list = list.filter((c) => c.agent_id != null && Number(c.agent_id) !== uid);
      } else if (intervenedFilter.startsWith("agent:")) {
        const aid = Number(intervenedFilter.split(":")[1]);
        list = list.filter((c) => Number(c.agent_id) === aid);
      }
    }

    return list;
  })();

  const intervenedFilterOptions = (() => {
    const uid = Number(currentUserId);
    const all = (conversations || []).filter(
      (c) => !resolvedConvIds.has(c.id) && String(c?.status || "").toLowerCase() === "intervened"
    );
    const countFor = (predicate) => all.filter(predicate).length;
    const agentSearch = intervenedAgentSearch.trim().toLowerCase();
    const agents = (agentsList || []).filter((a) => {
      if (!agentSearch) return true;
      const label = `${a?.name || ""} ${a?.email || ""}`.toLowerCase();
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
    if (intervenedFilter === "me") return "Intervened By Me";
    if (intervenedFilter === "any") return "Intervened By Any";
    if (intervenedFilter === "other") return "Intervened By Other";
    if (intervenedFilter.startsWith("agent:")) {
      const aid = Number(intervenedFilter.split(":")[1]);
      const agent = (agentsList || []).find((a) => Number(a.id) === aid);
      const name = agent?.name || agent?.email || "Agent";
      return `Intervened By ${name}`;
    }
    return "Intervened";
  })();

  const tabCount = filteredConversations.length;

  return (
    <div className="h-screen flex flex-row bg-gray-50 overflow-hidden">
      {interventionAlert && isManager && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] motion-enter min-w-[280px] max-w-lg rounded-2xl border border-sky-200/80 bg-white/95 backdrop-blur-md px-5 py-4 shadow-2xl shadow-sky-900/15 ring-1 ring-sky-400/25 flex flex-wrap items-center gap-3 text-sm">
          <span className="font-bold text-sky-700 shrink-0 text-xs uppercase tracking-wider">Intervention</span>
          <span className="text-gray-700 flex-1 min-w-[200px]">
            <strong className="text-gray-900">{interventionAlert.agentName}</strong> intervened
            {interventionAlert.dateTime && (
              <> at {new Date(interventionAlert.dateTime).toLocaleString()}</>
            )}
            {interventionAlert.phone && <> (phone: {interventionAlert.phone})</>}.
          </span>
          <button
            type="button"
            onClick={() => setInterventionAlert(null)}
            className="shrink-0 w-9 h-9 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition border border-transparent hover:border-gray-200"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <AgentSidebar open={sidebarOpen} />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <AgentTopbar onMenuClick={() => setSidebarOpen((o) => !o)} />

        <div className="shrink-0 z-10 border-b border-gray-200/80 bg-gradient-to-r from-white/95 via-sky-50/50 to-white/95 backdrop-blur-md px-3 md:px-5 py-2.5 md:py-3 shadow-sm shadow-gray-200/30">
          <div className="flex flex-wrap items-center gap-3 max-w-[2000px] mx-auto">
            <div className="hidden lg:flex items-center gap-2 shrink-0 text-xs font-semibold text-sky-800">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
              Live Chat
            </div>
            <div className="flex-1 min-w-[180px] max-w-xl mx-auto w-full">
              <div className="relative w-full">
                <input
                  type="text"
                  placeholder={
                    tab === "intervened"
                      ? "Search contact, phone, or agent name"
                      : "Search name or mobile number"
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/95 border-2 border-gray-200/90 rounded-xl pl-10 pr-12 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400/40 focus:border-sky-500 transition"
                />
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <button
                  type="button"
                  onClick={() => {
                    if (tab === "intervened" && !isAgent) {
                      setIntervenedFilterOpen((v) => !v);
                    }
                  }}
                  className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg transition ${
                    tab === "intervened" && !isAgent
                      ? intervenedFilterOpen
                        ? "text-sky-700 bg-sky-100"
                        : "text-sky-600 hover:bg-sky-50"
                      : "text-gray-300 cursor-default"
                  }`}
                  aria-label="Filter intervened by agent"
                  title={tab === "intervened" && !isAgent ? "Filter by agent" : "Filters"}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0 max-w-full overflow-x-auto pb-0.5 md:pb-0 [scrollbar-width:thin]">
              {agentsList.slice(0, 7).map((a) => {
                const name = a?.name || a?.email || "";
                const initial = name ? String(name).trim().slice(0, 2).toUpperCase() : "?";
                const isAgentSelected =
                  selectedAgent && (selectedAgent.id === a.id || (selectedAgent.email && selectedAgent.email === a.email));
                return (
                  <button
                    key={a.id ?? a.email ?? initial}
                    type="button"
                    onClick={() => setSelectedAgent(a)}
                    className={`w-9 h-9 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 border-2 transition-all duration-200 ${
                      isAgentSelected
                        ? "bg-gradient-to-br from-sky-500 to-blue-700 border-white text-white shadow-lg shadow-sky-500/40 ring-2 ring-sky-300/50 scale-105"
                        : "bg-white border-gray-200 text-sky-800 hover:border-sky-300 hover:shadow-md"
                    }`}
                    title={name || "Agent"}
                  >
                    {initial}
                  </button>
                );
              })}
              <button
                type="button"
                className="p-2 rounded-xl text-sky-600 hover:bg-sky-50 border border-transparent hover:border-sky-200 transition"
                aria-label="More"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 flex min-h-0 relative overflow-hidden bg-gradient-to-b from-sky-50/80 via-white to-sky-100/40">
          <div className="pointer-events-none absolute inset-0 overflow-hidden z-0" aria-hidden>
            <div className="absolute -top-24 right-1/4 w-72 h-72 bg-sky-400/25 motion-page-blob" />
            <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-blue-400/20 motion-page-blob motion-page-blob--b" />
          </div>

          <div className="relative z-[1] flex flex-1 min-h-0 min-w-0">
          <div className="w-80 flex flex-col flex-shrink-0 min-h-0 bg-white/90 backdrop-blur-sm border-r border-gray-200/80 shadow-sm shadow-gray-200/20">
            <div className="flex p-1.5 gap-1.5 flex-shrink-0 bg-gradient-to-b from-gray-100/90 to-gray-50/80 border-b border-gray-200/60 overflow-x-auto [scrollbar-width:none]">
              {[
                { id: "active", label: "Active" },
                { id: "requesting", label: "Requesting" },
                { id: "intervened", label: "Intervened" },
                { id: "history", label: "History" },
              ].map((t) => (
              <button
                  key={t.id}
                type="button"
                  onClick={() => {
                    if (t.id === tab) return;
                    liveChatFetchSeqRef.current += 1;
                    liveChatTabRef.current = t.id;
                    setAssignMenuConvId(null);
                    setSelectedChat(null);
                    setIntervenedFilterOpen(false);
                    setLoadingChats(!(conversationsByTab[t.id] || []).length);
                    setTab(t.id);
                  }}
                  className={`shrink-0 px-2.5 py-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-wide transition-all duration-200 rounded-lg whitespace-nowrap ${
                    tab === t.id
                    ? "bg-gradient-to-r from-sky-600 to-blue-700 text-white shadow-md shadow-sky-600/25 ring-1 ring-sky-400/30"
                      : "text-sky-900/80 bg-white/70 hover:bg-white border border-transparent hover:border-sky-100"
                }`}
              >
                  {t.label}{tab === t.id ? ` (${tabCount})` : ""}
              </button>
              ))}
            </div>
            {tab === "history" && (
              <div className="px-3 py-2 border-b border-gray-200/80 bg-slate-50 text-xs text-slate-600 shrink-0">
                Chats older than 24 hours — read only
              </div>
            )}
            {tab === "intervened" && !isAgent && (
              <div className="border-b border-gray-200/80 bg-white shrink-0 relative z-30">
              <button
                type="button"
                  onClick={() => setIntervenedFilterOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left text-sm font-semibold text-gray-800 bg-gray-100/90 hover:bg-gray-100"
                >
                  <span className="truncate">
                    {intervenedFilterTitle} ({tabCount})
                  </span>
                  <svg
                    className={`w-4 h-4 shrink-0 transition-transform ${intervenedFilterOpen ? "rotate-180" : ""}`}
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
                      { id: "me", short: "ME", label: "Intervened By Me", count: intervenedFilterOptions.me, ring: "text-red-600" },
                      { id: "any", short: "AY", label: "Intervened By Any", count: intervenedFilterOptions.any, ring: "text-red-600" },
                      { id: "other", short: "OT", label: "Intervened By Other", count: intervenedFilterOptions.other, ring: "text-red-600" },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setIntervenedFilter(opt.id);
                          setIntervenedFilterOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-sky-50/80 border-b border-gray-50 ${
                          intervenedFilter === opt.id ? "bg-sky-50" : ""
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
                            intervenedFilter === filterId ? "bg-sky-50" : ""
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
            <div className="flex-1 overflow-y-auto min-h-0 bg-white/50">
              {loadingChats ? (
                <div className="p-8 flex flex-col items-center justify-center gap-3 text-gray-500 text-sm motion-enter">
                  <div className="h-8 w-8 rounded-full border-2 border-sky-200 border-t-sky-600 animate-spin" />
                  Loading chats…
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-8 text-center text-gray-500 text-sm motion-enter">
                  <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  {isAgent && tab === "requesting" && !agentCanPickup && filteredConversations.length === 0
                    ? "No chats assigned to you yet. Ask a manager to assign, or enable pickup permission for the open queue."
                    : tab === "intervened"
                      ? "No intervened chats match this filter."
                      : tab === "history"
                        ? "No history conversations."
                    : `No ${tab} chats.`}
                </div>
              ) : (
                filteredConversations.map((conv, index) => {
                  const isConvSelected = selectedChat?.id === conv.id;
                  const displayName = resolveContactDisplayName(conv);
                  const rowKey = `live-${tab}-${conv.id ?? "x"}-${normalizePhoneDigits(conv.phone) || index}`;
                  const canAcceptAssigned =
                    isAgent &&
                    Number(conv.agent_id) === Number(currentUserId) &&
                    String(conv.status || "").toLowerCase() === "requesting";
                  const canAcceptUnassigned =
                    isAgent &&
                    agentCanPickup &&
                    isUnassignedAgent(conv.agent_id) &&
                    String(conv.status || "").toLowerCase() === "requesting";
                  return (
                    <div
                      key={rowKey}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectChat(conv)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelectChat(conv);
                        }
                      }}
                      className={`w-full flex flex-col gap-2 p-3 text-left border-b border-gray-100/90 cursor-pointer transition-all duration-200 motion-card-rich ${
                        isConvSelected
                          ? "bg-gradient-to-r from-sky-50 to-white border-l-4 border-l-sky-600 shadow-inner"
                          : "hover:bg-sky-50/60"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-100 to-sky-200 text-sky-800 flex items-center justify-center text-sm font-bold flex-shrink-0 ring-2 ring-white shadow-sm">
                          {getInitial(displayName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-900 truncate">{displayName}</p>
                          {conv.phone ? (
                            <p className="text-xs text-sky-600 font-medium truncate">
                              {formatPhoneDisplay(conv.phone)}
                            </p>
                          ) : null}
                          <p className="text-xs text-gray-500 truncate">{conv.last_message || "—"}</p>
                          {tab === "intervened" && conv.agent_name ? (
                            <p className="text-[11px] font-semibold text-violet-700 mt-1 truncate">
                              Intervened by {conv.agent_name}
                            </p>
                          ) : null}
                        </div>
                        {conv.unread_count > 0 && (
                          <span className="flex-shrink-0 min-w-[1.25rem] h-5 px-1 rounded-full bg-gradient-to-r from-sky-600 to-blue-600 text-white text-[10px] font-bold flex items-center justify-center shadow-md">
                            {conv.unread_count > 9 ? "9+" : conv.unread_count}
                          </span>
                        )}
                      </div>
                      {tab === "requesting" &&
                        String(conv.status || "").toLowerCase() === "requesting" &&
                        (canAcceptAssigned || canAcceptUnassigned) && (
                        <button
                          type="button"
                          onClick={(e) => handleAcceptChat(e, conv)}
                          className="w-full py-2 px-2 text-xs font-bold rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-md shadow-sky-600/20 hover:from-sky-500 hover:to-blue-500 transition"
                        >
                          Accept chat
                        </button>
                      )}
                      {tab === "requesting" &&
                        String(conv.status || "").toLowerCase() === "requesting" &&
                        isManager && (
                        <div className="relative" ref={assignMenuConvId === conv.id ? assignMenuRef : null}>
                        <button
                          type="button"
                          onClick={(e) => handleAssignChat(e, conv)}
                          className="w-full py-2 px-2 text-xs font-bold rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md shadow-violet-600/20 hover:from-violet-500 hover:to-indigo-500 transition"
                        >
                          Assign to agent
                        </button>
                          {assignMenuConvId === conv.id && tab === "requesting" && (
                            <div className="absolute left-0 right-0 top-full mt-1 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-[1000] py-1">
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
                                        handleAssignChatToAgent(conv, agent);
                                      }}
                                      className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-sky-50 transition"
                                    >
                                      {label}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-w-0 min-h-0 relative bg-white/40 backdrop-blur-[2px] border-x border-gray-200/60">
            {selectedChat && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200/80 bg-white/95 backdrop-blur-md relative z-20 shrink-0">
                <div className="min-w-0">
                  <p className="font-bold text-gray-900 truncate">
                    {resolveContactDisplayName(selectedChat)}
                    {selectedChat.phone
                      ? ` (${formatPhoneDisplay(selectedChat.phone)})`
                      : ""}
                  </p>
                </div>
                {showIntervenedActions && (
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="relative" ref={transferMenuRef}>
                      <button
                        type="button"
                        onClick={() => setTransferMenuOpen((v) => !v)}
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
                          {agentsList.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-gray-500">No agents available</div>
                          ) : (
                            agentsList.map((agent) => {
                              const label = agent?.name || agent?.email || `Agent ${agent?.id}`;
                              return (
                                <button
                                  key={agent.id ?? label}
                                  type="button"
                                  onClick={() => handleTransferToAgent(agent)}
                                  disabled={transferring || Number(agent.id) === Number(selectedChat.agent_id)}
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
                      onClick={handleResolveChat}
                      disabled={resolving || transferring || resolveDispositionOpen}
                      className="px-4 py-2 text-sm font-semibold text-gray-800 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {resolving ? "Resolving…" : "Resolve"}
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="absolute inset-0 opacity-[0.04] pointer-events-none bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22%230ea5e9%22%3E%3Cpath d=%22M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z%22/%3E%3C/svg%3E')] bg-repeat bg-center" style={{ backgroundSize: "100px" }} />
            <div ref={chatScrollRef} className="flex-1 overflow-y-auto min-h-0 p-4 relative z-10 bg-[#e5ddd5]">
              {error && (
                <div className="mb-3 motion-enter p-4 bg-red-50 border border-red-200/90 rounded-xl text-red-700 text-sm shadow-sm ring-1 ring-red-100/50">
                  {error}
                </div>
              )}
              {!selectedChat ? (
                <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-gray-500 motion-enter px-4">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-sky-200 text-sky-600 shadow-inner ring-2 ring-white">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-600">Select a conversation</p>
                  <p className="text-xs text-gray-400 mt-1 text-center max-w-xs">Choose a chat from the list to view messages</p>
                </div>
              ) : (
                <>
                  <div className="flex justify-center mb-4">
                    <span className="text-xs font-medium text-sky-700/80 px-3 py-1.5 rounded-full bg-sky-50/80 border border-sky-100/80 max-w-md text-center">
                      {selectedChat.last_message_time
                        ? `Last message · ${formatTime(selectedChat.last_message_time)}`
                        : "No messages yet"}
                    </span>
                  </div>
                  {loadingMessages ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-500 text-sm gap-3">
                      <div className="h-8 w-8 rounded-full border-2 border-sky-200 border-t-sky-600 animate-spin" />
                      Loading messages…
                    </div>
                  ) : (
                    <InboxMessageThread
                      messages={messages}
                      templateCatalog={templateCatalog}
                      apiBase={INBOX_API_BASE}
                      formatMessageTime={formatTime}
                      userName={currentUserName || currentUserEmail}
                      messagesEndRef={messagesEndRef}
                    />
                  )}
                </>
              )}
            </div>
            {selectedChat && isHistoryTab && (
              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 text-center text-sm text-slate-600 relative z-10">
                This chat is in History (older than 24 hours). You can read messages only.
              </div>
            )}
            {showInterveneBar && (
              <div className="bg-gradient-to-r from-amber-50/95 via-amber-50/80 to-orange-50/60 border-t border-amber-200/80 px-6 py-3 flex items-center justify-center gap-3 flex-wrap shadow-inner motion-enter relative z-10">
                <span className="text-sm text-amber-900/90 font-medium">New customer message — take over the conversation</span>
                <button
                  type="button"
                  onClick={handleIntervene}
                  disabled={intervening}
                  className="px-4 py-2 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700 shadow-md shadow-sky-600/25 hover:shadow-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-60"
                >
                  {intervening ? "Intervening…" : "Intervene"}
                </button>
              </div>
            )}
            {selectedChat && canHumanReply && (
              <div className="p-4 border-t border-gray-200/80 bg-white/95 backdrop-blur-md flex gap-2 relative z-10 justify-center items-center flex-wrap shadow-[0_-4px_24px_-4px_rgba(14,165,233,0.08)]">
                <form onSubmit={handleSendMessage} className="flex flex-col gap-2 flex-1 min-w-[200px] max-w-xl relative">
                  {canHumanReply && (
                    <div className="flex items-center justify-end gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                        className="hidden"
                        onChange={handleMediaFileSelected}
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploadingMedia || sending}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-white border-2 border-gray-200/90 rounded-xl text-xs font-bold text-sky-800 hover:bg-sky-50 hover:border-sky-200 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
                        title="Attach media"
                      >
                        {uploadingMedia ? "Uploading…" : "📎 Media"}
                      </button>
                      <button
                        type="button"
                        onClick={() => (insertOpen ? closeInsertPopover() : setInsertOpen(true))}
                        disabled={insertLoading || sending}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-white border-2 border-gray-200/90 rounded-xl text-xs font-bold text-sky-800 hover:bg-sky-50 hover:border-sky-200 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
                        title="Insert canned messages / templates"
                      >
                        <span className="text-base leading-none">📋</span>
                        Insert
                      </button>
                    </div>
                  )}

                  {canHumanReply && insertOpen && (
                    <div
                      ref={insertPopoverRef}
                      className="motion-pop absolute bottom-full right-0 sm:right-4 mb-2 w-[min(420px,94vw)] max-h-[min(78vh,640px)] bg-white border border-gray-100/90 rounded-2xl shadow-2xl shadow-sky-900/15 z-[1000] overflow-hidden ring-1 ring-black/5 flex flex-col"
                    >
                      <div className="px-4 py-3 bg-gradient-to-r from-slate-50 to-sky-50/60 border-b border-gray-100 flex items-center justify-between gap-2 shrink-0">
                        <div className="text-sm font-bold text-gray-900">
                          {insertPreviewItem ? "Preview message" : "Send quick message"}
                        </div>
                        <button
                          type="button"
                          className="w-8 h-8 rounded-xl hover:bg-white text-gray-500 hover:text-gray-900 transition border border-transparent hover:border-gray-200"
                          onClick={closeInsertPopover}
                          aria-label="Close"
                        >
                          ×
                        </button>
                      </div>

                      {insertPreviewItem ? (
                        <div className="flex flex-col min-h-0 flex-1 overflow-hidden">
                          <InsertMessagePreview
                            title={insertPreviewItem.label || insertPreviewItem.templateName || "Message"}
                            bodyText={insertPreviewItem.resolvedText}
                            preview={insertPreviewItem.templatePreview}
                            apiBase={INBOX_API_BASE}
                            allowHeaderUpload={
                              insertPreviewItem.mode === "template" ||
                              insertPreviewItem.kind === "template"
                            }
                            templateName={insertPreviewItem.templateName || ""}
                            onHeaderMediaChange={(url) => {
                              setInsertPreviewItem((prev) => {
                                if (!prev) return prev;
                                const fmt =
                                  String(prev.templatePreview?.headerFormat || "IMAGE").toUpperCase() ||
                                  "IMAGE";
                                return {
                                  ...prev,
                                  headerMediaUrl: url,
                                  templatePreview: {
                                    ...(prev.templatePreview || {}),
                                    headerFormat: fmt,
                                    headerImageUrl: url,
                                    header: {
                                      type: fmt === "IMAGE" ? "image" : fmt.toLowerCase(),
                                      url,
                                    },
                                  },
                                };
                              });
                              setInsertError("");
                            }}
                          />

                          {insertError ? (
                            <div className="mx-4 mb-2 text-xs text-red-600 border border-red-100 bg-red-50/50 rounded-lg px-3 py-2 shrink-0">
                              {insertError}
                            </div>
                          ) : null}

                          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-100 bg-white shrink-0">
                            <button
                              type="button"
                              onClick={cancelInsertPreview}
                              disabled={sending}
                              className="flex-1 px-4 py-2.5 rounded-xl border-2 border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                            >
                              Back
                            </button>
                            <button
                              type="button"
                              onClick={confirmSendInsertItem}
                              disabled={sending}
                              className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 text-white text-sm font-semibold shadow-md hover:from-sky-500 hover:to-blue-600 disabled:opacity-50"
                            >
                              {sending ? "Sending…" : "Send"}
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
                            placeholder="Search canned or template by name"
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-sky-400/40 focus:border-sky-400 outline-none"
                          />
                        </div>
                        <div className="flex-1 min-h-0 overflow-y-auto max-h-[min(55vh,440px)]">
                        {insertLoading && (
                          <div className="px-4 py-6 flex items-center gap-2 text-sm text-gray-500">
                            <div className="h-5 w-5 rounded-full border-2 border-sky-200 border-t-sky-600 animate-spin" />
                            Loading…
                          </div>
                        )}

                        {!insertLoading && insertError && (
                          <div className="px-4 py-2 text-xs text-red-600 border-b border-red-100 bg-red-50/50">{insertError}</div>
                        )}

                        {!insertLoading && (
                          <>
                            <div className="px-4 py-3">
                              <div className="text-xs font-bold text-sky-700 uppercase tracking-wide mb-2">Canned Messages</div>
                              {(() => {
                                const q = insertOptionSearch.trim().toLowerCase();
                                const canned = insertCannedOptions.filter((opt) => {
                                  if (!q) return true;
                                  return (
                                    String(opt.label || "").toLowerCase().includes(q) ||
                                    String(opt.insertValue || "").toLowerCase().includes(q)
                                  );
                                });
                                if (canned.length === 0) {
                                  return <div className="text-xs text-gray-500">No canned messages.</div>;
                                }
                                return (
                                <div className="space-y-1.5">
                                  {canned.map((opt) => {
                                    const preview = String(opt.insertValue || "").trim();
                                    const previewText = preview.length > 72 ? `${preview.slice(0, 72)}...` : preview;
                                    return (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => sendInsertItem(opt)}
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

                            <div className="border-t border-gray-100" />

                            <div className="px-4 py-3">
                              <div className="text-xs font-bold text-sky-700 uppercase tracking-wide mb-2">Approved Templates</div>
                              {(() => {
                                const q = insertOptionSearch.trim().toLowerCase();
                                const templates = insertTemplateOptions.filter((opt) => {
                                  if (!q) return true;
                                  return (
                                    String(opt.label || "").toLowerCase().includes(q) ||
                                    String(opt.templateName || "").toLowerCase().includes(q) ||
                                    String(opt.insertValue || "").toLowerCase().includes(q)
                                  );
                                });
                                if (templates.length === 0) {
                                  return <div className="text-xs text-gray-500">No approved templates.</div>;
                                }
                                return (
                                <div className="space-y-1.5">
                                  {templates.map((opt) => {
                                    const preview = String(opt.insertValue || "").trim();
                                    const previewText = preview.length > 72 ? `${preview.slice(0, 72)}...` : preview;
                                    return (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => sendInsertItem(opt)}
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

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 px-4 py-2.5 border-2 border-gray-200/90 rounded-xl bg-white/90 focus:ring-2 focus:ring-sky-400/40 focus:border-sky-500 outline-none transition shadow-sm"
                      disabled={sending}
                    />
                    <button
                      type="submit"
                      disabled={!messageText.trim() || sending}
                      className="relative overflow-hidden px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 text-white font-semibold text-sm shadow-lg shadow-sky-600/25 hover:from-sky-500 hover:to-blue-600 disabled:opacity-50 transition-all"
                    >
                      <span className="relative z-10">{sending ? "Sending…" : "Send"}</span>
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          <div className="w-80 flex flex-col overflow-y-auto flex-shrink-0 min-h-0 bg-white/90 backdrop-blur-sm border-l border-gray-200/80 shadow-sm">
            <div className="p-4 border-b border-gray-200/80 bg-gradient-to-r from-slate-50/80 to-sky-50/40">
              <h3 className="font-bold text-gray-900 tracking-tight">Chat Profile</h3>
              <p className="text-xs text-sky-700/80 mt-0.5">Contact details</p>
            </div>
            {selectedChat ? (
              <>
                <div className="p-4 flex flex-col items-center border-b border-gray-100/80">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-sky-400 to-blue-700 text-white flex items-center justify-center text-2xl font-bold mb-3 shadow-lg shadow-sky-500/30 ring-4 ring-sky-100">
                    {getInitial(resolveContactDisplayName(selectedChat))}
                  </div>
                  <p className="font-bold text-gray-900 text-center">{resolveContactDisplayName(selectedChat)}</p>
                  <p className="text-sky-600 font-semibold text-sm mt-1">{formatPhoneDisplay(selectedChat.phone)}</p>
                </div>
                <div className="px-4 pb-4 space-y-0 text-sm">
                  {[
                    {
                      label: "Status",
                      value: String(selectedChat.status || "—")
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (ch) => ch.toUpperCase()),
                    },
                    { label: "Last Active", value: formatTime(selectedChat.last_message_time) },
                    { label: "Session Messages", value: String(messages.length) },
                    { label: "Unread", value: String(selectedChat.unread_count ?? 0) },
                    { label: "Source", value: "WhatsApp" },
                  ].map((row, i) => (
                    <div key={i} className="flex justify-between py-2.5 border-b border-gray-100/90">
                      <span className="text-gray-500 text-xs font-medium">{row.label}</span>
                      <span className="text-gray-900 font-semibold text-xs text-right">{row.value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center py-2.5 border-b border-gray-100/90">
                    <span className="text-gray-500 text-xs font-medium">Opted In</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={optedIn}
                      onClick={() => setOptedIn(!optedIn)}
                      className={`relative w-11 h-6 rounded-full transition-colors shadow-inner ${optedIn ? "bg-gradient-to-r from-sky-500 to-blue-600" : "bg-gray-300"}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-transform ${optedIn ? "left-6" : "left-1"}`} />
                    </button>
                  </div>
                </div>

                <div className="border-t border-gray-200/80">
                  <button type="button" onClick={() => toggleSection("payments")} className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-bold text-gray-800 hover:bg-sky-50/50 transition">
                    Payments
                    <svg className={`w-5 h-5 text-sky-600 transition-transform duration-200 ${openSections.payments ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openSections.payments && (
                    <div className="px-4 pb-3">
                      <div className="overflow-hidden rounded-lg border border-gray-200">
                        <div className="grid grid-cols-3 gap-2 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          <span>Order Id</span>
                          <span>Amount</span>
                          <span>Status</span>
                        </div>
                        {profileLoading ? (
                          <p className="px-3 py-3 text-xs text-gray-500">Loading…</p>
                        ) : contactPayments.length === 0 ? (
                          <p className="px-3 py-3 text-xs text-gray-400">No payments for this contact</p>
                        ) : (
                          contactPayments.map((p, idx) => (
                            <div key={p.id || idx} className="grid grid-cols-3 gap-2 border-t border-gray-100 px-3 py-2 text-xs">
                              <span className="truncate font-medium">{p.orderId || p.id || "—"}</span>
                              <span>{p.amount != null ? `₹ ${p.amount}` : "—"}</span>
                              <span className="capitalize">{p.status || "—"}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200/80">
                  <button type="button" onClick={() => toggleSection("campaigns")} className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-bold text-gray-800 hover:bg-sky-50/50 transition">
                    Campaigns
                    <svg className={`w-5 h-5 text-sky-600 transition-transform duration-200 ${openSections.campaigns ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openSections.campaigns && (
                    <div className="px-4 pb-3 space-y-2">
                      {profileLoading ? (
                        <p className="text-xs text-gray-500">Loading…</p>
                      ) : contactCampaigns.length === 0 ? (
                        <p className="text-xs text-gray-400">No campaigns for this contact</p>
                      ) : (
                        contactCampaigns.map((c) => (
                          <div key={c.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-slate-50/80 px-3 py-2">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shrink-0">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-gray-900 truncate">{c.name}</p>
                              <p className="text-[10px] text-gray-500 capitalize">{c.status || "sent"}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-gray-200/80">
                  <button type="button" onClick={() => toggleSection("attributes")} className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-bold text-gray-800 hover:bg-sky-50/50 transition">
                    Attributes
                    <svg className={`w-5 h-5 text-sky-600 transition-transform duration-200 ${openSections.attributes ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openSections.attributes && (
                    <div className="px-4 pb-3 text-sm text-gray-500">No attributes data.</div>
                  )}
                </div>

                <div className="border-t border-gray-200/80">
                  <button type="button" onClick={() => toggleSection("tags")} className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-bold text-gray-800 hover:bg-sky-50/50 transition">
                    Tags
                    <svg className={`w-5 h-5 text-sky-600 transition-transform duration-200 ${openSections.tags ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openSections.tags && (
                    <div className="px-4 pb-4 space-y-3">
                      <div className="flex flex-wrap gap-1.5">
                        {contactTags.map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                            style={{
                              backgroundColor: `${tag.color || "#0ea5e9"}18`,
                              borderColor: `${tag.color || "#0ea5e9"}55`,
                              color: tag.color || "#0369a1",
                            }}
                          >
                            {tag.name}
                      <button
                        type="button"
                              disabled={tagBusy}
                              onClick={async () => {
                                setTagBusy(true);
                                try {
                                  await removeContactTag({
                                    contactId: resolvedContactId,
                                    tagId: tag.id,
                                    phone: selectedChat.phone,
                                  });
                                  setContactTags((prev) => prev.filter((t) => t.id !== tag.id));
                                } catch (e) {
                                  alert(e?.response?.data?.message || e?.message || "Failed to remove tag");
                                } finally {
                                  setTagBusy(false);
                                }
                              }}
                              className="ml-0.5 text-current/70 hover:text-current"
                            >
                              ×
                      </button>
                          </span>
                        ))}
                      </div>
                      <div className="relative flex gap-2">
                        <div className="relative flex-1">
                          <button
                            type="button"
                            onClick={() => setTagPickerOpen((v) => !v)}
                            disabled={tagBusy}
                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-left text-xs text-gray-600 hover:border-sky-300 disabled:opacity-50"
                          >
                            Select &amp; add tag
                          </button>
                          {tagPickerOpen && (
                            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
                              {allTags.filter((t) => !contactTags.some((ct) => ct.id === t.id)).length === 0 ? (
                                <p className="px-3 py-2 text-xs text-gray-400">No more tags</p>
                              ) : (
                                allTags
                                  .filter((t) => !contactTags.some((ct) => ct.id === t.id))
                                  .map((tag) => (
                                    <button
                                      key={tag.id}
                                      type="button"
                                      onClick={async () => {
                                        setTagBusy(true);
                                        try {
                                          const result = await assignContactTag({
                                            contactId: resolvedContactId,
                                            tagId: tag.id,
                                            phone: selectedChat.phone,
                                          });
                                          if (result?.contactId) setResolvedContactId(result.contactId);
                                          const tags = await fetchContactTags({
                                            contactId: result?.contactId || resolvedContactId,
                                            phone: selectedChat.phone,
                                          });
                                          setContactTags(tags);
                                          setTagPickerOpen(false);
                                        } catch (e) {
                                          alert(e?.response?.data?.message || e?.message || "Failed to add tag");
                                        } finally {
                                          setTagBusy(false);
                                        }
                                      }}
                                      className="w-full px-3 py-2 text-left text-xs text-gray-800 hover:bg-sky-50"
                                    >
                                      {tag.name}
                                    </button>
                                  ))
                      )}
                    </div>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={tagBusy}
                          onClick={() => setTagPickerOpen(true)}
                          className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-40"
                        >
                          + Add
                        </button>
                      </div>
                      <button
                        type="button"
                        disabled={tagBusy}
                        onClick={async () => {
                          const name = window.prompt("New tag name");
                          if (!name || !String(name).trim()) return;
                          setTagBusy(true);
                          try {
                            const tag = await createTag({ name: String(name).trim(), color: "#0ea5e9" });
                            if (!tag?.id) return;
                            setAllTags((prev) => [...prev, tag]);
                            const result = await assignContactTag({
                              contactId: resolvedContactId,
                              tagId: tag.id,
                              phone: selectedChat.phone,
                            });
                            if (result?.contactId) setResolvedContactId(result.contactId);
                            const tags = await fetchContactTags({
                              contactId: result?.contactId || resolvedContactId,
                              phone: selectedChat.phone,
                            });
                            setContactTags(tags);
                          } catch (e) {
                            alert(e?.response?.data?.message || e?.message || "Failed to create tag");
                          } finally {
                            setTagBusy(false);
                          }
                        }}
                        className="text-xs font-semibold text-sky-700 hover:underline disabled:opacity-50"
                      >
                        Create &amp; Add Tag
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="p-6 text-center text-gray-500 text-sm motion-enter">
                <p>Select a chat to view profile.</p>
              </div>
            )}
          </div>
          </div>
        </div>
      </div>

      <ResolveDispositionModal
        open={resolveDispositionOpen}
        selected={selectedDisposition}
        onSelect={setSelectedDisposition}
        onConfirm={confirmResolveChat}
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

export default LiveChatPage;
