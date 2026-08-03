import React, { useEffect, useState, useCallback } from "react";
import {
  getAgentRequesting,
  getMessages,
  acceptChat,
  interveneChat,
  closeChat,
  sendMessage as sendChatMessage,
} from "../api/chatApi";
import { initializeSocket, onSocketEvent, offSocketEvent } from "../services/socketService";
import ResolveDispositionModal from "../components/ResolveDispositionModal";

const AgentChatPage = () => {
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [agentId, setAgentId] = useState(null);
  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);
  const [resolveDispositionOpen, setResolveDispositionOpen] = useState(false);
  const [selectedDisposition, setSelectedDisposition] = useState(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    let userId = null;
    try {
      const rawUser = localStorage.getItem("user");
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        userId = parsed?.id ?? parsed?._id ?? null;
      }
    } catch (e) {}
    setAgentId(userId);
  }, []);

  const loadChats = useCallback(async () => {
    if (!agentId) return;
    try {
      const data = await getAgentRequesting(agentId);
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
      setChats(list);
    } catch (err) {
      console.error("AgentChatPage loadChats error:", err);
      setChats([]);
    }
  }, [agentId]);

  useEffect(() => {
    if (agentId) {
      loadChats();
      const token = localStorage.getItem("token");
      initializeSocket(agentId, token);
    }
  }, [agentId, loadChats]);

  useEffect(() => {
    const handler = () => {
      if (agentId) loadChats();
    };
    onSocketEvent("new-message", handler);
    return () => offSocketEvent("new-message", handler);
  }, [agentId, loadChats]);

  // Poll: refresh requesting list and messages so new messages appear
  useEffect(() => {
    if (!agentId) return;
    const POLL_MS = 5000;
    const refresh = async () => {
      try {
        const data = await getAgentRequesting(agentId);
        const list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
        setChats(list);
      } catch (_) {}
    };
    const refreshMsgs = async () => {
      if (!selectedChat) return;
      try {
        const data = await getMessages(selectedChat.id);
        const list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
        setMessages(list);
      } catch (_) {}
    };
    const tick = () => {
      refresh();
      refreshMsgs();
    };
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [selectedChat, agentId]);

  const loadMessages = useCallback(async (conversationId) => {
    if (!conversationId) return;
    setLoadingMessages(true);
    try {
      const data = await getMessages(conversationId);
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
      setMessages(list);
    } catch (err) {
      console.error("AgentChatPage loadMessages error:", err);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (selectedChat) {
      loadMessages(selectedChat.id);
    } else {
      setMessages([]);
    }
  }, [selectedChat, loadMessages]);

  const handleAccept = async (id) => {
    await acceptChat(id);
    loadChats();
  };

  const handleIntervene = async (id) => {
    await interveneChat(id);
    setSelectedChat((prev) => (prev && prev.id === id ? { ...prev, status: "intervened" } : prev));
    loadChats();
  };

  const handleClose = () => {
    if (!selectedChat?.id || resolving) return;
    setSelectedDisposition(null);
    setResolveDispositionOpen(true);
  };

  const confirmClose = async () => {
    if (!selectedChat?.id || resolving || !selectedDisposition) return;
    setResolving(true);
    try {
      await closeChat(selectedChat.id, selectedDisposition);
      setResolveDispositionOpen(false);
      setSelectedDisposition(null);
      setSelectedChat(null);
      setMessageText("");
      loadChats();
    } catch (err) {
      alert(err?.message || "Failed to resolve chat");
    } finally {
      setResolving(false);
    }
  };

  const isIntervened = selectedChat && String(selectedChat.status || "").toLowerCase() === "intervened";

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!selectedChat?.id || !messageText.trim() || sending) return;
    setSending(true);
    try {
      await sendChatMessage(selectedChat.id, messageText.trim());
      setMessageText("");
      const data = await getMessages(selectedChat.id);
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
      setMessages(list);
    } catch (err) {
      console.error("Send message error:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      
      {/* Chat List */}
      <div style={{ width: "30%", borderRight: "1px solid #ccc", padding: 10 }}>
        <h3>Requesting Chats</h3>

        {chats.length === 0 ? (
          <p>No requesting chats.</p>
        ) : (
          (chats || []).map((chat) => (
          <div
            key={chat.id}
            style={{
              border: "1px solid gray",
              padding: 10,
              marginBottom: 10,
              cursor: "pointer",
            }}
            onClick={() => setSelectedChat(chat)}
          >
            <p><b>{chat.phone}</b></p>
            <p>Status: {chat.status}</p>

            <button onClick={() => handleAccept(chat.id)}>Accept</button>

            <button onClick={() => handleIntervene(chat.id)}>
              Intervene
            </button>
          </div>
          ))
        )}
      </div>

      {/* Chat Window */}
      <div style={{ width: "70%", padding: 20 }}>
        {selectedChat ? (
          <>
            <h3>Chat with {selectedChat.phone}</h3>

            <div
              style={{
                height: 300,
                border: "1px solid #ccc",
                marginBottom: 10,
                padding: 10,
                overflowY: "auto",
              }}
            >
              {loadingMessages ? (
                <p>Loading messages...</p>
              ) : (messages || []).length === 0 ? (
                <p style={{ color: "#666" }}>No messages yet.</p>
              ) : (
                (messages || []).map((msg, i) => (
                  <div
                    key={msg.id || i}
                    style={{
                      textAlign: msg.sender === "agent" ? "right" : "left",
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        padding: "6px 12px",
                        borderRadius: 8,
                        maxWidth: "80%",
                        backgroundColor: msg.sender === "agent" ? "#0d9488" : "#e5e7eb",
                        color: msg.sender === "agent" ? "#fff" : "#111",
                      }}
                    >
                      {msg.message}
                    </span>
                    {msg.created_at && (
                      <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
                        {new Date(msg.created_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* In-chat Intervene bar when there is a customer message and not yet intervened */}
            {selectedChat && !isIntervened && (messages || []).some((m) => m.sender === "customer") && (
              <div style={{ padding: "12px 16px", background: "#fffbeb", borderTop: "1px solid #fcd34d", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14, color: "#92400e" }}>New customer message — take over the conversation</span>
                <button
                  type="button"
                  onClick={() => selectedChat && handleIntervene(selectedChat.id)}
                  style={{ padding: "8px 16px", borderRadius: 8, background: "#0d9488", color: "#fff", fontWeight: 500, fontSize: 14, border: "none", cursor: "pointer" }}
                >
                  Intervene
                </button>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {isIntervened ? (
                <>
                  <form onSubmit={handleSendMessage} style={{ display: "flex", gap: 8, flex: "1", minWidth: 200, maxWidth: 400 }}>
                    <input
                      type="text"
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      placeholder="Type a message..."
                      style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #ccc" }}
                      disabled={sending}
                    />
                    <button type="submit" disabled={!messageText.trim() || sending}>
                      {sending ? "Sending..." : "Send"}
                    </button>
                  </form>
                  <button onClick={handleClose} disabled={resolving}>
                    {resolving ? "Resolving…" : "Close Chat"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => selectedChat && handleIntervene(selectedChat.id)}
                  >
                    Intervene
                  </button>
                  <button onClick={handleClose} disabled={resolving}>
                    {resolving ? "Resolving…" : "Close Chat"}
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <h3>Select a chat</h3>
        )}
      </div>

      <ResolveDispositionModal
        open={resolveDispositionOpen}
        selected={selectedDisposition}
        onSelect={setSelectedDisposition}
        onConfirm={confirmClose}
        confirming={resolving}
        onCancel={() => {
          if (resolving) return;
          setResolveDispositionOpen(false);
          setSelectedDisposition(null);
        }}
      />
    </div>
  );
};

export default AgentChatPage;