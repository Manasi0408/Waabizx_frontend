import { getApiUrl, getApiOrigin } from '../utils/apiBase';
// const API_URL = 'https://wabizx.techwhizzc.com/api';
const API_URL = getApiUrl();

const getToken = () => {
  return localStorage.getItem('token');
};

// Upload media file
export const uploadMedia = async (contactId, file, mediaType) => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const formData = new FormData();
    formData.append('media', file);
    formData.append('contactId', contactId);
    if (mediaType) formData.append('mediaType', mediaType);

    const response = await fetch(`${API_URL}/media/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to upload media');
    return data;
  } catch (error) {
    throw error;
  }
};

// Send media message
export const sendMediaMessage = async (contactId, mediaData, caption = '') => {
  try {
    const token = getToken();
    if (!token) throw new Error('No token found');

    const response = await fetch(`${API_URL}/media/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        contactId,
        mediaUrl: mediaData.url,
        mediaType: mediaData.mediaType,
        mediaFilename: mediaData.filename,
        mediaSize: mediaData.size,
        mediaMimeType: mediaData.mimeType,
        caption
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to send media message');
    return data;
  } catch (error) {
    throw error;
  }
};

