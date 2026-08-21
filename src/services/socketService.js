import { io } from 'socket.io-client';
import { getApiOrigin } from '../utils/apiBase';

function getSocketUrl() {
  if (process.env.NODE_ENV !== 'production') {
    const env = String(process.env.REACT_APP_API_URL || '').trim().replace(/\/$/, '');
    return env || 'http://localhost:5000';
  }
  return getApiOrigin();
}

let socket = null;

export const initializeSocket = (userId, token) => {
  if (socket && socket.connected) {
    return socket;
  }

  socket = io(getSocketUrl(), {
    auth: {
      token: token
    },
    transports: ['websocket', 'polling']
  });

  socket.on('connect', () => {
    // Guard in case socket was disconnected/reset before connect event fires
    if (!socket) {
      console.warn('Socket connect event fired but socket instance is null');
      return;
    }

    console.log('Socket connected:', socket.id);
    if (userId) {
      // Legacy inbox: user-specific room
      socket.emit('join-user', userId);

      // Waabizx-style routing: join agent_*/manager rooms based on role
      let role = null;
      try {
        const storedRole = localStorage.getItem("role");
        if (storedRole) {
          role = String(storedRole).toLowerCase();
        } else {
          const rawUser = localStorage.getItem("user");
          if (rawUser) {
            const parsed = JSON.parse(rawUser);
            if (parsed && parsed.role) {
              role = String(parsed.role).toLowerCase();
            }
          }
        }
      } catch (e) {}

      if (role === "agent") {
        socket.emit("join", `agent_${userId}`);
        console.log(`Joined agent room: agent_${userId}`);
      } else {
        // Default: treat as manager (receives requesting queue)
        socket.emit("join", "manager");
        console.log("Joined manager room");
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
  });

  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const joinContactRoom = (contactId) => {
  if (socket && socket.connected) {
    socket.emit('join-contact', contactId);
  }
};

export const leaveContactRoom = (contactId) => {
  if (socket && socket.connected) {
    socket.emit('leave-contact', contactId);
  }
};

export const sendTypingStart = (contactId, userId) => {
  if (socket && socket.connected) {
    socket.emit('typing-start', { contactId, userId });
  }
};

export const sendTypingStop = (contactId, userId) => {
  if (socket && socket.connected) {
    socket.emit('typing-stop', { contactId, userId });
  }
};

export const getSocket = () => {
  return socket;
};

export const onSocketEvent = (event, callback) => {
  if (socket) {
    socket.on(event, callback);
  }
};

export const offSocketEvent = (event, callback) => {
  if (socket) {
    socket.off(event, callback);
  }
};

