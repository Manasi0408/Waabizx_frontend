import { getApiUrl, getApiOrigin } from '../utils/apiBase';
// const API = "https://wabizx.techwhizzc.com/api/chat";
// const API_BASE = "https://wabizx.techwhizzc.com/api";
const API = `${getApiUrl()}/chat`;
const API_BASE = getApiUrl();

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  try {
    const raw = localStorage.getItem("selectedProject");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id != null) headers["x-project-id"] = String(parsed.id);
    }
  } catch (_) {}
  return headers;
};

export const getActiveChats = async () => {
  const res = await fetch(`${API}/active`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
};

export const getRequestingChats = async () => {
  const res = await fetch(`${API}/requesting`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
};

/** Open Requesting queue (unassigned) — for agent pickup + manager assign */
export const getUnassignedRequestingChats = async () => {
  const res = await fetch(`${API}/unassigned-requesting`, {
    headers: getAuthHeaders(),
  });
  return res.json();
};

// Manager Inbox: all requesting conversations (for assign flow)
export const getManagerRequesting = async () => {
  const res = await fetch(`${API_BASE}/manager/requesting`, {
    headers: getAuthHeaders(),
  });
  return res.json();
};

// Agent Requesting Tab: conversations assigned to this agent, status=requesting
export const getAgentRequesting = async (agentId) => {
  const res = await fetch(
    `${API_BASE}/agent/requesting?agentId=${encodeURIComponent(agentId)}`,
    { headers: getAuthHeaders() }
  );
  return res.json();
};

export const getIntervenedChats = async () => {
  const res = await fetch(`${API}/intervened`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
};

export const getHistoryChats = async () => {
  const res = await fetch(`${API}/history`, {
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
};

export const getMessages = async (conversationId) => {
  const res = await fetch(`${API}/messages/${conversationId}`, {
    headers: getAuthHeaders(),
  });
  return res.json();
};

export const acceptChat = async (id) => {
  const res = await fetch(`${API}/accept/${id}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || data?.message || "Failed to accept chat");
  }
  return data;
};

export const interveneChat = async (id) => {
  const res = await fetch(`${API}/intervene/${id}`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
    },
  });
  return res.json();
};

export const sendMessage = async (conversation_id, message) => {
  const res = await fetch(`${API}/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      conversation_id,
      message,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error || data?.message || "Failed to send message");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
};

export const closeChat = async (id, disposition) => {
  const dispositionValue = String(disposition || "").trim();
  if (!dispositionValue) {
    throw new Error("Disposition is required to resolve the chat");
  }
  const res = await fetch(`${API}/close/${id}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ disposition: dispositionValue }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || data?.message || "Failed to close chat");
  }
  return data;
};

// Manager/Admin: intervene by phone (for /inbox)
export const interveneByPhone = async (phone, agentId = null) => {
  const res = await fetch(`${API_BASE}/chat/intervene-by-phone`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ phone, agentId }),
  });
  return res.json();
};

// Manager: assign conversation to an agent (appears in Agent Requesting tab)
export const assignChatToAgent = async (conversationId, agentId) => {
  const res = await fetch(`${API_BASE}/assign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      conversationId,
      agentId,
    }),
  });

  return res.json();
};

// Agent takeover / transfer — mounted at /api/chat/assign-agent
export const assignAgentTakeover = async (conversationId, agentId) => {
  const res = await fetch(`${API}/assign-agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      conversationId,
      agentId,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      success: false,
      message: data?.message || data?.error || "Failed to transfer chat",
      ...data,
    };
  }
  return data;
};
