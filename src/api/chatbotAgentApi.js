import axios from './axios';

export async function requestChatbotHandoff() {
  const response = await axios.post('/chatbot-agent/handoff/request');
  return response.data;
}

export async function fetchMyHandoffSession() {
  const response = await axios.get('/chatbot-agent/handoff/mine');
  return response.data;
}

export async function sendCustomerHandoffMessage(message) {
  const response = await axios.post('/chatbot-agent/handoff/mine/messages', { message });
  return response.data;
}

export async function listAgentSessions(status) {
  const response = await axios.get('/chatbot-agent/sessions', {
    params: { status },
  });
  return response.data;
}

export async function acceptAgentSession(sessionId) {
  const response = await axios.post(`/chatbot-agent/sessions/${sessionId}/accept`);
  return response.data;
}

export async function fetchSessionMessages(sessionId) {
  const response = await axios.get(`/chatbot-agent/sessions/${sessionId}/messages`);
  return response.data;
}

export async function sendAgentSessionMessage(sessionId, message) {
  const response = await axios.post(`/chatbot-agent/sessions/${sessionId}/messages`, {
    message,
  });
  return response.data;
}

export async function closeAgentSession(sessionId) {
  const response = await axios.post(`/chatbot-agent/sessions/${sessionId}/close`);
  return response.data;
}
