import { getApiRoot, getApiUrl } from "../utils/apiBase";

const USER_STORAGE_KEY = 'user';

function apiBase() {
  return getApiRoot();
}

function apiUrl() {
  return getApiUrl();
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return { success: false, message: 'Empty server response' };
  }
  try {
    return JSON.parse(text);
  } catch (_) {
    const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (response.status === 405 || snippet.includes('405 Not Allowed')) {
      throw new Error(
        'Login POST never reached Node.js. Your web server (nginx/ALB/S3/CloudFront) must forward /api/* to the Express app (server.js). See backend/deploy/aws-nginx.conf.example'
      );
    }
    throw new Error(
      snippet.startsWith('<')
        ? 'Server returned HTML instead of JSON. Check that the API is reachable at https://api.waabizx.com/api'
        : `Invalid server response: ${snippet}`
    );
  }
}

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

const getToken = () => localStorage.getItem('token');
const setToken = (token) => localStorage.setItem('token', token);
const removeToken = () => localStorage.removeItem('token');

/** Marks a fresh login/register so transient 401s right after auth are ignored. */
export const markAuthSessionIssued = () => {
  try {
    sessionStorage.setItem('authIssuedAt', String(Date.now()));
  } catch (_) {
    /* ignore */
  }
};

/** Persist token + user after login or OTP verify. */
export const completeAuthSession = ({ token, user, role }) => {
  if (token) setToken(token);
  if (user && typeof user === 'object') {
    persistSessionUser(user);
  }
  if (role) {
    try {
      localStorage.setItem(
        'role',
        String(role).toLowerCase().trim().replace(/-/g, '_').replace(/\s+/g, '_')
      );
    } catch (_) {
      /* ignore */
    }
  }
  markAuthSessionIssued();
};

export const register = async (name, email, password, mobileNumber, country, countryCode) => {
  const headers = { 'Content-Type': 'application/json' };
  if (apiBase().includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
  const response = await fetch(`${apiUrl()}/auth/register/request-otp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name, email, password, mobileNumber, country, countryCode }),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) throw new Error(data.message || 'Registration failed');
  if (data.success) return data;
  throw new Error(data.message || 'Registration failed');
};

export const verifyRegisterOtp = async (email, otp) => {
  const headers = { 'Content-Type': 'application/json' };
  if (apiBase().includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
  const response = await fetch(`${apiUrl()}/auth/register/verify-otp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, otp }),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) throw new Error(data.message || 'OTP verification failed');
  if (data.success && data.token) {
    completeAuthSession({
      token: data.token,
      user: data.user,
      role: data.user?.role || 'admin',
    });
  }
  return data;
};

export const resendRegisterOtp = async (email) => {
  const headers = { 'Content-Type': 'application/json' };
  if (apiBase().includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
  const response = await fetch(`${apiUrl()}/auth/register/resend-otp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email }),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) throw new Error(data.message || 'Resend OTP failed');
  return data;
};

export const requestPasswordReset = async (email) => {
  const headers = { 'Content-Type': 'application/json' };
  if (apiBase().includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
  const response = await fetch(`${apiUrl()}/auth/forgot-password/request`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email }),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) throw new Error(data.message || 'Password reset request failed');
  return data;
};

export const resetPassword = async (email, otp, newPassword) => {
  const headers = { 'Content-Type': 'application/json' };
  if (apiBase().includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
  const response = await fetch(`${apiUrl()}/auth/forgot-password/reset`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, otp, newPassword }),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) throw new Error(data.message || 'Password reset failed');
  return data;
};

export const requestChangePassword = async () => {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
  if (apiBase().includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
  const response = await fetch(`${apiUrl()}/auth/change-password/request`, {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) throw new Error(data.message || 'Password change request failed');
  return data;
};

export const changePasswordWithOtp = async (otp, newPassword) => {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getToken()}`,
  };
  if (apiBase().includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
  const response = await fetch(`${apiUrl()}/auth/change-password/reset`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ otp, newPassword }),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) throw new Error(data.message || 'Password change failed');
  return data;
};

export const login = async (email, password) => {
  const headers = { 'Content-Type': 'application/json' };
  if (apiBase().includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
  const response = await fetch(`${apiUrl()}/auth/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password }),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) throw new Error(data.message || 'Login failed');
  if (data.success && data.token) {
    setToken(data.token);
    markAuthSessionIssued();
    return data;
  }
  throw new Error(data.message || 'Login failed');
};

export const logout = () => {
  removeToken();
  try {
    localStorage.removeItem('role');
    localStorage.removeItem('user');
  } catch (_) {
    /* ignore */
  }
};

export const isAuthenticated = () => Boolean(getToken());

export const getProfile = async () => {
  const token = getToken();
  if (!token) throw new Error('No token found');
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (apiBase().includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
  const response = await fetch(`${apiUrl()}/auth/profile`, { method: 'GET', headers });
  const data = await parseJsonResponse(response);
  if (!response.ok) throw new Error(data.message || 'Failed to fetch profile');
  if (data.success && data.user) {
    persistSessionUser(data.user);
    return data.user;
  }
  throw new Error(data.message || 'Failed to fetch profile');
};

export const updateProfile = async (payload) => {
  const token = getToken();
  if (!token) throw new Error('No token found');
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (apiBase().includes('ngrok')) headers['ngrok-skip-browser-warning'] = 'true';
  const response = await fetch(`${apiUrl()}/auth/profile`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload || {}),
  });
  const data = await parseJsonResponse(response);
  if (!response.ok) throw new Error(data.message || 'Failed to update profile');
  if (data.success && data.user) {
    persistSessionUser(data.user);
    return data;
  }
  throw new Error(data.message || 'Failed to update profile');
};

export { getToken, setToken, removeToken };
