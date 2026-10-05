import axios from '../api/axios';
import { resolveActiveProjectId } from '../utils/activeProject';

function projectHeaders() {
  const projectId = resolveActiveProjectId();
  return projectId ? { 'x-project-id': String(projectId) } : {};
}

export async function requestManualAgent() {
  const res = await axios.post(
    '/chatbot-live/request',
    { projectId: resolveActiveProjectId() },
    { headers: projectHeaders() }
  );
  return res.data;
}

export async function fetchMyLiveSession() {
  const res = await axios.get('/chatbot-live/my-session', {
    params: { projectId: resolveActiveProjectId() },
    headers: projectHeaders(),
  });
  return res.data;
}

export async function sendCustomerLiveMessage(sessionId, message) {
  const res = await axios.post(
    `/chatbot-live/sessions/${sessionId}/customer-message`,
    { message },
    { headers: projectHeaders() }
  );
  return res.data;
}

export async function endCustomerLiveSession(sessionId) {
  const res = await axios.post(`/chatbot-live/sessions/${sessionId}/end`, {}, { headers: projectHeaders() });
  return res.data;
}

export async function fetchAgentQueue(status = 'requesting') {
  const res = await axios.get('/chatbot-live/agent/queue', { params: { status } });
  return res.data;
}

export async function acceptLiveSession(sessionId) {
  const res = await axios.post(`/chatbot-live/agent/sessions/${sessionId}/accept`);
  return res.data;
}

export async function sendAgentLiveMessage(sessionId, message) {
  const res = await axios.post(`/chatbot-live/agent/sessions/${sessionId}/message`, { message });
  return res.data;
}

export async function closeLiveSessionAsAgent(sessionId) {
  const res = await axios.post(`/chatbot-live/agent/sessions/${sessionId}/close`);
  return res.data;
}

export async function fetchLiveSessionMessages(sessionId) {
  const res = await axios.get(`/chatbot-live/sessions/${sessionId}/messages`);
  return res.data;
}

export async function fetchLiveSessionHistory(sessionId) {
  const res = await axios.get(`/chatbot-live/sessions/${sessionId}/history`);
  return res.data;
}
