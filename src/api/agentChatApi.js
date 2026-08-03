// const BASE_URL = "https://wabizx.techwhizzc.com/api/agent/chat";
const BASE_URL = "https://api.waabizx.com/api/agent/chat";

export const getActiveChats = async () => {
  const res = await fetch(`${BASE_URL}/active`);
  return res.json();
};

export const getRequestingChats = async () => {
  const res = await fetch(`${BASE_URL}/requesting`);
  return res.json();
};

export const getIntervenedChats = async () => {
  const res = await fetch(`${BASE_URL}/intervened`);
  return res.json();
};

export const getMessages = async (conversationId) => {
  const res = await fetch(`${BASE_URL}/messages/${conversationId}`);
  return res.json();
};

export const sendMessage = async (data) => {
  const res = await fetch(`${BASE_URL}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });
  return res.json();
};

