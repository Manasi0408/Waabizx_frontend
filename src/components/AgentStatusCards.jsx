import React, { useEffect, useMemo, useState } from "react";
import { getConversationQuota } from "../services/dashboardService";
import { ensureSelectedProjectFromUser, resolveActiveProjectId } from "../utils/activeProject";

const CARD_ICONS = {
  wallet: "₹",
  messages: "≈",
  tier: "⬆",
  remaining: "✓",
  limit: "⚑",
  sent: "✉",
};

function AgentStatusCards() {
  const [quota, setQuota] = useState({
    used: 0,
    remaining: 0,
    limit: 0,
    messagesSentToday: 0,
    templatesSentToday: 0,
    wccRemainingCredits: 0,
    remainingEstimatedMessages: 0,
    wabaTierLabel: null,
    tierDailyLimit: 0,
    tierSource: "local",
  });
  const [loadingQuota, setLoadingQuota] = useState(true);
  const [quotaError, setQuotaError] = useState("");

  const accountId = useMemo(() => {
    try {
      const raw = localStorage.getItem("user");
      const u = raw ? JSON.parse(raw) : null;
      return u?.id;
    } catch (e) {
      return null;
    }
  }, []);

  const [projectId, setProjectId] = useState(() => resolveActiveProjectId());

  useEffect(() => {
    ensureSelectedProjectFromUser();
    setProjectId(resolveActiveProjectId());
  }, []);

  useEffect(() => {
    if (accountId == null) return undefined;

    let cancelled = false;
    let first = true;

    const loadQuota = async () => {
      try {
        if (first) setLoadingQuota(true);
        setQuotaError("");
        const res = await getConversationQuota(accountId);
        if (!cancelled) {
          setQuota(
            res || {
              used: 0,
              remaining: 0,
              limit: 0,
              messagesSentToday: 0,
              templatesSentToday: 0,
            }
          );
        }
      } catch (e) {
        if (!cancelled) {
          setQuotaError(e?.message || "Could not load quota");
          setQuota({
            used: 0,
            remaining: 0,
            limit: 0,
            messagesSentToday: 0,
            templatesSentToday: 0,
            wccRemainingCredits: 0,
            remainingEstimatedMessages: 0,
            wabaTierLabel: null,
            tierDailyLimit: 0,
          });
        }
      } finally {
        if (!cancelled && first) {
          setLoadingQuota(false);
          first = false;
        }
      }
    };

    loadQuota();
    const t = setInterval(loadQuota, 10000);

    const onWccUpdate = () => loadQuota();
    window.addEventListener("wcc-quota-updated", onWccUpdate);

    return () => {
      cancelled = true;
      clearInterval(t);
      window.removeEventListener("wcc-quota-updated", onWccUpdate);
    };
  }, [accountId, projectId]);

  const cards = [
    {
      iconKey: "wallet",
      label: "Wallet credits",
      value: loadingQuota ? "..." : Number(quota.wccRemainingCredits || 0).toLocaleString(),
      hint: "Prepaid balance for WhatsApp sends on this project.",
      border: "border-amber-200/80",
      ring: "ring-amber-200/60",
      shadow: "shadow-amber-100/60",
      labelClass: "text-amber-700",
      badge: "bg-amber-100 text-amber-700",
    },
    {
      iconKey: "messages",
      label: "Est. messages left",
      value: loadingQuota ? "..." : Number(quota.remainingEstimatedMessages || 0).toLocaleString(),
      hint: "Estimated sends based on remaining wallet credits.",
      border: "border-indigo-200/80",
      ring: "ring-indigo-200/60",
      shadow: "shadow-indigo-100/50",
      labelClass: "text-indigo-700",
      badge: "bg-indigo-100 text-indigo-700",
    },
    {
      iconKey: "tier",
      label: "WABA tier",
      value: loadingQuota ? "..." : quota.wabaTierLabel || "—",
      hint: "Meta messaging tier for your WhatsApp Business account.",
      border: "border-fuchsia-200/80",
      ring: "ring-fuchsia-200/60",
      shadow: "shadow-fuchsia-100/50",
      labelClass: "text-fuchsia-700",
      badge: "bg-fuchsia-100 text-fuchsia-700",
      valueClass: "text-gray-900",
    },
    {
      iconKey: "remaining",
      label: "Remaining",
      value: loadingQuota ? "..." : Number(quota.remaining || quota.tierRemaining || 0).toLocaleString(),
      hint: "Tier cap minus template sends today (Meta messaging limit when available).",
      border: "border-emerald-200/80",
      ring: "ring-emerald-200/60",
      shadow: "shadow-emerald-100/60",
      labelClass: "text-emerald-700",
      badge: "bg-emerald-100 text-emerald-700",
    },
    {
      iconKey: "limit",
      label: "Tier daily limit",
      value: loadingQuota
        ? "..."
        : Number(quota.tierDailyLimit || quota.limit || 0).toLocaleString(),
      hint: "Maximum business-initiated conversations allowed per day.",
      border: "border-violet-200/80",
      ring: "ring-violet-200/60",
      shadow: "shadow-violet-100/50",
      labelClass: "text-violet-700",
      badge: "bg-violet-100 text-violet-700",
    },
    {
      iconKey: "sent",
      label: "Messages sent today",
      value: loadingQuota
        ? "..."
        : Number(quota.messagesSentToday || 0).toLocaleString(),
      hint: "Template messages sent today across this project.",
      border: "border-sky-200/80",
      ring: "ring-sky-200/60",
      shadow: "shadow-sky-100/60",
      labelClass: "text-sky-700",
      badge: "bg-sky-100 text-sky-700",
    },
  ];

  return (
    <section className="motion-enter relative overflow-hidden rounded-3xl border border-sky-100/80 bg-gradient-to-br from-sky-50/70 via-white to-blue-50/70 p-5 shadow-xl shadow-sky-200/30 ring-1 ring-sky-100/70 md:p-6 lg:p-8">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.18),transparent_40%)]"
        aria-hidden
      />
      <div className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-sky-200/25 blur-3xl" aria-hidden />

      <div className="relative mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-600/90">Overview</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-gray-900 md:text-2xl">
            Account performance
          </h2>
          <p className="mt-1.5 text-sm text-gray-600">
            Wallet balance, messaging tier, and daily activity — refreshed every 10 seconds
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loadingQuota ? (
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-3 py-1 text-xs font-medium text-sky-700 shadow-sm">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" aria-hidden />
              Syncing…
            </span>
          ) : null}
          <span className="inline-flex items-center rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200/70 shadow-sm">
            Live refresh
          </span>
          <span className="inline-flex items-center rounded-full bg-sky-600 px-3 py-1 text-[11px] font-bold text-white shadow-sm">
            10s
          </span>
        </div>
      </div>

      {quotaError ? (
        <p className="relative mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {quotaError}
          {!projectId
            ? " Ask your admin to assign this agent to a project, or open Manage with a project selected."
            : ""}
        </p>
      ) : null}

      <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 motion-stagger-children">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`motion-card-rich motion-hover-lift rounded-2xl border ${card.border} bg-white/95 backdrop-blur-sm p-5 ring-1 ${card.ring} shadow-md ${card.shadow}`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className={`text-[11px] font-semibold uppercase tracking-wide ${card.labelClass}`}>
                {card.label}
              </div>
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${card.badge}`}
                aria-hidden
              >
                {CARD_ICONS[card.iconKey]}
              </span>
            </div>
            <div className={`mt-2 text-2xl font-bold tabular-nums tracking-tight ${card.valueClass || "text-gray-900"}`}>
              {card.value}
            </div>
            {card.hint ? (
              <p className="mt-2 text-[11px] leading-snug text-gray-500">{card.hint}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export default AgentStatusCards;
