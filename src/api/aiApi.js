import axios from './axios';

export async function sendAIMessage(message) {
  const response = await axios.post('/ai/chat', {
    message,
  });
  return response.data;
}
