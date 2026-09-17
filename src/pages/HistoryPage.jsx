import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "react-router-dom";
import axios from "../api/axios";
import { getInboxList, getContactMessages, getContactCampaigns, getContactPayments } from "../services/inboxService";
import { getTemplates } from "../services/templateService";
import { normalizeTemplateKey } from "../utils/whatsappTemplatePreview";
import InboxMessageThread from "../components/InboxMessageThread";
import AgentSidebar from "../components/AgentSidebar";
import AgentTopbar from "../components/AgentTopbar";
import {
  fetchTags,
  fetchContactTags,
  assignContactTag,
  removeContactTag,
  createTag,
} from "../services/tagService";

function formatMessageTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getInitial(nameOrPhone) {
  if (!nameOrPhone) return "?";
  const s = String(nameOrPhone).trim();
  return s.length ? s.charAt(0).toUpperCase() : "?";
}

function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

/** Prefer a real contact name; fall back to phone when name is missing or equals the number */
function resolveContactDisplayName(item) {
  const phone = String(item?.phone || "").trim();
  const rawName = String(item?.name || item?.customer_name || "").trim();
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

function HistoryPage() {
  const location = useLocation();

  const [inboxList, setInboxList] = useState([]);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [optedIn, setOptedIn] = useState(true);
  const [openSections, setOpenSections] = useState({
    payments: true,
    campaigns: true,
    attributes: false,
    tags: true,
  });
  const [role, setRole] = useState(null);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [currentUserName, setCurrentUserName] = useState("");
  const [currentUserEmail, setCurrentUserEmail] = useState("");
  const [agentsList, setAgentsList] = useState([]);
  const [selectedAgent, setSelectedAgentState] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [profileSidebarOpen, setProfileSidebarOpen] = useState(true);
  const [templateCatalog, setTemplateCatalog] = useState(() => new Map());
  const [contactCampaigns, setContactCampaigns] = useState([]);
  const [contactPayments, setContactPayments] = useState([]);
  const [contactTags, setContactTags] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagBusy, setTagBusy] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const chatScrollRef = useRef(null);
  const messagesEndRef = useRef(null);

  const setSelectedAgent = useCallback((agent) => {
    setSelectedAgentState(agent);
    try {
      if (agent) localStorage.setItem("selectedAgent", JSON.stringify(agent));
      else localStorage.removeItem("selectedAgent");
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      const rawUser = localStorage.getItem("user");
      const storedRole = localStorage.getItem("role");
      if (storedRole) setRole(String(storedRole));
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        if (parsed) {
          if (!storedRole && parsed.role) setRole(String(parsed.role));
          setCurrentUserId(parsed.id ?? parsed._id ?? null);
          setCurrentUserName(parsed.name ?? parsed.email ?? "");
          setCurrentUserEmail(parsed.email ?? "");
        }
      }
    } catch (e) {}
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

  // Fetch agents list for selector
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
    return () => { cancelled = true; };
  }, []);

  const fetchInboxList = useCallback(async () => {
    setLoadingInbox(true);
    try {
      const data = await getInboxList();
      const list = Array.isArray(data) ? data : [];
      setInboxList(list);
      setSelectedContact((prev) => {
        if (list.length > 0 && !prev) {
          const first = list[0];
          return {
            id: first.contactId || first.phone,
            contactId: first.contactId,
            phone: first.phone,
            name: resolveContactDisplayName(first),
            email: first.email || null,
            status: first.status || null,
            lastMessage: first.lastMessage,
          };
        }
        if (prev?.phone) {
          const hit = list.find((c) => phoneDigits(c.phone) === phoneDigits(prev.phone));
          if (hit) {
            return {
              ...prev,
              contactId: hit.contactId || prev.contactId,
              name: resolveContactDisplayName({ ...hit, name: hit.name || prev.name }),
              email: hit.email || prev.email,
              status: hit.status || prev.status,
            };
          }
        }
        return prev;
      });
    } catch (e) {
      console.error("History fetchInboxList error:", e);
      setInboxList([]);
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  useEffect(() => {
    fetchInboxList();
  }, [fetchInboxList]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const localRes = await getTemplates({ page: 1, limit: 500, status: "approved" });
        let metaTemplates = [];
        try {
          const metaRes = await axios.get("/templates/meta");
          metaTemplates = Array.isArray(metaRes?.data?.templates) ? metaRes.data.templates : [];
        } catch (_) {
          /* WhatsApp may not be linked yet */
        }
        const map = new Map();
        (localRes?.templates || []).forEach((t) => {
          if (t?.name) map.set(normalizeTemplateKey(t.name), t);
        });
        metaTemplates.forEach((t) => {
          if (t?.name) map.set(normalizeTemplateKey(t.name), t);
        });
        if (!cancelled) setTemplateCatalog(map);
      } catch (_) {
        if (!cancelled) setTemplateCatalog(new Map());
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchMessages = useCallback(async (phone) => {
    if (!phone) return;
    setLoadingMessages(true);
    try {
      const data = await getContactMessages(phone);
      setMessages(data.messages || []);
      const contact = data.contact;
      if (contact) {
        const displayName = resolveContactDisplayName(contact);
        setSelectedContact((prev) =>
          prev && phoneDigits(prev.phone) === phoneDigits(phone)
            ? {
                ...prev,
                contactId: contact.id || prev.contactId,
                id: contact.id || prev.id,
                name: displayName,
                email: contact.email || prev.email,
                status: contact.status || prev.status,
              }
            : prev
        );
        setInboxList((prev) =>
          (prev || []).map((row) =>
            phoneDigits(row.phone) === phoneDigits(phone)
              ? { ...row, name: displayName, contactId: contact.id || row.contactId, email: contact.email || row.email }
              : row
          )
        );
      }
    } catch (e) {
      console.error("History getContactMessages error:", e);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const loadContactProfile = useCallback(async (contact) => {
    if (!contact?.phone) {
      setContactCampaigns([]);
      setContactPayments([]);
      setContactTags([]);
      return;
    }
    setProfileLoading(true);
    try {
      const [campaigns, payments, tags, projectTags] = await Promise.all([
        getContactCampaigns(contact.phone).catch(() => []),
        getContactPayments(contact.phone).catch(() => []),
        fetchContactTags({ contactId: contact.contactId, phone: contact.phone }).catch(() => []),
        fetchTags().catch(() => []),
      ]);
      setContactCampaigns(Array.isArray(campaigns) ? campaigns : []);
      setContactPayments(Array.isArray(payments) ? payments : []);
      setContactTags(Array.isArray(tags) ? tags : []);
      setAllTags(Array.isArray(projectTags) ? projectTags : []);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedContact?.phone) {
      fetchMessages(selectedContact.phone);
      loadContactProfile(selectedContact);
    } else {
      setMessages([]);
      setContactCampaigns([]);
      setContactPayments([]);
      setContactTags([]);
    }
  }, [selectedContact?.phone, selectedContact?.contactId, fetchMessages, loadContactProfile]);

  const selectedContactFromList = useMemo(() => {
    if (!selectedContact?.phone) return null;
    return inboxList.find((c) => phoneDigits(c.phone) === phoneDigits(selectedContact.phone)) || null;
  }, [inboxList, selectedContact?.phone]);

  const displayName = resolveContactDisplayName(selectedContact || selectedContactFromList || {});
  const displayPhone = formatPhoneDisplay(selectedContact?.phone);

  const filteredInboxList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return inboxList;
    return inboxList.filter((item) => {
      const name = resolveContactDisplayName(item).toLowerCase();
      const phone = String(item.phone || "").toLowerCase();
      return name.includes(q) || phone.includes(q) || phoneDigits(phone).includes(phoneDigits(q));
    });
  }, [inboxList, searchQuery]);

  const computedOptedIn = useMemo(() => {
    return !!selectedContactFromList?.whatsappOptInAt;
  }, [selectedContactFromList?.whatsappOptInAt]);

  useEffect(() => {
    setOptedIn(computedOptedIn);
  }, [computedOptedIn]);

  useEffect(() => {
    if (!selectedContact?.phone) return;
    if (loadingMessages) return;
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({ behavior: "auto", block: "end" });
  }, [selectedContact?.phone, loadingMessages, messages.length]);

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const assignedTagIds = useMemo(() => new Set((contactTags || []).map((t) => t.id)), [contactTags]);
  const availableTags = useMemo(
    () => (allTags || []).filter((t) => !assignedTagIds.has(t.id)),
    [allTags, assignedTagIds]
  );

  const handleAssignTag = async (tagId) => {
    if (!selectedContact?.phone || tagBusy) return;
    setTagBusy(true);
    try {
      const result = await assignContactTag({
        contactId: selectedContact.contactId,
        tagId,
        phone: selectedContact.phone,
      });
      if (result?.contactId) {
        setSelectedContact((prev) => (prev ? { ...prev, contactId: result.contactId, id: result.contactId } : prev));
      }
      const tags = await fetchContactTags({
        contactId: result?.contactId || selectedContact.contactId,
        phone: selectedContact.phone,
      });
      setContactTags(tags);
      setTagPickerOpen(false);
    } catch (e) {
      alert(e?.response?.data?.message || e?.message || "Failed to add tag");
    } finally {
      setTagBusy(false);
    }
  };

  const handleRemoveTag = async (tagId) => {
    if (!selectedContact?.phone || tagBusy) return;
    setTagBusy(true);
    try {
      await removeContactTag({
        contactId: selectedContact.contactId,
        tagId,
        phone: selectedContact.phone,
      });
      setContactTags((prev) => (prev || []).filter((t) => t.id !== tagId));
    } catch (e) {
      alert(e?.response?.data?.message || e?.message || "Failed to remove tag");
    } finally {
      setTagBusy(false);
    }
  };

  const handleCreateAndAddTag = async () => {
    if (!selectedContact?.phone || tagBusy) return;
    const name = window.prompt("New tag name");
    if (!name || !String(name).trim()) return;
    setTagBusy(true);
    try {
      const tag = await createTag({ name: String(name).trim(), color: "#0ea5e9" });
      if (!tag?.id) return;
      setAllTags((prev) => [...(prev || []), tag]);
      const result = await assignContactTag({
        contactId: selectedContact.contactId,
        tagId: tag.id,
        phone: selectedContact.phone,
      });
      if (result?.contactId) {
        setSelectedContact((prev) => (prev ? { ...prev, contactId: result.contactId, id: result.contactId } : prev));
      }
      const tags = await fetchContactTags({
        contactId: result?.contactId || selectedContact.contactId,
        phone: selectedContact.phone,
      });
      setContactTags(tags);
      setTagPickerOpen(false);
    } catch (e) {
      alert(e?.response?.data?.message || e?.message || "Failed to create tag");
    } finally {
      setTagBusy(false);
    }
  };

  return (
    <div className="h-screen flex flex-row bg-gray-50 overflow-hidden">
      <AgentSidebar open={sidebarOpen} />

      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <AgentTopbar onMenuClick={() => setSidebarOpen((o) => !o)} />

        <div className="shrink-0 z-10 border-b border-gray-200/80 bg-gradient-to-r from-white/95 via-sky-50/50 to-white/95 backdrop-blur-md px-3 md:px-5 py-2.5 md:py-3 shadow-sm shadow-gray-200/30">
          <div className="flex flex-wrap items-center gap-3 max-w-[2000px] mx-auto">
            <div className="hidden lg:flex items-center gap-2 shrink-0 text-xs font-semibold text-sky-800">
              <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Campaign history
            </div>
            <div className="flex-1 min-w-[180px] max-w-xl mx-auto w-full">
              <div className="relative w-full">
                <input
                  type="text"
                  placeholder="Search name or mobile number"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white/95 border-2 border-gray-200/90 rounded-xl pl-10 pr-12 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400/40 focus:border-sky-500 transition"
                />
                <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg text-sky-600 hover:bg-sky-50 transition"
                  aria-label="Filter"
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
              <div className="px-3 py-2 border-b border-gray-200/80 bg-gradient-to-r from-slate-50/90 to-sky-50/40 flex-shrink-0">
                <p className="text-xs font-bold text-sky-800 uppercase tracking-wide">Conversations</p>
                <p className="text-[11px] text-gray-500">Message history</p>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 bg-white/50">
                {loadingInbox ? (
                  <div className="p-8 flex flex-col items-center justify-center gap-3 text-gray-500 text-sm motion-enter">
                    <div className="h-8 w-8 rounded-full border-2 border-sky-200 border-t-sky-600 animate-spin" />
                    Loading…
                  </div>
                ) : filteredInboxList.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm motion-enter">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    No conversations
                  </div>
                ) : (
                  filteredInboxList.map((item) => {
                    const id = item.contactId || item.phone;
                    const itemName = resolveContactDisplayName(item);
                    const isConvSelected =
                      selectedContact &&
                      (phoneDigits(selectedContact.phone) === phoneDigits(item.phone) ||
                        selectedContact.contactId === item.contactId);
                    return (
                      <button
                        key={id || item.phone}
                        type="button"
                        onClick={() =>
                          setSelectedContact({
                            id: item.contactId || item.phone,
                            contactId: item.contactId,
                            phone: item.phone,
                            name: itemName,
                            email: item.email || null,
                            status: item.status || null,
                            lastMessage: item.lastMessage,
                          })
                        }
                        className={`w-full flex items-center gap-3 p-3 text-left border-b border-gray-100/90 transition-all duration-200 motion-card-rich ${
                          isConvSelected
                            ? "bg-gradient-to-r from-sky-50 to-white border-l-4 border-l-sky-600 shadow-inner"
                            : "hover:bg-sky-50/60"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-100 to-sky-200 text-sky-800 flex items-center justify-center text-sm font-bold flex-shrink-0 ring-2 ring-white shadow-sm">
                          {getInitial(itemName)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-gray-900 truncate text-sm">{itemName}</p>
                          {item.phone ? (
                            <p className="text-xs text-sky-600 font-medium truncate">
                              {formatPhoneDisplay(item.phone)}
                            </p>
                          ) : null}
                          <p className="text-xs text-gray-500 truncate">{item.lastMessage || "—"}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="p-3 text-center text-xs font-medium text-sky-800/80 border-t border-gray-200/80 bg-gradient-to-r from-sky-50/50 to-white/80 flex-shrink-0">
                {filteredInboxList.length} conversation{filteredInboxList.length !== 1 ? "s" : ""}
              </div>
            </div>

            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              <div className="shrink-0 z-10 border-b border-gray-200/80 bg-white/90 backdrop-blur-md px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-gray-900 truncate block">
                    {selectedContact
                      ? `${displayName}${displayPhone ? ` (${displayPhone})` : ""}`
                      : "Select a conversation"}
                  </span>
                  {selectedContact && (
                    <span className="text-xs text-sky-700/80 font-medium">Read-only history</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setProfileSidebarOpen((open) => !open)}
                  className="text-[10px] font-bold text-sky-600 uppercase tracking-wider shrink-0 hidden sm:inline hover:text-sky-800 transition"
                  aria-expanded={profileSidebarOpen}
                >
                  Profile {profileSidebarOpen ? "←" : "→"}
                </button>
              </div>

              <div className="flex-1 flex min-h-0">
                <div className="flex-1 flex flex-col min-w-0 min-h-0 relative bg-[#e5ddd5] border-x border-gray-200/60">
                  <div ref={chatScrollRef} className="flex-1 overflow-y-auto min-h-0 p-4 relative z-10">
                    {!selectedContact ? (
                      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-gray-500 motion-enter px-4">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-sky-200 text-sky-600 shadow-inner ring-2 ring-white">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-gray-600">Select a conversation</p>
                        <p className="text-xs text-gray-400 mt-1 text-center max-w-xs">Choose a contact to view past messages</p>
                      </div>
                    ) : loadingMessages ? (
                      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-gray-500 text-sm gap-3">
                        <div className="h-8 w-8 rounded-full border-2 border-sky-200 border-t-sky-600 animate-spin" />
                        Loading messages…
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full min-h-[200px] text-gray-500 text-sm motion-enter">
                        No messages yet
                      </div>
                    ) : (
                      <InboxMessageThread
                        messages={messages}
                        templateCatalog={templateCatalog}
                        formatMessageTime={formatMessageTime}
                        userName={currentUserName || currentUserEmail}
                        messagesEndRef={messagesEndRef}
                      />
                    )}
                  </div>
                </div>

                {profileSidebarOpen && (
                <div className="w-80 flex flex-col overflow-y-auto flex-shrink-0 min-h-0 bg-white/90 backdrop-blur-sm border-l border-gray-200/80 shadow-sm">
                  <div className="p-4 border-b border-gray-200/80 bg-gradient-to-r from-slate-50/80 to-sky-50/40">
                    <h3 className="font-bold text-gray-900 tracking-tight">Chat Profile</h3>
                    <p className="text-xs text-sky-700/80 mt-0.5">History details</p>
                  </div>
                  {selectedContact ? (
                    <>
                      <div className="p-4 flex flex-col items-center border-b border-gray-100/80">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-sky-400 to-blue-700 text-white flex items-center justify-center text-2xl font-bold mb-3 shadow-lg shadow-sky-500/30 ring-4 ring-sky-100">
                          {getInitial(displayName)}
                        </div>
                        <p className="font-bold text-gray-900 text-center">{displayName}</p>
                        <p className="text-sky-600 font-semibold text-sm mt-1">{displayPhone}</p>
                      </div>
                      <div className="px-4 pb-4 space-y-0 text-sm">
                        {[
                          { label: "Status", value: selectedContact?.status || selectedContactFromList?.status || "—" },
                          { label: "Email", value: selectedContact?.email || selectedContactFromList?.email || "—" },
                          { label: "Last message", value: selectedContactFromList?.lastMessage || "—" },
                          { label: "Last message time", value: formatDateTime(selectedContactFromList?.lastMessageTime) },
                          { label: "Unread", value: String(selectedContactFromList?.unreadCount ?? "—") },
                          { label: "First message", value: messages.length ? (messages[0]?.content || messages[0]?.message || "—") : "—" },
                          {
                            label: "First message time",
                            value: messages.length
                              ? formatDateTime(messages[0]?.sentAt || messages[0]?.createdAt || messages[0]?.timestamp)
                              : "—",
                          },
                          {
                            label: "Last active",
                            value: messages.length
                              ? formatDateTime(
                                  messages[messages.length - 1]?.sentAt ||
                                    messages[messages.length - 1]?.createdAt ||
                                    messages[messages.length - 1]?.timestamp
                                )
                              : formatDateTime(selectedContactFromList?.lastMessageTime),
                          },
                        ].map((row, i) => (
                          <div key={i} className="flex justify-between py-2.5 border-b border-gray-100/90 gap-3">
                            <span className="text-gray-500 text-xs font-medium shrink-0">{row.label}</span>
                            <span className="text-gray-900 font-semibold text-xs text-right min-w-0 truncate">{row.value}</span>
                          </div>
                        ))}
                        <div className="flex justify-between items-center py-2.5 border-b border-gray-100/90">
                          <span className="text-gray-500 text-xs font-medium">Opted In</span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={optedIn}
                            onClick={() => setOptedIn(!optedIn)}
                            className={`relative w-11 h-6 rounded-full transition-colors shadow-inner ${
                              optedIn ? "bg-gradient-to-r from-sky-500 to-blue-600" : "bg-gray-300"
                            }`}
                          >
                            <span
                              className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
                                optedIn ? "left-6" : "left-1"
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Payments */}
                      <div className="border-t border-gray-200/80">
                        <button
                          type="button"
                          onClick={() => toggleSection("payments")}
                          className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-bold text-gray-800 hover:bg-sky-50/50 transition"
                        >
                          Payments
                          <svg className={`w-5 h-5 text-sky-600 transition-transform duration-200 ${openSections.payments ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {openSections.payments && (
                          <div className="px-4 pb-3 motion-enter">
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
                                  <div key={p.id || idx} className="grid grid-cols-3 gap-2 border-t border-gray-100 px-3 py-2 text-xs text-gray-800">
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

                      {/* Campaigns */}
                      <div className="border-t border-gray-200/80">
                        <button
                          type="button"
                          onClick={() => toggleSection("campaigns")}
                          className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-bold text-gray-800 hover:bg-sky-50/50 transition"
                        >
                          Campaigns
                          <svg className={`w-5 h-5 text-sky-600 transition-transform duration-200 ${openSections.campaigns ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {openSections.campaigns && (
                          <div className="px-4 pb-3 space-y-2 motion-enter">
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

                      {/* Attributes */}
                      <div className="border-t border-gray-200/80">
                        <button
                          type="button"
                          onClick={() => toggleSection("attributes")}
                          className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-bold text-gray-800 hover:bg-sky-50/50 transition"
                        >
                          Attributes
                          <svg className={`w-5 h-5 text-sky-600 transition-transform duration-200 ${openSections.attributes ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {openSections.attributes && (
                          <div className="px-4 pb-3 text-sm text-gray-500 motion-enter">No attributes data.</div>
                        )}
                      </div>

                      {/* Tags */}
                      <div className="border-t border-gray-200/80">
                        <button
                          type="button"
                          onClick={() => toggleSection("tags")}
                          className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-bold text-gray-800 hover:bg-sky-50/50 transition"
                        >
                          Tags
                          <svg className={`w-5 h-5 text-sky-600 transition-transform duration-200 ${openSections.tags ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {openSections.tags && (
                          <div className="px-4 pb-4 space-y-3 motion-enter">
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
                                    onClick={() => handleRemoveTag(tag.id)}
                                    className="ml-0.5 text-current/70 hover:text-current"
                                    aria-label={`Remove ${tag.name}`}
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
                                    {availableTags.length === 0 ? (
                                      <p className="px-3 py-2 text-xs text-gray-400">No more tags</p>
                                    ) : (
                                      availableTags.map((tag) => (
                                        <button
                                          key={tag.id}
                                          type="button"
                                          onClick={() => handleAssignTag(tag.id)}
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
                                onClick={() => availableTags[0] && handleAssignTag(availableTags[0].id)}
                                disabled={tagBusy || availableTags.length === 0}
                                className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-40"
                              >
                                + Add
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={handleCreateAndAddTag}
                              disabled={tagBusy}
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
                      <p>Select a conversation</p>
                    </div>
                  )}
                </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HistoryPage;
