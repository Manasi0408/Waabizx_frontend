import React, { useEffect, useState, useCallback } from "react";
import { getToken } from "../services/authService";
import { getManagerRequesting, assignChatToAgent } from "../api/chatApi";
import { initializeSocket, onSocketEvent, offSocketEvent } from "../services/socketService";
import { getApiOrigin } from "../utils/apiBase";

const API_URL = getApiOrigin();

export default function AdminDashboard() {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadChats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getManagerRequesting();
      const list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
      setChats(list);
    } catch (err) {
      setError(err.message || "Failed to load requesting chats");
      setChats([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadChats();
    const token = getToken();
    const userId = (() => {
      try {
        const raw = localStorage.getItem("user");
        const u = raw ? JSON.parse(raw) : null;
        return u?.id ?? u?._id;
      } catch (e) {
        return null;
      }
    })();
    initializeSocket(userId, token);
  }, [loadChats]);

  useEffect(() => {
    const handler = () => loadChats();
    onSocketEvent("new-message", handler);
    return () => offSocketEvent("new-message", handler);
  }, [loadChats]);

  const handleAssign = async (conversationId) => {
    const input = window.prompt("Enter Agent ID to assign this chat to:", "");
    if (!input) return;
    const agentId = Number(input);
    if (!agentId || Number.isNaN(agentId)) {
      alert("Please enter a valid numeric Agent ID.");
      return;
    }
    try {
      const result = await assignChatToAgent(conversationId, agentId);
      if (result && result.success !== false) {
        await loadChats();
      } else {
        setError(result?.message || result?.error || "Failed to assign");
      }
    } catch (err) {
      setError(err.message || "Failed to assign");
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <h2>Admin Dashboard (Requesting – assign to agent)</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}
      {loading ? (
        <p>Loading...</p>
      ) : chats.length === 0 ? (
        <p>No requesting chats.</p>
      ) : (
        chats.map((chat) => (
          <div
            key={chat.id}
            style={{
              marginBottom: 12,
              padding: 12,
              border: "1px solid #ccc",
              borderRadius: 8,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div>
              <p style={{ margin: 0, fontWeight: 600 }}>{chat.phone}</p>
              <p style={{ margin: "4px 0", color: "#555", fontSize: 14 }}>{chat.last_message}</p>
            </div>
            <button
              type="button"
              onClick={() => handleAssign(chat.id)}
              style={{
                padding: "8px 16px",
                background: "#0d9488",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Assign to Agent
            </button>
          </div>
        ))
      )}
    </div>
  );
}
