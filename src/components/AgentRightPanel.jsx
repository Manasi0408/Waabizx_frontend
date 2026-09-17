import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "../api/axios";
import { readSessionUser } from "../services/authService";
import { connectWhatsAppOnboarding } from "../services/onboardingService";
import { fetchActivePlans, fetchConversationMetrics } from "../services/planService";
import PlanSubscriptionView, { PlanGstBreakdown } from "./PlanSubscriptionView";
import { getApiOrigin, getApiUrl } from '../utils/apiBase';
import {
  PLAN_MONTHLY_DEFAULT,
  buildConversationMetrics,
  CONVERSATION_METRICS,
  formatConversationRateText,
  cycleBillingAmount,
  computeQuarterlyFromMonthly,
  computeYearlyFromMonthly,
  formatInr,
  formatUsd,
  formatPlanAmount,
  isInrCurrency,
  gstAmount,
  payableWithGst,
  resolvePayableAmount,
  resolvePlanBillingAmount,
} from "../utils/planPricing";
import {
  META_APP_ID,
  META_EMBEDDED_CONFIG_ID,
  META_SDK_VERSION,
  META_SOLUTION_ID,
  buildFbEmbeddedSignupLoginOptions,
  openMetaOAuthPopupWindow,
  readClientIdFromStorage,
  resolveMetaAppOrigin,
  sanitizeMetaOAuthUrl,
} from "../utils/metaWhatsAppConnect";

const PLAN_MONTHLY_PRICE = PLAN_MONTHLY_DEFAULT;

const buildFallbackCatalog = () => [
  {
    id: 1,
    slug: "standard",
    name: "Standard Project Plan",
    price_monthly: PLAN_MONTHLY_PRICE,
    price_quarterly: computeQuarterlyFromMonthly(PLAN_MONTHLY_PRICE),
    price_yearly: computeYearlyFromMonthly(PLAN_MONTHLY_PRICE),
    users_limit: 0,
    messages_limit: 0,
    features: [
      "Unlimited Agents",
      "Unlimited Campaigns",
      "Unlimited Templates",
      "Unlimited Flows",
      "Unlimited Contacts",
      "Multi Agent Live Chat",
    ],
    is_active: true,
    sort_order: 1,
  },
];

const wccGstAmount = gstAmount;
const wccPayableTotal = payableWithGst;
const WCC_DIRECT_PAYMENT_LIMIT = 3000;

const ADDON_PRICES = {
  INR: {
    flowBuilder: { monthly: 2499, quarterly: 7125, yearly: 24900 },
    agentSeat: { monthly: 450, quarterly: 1200, yearly: 4200 },
  },
  USD: {
    flowBuilder: { monthly: 33, quarterly: 95, yearly: 332 },
    agentSeat: { monthly: 6, quarterly: 16, yearly: 56 },
  },
};

const getAddonPrices = (cycle, currency) => {
  const key = isInrCurrency(currency) ? 'INR' : 'USD';
  const prices = ADDON_PRICES[key];
  return {
    flowBuilder: prices.flowBuilder[cycle] || prices.flowBuilder.monthly,
    agentSeat: prices.agentSeat[cycle] || prices.agentSeat.monthly,
  };
};

const COUNTRY_CODES = ["+971", "+91", "+65", "+44", "+1"];

/**
 * Razorpay Checkout expects contact as +{country}{number}.
 * Invalid / empty / sandbox WA contacts often block Test Mode netbanking after bank selection
 * (Live is more lenient). Prefer a valid Indian mobile: +91 + 10 digits.
 */
const toRazorpayPrefillContact = (raw) => {
  let digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  digits = digits.replace(/^0+/, "");
  if (digits.length >= 12 && digits.startsWith("91")) {
    digits = digits.slice(-10);
  } else if (digits.length > 10) {
    digits = digits.slice(-10);
  }
  if (digits.length !== 10) return "";
  // AiSensy / Meta sandbox sender — not a valid payer contact for Razorpay Test NB
  if (digits === "9810765443") return "";
  return `+91${digits}`;
};

const splitWhatsappNumber = (value = "", fallbackCountryCode = "+91") => {
  const cleaned = String(value || "").replace(/\s+/g, "");
  const fallback = String(fallbackCountryCode || "+91").trim();
  const fallbackDigits = fallback.replace(/\D/g, "");

  if (!cleaned) {
    return { countryCode: fallback || "+91", localNumber: "" };
  }

  const matchedCode = COUNTRY_CODES.find((code) => cleaned.startsWith(code));
  if (matchedCode) {
    return {
      countryCode: matchedCode,
      localNumber: cleaned.slice(matchedCode.length).replace(/\D/g, ""),
    };
  }

  const digits = cleaned.replace(/\D/g, "");
  if (fallbackDigits && digits.startsWith(fallbackDigits) && digits.length > fallbackDigits.length) {
    return {
      countryCode: fallback || "+91",
      localNumber: digits.slice(fallbackDigits.length),
    };
  }

  return {
    countryCode: fallback || "+91",
    localNumber: digits,
  };
};

const addMonthsIso = (fromDate, monthsToAdd) => {
  const d = new Date(fromDate);
  if (Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + Number(monthsToAdd || 0));
  return d.toISOString();
};

const WA_META_LIVE_PREFIX = "wa_wb_meta_live_";
const META_POPUP_STORAGE_KEY = "waabiz-meta-popup-result";
const META_POPUP_MESSAGE_SOURCE = "waabiz-meta-oauth-popup";
const WA_EMBEDDED_SIGNUP_EVENT = "WA_EMBEDDED_SIGNUP";

const extractEmbeddedSignupCode = (data) => {
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
};

const isMetaOAuthPopupOrigin = (origin) => {
  const value = String(origin || "").toLowerCase();
  if (value === String(window.location?.origin || "").toLowerCase()) return true;
  try {
    const callbackOrigin = String(resolveMetaAppOrigin() || "").toLowerCase();
    if (callbackOrigin && value === callbackOrigin) return true;
  } catch (_) {
    /* ignore */
  }
  return false;
};

const ensureFacebookSdk = () =>
  new Promise((resolve, reject) => {
    const initSdk = () => {
      if (!window.FB) return false;
      try {
        if (!window.__waabizFbSdkInitialized) {
          window.FB.init({
            appId: String(META_APP_ID),
            autoLogAppEvents: true,
            xfbml: true,
            version: META_SDK_VERSION,
          });
          window.__waabizFbSdkInitialized = true;
        }
      } catch (_) {
        window.__waabizFbSdkInitialized = true;
      }
      return typeof window.FB.login === "function";
    };

    if (initSdk()) {
      resolve();
      return;
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

    let attempts = 0;
    const poll = window.setInterval(() => {
      attempts += 1;
      if (initSdk()) {
        window.clearInterval(poll);
        resolve();
      } else if (attempts > 40) {
        window.clearInterval(poll);
        reject(new Error("Facebook SDK not ready"));
      }
    }, 300);
  });

const readMetaLiveFromStorage = (clientId, projectId = null) => {
  const cid = Number(clientId);
  const pid = projectId != null ? Number(projectId) : null;
  if (!Number.isInteger(cid) || cid <= 0 || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }

  try {
    const raw = localStorage.getItem(`${WA_META_LIVE_PREFIX}${cid}_p${pid}`);
    if (!raw) return false;
    const pack = JSON.parse(raw);
    return Boolean(pack?.snapshot?.onboardingCompleted);
  } catch (_) {
    return false;
  }
};

const PROJECT_PROFILE_PREFIX = "waabiz_project_profile_";
const WA_CONNECTED_PREFIX = "waabiz_wa_connected_";
const WA_DISPLAY_NAME_PREFIX = "waabiz_wa_display_name_";

const readWhatsAppConnectedLatch = (clientId, projectId) => {
  const cid = Number(clientId);
  const pid = Number(projectId);
  if (!Number.isInteger(cid) || cid <= 0 || !Number.isInteger(pid) || pid <= 0) return false;
  try {
    return localStorage.getItem(`${WA_CONNECTED_PREFIX}${cid}_p${pid}`) === "1";
  } catch (_) {
    return false;
  }
};

const writeWhatsAppConnectedLatch = (clientId, projectId) => {
  const cid = Number(clientId);
  const pid = Number(projectId);
  if (!Number.isInteger(cid) || cid <= 0 || !Number.isInteger(pid) || pid <= 0) return;
  try {
    localStorage.setItem(`${WA_CONNECTED_PREFIX}${cid}_p${pid}`, "1");
  } catch (_) {
    /* ignore */
  }
};

const readCachedWhatsappDisplayName = (projectId) => {
  const pid = Number(projectId);
  if (!Number.isInteger(pid) || pid <= 0) return "";
  try {
    return String(localStorage.getItem(`${WA_DISPLAY_NAME_PREFIX}${pid}`) || "").trim();
  } catch (_) {
    return "";
  }
};

const writeCachedWhatsappDisplayName = (projectId, name) => {
  const pid = Number(projectId);
  const value = String(name || "").trim();
  if (!Number.isInteger(pid) || pid <= 0 || !value) return;
  try {
    localStorage.setItem(`${WA_DISPLAY_NAME_PREFIX}${pid}`, value);
  } catch (_) {
    /* ignore */
  }
};

const parseOnboardingLiveFromStatus = (data, activeProjectId = null) => {
  const statusProjectId = data?.projectId != null ? Number(data.projectId) : null;
  const scopedProjectId =
    activeProjectId != null && String(activeProjectId).trim() !== ""
      ? Number(activeProjectId)
      : null;
  if (
    scopedProjectId &&
    statusProjectId &&
    statusProjectId !== scopedProjectId
  ) {
    return false;
  }
  return Boolean(
    data?.whatsappConnected === true ||
      data?.onboardingCompleted === true ||
      data?.metaLinked === true ||
      data?.cloudApiMessagingLikelyReady === true
  );
};

const clearWhatsAppConnectedLatch = (clientId, projectId) => {
  const cid = Number(clientId);
  const pid = Number(projectId);
  if (!Number.isInteger(cid) || cid <= 0 || !Number.isInteger(pid) || pid <= 0) return;
  try {
    localStorage.removeItem(`${WA_CONNECTED_PREFIX}${cid}_p${pid}`);
    localStorage.removeItem(`${WA_META_LIVE_PREFIX}${cid}_p${pid}`);
  } catch (_) {
    /* ignore */
  }
};

const extractWhatsappDisplayName = (payload) => {
  const row = Array.isArray(payload?.profileData) ? payload.profileData[0] : null;
  return String(
    payload?.displayName || row?.display_name || row?.verified_name || ""
  ).trim();
};

/** Build display URL: uploads/123.png → {apiOrigin}/uploads/123.png */
const toLogoSrc = (logo) => {
  const value = logo != null ? String(logo).trim() : "";
  if (!value) return "";
  if (
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    /^https?:\/\//i.test(value)
  ) {
    return value;
  }
  const origin = getApiOrigin();
  if (value.startsWith("uploads/")) return `${origin}/${value}`;
  if (value.startsWith("/uploads/")) return `${origin}${value}`;
  if (value.startsWith("/api/uploads/")) return `${origin}${value}`;
  if (value.startsWith("api/uploads/")) return `${origin}/${value}`;
  return value;
};

const readProjectProfile = (projectId) => {
  const pid = Number(projectId);
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try {
    const raw = localStorage.getItem(`${PROJECT_PROFILE_PREFIX}${pid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
};

const writeProjectProfile = (projectId, profile) => {
  const pid = Number(projectId);
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    localStorage.setItem(`${PROJECT_PROFILE_PREFIX}${pid}`, JSON.stringify(profile));
  } catch (_) {
    /* ignore */
  }
};

const resolveProjectLogo = (project, profile) => {
  const custom = profile?.logo != null ? String(profile.logo).trim() : "";
  if (custom) return custom;
  const candidates = [
    project?.logo,
    project?.project_logo,
    project?.logoUrl,
    project?.logo_url,
    project?.brand_logo,
    project?.brandLogo,
    project?.image,
    project?.image_url,
  ];
  for (const c of candidates) {
    const s = c != null ? String(c).trim() : "";
    if (s) return s;
  }
  return "";
};

const normalizeAccountMobileDigits = (u) => {
  let digits = String(u?.mobileNumber || u?.mobile_number || u?.phoneNumber || "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) return digits.slice(1);
  return digits;
};

const isIndianUserAccount = (u) => {
  const country = String(u?.country || "").trim().toUpperCase();
  if (country === "IN" || country === "IND" || country === "INDIA") return true;
  if (String(u?.currency || "").toUpperCase() === "INR") return true;

  const ccDigits = String(u?.countryCode || u?.country_code || "").replace(/\D/g, "");
  const mobileDigits = normalizeAccountMobileDigits(u);

  if (ccDigits === "91" && mobileDigits.length >= 10) return true;
  if (/^\d{10}$/.test(mobileDigits)) return true;

  return false;
};

const isInternationalUserAccount = (u) => {
  const country = String(u?.country || "").trim().toUpperCase();
  if (country && country !== "IN" && country !== "IND" && country !== "INDIA") return true;

  const ccRaw = String(u?.countryCode || u?.country_code || "").trim();
  const ccDigits = ccRaw.replace(/\D/g, "");
  if (ccRaw && ccDigits !== "91") return true;

  return false;
};

const resolveUserPricingCurrency = (u, apiCurrency = null) => {
  if (isIndianUserAccount(u)) return "INR";
  if (isInternationalUserAccount(u)) return "USD";

  const currency = String(u?.currency || "").toUpperCase();
  if (currency === "INR") return "INR";
  if (currency === "USD") return "USD";

  return "INR";
};

const normalizeCatalogPlanForCurrency = (plan, currency, discounts = null) => {
  if (!plan) return null;
  const isUsd = !isInrCurrency(currency);
  if (isUsd) {
    const monthly = Number(plan.price_monthly_usd) || Number(plan.price_monthly) || 10;
    const quarterly =
      Number(plan.price_quarterly_usd) ||
      Number(plan.price_quarterly) ||
      computeQuarterlyFromMonthly(monthly, discounts);
    const yearly =
      Number(plan.price_yearly_usd) ||
      Number(plan.price_yearly) ||
      computeYearlyFromMonthly(monthly, discounts);
    return {
      ...plan,
      currency: "USD",
      price_monthly: monthly,
      price_quarterly: quarterly,
      price_yearly: yearly,
    };
  }

  const monthlyUsd = Number(plan.price_monthly_usd) || 0;
  let monthly = Number(plan.price_monthly) || PLAN_MONTHLY_DEFAULT;
  const planTaggedUsd = String(plan.currency || "").toUpperCase() === "USD";
  const looksLikeUsdMonthly =
    monthly > 0 && monthly < 100 && (planTaggedUsd || (monthlyUsd > 0 && Math.abs(monthlyUsd - monthly) < 0.01));
  if (looksLikeUsdMonthly) {
    monthly = PLAN_MONTHLY_DEFAULT;
  }

  const quarterlyRaw = Number(plan.price_quarterly) || 0;
  const yearlyRaw = Number(plan.price_yearly) || 0;
  const quarterly =
    quarterlyRaw >= 100 && !looksLikeUsdMonthly
      ? quarterlyRaw
      : computeQuarterlyFromMonthly(monthly, discounts);
  const yearly =
    yearlyRaw >= 100 && !looksLikeUsdMonthly
      ? yearlyRaw
      : computeYearlyFromMonthly(monthly, discounts);

  return {
    ...plan,
    currency: "INR",
    price_monthly: monthly,
    price_quarterly: quarterly,
    price_yearly: yearly,
  };
};

const buildMetricsForCurrency = (metrics, rates, currency) => {
  if (isInrCurrency(currency)) {
    return buildConversationMetrics(metrics, rates);
  }
  return CONVERSATION_METRICS.map((metric) => ({
    key: metric.key,
    label: metric.label,
    rate: Number(metric.rate_usd ?? metric.rate) || 0,
    text: formatConversationRateText(metric.rate_usd ?? metric.rate, "USD"),
  }));
};

function AgentRightPanel({
  user = null,
  selectedProject = null,
  conversationQuota = null,
  loadingQuota = false,
  onRefreshConversationQuota,
  isWhatsAppApiLive = false,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const API_BASE = getApiOrigin();
  const API_URL = API_BASE;
  const [metaOnboardingLive, setMetaOnboardingLive] = useState(false);
  const [whatsappConnectedLatch, setWhatsappConnectedLatch] = useState(false);
  const [whatsappConnectBusy, setWhatsappConnectBusy] = useState(false);
  const metaPopupRef = useRef(null);
  const embeddedSignupCodeHandlerRef = useRef(null);

  const paymentJsonHeaders = () => {
    const token = localStorage.getItem("token");
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    const pid =
      selectedProject?.id != null && String(selectedProject.id).trim() !== ""
        ? String(selectedProject.id).trim()
        : null;
    if (pid) {
      headers["x-project-id"] = pid;
    } else {
      try {
        const raw = localStorage.getItem("selectedProject");
        const id = raw ? JSON.parse(raw)?.id : null;
        if (id != null && String(id).trim() !== "") headers["x-project-id"] = String(id).trim();
      } catch (e) {
        /* ignore */
      }
    }
    return headers;
  };

  const [showWccModal, setShowWccModal] = useState(false);
  const [showWccDirectPayModal, setShowWccDirectPayModal] = useState(false);
  const [showAdsModal, setShowAdsModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);

  const [wccAmount, setWccAmount] = useState(100);
  const [catalogPlans, setCatalogPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [conversationMetrics, setConversationMetrics] = useState([]);
  const [adsAmount, setAdsAmount] = useState(1500);
  const [autoRechargeEnabled, setAutoRechargeEnabled] = useState(false);
  const [autoRechargeAmount, setAutoRechargeAmount] = useState(500);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [projectWhatsappNumber, setProjectWhatsappNumber] = useState("");
  /** Same approval rule as ProjectCard: only then show the business line on the dashboard. */
  const [projectPhoneApproved, setProjectPhoneApproved] = useState(false);
  const [projectPhoneLoaded, setProjectPhoneLoaded] = useState(false);
  const [matchedProject, setMatchedProject] = useState(null);
  const [whatsappDisplayName, setWhatsappDisplayName] = useState(() =>
    readCachedWhatsappDisplayName(selectedProject?.id)
  );
  const [accountProfile, setAccountProfile] = useState(null);
  const [showAccountEditModal, setShowAccountEditModal] = useState(false);
  const [accountEditForm, setAccountEditForm] = useState({
    name: "",
    category: "",
    countryCode: "+91",
    phone: "",
    description: "",
    address: "",
    email: "",
    website: "",
    logo: "",
  });
  const logoFileInputRef = useRef(null);
  const [logoFile, setLogoFile] = useState(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);
  const [planInfo, setPlanInfo] = useState(null);
  const pricingUser = useMemo(
    () => ({ ...(readSessionUser() || {}), ...(user || {}) }),
    [user]
  );
  const [pricingCurrency, setPricingCurrency] = useState(() => resolveUserPricingCurrency(pricingUser));
  const [planDiscounts, setPlanDiscounts] = useState(null);

  const [planStep, setPlanStep] = useState(1);
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [selectedPlan, setSelectedPlan] = useState("standard");
  const [flowBuilderEnabled, setFlowBuilderEnabled] = useState(false);
  const [agentSeatCount, setAgentSeatCount] = useState(0);

  useEffect(() => {
    setPricingCurrency(resolveUserPricingCurrency(pricingUser));
  }, [
    pricingUser?.currency,
    pricingUser?.country,
    pricingUser?.countryCode,
    pricingUser?.country_code,
    pricingUser?.mobileNumber,
    pricingUser?.mobile_number,
    pricingUser?.phoneNumber,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPlansLoading(true);
      try {
        const [plansResult, metricsData] = await Promise.all([
          fetchActivePlans(),
          fetchConversationMetrics().catch(() => ({ metrics: [], rates: {}, currency: "INR" })),
        ]);
        if (!cancelled) {
          const list = Array.isArray(plansResult?.plans) ? plansResult.plans : [];
          const resolvedCurrency = resolveUserPricingCurrency(
            pricingUser,
            plansResult.currency || metricsData.currency
          );
          setPricingCurrency(resolvedCurrency);
          setPlanDiscounts(plansResult.discounts || null);
          const active = list.filter((p) => p.is_active !== false);
          const sorted = (active.length ? active : list).slice().sort(
            (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
          );
          const primary = sorted[0];
          setCatalogPlans(primary ? [primary] : buildFallbackCatalog());
          setConversationMetrics(
            buildMetricsForCurrency(metricsData.metrics, metricsData.rates, resolvedCurrency)
          );
        }
      } catch {
        if (!cancelled) setCatalogPlans(buildFallbackCatalog());
      } finally {
        if (!cancelled) setPlansLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pricingUser?.id, pricingUser?.country, pricingUser?.mobileNumber, pricingUser?.mobile_number, pricingUser?.currency]);

  useEffect(() => {
    const selectedProjectId = Number(selectedProject?.id);
    if (!Number.isInteger(selectedProjectId) || selectedProjectId <= 0) {
      setProjectWhatsappNumber("");
      setProjectPhoneApproved(false);
      setMatchedProject(null);
      setWhatsappDisplayName("");
      setWhatsappConnectedLatch(false);
      setAccountProfile(null);
      setProjectPhoneLoaded(true);
      return;
    }

    const savedProfile = readProjectProfile(selectedProjectId);
    setAccountProfile(savedProfile);
    setWhatsappDisplayName(readCachedWhatsappDisplayName(selectedProjectId));
    setWhatsappConnectedLatch(false);
    setMetaOnboardingLive(false);
    setLogoFile(null);
    setLogoRemoved(false);

    let mounted = true;
    (async () => {
      if (mounted) setProjectPhoneLoaded(false);
      try {
        try {
          const profileRes = await axios.get("/profile", {
            params: { projectId: selectedProjectId },
          });
          const serverProfile = profileRes?.data?.profile;
          if (mounted && serverProfile) {
            const normalized = {
              name: serverProfile.name || "",
              category: serverProfile.category || "",
              countryCode: serverProfile.countryCode || "+91",
              phone: serverProfile.phone || "",
              description: serverProfile.description || "",
              address: serverProfile.address || "",
              email: serverProfile.email || "",
              website: serverProfile.website || "",
              logo: serverProfile.logo || "",
              updatedAt: new Date().toISOString(),
            };
            setAccountProfile(normalized);
            writeProjectProfile(selectedProjectId, normalized);
          }
        } catch (_) {
          /* keep local cache if profile API fails */
        }

        try {
          const waProfileRes = await axios.get("/profile/whatsapp", {
            params: { projectId: selectedProjectId },
            headers: { "x-project-id": String(selectedProjectId) },
          });
          const metaDisplayName = extractWhatsappDisplayName(waProfileRes?.data);
          if (mounted && metaDisplayName) {
            setWhatsappDisplayName(metaDisplayName);
            writeCachedWhatsappDisplayName(selectedProjectId, metaDisplayName);
          }
        } catch (_) {
          /* keep cached display name on transient API errors */
        }

        const res = await axios.get("/projects/list");
        const projects = Array.isArray(res?.data?.projects) ? res.data.projects : [];
        const matched = projects.find((p) => Number(p?.id) === selectedProjectId);
        const statusNorm = String(matched?.status || "").toLowerCase();
        const isApproved =
          matched?.whatsappApproved === true ||
          ["approved", "active", "live", "verified"].includes(statusNorm);
        const trimStr = (v) =>
          v != null && String(v).trim() !== "" ? String(v).trim() : "";
        const waNum = trimStr(matched?.whatsappNumber);
        const billingNum = trimStr(matched?.paymentPhone);
        const wAlt = trimStr(matched?.whatsapp_number);
        const pPhone = trimStr(matched?.phone);
        const m1 = trimStr(matched?.mobileNumber);
        const m2 = trimStr(matched?.mobile_number);
        // Same resolution order as ProjectCard `projectNumber` (omit literal "--").
        const displayLine = waNum || billingNum || wAlt || pPhone || m1 || m2 || "";
        const profilePhone = savedProfile?.phone ? String(savedProfile.phone).replace(/\D/g, "") : "";
        const profileCc = String(savedProfile?.countryCode || "+91").trim();
        const profileLine = profilePhone ? `${profileCc}${profilePhone}` : "";
        if (mounted) {
          setMatchedProject(matched || null);
          setProjectPhoneApproved(isApproved || Boolean(profilePhone));
          setProjectWhatsappNumber(profileLine || displayLine);
        }
      } catch (_) {
        if (mounted) {
          setProjectPhoneApproved(Boolean(savedProfile?.phone));
          setProjectWhatsappNumber(
            savedProfile?.phone
              ? `${String(savedProfile.countryCode || "+91").trim()}${String(savedProfile.phone).replace(/\D/g, "")}`
              : ""
          );
          setMatchedProject(null);
        }
      } finally {
        if (mounted) setProjectPhoneLoaded(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [selectedProject?.id, user?.id]);

  const refreshWhatsappDisplayName = useCallback(async (projectId) => {
    const pid = Number(projectId);
    if (!Number.isInteger(pid) || pid <= 0) return;
    try {
      const waProfileRes = await axios.get("/profile/whatsapp", {
        params: { projectId: pid },
        headers: { "x-project-id": String(pid) },
      });
      const metaDisplayName = extractWhatsappDisplayName(waProfileRes?.data);
      if (metaDisplayName) {
        setWhatsappDisplayName(metaDisplayName);
        writeCachedWhatsappDisplayName(pid, metaDisplayName);
      }
    } catch (_) {
      /* keep last known display name */
    }
  }, []);

  const refreshWhatsAppLiveStatus = useCallback(async () => {
    const clientId = Number(user?.id);
    const projectId =
      selectedProject?.id != null && String(selectedProject.id).trim() !== ""
        ? String(selectedProject.id).trim()
        : null;

    if (!Number.isInteger(clientId) || clientId <= 0 || !projectId) {
      setMetaOnboardingLive(false);
      setWhatsappConnectedLatch(false);
      return;
    }

    const token = localStorage.getItem("token");
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    headers["x-project-id"] = projectId;

    const applyLiveState = (live) => {
      if (live) {
        writeWhatsAppConnectedLatch(clientId, projectId);
        setWhatsappConnectedLatch(true);
        setMetaOnboardingLive(true);
        refreshWhatsappDisplayName(projectId);
        return;
      }
      clearWhatsAppConnectedLatch(clientId, projectId);
      setWhatsappConnectedLatch(false);
      setMetaOnboardingLive(false);
    };

    try {
      const statusUrl = `${getApiUrl()}/project-api-token/status?projectId=${encodeURIComponent(projectId)}`;
      const statusRes = await fetch(statusUrl, { headers });
      const statusData = await statusRes.json().catch(() => ({}));
      if (statusRes.status === 403 && /connect whatsapp/i.test(String(statusData?.message || ""))) {
        applyLiveState(false);
        return;
      }
      if (statusRes.ok && statusData?.success === true) {
        applyLiveState(true);
        return;
      }

      let url = `${API_BASE.replace(/\/$/, "")}/meta/onboarding-status?client_id=${clientId}`;
      url += `&projectId=${encodeURIComponent(projectId)}`;
      const res = await fetch(url, { headers });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || !res.ok) {
        applyLiveState(false);
        return;
      }
      applyLiveState(parseOnboardingLiveFromStatus(data, projectId));
    } catch (_) {
      applyLiveState(false);
    }
  }, [API_BASE, user?.id, selectedProject?.id, refreshWhatsappDisplayName]);

  const cleanupMetaPopup = useCallback(() => {
    const popup = metaPopupRef.current;
    if (popup && !popup.closed) {
      try {
        popup.close();
      } catch (_) {
        /* ignore */
      }
    }
    metaPopupRef.current = null;
  }, []);

  const completeMetaOnboardWithCode = useCallback(
    async (code, projectIdForOnboard) => {
      const cid = readClientIdFromStorage() || Number(user?.id);
      if (!cid || !code) return;

      try {
        const res = await fetch(`${API_BASE.replace(/\/$/, "")}/meta/onboard`, {
          method: "POST",
          headers: paymentJsonHeaders(),
          body: JSON.stringify({
            code,
            client_id: cid,
            redirect_uri: "",
            projectId:
              projectIdForOnboard != null && Number(projectIdForOnboard) > 0
                ? Number(projectIdForOnboard)
                : null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.success) {
          throw new Error(data?.message || data?.error || "Failed to complete WhatsApp onboarding.");
        }

        const clientId = Number(user?.id);
        const projectId = Number(selectedProject?.id);
        if (Number.isInteger(clientId) && Number.isInteger(projectId)) {
          writeWhatsAppConnectedLatch(clientId, projectId);
          setWhatsappConnectedLatch(true);
          setMetaOnboardingLive(true);
        }
        await refreshWhatsAppLiveStatus();
      } catch (error) {
        alert(error?.message || "Failed to complete WhatsApp onboarding.");
      } finally {
        setWhatsappConnectBusy(false);
        embeddedSignupCodeHandlerRef.current = null;
      }
    },
    [API_BASE, refreshWhatsAppLiveStatus, selectedProject?.id, user?.id]
  );

  const handlePopupConnectResult = useCallback(
    (payload) => {
      if (!payload || payload.source !== META_POPUP_MESSAGE_SOURCE) return;
      cleanupMetaPopup();
      setWhatsappConnectBusy(false);

      if (payload.type === "WHATSAPP_CONNECTION_FAILED" || payload.type === "error") {
        alert(payload.message || "WhatsApp connection failed.");
        return;
      }

      const clientId = Number(user?.id);
      const projectId = Number(selectedProject?.id);
      if (
        parseOnboardingLiveFromStatus(payload, projectId) ||
        payload.whatsappConnected ||
        payload.onboardingCompleted
      ) {
        if (Number.isInteger(clientId) && Number.isInteger(projectId)) {
          writeWhatsAppConnectedLatch(clientId, projectId);
          setWhatsappConnectedLatch(true);
          setMetaOnboardingLive(true);
        }
        refreshWhatsAppLiveStatus();
      }
    },
    [cleanupMetaPopup, refreshWhatsAppLiveStatus, selectedProject?.id, user?.id]
  );

  const handleWhatsAppConnect = useCallback(async () => {
    if (whatsappConnectBusy) return;

    const cid = readClientIdFromStorage() || Number(user?.id);
    if (!Number.isInteger(cid) || cid <= 0) {
      alert("Please log in again before connecting WhatsApp.");
      return;
    }
    if (!META_EMBEDDED_CONFIG_ID) {
      alert("Meta Embedded Signup config_id is missing.");
      return;
    }

    let projectId = null;
    let projectName = "";
    const pid = selectedProject?.id != null ? Number(selectedProject.id) : null;
    if (Number.isInteger(pid) && pid > 0) projectId = pid;
    projectName = String(selectedProject?.project_name || selectedProject?.name || "").trim();

    setWhatsappConnectBusy(true);
    cleanupMetaPopup();

    try {
      const sessionUser = readSessionUser() || user || {};
      const onboard = await connectWhatsAppOnboarding({
        companyName: sessionUser?.name || "",
        email: sessionUser?.email || "",
        mobile: sessionUser?.mobileNumber || "",
        projectId,
        projectName,
        returnOrigin: String(window.location?.origin || "").trim(),
      });

      if (onboard?.localProjectId) {
        projectId = Number(onboard.localProjectId) || projectId;
      }

      const solutionId = String(onboard?.solutionId || META_SOLUTION_ID || "").trim();
      if (!solutionId) {
        throw new Error("Meta Solution ID missing for AiSensy partner billing.");
      }

      await ensureFacebookSdk();

      if (window.FB?.login) {
        await new Promise((resolve) => {
          embeddedSignupCodeHandlerRef.current = (code) => {
            completeMetaOnboardWithCode(code, projectId);
          };
          const loginOptions = buildFbEmbeddedSignupLoginOptions(solutionId);
          window.FB.login((response) => {
            if (response?.authResponse?.code) {
              completeMetaOnboardWithCode(response.authResponse.code, projectId);
              resolve();
              return;
            }
            if (response?.status === "unknown" || !response?.authResponse) {
              setWhatsappConnectBusy(false);
              embeddedSignupCodeHandlerRef.current = null;
              alert("Meta signup was cancelled or failed. Please try again.");
            }
            resolve();
          }, loginOptions);
        });
        return;
      }

      const signupUrl = onboard?.signupUrl || onboard?.embeddedSignupUrl;
      if (!signupUrl) {
        throw new Error(onboard?.message || "No embedded signup URL returned");
      }

      const popup = openMetaOAuthPopupWindow(sanitizeMetaOAuthUrl(String(signupUrl)));
      metaPopupRef.current = popup;
      if (!popup) {
        throw new Error("Popup blocked. Allow popups for this site and try again.");
      }
    } catch (error) {
      setWhatsappConnectBusy(false);
      alert(error?.response?.data?.message || error?.message || "Could not start WhatsApp onboarding.");
    }
  }, [
    cleanupMetaPopup,
    completeMetaOnboardWithCode,
    selectedProject?.id,
    selectedProject?.name,
    selectedProject?.project_name,
    user,
    whatsappConnectBusy,
  ]);

  useEffect(() => {
    const handleMessage = (event) => {
      if (isMetaOAuthPopupOrigin(event.origin)) {
        const data = event.data;
        if (data?.source === META_POPUP_MESSAGE_SOURCE) {
          handlePopupConnectResult(data);
          return;
        }
      }

      const origin = String(event.origin || "");
      const isFacebookOrigin = /facebook\.com$/i.test(origin) || origin.endsWith(".facebook.com");
      if (!isFacebookOrigin) return;

      let data = event.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch (_) {
          return;
        }
      }
      if (!data || data.type !== WA_EMBEDDED_SIGNUP_EVENT) return;

      const code = extractEmbeddedSignupCode(data);
      if (!code) return;

      cleanupMetaPopup();
      const handler = embeddedSignupCodeHandlerRef.current;
      if (typeof handler === "function") {
        handler(code);
        return;
      }

      const projectId = selectedProject?.id != null ? Number(selectedProject.id) : null;
      completeMetaOnboardWithCode(code, projectId);
    };

    const handleStorage = (event) => {
      if (event.key !== META_POPUP_STORAGE_KEY || !event.newValue) return;
      try {
        const payload = JSON.parse(event.newValue);
        handlePopupConnectResult(payload);
      } catch (_) {
        /* ignore */
      }
      try {
        localStorage.removeItem(META_POPUP_STORAGE_KEY);
      } catch (_) {
        /* ignore */
      }
    };

    window.addEventListener("message", handleMessage);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
      cleanupMetaPopup();
    };
  }, [
    cleanupMetaPopup,
    completeMetaOnboardWithCode,
    handlePopupConnectResult,
    selectedProject?.id,
  ]);

  useEffect(() => {
    refreshWhatsAppLiveStatus();
    const intervalId = window.setInterval(refreshWhatsAppLiveStatus, 10000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshWhatsAppLiveStatus();
    };
    const onFocus = () => refreshWhatsAppLiveStatus();
    const onStorage = (event) => {
      const key = String(event?.key || "");
      if (
        key.startsWith(WA_META_LIVE_PREFIX) ||
        key.startsWith(PROJECT_PROFILE_PREFIX) ||
        key === META_POPUP_STORAGE_KEY ||
        key === "selectedProject"
      ) {
        refreshWhatsAppLiveStatus();
        const pid = Number(selectedProject?.id);
        if (Number.isInteger(pid) && pid > 0) {
          setAccountProfile(readProjectProfile(pid));
        }
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    const onPaymentSuccess = () => refreshWhatsAppLiveStatus();
    window.addEventListener("whatsapp-payment-success", onPaymentSuccess);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("whatsapp-payment-success", onPaymentSuccess);
    };
  }, [refreshWhatsAppLiveStatus, location.pathname, selectedProject?.id]);

  useEffect(() => {
    const userId = Number(user?.id);
    const projectId = Number(selectedProject?.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      setPlanInfo(null);
      return;
    }

    // Prefer server plan for the active project (source of truth).
    const fromApi = conversationQuota?.planInfo;
    const apiProjectMatches =
      conversationQuota?.projectId == null ||
      !Number.isInteger(projectId) ||
      projectId <= 0 ||
      Number(conversationQuota.projectId) === projectId;
    if (fromApi && typeof fromApi === "object" && apiProjectMatches) {
      setPlanInfo(fromApi.active ? fromApi : null);
      if (Number.isInteger(projectId) && projectId > 0 && fromApi.active) {
        try {
          localStorage.setItem(`planInfo:${userId}:${projectId}`, JSON.stringify(fromApi));
        } catch (_) {
          /* ignore */
        }
      }
      return;
    }

    if (!Number.isInteger(projectId) || projectId <= 0) {
      setPlanInfo(null);
      return;
    }

    try {
      const projectKey = `planInfo:${userId}:${projectId}`;
      let raw = localStorage.getItem(projectKey);
      // One-time migrate legacy user-scoped plan onto the *current* project only.
      if (!raw) {
        const legacy = localStorage.getItem(`planInfo:${userId}`);
        if (legacy) {
          localStorage.setItem(projectKey, legacy);
          localStorage.removeItem(`planInfo:${userId}`);
          raw = legacy;
        }
      }
      const parsed = raw ? JSON.parse(raw) : null;
      setPlanInfo(parsed && parsed.active ? parsed : null);
    } catch (_) {
      setPlanInfo(null);
    }
  }, [user?.id, selectedProject?.id, conversationQuota?.planInfo, conversationQuota?.projectId]);

  const businessName =
    (whatsappDisplayName && String(whatsappDisplayName).trim()) ||
    (accountProfile?.name && String(accountProfile.name).trim()) ||
    matchedProject?.project_name ||
    selectedProject?.project_name ||
    user?.name ||
    user?.displayName ||
    "Business";
  const businessCategory = (
    accountProfile?.category ||
    matchedProject?.category ||
    selectedProject?.category ||
    user?.industry ||
    "BUSINESS"
  )
    .toString()
    .trim()
    .toUpperCase()
    .slice(0, 32);
  const accountLogoUrl = toLogoSrc(resolveProjectLogo(matchedProject, accountProfile));
  const businessInitial = String(businessName).trim().charAt(0).toUpperCase() || "B";
  const fallbackCc = (user?.countryCode || user?.country_code || "+91").toString().trim();

  const profilePhoneOverride = accountProfile?.phone
    ? `${String(accountProfile.countryCode || "+91").trim()}${String(accountProfile.phone).replace(/\D/g, "")}`
    : "";

  let phoneDisplay;
  let businessPhoneDigits = "";
  /** True only when we show a real formatted line (matches project card data, not profile fallback). */
  let showBusinessPhoneNumber = false;
  if (!projectPhoneLoaded) {
    phoneDisplay = "…";
  } else if (profilePhoneOverride) {
    const splitPhone = splitWhatsappNumber(profilePhoneOverride, fallbackCc);
    const cc = splitPhone.countryCode || "+91";
    businessPhoneDigits = splitPhone.localNumber || "";
    phoneDisplay = businessPhoneDigits ? `${cc} ${businessPhoneDigits}` : "—";
    showBusinessPhoneNumber = Boolean(businessPhoneDigits);
  } else if (!projectPhoneApproved) {
    phoneDisplay = "—";
  } else {
    const rawPhone = projectWhatsappNumber;
    const splitPhone = splitWhatsappNumber(rawPhone, fallbackCc);
    const cc = splitPhone.countryCode || "+91";
    businessPhoneDigits = splitPhone.localNumber || "";
    if (businessPhoneDigits) {
      phoneDisplay = `${cc} ${businessPhoneDigits}`;
      showBusinessPhoneNumber = true;
    } else {
      phoneDisplay = "—";
    }
  }

  const openEditAccountModal = () => {
    const split = splitWhatsappNumber(
      profilePhoneOverride || projectWhatsappNumber || phoneDisplay,
      fallbackCc
    );
    setAccountEditForm({
      name: businessName,
      category: businessCategory,
      countryCode: accountProfile?.countryCode || split.countryCode || fallbackCc,
      phone: accountProfile?.phone || split.localNumber || "",
      description: accountProfile?.description || "",
      address: accountProfile?.address || "",
      email: accountProfile?.email || "",
      website: accountProfile?.website || "",
      logo: accountLogoUrl || "",
    });
    setLogoFile(null);
    setLogoRemoved(false);
    setShowAccountEditModal(true);
  };

  const handleAccountLogoFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file for the logo.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("Logo must be 2 MB or smaller.");
      return;
    }
    setLogoFile(file);
    setLogoRemoved(false);
    const previewUrl = URL.createObjectURL(file);
    setAccountEditForm((prev) => ({ ...prev, logo: previewUrl }));
    event.target.value = "";
  };

  const saveAccountProfile = async () => {
    const pid = Number(selectedProject?.id);
    if (!Number.isInteger(pid) || pid <= 0) {
      alert("Select a workspace project before saving account details.");
      return;
    }
    const name = String(accountEditForm.name || "").trim();
    if (!name) {
      alert("Business name is required.");
      return;
    }
    const countryCode = String(accountEditForm.countryCode || "+91").trim();
    const phone = String(accountEditForm.phone || "").replace(/\D/g, "");
    const category = String(accountEditForm.category || "BUSINESS")
      .trim()
      .toUpperCase()
      .slice(0, 32);
    const description = String(accountEditForm.description || "").trim();
    const address = String(accountEditForm.address || "").trim();
    const email = String(accountEditForm.email || "").trim();
    const website = String(accountEditForm.website || "").trim();

    const formData = new FormData();
    formData.append("name", name);
    formData.append("category", category);
    formData.append("countryCode", countryCode);
    formData.append("phone", phone);
    formData.append("description", description);
    formData.append("address", address);
    formData.append("email", email);
    formData.append("website", website);
    formData.append("projectId", String(pid));
    if (logoFile) {
      formData.append("logo", logoFile);
    }
    if (logoRemoved && !logoFile) {
      formData.append("removeLogo", "1");
    }

    setAccountSaving(true);
    try {
      const res = await axios.put("/profile", formData);
      const savedLogo = res?.data?.logo ?? res?.data?.profile?.logo ?? null;
      const metaSync = res?.data?.metaSync;
      const profile = {
        name,
        category,
        countryCode,
        phone,
        description,
        address,
        email,
        website,
        logo: savedLogo ? String(savedLogo) : "",
        updatedAt: new Date().toISOString(),
      };
      writeProjectProfile(pid, profile);
      setAccountProfile(profile);
      setLogoFile(null);
      setLogoRemoved(false);
      if (phone) {
        setProjectWhatsappNumber(`${countryCode}${phone}`);
        setProjectPhoneApproved(true);
      }
      try {
        const raw = localStorage.getItem("selectedProject");
        if (raw) {
          const sp = JSON.parse(raw);
          if (Number(sp?.id) === pid) {
            localStorage.setItem(
              "selectedProject",
              JSON.stringify({ ...sp, project_name: name, category })
            );
          }
        }
      } catch (_) {
        /* ignore */
      }
      setShowAccountEditModal(false);
      if (metaSync && metaSync.synced === false && !metaSync.skipped) {
        alert(
          `Saved locally, but WhatsApp profile sync failed: ${metaSync.message || "Meta API error"}`
        );
      } else if (metaSync?.synced && logoFile && metaSync.profilePictureSynced === false) {
        alert(
          `Saved, but WhatsApp profile photo sync failed: ${
            metaSync.pictureUpload?.message || metaSync.note || "Meta photo upload error"
          }`
        );
      }
    } catch (e) {
      alert(e?.response?.data?.message || e?.message || "Failed to save account details.");
    } finally {
      setAccountSaving(false);
    }
  };

  const userMobileDigits = String(
    user?.mobileNumber ||
      user?.mobile_number ||
      user?.mobile ||
      user?.phone ||
      user?.phoneNumber ||
      user?.dataValues?.mobileNumber ||
      ""
  ).replace(/\D/g, "");

  // Prefer account mobile for Razorpay — not WhatsApp Business / sandbox sender number.
  const paymentContactDigits = userMobileDigits || businessPhoneDigits;

  const whatsappConnected = Boolean(metaOnboardingLive || isWhatsAppApiLive);

  useEffect(() => {
    const clientId = Number(user?.id);
    const projectId = Number(selectedProject?.id);
    if (!whatsappConnected || !Number.isInteger(clientId) || !Number.isInteger(projectId)) {
      return;
    }
    writeWhatsAppConnectedLatch(clientId, projectId);
    setWhatsappConnectedLatch(true);
  }, [whatsappConnected, user?.id, selectedProject?.id]);

  const unifiedPlan = useMemo(() => {
    if (!catalogPlans.length) return null;
    const active = catalogPlans.filter((p) => p.is_active !== false);
    const sorted = (active.length ? active : catalogPlans).slice().sort(
      (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
    );
    const plan = normalizeCatalogPlanForCurrency(sorted[0], pricingCurrency, planDiscounts);
    const monthly = Number(plan?.price_monthly) || PLAN_MONTHLY_PRICE;
    return { ...plan, monthly };
  }, [catalogPlans, pricingCurrency, planDiscounts]);

  const planMonthlyBase = unifiedPlan?.monthly ?? PLAN_MONTHLY_PRICE;

  const basePlanPrice = useMemo(
    () => (unifiedPlan ? resolvePlanBillingAmount(unifiedPlan, billingCycle) : cycleBillingAmount(planMonthlyBase, billingCycle)),
    [unifiedPlan, planMonthlyBase, billingCycle]
  );

  useEffect(() => {
    if (unifiedPlan?.slug) setSelectedPlan(unifiedPlan.slug);
  }, [unifiedPlan?.slug]);

  const { flowBuilder: flowBuilderPrice, agentSeat: agentSeatPrice } = getAddonPrices(
    billingCycle,
    pricingCurrency
  );
  const addonPrice = (flowBuilderEnabled ? flowBuilderPrice : 0) + agentSeatCount * agentSeatPrice;
  const grandTotal = basePlanPrice + addonPrice;
  const isUsdPricing = !isInrCurrency(pricingCurrency);
  const showIndianGst = isIndianUserAccount(pricingUser) && isInrCurrency(pricingCurrency);
  const planGst = showIndianGst ? wccGstAmount(grandTotal) : 0;
  const planTotalPayable = resolvePayableAmount(grandTotal, pricingCurrency);
  const planStep1Gst = showIndianGst ? wccGstAmount(basePlanPrice) : 0;
  const planStep1Payable = resolvePayableAmount(basePlanPrice, pricingCurrency);
  const wccBalance =
    conversationQuota != null && !loadingQuota ? Number(conversationQuota.wccCredits ?? 0) : null;
  const wccBaseAmount = Math.max(0, Number(wccAmount) || 0);
  const wccGst = showIndianGst ? wccGstAmount(wccBaseAmount) : 0;
  const wccTotalPayable = resolvePayableAmount(wccBaseAmount, pricingCurrency);
  const wccCurrencySymbol = isUsdPricing ? '$' : '₹';
  const wccPurchaseDisabled = paymentLoading || wccBaseAmount < 100;
  const hasActivePlan = Boolean(planInfo?.active);
  const renewDateLabel = planInfo?.renewsOn
    ? new Date(planInfo.renewsOn).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  const planEndingSoon = useMemo(() => {
    if (!hasActivePlan || !planInfo?.renewsOn) return null;
    const endDate = new Date(planInfo.renewsOn);
    if (Number.isNaN(endDate.getTime())) return null;
    const now = Date.now();
    const endMs = endDate.getTime();
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const msLeft = endMs - now;
    if (msLeft < 0 || msLeft > weekMs) return null;
    return {
      endDate: endDate.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      daysLeft: Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000))),
    };
  }, [hasActivePlan, planInfo?.renewsOn]);

  const activePlanCycleLabel = useMemo(() => {
    const cycle = String(planInfo?.cycle || "").toLowerCase();
    if (cycle === "quarterly") return "Quarterly";
    if (cycle === "yearly" || cycle === "annual") return "Yearly";
    if (cycle === "monthly") return "Monthly";
    return "Monthly";
  }, [planInfo?.cycle]);

  const activePlanAmountLabel = useMemo(() => {
    if (!hasActivePlan) return null;
    const stored = Number(planInfo?.planAmount);
    if (Number.isFinite(stored) && stored > 0) {
      return formatPlanAmount(stored, pricingCurrency);
    }
    if (unifiedPlan) {
      return formatPlanAmount(resolvePlanBillingAmount(unifiedPlan, planInfo?.cycle || "monthly"), pricingCurrency);
    }
    return formatPlanAmount(cycleBillingAmount(planMonthlyBase, planInfo?.cycle || "monthly", planDiscounts), pricingCurrency);
  }, [hasActivePlan, planInfo, unifiedPlan, pricingCurrency, planMonthlyBase, planDiscounts]);

  const planSummaryText = useMemo(() => {
    if (billingCycle === "monthly") return "Renews every month";
    if (billingCycle === "quarterly") return "Renews every 3 months";
    return "Renews every 12 months";
  }, [billingCycle]);

  const copyPhone = () => {
    if (!showBusinessPhoneNumber || !businessPhoneDigits) return;
    const digits = phoneDisplay.replace(/\D/g, "");
    if (digits && navigator.clipboard?.writeText) navigator.clipboard.writeText(digits);
  };

  const loadRazorpayScript = () =>
    new Promise((resolve, reject) => {
      if (window.Razorpay || document.getElementById("razorpay-checkout-js")) return resolve(true);
      const script = document.createElement("script");
      script.id = "razorpay-checkout-js";
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error("Failed to load Razorpay script"));
      document.body.appendChild(script);
    });

  const openRazorpayCheckout = async ({
    amount,
    purpose,
    description,
    metadata = {},
    currency = pricingCurrency,
    onSuccess,
  }) => {
    if (paymentLoading) return;
    const token = localStorage.getItem("token");
    if (!token) {
      alert("Session expired. Please login again.");
      return;
    }
    setPaymentLoading(true);
    try {
      const createOrderRes = await fetch(`${API_URL}/api/payments/create-order`, {
        method: "POST",
        headers: paymentJsonHeaders(),
        body: JSON.stringify({ amount, purpose, metadata, currency }),
      });
      const createOrderData = await createOrderRes.json();
      if (!createOrderRes.ok || !createOrderData.success) {
        throw new Error(createOrderData.message || "Failed to create Razorpay order");
      }

      await loadRazorpayScript();
      const razorpayContact = toRazorpayPrefillContact(paymentContactDigits);
      const razorpayEmail = String(user?.email || "").trim();
      const options = {
        key: createOrderData.keyId,
        amount: Number(createOrderData.amount),
        currency: createOrderData.currency || "INR",
        name: "Waabizx",
        description,
        order_id: createOrderData.orderId,
        prefill: {
          name: String(user?.name || "").trim() || "Customer",
          ...(razorpayEmail ? { email: razorpayEmail } : {}),
          // Omit invalid contact — empty/wrong format breaks Test Mode netbanking proceed
          ...(razorpayContact ? { contact: razorpayContact } : {}),
        },
        theme: { color: "#0284c7" },
        // Keep bank / mock pages able to open (Test Mode netbanking uses a redirect/mock page)
        modal: {
          ondismiss: () => setPaymentLoading(false),
          escape: true,
          backdropclose: false,
        },
        handler: async (response) => {
          try {
            const verifyRes = await fetch(`${API_URL}/api/payments/verify-payment`, {
              method: "POST",
              headers: paymentJsonHeaders(),
              body: JSON.stringify({
                order_id: response.razorpay_order_id,
                payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok || !verifyData.success) throw new Error(verifyData.message || "Payment verification failed");
            if (typeof onSuccess === "function") onSuccess();
          } catch (e) {
            alert(e.message || "Payment verification failed");
          } finally {
            setPaymentLoading(false);
          }
        },
      };
      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp) => {
        const msg = resp?.error?.description || resp?.error?.reason || "Payment failed";
        setPaymentLoading(false);
        alert(msg);
      });
      rzp.open();
    } catch (e) {
      setPaymentLoading(false);
      alert(e.message || "Payment failed");
    }
  };

  const purchaseWcc = () => {
    if (wccBaseAmount < 100) {
      alert("Minimum amount of 100 credits is allowed.");
      return;
    }
    if (wccBaseAmount > WCC_DIRECT_PAYMENT_LIMIT) {
      setShowWccDirectPayModal(true);
      return;
    }
    return openRazorpayCheckout({
      amount: wccTotalPayable,
      purpose: "wcc",
      description: "Purchase WhatsApp Conversation Credits (WCC)",
      metadata: { projectId: selectedProject?.id || null, wccCredits: wccBaseAmount },
      onSuccess: async () => {
        setShowWccModal(false);
        setPaymentLoading(false);
        if (typeof onRefreshConversationQuota === "function") {
          await onRefreshConversationQuota();
        }
        alert("WCC purchased successfully!");
      },
    });
  };

  const purchaseAdsCredits = () =>
    openRazorpayCheckout({
      amount: adsAmount,
      purpose: "ads_credits",
      description: "Purchase AiSensy Ads Credits",
      metadata: { projectId: selectedProject?.id || null },
      onSuccess: () => {
        setShowAdsModal(false);
        setPaymentLoading(false);
        alert("Ads credits purchased successfully!");
      },
    });

  const purchasePlan = () => {
    const projectId = selectedProject?.id || null;
    if (!(Number(projectId) > 0)) {
      alert("Select a project before purchasing a plan.");
      return;
    }
    return openRazorpayCheckout({
      amount: planTotalPayable,
      purpose: "plan_purchase",
      currency: pricingCurrency,
      description: `${selectedPlan.toUpperCase()} plan (${billingCycle})`,
      metadata: {
        projectId,
        cycle: billingCycle,
        plan: selectedPlan,
        planId: catalogPlans.find((p) => p.slug === selectedPlan)?.id ?? null,
        flowBuilderEnabled,
        agentSeatCount,
        basePlanPrice,
        addonPrice,
        planSubtotal: grandTotal,
        currency: pricingCurrency,
      },
      onSuccess: async () => {
        const nowIso = new Date().toISOString();
        const renewsOn =
          billingCycle === "monthly"
            ? addMonthsIso(nowIso, 1)
            : billingCycle === "quarterly"
              ? addMonthsIso(nowIso, 3)
              : addMonthsIso(nowIso, 12);
        const nextPlanInfo = {
          active: true,
          plan: selectedPlan,
          cycle: billingCycle,
          purchasedAt: nowIso,
          renewsOn,
          planAmount: planTotalPayable,
        };
        setPlanInfo(nextPlanInfo);
        const uid = Number(user?.id);
        const pid = Number(projectId);
        if (Number.isInteger(uid) && uid > 0 && Number.isInteger(pid) && pid > 0) {
          localStorage.setItem(`planInfo:${uid}:${pid}`, JSON.stringify(nextPlanInfo));
          localStorage.removeItem(`planInfo:${uid}`);
        }
        setShowPlanModal(false);
        setPlanStep(1);
        setPaymentLoading(false);
        if (typeof onRefreshConversationQuota === "function") {
          await onRefreshConversationQuota();
        }
        alert("Plan purchased successfully!");
      },
    });
  };

  const cardShell =
    "relative overflow-hidden rounded-2xl border border-gray-100/90 bg-white/95 backdrop-blur-sm shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80";

  return (
    <div className="space-y-3 md:space-y-4 motion-stagger-children">
      <div className={`${cardShell} p-3.5 md:p-4`}>
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] sm:text-xs font-semibold text-sky-800">
          <button type="button" onClick={() => navigate("/analytics")} className="hover:text-sky-950 transition-colors">
            Analytics Dashboard
          </button>
        </div>
      </div>

      <div className={`${cardShell} p-4 md:p-5 motion-card-rich motion-hover-lift transition-all duration-300 hover:border-sky-200/60 hover:shadow-xl hover:shadow-sky-500/10`}>
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/5 to-transparent" aria-hidden />
        <div className="relative flex gap-3">
          <div className="shrink-0">
            {accountLogoUrl ? (
              <img
                src={accountLogoUrl}
                alt={`${businessName} logo`}
                className="h-14 w-14 rounded-xl object-cover border border-sky-100/90 bg-white shadow-sm ring-1 ring-sky-100/80"
              />
            ) : (
              <div
                className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-lg font-bold text-white shadow-md shadow-sky-600/25 ring-2 ring-white/80"
                aria-hidden
              >
                {businessInitial}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-bold text-gray-900 tracking-tight text-sm md:text-base truncate">{businessName}</h3>
              <button
                type="button"
                onClick={openEditAccountModal}
                className="shrink-0 rounded-lg border border-sky-200/90 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-sky-700 hover:bg-sky-50 hover:border-sky-300 transition"
              >
                Edit
              </button>
            </div>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-600/90">{businessCategory}</p>
            <div className="mt-3 flex items-center gap-2">
              <p
                className={`font-semibold text-sm md:text-base tabular-nums truncate ${
                  showBusinessPhoneNumber && businessPhoneDigits ? "text-emerald-600" : "text-gray-500"
                }`}
              >
                {phoneDisplay}
              </p>
              <button
                type="button"
                onClick={copyPhone}
                disabled={!showBusinessPhoneNumber || !businessPhoneDigits}
                className={`shrink-0 p-1.5 rounded-lg border border-gray-200/90 bg-white transition ${
                  !showBusinessPhoneNumber || !businessPhoneDigits
                    ? "text-gray-300 cursor-not-allowed opacity-60"
                    : "text-sky-700 hover:bg-sky-50 hover:border-sky-200"
                }`}
                title={
                  showBusinessPhoneNumber && businessPhoneDigits
                    ? "Copy number"
                    : "Number shown after project WhatsApp is approved"
                }
                aria-label="Copy WhatsApp number"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
            <button
              type="button"
              onClick={openEditAccountModal}
              className="mt-3 text-xs font-semibold text-sky-700 hover:text-sky-900 flex items-center gap-1"
            >
              Edit account details <span className="text-[10px]">▾</span>
            </button>
          </div>
        </div>
      </div>

      {showAccountEditModal &&
        createPortal(
          <div className="fixed inset-0 z-[305] flex items-center justify-center overscroll-contain p-4">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-md"
              onClick={() => setShowAccountEditModal(false)}
              aria-label="Close edit account"
            />
            <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl shadow-sky-900/15 ring-1 ring-black/5">
              <div className="flex items-center justify-between gap-3 border-b border-sky-100/90 bg-gradient-to-r from-sky-50 via-white to-blue-50 px-5 py-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Edit account</h3>
                  <p className="mt-0.5 text-[11px] text-gray-500">
                    Update logo &amp; WhatsApp Business Profile fields
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAccountEditModal(false)}
                  className="w-9 h-9 rounded-xl text-gray-500 hover:bg-white hover:text-gray-900 border border-transparent hover:border-gray-200 transition"
                  aria-label="Close"
                >
                  &#x2715;
                </button>
              </div>
              <div className="max-h-[min(70vh,520px)] overflow-y-auto p-5 space-y-4">
                <div className="flex items-center gap-4">
                  {accountEditForm.logo ? (
                    <img
                      src={accountEditForm.logo}
                      alt="Logo preview"
                      className="h-16 w-16 rounded-xl object-cover border border-sky-100 ring-1 ring-sky-100/80"
                    />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-xl font-bold text-white">
                      {String(accountEditForm.name || businessName).trim().charAt(0).toUpperCase() || "B"}
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <input
                      ref={logoFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAccountLogoFile}
                    />
                    <button
                      type="button"
                      onClick={() => logoFileInputRef.current?.click()}
                      className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 transition"
                    >
                      Upload logo
                    </button>
                    {accountEditForm.logo ? (
                      <button
                        type="button"
                        onClick={() => {
                          setLogoFile(null);
                          setLogoRemoved(true);
                          setAccountEditForm((prev) => ({ ...prev, logo: "" }));
                        }}
                        className="text-left text-[11px] font-semibold text-rose-600 hover:text-rose-700"
                      >
                        Remove logo
                      </button>
                    ) : null}
                    <p className="text-[10px] text-gray-400 leading-snug max-w-[14rem]">
                      Logo is saved on Waabizx and synced to WhatsApp Business profile photo on Save.
                    </p>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Business name</label>
                  <input
                    type="text"
                    value={accountEditForm.name}
                    onChange={(e) => setAccountEditForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Category</label>
                  <input
                    type="text"
                    value={accountEditForm.category}
                    onChange={(e) => setAccountEditForm((prev) => ({ ...prev, category: e.target.value }))}
                    className="mt-1.5 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30 outline-none"
                  />
                </div>
                <div className="grid grid-cols-[5.5rem_1fr] gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Code</label>
                    <select
                      value={accountEditForm.countryCode}
                      onChange={(e) => setAccountEditForm((prev) => ({ ...prev, countryCode: e.target.value }))}
                      className="mt-1.5 w-full rounded-xl border-2 border-gray-200 px-2 py-2.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30 outline-none"
                    >
                      {COUNTRY_CODES.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700">Phone number</label>
                    <input
                      type="tel"
                      value={accountEditForm.phone}
                      onChange={(e) =>
                        setAccountEditForm((prev) => ({
                          ...prev,
                          phone: e.target.value.replace(/[^\d\s-]/g, ""),
                        }))
                      }
                      className="mt-1.5 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm tabular-nums focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30 outline-none"
                      placeholder="WhatsApp number"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Description</label>
                  <textarea
                    value={accountEditForm.description}
                    onChange={(e) =>
                      setAccountEditForm((prev) => ({ ...prev, description: e.target.value }))
                    }
                    rows={3}
                    maxLength={512}
                    className="mt-1.5 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30 outline-none resize-y"
                    placeholder="Business description (synced to WhatsApp)"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Address</label>
                  <input
                    type="text"
                    value={accountEditForm.address}
                    onChange={(e) => setAccountEditForm((prev) => ({ ...prev, address: e.target.value }))}
                    maxLength={256}
                    className="mt-1.5 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30 outline-none"
                    placeholder="Business address"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Email</label>
                  <input
                    type="email"
                    value={accountEditForm.email}
                    onChange={(e) => setAccountEditForm((prev) => ({ ...prev, email: e.target.value }))}
                    maxLength={128}
                    className="mt-1.5 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30 outline-none"
                    placeholder="business@example.com"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700">Website</label>
                  <input
                    type="url"
                    value={accountEditForm.website}
                    onChange={(e) => setAccountEditForm((prev) => ({ ...prev, website: e.target.value }))}
                    maxLength={256}
                    className="mt-1.5 w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-400/30 outline-none"
                    placeholder="https://example.com"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShowAccountEditModal(false)}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveAccountProfile}
                  disabled={accountSaving}
                  className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-sky-500/25 hover:from-sky-500 hover:to-blue-500 disabled:opacity-60"
                >
                  {accountSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      <div className={`${cardShell} p-4 md:p-5 motion-card-rich motion-hover-lift`}>
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-sky-500/5" aria-hidden />
        <div className="relative">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Free Service Conversation</p>
          <div className="mt-3 flex items-center justify-between text-[10px] font-semibold text-gray-500">
            <span>0</span>
            <span>Unlimited</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-gray-100 border border-gray-200/80 overflow-hidden">
            <div className="h-full w-[96%] rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-sky-500 shadow-sm" />
          </div>
        </div>
      </div>

      <div className={`${cardShell} p-4 md:p-5 motion-card-rich motion-hover-lift`}>
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-green-500/5" aria-hidden />
        <div className="relative flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-emerald-800/90 uppercase tracking-wide">Connect</p>
            <p className="mt-0.5 text-sm font-bold text-gray-900">WhatsApp Business API</p>
            {whatsappConnected ? (
              <>
                <p className="text-[10px] text-emerald-700 mt-1 font-semibold leading-snug">Your WhatsApp Business API is live.</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-[10px] font-bold ring-1 ring-emerald-200/80">
                    LIVE
                  </span>
                </div>
                <p className="text-[10px] text-emerald-700 mt-2 leading-snug">
                  Connected and ready to send WhatsApp messages.
                </p>
              </>
            ) : (
              <p className="text-[10px] text-gray-500 mt-1 leading-snug">Link your Meta account to send campaigns and templates.</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!whatsappConnected && !whatsappConnectBusy) handleWhatsAppConnect();
            }}
            disabled={whatsappConnected || whatsappConnectBusy}
            aria-disabled={whatsappConnected || whatsappConnectBusy}
            className={`shrink-0 px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
              whatsappConnected
                ? "text-emerald-800 bg-emerald-50 border border-emerald-200/90 cursor-not-allowed opacity-90 pointer-events-none"
                : whatsappConnectBusy
                  ? "text-emerald-800 bg-emerald-50 border border-emerald-200/90 cursor-wait opacity-90"
                  : "text-white bg-gradient-to-r from-emerald-600 to-green-600 shadow-md shadow-emerald-600/25 hover:from-emerald-500 hover:to-green-500"
            }`}
          >
            {whatsappConnected ? "Connected" : whatsappConnectBusy ? "Connecting…" : "Connect"}
          </button>
        </div>
      </div>

      <div className={`${cardShell} p-4 md:p-5 motion-card-rich motion-hover-lift`}>
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/8 to-blue-500/5" aria-hidden />
        <div className="relative flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-gray-500 leading-snug">WhatsApp Conversation Credits (WCC)</p>
            <p className="mt-1 text-lg md:text-xl font-bold text-gray-900 tabular-nums">
              {loadingQuota ? "…" : wccBalance != null ? `${wccBalance.toLocaleString()} left` : "—"}
            </p>
            <p className="text-[10px] text-gray-500 mt-1 leading-snug">
              Meta-style pricing: one debit per <span className="font-semibold text-gray-600">24-hour conversation</span>{" "}
              in India is typically ~₹0.3–₹1.5 (category-dependent).{" "}
              <span className="font-semibold text-gray-600">1 credit = ₹1</span> from top-ups (e.g. ₹100 → 100 credits).
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setWccAmount(100);
              setPaymentLoading(false);
              setShowWccModal(true);
            }}
            className="shrink-0 px-3 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-slate-800 to-slate-900 shadow-md shadow-slate-900/25 hover:from-slate-700 hover:to-slate-800 transition"
          >
            Buy More
          </button>
        </div>
      </div>

      <div className={`${cardShell} p-4 md:p-5 motion-card-rich motion-hover-lift`}>
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/8 to-blue-500/5" aria-hidden />
        <div className="relative">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Current Plan</p>
          {hasActivePlan ? (
            <>
              <h3 className="mt-1.5 font-bold text-base md:text-lg bg-gradient-to-r from-sky-700 to-blue-800 bg-clip-text text-transparent tracking-tight">
                {activePlanCycleLabel.toUpperCase()}
              </h3>
              {activePlanAmountLabel ? (
                <p className="mt-1 text-sm font-semibold text-gray-800 tabular-nums">{activePlanAmountLabel}</p>
              ) : null}
            </>
          ) : (
            <h3 className="mt-1.5 font-bold text-base md:text-lg bg-gradient-to-r from-sky-700 to-blue-800 bg-clip-text text-transparent tracking-tight">
              Purchase plan
            </h3>
          )}
          {planEndingSoon ? (
            <div className="mt-3 rounded-xl border border-amber-200/90 bg-gradient-to-br from-amber-50 to-orange-50/60 px-3 py-2.5 ring-1 ring-amber-100/80">
              <p className="text-[11px] font-semibold text-amber-900 leading-snug">
                Plan ends soon — please recharge to continue
              </p>
              <p className="mt-1 text-[10px] text-amber-800/90">
                Ends on <span className="font-bold">{planEndingSoon.endDate}</span>
                {planEndingSoon.daysLeft === 1 ? " (tomorrow)" : ` (${planEndingSoon.daysLeft} days left)`}
              </p>
            </div>
          ) : hasActivePlan && renewDateLabel ? (
            <p className="mt-2 text-[11px] text-gray-500 leading-snug">Renews on {renewDateLabel}</p>
          ) : !hasActivePlan ? null : (
            <p className="mt-2 text-[11px] text-gray-500 leading-snug">Upgrade anytime from billing when you need higher limits.</p>
          )}
          <button
            type="button"
            onClick={() => {
              setPlanStep(1);
              setPaymentLoading(false);
              setShowPlanModal(true);
            }}
            className={`mt-3 w-full px-3 py-2.5 rounded-xl text-xs font-semibold text-white shadow-md transition ${
              planEndingSoon
                ? "bg-gradient-to-r from-amber-500 to-orange-600 shadow-amber-500/25 hover:from-amber-400 hover:to-orange-500"
                : "bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-600/25 hover:from-emerald-500 hover:to-teal-500"
            }`}
          >
            {planEndingSoon ? "Recharge Now" : hasActivePlan ? "Upgrade Now" : "GET PLAN"}
          </button>
        </div>
      </div>

      {showAdsModal &&
        createPortal(
          <div className="fixed inset-0 z-[310] flex justify-end overscroll-contain">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-md"
              onClick={() => {
                setShowAdsModal(false);
                setPaymentLoading(false);
              }}
              aria-label="Close overlay"
            />
            <div className="relative z-10 h-full w-full max-w-md overflow-y-auto bg-white/95 backdrop-blur-md border-l border-gray-200/80 shadow-2xl shadow-sky-900/15 ring-1 ring-black/5">
              <div className="p-5 border-b border-sky-100/90 flex items-center justify-between bg-gradient-to-r from-sky-50 via-white to-blue-50">
                <div>
                  <h3 className="text-base font-bold bg-gradient-to-r from-slate-900 to-sky-800 bg-clip-text text-transparent">Purchase AiSensy Ads Credits</h3>
                  <p className="text-[11px] text-slate-500 mt-1">Fund ad campaigns with instant top-up</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdsModal(false);
                    setPaymentLoading(false);
                  }}
                  className="w-9 h-9 rounded-xl text-gray-500 hover:bg-white hover:text-gray-900 border border-transparent hover:border-gray-200 transition"
                >
                  &#x2715;
                </button>
              </div>
              <div className="p-5 bg-gradient-to-b from-white to-sky-50/30">
                <div className="rounded-2xl border border-sky-100/90 bg-white p-4 ring-1 ring-sky-100/80 shadow-lg shadow-sky-100/30">
                  <p className="text-xs text-gray-600 leading-relaxed">These ad credits can be used to create and run ads only from AiSensy&apos;s Ads Manager.</p>
                  <div className="mt-4">
                    <label className="block text-sm font-semibold text-gray-800">Enter Amount</label>
                    <p className="text-xs text-gray-500 mt-1">Minimum purchase of 1500 credits is allowed</p>
                    <div className="mt-2 flex items-center">
                      <span className="px-3 py-2.5 border-2 border-r-0 border-sky-200 rounded-l-xl bg-sky-50 text-sky-700 font-semibold text-sm">₹</span>
                      <input
                        type="number"
                        value={adsAmount}
                        min={1500}
                        step={500}
                        onChange={(e) => setAdsAmount(Number(e.target.value))}
                        className="w-full px-3 py-2.5 border-2 border-sky-200 rounded-r-xl text-sm focus:ring-2 focus:ring-sky-400/40 focus:border-sky-500 outline-none border-l-0 bg-white"
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {[2500, 5000, 10000, 50000].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setAdsAmount(amt)}
                          className={`px-2 py-2 text-xs rounded-xl font-semibold transition border-2 ${
                            adsAmount === amt
                              ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-md"
                              : "bg-white text-gray-700 border-sky-100 hover:border-sky-300 hover:bg-sky-50/80"
                          }`}
                        >
                          +{amt}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={purchaseAdsCredits}
                      disabled={paymentLoading}
                      className="mt-4 w-full px-4 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-lg shadow-emerald-600/30 hover:from-emerald-500 hover:to-teal-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {paymentLoading ? "Opening…" : "Purchase Now"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showWccModal &&
        createPortal(
          <div className="motion-enter fixed inset-0 z-[300] flex justify-end overscroll-contain">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-md"
              onClick={() => {
                setShowWccModal(false);
                setPaymentLoading(false);
              }}
              aria-label="Close overlay"
            />
            <div className="motion-pop relative z-10 flex h-full w-full max-w-md flex-col overflow-hidden bg-white/95 backdrop-blur-md border-l border-gray-200/80 shadow-2xl shadow-sky-900/15 ring-1 ring-black/5">
              <div className="p-5 border-b border-sky-100/90 flex items-start justify-between gap-4 bg-gradient-to-r from-sky-50 via-white to-blue-50">
                <div>
                  <h3 className="text-base md:text-lg font-bold bg-gradient-to-r from-slate-900 to-sky-800 bg-clip-text text-transparent">Purchase WhatsApp Conversation Credits (WCC)</h3>
                  <p className="text-xs text-slate-500 mt-1">Keep conversations running with instant recharge</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowWccModal(false);
                    setPaymentLoading(false);
                  }}
                  className="w-9 h-9 rounded-xl text-gray-500 hover:bg-white hover:text-gray-900 border border-transparent hover:border-gray-200 transition"
                  aria-label="Close"
                >
                  &#x2715;
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5 bg-gradient-to-b from-white to-sky-50/30">
                <div className="rounded-2xl p-4 md:p-5 border-2 border-sky-100/90 bg-gradient-to-br from-white to-sky-50/40 shadow-inner ring-1 ring-sky-100/70">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-gray-800">Enter WCC Amount</p>
                    <span className="text-[11px] px-2.5 py-1 rounded-full bg-sky-100 text-sky-800 font-semibold ring-1 ring-sky-200/80">Min 100</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Minimum amount of 100 credits is allowed.</p>

                  <div className="mt-3 flex items-center">
                    <span className="px-3 py-2.5 border-2 border-r-0 border-sky-200 rounded-l-xl bg-sky-50 text-sky-700 font-semibold text-sm">{wccCurrencySymbol}</span>
                    <input
                      type="number"
                      value={wccAmount}
                      min={100}
                      step={100}
                      onChange={(e) => setWccAmount(Number(e.target.value))}
                      className="w-full px-3 py-2.5 border-2 border-sky-200 rounded-r-xl text-sm focus:ring-2 focus:ring-sky-400/40 focus:border-sky-500 outline-none border-l-0 bg-white"
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {[100, 500, 1000, 2500].map((amt) => {
                      const isDisabled = amt < 100;
                      return (
                        <button
                          key={amt}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => setWccAmount(amt)}
                          className={`px-2 py-2 text-xs rounded-xl font-semibold transition border-2 ${
                            isDisabled
                              ? "bg-gray-50 text-gray-400 border-gray-100 cursor-not-allowed"
                              : wccAmount === amt
                                ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white border-emerald-500 shadow-md"
                                : "bg-white text-gray-700 border-sky-100 hover:border-sky-300 hover:bg-sky-50/80"
                          }`}
                        >
                          {amt.toLocaleString()}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 rounded-xl border border-sky-100/90 bg-sky-50/40 px-3 py-3 space-y-2 text-sm">
                    <div className="flex items-center justify-between gap-2 text-gray-700">
                      <span>WCC amount</span>
                      <span className="font-semibold tabular-nums">{formatPlanAmount(wccBaseAmount, pricingCurrency)}</span>
                    </div>
                    {showIndianGst ? (
                      <div className="flex items-center justify-between gap-2 text-gray-600">
                        <span>GST (18%)</span>
                        <span className="font-semibold tabular-nums">{formatPlanAmount(wccGst, pricingCurrency)}</span>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-sky-200/80 text-gray-900">
                      <span className="font-semibold">
                        {showIndianGst ? 'Total payable (incl. GST)' : 'Total payable'}
                      </span>
                      <span className="font-bold text-emerald-700 tabular-nums">{formatPlanAmount(wccTotalPayable, pricingCurrency)}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 leading-snug">
                      {showIndianGst
                        ? `You will receive ${formatInr(wccBaseAmount)} WCC credits. Payment is charged inclusive of 18% GST.`
                        : `You will receive ${formatUsd(wccBaseAmount)} WCC credits.`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={purchaseWcc}
                    disabled={wccPurchaseDisabled}
                    className="mt-4 w-full px-4 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-lg shadow-emerald-600/30 hover:from-emerald-500 hover:to-teal-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {paymentLoading ? "Opening…" : `Purchase Now — ${formatPlanAmount(wccTotalPayable, pricingCurrency)}`}
                  </button>
                </div>

                <div className="rounded-2xl p-4 md:p-5 border-2 border-sky-100/90 bg-white/85 ring-1 ring-sky-100/80 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-800">Enable WCC auto-recharge</p>
                      <p className="text-xs text-gray-500 mt-1">Auto-recharge when your WCC goes below the threshold.</p>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                      <input type="checkbox" checked={autoRechargeEnabled} onChange={(e) => setAutoRechargeEnabled(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
                      <span className="text-sm font-semibold text-gray-700">On</span>
                    </label>
                  </div>

                  <div className="mt-4">
                    <label className="block text-sm font-semibold text-gray-800">Enter auto-recharge amount</label>
                    <div className="mt-2 flex items-center">
                      <span className="px-3 py-2.5 border-2 border-r-0 border-gray-200 rounded-l-xl bg-gray-50/80 text-gray-700 font-semibold text-sm">{wccCurrencySymbol}</span>
                      <input
                        type="number"
                        value={autoRechargeAmount}
                        min={100}
                        step={100}
                        disabled={!autoRechargeEnabled}
                        onChange={(e) => setAutoRechargeAmount(Number(e.target.value))}
                        className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-r-xl text-sm focus:ring-2 focus:ring-sky-400/40 focus:border-sky-500 outline-none border-l-0 bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>

                    <button type="button" disabled={!autoRechargeEnabled} className="mt-4 w-full px-4 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-600 shadow-md shadow-sky-500/20 hover:from-sky-500 hover:to-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed">
                      Start
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showWccDirectPayModal &&
        createPortal(
          <div className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
            <div className="motion-pop w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
              <div className="border-b border-amber-100 bg-gradient-to-r from-amber-50 via-white to-orange-50 px-5 py-4">
                <h3 className="text-lg font-bold text-gray-900">Direct payment required</h3>
                <p className="mt-1 text-sm text-gray-600">
                  WCC recharge above {formatPlanAmount(WCC_DIRECT_PAYMENT_LIMIT, pricingCurrency)}
                </p>
              </div>
              <div className="space-y-3 px-5 py-5 text-sm leading-relaxed text-gray-700">
                <p>
                  You are recharging WCC for more than {formatPlanAmount(WCC_DIRECT_PAYMENT_LIMIT, pricingCurrency)} (
                  {formatPlanAmount(wccBaseAmount, pricingCurrency)} selected).
                </p>
                <p>
                  For this amount, payment must be made directly to our account. Online checkout is not available for
                  recharges above {formatPlanAmount(WCC_DIRECT_PAYMENT_LIMIT, pricingCurrency)}.
                </p>
                <p className="font-semibold text-gray-900">Please contact Waabizx customer support to complete this recharge.</p>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/80 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShowWccDirectPayModal(false)}
                  className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  OK
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {showPlanModal &&
        createPortal(
          <div className="fixed inset-0 z-[320] flex justify-end overscroll-contain">
            <button
              type="button"
              className="absolute inset-0 bg-slate-950/55 backdrop-blur-md"
              onClick={() => {
                setShowPlanModal(false);
                setPaymentLoading(false);
              }}
              aria-label="Close overlay"
            />
            <div className="relative z-10 h-full w-full max-w-4xl overflow-y-auto bg-white/95 backdrop-blur-md border-l border-gray-200/80 shadow-2xl shadow-sky-900/15 ring-1 ring-black/5">
              <div className="p-5 border-b border-sky-100/90 flex items-center justify-between bg-gradient-to-r from-sky-50 via-white to-blue-50">
                <div>
                  <h3 className="text-base md:text-lg font-bold bg-gradient-to-r from-slate-900 to-sky-800 bg-clip-text text-transparent">Purchase Plan</h3>
                  <p className="text-[11px] text-slate-500 mt-1">Choose plan and add-ons that fit your team</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowPlanModal(false);
                    setPaymentLoading(false);
                  }}
                  className="w-9 h-9 rounded-xl text-gray-500 hover:bg-white hover:text-gray-900 border border-transparent hover:border-gray-200 transition"
                >
                  &#x2715;
                </button>
              </div>
              <div className="p-5 space-y-5 bg-gradient-to-b from-white to-sky-50/30">
                {planStep === 1 ? (
                  <>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 shadow-sm">
                      <p className="text-sm font-semibold text-emerald-800">Upgrade your plan to unlock this feature</p>
                      <p className="text-xs text-emerald-700 mt-1">Get advanced features to elevate your marketing game</p>
                    </div>
                    <PlanSubscriptionView
                      monthly={planMonthlyBase}
                      billingCycle={billingCycle}
                      onBillingCycleChange={setBillingCycle}
                      loading={plansLoading}
                      showGst={false}
                      planName={unifiedPlan?.name || "Project Plan"}
                      features={unifiedPlan?.features?.length ? unifiedPlan.features : null}
                      plan={unifiedPlan}
                      planDiscounts={planDiscounts}
                      conversationMetrics={conversationMetrics}
                      currency={pricingCurrency}
                    >
                      <PlanGstBreakdown
                        monthly={planMonthlyBase}
                        billingCycle={billingCycle}
                        plan={unifiedPlan}
                        currency={pricingCurrency}
                        planDiscounts={planDiscounts}
                      />
                      <div className="rounded-2xl border border-sky-100/90 p-4 bg-white ring-1 ring-sky-100/70 shadow-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">Total</p>
                            <p className="text-xs text-slate-500">{planSummaryText}</p>
                          </div>
                          <p className="text-xl font-bold text-emerald-700 tabular-nums">
                            {formatPlanAmount(planStep1Payable, pricingCurrency)}
                          </p>
                        </div>
                        {showIndianGst ? (
                          <p className="text-[11px] text-gray-500 mt-1">
                            Incl. GST {formatPlanAmount(planStep1Gst, pricingCurrency)} on plan {formatPlanAmount(basePlanPrice, pricingCurrency)}
                          </p>
                        ) : null}
                        <div className="mt-4 flex justify-end gap-2">
                          <button type="button" onClick={() => setPlanStep(2)} className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition shadow-md shadow-emerald-500/25">
                            Continue
                          </button>
                        </div>
                      </div>
                    </PlanSubscriptionView>
                  </>
                ) : (
                  <>
                    <div className="rounded-2xl border border-sky-100/90 p-4 space-y-4 bg-white ring-1 ring-sky-100/70 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Flow Builder Add-on</p>
                          <p className="text-xs text-slate-500">Drag & drop chatbot builder, catalogs, and checkout support.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFlowBuilderEnabled((v) => !v)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            flowBuilderEnabled ? "bg-rose-100 text-rose-700 border border-rose-200" : "bg-emerald-100 text-emerald-700 border border-emerald-200"
                          }`}
                        >
                          {flowBuilderEnabled ? "Remove Add-on" : "Select Add-on"}
                        </button>
                      </div>
                      <p className="text-sm font-semibold text-emerald-700">
                        {formatPlanAmount(flowBuilderPrice, pricingCurrency)}
                        /{billingCycle === "monthly" ? "month" : billingCycle === "quarterly" ? "quarter" : "year"}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-sky-100/90 p-4 space-y-4 bg-white ring-1 ring-sky-100/70 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Agent Seats Add-on</p>
                          <p className="text-xs text-slate-500">Multi-agent collaboration with role-based access control.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {[-1, 1, 5, 10].map((delta) => (
                            <button
                              key={delta}
                              type="button"
                              onClick={() => setAgentSeatCount((prev) => Math.max(0, prev + delta))}
                              className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-slate-700 hover:bg-sky-50"
                            >
                              {delta > 0 ? `+${delta}` : delta}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-600">No. of agent seats: {agentSeatCount}</p>
                        <p className="text-sm font-semibold text-emerald-700">
                          {formatPlanAmount(agentSeatCount * agentSeatPrice, pricingCurrency)}
                          /{billingCycle === "monthly" ? "month" : billingCycle === "quarterly" ? "quarter" : "year"}
                        </p>
                      </div>
                    </div>

                    <PlanGstBreakdown
                      monthly={planMonthlyBase}
                      billingCycle={billingCycle}
                      subtotal={grandTotal}
                      plan={unifiedPlan}
                      currency={pricingCurrency}
                      planDiscounts={planDiscounts}
                    />
                    <div className="rounded-2xl border border-sky-100/90 p-4 bg-white ring-1 ring-sky-100/70 shadow-sm">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div className="rounded-xl border border-gray-200 p-3">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Billing Address</p>
                          <p className="mt-1 text-sm text-slate-700">Pune, Maharashtra, IN</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 p-3">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Payment Method</p>
                          <p className="mt-1 text-sm text-slate-700">Add card and pay securely via Razorpay</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">Total</p>
                          <p className="text-xs text-slate-500">{planSummaryText}</p>
                        </div>
                        <p className="text-2xl font-bold text-emerald-700 tabular-nums">
                          {formatPlanAmount(planTotalPayable, pricingCurrency)}
                          <span className="text-sm font-semibold text-slate-500">
                            /{billingCycle === "monthly" ? "month" : billingCycle === "quarterly" ? "quarter" : "year"}
                          </span>
                        </p>
                      </div>
                      {showIndianGst ? (
                        <p className="text-[11px] text-gray-500 mb-3">
                          Incl. GST {formatPlanAmount(planGst, pricingCurrency)} on subtotal{" "}
                          {formatPlanAmount(grandTotal, pricingCurrency)}
                        </p>
                      ) : null}
                      <div className="flex justify-between gap-2">
                        <button type="button" onClick={() => setPlanStep(1)} className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-200 text-slate-700 hover:bg-gray-50">
                          Back
                        </button>
                        <button type="button" onClick={purchasePlan} disabled={paymentLoading} className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-emerald-500/25">
                          {paymentLoading ? "Opening…" : `Purchase Now — ${formatPlanAmount(planTotalPayable, pricingCurrency)}`}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export default AgentRightPanel;
