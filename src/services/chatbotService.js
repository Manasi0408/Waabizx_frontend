import { getApiUrl, getApiOrigin } from '../utils/apiBase';
// const API_URL = 'https://wabizx.techwhizzc.com/api';
const API_URL = getApiUrl();

// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

// Send message to chatbot
export const sendChatbotMessage = async (message, interactionCount = 0, flowState = null) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/chatbot/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ message, interactionCount, flowState })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to send message');
    }

    if (data.success) {
      return {
        message: data.message || data.response || "I'm here to help!",
        suggestions: data.suggestions || [],
        buttons: data.buttons || [],
        flowState: data.flowState || flowState,
        isValid: data.isValid
      };
    }

    throw new Error(data.message || 'Failed to get response');
  } catch (error) {
    console.error('Error in sendChatbotMessage:', error);
    throw error;
  }
};

// Lock chatbot and route to inbox
export const lockChatbot = async () => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/chatbot/lock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to lock chatbot');
    }

    return data;
  } catch (error) {
    console.error('Error in lockChatbot:', error);
    throw error;
  }
};

