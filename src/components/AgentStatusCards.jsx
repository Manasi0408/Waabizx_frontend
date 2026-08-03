import React, { useEffect, useMemo, useState } from "react";
import { getConversationQuota } from "../services/dashboardService";

function readSelectedProjectId() {
  try {
    const raw = localStorage.getItem("selectedProject");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const id = parsed?.id;
    return id != null && String(id).trim() !== "" ? String(id) : null;
  } catch (e) {
    return null;
  }
}

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

  const projectId = useMemo(() => readSelectedProjectId(), []);

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
      label: "Wallet credits",
      value: loadingQuota ? "..." : Number(quota.wccRemainingCredits || 0).toLocaleString(),
      valueClass: "text-gray-900",
      accent: "from-amber-500/10 to-orange-500/5",
    },
    {
      label: "Est. messages left",
      value: loadingQuota ? "..." : Number(quota.remainingEstimatedMessages || 0).toLocaleString(),
      valueClass: "text-gray-900",
      accent: "from-indigo-500/10 to-violet-500/5",
    },
    {
      label: "WABA tier",
      value: loadingQuota ? "..." : quota.wabaTierLabel || "—",
      valueClass: "text-emerald-600",
      accent: "from-emerald-500/10 to-sky-500/5",
    },
    {
      label: "Remaining",
      value: loadingQuota ? "..." : Number(quota.remaining || quota.tierRemaining || 0).toLocaleString(),
      valueClass: "text-gray-900",
      accent: "from-sky-500/15 to-blue-500/10",
      hint: "Tier cap minus template sends today (Meta messaging limit when available).",
    },
    {
      label: "Tier daily limit",
      value: loadingQuota
        ? "..."
        : Number(quota.tierDailyLimit || quota.limit || 0).toLocaleString(),
      valueClass: "text-gray-900",
      accent: "from-violet-500/10 to-sky-500/10",
    },
    {
      label: "Messages sent today",
      value: loadingQuota
        ? "..."
        : Number(quota.messagesSentToday || 0).toLocaleString(),
      valueClass: "text-gray-900",
      accent: "from-violet-500/10 to-sky-500/10",
    },
  ];

  return (
    <div className="space-y-3">
      {quotaError ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
          {quotaError}
          {!projectId ? " Select a project from Manage to load WABA limits." : ""}
        </p>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 md:gap-6 motion-stagger-children">
        {cards.map((card) => (
          <div
            key={card.label}
            className="group relative motion-card-rich motion-hover-lift overflow-hidden rounded-2xl border border-gray-100/90 bg-white/95 backdrop-blur-sm p-5 md:p-6 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 transition-all duration-300 hover:border-sky-200/60 hover:shadow-xl hover:shadow-sky-500/10"
          >
            <span
              className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${card.accent} opacity-80`}
              aria-hidden
            />
            <span className="motion-card-shine pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
              <span className="motion-card-shine__beam absolute inset-0" />
            </span>
            <div className="relative">
              <p className="text-sm text-gray-500 font-medium">{card.label}</p>
              <h3 className={`mt-2 font-bold text-xl md:text-2xl tracking-tight ${card.valueClass}`}>
                {card.value}
              </h3>
              {card.hint ? (
                <p className="mt-2 text-[11px] text-slate-500 leading-snug">{card.hint}</p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AgentStatusCards;
