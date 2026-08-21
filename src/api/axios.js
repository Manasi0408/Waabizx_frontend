import axios from "axios";
import {
  maybeHandleUnauthorizedResponse,
} from "../services/sessionExpiryService";
import { getApiUrl } from "../utils/apiBase";

const instance = axios.create({
  baseURL: getApiUrl(),
});

// Automatically attach token in every request
instance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  config.__hadAuthToken = Boolean(token);
  try {
    const raw = localStorage.getItem("selectedProject");
    if (raw) {
      const selectedProject = JSON.parse(raw);
      const projectId = selectedProject?.id;
      if (projectId != null && String(projectId).trim() !== "") {
        config.headers["x-project-id"] = String(projectId);
      }
    }
  } catch (_) {}
  return config;
});

instance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const url = error?.config?.url || error?.config?.baseURL || "";
    const hadAuth = Boolean(error?.config?.__hadAuthToken);
    if (status === 401) {
      maybeHandleUnauthorizedResponse(url, hadAuth, error?.response?.data);
    }
    return Promise.reject(error);
  }
);

export default instance;