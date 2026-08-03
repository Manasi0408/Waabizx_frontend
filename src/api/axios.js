import axios from "axios";

const instance = axios.create({
  // baseURL: "https://wabizx.techwhizzc.com/api"
  baseURL: "https://api.waabizx.com/api"
});

// Automatically attach token in every request
instance.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
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

export default instance;