import React from "react";

function statusStyles(status) {
  const s = (status || "").toLowerCase();
  if (s === "active" || s === "live" || s === "approved")
    return { dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-800 ring-emerald-200/80" };
  if (s === "pending" || s === "draft")
    return { dot: "bg-amber-500", pill: "bg-amber-50 text-amber-900 ring-amber-200/80" };
  return { dot: "bg-slate-400", pill: "bg-slate-100 text-slate-700 ring-slate-200/80" };
}

function ProjectCard({ project, onRemove }) {
  const status = project.status || "N/A";
  const { dot, pill } = statusStyles(status);
  const statusNormalized = String(status).toLowerCase();
  const isApproved =
    project.whatsappApproved === true ||
    ["approved", "active", "live", "verified"].includes(statusNormalized);
  const activePlan =
    project.activePlan ||
    project.active_plan ||
    project.planName ||
    project.plan_name ||
    "FREE FOREVER";
  const billingNum =
    project.paymentPhone != null && String(project.paymentPhone).trim() !== ""
      ? String(project.paymentPhone).trim()
      : null;
  const waNum =
    project.whatsappNumber != null && String(project.whatsappNumber).trim() !== ""
      ? String(project.whatsappNumber).trim()
      : project.whatsapp_display_phone != null && String(project.whatsapp_display_phone).trim() !== ""
        ? String(project.whatsapp_display_phone).trim()
        : null;
  const created = project.created_at ? new Date(project.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) : "—";

  const initial = String(project.project_name || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <div className="relative px-5 pb-5 pt-4 md:px-6 md:pb-6 md:pt-5">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-sky-500/[0.04] via-transparent to-blue-600/[0.05] opacity-0 transition-opacity duration-300 group-hover:opacity-100" aria-hidden />

      <div className="relative flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-lg font-bold text-white shadow-md shadow-sky-600/25 ring-2 ring-white/80">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-base font-bold tracking-tight text-gray-900 md:text-[17px]">
              {project.project_name}
            </h3>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Status</p>
              <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${pill}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
                {isApproved ? "Verified" : status}
              </span>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Active plan</p>
              <p className="mt-1 text-sm font-bold text-sky-800">{String(activePlan).toUpperCase()}</p>
            </div>
          </div>

          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              WhatsApp number
            </p>
            <p
              className={`mt-1 text-[22px] leading-none font-semibold tabular-nums ${
                waNum ? "text-emerald-700" : "text-gray-400"
              }`}
            >
              {waNum || "Not connected"}
            </p>
            {billingNum && waNum && billingNum !== waNum ? (
              <p className="mt-1.5 text-[11px] font-medium text-gray-500">
                Account mobile: <span className="tabular-nums text-gray-700">{billingNum}</span>
              </p>
            ) : !waNum && billingNum ? (
              <p className="mt-1.5 text-[11px] font-medium text-gray-500">
                Account mobile: <span className="tabular-nums text-gray-700">{billingNum}</span>
                <span className="text-gray-400"> (not WhatsApp Business)</span>
              </p>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${pill}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
              {isApproved ? "Approved" : "Not approved"}
            </span>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs font-medium text-gray-500">
            <svg className="h-4 w-4 shrink-0 text-sky-500/80" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Created {created}</span>
          </div>

          <div className="mt-5 flex gap-2 border-t border-gray-100/90 pt-4">
            <button
              type="button"
              className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition-all hover:border-sky-300 hover:text-sky-700"
            >
              View
            </button>
            {typeof onRemove === "function" ? (
              <button
                type="button"
                onClick={onRemove}
                className="shrink-0 rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition-all hover:border-rose-300 hover:bg-rose-50"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProjectCard;
