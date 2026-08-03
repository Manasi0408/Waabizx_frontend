// const API_URL = 'https://wabizx.techwhizzc.com/api';
const API_URL = 'https://api.waabizx.com/api';

// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

// Get notifications
export const getNotifications = async () => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    const response = await fetch(`${API_URL}/notifications?t=${timestamp}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Cache-Control': 'no-cache'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to fetch notifications');
    }

    if (data.success) {
      return data.data || [];
    }

    throw new Error(data.message || 'Failed to fetch notifications');
  } catch (error) {
    throw error;
  }
};

// Mark notification as read
export const markAsRead = async (notificationId) => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to mark notification as read');
    }

    return data.success;
  } catch (error) {
    throw error;
  }
};

// Mark all notifications as read
export const markAllAsRead = async () => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const response = await fetch(`${API_URL}/notifications/read-all`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || data.message || 'Failed to mark all notifications as read');
    }

    return data.success;
  } catch (error) {
    throw error;
  }
};

