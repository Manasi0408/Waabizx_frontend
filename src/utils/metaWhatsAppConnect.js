export const META_SDK_VERSION = "v23.0";

// const DEFAULT_META_CALLBACK = "https://wabizx.techwhizzc.com/meta/callback";
const DEFAULT_META_CALLBACK = "https://api.waabizx.com/meta/callback";

/** Never use stale ngrok tunnels — Meta OAuth callback must hit the live production host. */
export function resolveMetaRedirectUri() {
  const fromEnv = String(process.env.REACT_APP_META_REDIRECT_URI || DEFAULT_META_CALLBACK).trim();
  if (!fromEnv.includes("ngrok")) {
    return fromEnv || DEFAULT_META_CALLBACK;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    const host = String(window.location.hostname || "").toLowerCase();
    if (host && host !== "localhost" && host !== "127.0.0.1" && host !== "0.0.0.0") {
      return `${window.location.origin.replace(/\/$/, "")}/meta/callback`;
    }
  }
  return DEFAULT_META_CALLBACK;
}

export const META_EMBEDDED_REDIRECT_URI = resolveMetaRedirectUri();

/** Replace stale ngrok redirect_uri in backend-built OAuth URLs before opening the popup. */
export function sanitizeMetaOAuthUrl(oauthUrl) {
  const raw = String(oauthUrl || "").trim();
  if (!raw) return raw;
  try {
    const parsed = new URL(raw);
    const redirectUri = String(parsed.searchParams.get("redirect_uri") || "").trim();
    if (redirectUri.includes("ngrok")) {
      parsed.searchParams.set("redirect_uri", META_EMBEDDED_REDIRECT_URI);
      return parsed.toString();
    }
  } catch (_) {
    /* ignore */
  }
  return raw;
}

export const META_EMBEDDED_CONFIG_ID = (
  process.env.REACT_APP_META_CONFIG_ID || "1616537092881932"
).trim();

export const META_APP_ID = (
  process.env.REACT_APP_META_APP_ID || "1562341501476558"
).trim();

export const META_SOLUTION_ID = (
  process.env.REACT_APP_META_SOLUTION_ID ||
  process.env.REACT_APP_AISENSY_SOLUTION_ID ||
  ""
).trim();

export const META_EMBEDDED_SIGNUP_SCOPES = (
  process.env.REACT_APP_META_EMBEDDED_SIGNUP_SCOPES ||
  "business_management,whatsapp_business_management,whatsapp_business_messaging"
).trim();

/**
 * Path A (locked): AiSensy multi-partner partner billing via extras.setup.solutionID.
 * Do not omit solutionID (that is Path B — customer Meta card).
 */
export function buildMetaEmbeddedSignupExtras(solutionId = META_SOLUTION_ID) {
  const sid = String(solutionId || META_SOLUTION_ID || "").trim();
  if (!sid) {
    throw new Error(
      "Path A requires REACT_APP_META_SOLUTION_ID for AiSensy partner billing."
    );
  }
  return {
    setup: { solutionID: sid },
    featureType: "",
    sessionInfoVersion: "3",
  };
}

function buildEmbeddedSignupOAuthParams(
  clientId,
  projectId = null,
  pageFlow = false,
  solutionId = META_SOLUTION_ID,
  returnOrigin = null
) {
  const cid = Number(clientId);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw new Error("client_id is required");
  }
  if (!META_EMBEDDED_CONFIG_ID) {
    throw new Error("REACT_APP_META_CONFIG_ID is not set");
  }
  const pid = projectId != null ? Number(projectId) : null;
  let state = Number.isInteger(pid) && pid > 0 ? `${cid}:${pid}` : String(cid);
  if (pageFlow) state += ":page";
  const appOrigin =
    returnOrigin ||
    (typeof window !== "undefined" ? String(window.location?.origin || "").trim() : "");
  if (appOrigin && /^https?:\/\//i.test(appOrigin)) {
    try {
      const encoded = `o${btoa(appOrigin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`;
      state += `:${encoded}`;
    } catch (_) {
      /* ignore */
    }
  }
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: META_EMBEDDED_REDIRECT_URI,
    state,
    config_id: META_EMBEDDED_CONFIG_ID,
    response_type: "code",
    override_default_response_type: "true",
  });
  if (META_EMBEDDED_SIGNUP_SCOPES) {
    params.set("scope", META_EMBEDDED_SIGNUP_SCOPES);
  }
  const extras = buildMetaEmbeddedSignupExtras(solutionId);
  params.set("extras", JSON.stringify(extras));
  return params;
}

/** API base — same origin when env unset (works with CRA proxy in dev). */
export function resolveApiBase() {
  const fromEnv = String(process.env.REACT_APP_API_URL || "").trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://localhost:5000";
}

export function resolveMetaAppOrigin() {
  try {
    return new URL(META_EMBEDDED_REDIRECT_URI).origin;
  } catch (_) {
    // return "https://wabizx.techwhizzc.com";
    return "https://api.waabizx.com";
  }
}

/** Hosts allowed to run Embedded Signup (Meta redirect_uri must match). */
export function isAllowedConnectOrigin(origin = window.location.origin) {
  const o = String(origin || "").toLowerCase();
  const host = (() => {
    try {
      return new URL(o).hostname;
    } catch (_) {
      return "";
    }
  })();
  const allowedHosts = new Set([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    (() => {
      try {
        return new URL(resolveMetaAppOrigin()).hostname.toLowerCase();
      } catch (_) {
        return "";
      }
    })(),
  ]);
  if (allowedHosts.has(host)) return true;
  return o === resolveMetaAppOrigin().toLowerCase();
}

export function buildMetaOAuthUrl(
  clientId,
  projectId = null,
  pageFlow = false,
  solutionId = META_SOLUTION_ID
) {
  const params = buildEmbeddedSignupOAuthParams(clientId, projectId, pageFlow, solutionId);
  return `https://www.facebook.com/${META_SDK_VERSION}/dialog/oauth?${params.toString()}`;
}

/** Options for window.FB.login — Path A: Meta sample + required AiSensy solutionID. */
export function buildFbEmbeddedSignupLoginOptions(solutionId = META_SOLUTION_ID) {
  if (!META_EMBEDDED_CONFIG_ID) {
    throw new Error("REACT_APP_META_CONFIG_ID is not set");
  }
  const sid = String(solutionId || META_SOLUTION_ID || "").trim();
  if (!sid) {
    throw new Error(
      "Path A requires REACT_APP_META_SOLUTION_ID — AiSensy partner billing will not work without it."
    );
  }
  return {
    config_id: String(META_EMBEDDED_CONFIG_ID),
    response_type: "code",
    override_default_response_type: true,
    extras: buildMetaEmbeddedSignupExtras(sid),
  };
}

/** Optional: fetch OAuth URL from backend GET /meta/connect */
export async function fetchMetaConnectUrl(clientId, projectId, token) {
  const base = resolveApiBase();
  let url = `${base}/meta/connect?client_id=${encodeURIComponent(clientId)}`;
  if (projectId != null && Number.isInteger(Number(projectId)) && Number(projectId) > 0) {
    url += `&projectId=${encodeURIComponent(projectId)}`;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    url += `&returnOrigin=${encodeURIComponent(window.location.origin)}`;
  }
  url += `&redirect_uri=${encodeURIComponent(META_EMBEDDED_REDIRECT_URI)}`;
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data?.url) {
    return {
      url: sanitizeMetaOAuthUrl(String(data.url)),
      solutionId: data.solutionId != null ? String(data.solutionId) : null,
    };
  }
  return null;
}

export function readClientIdFromStorage() {
  try {
    const rawUser = localStorage.getItem("user");
    if (rawUser) {
      const uid = Number(JSON.parse(rawUser)?.id);
      if (Number.isInteger(uid) && uid > 0) return uid;
    }
  } catch (_) {
    /* ignore */
  }
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;
    const uid = Number(JSON.parse(atob(token.split(".")[1]))?.id);
    return Number.isInteger(uid) && uid > 0 ? uid : null;
  } catch (_) {
    return null;
  }
}

export function readSelectedProjectIdFromStorage() {
  try {
    const raw = localStorage.getItem("selectedProject");
    if (!raw) return null;
    const pid = Number(JSON.parse(raw)?.id);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch (_) {
    return null;
  }
}

/** Full-page redirect — fallback only when popup is blocked. */
export function redirectToMetaEmbeddedSignup(clientId, projectId = null) {
  const cid = Number(clientId);
  if (!Number.isInteger(cid) || cid <= 0) {
    throw new Error("Please log in again before connecting WhatsApp.");
  }
  if (!META_EMBEDDED_CONFIG_ID) {
    throw new Error("Meta Embedded Signup config_id is missing. Set REACT_APP_META_CONFIG_ID.");
  }

  const base = resolveApiBase();
  let url = `${base}/meta/connect?client_id=${encodeURIComponent(cid)}&redirect=1`;
  const pid =
    projectId != null ? Number(projectId) : readSelectedProjectIdFromStorage();
  if (Number.isInteger(pid) && pid > 0) {
    url += `&projectId=${encodeURIComponent(pid)}`;
  }
  if (typeof window !== "undefined" && window.location?.origin) {
    url += `&returnOrigin=${encodeURIComponent(window.location.origin)}`;
  }
  window.location.assign(url);
}

export function openMetaOAuthPopupWindow(oauthUrl, name = "waabiz-meta-signup") {
  const popupWidth = 520;
  const popupHeight = 760;
  const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0;
  const dualScreenTop = window.screenTop ?? window.screenY ?? 0;
  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || window.screen?.width || popupWidth;
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || window.screen?.height || popupHeight;
  const left = Math.max(0, dualScreenLeft + Math.round((viewportWidth - popupWidth) / 2));
  const top = Math.max(0, dualScreenTop + Math.round((viewportHeight - popupHeight) / 2));
  const features = [
    `width=${popupWidth}`,
    `height=${popupHeight}`,
    `left=${left}`,
    `top=${top}`,
    "resizable=yes",
    "scrollbars=yes",
    "status=yes",
  ].join(",");
  const popup = window.open(oauthUrl, name, features);
  if (popup) {
    try {
      popup.focus();
    } catch (_) {
      /* ignore */
    }
  }
  return popup;
}
