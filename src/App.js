import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import BrandLogoMark from './components/BrandLogoMark';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
import { isAuthenticated } from './services/authService';
import Login from './pages/Login';
import Register from './pages/Register';
import RegisterOtpVerification from './pages/RegisterOtpVerification';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Campaigns from './pages/Campaigns';
import CreateCampaignPage from './pages/CreateCampaignPage';
import Broadcast from './pages/Broadcast';
import Templates from './pages/Templates';
import Analytics from './pages/Analytics';
import Contacts from './pages/Contacts';
import TagsPage from './pages/TagsPage';
import Inbox from './pages/Inbox';
import Flows from './pages/Flows';
import FormsPage from './pages/FormsPage';
import FormBuilderPage from './pages/FormBuilderPage';
import WhatsAppButtonPage from './pages/WhatsAppButtonPage';
import RcsPage from './pages/RcsPage';
import Chatbot from './components/Chatbot';
import MainSidebarNav from './components/MainSidebarNav';
import AppShellSidebar from './components/AppShellSidebar';
import AdminHeaderProjectSwitch from './components/AdminHeaderProjectSwitch';
import HeaderRightActions from './components/HeaderRightActions';
import PasswordInput from './components/PasswordInput';
import axios from './api/axios';
import {
  META_EMBEDDED_CONFIG_ID,
  META_EMBEDDED_REDIRECT_URI,
  META_SOLUTION_ID,
  redirectToMetaEmbeddedSignup,
  buildFbEmbeddedSignupLoginOptions,
  buildMetaOAuthUrl,
  fetchMetaConnectUrl,
  sanitizeMetaOAuthUrl,
  openMetaOAuthPopupWindow,
  resolveApiBase,
  resolveMetaAppOrigin,
  META_SDK_VERSION,
} from './utils/metaWhatsAppConnect';
import { connectWhatsAppOnboarding } from './services/onboardingService';
import { logEmbeddedSignupClient } from './utils/embeddedSignupLog';
import ProjectLogin from './pages/ProjectLogin';
import ProjectDashboard from './pages/ProjectDashboard';
import AgentHomePage from './pages/AgentHomePage';
import AgentAnalyticsPage from './pages/AgentAnalyticsPage';
import BroadcastCampaignPage from './pages/BroadcastCampaignPage';
import LiveChatPage from './pages/LiveChatPage';
import TemplateMessagesPage from './pages/TemplateMessagesPage';
import ContactManagementPage from './pages/ContactManagementPage';
import ManagePage from './pages/ManagePage';
import AgentManageCannedMessagesPage from './pages/AgentManageCannedMessagesPage';
import SuperAdminDashboard from './pages/SuperAdminDashboard';
import SuperAdminBusinessesPage from './pages/SuperAdminBusinessesPage';
import SuperAdminBlogsPage from './pages/SuperAdminBlogsPage';
import PublicBlogListPage from './pages/PublicBlogListPage';
import PublicBlogDetailPage from './pages/PublicBlogDetailPage';
import CampaignReportsPage from './pages/CampaignReportsPage';
import HistoryPage from './pages/HistoryPage';
import ReportsComingSoonPage from './pages/ReportsComingSoonPage';
import AgentChatPage from './pages/AgentChatPage';
import AdminDashboard from './pages/AdminDashboard';
import AgentDashboard from './pages/AgentDashboard';
import {
  getManagerFallbackRoute,
  hasManagerModuleAccess,
  normalizeRole,
  readStoredUser,
} from './utils/managerAccess';
import SessionExpiryGuard from './components/SessionExpiryGuard';

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  return isAuthenticated() ? children : <Navigate to="/login" replace />;
};

const getCurrentUserRole = () => {
  let role = "";
  try {
    // Prefer explicit role key set at login.
    role = normalizeRole(localStorage.getItem("role"));
    if (!role) {
      const raw = localStorage.getItem("user");
      if (raw) {
        const user = JSON.parse(raw);
        role = normalizeRole(user?.role);
      }
    }
  } catch (e) {
    role = normalizeRole(localStorage.getItem("role"));
  }
  return role;
};

const getDefaultRouteForCurrentUser = () => {
  const role = getCurrentUserRole();

  if (role === "super_admin" || role === "superadmin") return "/super-admin";
  if (role === "admin") return "/project-dashboard";
  if (role === "manager") return getManagerFallbackRoute(readStoredUser());
  if (role === "agent") return "/agent";
  return "/project-dashboard";
};

// Public Route Component
const PublicRoute = ({ children }) => {
  return children;
};

const ManagerPermissionRoute = ({ moduleKey, children }) => {
  const role = getCurrentUserRole();
  const user = readStoredUser();
  if (role !== "manager" || hasManagerModuleAccess(moduleKey, user)) {
    return children;
  }
  return <Navigate to={getManagerFallbackRoute(user)} replace />;
};

// Admin-only route: show ProjectDashboard if user role is admin, else redirect to /
const AdminDashboardRoute = () => {
  const user = readStoredUser();
  const role = normalizeRole(user?.role || localStorage.getItem("role"));
  if (role === "admin") {
    return <ProjectDashboard />;
  }
  if (role === "manager" && hasManagerModuleAccess("myProjects", user)) {
    return <ProjectDashboard />;
  }
  return <Navigate to={getDefaultRouteForCurrentUser()} replace />;
};

const SuperAdminDashboardRoute = () => {
  const role = getCurrentUserRole();
  const isSuperAdmin = role === "super_admin" || role === "superadmin";
  return isSuperAdmin ? <SuperAdminDashboard /> : <Navigate to="/" replace />;
};

const SuperAdminBusinessesRoute = () => {
  const role = getCurrentUserRole();
  const isSuperAdmin = role === "super_admin" || role === "superadmin";
  return isSuperAdmin ? <SuperAdminBusinessesPage /> : <Navigate to="/" replace />;
};

const SuperAdminBlogsRoute = () => {
  const role = getCurrentUserRole();
  const isSuperAdmin = role === "super_admin" || role === "superadmin";
  return isSuperAdmin ? <SuperAdminBlogsPage /> : <Navigate to="/" replace />;
};

// Agent dashboard: agent or admin with token can access (admin when viewing a project); else redirect to /login
const AgentDashboardRoute = () => {
  const token = localStorage.getItem("token");
  const role = getCurrentUserRole();
  if (token && (role === "agent" || role === "admin" || role === "manager")) {
    return <AgentHomePage />;
  }
  return <Navigate to={token ? getDefaultRouteForCurrentUser() : "/login"} replace />;
};

const DashboardRoute = () => {
  const role = getCurrentUserRole();
  if (role === "agent") {
    return <Navigate to="/agent" replace />;
  }
  if (role === "super_admin" || role === "superadmin") {
    return <Navigate to="/super-admin" replace />;
  }
  return <Dashboard />;
};

const WA_META_LIVE_PREFIX = "wa_wb_meta_live_";
const FALLBACK_CONNECTED_BANNER =
  "WhatsApp Business is connected. You can continue with the further process.";

/** Connected when Meta Cloud API onboarding is saved (WABA + phone + token). */
const isWhatsAppConnected = (data) =>
  Boolean(
    data &&
      typeof data === "object" &&
      (data.onboardingCompleted === true ||
        data.whatsappConnected === true ||
        data.metaLinked === true ||
        (data.wabaId && data.phoneNumberId))
  );
const WA_EMBEDDED_SIGNUP_EVENT = "WA_EMBEDDED_SIGNUP";

const META_POPUP_MESSAGE_SOURCE = "waabiz-meta-oauth-popup";
const META_POPUP_STORAGE_KEY = "waabiz-meta-popup-result";
const META_POPUP_POLL_INTERVAL_MS = 500;
function isAllowedMetaMessageOrigin(origin) {
  const value = String(origin || "").toLowerCase();
  if (value.includes("facebook.com") || value.includes("fb.com")) return true;
  try {
    const callbackOrigin = String(resolveMetaAppOrigin() || "").toLowerCase();
    if (callbackOrigin && value === callbackOrigin) return true;
  } catch (_) {
    /* ignore */
  }
  return false;
}

function isMetaOAuthPopupOrigin(origin) {
  const value = String(origin || "").toLowerCase();
  if (value === String(window.location?.origin || "").toLowerCase()) return true;
  try {
    const callbackOrigin = String(resolveMetaAppOrigin() || "").toLowerCase();
    if (callbackOrigin && value === callbackOrigin) return true;
  } catch (_) {
    /* ignore */
  }
  return false;
}

function extractEmbeddedSignupCode(data) {
  if (!data || typeof data !== "object") return "";
  const candidates = [
    data.code,
    data.authorization_code,
    data.oauth_code,
    data?.authResponse?.code,
    data?.data?.code,
    data?.data?.authorization_code,
    data?.data?.oauth_code,
    data?.data?.authResponse?.code,
  ];
  for (const candidate of candidates) {
    const code = String(candidate || "").trim();
    if (code) return code;
  }
  return "";
}

function readSelectedProjectIdFromStorage() {
  try {
    const raw = localStorage.getItem("selectedProject");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const pid = Number(parsed?.id);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch (_) {
    return null;
  }
}

/** Named banner matching backend Meta callback (`ICICI Bank is Live now…`). */
function defaultProjectLiveBanner(projectName) {
  const label = String(projectName || "").trim();
  if (!label) return FALLBACK_CONNECTED_BANNER;
  return `${label} is Live now. You can continue with the further process.`;
}

function readClientIdFromStorage() {
  try {
    const rawUser = localStorage.getItem("user");
    if (rawUser) {
      const parsedUser = JSON.parse(rawUser);
      const uid = Number(parsedUser?.id);
      if (Number.isInteger(uid) && uid > 0) return uid;
    }
  } catch (e) {
    /* ignore */
  }
  try {
    const token = localStorage.getItem("token");
    if (!token) return null;
    const payload = JSON.parse(atob(token.split(".")[1]));
    const uid = Number(payload?.id);
    return Number.isInteger(uid) && uid > 0 ? uid : null;
  } catch (e) {
    return null;
  }
}

function readPackRaw(storageKey) {
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object" || !o.snapshot || typeof o.snapshot !== "object") return null;
    return o;
  } catch (_) {
    return null;
  }
}

/** Per-project pack so BOI / ICICI messages do not overwrite each other (with legacy migration). */
function readWaMetaLivePack(clientId, projectId = null) {
  if (!clientId) return null;
  const cid = Number(clientId);
  if (!Number.isInteger(cid) || cid <= 0) return null;
  const pid = projectId != null ? Number(projectId) : null;
  const hasPid = Number.isInteger(pid) && pid > 0;

  const legacyKey = `${WA_META_LIVE_PREFIX}${cid}`;
  const legacy = readPackRaw(legacyKey);

  if (hasPid) {
    const scopedKey = `${WA_META_LIVE_PREFIX}${cid}_p${pid}`;
    const scoped = readPackRaw(scopedKey);
    if (scoped) return scoped;
    if (legacy) {
      const snapPid =
        legacy.snapshot?.projectId != null ? Number(legacy.snapshot.projectId) : null;
      const linked = legacy.linkedProjectId != null ? Number(legacy.linkedProjectId) : null;
      const legacyProject =
        Number.isInteger(snapPid) && snapPid > 0 ? snapPid : Number.isInteger(linked) && linked > 0 ? linked : null;
      if (legacyProject === pid) {
        try {
          localStorage.setItem(scopedKey, JSON.stringify(legacy));
        } catch (_) {
          /* ignore */
        }
        return legacy;
      }
    }
    return null;
  }

  return legacy;
}

function writeWaMetaLivePack(clientId, snapshot, bannerFromUrl = "", preferredProjectId = null) {
  if (!clientId || !snapshot || !isWhatsAppConnected(snapshot)) return;
  const cid = Number(clientId);
  if (!Number.isInteger(cid) || cid <= 0) return;

  const snapPid = snapshot.projectId != null ? Number(snapshot.projectId) : null;
  const prefPid = preferredProjectId != null ? Number(preferredProjectId) : null;
  const mergedPid =
    Number.isInteger(prefPid) && prefPid > 0
      ? prefPid
      : Number.isInteger(snapPid) && snapPid > 0
        ? snapPid
        : null;

  const prev =
    readWaMetaLivePack(cid, mergedPid) ||
    (Number.isInteger(snapPid) && snapPid > 0 ? readWaMetaLivePack(cid, snapPid) : null) ||
    readWaMetaLivePack(cid);

  const urlBanner = typeof bannerFromUrl === "string" ? bannerFromUrl.trim() : "";
  const banner =
    urlBanner ||
    (typeof prev?.banner === "string" ? prev.banner.trim() : "") ||
    FALLBACK_CONNECTED_BANNER;

  const linkedProjectId =
    Number.isInteger(mergedPid) && mergedPid > 0
      ? mergedPid
      : prev?.linkedProjectId != null && Number(prev.linkedProjectId) > 0
        ? Number(prev.linkedProjectId)
        : null;

  const snapshotOut = { ...snapshot };
  if (linkedProjectId != null) snapshotOut.projectId = linkedProjectId;

  const pack = {
    snapshot: snapshotOut,
    banner,
    linkedProjectId: Number.isInteger(linkedProjectId) ? linkedProjectId : null,
    updatedAt: Date.now(),
  };

  try {
    if (Number.isInteger(linkedProjectId) && linkedProjectId > 0) {
      localStorage.setItem(`${WA_META_LIVE_PREFIX}${cid}_p${linkedProjectId}`, JSON.stringify(pack));
    } else {
      localStorage.setItem(`${WA_META_LIVE_PREFIX}${cid}`, JSON.stringify(pack));
    }
  } catch (_) {
    /* quota / private mode */
  }
}

/** Only call when credentials are invalid — not on noisy API errors. Clears all variants for this user. */
function clearWaMetaLivePack(clientId) {
  if (!clientId) return;
  const cid = String(Number(clientId));
  const exact = `${WA_META_LIVE_PREFIX}${cid}`;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k === exact || k.startsWith(`${exact}_p`)) localStorage.removeItem(k);
    }
  } catch (_) {
    /* ignore */
  }
}

/** OAuth return may include linkedProjectId before selectedProject is persisted. */
function readLinkedProjectIdFromUrl() {
  try {
    const q = new URLSearchParams(window.location.search || "");
    const n = parseInt(String(q.get("linkedProjectId") || ""), 10);
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch (_) {
    return null;
  }
}

function initialConnectWhatsAppPackProjectId() {
  return readLinkedProjectIdFromUrl() ?? readSelectedProjectIdFromStorage();
}

// Connect WhatsApp — use Facebook JS SDK / WhatsApp Embedded Signup popup.
function ConnectWhatsApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [embeddedSignupActive, setEmbeddedSignupActive] = useState(false);
  const [fbSdkReady, setFbSdkReady] = useState(() => Boolean(window.FB));
  const [popupStatusMessage, setPopupStatusMessage] = useState("");
  const metaPopupRef = useRef(null);
  const metaPopupPollRef = useRef(null);
  const signupWatchdogIntervalRef = useRef(null);
  const signupWatchdogTimeoutRef = useRef(null);
  const signupRedirectTimerRef = useRef(null);
  const embeddedSignupCodeHandlerRef = useRef(null);
  const metaPopupResultHandlerRef = useRef(null);
  const stopSignupWatchdogRef = useRef(null);
  const [showSignupSuccessScreen, setShowSignupSuccessScreen] = useState(false);
  const [liveStatusChecked, setLiveStatusChecked] = useState(() => {
    const cid = readClientIdFromStorage();
    const pid = initialConnectWhatsAppPackProjectId();
    const snap = readWaMetaLivePack(cid, pid)?.snapshot;
    return Boolean(cid && snap?.onboardingCompleted);
  });
  const [waStatus, setWaStatus] = useState(() => {
    const cid = readClientIdFromStorage();
    const pid = initialConnectWhatsAppPackProjectId();
    return readWaMetaLivePack(cid, pid)?.snapshot ?? null;
  });
  const [regPin, setRegPin] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [regBusy, setRegBusy] = useState(false);
  const [regErr, setRegErr] = useState("");
  const [regOk, setRegOk] = useState("");
  const [projectListPhone, setProjectListPhone] = useState("");
  const [projectListName, setProjectListName] = useState("");
  const API_BASE = resolveApiBase();

  const urlParams = useMemo(() => new URLSearchParams(location.search || ""), [location.search]);
  const onboardingMessage = String(urlParams.get("onboardingMessage") || "").trim();
  const linkedProjectIdOAuth = useMemo(() => {
    const raw = urlParams.get("linkedProjectId");
    const n = parseInt(raw, 10);
    return Number.isInteger(n) && n > 0 ? String(n) : null;
  }, [urlParams]);

  const onboardingBannerText = useMemo(() => {
    if (!onboardingMessage) return "";
    try {
      return decodeURIComponent(onboardingMessage.replace(/\+/g, " "));
    } catch (e) {
      return onboardingMessage;
    }
  }, [onboardingMessage]);

  const clientId = readClientIdFromStorage();

  const effectiveProjectId = useMemo(() => {
    if (linkedProjectIdOAuth) {
      const n = parseInt(linkedProjectIdOAuth, 10);
      if (Number.isInteger(n) && n > 0) return n;
    }
    return readSelectedProjectIdFromStorage();
  }, [linkedProjectIdOAuth, location.key, location.pathname]);

  const user = (() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  })();
  const userName = user?.name || "User";
  const userInitial = userName.charAt(0).toUpperCase();

  const onboardingOkFromUrl = urlParams.get("onboardingOk") === "1";
  const onboardingOk = Boolean(
    onboardingOkFromUrl ||
      (waStatus && waStatus.success !== false && waStatus.onboardingCompleted)
  );
  const needsCloudReg = Boolean(waStatus?.needsCloudApiRegistration);
  const graphErr = waStatus?.cloudApiPhoneError ? String(waStatus.cloudApiPhoneError) : null;
  const congratRedirect =
    onboardingMessage.length > 0 &&
    onboardingOk &&
    !needsCloudReg &&
    !graphErr;
  const fullyReady =
    Boolean(liveStatusChecked && onboardingOk && !needsCloudReg && !graphErr);
  const displayPhoneMeta =
    (typeof waStatus?.displayPhone === "string" ? waStatus.displayPhone.trim() : "") ||
    (typeof waStatus?.cloudApiPhone?.display_phone_number === "string"
      ? waStatus.cloudApiPhone.display_phone_number.trim()
      : "");
  const displayPhoneLine =
    displayPhoneMeta ||
    (projectListPhone && String(projectListPhone).trim()) ||
    null;

  const persistedPack = clientId ? readWaMetaLivePack(clientId, effectiveProjectId) : null;
  const persistedBanner =
    typeof persistedPack?.banner === "string" ? persistedPack.banner.trim() : "";
  const autoBannerFromProject =
    onboardingOk && String(projectListName || "").trim()
      ? defaultProjectLiveBanner(projectListName)
      : "";
  const congratulationsMessage =
    popupStatusMessage || onboardingBannerText || persistedBanner || autoBannerFromProject;

  const authApiHeadersJson = () => {
    let projectId = null;
    try {
      const selectedProject = JSON.parse(localStorage.getItem("selectedProject") || "null");
      projectId = selectedProject?.id != null ? String(selectedProject.id) : null;
    } catch (e) {}
    const token = localStorage.getItem("token");
    const headers = { "Content-Type": "application/json" };
    if (projectId) headers["x-project-id"] = projectId;
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  };

  const cleanupMetaPopup = useCallback(() => {
    if (metaPopupPollRef.current) {
      window.clearInterval(metaPopupPollRef.current);
      metaPopupPollRef.current = null;
    }
    const popup = metaPopupRef.current;
    if (popup && !popup.closed) {
      try {
        popup.close();
      } catch (_) {
        /* ignore cross-origin close restrictions */
      }
    }
    metaPopupRef.current = null;
  }, []);

  const presentSignupSuccessThenRedirect = useCallback(
    (bannerMessage, statusData = null) => {
      if (!isWhatsAppConnected(statusData)) return;
      if (signupRedirectTimerRef.current) {
        window.clearTimeout(signupRedirectTimerRef.current);
        signupRedirectTimerRef.current = null;
      }
      const msg =
        String(bannerMessage || "").trim() ||
        (projectListName ? defaultProjectLiveBanner(projectListName) : "WhatsApp Business connected successfully!");
      setShowSignupSuccessScreen(true);
      setRegErr("");
      setRegOk(msg);
      setLiveStatusChecked(true);
      setWaStatus((prev) => ({
        ...(prev && typeof prev === "object" ? prev : {}),
        ...(statusData && typeof statusData === "object" ? statusData : {}),
        success: true,
        onboardingCompleted: true,
        connected: true,
        whatsappConnected: true,
        metaLinked: true,
        creditLineAttached: Boolean(statusData?.creditLineAttached),
      }));
      setEmbeddedSignupActive(false);
      setRegBusy(false);
      cleanupMetaPopup();

      signupRedirectTimerRef.current = window.setTimeout(() => {
        setShowSignupSuccessScreen(false);
        const params = new URLSearchParams();
        params.set("onboardingMessage", msg);
        const pid =
          effectiveProjectId != null && Number(effectiveProjectId) > 0
            ? effectiveProjectId
            : readSelectedProjectIdFromStorage();
        if (pid != null && Number(pid) > 0) {
          params.set("linkedProjectId", String(pid));
        }
        navigate(`/connect-whatsapp?${params.toString()}`, { replace: true });
        signupRedirectTimerRef.current = null;
      }, 2800);
    },
    [cleanupMetaPopup, effectiveProjectId, navigate, projectListName]
  );

  useEffect(() => {
    return () => {
      if (signupRedirectTimerRef.current) {
        window.clearTimeout(signupRedirectTimerRef.current);
        signupRedirectTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const appId = process.env.REACT_APP_META_APP_ID || "1562341501476558";
    let cancelled = false;

    const initSdk = () => {
      if (!window.FB || cancelled) return false;
      try {
        if (!window.__waabizFbSdkInitialized) {
          window.FB.init({
            appId: String(appId),
            autoLogAppEvents: true,
            xfbml: true,
            version: META_SDK_VERSION,
          });
          window.__waabizFbSdkInitialized = true;
        }
      } catch (_) {
        window.__waabizFbSdkInitialized = true;
      }
      if (!cancelled && typeof window.FB.login === "function") {
        setFbSdkReady(true);
      }
      return typeof window.FB.login === "function";
    };

    const previousAsyncInit = window.fbAsyncInit;
    window.fbAsyncInit = function chainedFbAsyncInit() {
      if (typeof previousAsyncInit === "function") {
        try {
          previousAsyncInit();
        } catch (_) {
          /* ignore */
        }
      }
      initSdk();
    };

    if (initSdk()) {
      return () => {
        cancelled = true;
      };
    }

    const existingScript = document.querySelector('script[src*="connect.facebook.net"]');
    if (!existingScript) {
      const script = document.createElement("script");
      script.src = "https://connect.facebook.net/en_US/sdk.js";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      document.body.appendChild(script);
    }

    const poll = window.setInterval(() => {
      if (initSdk()) {
        window.clearInterval(poll);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, []);

  const refreshConnectionStatus = useCallback(async () => {
    const cid = readClientIdFromStorage();
    if (!cid) {
      setWaStatus(null);
      return null;
    }

    let projectId = linkedProjectIdOAuth;
    if (!projectId) {
      try {
        const selectedProject = JSON.parse(localStorage.getItem("selectedProject") || "null");
        projectId = selectedProject?.id != null ? String(selectedProject.id) : null;
      } catch (e) {
        projectId = null;
      }
    }
    const scopedPackPid =
      projectId != null && String(projectId).trim() !== ""
        ? Number(projectId)
        : readSelectedProjectIdFromStorage();
    const packBefore = readWaMetaLivePack(cid, scopedPackPid);

    try {
      const token = localStorage.getItem("token");
      const headers = {};
      if (projectId) headers["x-project-id"] = projectId;
      if (token) headers.Authorization = `Bearer ${token}`;

      let statusUrl = `${API_BASE}/meta/onboarding-status?client_id=${cid}`;
      if (projectId) {
        statusUrl += `&projectId=${encodeURIComponent(projectId)}`;
      }

      const res = await fetch(statusUrl, { headers });
      const data = await res.json().catch(() => ({}));

      if (res.status === 401) {
        clearWaMetaLivePack(cid);
        setWaStatus(null);
        return null;
      }

      if (!res.ok) {
        if (packBefore?.snapshot?.onboardingCompleted) {
          setWaStatus(packBefore.snapshot);
        }
        return null;
      }

      const isLinked = isWhatsAppConnected(data);
      if (isLinked) {
        const resPidRaw = data.projectId != null ? Number(data.projectId) : null;
        const resPid =
          Number.isInteger(resPidRaw) && resPidRaw > 0
            ? resPidRaw
            : Number.isInteger(scopedPackPid) && scopedPackPid > 0
              ? scopedPackPid
              : projectId != null && String(projectId).trim() !== ""
                ? Number(projectId)
                : null;

        let bannerToPersist = onboardingBannerText;
        if (!bannerToPersist && Number.isInteger(resPid) && resPid > 0) {
          try {
            const lst = await axios.get("/projects/list");
            const projects = Array.isArray(lst?.data?.projects) ? lst.data.projects : [];
            const m = projects.find((p) => Number(p?.id) === resPid);
            const pname = String(m?.project_name || "").trim();
            if (pname) bannerToPersist = defaultProjectLiveBanner(pname);
          } catch (_) {
            /* ignore */
          }
        }

        setWaStatus(data);
        writeWaMetaLivePack(cid, data, bannerToPersist, resPid);
      } else if (packBefore?.snapshot?.onboardingCompleted) {
        setWaStatus(packBefore.snapshot);
      } else {
        setWaStatus(data);
      }
      return data;
    } catch (e) {
      if (packBefore?.snapshot?.onboardingCompleted) {
        setWaStatus(packBefore.snapshot);
      }
      return null;
    }
  }, [API_BASE, linkedProjectIdOAuth, onboardingBannerText]);

  const checkWhatsAppConnection = useCallback(async () => {
    try {
      const status = await refreshConnectionStatus();
      if (isWhatsAppConnected(status)) {
        const selectedProject = JSON.parse(localStorage.getItem("selectedProject") || "null");
        const projectName = String(selectedProject?.project_name || selectedProject?.name || "").trim();
        const liveBanner = projectName ? defaultProjectLiveBanner(projectName) : "WhatsApp Business connected successfully.";
        setPopupStatusMessage(liveBanner);
        setRegErr("");
        setRegOk(liveBanner);
        setLiveStatusChecked(true);
        setWaStatus((prev) => ({
          ...(prev && typeof prev === "object" ? prev : {}),
          ...(status && typeof status === "object" ? status : {}),
          success: true,
          onboardingCompleted: true,
          connected: true,
          whatsappConnected: true,
          metaLinked: true,
        }));
        setRegBusy(false);
        setEmbeddedSignupActive(false);
      }
      return status;
    } catch (e) {
      setRegBusy(false);
      setEmbeddedSignupActive(false);
      return null;
    }
  }, [refreshConnectionStatus]);

  useEffect(() => {
    const parseCodeFromEventString = (raw) => {
      const text = String(raw || "").trim();
      if (!text) return "";

      const qIndex = text.indexOf("?");
      const queryLike = qIndex >= 0 ? text.slice(qIndex + 1) : text;
      const normalized = queryLike.startsWith("cb=") ? queryLike.slice(3) : queryLike;
      const params = new URLSearchParams(normalized);
      const code = String(params.get("code") || "").trim();
      return code;
    };

    const processPopupPayload = (data) => {
      if (!data || data.source !== META_POPUP_MESSAGE_SOURCE) return;

      cleanupMetaPopup();
      setEmbeddedSignupActive(false);
      setRegBusy(false);
      stopSignupWatchdogRef.current?.();

      if (data.type === "WHATSAPP_CONNECTION_FAILED" || data.type === "error") {
        setPopupStatusMessage("");
        setRegOk("");
        setRegErr(data.message || "WhatsApp connection failed.");
        return;
      }

      const isLive = isWhatsAppConnected(data);
      const successMessage =
        data.message ||
        (isLive
          ? "WhatsApp Business connected successfully."
          : "Meta sign-in completed. Finalizing WhatsApp connection...");

      setPopupStatusMessage(successMessage);
      setLiveStatusChecked(true);
      setWaStatus((prev) => ({
        ...(prev && typeof prev === "object" ? prev : {}),
        success: true,
        onboardingCompleted: isLive,
        whatsappConnected: isLive,
        metaLinked: isLive,
        connected: isLive,
      }));
      setRegErr("");
      setRegOk(successMessage);

      refreshConnectionStatus().then((status) => {
        const verified = isWhatsAppConnected(status) || isLive;
        if (verified) {
          presentSignupSuccessThenRedirect(successMessage, isWhatsAppConnected(status) ? status : data);
        }
      });
    };

    metaPopupResultHandlerRef.current = processPopupPayload;

    const submitEmbeddedSignupCode = (code, message) => {
      const handler = embeddedSignupCodeHandlerRef.current;
      if (typeof handler === "function" && code) {
        handler(code);
        return true;
      }
      if (message) {
        setRegErr("");
        setRegOk(message);
      }
      return false;
    };

    const handleEmbeddedSignupMessage = (event) => {
      // Official Meta sample: only accept facebook.com origins for WA_EMBEDDED_SIGNUP
      const origin = String(event.origin || "");
      const isFacebookOrigin = /facebook\.com$/i.test(origin) || origin.endsWith(".facebook.com");

      if (isMetaOAuthPopupOrigin(event.origin)) {
        const data = event.data;
        if (!data || data.source !== META_POPUP_MESSAGE_SOURCE) return;

        processPopupPayload(data);
        return;
      }

      if (!isFacebookOrigin && !isAllowedMetaMessageOrigin(event.origin)) {
        return;
      }

      let data = event.data;
      if (typeof data === "string") {
        const codeFromString = parseCodeFromEventString(data);
        if (codeFromString) {
          submitEmbeddedSignupCode(
            codeFromString,
            "Meta signup completed. Finalizing WhatsApp connection..."
          );
          return;
        }
        try {
          data = JSON.parse(data);
        } catch (_) {
          return;
        }
      }

      if (!data || data.type !== WA_EMBEDDED_SIGNUP_EVENT) return;

      logEmbeddedSignupClient(
        "ES_CLIENT_WA_EMBEDDED_SIGNUP_POSTMESSAGE",
        { method: "postMessage", url: String(event?.origin || "") },
        null,
        {
          event: data.event || null,
          type: data.type,
          hasCode: Boolean(extractEmbeddedSignupCode(data)),
          wabaId:
            data?.whatsapp_business_account_id ||
            data?.data?.waba_id ||
            data?.data?.whatsapp_business_account_id ||
            null,
          phoneNumberId: data?.phone_number_id || data?.data?.phone_number_id || null,
        }
      );

      const embeddedEvent = String(data.event || "").toUpperCase();
      const embeddedCode = extractEmbeddedSignupCode(data);
      const wabaId = String(
        data?.whatsapp_business_account_id || data?.data?.waba_id || data?.data?.whatsapp_business_account_id || ""
      ).trim();
      const phoneNumberId = String(
        data?.phone_number_id || data?.data?.phone_number_id || ""
      ).trim();

      if (wabaId) {
        setWaStatus((prev) => ({
          ...(prev && typeof prev === "object" ? prev : {}),
          wabaId,
          phoneNumberId: phoneNumberId || prev?.phoneNumberId || null,
        }));
      }

      if (embeddedCode) {
        cleanupMetaPopup();
        submitEmbeddedSignupCode(
          embeddedCode,
          "Meta signup completed. Finalizing WhatsApp connection..."
        );
        return;
      }

      if (embeddedEvent === "FINISH") {
        cleanupMetaPopup();
        setRegErr("");
        setRegOk("Meta signup completed. Finalizing WhatsApp connection...");
        refreshConnectionStatus().then((status) => {
          if (isWhatsAppConnected(status)) {
            stopSignupWatchdogRef.current?.();
            presentSignupSuccessThenRedirect(
              status?.message || "WhatsApp Business connected successfully.",
              status
            );
          }
        });
        return;
      }

      const phoneNumber = String(
        data?.phone_number ||
          data?.phoneNumber ||
          data?.data?.phone_number ||
          data?.data?.phoneNumber ||
          data?.data?.display_phone_number ||
          ""
      )
        .replace(/\D/g, "")
        .trim();
      if (wabaId || phoneNumberId) {
        setRegErr("");
        setRegOk("Meta signup completed. Finalizing WhatsApp connection...");
        console.log("[Meta embedded signup] WABA resolved from SDK postMessage", {
          wabaId: wabaId || null,
          phoneNumberId: phoneNumberId || null,
          phoneNumber: phoneNumber || "(empty)",
        });
        return;
      }

      if (embeddedEvent === "CANCEL") {
        const currentStep = String(data?.data?.current_step || "").trim();
        setEmbeddedSignupActive(false);
        cleanupMetaPopup();
        setRegBusy(false);
        setRegOk("");
        setRegErr(
          currentStep
            ? `WhatsApp signup was closed at ${currentStep.replace(/_/g, " ").toLowerCase()}.`
            : "WhatsApp signup was cancelled."
        );
      }
    };

    const handlePopupStorage = (event) => {
      if (event.key !== META_POPUP_STORAGE_KEY || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue);
        processPopupPayload(payload);
      } catch (_) {
        // Ignore malformed storage payloads.
      }
      try {
        localStorage.removeItem(META_POPUP_STORAGE_KEY);
      } catch (_) {
        /* ignore */
      }
    };

    window.addEventListener("message", handleEmbeddedSignupMessage);
    window.addEventListener("storage", handlePopupStorage);
    return () => {
      window.removeEventListener("message", handleEmbeddedSignupMessage);
      window.removeEventListener("storage", handlePopupStorage);
    };
  }, [cleanupMetaPopup, presentSignupSuccessThenRedirect, refreshConnectionStatus]);

  useEffect(() => {
    if (!liveStatusChecked || !clientId) return;
    const pack = clientId ? readWaMetaLivePack(clientId, effectiveProjectId) : null;
    if (
      !(waStatus?.onboardingCompleted || onboardingMessage.length > 0 || pack?.snapshot?.onboardingCompleted)
    )
      return;

    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get("/projects/list");
        const projects = Array.isArray(res?.data?.projects) ? res.data.projects : [];
        const pidPrefer =
          effectiveProjectId != null && Number(effectiveProjectId) > 0
            ? effectiveProjectId
            : linkedProjectIdOAuth
              ? Number(linkedProjectIdOAuth)
              : null;
        let picked = null;
        if (pidPrefer != null && Number.isInteger(pidPrefer)) {
          picked = projects.find((p) => Number(p?.id) === pidPrefer);
        }
        if (!picked) {
          try {
            const sp = JSON.parse(localStorage.getItem("selectedProject") || "null");
            const sid = sp?.id != null ? Number(sp.id) : null;
            if (sid != null) picked = projects.find((p) => Number(p?.id) === sid);
          } catch (_) {
            /* ignore */
          }
        }
        const phone = String(picked?.whatsappNumber || "").trim();
        const pname = String(picked?.project_name || "").trim();
        if (!cancelled) {
          setProjectListPhone(phone);
          setProjectListName(pname);
        }
      } catch (_) {
        if (!cancelled) {
          setProjectListPhone("");
          setProjectListName("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    liveStatusChecked,
    clientId,
    waStatus?.onboardingCompleted,
    onboardingMessage,
    linkedProjectIdOAuth,
    effectiveProjectId,
  ]);

  const submitCloudRegistration = async () => {
    if (!/^\d{6}$/.test(String(regPin).trim())) {
      setRegErr("Use a 6-digit numeric two-step verification PIN (set in Meta / WhatsApp Manager, or pick a new one for first-time registration).");
      return;
    }
    setRegBusy(true);
    setRegErr("");
    setRegOk("");
    try {
      const res = await fetch(`${API_BASE}/meta/register-phone`, {
        method: "POST",
        headers: authApiHeadersJson(),
        body: JSON.stringify({ pin: String(regPin).trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setRegErr(data?.message || "Cloud API registration failed.");
        return;
      }
      setRegOk("Registered with Meta. Refreshing status…");
      await refreshConnectionStatus();
      setRegOk("Done. In WhatsApp Manager the number should move to Connected / Verified once Meta finishes processing.");
    } catch (e) {
      setRegErr(e?.message || "Network error");
    } finally {
      setRegBusy(false);
    }
  };

  const requestMetaPhoneOtp = async () => {
    setRegBusy(true);
    setRegErr("");
    setRegOk("");
    try {
      const res = await fetch(`${API_BASE}/meta/request-phone-code`, {
        method: "POST",
        headers: authApiHeadersJson(),
        body: JSON.stringify({ code_method: "SMS", language: "en_US" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setRegErr(data?.message || "Could not send verification SMS (Meta may not require this step yet).");
        return;
      }
      setRegOk("If Meta supports SMS verification for this number, check the phone inbox for a code.");
    } catch (e) {
      setRegErr(e?.message || "Network error");
    } finally {
      setRegBusy(false);
    }
  };

  const verifyMetaPhoneOtp = async () => {
    const trimmed = String(otpCode || "").trim();
    if (!/^\d{4,8}$/.test(trimmed)) {
                      setRegErr("Enter the OTP code Meta sent (4-8 digits).");
      return;
    }
    setRegBusy(true);
    setRegErr("");
    setRegOk("");
    try {
      const res = await fetch(`${API_BASE}/meta/verify-phone-code`, {
        method: "POST",
        headers: authApiHeadersJson(),
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setRegErr(data?.message || "OTP verification failed.");
        return;
      }
      setRegOk("Code accepted. Continue with PIN registration below if Meta still asks for two-step PIN.");
      await refreshConnectionStatus();
    } catch (e) {
      setRegErr(e?.message || "Network error");
    } finally {
      setRegBusy(false);
    }
  };

  const consumeMetaPopupStorageResult = useCallback(() => {
    try {
      const raw = localStorage.getItem(META_POPUP_STORAGE_KEY);
      if (!raw) return false;
      const payload = JSON.parse(raw);
      localStorage.removeItem(META_POPUP_STORAGE_KEY);
      metaPopupResultHandlerRef.current?.(payload);
      return true;
    } catch (_) {
      return false;
    }
  }, []);

  const completeMetaOnboardWithCode = useCallback(
    async (code, projectIdForOnboard) => {
      const cid = readClientIdFromStorage();
      if (!cid || !code) return;

      setRegErr("");
      setRegOk("Meta signup completed. Finalizing WhatsApp connection...");

      try {
        const onboardBody = {
          code,
          client_id: cid,
          redirect_uri: "",
          projectId:
            projectIdForOnboard != null && Number(projectIdForOnboard) > 0
              ? Number(projectIdForOnboard)
              : null,
        };
        logEmbeddedSignupClient(
          "ES_CLIENT_META_ONBOARD",
          { method: "POST", url: `${API_BASE}/meta/onboard` },
          { ...onboardBody, codeLength: String(code).length, code: undefined },
          { status: "requesting" }
        );
        const res = await fetch(`${API_BASE}/meta/onboard`, {
          method: "POST",
          headers: authApiHeadersJson(),
          body: JSON.stringify(onboardBody),
        });
        const data = await res.json().catch(() => ({}));
        logEmbeddedSignupClient(
          "ES_CLIENT_META_ONBOARD",
          { method: "POST", url: `${API_BASE}/meta/onboard` },
          { client_id: cid, projectId: onboardBody.projectId, redirect_uri: "" },
          { httpStatus: res.status, ...data }
        );
        if (!res.ok || !data?.success) {
          throw new Error(
            data?.message || data?.error || "Failed to complete WhatsApp onboarding."
          );
        }
        const refreshed = await refreshConnectionStatus();
        const linkedNow =
          isWhatsAppConnected(refreshed) ||
          isWhatsAppConnected(data?.verification) ||
          isWhatsAppConnected(data?.data) ||
          Boolean(data?.whatsappConnected || data?.metaLinked);
        if (!linkedNow) {
          setRegErr(
            refreshed?.reason ||
              "Meta sign-in completed but WhatsApp is not linked yet — check server logs."
          );
          return;
        }
        const pname = (() => {
          try {
            const sp = JSON.parse(localStorage.getItem("selectedProject") || "null");
            return String(sp?.project_name || sp?.name || "").trim();
          } catch (_) {
            return "";
          }
        })();
        const banner = pname
          ? defaultProjectLiveBanner(pname)
          : "WhatsApp Business connected successfully.";
        const params = new URLSearchParams();
        params.set("onboardingMessage", banner);
        if (projectIdForOnboard != null && Number(projectIdForOnboard) > 0) {
          params.set("linkedProjectId", String(projectIdForOnboard));
        }
        params.set("onboardingOk", "1");
        navigate(`/connect-whatsapp?${params.toString()}`, { replace: true });
      } catch (e) {
        setShowSignupSuccessScreen(false);
        setRegOk("");
        setRegErr(e?.message || "Failed to complete WhatsApp onboarding.");
      } finally {
        setEmbeddedSignupActive(false);
        setRegBusy(false);
        embeddedSignupCodeHandlerRef.current = null;
      }
    },
    [API_BASE, navigate, refreshConnectionStatus]
  );

  const launchWhatsAppSignup = async () => {
    const cid = readClientIdFromStorage();
    if (!cid) {
      setRegErr("Please log in again before connecting WhatsApp.");
      return;
    }
    if (!META_EMBEDDED_CONFIG_ID) {
      setRegErr("Meta Embedded Signup config_id is missing. Set REACT_APP_META_CONFIG_ID.");
      return;
    }

    let projectId = null;
    let projectName = "";
    try {
      const selectedProject = JSON.parse(localStorage.getItem("selectedProject") || "null");
      const pid = selectedProject?.id != null ? Number(selectedProject.id) : null;
      if (Number.isInteger(pid) && pid > 0) projectId = pid;
      projectName = String(
        selectedProject?.project_name || selectedProject?.name || ""
      ).trim();
    } catch (_) {
      /* ignore */
    }

    setEmbeddedSignupActive(true);
    setRegBusy(true);
    setRegErr("");
    setRegOk("Creating business & project, then opening Meta Signup…");
    cleanupMetaPopup();

    try {
      const user = JSON.parse(localStorage.getItem("user") || "null");
      const onboardPayload = {
        companyName: user?.name || "",
        email: user?.email || "",
        mobile: user?.mobileNumber || "",
        projectId,
        projectName,
        returnOrigin: String(window.location?.origin || "").trim(),
      };
      logEmbeddedSignupClient(
        "ES_CLIENT_CONNECT_WHATSAPP",
        { method: "POST", url: "/api/onboarding/connect-whatsapp" },
        onboardPayload,
        { status: "requesting" }
      );
      const onboard = await connectWhatsAppOnboarding(onboardPayload);
      logEmbeddedSignupClient(
        "ES_CLIENT_CONNECT_WHATSAPP",
        { method: "POST", url: "/api/onboarding/connect-whatsapp" },
        onboardPayload,
        onboard
      );
      if (onboard?.localProjectId) {
        projectId = Number(onboard.localProjectId) || projectId;
      }

      const solutionId = String(
        onboard?.solutionId || META_SOLUTION_ID || ""
      ).trim();
      if (!solutionId) {
        throw new Error(
          "Path A blocked: Meta Solution ID missing. Set REACT_APP_META_SOLUTION_ID / META_SOLUTION_ID for AiSensy partner billing."
        );
      }

      // Path A: FB.login + config_id + extras.setup.solutionID (AiSensy partner billing)
      const runFbLogin = () =>
        new Promise((resolve, reject) => {
          if (!window.FB || typeof window.FB.login !== "function") {
            reject(new Error("Facebook SDK not ready"));
            return;
          }
          embeddedSignupCodeHandlerRef.current = (code) => {
            completeMetaOnboardWithCode(code, projectId);
          };
          const loginOptions = buildFbEmbeddedSignupLoginOptions(solutionId);
          logEmbeddedSignupClient(
            "ES_CLIENT_FB_LOGIN",
            { method: "FB.login", url: "facebook-sdk" },
            loginOptions,
            { status: "opening" }
          );
          window.FB.login((response) => {
            logEmbeddedSignupClient(
              "ES_CLIENT_FB_LOGIN",
              { method: "FB.login", url: "facebook-sdk" },
              loginOptions,
              {
                status: response?.status || null,
                hasCode: Boolean(response?.authResponse?.code),
                codeLength: response?.authResponse?.code
                  ? String(response.authResponse.code).length
                  : 0,
                authResponseKeys: response?.authResponse
                  ? Object.keys(response.authResponse)
                  : [],
              }
            );
            if (response?.authResponse?.code) {
              const code = response.authResponse.code;
              completeMetaOnboardWithCode(code, projectId);
              resolve(response);
              return;
            }
            if (response?.status === "unknown" || !response?.authResponse) {
              setEmbeddedSignupActive(false);
              setRegBusy(false);
              setRegOk("");
              setRegErr("Meta signup was cancelled or failed. Please try again.");
              embeddedSignupCodeHandlerRef.current = null;
              resolve(response);
              return;
            }
            resolve(response);
          }, loginOptions);
        });

      if (fbSdkReady && window.FB?.login) {
        setRegOk("Opening Meta Embedded Signup…");
        await runFbLogin();
        return;
      }

      // Fallback: OAuth URL from backend (still includes solutionID in extras)
      const signupUrl = onboard?.signupUrl || onboard?.embeddedSignupUrl;
      if (!signupUrl) {
        throw new Error(onboard?.message || "No embedded signup URL returned");
      }
      setRegOk("Facebook SDK not ready — redirecting to Meta Signup…");
      window.location.href = signupUrl;
    } catch (e) {
      setEmbeddedSignupActive(false);
      setRegBusy(false);
      setRegOk("");
      setRegErr(
        e?.response?.data?.message ||
          e?.message ||
          "Could not start WhatsApp onboarding."
      );
    }
  };

  const launchSignupRef = useRef(launchWhatsAppSignup);
  launchSignupRef.current = launchWhatsAppSignup;

  const autoConnectRequested = useMemo(() => {
    const q = new URLSearchParams(location.search || "");
    const v = String(q.get("autoConnect") || "").toLowerCase();
    return v === "1" || v === "true" || v === "yes";
  }, [location.search]);

  const autoConnectStartedRef = useRef(false);

  useEffect(() => {
    if (!autoConnectRequested || autoConnectStartedRef.current || !liveStatusChecked) return;
    if (waStatus && isWhatsAppConnected(waStatus)) return;
    autoConnectStartedRef.current = true;
    window.setTimeout(() => launchSignupRef.current?.(), 300);
  }, [autoConnectRequested, liveStatusChecked, waStatus]);

  useEffect(() => {
    return () => {
      if (signupWatchdogIntervalRef.current) {
        window.clearInterval(signupWatchdogIntervalRef.current);
        signupWatchdogIntervalRef.current = null;
      }
      if (signupWatchdogTimeoutRef.current) {
        window.clearTimeout(signupWatchdogTimeoutRef.current);
        signupWatchdogTimeoutRef.current = null;
      }
      cleanupMetaPopup();
    };
  }, [cleanupMetaPopup]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const cid = readClientIdFromStorage();
      if (!cid) {
        if (!cancelled) {
          setWaStatus(null);
          setLiveStatusChecked(true);
        }
        return;
      }
      await checkWhatsAppConnection();
      if (!cancelled) setLiveStatusChecked(true);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [clientId, checkWhatsAppConnection, location.pathname, location.key]);

  useEffect(() => {
    if (!onboardingMessage || !clientId) return;
    checkWhatsAppConnection();
  }, [onboardingMessage, clientId, checkWhatsAppConnection]);

  const showProjectLiveBanner =
    Boolean(congratulationsMessage) &&
    (onboardingOk || onboardingBannerText.length > 0 || Boolean(congratRedirect));

  return (
    <div className="relative h-screen overflow-hidden bg-gray-50">
      <div
        className={`flex h-full flex-col transition-all duration-300 ${
          embeddedSignupActive ? "scale-[0.995] blur-[4px]" : ""
        }`}
      >
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2.5 rounded-xl hover:bg-gray-100/80 active:scale-95 transition lg:hidden"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link to="/dashboard" className="flex items-center gap-3 transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] shrink-0"><BrandLogoMark size="md" />
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent hidden sm:block">
              Waabizx
            </h1>
          </Link>

          <span className="text-gray-300 hidden md:block shrink-0">|</span>
          <h2 className="text-lg font-semibold text-sky-700 hidden md:block tracking-tight">Connect WhatsApp</h2>
          <AdminHeaderProjectSwitch />
        </div>

        <HeaderRightActions>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/35 hover:shadow-lg hover:ring-2 ring-sky-300/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none"
          >
            <span className="text-white font-semibold text-sm">{userInitial}</span>
          </button>
        </HeaderRightActions>
      </header>

      <div className="flex flex-1 min-h-0">
        <AppShellSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
          <MainSidebarNav onNavigate={() => setSidebarOpen(false)} />
        </AppShellSidebar>

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
          <div className="relative isolate min-h-full flex items-center justify-center p-4 md:p-8 lg:p-10">
            <div className="pointer-events-none absolute inset-0 overflow-hidden -z-10" aria-hidden>
              <div className="absolute -top-28 -right-20 w-[22rem] h-[22rem] bg-sky-400/30 motion-page-blob" />
              <div className="absolute -bottom-36 -left-24 w-[20rem] h-[20rem] bg-blue-400/25 motion-page-blob motion-page-blob--b" />
            </div>

            <div className="motion-enter w-full max-w-md relative z-0">
              <div className="group relative motion-card-rich motion-hover-lift rounded-2xl border border-gray-100/90 bg-white/95 backdrop-blur-sm p-8 md:p-10 text-center shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 overflow-hidden">
                <span className="motion-card-shine pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
                  <span className="motion-card-shine__beam absolute inset-0" />
                </span>

                <div className="relative mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 shadow-lg shadow-sky-500/35 ring-2 ring-white">
                  <svg className="h-8 w-8 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </div>

                <h1 className="relative text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
                  {showProjectLiveBanner || onboardingOk
                    ? "WhatsApp Business API Status"
                    : "WhatsApp Business"}
                </h1>
                {!liveStatusChecked && clientId ? (
                  <p className="relative mt-4 text-sm text-gray-500">Checking WhatsApp connection status...</p>
                ) : liveStatusChecked && !clientId ? (
                  <p className="relative mt-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                    Log in and select a project to check your Meta connection.
                  </p>
                ) : liveStatusChecked && graphErr && onboardingOk ? (
                  <div className="relative mt-4 space-y-3 text-left">
                    <p className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-900">
                      Could not read phone status from Meta: {graphErr}. Try reconnecting Meta or check your access
                      token.
                    </p>
                    <button
                      type="button"
                      onClick={refreshConnectionStatus}
                      className="w-full rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-amber-900 hover:bg-amber-50 transition"
                    >
                      Retry status check
                    </button>
                  </div>
                ) : liveStatusChecked && onboardingOk && needsCloudReg ? (
                  <div className="relative mt-4 space-y-4 text-left">
                    <div className="rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm text-amber-950 leading-relaxed">
                      <p className="font-semibold">Finish Cloud API registration</p>
                      <p className="mt-1 text-amber-900/90">
                        Meta shows this number as pending until it is registered via the{' '}
                        <code className="text-xs bg-amber-100/80 px-1 rounded">{`POST /phone_number_id/register`}</code>{' '}
                        call using your 6-digit two-step PIN.
                      </p>
                      {waStatus?.phoneNumberId || displayPhoneLine ? (
                        <p className="mt-2 text-xs text-amber-800/90">
                          Linked number ID: <span className="font-mono">{waStatus?.phoneNumberId || '—'}</span>
                          {displayPhoneLine ? (
                            <>
                              {' '}
                              — display: <span className="font-semibold">{displayPhoneLine}</span>
                            </>
                          ) : null}
                          {waStatus?.codeVerificationStatus ? (
                            <>
                              {' '}
                              — verification status:{' '}
                              <span className="font-semibold">{waStatus.codeVerificationStatus}</span>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                        6-digit two-step PIN for Cloud API registration
                      </label>
                      <PasswordInput
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        autoComplete="one-time-code"
                        placeholder="●●●●●●"
                        value={regPin}
                        onChange={(ev) => setRegPin(ev.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-center text-lg font-mono tracking-widest text-gray-900 focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={regBusy || regPin.length !== 6}
                      onClick={submitCloudRegistration}
                      className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-5 py-3 text-sm font-semibold text-white shadow-md disabled:opacity-50 disabled:pointer-events-none hover:opacity-95 transition"
                    >
                      {regBusy ? "Working…" : "Complete Cloud API registration"}
                    </button>
                    <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-3 space-y-2">
                      <p className="text-xs font-semibold text-gray-700">If Meta sent an SMS / voice OTP first</p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button
                          type="button"
                          disabled={regBusy}
                          onClick={requestMetaPhoneOtp}
                          className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Request SMS code
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="OTP"
                          value={otpCode}
                          onChange={(ev) => setOtpCode(ev.target.value.replace(/\D/g, '').slice(0, 8))}
                          className="sm:w-28 rounded-lg border border-gray-200 px-2 py-2 text-sm text-center font-mono"
                        />
                        <button
                          type="button"
                          disabled={regBusy || otpCode.length < 4}
                          onClick={verifyMetaPhoneOtp}
                          className="flex-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
                        >
                          Verify OTP
                        </button>
                      </div>
                    </div>
                    {regErr ? (
                      <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        {regErr}
                      </p>
                    ) : null}
                    {regOk ? (
                      <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                        {regOk}
                      </p>
                    ) : null}
                    <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                      WhatsApp is linked. Complete Cloud API registration above if required, then send messages from the dashboard.
                    </p>
                  </div>
                ) : liveStatusChecked && congratulationsMessage && !onboardingOk ? (
                  <div className="relative mt-4 space-y-4 text-center">
                    <p className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm md:text-base font-semibold text-emerald-900 leading-relaxed text-left">
                      {congratulationsMessage}
                    </p>
                    <p className="text-sm text-gray-500">
                      Confirming your WhatsApp link for this project. If this takes more than a moment, tap refresh.
                    </p>
                    <button
                      type="button"
                      onClick={() => refreshConnectionStatus()}
                      className="w-full rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-900 hover:bg-sky-100 transition"
                    >
                      Refresh status
                    </button>
                  </div>
                ) : fullyReady || congratRedirect ? (
                  <div className="relative mt-4 space-y-5">
                    <p className="relative rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm md:text-base font-semibold text-emerald-900 leading-relaxed text-left">
                      {congratulationsMessage ||
                        "Your WhatsApp Business account is connected. You can continue with the further process."}
                    </p>
                    {displayPhoneLine ? (
                      <p className="text-center text-lg font-semibold text-emerald-700 tabular-nums">{displayPhoneLine}</p>
                    ) : null}
                    <div className="flex flex-col items-center gap-3 pt-2">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                        WhatsApp Business API Status
                      </span>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 ring-2 ring-emerald-200/80">
                          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" aria-hidden />
                          LIVE
                        </span>
                        {waStatus?.creditLineAttached || waStatus?.paymentMethodReady ? (
                          <span className="inline-flex items-center gap-2 rounded-full bg-sky-50 px-4 py-2 text-sm font-bold text-sky-800 ring-2 ring-sky-200/80">
                            AiSensy credit line attached
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="text-xs text-center text-emerald-700">
                      Open the dashboard to send messages.
                    </p>
                    <p className="text-xs text-center text-gray-500">
                      This number is connected for this project. Continue from the dashboard to send messages.
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="relative mt-3 text-sm md:text-base text-gray-600 leading-relaxed">
                      Sign in with Meta to connect your WhatsApp Business account.
                    </p>
                    {autoConnectRequested && (regBusy || embeddedSignupActive) ? (
                      <p className="relative mt-3 text-sm text-sky-700 bg-sky-50 border border-sky-100 rounded-lg px-3 py-2">
                        Opening Meta Embedded Signup… complete Facebook login, WABA setup, and phone verification in the popup.
                      </p>
                    ) : null}

                    <button
                      type="button"
                      onClick={launchWhatsAppSignup}
                      disabled={regBusy}
                      className="group/btn relative mt-8 w-full overflow-hidden rounded-xl bg-gradient-to-r from-sky-600 via-sky-500 to-blue-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-sky-600/30 transition-all duration-300 hover:shadow-xl hover:shadow-sky-500/35 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-sky-400/50 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                      <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 translate-x-[-100%] group-hover/btn:translate-x-[100%] transition-transform duration-700" aria-hidden />
                      <span className="relative flex items-center justify-center gap-2">
                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                        {regBusy ? "Connecting…" : !fbSdkReady ? "Loading Facebook SDK…" : "Connect WhatsApp"}
                      </span>
                    </button>
                    {regErr ? (
                      <p className="relative mt-4 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-left">
                        {regErr}
                      </p>
                    ) : null}
                    {regOk ? (
                      <p className="relative mt-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-left">
                        {regOk}
                      </p>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
      </div>
      {embeddedSignupActive && (
        <div className="pointer-events-none absolute inset-0 z-20 bg-slate-950/10 backdrop-blur-[3px]" />
      )}
      {showSignupSuccessScreen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="signup-success-title"
        >
          <div className="motion-enter w-full max-w-md rounded-2xl border border-emerald-100/90 bg-white/95 p-8 text-center shadow-2xl shadow-emerald-900/10 ring-1 ring-emerald-100/80">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-2 ring-emerald-200/80">
              <svg className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 id="signup-success-title" className="text-xl font-bold text-gray-900">
              Connected successfully
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              {regOk || "Your WhatsApp Business account is now linked."}
            </p>
            <p className="mt-4 text-xs text-gray-500">Redirecting to your connection status…</p>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  useEffect(() => {
    if (window.__projectScopedFetchPatched) return;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      try {
        const raw = localStorage.getItem("selectedProject");
        const selectedProject = raw ? JSON.parse(raw) : null;
        const projectId = selectedProject?.id;
        if (projectId != null && String(projectId).trim() !== "") {
          const headers = new Headers(init.headers || {});
          if (!headers.has("x-project-id")) {
            headers.set("x-project-id", String(projectId));
          }
          return originalFetch(input, { ...init, headers });
        }
      } catch (_) {}
      return originalFetch(input, init);
    };
    window.__projectScopedFetchPatched = true;
  }, []);

  return (
    <Router>
      <SessionExpiryGuard />
      <Routes>

        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        <Route
          path="/login/forgot-password"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />

        <Route
          path="/register"
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          }
        />

        <Route
          path="/register/verify-otp"
          element={
            <PublicRoute>
              <RegisterOtpVerification />
            </PublicRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin-dashboard"
          element={
            <ProtectedRoute>
              <DashboardRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <DashboardRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/user-dashboard"
          element={
            <ProtectedRoute>
              <DashboardRoute />
            </ProtectedRoute>
          }
        />

        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />

        <Route
          path="/campaigns"
          element={
            <ProtectedRoute>
              <ManagerPermissionRoute moduleKey="campaign">
                <Campaigns />
              </ManagerPermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/campaigns/create"
          element={
            <ProtectedRoute>
              <ManagerPermissionRoute moduleKey="campaign">
                <CreateCampaignPage />
              </ManagerPermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/broadcast"
          element={
            <ProtectedRoute>
              <ManagerPermissionRoute moduleKey="broadcast">
                <Broadcast />
              </ManagerPermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/templates"
          element={
            <ProtectedRoute>
              <ManagerPermissionRoute moduleKey="template">
                <Templates />
              </ManagerPermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/analytics"
          element={
            <ProtectedRoute>
              <ManagerPermissionRoute moduleKey="analytics">
                <Analytics />
              </ManagerPermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/contacts"
          element={
            <ProtectedRoute>
              <ManagerPermissionRoute moduleKey="contacts">
                <Contacts />
              </ManagerPermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/tags"
          element={
            <ProtectedRoute>
              <ManagerPermissionRoute moduleKey="manage">
                <TagsPage />
              </ManagerPermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/flows"
          element={
            <ProtectedRoute>
              <ManagerPermissionRoute moduleKey="flows">
                <Flows />
              </ManagerPermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/form"
          element={
            <ProtectedRoute>
              <FormsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/form/create"
          element={
            <ProtectedRoute>
              <FormBuilderPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/form/edit/:id"
          element={
            <ProtectedRoute>
              <FormBuilderPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/whatsapp-button"
          element={
            <ProtectedRoute>
              <WhatsAppButtonPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/rcs"
          element={
            <ProtectedRoute>
              <RcsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/manage"
          element={
            <ProtectedRoute>
              <ManagerPermissionRoute moduleKey="manage">
                <ManagePage />
              </ManagerPermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/agent-manage"
          element={
            <ProtectedRoute>
              <AgentManageCannedMessagesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/super-admin/*"
          element={
            <ProtectedRoute>
              <SuperAdminDashboardRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/superadmin-dashboard"
          element={
            <ProtectedRoute>
              <SuperAdminDashboardRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin-dashboard"
          element={
            <ProtectedRoute>
              <SuperAdminDashboardRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin/businesses"
          element={
            <ProtectedRoute>
              <SuperAdminDashboardRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin/blogs"
          element={
            <ProtectedRoute>
              <SuperAdminDashboardRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin/plans"
          element={
            <ProtectedRoute>
              <SuperAdminDashboardRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin/leads"
          element={
            <ProtectedRoute>
              <SuperAdminDashboardRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/super-admin/demos"
          element={
            <ProtectedRoute>
              <SuperAdminDashboardRoute />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admins"
          element={
            <ProtectedRoute>
              <SuperAdminDashboardRoute />
            </ProtectedRoute>
          }
        />

        <Route
          path="/live-chat"
          element={
            <ProtectedRoute>
              <LiveChatPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/campaign-reports"
          element={
            <ProtectedRoute>
              <HistoryPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <ManagerPermissionRoute moduleKey="reports">
                <ReportsComingSoonPage />
              </ManagerPermissionRoute>
            </ProtectedRoute>
          }
        />

        {/* Simple project login/dashboard demo (uses axios instance and projects API) */}
        <Route
          path="/project-login"
          element={
            <PublicRoute>
              <ProjectLogin />
            </PublicRoute>
          }
        />
        <Route
          path="/project-dashboard"
          element={<AdminDashboardRoute />}
        />
        <Route
          path="/agent-dashboard"
          element={<AgentDashboardRoute />}
        />
        <Route
          path="/agent"
          element={<AgentDashboardRoute />}
        />

        <Route
          path="/inbox"
          element={
            <ProtectedRoute>
              <ManagerPermissionRoute moduleKey="inbox">
                <Inbox />
              </ManagerPermissionRoute>
            </ProtectedRoute>
          }
        />

        <Route
          path="/chat-history"
          element={
            <ProtectedRoute>
              <ManagerPermissionRoute moduleKey="inbox">
                <Inbox pageMode="history" />
              </ManagerPermissionRoute>
            </ProtectedRoute>
          }
        />


        <Route
          path="/connect-whatsapp"
          element={
            <ProtectedRoute>
              <ConnectWhatsApp />
            </ProtectedRoute>
          }
        />

        <Route
          path="/public/blogs"
          element={
            <PublicRoute>
              <PublicBlogListPage />
            </PublicRoute>
          }
        />
        <Route
          path="/public/blogs/:id"
          element={
            <PublicRoute>
              <PublicBlogDetailPage />
            </PublicRoute>
          }
        />

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
        <Route path="/agent-chat" element={<AgentChatPage />} />

      </Routes>

      {/* Chatbot appears on all authenticated pages (except SuperAdmin) */}
      {String(localStorage.getItem("role") || "").toLowerCase() !== "super_admin" ? <Chatbot /> : null}

    </Router>
  );
}

export default App;