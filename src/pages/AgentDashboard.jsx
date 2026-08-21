import React, { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import axios from "axios";
import { getToken } from "../services/authService";
import { getApiOrigin } from "../utils/apiBase";

const API_URL = getApiOrigin();

export default function AgentDashboard() {
  const location = useLocation();
  const [messages, setMessages] = useState([]);

  // When navigated from Manage with an agent selected, persist so Live Chat / History show that agent
  useEffect(() => {
    const agent = location?.state?.agent;
    if (agent && (agent.id || agent.name || agent.email)) {
      try {
        localStorage.setItem("selectedAgent", JSON.stringify(agent));
      } catch (e) {}
    }
  }, [location?.state?.agent]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const user = (() => {
    try {
      const raw = localStorage.getItem("user");
      const u = raw ? JSON.parse(raw) : null;
      console.log("AGENT DASHBOARD USER:", u);
      return u;
    } catch (e) {
      return null;
    }
  })();

  const loadMessages = useCallback(async () => {
    if (!user?.id) {
      setError("Not logged in");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = getToken();
      const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      if (API_URL && API_URL.includes("ngrok")) {
        headers["ngrok-skip-browser-warning"] = "true";
      }
      const res = await axios.get(
        `${API_URL}/api/agent/messages?agentId=${user.id}`,
        { headers }
      );
      setMessages(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Failed to load messages");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  return (
    <div style={{ padding: 24 }}>
      <h2>Agent Dashboard</h2>
      {error && (
        <p style={{ color: "red" }}>
          {error}
          <a href="/login" style={{ marginLeft: 8 }}>Sign in again</a>
        </p>
      )}
      {loading ? (
        <p>Loading...</p>
      ) : messages.length === 0 ? (
        <p>No messages assigned to you.</p>
      ) : (
        messages.map((msg) => (
          <div key={msg.id} style={{ marginBottom: 8, padding: 8, border: "1px solid #eee" }}>
            <b>{msg.phone}</b> : {msg.message}
          </div>
        ))
      )}
    </div>
  );
}
