// const API_URL = 'https://wabizx.techwhizzc.com/api';
const API_URL = 'https://api.waabizx.com/api';

const getToken = () => localStorage.getItem('token');

const authHeaders = (extra = {}) => {
  const headers = { ...extra };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  try {
    const raw = localStorage.getItem('selectedProject');
    const selected = raw ? JSON.parse(raw) : null;
    if (selected?.id != null && String(selected.id).trim() !== '') {
      headers['x-project-id'] = String(selected.id);
    }
  } catch (_) {
    /* ignore */
  }
  return headers;
};

export const uploadFlowMedia = async (file, { onProgress } = {}) => {
  const token = getToken();
  if (!token) throw new Error('No token found');
  if (!file) throw new Error('No file selected');

  const formData = new FormData();
  formData.append('media', file);

  const data = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/flows/upload-media`);
    const headers = authHeaders();
    Object.entries(headers).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && typeof onProgress === 'function') {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      let parsed = {};
      try {
        parsed = JSON.parse(xhr.responseText || '{}');
      } catch (_) {
        parsed = {};
      }
      if (xhr.status >= 200 && xhr.status < 300 && parsed.success && parsed.url) {
        resolve(parsed);
        return;
      }
      reject(new Error(parsed.message || parsed.error || 'Failed to upload media'));
    };

    xhr.onerror = () => reject(new Error('Failed to upload media'));
    xhr.send(formData);
  });

  return data;
};

export const getFlowMediaLibrary = async (type = "ALL") => {
  const token = getToken();
  if (!token) throw new Error("No token found");

  const params = new URLSearchParams();
  if (type) params.set("type", String(type).toUpperCase());

  const resp = await fetch(`${API_URL}/flows/media-library?${params.toString()}`, {
    headers: authHeaders(),
  });

  let parsed = {};
  try {
    parsed = await resp.json();
  } catch (_) {
    parsed = {};
  }

  if (!resp.ok || !parsed.success) {
    throw new Error(parsed.message || parsed.error || "Failed to load media library");
  }

  return {
    media: Array.isArray(parsed.media) ? parsed.media : [],
    counts: parsed.counts || { IMAGE: 0, AUDIO: 0, VIDEO: 0, DOCUMENT: 0 },
    storageUsedBytes: Number(parsed.storageUsedBytes) || 0,
    storageLimitBytes: Number(parsed.storageLimitBytes) || 1024 * 1024 * 1024,
  };
};

export const deleteFlowMedia = async (urls = []) => {
  const token = getToken();
  if (!token) throw new Error("No token found");

  const normalizedUrls = (Array.isArray(urls) ? urls : [])
    .map((url) => String(url || "").trim())
    .filter(Boolean);
  if (!normalizedUrls.length) throw new Error("No media selected");

  const tryDelete = async (method, url, body) => {
    const resp = await fetch(url, {
      method,
      headers: authHeaders(body ? { "Content-Type": "application/json" } : {}),
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    let parsed = {};
    try {
      parsed = await resp.json();
    } catch (_) {
      parsed = {};
    }

    return { resp, parsed };
  };

  let { resp, parsed } = await tryDelete("DELETE", `${API_URL}/flows/media-library`, {
    urls: normalizedUrls,
  });

  if (!resp.ok || !parsed.success) {
    ({ resp, parsed } = await tryDelete("POST", `${API_URL}/flows/media-library/delete`, {
      urls: normalizedUrls,
    }));
  }

  if (!resp.ok || !parsed.success) {
    throw new Error(parsed.message || parsed.error || "Failed to delete media");
  }

  return parsed;
};
