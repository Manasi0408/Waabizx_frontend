const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5000";
const API_URL = `${API_BASE.replace(/\/$/, "")}/api`;

const USER_STORAGE_KEY = 'user';

/** Cached user from login / profile (used for header avatar when in-memory `user` is stale). */
export const readSessionUser = () => {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const persistSessionUser = (user) => {
  if (!user || typeof user !== 'object') return;
  try {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch (_) {
    /* quota or private mode */
  }
};

// Get token from localStorage
const getToken = () => {
  return localStorage.getItem('token');
};

// Set token in localStorage
const setToken = (token) => {
  localStorage.setItem('token', token);
};

// Remove token from localStorage
const removeToken = () => {
  localStorage.removeItem('token');
};

// Register user
export const register = async (name, email, password, mobileNumber) => {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (API_BASE && API_BASE.includes('ngrok')) {
      headers['ngrok-skip-browser-warning'] = 'true';
    }
    const response = await fetch(`${API_URL}/auth/register/request-otp`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name, email, password, mobileNumber }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Registration failed');
    }

    if (data.success) {
      return data;
    }

    throw new Error(data.message || 'Registration failed');
  } catch (error) {
    throw error;
  }
};

export const verifyRegisterOtp = async (email, otp) => {
  const headers = { 'Content-Type': 'application/json' };
  if (API_BASE && API_BASE.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }
  const response = await fetch(`${API_URL}/auth/register/verify-otp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, otp }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'OTP verification failed');
  }
  return data;
};

export const resendRegisterOtp = async (email) => {
  const headers = { 'Content-Type': 'application/json' };
  if (API_BASE && API_BASE.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }
  const response = await fetch(`${API_URL}/auth/register/resend-otp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Resend OTP failed');
  }
  return data;
};

// Request password reset OTP (sent to email)
export const requestPasswordReset = async (email) => {
  const headers = { 'Content-Type': 'application/json' };
  if (API_BASE && API_BASE.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }
  const response = await fetch(`${API_URL}/auth/forgot-password/request`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Password reset request failed');
  }

  return data;
};

// Reset password using OTP
export const resetPassword = async (email, otp, newPassword) => {
  const headers = { 'Content-Type': 'application/json' };
  if (API_BASE && API_BASE.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }
  const response = await fetch(`${API_URL}/auth/forgot-password/reset`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, otp, newPassword }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Password reset failed');
  }

  return data;
};

/** Logged-in settings: request OTP (same flow as forgot password). */
export const requestChangePassword = async () => {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
  if (API_BASE && API_BASE.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }
  const response = await fetch(`${API_URL}/auth/change-password/request`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Password change request failed');
  }
  return data;
};

/** Logged-in settings: reset password with OTP. */
export const changePasswordWithOtp = async (otp, newPassword) => {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
  if (API_BASE && API_BASE.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }
  const response = await fetch(`${API_URL}/auth/change-password/reset`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ otp, newPassword }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Password change failed');
  }
  return data;
};

// Login user
export const login = async (email, password) => {
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (API_BASE && API_BASE.includes('ngrok')) {
      headers['ngrok-skip-browser-warning'] = 'true';
    }
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Login failed');
    }

    if (data.success && data.token) {
      setToken(data.token);
      console.log('Access Token:', data.token);
      return data;
    }

    throw new Error(data.message || 'Login failed');
  } catch (error) {
    throw error;
  }
};

// Logout user
export const logout = () => {
  removeToken();
  try {
    localStorage.removeItem('role');
    localStorage.removeItem('user');
  } catch (e) {}
};

// Check if user is authenticated
export const isAuthenticated = () => {
  return !!getToken();
};

// Get user profile
export const getProfile = async () => {
  try {
    const token = getToken();
    if (!token) {
      throw new Error('No token found');
    }

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };
    if (API_BASE && API_BASE.includes('ngrok')) {
      headers['ngrok-skip-browser-warning'] = 'true';
    }
    const response = await fetch(`${API_URL}/auth/profile`, {
      method: 'GET',
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to fetch profile');
    }

    if (data.success && data.user) {
      persistSessionUser(data.user);
      return data.user;
    }

    throw new Error(data.message || 'Failed to fetch profile');
  } catch (error) {
    throw error;
  }
};

export const updateProfile = async (payload) => {
  const token = getToken();
  if (!token) {
    throw new Error('No token found');
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };
  if (API_BASE && API_BASE.includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }

  const response = await fetch(`${API_URL}/auth/profile`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload || {}),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || 'Failed to update profile');
  }

  if (data.success && data.user) {
    persistSessionUser(data.user);
    return data;
  }

  throw new Error(data.message || 'Failed to update profile');
};

// Get stored token
export { getToken, setToken, removeToken };

