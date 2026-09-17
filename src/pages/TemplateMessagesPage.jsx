import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import CreateLocalTemplateModal, { templateToLocalForm } from "../components/CreateLocalTemplateModal";
import PlanLimitModal from "../components/PlanLimitModal";
import { createMetaTemplate, deleteTemplate, getTemplates } from "../services/templateService";
import { assertCanAddResource, extractPlanLimitError, gatePlanLimit } from "../services/planLimitService";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";
import { buildTemplatePreview, resolveTemplatePreviewButtons } from "../utils/whatsappTemplatePreview";
import {
  EXPLORE_INDUSTRIES,
  EXPLORE_TEMPLATE_CATALOG,
  exploreItemToLocalForm,
  exploreItemToTemplateRecord,
  filterExploreCatalog,
} from "../utils/exploreTemplateCatalog";

const LIST_PAGE_SIZE = 10;

const PRIMARY_INDUSTRY_KEYS = ["ecommerce", "education", "banking"];
const MORE_INDUSTRY_KEYS = ["webinar", "healthcare", "automobile", "real_estate", "services", "nonprofit"];

function PaginationBar({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  return (
    <div className="motion-enter mt-4 flex shrink-0 justify-end gap-2 border-t border-gray-100 pt-4">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Previous
      </button>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
      </button>
    </div>
  );
}
const STATUS_TABS = [
  { key: "Explore", label: "Explore", icon: "🧭" },
  { key: "All", label: "All", icon: "◎" },
  { key: "Draft", label: "Draft", icon: "✉" },
  { key: "Pending", label: "Pending", icon: "⏱" },
  { key: "Approved", label: "Approved", icon: "✓" },
  { key: "Action Required", label: "Action Required", icon: "!" },
];

function ModalPortal({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}

function normalizeTemplateStatus(template) {
  const meta = String(template?.metaStatus || "").toUpperCase();
  const local = String(template?.status || "").toLowerCase();
  if (meta === "APPROVED" || local === "approved") return "Approved";
  if (meta === "PENDING" || local === "pending") return "Pending";
  if (meta === "REJECTED" || local === "rejected") return "Action Required";
  return "Draft";
}

function getStatusPillClass(status) {
  switch (status) {
    case "Approved":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    case "Pending":
      return "bg-amber-50 text-amber-800 ring-1 ring-amber-200";
    case "Action Required":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
    default:
      return "bg-slate-50 text-slate-700 ring-1 ring-slate-200";
  }
}

function buildPreviewPartsFromTemplate(template) {
  const vars =
    template?.variables && typeof template.variables === "object" && !Array.isArray(template.variables)
      ? template.variables
      : {};
  const components = Array.isArray(template?.components)
    ? template.components
    : Array.isArray(vars.components)
      ? vars.components
      : [];
  const isCarousel =
    String(vars.templateType || "").toLowerCase() === "carousel" ||
    (Array.isArray(vars.carouselCards) && vars.carouselCards.length > 0) ||
    components.some((c) => String(c?.type || "").toUpperCase() === "CAROUSEL");
  if (isCarousel) {
    const built = buildTemplatePreview(template, { content: template?.content || "" });
    if (built) return built;
  }
  const find = (type) => components.find((c) => String(c?.type || "").toUpperCase() === type);
  const body = find("BODY");
  const footer = find("FOOTER");
  const header = find("HEADER");
  let headerFormat = String(header?.format || "").toUpperCase() || null;
  if (!headerFormat) {
    const rawType = String(vars.templateType || template?.templateType || "").toLowerCase();
    if (rawType === "image") headerFormat = "IMAGE";
    else if (rawType === "video") headerFormat = "VIDEO";
    else if (rawType === "document") headerFormat = "DOCUMENT";
  }
  return {
    headerFormat,
    headerText: header?.text || "",
    headerImageUrl: vars.headerMediaUrl || vars.header_media_url || template?.imageUrl || "",
    body: body?.text || template?.content || "",
    footer: footer?.text || vars.footer || template?.footer || "",
    buttons: resolveTemplatePreviewButtons(template),
  };
}

function TemplatePreviewModal({ open, template, previewParts, onClose }) {
  if (!open || !template) return null;

  const name = template.name || template.title || "Template";
  const body = String(previewParts?.body ?? template.content ?? "").trim() || "No content";
  const footer = String(previewParts?.footer || "").trim();
  const headerText = String(previewParts?.headerText || "").trim();
  const headerFormat = String(previewParts?.headerFormat || "").toUpperCase();
  const buttons = Array.isArray(previewParts?.buttons) ? previewParts.buttons : [];
  const status = template.metaStatus || template.status || template.displayStatus || "";
  const category = template.category || "";
  const rejectionReason = template.rejectionReason || "";
  const vars =
    template.variables && typeof template.variables === "object" && !Array.isArray(template.variables)
      ? template.variables
      : {};
  const headerImageUrl = resolvePublicMediaUrl(
    previewParts?.headerImageUrl ||
      vars.headerMediaUrl ||
      vars.header_media_url ||
      template.headerMediaUrl ||
      ""
  );
  const isCarousel = Boolean(previewParts?.isCarousel);
  const carouselCards = Array.isArray(previewParts?.carouselCards) ? previewParts.carouselCards : [];
  const carouselMediaType = String(previewParts?.carouselMediaType || "IMAGE").toUpperCase();
  const carouselMediaLabel = carouselMediaType === "VIDEO" ? "Video" : "Image";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 backdrop-blur-sm p-3 sm:p-6">
      <div className="motion-pop flex max-h-[min(94dvh,920px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="shrink-0 border-b border-gray-100 bg-gradient-to-r from-sky-50/80 via-white to-blue-50/40 px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-base sm:text-lg font-bold text-gray-900 break-words leading-snug">{name}</h3>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                {status ? (
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 font-semibold text-gray-800">
                    {String(status)}
                  </span>
                ) : null}
                {category ? (
                  <span className="rounded-full bg-sky-50 px-2.5 py-0.5 font-medium text-sky-800 ring-1 ring-sky-100">
                    {String(category)}
                  </span>
                ) : null}
                {isCarousel ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 font-medium text-amber-900 ring-1 ring-amber-100">
                    Carousel · {carouselMediaLabel}
                  </span>
                ) : headerFormat ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 font-medium text-amber-900 ring-1 ring-amber-100">
                    Header: {headerFormat}
                  </span>
                ) : null}
              </div>
              {rejectionReason ? (
                <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 break-words whitespace-pre-wrap">
                  <span className="font-semibold">Rejection reason: </span>
                  {rejectionReason}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl p-2 text-gray-400 hover:bg-white hover:text-gray-700 ring-1 ring-transparent hover:ring-gray-200"
              aria-label="Close"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-b from-white to-sky-50/20 px-5 py-5 sm:px-6">
          <div className="mx-auto max-w-[380px] rounded-[1.75rem] border-[6px] border-slate-900 bg-[#e5ddd5] p-3 shadow-lg">
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
              {!isCarousel && headerFormat === "IMAGE" && headerImageUrl ? (
                <img src={headerImageUrl} alt="" className="block w-full max-h-56 object-cover bg-gray-100" />
              ) : !isCarousel && ["IMAGE", "VIDEO", "DOCUMENT"].includes(headerFormat) ? (
                <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1 bg-gray-100 text-gray-400">
                  <span className="text-2xl">{headerFormat === "VIDEO" ? "🎬" : headerFormat === "DOCUMENT" ? "📄" : "🖼"}</span>
                  <span className="text-[11px] font-medium">{headerFormat} header</span>
                </div>
              ) : null}
              {headerText ? (
                <p className="px-3.5 pt-3 text-sm font-semibold text-gray-900 whitespace-pre-wrap break-words">{headerText}</p>
              ) : null}
              <div className="px-3.5 py-3 text-[13px] leading-relaxed text-gray-800 whitespace-pre-wrap break-words">{body}</div>
              {isCarousel && carouselCards.length > 0 ? (
                <div className="px-3.5 pb-3 border-t border-gray-100 pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">
                    {carouselMediaLabel} cards
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {carouselCards.map((card, idx) => {
                      const cardUrl = resolvePublicMediaUrl(card?.headerImageUrl || "");
                      const cardButtons = Array.isArray(card.buttons) ? card.buttons : [];
                      return (
                        <div
                          key={card.index ?? idx}
                          className="shrink-0 w-[140px] rounded-lg border border-gray-200 bg-gray-50 overflow-hidden"
                        >
                          {cardUrl ? (
                            carouselMediaType === "VIDEO" ? (
                              <video src={cardUrl} className="w-full h-20 object-cover bg-black/5" muted playsInline />
                            ) : (
                              <img src={cardUrl} alt="" className="w-full h-20 object-cover bg-gray-100" />
                            )
                          ) : (
                            <div className="w-full h-20 flex items-center justify-center text-[10px] font-semibold uppercase text-gray-400 bg-gray-100">
                              {carouselMediaLabel} {idx + 1}
                            </div>
                          )}
                          <div className="px-2 py-1.5 space-y-0.5">
                            {card.body ? (
                              <p className="text-[11px] text-gray-800 line-clamp-3 whitespace-pre-wrap break-words">
                                {card.body}
                              </p>
                            ) : null}
                            {cardButtons.slice(0, 2).map((btn, bi) => (
                              <p key={bi} className="text-[10px] font-semibold text-[#008069] truncate text-center">
                                {btn.text || btn.label || "Button"}
                              </p>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {footer ? (
                <p className="px-3.5 pb-2 text-[11px] text-gray-500 whitespace-pre-wrap break-words">{footer}</p>
              ) : null}
              {buttons.length > 0 ? (
                <div className="border-t border-gray-100">
                  {buttons.map((btn, i) => {
                    const type = String(btn.type || "").toUpperCase();
                    const label = btn.text || btn.label || btn.type || "Button";
                    const sub =
                      type === "URL" && (btn.url || btn.value)
                        ? btn.url || btn.value
                        : type === "PHONE_NUMBER" && btn.phone_number
                          ? btn.phone_number
                          : null;
                    return (
                      <div
                        key={i}
                        className="flex flex-col items-center justify-center gap-0.5 border-t border-gray-100 px-3 py-2.5 text-[12px] font-semibold text-[#008069] first:border-t-0"
                      >
                        <span className="break-words text-center">{label}</span>
                        {sub ? (
                          <span className="max-w-full break-all px-2 text-[10px] font-normal text-gray-500">{sub}</span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 justify-end border-t border-gray-100 bg-white px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border-2 border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function ExploreTemplateCard({ item, index, onPreview, onSubmit }) {
  const badges = Array.isArray(item.badges) ? item.badges : [];
  const previewBody = String(item.content || "").slice(0, 180);

  return (
    <article
      className="motion-enter motion-hover-lift flex h-full flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-sm ring-1 ring-gray-100/80 transition-all duration-300 hover:-translate-y-1 hover:border-teal-200/80 hover:shadow-lg hover:shadow-teal-900/5"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <div className={`relative flex h-24 items-center justify-center bg-gradient-to-br ${item.accent || "from-sky-400 to-blue-600"}`}>
        <div className="absolute inset-0 bg-black/5" />
        <span className="relative text-5xl drop-shadow-sm" aria-hidden>
          {item.icon || "💬"}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-base font-bold text-gray-900 leading-snug">{item.title}</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {badges.map((badge) => (
            <span
              key={badge}
              className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-600"
            >
              {badge}
            </span>
          ))}
        </div>

        <div className="mt-3 flex-1 rounded-xl border border-gray-100 bg-[#efeae2] p-3 text-[12px] leading-relaxed text-gray-800 min-h-[96px]">
          <p className="line-clamp-5 whitespace-pre-wrap break-words">{previewBody}</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onPreview(item)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 active:scale-[0.98]"
          >
            Preview
          </button>
          <button
            type="button"
            onClick={() => onSubmit(item)}
            className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-teal-800 active:scale-[0.98]"
          >
            Submit
          </button>
        </div>
      </div>
    </article>
  );
}

function UserTemplateRow({ template, index, showCopy, onPreview, onCopy, onDelete }) {
  const status = normalizeTemplateStatus(template);
  const typeLabel = String(template?.variables?.templateType || template?.templateType || "text").toUpperCase();
  const rejectionReason = template.rejectionReason || "";

  return (
    <article
      className="motion-enter motion-hover-lift group flex min-h-0 flex-row overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm ring-1 ring-gray-100/80 transition-all duration-300 hover:-translate-y-0.5 hover:border-teal-100 hover:shadow-lg hover:shadow-teal-900/5"
      style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
    >
      <div className="w-1.5 shrink-0 self-stretch bg-gradient-to-b from-teal-400 via-teal-600 to-teal-800" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 gap-y-1">
            <h3 className="text-sm sm:text-base font-semibold text-gray-900 break-words leading-snug">{template.name}</h3>
            <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase ${getStatusPillClass(status)}`}>
              {status}
            </span>
            <span className="inline-flex shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase text-gray-700">
              {typeLabel}
            </span>
          </div>
          <p className="mt-1.5 text-xs sm:text-sm text-gray-600 line-clamp-2 break-words">{template.content || "No content"}</p>
          {status === "Action Required" && rejectionReason ? (
            <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 break-words whitespace-pre-wrap">
              {rejectionReason}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 text-xs text-gray-500">
            <span>
              <span className="font-medium text-gray-400">Category</span> {template.category || "—"}
            </span>
            {template.createdAt ? (
              <>
                <span className="text-gray-300">|</span>
                <span>
                  <span className="font-medium text-gray-400">Created</span>{" "}
                  {new Date(template.createdAt).toLocaleDateString()}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-stretch lg:flex-row lg:items-center">
          <button
            type="button"
            onClick={() => onPreview(template)}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 active:scale-[0.98]"
          >
            Preview
          </button>
          {showCopy ? (
            <button
              type="button"
              onClick={() => onCopy(template)}
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100 active:scale-[0.98]"
              title="Copy template"
            >
              Copy
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onDelete(template)}
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 active:scale-[0.98]"
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}

function TemplateMessagesPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("Explore");
  const [exploreIndustry, setExploreIndustry] = useState("general");
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templatesError, setTemplatesError] = useState("");
  const [toast, setToast] = useState("");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createPrefill, setCreatePrefill] = useState(null);
  const [saving, setSaving] = useState(false);
  const [planLimitModal, setPlanLimitModal] = useState(null);

  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [previewParts, setPreviewParts] = useState(null);
  const [listPage, setListPage] = useState(1);
  const [showMoreIndustries, setShowMoreIndustries] = useState(false);

  const loadTemplates = useCallback(async () => {
      setLoadingTemplates(true);
      setTemplatesError("");
    try {
      const result = await getTemplates({ page: 1, limit: 200 });
      const localTemplates = Array.isArray(result?.templates) ? result.templates : [];
      setTemplates(localTemplates);
      } catch (e) {
      setTemplatesError(e?.message || "Failed to load templates");
        setTemplates([]);
      } finally {
        setLoadingTemplates(false);
      }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    setListPage(1);
  }, [activeTab, search]);

  const mappedTemplates = useMemo(
    () =>
      (Array.isArray(templates) ? templates : []).map((t) => ({
        ...t,
        displayStatus: normalizeTemplateStatus(t),
      })),
    [templates]
  );

  const filteredUserTemplates = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    let list = mappedTemplates;
    if (activeTab !== "Explore" && activeTab !== "All") {
      list = list.filter((t) => t.displayStatus === activeTab);
    }
    if (!q) return list;
    return list.filter((t) => {
      const hay = `${t.name || ""} ${t.content || ""} ${t.category || ""} ${t.displayStatus || ""} ${t.rejectionReason || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [mappedTemplates, activeTab, search]);

  const totalListPages = Math.max(1, Math.ceil(filteredUserTemplates.length / LIST_PAGE_SIZE));

  const paginatedUserTemplates = useMemo(() => {
    const start = (listPage - 1) * LIST_PAGE_SIZE;
    return filteredUserTemplates.slice(start, start + LIST_PAGE_SIZE);
  }, [filteredUserTemplates, listPage]);

  useEffect(() => {
    if (listPage > totalListPages) setListPage(totalListPages);
  }, [listPage, totalListPages]);

  useEffect(() => {
    if (MORE_INDUSTRY_KEYS.includes(exploreIndustry)) {
      setShowMoreIndustries(true);
    }
  }, [exploreIndustry]);

  const exploreTemplates = useMemo(() => {
    const catalog = filterExploreCatalog(EXPLORE_TEMPLATE_CATALOG, exploreIndustry, search);
    const approvedUser = mappedTemplates
      .filter((t) => t.displayStatus === "Approved")
      .map((t) => ({
        id: `user_${t.id}`,
        title: t.name,
        industry: exploreIndustry === "top_rated" ? "services" : exploreIndustry,
        topRated: false,
        templateType: String(t.variables?.templateType || "text").toLowerCase(),
        category: t.category || "marketing",
        badges: ["APPROVED", String(t.variables?.templateType || "TEXT").toUpperCase()],
        icon: "✅",
        accent: "from-emerald-400 to-green-600",
        content: t.content || "",
        footer: t.variables?.footer || "",
        actionMode: t.variables?.actionMode || "none",
        callToActions: t.variables?.callToActions,
        quickReplies: t.variables?.quickReplies,
        sourceTemplate: t,
      }));

    if (exploreIndustry === "top_rated") {
      return [...catalog, ...approvedUser.filter((t) => t.sourceTemplate?.usageCount > 0)];
    }
    if (exploreIndustry === "general") {
      return [...catalog, ...approvedUser];
    }
    return [...catalog, ...approvedUser.filter((item) => item.industry === exploreIndustry)];
  }, [exploreIndustry, search, mappedTemplates]);

  const openExplorePreview = (item) => {
    const record = item.sourceTemplate || exploreItemToTemplateRecord(item);
    setPreviewTemplate({ ...record, title: item.title });
    setPreviewParts(buildPreviewPartsFromTemplate({ ...record, ...item, content: item.content || record.content }));
  };

  const openUserPreview = (template) => {
    setPreviewTemplate(template);
    setPreviewParts(buildPreviewPartsFromTemplate(template));
  };

  const openCreateTemplate = (prefill = null) => {
    setCreatePrefill(prefill);
    setShowCreateModal(true);
    setTemplatesError("");
  };

  const handleExploreSubmit = (item) => {
    const prefill = item.sourceTemplate
      ? exploreItemToLocalForm({
          ...item,
          title: `${item.title}_copy`,
          name: `${item.sourceTemplate.name}_copy`,
        })
      : exploreItemToLocalForm(item);
    openCreateTemplate(prefill);
  };

  const handleSubmitLocalToMeta = async (metaPayload, onSuccess) => {
    setSaving(true);
    setTemplatesError("");
    try {
      const precheck = await assertCanAddResource("templates");
      if (!precheck.allowed) {
        setPlanLimitModal(precheck);
        throw new Error(precheck.message);
      }
      const result = await createMetaTemplate(metaPayload);
      setShowCreateModal(false);
      setCreatePrefill(null);
      if (typeof onSuccess === "function") onSuccess();
      await loadTemplates();
      setActiveTab("Pending");
      setToast(`Template submitted to Meta. Status: ${result.status || "PENDING"}`);
      window.setTimeout(() => setToast(""), 4000);
    } catch (error) {
      const limitPayload = extractPlanLimitError(error);
      if (limitPayload) {
        setPlanLimitModal(limitPayload);
        throw error;
      }
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (template) => {
    const ok = window.confirm(`Delete template "${template.name}"?`);
    if (!ok) return;
    try {
      await deleteTemplate(template.id);
      setTemplates((prev) => prev.filter((t) => Number(t.id) !== Number(template.id)));
    } catch (err) {
      alert(err?.message || "Delete failed");
    }
  };

  const handleCopyTemplate = (template) => {
    gatePlanLimit("templates", 1, {
      onBlocked: setPlanLimitModal,
      onAllowed: () => {
        const form = templateToLocalForm(template);
        if (form?.name) form.name = `${form.name}_copy`;
        openCreateTemplate(form);
      },
    });
  };

  const mainIndustries = EXPLORE_INDUSTRIES.filter((i) => i.section === "main");
  const primaryIndustries = EXPLORE_INDUSTRIES.filter((i) => PRIMARY_INDUSTRY_KEYS.includes(i.key));
  const moreIndustries = EXPLORE_INDUSTRIES.filter((i) => MORE_INDUSTRY_KEYS.includes(i.key));
  const isMoreIndustryActive = MORE_INDUSTRY_KEYS.includes(exploreIndustry);

  return (
    <>
      <div className="flex min-h-[calc(100dvh-8rem)] flex-col p-4 md:p-6 lg:p-8">
        <div className="motion-enter flex min-h-0 flex-1 flex-col rounded-2xl border border-gray-100/90 bg-white/95 p-4 shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 md:p-6">
          <div className="flex shrink-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
              <h2 className="text-xl font-bold tracking-tight text-gray-900 md:text-2xl">Template Messages</h2>
              <p className="mt-1 text-sm text-gray-600">Explore, create, and manage WhatsApp templates.</p>
            </div>
            <button
              type="button"
              onClick={() => openCreateTemplate(null)}
              className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
            >
              + Create Template
            </button>
          </div>

          {toast ? (
            <div className="mt-4 shrink-0 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {toast}
        </div>
          ) : null}

          <div className="mt-4 shrink-0">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates (status, name etc.)"
              className="w-full rounded-xl border-2 border-gray-200 bg-gray-50/80 py-2.5 pl-4 pr-4 text-sm shadow-sm transition-all hover:bg-white focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/45"
            />
        </div>

          <div className="mt-4 shrink-0 overflow-x-auto border-b border-gray-200">
            <div className="flex min-w-max items-center gap-1">
              {STATUS_TABS.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`relative inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors ${
                      active ? "text-teal-800" : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    <span className="text-base leading-none opacity-80">{tab.icon}</span>
                    {tab.label}
                    {active ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-teal-700" /> : null}
                  </button>
                );
              })}
            </div>
          </div>

          {templatesError ? (
            <div className="mt-4 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {templatesError}
            </div>
          ) : null}

          {activeTab === "Explore" ? (
            <div className="mt-5 flex min-h-[calc(100dvh-22rem)] flex-1 gap-5">
              <aside className="hidden w-52 shrink-0 overflow-y-auto md:block lg:w-56">
                <div className="space-y-1">
                  {mainIndustries.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setExploreIndustry(item.key)}
                      className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                        exploreIndustry === item.key
                          ? "bg-teal-50 text-teal-800 ring-1 ring-teal-200"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <p className="mb-2 mt-5 px-1 text-xs font-bold uppercase tracking-wide text-gray-400">Industry</p>
                <div className="space-y-1 pb-2">
                  {primaryIndustries.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setExploreIndustry(item.key)}
                      className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                        exploreIndustry === item.key
                          ? "bg-teal-50 text-teal-800 ring-1 ring-teal-200"
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                              <button
                                type="button"
                    onClick={() => setShowMoreIndustries((prev) => !prev)}
                    className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                      showMoreIndustries || isMoreIndustryActive
                        ? "bg-gray-100 text-gray-900 ring-1 ring-gray-200"
                        : "text-teal-700 hover:bg-teal-50"
                    }`}
                  >
                    {showMoreIndustries ? "Less −" : "More +"}
                              </button>
                  {showMoreIndustries || isMoreIndustryActive
                    ? moreIndustries.map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setExploreIndustry(item.key)}
                          className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                            exploreIndustry === item.key
                              ? "bg-teal-50 text-teal-800 ring-1 ring-teal-200"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {item.label}
                        </button>
                      ))
                    : null}
                              </div>
              </aside>

              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-gray-800">
                    {EXPLORE_INDUSTRIES.find((i) => i.key === exploreIndustry)?.label || "General"}
                  </p>
                  <p className="text-xs text-gray-500">{exploreTemplates.length} template(s)</p>
                              </div>
                <div className="mb-3 md:hidden">
                  <select
                    value={exploreIndustry}
                    onChange={(e) => setExploreIndustry(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm"
                  >
                    {EXPLORE_INDUSTRIES.map((item) => (
                      <option key={item.key} value={item.key}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                              </div>
                {loadingTemplates ? (
                  <div className="py-12 text-center">
                    <div className="inline-block h-9 w-9 animate-spin rounded-full border-2 border-teal-200 border-t-teal-700" />
                            </div>
                ) : exploreTemplates.length === 0 ? (
                  <div className="py-10 text-center text-sm text-gray-500">No explore templates found.</div>
                ) : (
                  <div className="motion-stagger-children grid grid-cols-1 gap-4 pb-6 sm:grid-cols-2 xl:grid-cols-3">
                    {exploreTemplates.map((item, index) => (
                      <ExploreTemplateCard
                        key={item.id}
                        item={item}
                        index={index}
                        onPreview={openExplorePreview}
                        onSubmit={handleExploreSubmit}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-5 min-h-[calc(100dvh-22rem)] flex-1 overflow-y-auto">
              {loadingTemplates ? (
                <div className="py-12 text-center">
                  <div className="inline-block h-9 w-9 animate-spin rounded-full border-2 border-teal-200 border-t-teal-700" />
                  <p className="mt-3 text-sm text-gray-600">Loading templates...</p>
                </div>
              ) : filteredUserTemplates.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">
                  {activeTab === "Action Required" ? "No rejected templates." : "No templates found."}
                </div>
              ) : (
                <>
                  <div className="motion-stagger-children space-y-3 pb-2">
                    {paginatedUserTemplates.map((template, index) => (
                      <UserTemplateRow
                        key={template.id}
                        template={template}
                        index={index}
                        showCopy={activeTab === "All"}
                        onPreview={openUserPreview}
                        onCopy={handleCopyTemplate}
                        onDelete={handleDeleteTemplate}
                      />
                    ))}
                  </div>
                  <PaginationBar
                    page={listPage}
                    totalPages={totalListPages}
                    onPageChange={setListPage}
                  />
                </>
            )}
          </div>
          )}
        </div>
      </div>

      <ModalPortal>
        {showCreateModal ? (
          <div className="[&>div]:!z-[200]">
            <CreateLocalTemplateModal
              open={showCreateModal}
              saving={saving}
              initialForm={createPrefill}
              onClose={() => {
                setShowCreateModal(false);
                setCreatePrefill(null);
              }}
              onSubmit={handleSubmitLocalToMeta}
            />
          </div>
        ) : null}
      </ModalPortal>

      <ModalPortal>
        <TemplatePreviewModal
          open={Boolean(previewTemplate)}
          template={previewTemplate}
          previewParts={previewParts}
          onClose={() => {
            setPreviewTemplate(null);
            setPreviewParts(null);
          }}
        />
      </ModalPortal>

      <ModalPortal>
        <PlanLimitModal open={Boolean(planLimitModal)} payload={planLimitModal} onClose={() => setPlanLimitModal(null)} />
      </ModalPortal>
    </>
  );
}

export default TemplateMessagesPage;
