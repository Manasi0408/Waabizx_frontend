import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import BrandLogoMark from '../components/BrandLogoMark';
import { getApiUrl, getApiOrigin } from '../utils/apiBase';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  useEdgesState,
  useNodesState,
} from "reactflow";
import "reactflow/dist/style.css";
import { useNavigate } from "react-router-dom";
import axios from "../api/axios";
import MainSidebarNav from "../components/MainSidebarNav";
import AppShellSidebar from "../components/AppShellSidebar";
import AdminHeaderProjectSwitch from "../components/AdminHeaderProjectSwitch";
import HeaderRightActions from "../components/HeaderRightActions";
import { getProfile, isAuthenticated, logout, readSessionUser } from "../services/authService";
import { getTemplates, getMetaTemplates, getMetaTemplateDetails, getTemplateById } from "../services/templateService";
import { uploadFlowMedia, getFlowMediaLibrary, deleteFlowMedia } from "../services/flowService";
import { resolveDisplayableHeaderMediaUrl, resolveHeaderImageFromComponents, resolvePublicMediaUrl } from "../utils/mediaUrl";
import PlanLimitModal from "../components/PlanLimitModal";
import { extractPlanLimitError, gatePlanLimit, assertCanAddResource } from "../services/planLimitService";
import { fetchUserAttributes } from "../services/userAttributeService";

const FLOW_HANDLE =
  "!w-[14px] !h-[14px] !min-w-[14px] !min-h-[14px] !bg-sky-600 !border-[3px] !border-white !shadow-md !opacity-100 !z-20";
const FLOW_HANDLE_SIDE =
  "!w-4 !h-4 !min-w-4 !min-h-4 !bg-sky-600 !border-[3px] !border-white !shadow-lg !opacity-100 !z-20";
const FLOW_HANDLE_PROMINENT =
  "!w-[18px] !h-[18px] !min-w-[18px] !min-h-[18px] !bg-blue-600 !border-[4px] !border-white !shadow-xl ring-2 ring-blue-300/80 !opacity-100 !z-30";
const FLOW_HANDLE_SIDE_PROMINENT =
  "!w-[18px] !h-[18px] !min-w-[18px] !min-h-[18px] !bg-blue-600 !border-[4px] !border-white !shadow-xl ring-2 ring-blue-300/80 !opacity-100 !z-30";

const QUESTION_CAPTURE_ATTRIBUTES = [
  "name",
  "phone",
  "email",
  "city",
  "order_id",
  "salary",
  "loan_amount",
  "custom_field_1",
  "custom_field_2",
];

const QUESTION_ATTRIBUTE_FORMATS = [
  { value: "any", label: "Any" },
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "email", label: "Email" },
  { value: "true_false", label: "True/false" },
  { value: "regex", label: "Regex" },
];

function defaultQuestionFormatErrorMessage(format) {
  const map = {
    any: "Please enter a valid answer.",
    text: "Please enter text only (not numbers).",
    number: "Please enter a valid number.",
    date: "Please enter a valid date.",
    email: "Please enter a valid email address.",
    true_false: "Please enter true or false.",
    regex: "Answer does not match the required format.",
  };
  return map[format] || map.any;
}

function validateQuestionAnswerFormat(value, format, regexPattern) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  const f = String(format || "any").toLowerCase();
  if (f === "any") return true;
  if (f === "text") return /[a-zA-Z]/.test(raw) && !/^\d+(\.\d+)?$/.test(raw);
  if (f === "number") return /^-?\d+(\.\d+)?$/.test(raw);
  if (f === "date") return !Number.isNaN(Date.parse(raw));
  if (f === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
  if (f === "true_false") return /^(true|false|yes|no)$/i.test(raw);
  if (f === "regex") {
    const pattern = String(regexPattern || "").trim();
    if (!pattern) return true;
    try {
      return new RegExp(pattern).test(raw);
    } catch (_) {
      return true;
    }
  }
  return true;
}

function syncButtonsData(buttonsList) {
  return { buttonsList, buttons: buttonsList.filter(Boolean).join(", ") };
}

const FLOW_PUBLIC_BASE = (
  process.env.REACT_APP_PUBLIC_API_URL ||
  getApiUrl().replace(/\/api\/?$/, "")
).replace(/\/$/, "");

function resolveFlowMediaPreviewUrl(url) {
  return resolvePublicMediaUrl(url, FLOW_PUBLIC_BASE);
}

function normalizeStoredFlowMediaPath(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (raw.startsWith("/uploads/")) return raw.split(/[?#]/)[0];
  if (raw.startsWith("uploads/")) return `/${raw.split(/[?#]/)[0]}`;
  try {
    const pathname = new URL(raw).pathname || "";
    const idx = pathname.indexOf("/uploads/");
    if (idx >= 0) return pathname.slice(idx).split(/[?#]/)[0];
  } catch (_) {
    /* ignore */
  }
  return raw;
}

function normalizeFlowMediaType(value) {
  const type = String(value || "IMAGE").trim().toUpperCase();
  if (type === "VIDEO" || type === "DOCUMENT") return type;
  return "IMAGE";
}

function mediaTypeFromFile(file) {
  const mime = String(file?.type || "").toLowerCase();
  const name = String(file?.name || "").toLowerCase();
  if (mime.startsWith("video/") || /\.(mp4|3gp|mov|avi|mkv|webm)$/.test(name)) return "VIDEO";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "DOCUMENT";
  return "IMAGE";
}

function acceptForFlowMediaType(mediaType) {
  const type = normalizeFlowMediaType(mediaType);
  if (type === "VIDEO") return "video/mp4,video/3gpp,video/quicktime,video/webm,.mp4,.3gp,.mov,.avi,.mkv,.webm";
  if (type === "DOCUMENT") return "application/pdf,.pdf";
  return "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp";
}

function toStoredFlowMediaUrl(url) {
  return normalizeStoredFlowMediaPath(url);
}

function normalizeFlowNodeMediaData(data = {}) {
  const next = { ...data };
  for (const key of ["mediaUrl", "imageUrl", "url", "header_media_url", "headerMediaUrl"]) {
    if (next[key]) next[key] = normalizeStoredFlowMediaPath(next[key]);
  }
  if (next.templateParts && typeof next.templateParts === "object") {
    const headerPath = normalizeStoredFlowMediaPath(
      next.templateParts.headerImageUrl || next.templateParts.headerMediaUrl
    );
    if (headerPath) {
      next.templateParts = {
        ...next.templateParts,
        headerImageUrl: resolvePublicMediaUrl(headerPath, FLOW_PUBLIC_BASE) || headerPath,
      };
    }
  }
  return next;
}

function formatStorageMb(bytes) {
  const mb = (Number(bytes) || 0) / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
}

function mediaTypeToLibraryTab(mediaType) {
  const t = normalizeFlowMediaType(mediaType);
  if (t === "VIDEO") return "VIDEO";
  if (t === "DOCUMENT") return "DOCUMENT";
  return "IMAGE";
}

function acceptForMediaLibraryTab(tab) {
  if (tab === "VIDEO") return "video/mp4,video/3gpp,video/quicktime,video/webm,.mp4,.3gp,.mov,.avi,.mkv,.webm";
  if (tab === "AUDIO") return "audio/mpeg,audio/wav,audio/ogg,audio/mp4,.mp3,.wav,.ogg,.m4a,.aac,.amr";
  if (tab === "DOCUMENT") return "application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";
  return "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif";
}

const MEDIA_LIBRARY_TABS = [
  { id: "IMAGE", label: "Image" },
  { id: "AUDIO", label: "Audio" },
  { id: "VIDEO", label: "Video" },
  { id: "DOCUMENT", label: "File" },
];

function FlowMediaLibraryModal({
  open,
  mediaType,
  onClose,
  onSelect,
  onUploadFile,
  uploading = false,
  uploadPct = 0,
  refreshKey = 0,
}) {
  const fileInputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [allItems, setAllItems] = useState([]);
  const [counts, setCounts] = useState({ IMAGE: 0, AUDIO: 0, VIDEO: 0, DOCUMENT: 0 });
  const [storageUsedBytes, setStorageUsedBytes] = useState(0);
  const [storageLimitBytes, setStorageLimitBytes] = useState(1024 * 1024 * 1024);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("IMAGE");
  const [selectedUrls, setSelectedUrls] = useState(() => new Set());

  useEffect(() => {
    if (!open) return;
    setActiveTab(mediaTypeToLibraryTab(mediaType));
    setSelectedUrls(new Set());
  }, [open, mediaType]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setSearch("");
    getFlowMediaLibrary("ALL")
      .then((payload) => {
        if (cancelled) return;
        setAllItems(Array.isArray(payload.media) ? payload.media : []);
        setCounts(payload.counts || { IMAGE: 0, AUDIO: 0, VIDEO: 0, DOCUMENT: 0 });
        setStorageUsedBytes(payload.storageUsedBytes || 0);
        setStorageLimitBytes(payload.storageLimitBytes || 1024 * 1024 * 1024);
      })
      .catch((e) => {
        if (!cancelled) {
          setAllItems([]);
          setError(e?.message || "Failed to load media library");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, refreshKey]);

  const tabItems = useMemo(
    () => allItems.filter((item) => String(item?.mediaType || "").toUpperCase() === activeTab),
    [allItems, activeTab]
  );

  const filteredItems = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return tabItems;
    return tabItems.filter((item) =>
      String(item?.filename || item?.url || "").toLowerCase().includes(q)
    );
  }, [tabItems, search]);

  const toggleSelected = (url, checked) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (checked) next.add(url);
      else next.delete(url);
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (!selectedUrls.size || deleting) return;
    if (!window.confirm(`Delete ${selectedUrls.size} selected file(s)? This cannot be undone.`)) return;
    setDeleting(true);
    setError("");
    try {
      const paths = [...selectedUrls]
        .map((url) => normalizeStoredFlowMediaPath(url) || String(url || "").trim())
        .filter(Boolean);
      await deleteFlowMedia(paths);
      setSelectedUrls(new Set());
      const payload = await getFlowMediaLibrary("ALL");
      setAllItems(Array.isArray(payload.media) ? payload.media : []);
      setCounts(payload.counts || { IMAGE: 0, AUDIO: 0, VIDEO: 0, DOCUMENT: 0 });
      setStorageUsedBytes(payload.storageUsedBytes || 0);
      setStorageLimitBytes(payload.storageLimitBytes || 1024 * 1024 * 1024);
    } catch (e) {
      setError(e?.message || "Failed to delete media");
    } finally {
      setDeleting(false);
    }
  };

  const pickFile = (file) => {
    if (!file || uploading) return;
    onUploadFile?.(file);
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-950/55 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 md:p-8">
      <div className="w-full max-w-6xl h-[min(94vh,880px)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200/90 ring-1 ring-black/5">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-4 px-6 py-5 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
          <div className="flex items-center gap-4 min-w-0 flex-wrap">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#1e3a5f] text-white shadow-md shadow-slate-900/15">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Media Library</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {formatStorageMb(storageUsedBytes)} used of {formatStorageMb(storageLimitBytes)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 text-2xl leading-none transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Search + actions */}
        <div className="shrink-0 flex flex-col sm:flex-row sm:items-center gap-3 px-6 py-4 border-b border-slate-100 bg-white">
          <div className="relative flex-1 min-w-0">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by filename..."
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl bg-slate-50/70 focus:outline-none focus:ring-2 focus:ring-sky-300/50 focus:border-sky-400 focus:bg-white"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={acceptForMediaLibraryTab(activeTab)}
              onChange={(e) => {
                pickFile(e.target.files?.[0]);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1e3a5f] text-white text-sm font-semibold hover:bg-[#162d4a] disabled:opacity-60 transition-colors shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {uploading ? (uploadPct > 0 ? `Uploading ${uploadPct}%` : "Uploading...") : "Upload"}
            </button>
            <button
              type="button"
              disabled={!selectedUrls.size || deleting}
              onClick={handleDeleteSelected}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {deleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex items-center gap-8 px-6 border-b border-slate-200 overflow-x-auto bg-white">
          {MEDIA_LIBRARY_TABS.map((tab) => {
            const active = activeTab === tab.id;
            const count = counts[tab.id] ?? 0;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setSelectedUrls(new Set());
                }}
                className={`shrink-0 py-3.5 text-sm font-semibold border-b-2 transition-colors ${active
                    ? "border-[#1e3a5f] text-[#1e3a5f]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                  }`}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Grid */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 bg-slate-50/40">
          {error ? (
            <div className="py-16 text-center text-sm text-red-600">{error}</div>
          ) : loading ? (
            <div className="py-16 text-center text-sm text-slate-500">Loading media library...</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">
              No {MEDIA_LIBRARY_TABS.find((t) => t.id === activeTab)?.label?.toLowerCase() || "media"} found.
              Use Upload to add files.
            </div>
          ) : (
            <>
              <div className="text-sm font-semibold text-slate-800 mb-4">
                Recently used ({filteredItems.length})
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredItems.map((item) => {
                  const previewUrl = resolveFlowMediaPreviewUrl(item.publicUrl || item.url);
                  const itemType = normalizeFlowMediaType(item.mediaType || activeTab);
                  const isSelected = selectedUrls.has(item.url);
                  const displayName = item.filename || "Media";
                  const shortName =
                    displayName.length > 22 ? `${displayName.slice(0, 20)}...` : displayName;

                  return (
                    <div key={item.url} className="group relative">
                      <label className="absolute top-2.5 left-2.5 z-10 flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => toggleSelected(item.url, e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer bg-white/95"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => onSelect(item)}
                        className={`w-full rounded-xl border bg-white overflow-hidden text-left transition-all hover:shadow-lg hover:-translate-y-0.5 ${isSelected ? "border-sky-500 ring-2 ring-sky-200 shadow-md" : "border-slate-200 hover:border-slate-300"
                          }`}
                      >
                        <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
                          {itemType === "VIDEO" ? (
                            previewUrl ? (
                              <video src={previewUrl} className="w-full h-full object-cover" muted playsInline />
                            ) : (
                              <span className="text-2xl text-gray-400">▶</span>
                            )
                          ) : itemType === "AUDIO" ? (
                            <span className="text-3xl text-gray-400">🎵</span>
                          ) : itemType === "DOCUMENT" ? (
                            <span className="text-3xl text-gray-400">📄</span>
                          ) : previewUrl ? (
                            <img
                              src={previewUrl}
                              alt={displayName}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-3xl text-gray-300">🖼</span>
                          )}
                        </div>
                        <div className="px-2.5 py-2.5 border-t border-slate-100 bg-white">
                          <p className="text-xs font-medium text-slate-700 truncate text-center" title={displayName}>
                            {shortName}
                          </p>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function FlowMediaAttachField({ mediaType, mediaUrl, mediaFilename, onChange, compact = false }) {
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);

  const openLibrary = () => {
    if (!uploading) setLibraryOpen(true);
  };

  const applyMediaSelection = (storedUrl, filename, type) => {
    const stored = toStoredFlowMediaUrl(storedUrl);
    onChange({
      mediaUrl: stored,
      imageUrl: stored,
      mediaType: normalizeFlowMediaType(type || mediaType),
      mediaFilename: filename || stored.split("/").pop() || "",
    });
  };

  const handleLibrarySelect = (item) => {
    applyMediaSelection(item?.url, item?.filename, item?.mediaType);
    setLibraryOpen(false);
    setError("");
  };

  const handleUploadFile = async (file) => {
    if (!file) return;
    setUploading(true);
    setUploadPct(0);
    setError("");
    try {
      const result = await uploadFlowMedia(file, {
        onProgress: (pct) => setUploadPct(pct),
      });
      const stored = toStoredFlowMediaUrl(result.storedPath || result.url);
      applyMediaSelection(stored, result.filename || file.name, result.mediaType || mediaTypeFromFile(file));
      setLibraryRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e?.message || "Failed to upload file");
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  };

  const labelClass = compact
    ? "text-[11px] text-gray-600 mb-1"
    : "text-xs font-semibold text-gray-600 mt-2 block";
  const buttonClass = compact
    ? "nodrag w-full rounded-lg border border-dashed border-sky-300 bg-sky-50 px-2.5 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60"
    : "mt-1 w-full px-3 py-2 rounded-xl border border-dashed border-sky-300 bg-sky-50 text-sm font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-60";
  const hintClass = compact ? "mt-1 text-[10px] text-gray-400" : "mt-1 text-[11px] text-gray-400";

  return (
    <div className={compact ? "mb-2" : ""}>
      <div className={compact ? "text-[11px] text-gray-600 mb-1" : labelClass}>Attach media</div>
      <button type="button" className={buttonClass} onClick={openLibrary} disabled={uploading}>
        {uploading
          ? uploadPct > 0
            ? `Uploading ${uploadPct}%...`
            : "Uploading..."
          : mediaUrl
            ? "Change media"
            : "Choose media"}
      </button>
      <div className={hintClass}>Opens Media Library — browse, upload, or delete files</div>
      {mediaFilename || mediaUrl ? (
        <div className={`${compact ? "mt-1 text-[10px]" : "mt-1 text-xs"} text-gray-500 truncate`} title={mediaFilename || mediaUrl}>
          {mediaFilename || mediaUrl}
        </div>
      ) : null}
      {error ? (
        <div className={`${compact ? "mt-1 text-[10px]" : "mt-1 text-xs"} text-red-600`}>{error}</div>
      ) : null}
      <FlowMediaLibraryModal
        open={libraryOpen}
        mediaType={mediaType}
        onClose={() => setLibraryOpen(false)}
        onSelect={handleLibrarySelect}
        onUploadFile={handleUploadFile}
        uploading={uploading}
        uploadPct={uploadPct}
        refreshKey={libraryRefreshKey}
      />
    </div>
  );
}

function resolveFlowTemplateHeaderMediaType(parts, template) {
  const fmt = String(parts?.headerFormat || "").toUpperCase();
  if (["IMAGE", "VIDEO", "DOCUMENT"].includes(fmt)) return fmt;
  const t = String(template?.type || template?.category || "").toLowerCase();
  if (t === "image") return "IMAGE";
  if (t === "video") return "VIDEO";
  if (t === "document") return "DOCUMENT";
  return null;
}

function flowTemplateNeedsHeaderMediaPick(parts, template, headerMediaUrl) {
  const mediaType = resolveFlowTemplateHeaderMediaType(parts, template);
  if (!mediaType) return false;
  const url = headerMediaUrl || parts?.headerImageUrl || "";
  return !String(url || "").trim();
}

function FlowTemplateHeaderMediaField({ data, onChange }) {
  const parts = resolveNodeTemplateParts(data);
  const mediaType = resolveFlowTemplateHeaderMediaType(parts, {
    type: data?.templateType,
    category: data?.templateCategory,
  });
  if (!mediaType) return null;

  const storedRaw =
    data?.header_media_url ||
    data?.headerMediaUrl ||
    (String(parts?.headerFormat || "").toUpperCase() === "IMAGE" ? parts?.headerImageUrl : "") ||
    "";
  const previewUrl =
    resolveFlowMediaPreviewUrl(storedRaw) ||
    resolvePublicMediaUrl(storedRaw, FLOW_PUBLIC_BASE) ||
    storedRaw;

  const applyHeaderMedia = (patch) => {
    const stored = toStoredFlowMediaUrl(patch.mediaUrl || patch.imageUrl || patch.headerMediaUrl || "");
    const displayUrl = stored
      ? resolveFlowMediaPreviewUrl(stored) ||
        resolvePublicMediaUrl(stored, FLOW_PUBLIC_BASE) ||
        stored
      : "";
    const nextParts = {
      ...(parts || {}),
      headerFormat: mediaType,
      headerImageUrl: displayUrl,
    };
    onChange?.({
      header_media_url: stored,
      headerMediaUrl: stored,
      headerMediaFilename: patch.mediaFilename || data?.headerMediaFilename || "",
      templateParts: nextParts,
    });
  };

  return (
    <div className="px-2 pb-2 border-b border-gray-200">
      <FlowMediaAttachField
        compact
        mediaType={mediaType}
        mediaUrl={previewUrl}
        mediaFilename={data?.headerMediaFilename}
        onChange={applyHeaderMedia}
      />
      {previewUrl ? (
        <div className="mt-2 rounded-md overflow-hidden border border-gray-200 bg-gray-100 h-[88px]">
          {mediaType === "VIDEO" ? (
            <video
              src={previewUrl}
              className="w-full h-full object-cover"
              controls
              muted
              playsInline
            />
          ) : mediaType === "DOCUMENT" ? (
            <div className="h-full flex items-center justify-center text-[11px] text-gray-600 px-2 text-center break-all">
              📄 {data?.headerMediaFilename || previewUrl}
            </div>
          ) : (
            <img
              src={previewUrl}
              alt=""
              className="w-full h-full object-cover"
            />
          )}
        </div>
      ) : null}
    </div>
  );
}

function parseTemplateVariablesMeta(variables) {
  if (!variables) return {};
  if (typeof variables === "string") {
    try {
      const parsed = JSON.parse(variables);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  if (typeof variables === "object" && !Array.isArray(variables)) return variables;
  return {};
}

function normalizeTemplateButtons(buttons) {
  return (buttons || [])
    .map((b) => {
      if (typeof b === "string") return { type: "QUICK_REPLY", text: b };
      const rawType = String(b?.type || "QUICK_REPLY").toUpperCase();
      const type = rawType === "PHONE" ? "PHONE_NUMBER" : rawType;
      return {
        type,
        text: b?.text || b?.title || b?.label || "",
        url: b?.url,
        phone_number: b?.phone_number || b?.phoneNumber,
      };
    })
    .filter((b) => String(b.text || "").trim());
}

function getTemplateComponentsList(template) {
  if (Array.isArray(template?.components) && template.components.length) {
    return template.components;
  }
  const meta = parseTemplateVariablesMeta(template?.variables);
  if (Array.isArray(meta.components) && meta.components.length) {
    return meta.components;
  }
  return [];
}

function extractButtonsFromComponents(components) {
  const buttons = [];
  (components || []).forEach((comp) => {
    const type = String(comp?.type || "").toUpperCase();
    if (type === "BUTTONS" && Array.isArray(comp.buttons)) {
      buttons.push(...comp.buttons);
      return;
    }
    if (Array.isArray(comp.buttons)) {
      buttons.push(...comp.buttons);
    }
  });
  return normalizeTemplateButtons(buttons);
}

function inferButtonsFromBodyText(body) {
  const text = String(body || "");
  if (!text.trim()) return [];

  const found = [];
  const seen = new Set();
  const add = (label, type = "QUICK_REPLY", extra = {}) => {
    const value = String(label || "").trim();
    if (!value || seen.has(value.toLowerCase())) return;
    seen.add(value.toLowerCase());
    found.push({ type, text: value, ...extra });
  };

  const slashRe = /(?:press|reply|send|type|click)\s+([A-Za-z0-9_\-]+(?:\/[A-Za-z0-9_\-]+)+)/gi;
  let match;
  while ((match = slashRe.exec(text)) !== null) {
    match[1].split("/").forEach((part) => add(part.trim().toUpperCase()));
  }

  const pressRe = /(?:press|reply|send)\s+([A-Z][A-Z0-9_\-]+)/gi;
  while ((match = pressRe.exec(text)) !== null) {
    add(match[1]);
  }

  const urls = text.match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
  urls.forEach((url) => {
    const host = url.replace(/^https?:\/\//i, "").split("/")[0];
    add(host || "Visit website", "URL", { url });
  });

  return normalizeTemplateButtons(found).slice(0, 5);
}

async function resolveFlowTemplate(template) {
  if (!template) return null;

  let resolved = { ...template };
  resolved.variables = parseTemplateVariablesMeta(resolved.variables);

  if (!Array.isArray(resolved.components) || !resolved.components.length) {
    const fromVars = resolved.variables?.components;
    if (Array.isArray(fromVars) && fromVars.length) {
      resolved.components = fromVars;
    }
  }

  const initialParts = getTemplatePreviewParts(resolved);
  const needsButtons = !initialParts?.buttons?.length;
  const needsComponents = !getTemplateComponentsList(resolved).length;

  if (resolved.id && (needsButtons || needsComponents)) {
    try {
      const full = await getTemplateById(resolved.id);
      if (full) {
        const fullVars = parseTemplateVariablesMeta(full.variables);
        resolved = {
          ...resolved,
          ...full,
          variables: { ...resolved.variables, ...fullVars },
          components: full.components || fullVars.components || resolved.components,
          metaTemplateId: full.metaTemplateId || resolved.metaTemplateId,
        };
      }
    } catch (_) {
      /* optional */
    }
  }

  const afterLocal = getTemplatePreviewParts(resolved);
  if (afterLocal?.buttons?.length) return resolved;

  const metaId = resolved.metaTemplateId;
  if (!metaId) return resolved;

  try {
    const details = await getMetaTemplateDetails(metaId);
    if (!details?.components?.length) return resolved;
    const header = details.components.find((c) => String(c.type || "").toUpperCase() === "HEADER");
    const format = String(header?.format || "").toUpperCase();
    const templateType =
      format === "IMAGE" ? "image" : format === "VIDEO" ? "video" : format === "DOCUMENT" ? "document" : "text";
    return {
      ...resolved,
      components: details.components,
      content:
        details.components.find((c) => String(c.type || "").toUpperCase() === "BODY")?.text ||
        resolved.content,
      variables: {
        ...parseTemplateVariablesMeta(resolved.variables),
        templateType,
        components: details.components,
      },
    };
  } catch (_) {
    return resolved;
  }
}

function resolveNodeTemplateParts(data) {
  let parts = data?.templateParts;
  if (!parts && data?.templateContent) {
    parts = {
      body: data.templateContent,
      buttons: normalizeTemplateButtons(
        (data.templateButtons || []).map((b) =>
          typeof b === "string" ? { type: "QUICK_REPLY", text: b } : b
        )
      ),
    };
  }
  if (!parts) return null;

  if (!parts.buttons?.length) {
    const fromStored = normalizeTemplateButtons(
      (data?.templateButtons || []).map((b) =>
        typeof b === "string" ? { type: "QUICK_REPLY", text: b } : b
      )
    );
    const inferred = inferButtonsFromBodyText(parts.body || data?.templateContent || "");
    const merged = mergeTemplateButtons(inferred, fromStored);
    if (merged.length) {
      parts = { ...parts, buttons: merged };
    }
  }

  const headerFromNode = resolveDisplayableHeaderMediaUrl(data.header_media_url, data.headerMediaUrl);
  const headerImageUrl = parts.headerImageUrl || headerFromNode || null;
  const headerFormat =
    parts.headerFormat ||
    (headerFromNode ? "IMAGE" : null) ||
    (headerImageUrl && !parts.headerFormat ? "IMAGE" : null);

  return {
    ...parts,
    buttons: normalizeTemplateButtons(parts.buttons || []),
    headerImageUrl,
    headerFormat,
  };
}

function buildInteractiveButtonsFromMeta(meta) {
  if (!meta || typeof meta !== 'object') return [];

  if (Array.isArray(meta.interactiveButtons) && meta.interactiveButtons.length) {
    return normalizeTemplateButtons(meta.interactiveButtons);
  }

  const buttons = [];
  const showCta = meta.actionMode === 'cta' || meta.actionMode === 'all';
  const showQr = meta.actionMode === 'quick_reply' || meta.actionMode === 'all';

  if (showCta && Array.isArray(meta.callToActions)) {
    meta.callToActions
      .filter((a) => {
        if (!String(a?.label || '').trim()) return false;
        if (a.type === 'button') return true;
        return Boolean(String(a?.value || '').trim());
      })
      .forEach((cta) => {
        if (cta.type === 'button') {
          buttons.push({ type: 'QUICK_REPLY', text: cta.label });
        } else {
          buttons.push({
            type: cta.type === 'phone' ? 'PHONE_NUMBER' : 'URL',
            text: cta.label,
            url: cta.type === 'url' ? cta.value : undefined,
            phone_number: cta.type === 'phone' ? cta.value : undefined,
          });
        }
      });
  }
  if (showQr && Array.isArray(meta.quickReplies)) {
    meta.quickReplies
      .filter((a) => String(a?.label || '').trim())
      .forEach((qr) => buttons.push({ type: 'QUICK_REPLY', text: qr.label }));
  }

  return normalizeTemplateButtons(buttons);
}

function mergeTemplateButtons(componentButtons, metaButtons) {
  const fromComponents = normalizeTemplateButtons(componentButtons);
  if (!metaButtons.length) return fromComponents;
  if (!fromComponents.length) return metaButtons;

  const merged = [...fromComponents];
  const seen = new Set(
    fromComponents.map((b) => `${String(b.type).toUpperCase()}::${String(b.text).toLowerCase()}`)
  );
  metaButtons.forEach((btn) => {
    const key = `${String(btn.type).toUpperCase()}::${String(btn.text).toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(btn);
    }
  });
  return merged;
}

function getTemplatePreviewParts(template) {
  if (!template) return null;

  const meta = parseTemplateVariablesMeta(template.variables);
  const components = getTemplateComponentsList(template);
  const metaButtons = buildInteractiveButtonsFromMeta(meta);
  const componentButtons = extractButtonsFromComponents(components);

  const findComp = (type) =>
    components.find((c) => String(c.type || "").toUpperCase() === type);
  const header = findComp("HEADER");
  const body = findComp("BODY");
  const footerComp = findComp("FOOTER");
  const bodyText = body?.text || template?.content || template?.body || template?.message || "";

  let buttons = mergeTemplateButtons(componentButtons, metaButtons);
  if (!buttons.length) {
    buttons = inferButtonsFromBodyText(bodyText);
  }

  const templateType = String(meta.templateType || "text").toLowerCase();
  const headerFormat =
    (header?.format ? String(header.format).toUpperCase() : null) ||
    ({ image: "IMAGE", video: "VIDEO", document: "DOCUMENT" }[templateType] || null);
  const headerImageUrl =
    headerFormat && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat)
      ? resolveDisplayableHeaderMediaUrl(
        meta.headerMediaUrl,
        meta.header_media_url,
        template?.headerMediaUrl,
        template?.header_media_url,
        resolveHeaderImageFromComponents(components)
      )
      : null;

  return {
    headerFormat,
    headerText: header?.text || "",
    headerImageUrl,
    body: bodyText,
    footer: footerComp?.text || meta.footer || "",
    buttons: normalizeTemplateButtons(buttons),
  };
}

function getTemplateBodyText(template) {
  if (!template) return '';
  const parts = getTemplatePreviewParts(template);
  if (parts.body?.trim()) return parts.body;
  if (typeof template.content === 'string' && template.content.trim()) return template.content;
  if (typeof template.body === 'string' && template.body.trim()) return template.body;
  if (typeof template.message === 'string' && template.message.trim()) return template.message;
  return '';
}

function getTemplateButtons(template) {
  const parts = getTemplatePreviewParts(template);
  return (parts.buttons || [])
    .filter((b) => {
      const type =
        typeof b === 'string' ? 'QUICK_REPLY' : String(b?.type || 'QUICK_REPLY').toUpperCase();
      return type === 'QUICK_REPLY';
    })
    .map((b) => {
      if (typeof b === 'string') return b;
      return b?.text || b?.title || '';
    })
    .filter(Boolean)
    .slice(0, 3);
}

async function enrichTemplatesForFlow(list) {
  let enriched = Array.isArray(list) ? [...list] : [];
  try {
    const metaList = await getMetaTemplates();
    const approvedMeta = (metaList || []).filter(
      (t) => String(t.status || t.metaStatus || '').toUpperCase() === 'APPROVED'
    );
    const metaByName = new Map(
      approvedMeta.map((t) => [String(t.name || '').toLowerCase(), t])
    );

    enriched = enriched.map((t) => {
      const meta = metaByName.get(String(t.name || '').toLowerCase());
      if (!meta) return t;
      const merged = { ...t };
      if (meta.metaTemplateId && !merged.metaTemplateId) merged.metaTemplateId = meta.metaTemplateId;
      if (Array.isArray(meta.components) && meta.components.length) merged.components = meta.components;
      if (meta.variables && typeof meta.variables === 'object' && !Array.isArray(meta.variables)) {
        const localVars =
          typeof t.variables === 'object' && !Array.isArray(t.variables) ? t.variables : {};
        merged.variables = {
          ...localVars,
          ...meta.variables,
          actionMode: localVars.actionMode || meta.variables.actionMode,
          callToActions: localVars.callToActions?.length ? localVars.callToActions : meta.variables.callToActions,
          quickReplies: localVars.quickReplies?.length ? localVars.quickReplies : meta.variables.quickReplies,
          interactiveButtons: localVars.interactiveButtons?.length
            ? localVars.interactiveButtons
            : meta.variables.interactiveButtons,
          footer: localVars.footer || meta.variables.footer,
          headerMediaUrl:
            localVars.headerMediaUrl ||
            localVars.header_media_url ||
            meta.variables.headerMediaUrl ||
            meta.variables.header_media_url ||
            null,
        };
      } else if (
        merged.variables &&
        typeof merged.variables === 'object' &&
        !Array.isArray(merged.variables) &&
        Array.isArray(merged.components) &&
        merged.components.length &&
        !merged.variables.templateType
      ) {
        const header = merged.components.find((c) => String(c.type || '').toUpperCase() === 'HEADER');
        const format = String(header?.format || '').toUpperCase();
        if (format === 'IMAGE') merged.variables = { ...merged.variables, templateType: 'image' };
        else if (format === 'VIDEO') merged.variables = { ...merged.variables, templateType: 'video' };
        else if (format === 'DOCUMENT') merged.variables = { ...merged.variables, templateType: 'document' };
      }
      return merged;
    });

    const names = new Set(enriched.map((t) => String(t.name || '').toLowerCase()));
    approvedMeta.forEach((t) => {
      const key = String(t.name || '').toLowerCase();
      if (!names.has(key)) {
        enriched.push({
          id: t.id,
          name: t.name,
          content:
            t.content ||
            t.components?.find((c) => String(c.type || '').toUpperCase() === 'BODY')?.text ||
            '',
          components: t.components,
          variables: t.variables,
          metaTemplateId: t.metaTemplateId,
          language: t.language,
          status: 'approved',
        });
        names.add(key);
      }
    });
  } catch (_) {
    /* meta optional */
  }

  enriched = await Promise.all(
    enriched.map(async (t) => {
      const parts = getTemplatePreviewParts(t);
      if (parts?.buttons?.length) return t;
      const resolved = await resolveFlowTemplate(t);
      return resolved || t;
    })
  );

  return enriched;
}

function FlowTemplatePreviewCard({ parts, variant = 'full', showButtonHandles = false, prominentHandles = false }) {
  if (!parts) return null;
  const isCanvas = variant === 'canvas';
  const textSize = isCanvas ? 'text-[11px]' : 'text-[13px]';
  const btnSize = isCanvas ? 'text-[11px]' : 'text-sm';
  const buttons = normalizeTemplateButtons(parts.buttons);
  const sideHandleClass = prominentHandles ? FLOW_HANDLE_SIDE_PROMINENT : FLOW_HANDLE_SIDE;
  const sideHandleOffset = prominentHandles ? -14 : -9;

  const card = (
    <div className={`bg-white ${showButtonHandles ? "overflow-visible" : "overflow-hidden"} ${isCanvas ? "" : "rounded-xl border border-gray-200 shadow-sm"}`}>
      {parts.headerImageUrl && String(parts.headerFormat || '').toUpperCase() === 'IMAGE' ? (
        <div
          className={`overflow-hidden ${isCanvas ? 'h-[88px] bg-gray-100' : 'aspect-[4/3] bg-gray-100'
            }`}
        >
          <img
            src={resolvePublicMediaUrl(parts.headerImageUrl, FLOW_PUBLIC_BASE) || parts.headerImageUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      ) : parts.headerFormat && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(String(parts.headerFormat).toUpperCase()) ? (
        <div
          className={`flex items-center justify-center overflow-hidden ${isCanvas
              ? 'h-[88px] bg-gradient-to-br from-[#f4a261] via-[#e76f51] to-[#d45d3a]'
              : 'aspect-[4/3] bg-gradient-to-br from-[#f4a261] via-[#e76f51] to-[#d45d3a]'
            }`}
        >
          <div className="text-center text-white/90">
            <span className={isCanvas ? 'text-2xl block' : 'text-4xl block'}>
              {String(parts.headerFormat).toUpperCase() === 'VIDEO' ? '🎬' : String(parts.headerFormat).toUpperCase() === 'DOCUMENT' ? '📄' : '🖼'}
            </span>
            {isCanvas ? null : (
              <span className="text-[11px] font-semibold uppercase tracking-wide">{parts.headerFormat} header</span>
            )}
          </div>
        </div>
      ) : null}
      {parts.headerText && String(parts.headerFormat || '').toUpperCase() === 'TEXT' ? (
        <p className={`${isCanvas ? 'px-2.5 pt-2' : 'px-3.5 pt-3'} pb-0 font-semibold text-gray-900 ${textSize}`}>
          {parts.headerText}
        </p>
      ) : null}
      <div
        className={`${isCanvas ? 'px-2.5 py-2' : 'px-3.5 py-3'} text-gray-800 leading-relaxed whitespace-pre-line break-words ${textSize}`}
      >
        {parts.body || 'No template body available.'}
      </div>
      {parts.footer ? (
        <p className={`${isCanvas ? 'px-2.5 pb-2' : 'px-3.5 pb-2'} text-[11px] text-gray-500`}>{parts.footer}</p>
      ) : null}
      {buttons.length > 0 ? (
        <div className="border-t border-gray-200">
          {(() => {
            let routableIdx = 0;
            return buttons.map((btn, i) => {
              const type = String(btn.type || '').toUpperCase();
              const label = btn.text || 'Button';
              const isRoutable = type === 'QUICK_REPLY';
              const icon = type === 'URL' ? '🔗' : type === 'PHONE_NUMBER' ? '📞' : null;
              const sub =
                type === 'URL' && btn.url
                  ? btn.url
                  : type === 'PHONE_NUMBER' && btn.phone_number
                    ? btn.phone_number
                    : null;
              const handleId = isRoutable ? `template-btn-${routableIdx++}` : null;
              return (
                <div
                  key={`${label}-${i}`}
                  className={`relative flex items-center border-t border-gray-200 first:border-t-0 ${isCanvas ? "min-h-[34px]" : "min-h-[42px]"} ${showButtonHandles && handleId ? "pr-6" : ""}`}
                >
                  <div
                    className={`flex-1 flex flex-col items-center justify-center gap-0.5 ${btnSize} font-semibold text-[#008069] ${isCanvas ? 'px-2 py-1.5' : 'px-3 py-2.5'}`}
                  >
                    <div className="flex items-center justify-center gap-1.5 max-w-full">
                      {icon ? <span aria-hidden className="shrink-0">{icon}</span> : null}
                      <span className="truncate text-center">{label}</span>
                    </div>
                    {sub ? (
                      <span className={`font-normal text-gray-500 truncate max-w-full px-2 ${isCanvas ? 'text-[9px]' : 'text-[10px]'}`}>
                        {sub}
                      </span>
                    ) : null}
                  </div>
                  {showButtonHandles && handleId ? (
                    <Handle
                      type="source"
                      position={Position.Right}
                      id={handleId}
                      className={sideHandleClass}
                      style={{ right: sideHandleOffset, top: '50%', transform: 'translateY(-50%)' }}
                    />
                  ) : null}
                </div>
              );
            });
          })()}
        </div>
      ) : null}
    </div>
  );

  if (isCanvas) return card;

  return (
    <div className="rounded-xl border border-gray-200 bg-[#e5ddd5] shadow-sm overflow-hidden p-2 sm:p-3 w-full max-w-full">
      <div className="text-xs sm:text-sm font-semibold text-gray-700 mb-2">WhatsApp Preview</div>
      <div className="rounded-lg overflow-x-hidden overflow-y-auto max-h-[min(52vh,420px)] shadow-sm">{card}</div>
    </div>
  );
}

function FlowNodeShell({ selected, children, minWidth = "min-w-[280px]", showTarget = true, overflowVisible = false }) {
  return (
    <div className={`rounded-xl border-2 ${selected ? "border-rose-500" : "border-gray-300"} bg-[#f5f3ef] shadow-sm p-2.5 ${minWidth} relative ${overflowVisible ? "overflow-visible" : ""}`}>
      {showTarget ? (
        <Handle
          type="target"
          position={Position.Left}
          className={FLOW_HANDLE_SIDE}
          style={{ left: -9, top: "50%", transform: "translateY(-50%)" }}
        />
      ) : null}
      {children}
    </div>
  );
}

function FlowAiKeywordField({ value, onChange }) {
  return (
    <div className="mb-2">
      <div className="text-[11px] text-gray-600">Type, press enter to add AI keyword</div>
      <input
        className="nodrag mt-1 w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
        placeholder="Enter AI keywords"
        value={value || ""}
        onChange={(e) => onChange?.(e.target.value)}
      />
    </div>
  );
}

function FlowKeywordField({
  value,
  onChange,
  compact = true,
  hint = "Type, press Tab or Enter to add keyword",
  placeholder = "Enter keywords",
}) {
  const [draft, setDraft] = useState("");
  const keywords = parseCommaList(value);

  const commitKeyword = (raw) => {
    const next = String(raw || "").trim();
    if (!next) return;
    const lower = next.toLowerCase();
    if (keywords.some((k) => String(k).toLowerCase() === lower)) {
      setDraft("");
      return;
    }
    onChange?.([...keywords, next].join(", "));
    setDraft("");
  };

  const removeKeyword = (index) => {
    onChange?.(keywords.filter((_, i) => i !== index).join(", "));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      commitKeyword(draft);
      return;
    }
    if (e.key === "Backspace" && !draft && keywords.length) {
      e.preventDefault();
      removeKeyword(keywords.length - 1);
    }
  };

  const hintClass = compact ? "text-[11px] text-gray-600" : "text-xs font-semibold text-gray-600";
  const boxClass = compact
    ? "nodrag mt-1 rounded-md bg-white border border-gray-300 px-2 py-1.5 min-h-[36px] flex flex-wrap gap-1 items-center"
    : "nodrag mt-1 w-full rounded-xl border border-gray-200/80 bg-white px-3 py-2 min-h-[42px] flex flex-wrap gap-1.5 items-center focus-within:ring-2 focus-within:ring-sky-300/70";
  const chipClass = compact
    ? "inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-800"
    : "inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-xs font-semibold text-emerald-800";
  const inputClass = compact
    ? "nodrag flex-1 min-w-[80px] border-0 bg-transparent px-1 py-0.5 text-[11px] text-gray-800 placeholder:text-gray-400 focus:outline-none"
    : "nodrag flex-1 min-w-[96px] border-0 bg-transparent px-1 py-0.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none";

  return (
    <div>
      <div className={hintClass}>{hint}</div>
      <div className={boxClass}>
        {keywords.map((kw, i) => (
          <span key={`${kw}-${i}`} className={chipClass}>
            {kw}
            <button
              type="button"
              className="nodrag leading-none text-emerald-600 hover:text-rose-600"
              onClick={() => removeKeyword(i)}
              aria-label={`Remove ${kw}`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className={inputClass}
          placeholder={keywords.length ? "Add keyword…" : placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
}

function parseCommaList(value) {
  return String(value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getTemplateButtonsFromNodeData(data) {
  const parts = data?.templateParts;
  if (parts?.buttons?.length) return normalizeTemplateButtons(parts.buttons);
  return (data?.templateButtons || []).map((b) =>
    typeof b === "string" ? { type: "QUICK_REPLY", text: b } : b
  );
}

function getButtonLabelFromNode(sourceNode, handleId) {
  if (!sourceNode || !handleId) return "";
  if (String(handleId).startsWith("template-btn-")) {
    const idx = parseInt(String(handleId).replace("template-btn-", ""), 10);
    const buttons = getTemplateButtonsFromNodeData(sourceNode.data || {});
    return buttons[idx]?.text || "";
  }
  if (String(handleId).startsWith("btn-")) {
    const idx = parseInt(String(handleId).replace("btn-", ""), 10);
    const list = Array.isArray(sourceNode.data?.buttonsList)
      ? sourceNode.data.buttonsList
      : parseCommaList(sourceNode.data?.buttons);
    return list[idx] || "";
  }
  if (sourceNode.type === "question") {
    const options = parseCommaList(sourceNode.data?.options);
    if (handleId === "optionA") return options[0] || "Option A";
    if (handleId === "optionB") return options[1] || "Option B";
  }
  return "";
}

function runFlowLocal(flow, { userInput, currentNodeId } = {}) {
  const nodes = flow?.nodes || [];
  const edges = flow?.edges || [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const outgoingBySource = new Map();
  edges.forEach((e) => {
    const list = outgoingBySource.get(e.source) || [];
    list.push(e);
    outgoingBySource.set(e.source, list);
  });

  const startNode = nodes.find((n) => n.type === "start");
  let nodeId = currentNodeId || startNode?.id || nodes[0]?.id || null;
  const output = [];
  const visited = new Set();
  let steps = 0;

  const pickStartKeywordFlowTargetLocal = (outgoing) => {
    const list = outgoing || [];
    if (!list.length) return null;
    const bottom = list.find((e) => String(e.sourceHandle || "") === "start-bottom-source");
    if (bottom?.target) return bottom.target;
    const header = list.find((e) => String(e.sourceHandle || "") === "start-header-source");
    if (header?.target) return header.target;
    const main = list.find((e) => !String(e.sourceHandle || "").startsWith("template-btn-"));
    return main?.target || list[0]?.target || null;
  };

  const pickEdge = (outgoing, label, handleId) => {
    const list = outgoing || [];
    if (handleId) {
      const byHandle = list.find((e) => String(e.sourceHandle || "") === String(handleId));
      if (byHandle?.target) return byHandle.target;
    }
    if (label) {
      const desired = String(label).trim().toLowerCase();
      const byLabel = list.find((e) => String(e.label || e.data?.label || "").trim().toLowerCase() === desired);
      if (byLabel?.target) return byLabel.target;
    }
    return list[0]?.target || null;
  };

  const shouldConsume = (id) =>
    String(currentNodeId || "").trim() &&
    String(id) === String(currentNodeId) &&
    userInput !== undefined &&
    userInput !== null &&
    String(userInput).trim() !== "";

  while (nodeId && steps < 40) {
    steps += 1;
    if (visited.has(nodeId) && nodeId !== currentNodeId) break;
    visited.add(nodeId);

    const node = nodeById.get(nodeId);
    if (!node) break;
    const outgoing = outgoingBySource.get(nodeId) || [];
    const firstTarget = outgoing[0]?.target || null;
    const data = node.data || {};

    if (node.type === "start") {
      if (data.templateName || data.templateParts) {
        if (!shouldConsume(nodeId)) {
          output.push({
            type: "template",
            templateName: data.templateName,
            templateParts: data.templateParts,
            templateContent: data.templateContent,
            buttons: getTemplateButtonsFromNodeData(data).map((b) => b.text),
          });
          return { output, nextNodeId: nodeId, done: false };
        }
        const buttons = getTemplateButtonsFromNodeData(data);
        const input = String(userInput).trim().toLowerCase();
        const matched =
          buttons.find((b) => String(b.text || "").trim().toLowerCase() === input) ||
          buttons.find((b) => input.includes(String(b.text || "").trim().toLowerCase()));
        const matchedEdge = outgoing.find((e) => {
          const lbl = String(e.label || e.data?.label || "").trim().toLowerCase();
          return lbl && (lbl === input || (matched && lbl === String(matched.text).trim().toLowerCase()));
        });
        nodeId = matchedEdge?.target || pickEdge(outgoing, matched?.text || userInput) || firstTarget;
        continue;
      }
      nodeId = pickStartKeywordFlowTargetLocal(outgoing) || firstTarget;
      continue;
    }

    if (node.type === "template") {
      if (!shouldConsume(nodeId)) {
        output.push({
          type: "template",
          templateName: data.templateName,
          templateParts: data.templateParts,
          templateContent: data.templateContent,
          buttons: getTemplateButtonsFromNodeData(data).map((b) => b.text),
        });
        return { output, nextNodeId: nodeId, done: false };
      }
      const buttons = getTemplateButtonsFromNodeData(data);
      const input = String(userInput).trim().toLowerCase();
      const matched =
        buttons.find((b) => String(b.text || "").trim().toLowerCase() === input) ||
        buttons.find((b) => input.includes(String(b.text || "").trim().toLowerCase()));
      const matchedEdge = outgoing.find((e) => {
        const lbl = String(e.label || e.data?.label || "").trim().toLowerCase();
        return lbl && (lbl === input || (matched && lbl === String(matched.text).trim().toLowerCase()));
      });
      nodeId = matchedEdge?.target || pickEdge(outgoing, matched?.text || userInput) || firstTarget;
      continue;
    }

    if (node.type === "text" || node.type === "single_product") {
      output.push({
        type: "text",
        text: data.body || data.text || "",
        footer: data.footer || "",
        productName: data.productName || "",
      });
      nodeId = firstTarget;
      continue;
    }

    if (node.type === "set_attribute") {
      output.push({
        type: "set_attribute",
        attribute: data.attribute || "",
        value: data.attributeValue || "",
      });
      nodeId = firstTarget;
      continue;
    }

    if (node.type === "image" || node.type === "media") {
      const mediaUrl = data.mediaUrl || data.imageUrl || data.url || "";
      if (mediaUrl) {
        output.push({
          type: "media",
          mediaType: normalizeFlowMediaType(data.mediaType),
          mediaUrl,
          caption: data.caption || "",
          buttons: Array.isArray(data.buttonsList) ? data.buttonsList : parseCommaList(data.buttons),
        });
      }
      nodeId = firstTarget;
      continue;
    }

    if (node.type === "button") {
      const buttons = Array.isArray(data.buttonsList) ? data.buttonsList : parseCommaList(data.buttons);
      if (!shouldConsume(nodeId)) {
        output.push({ type: "button", text: data.text || data.message || "", buttons });
        return { output, nextNodeId: nodeId, done: false };
      }
      const input = String(userInput).trim().toLowerCase();
      const matched = buttons.find((b) => String(b).trim().toLowerCase() === input);
      nodeId = pickEdge(outgoing, matched || userInput) || firstTarget;
      continue;
    }

    if (node.type === "list_message") {
      output.push({
        type: "list",
        header: data.header || "",
        body: data.body || data.title || "",
        footer: data.footer || "",
        listButton: data.listButton || "list",
        sections: data.sections || [],
      });
      nodeId = firstTarget;
      continue;
    }

    if (node.type === "multi_product") {
      output.push({
        type: "multi_product",
        header: data.header || data.title || "",
        body: data.body || "",
        footer: data.footer || "",
        products: Array.isArray(data.productsList) ? data.productsList : parseCommaList(data.products),
      });
      nodeId = firstTarget;
      continue;
    }

    if (node.type === "question") {
      const options = parseCommaList(data.options);
      const templateButtons = getTemplateButtonsFromNodeData(data);
      const hasTemplate = Boolean(data.templateName || data.templateParts);
      const isOptionQuestion =
        options.filter(Boolean).length > 0 || templateButtons.length > 0;

      const pushQuestionPrompt = () => {
        if (hasTemplate) {
          output.push({
            type: "template",
            templateName: data.templateName,
            templateParts: data.templateParts,
            templateContent: data.templateContent || data.question || "",
            headerMediaUrl: data.header_media_url || data.headerMediaUrl || null,
            templateLanguage: data.templateLanguage || "en_US",
            buttons: templateButtons.map((b) => b.text),
          });
        } else {
          output.push({
            type: "question",
            question: data.question || "",
            options,
            attributeFormat: data.attributeFormat || "any",
            captureAttribute: data.captureAttribute || "",
          });
        }
      };

      if (!shouldConsume(nodeId)) {
        pushQuestionPrompt();
        return { output, nextNodeId: nodeId, done: false };
      }
      const input = String(userInput).trim();
      const pushQuestionValidationError = () => {
        const format = data.attributeFormat || "any";
        const errMsg =
          data.formatErrorMessage ||
          defaultQuestionFormatErrorMessage(isOptionQuestion ? "any" : format);
        output.push({
          type: "error",
          message: errMsg,
        });
        pushQuestionPrompt();
        return { output, nextNodeId: nodeId, done: false };
      };

      if (hasTemplate && templateButtons.length) {
        const matched = templateButtons.find(
          (b) =>
            String(b.text || "").trim().toLowerCase() === input.toLowerCase() ||
            String(input).trim().toLowerCase() === String(b.text || "").trim().toLowerCase()
        );
        if (!matched) {
          return pushQuestionValidationError();
        }
        nodeId = pickEdge(outgoing, matched.text) || firstTarget;
        continue;
      }

      if (!isOptionQuestion) {
        const format = data.attributeFormat || "any";
        if (!validateQuestionAnswerFormat(input, format, data.formatRegex)) {
          return pushQuestionValidationError();
        }
        nodeId = firstTarget;
        continue;
      }
      const inputLower = input.toLowerCase();
      const matched = options.find((o) => String(o).trim().toLowerCase() === inputLower);
      if (!matched) {
        return pushQuestionValidationError();
      }
      nodeId = pickEdge(outgoing, matched) || firstTarget;
      continue;
    }

    break;
  }

  return { output, nextNodeId: null, done: true };
}

function StartNode({ data }) {
  const hasTemplate = Boolean(data?.templateName);
  const templateParts = resolveNodeTemplateParts(data);

  return (
    <div className={`rounded-2xl border-4 border-emerald-600 bg-[#f2f2f2] shadow-sm p-2 relative overflow-visible ${hasTemplate ? 'min-w-[320px]' : 'min-w-[190px]'}`}>
      <Handle
        type="source"
        position={Position.Right}
        id="start-header-source"
        className={`${FLOW_HANDLE_SIDE_PROMINENT} flow-start-header-handle`}
        style={{ right: -14, top: 20, transform: "none" }}
      />
      <div className="rounded-lg bg-white border border-gray-300 px-2 py-1.5 text-[11px] font-bold text-teal-700 flex items-center justify-between gap-2 pr-6">
        <span className="truncate">Flow Start</span>
      </div>
      <div className="mt-2">
        <FlowKeywordField
          value={data?.keywords}
          onChange={(v) => data?.onChange?.({ keywords: v })}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-gray-600">
        <span className="leading-snug">Enter regex to match substring trigger.</span>
        <span className={`inline-flex h-4 w-7 rounded-full ${data?.regexEnabled ? "bg-emerald-500" : "bg-gray-300"} relative`}>
          <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${data?.regexEnabled ? "left-3.5" : "left-0.5"}`} />
        </span>
      </div>
      <div className="mt-2 rounded-md bg-white border border-gray-300 px-2 py-2 text-[11px] text-gray-500">
        {data?.regex || "Enter Regex"}
      </div>
      <div className="mt-2 text-[11px] text-gray-600">Add upto 1 template to begin flow</div>
      {hasTemplate ? (
        <div className="mt-1 rounded-md bg-white border border-gray-300 overflow-visible pr-1">
          <div className="px-2 py-1 text-[10px] text-gray-500 border-b border-gray-200 flex items-center justify-between gap-2">
            <span className="truncate font-semibold text-gray-700">{data.templateName}</span>
            <button
              type="button"
              onClick={() => data?.onDeleteTemplate?.()}
              className="nodrag shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              title="Delete selected template"
              aria-label="Delete selected template"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
          <FlowTemplateHeaderMediaField data={data} onChange={(patch) => data?.onChange?.(patch)} />
          <FlowTemplatePreviewCard parts={templateParts} variant="canvas" showButtonHandles prominentHandles />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => data?.onChooseTemplate?.()}
          className="nodrag mt-1 w-full rounded-md bg-white border border-gray-300 px-2 py-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 transition"
        >
          Choose Template
        </button>
      )}
      <div className="mt-2 text-[11px] text-gray-600">Add upto 20 Meta Ads to begin flow</div>
      <div className="mt-1 w-full rounded-md bg-white border border-gray-300 px-2 py-2 text-[12px] font-semibold text-gray-700 text-center">
        Choose Facebook Ad
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="start-bottom-source"
        className={FLOW_HANDLE_PROMINENT}
      />
    </div>
  );
}

function TextNode({ data }) {
  return (
    <FlowNodeShell selected={data?.selected}>
      <FlowAiKeywordField value={data?.aiKeywords} onChange={(v) => data?.onChange?.({ aiKeywords: v })} />
      <div className="relative rounded-lg border border-gray-300 bg-white">
        <textarea
          className="nodrag w-full rounded-lg bg-white px-2.5 py-2 text-xs text-gray-800 min-h-[72px] resize-none focus:outline-none focus:ring-2 focus:ring-sky-300/60"
          placeholder="Type message..."
          value={data?.text || ""}
          onChange={(e) => data?.onChange?.({ text: e.target.value })}
        />
        <CharCounter value={data?.text} max={1024} />
      </div>
      <Handle type="source" position={Position.Bottom} className={FLOW_HANDLE} />
    </FlowNodeShell>
  );
}

function CharCounter({ value, max }) {
  return (
    <span className="absolute bottom-1.5 right-2 text-[10px] text-gray-400 pointer-events-none">
      {String(value || "").length}/{max}
    </span>
  );
}

function FlowInlineButtonsEditor({ buttonsList, onChange, showHandles = false }) {
  const list = Array.isArray(buttonsList) ? buttonsList : [];
  const updateButtons = (next) => onChange?.(syncButtonsData(next));

  if (showHandles) {
    return (
      <div className="space-y-2 overflow-visible">
        <div className="rounded-lg border border-gray-300 bg-white overflow-visible divide-y divide-gray-200">
          {list.map((btn, i) => (
            <div
              key={`btn-row-${i}`}
              className="relative flex items-center min-h-[40px] pr-9 overflow-visible group"
            >
              <input
                className="nodrag flex-1 min-w-0 bg-transparent px-2 py-2 text-center text-xs font-semibold text-[#008069] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-300/50 rounded-md"
                placeholder={`Button ${i + 1}`}
                value={btn}
                onChange={(e) => {
                  const next = [...list];
                  next[i] = e.target.value;
                  updateButtons(next);
                }}
              />
              <button
                type="button"
                className="nodrag absolute left-1 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => updateButtons(list.filter((_, idx) => idx !== i))}
                title="Remove button"
                aria-label="Remove button"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <Handle
                type="source"
                position={Position.Right}
                id={`btn-${i}`}
                className={FLOW_HANDLE_SIDE_PROMINENT}
                style={{ right: -14, top: "50%", transform: "translateY(-50%)" }}
              />
            </div>
          ))}
        </div>
        <button
          type="button"
          className="nodrag w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          onClick={() => updateButtons([...list, ""])}
        >
          + Add Button
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {list.map((btn, i) => (
        <div key={`btn-row-${i}`} className={`relative flex items-center gap-1 ${showHandles ? "pr-6" : ""}`}>
          <input
            className="nodrag flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs font-semibold text-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
            placeholder={`Button ${i + 1}`}
            value={btn}
            onChange={(e) => {
              const next = [...list];
              next[i] = e.target.value;
              updateButtons(next);
            }}
          />
          <button
            type="button"
            className="nodrag shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-200 text-rose-600 hover:bg-rose-50"
            onClick={() => updateButtons(list.filter((_, idx) => idx !== i))}
            title="Remove button"
            aria-label="Remove button"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {showHandles ? (
            <Handle
              type="source"
              position={Position.Right}
              id={`btn-${i}`}
              className={FLOW_HANDLE_SIDE_PROMINENT}
              style={{ right: -14, top: "50%", transform: "translateY(-50%)" }}
            />
          ) : null}
        </div>
      ))}
      <button
        type="button"
        className="nodrag w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        onClick={() => updateButtons([...list, ""])}
      >
        + Add Button
      </button>
    </div>
  );
}

function newFlowContentBlockId() {
  return `cb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultButtonContentBlock() {
  return {
    id: newFlowContentBlockId(),
    aiKeywords: "",
    message: "",
    text: "",
    buttonsList: [""],
    delaySeconds: "",
    timeoutEnabled: false,
  };
}

function defaultSingleProductContentBlock() {
  return {
    id: newFlowContentBlockId(),
    aiKeywords: "",
    productName: "",
    mediaUrl: "",
    imageUrl: "",
    mediaFilename: "",
    body: "",
    footer: "",
    text: "",
  };
}

function defaultMultiProductContentBlock() {
  return {
    id: newFlowContentBlockId(),
    aiKeywords: "",
    header: "",
    title: "",
    body: "",
    footer: "",
    productsList: [],
    products: "",
    sections: [],
  };
}

function normalizeButtonContentBlocks(data) {
  if (Array.isArray(data?.contentBlocks) && data.contentBlocks.length) {
    return data.contentBlocks.map((b, i) => ({
      ...defaultButtonContentBlock(),
      ...b,
      id: b?.id || `cb-${i}`,
      buttonsList: Array.isArray(b?.buttonsList)
        ? b.buttonsList
        : parseCommaList(b?.buttons).length
          ? parseCommaList(b?.buttons)
          : [""],
    }));
  }
  const buttonsList = Array.isArray(data?.buttonsList)
    ? data.buttonsList
    : parseCommaList(data?.buttons).length
      ? parseCommaList(data?.buttons)
      : [""];
  return [
    {
      id: "cb-0",
      aiKeywords: data?.aiKeywords || "",
      message: data?.message || data?.text || "",
      text: data?.text || data?.message || "",
      buttonsList,
      delaySeconds: "",
      timeoutEnabled: false,
    },
  ];
}

function syncButtonNodeFromContentBlocks(blocks) {
  const first = blocks[0] || defaultButtonContentBlock();
  const btnPatch = syncButtonsData(first.buttonsList || [""]);
  return {
    contentBlocks: blocks,
    aiKeywords: first.aiKeywords || "",
    message: first.message || first.text || "",
    text: first.text || first.message || "",
    ...btnPatch,
  };
}

function normalizeSingleProductContentBlocks(data) {
  if (Array.isArray(data?.contentBlocks) && data.contentBlocks.length) {
    return data.contentBlocks.map((b, i) => ({
      ...defaultSingleProductContentBlock(),
      ...b,
      id: b?.id || `cb-${i}`,
    }));
  }
  return [
    {
      id: "cb-0",
      aiKeywords: data?.aiKeywords || "",
      productName: data?.productName || "",
      mediaUrl: data?.mediaUrl || data?.imageUrl || "",
      imageUrl: data?.imageUrl || data?.mediaUrl || "",
      mediaFilename: data?.mediaFilename || "",
      body: data?.body || data?.text || "",
      footer: data?.footer || "",
      text: data?.text || data?.body || "",
    },
  ];
}

function syncSingleProductFromContentBlocks(blocks) {
  const first = blocks[0] || defaultSingleProductContentBlock();
  return {
    contentBlocks: blocks,
    aiKeywords: first.aiKeywords || "",
    productName: first.productName || "",
    mediaUrl: first.mediaUrl || first.imageUrl || "",
    imageUrl: first.imageUrl || first.mediaUrl || "",
    mediaFilename: first.mediaFilename || "",
    body: first.body || first.text || "",
    footer: first.footer || "",
    text: first.text || first.body || "",
  };
}

function normalizeMultiProductContentBlocks(data) {
  if (Array.isArray(data?.contentBlocks) && data.contentBlocks.length) {
    return data.contentBlocks.map((b, i) => ({
      ...defaultMultiProductContentBlock(),
      ...b,
      id: b?.id || `cb-${i}`,
      productsList: Array.isArray(b?.productsList)
        ? b.productsList
        : parseCommaList(b?.products),
    }));
  }
  const productsList = Array.isArray(data?.productsList)
    ? data.productsList
    : parseCommaList(data?.products);
  return [
    {
      id: "cb-0",
      aiKeywords: data?.aiKeywords || "",
      header: data?.header || data?.title || "",
      title: data?.title || data?.header || "",
      body: data?.body || "",
      footer: data?.footer || "",
      productsList,
      products: data?.products || productsList.join(", "),
      sections: Array.isArray(data?.sections) ? data.sections : [],
    },
  ];
}

function syncMultiProductFromContentBlocks(blocks) {
  const first = blocks[0] || defaultMultiProductContentBlock();
  const productsList = Array.isArray(first.productsList) ? first.productsList : [];
  return {
    contentBlocks: blocks,
    aiKeywords: first.aiKeywords || "",
    header: first.header || first.title || "",
    title: first.title || first.header || "",
    body: first.body || "",
    footer: first.footer || "",
    productsList,
    products: first.products || productsList.join(", "),
    sections: Array.isArray(first.sections) ? first.sections : [],
  };
}

function FlowContentBlockFrame({ children, onRemove, showRemove }) {
  return (
    <div className="rounded-lg border-2 border-red-300/90 bg-white/80 p-2 mb-2 space-y-2">
      {showRemove ? (
        <div className="flex justify-end">
          <button
            type="button"
            className="nodrag text-[10px] font-semibold text-rose-600 hover:text-rose-700"
            onClick={onRemove}
          >
            Remove block
          </button>
        </div>
      ) : null}
      {children}
    </div>
  );
}

function FlowAddContentButton({ onClick }) {
  return (
    <button
      type="button"
      className="nodrag w-full rounded-lg border border-gray-300 bg-white px-2 py-2.5 text-xs font-semibold text-gray-800 hover:bg-gray-50 shadow-sm"
      onClick={onClick}
    >
      + Add Content
    </button>
  );
}

function FlowDelayTimeoutFields({ delaySeconds, timeoutEnabled, onChange }) {
  return (
    <div className="space-y-2 pt-1 border-t border-gray-200">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[11px] text-gray-600">Set Delay</span>
          <span className="text-[9px] font-bold uppercase tracking-wide text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
            PRO
          </span>
        </div>
        <input
          className="nodrag w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-300/60"
          placeholder="Type delay in seconds..."
          value={delaySeconds || ""}
          onChange={(e) => onChange?.({ delaySeconds: e.target.value })}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-gray-600">Set Timeout</span>
          <span className="text-[9px] font-bold uppercase tracking-wide text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded">
            PRO
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(timeoutEnabled)}
          className={`relative w-9 h-5 rounded-full transition-colors ${timeoutEnabled ? "bg-emerald-500" : "bg-gray-300"}`}
          onClick={() => onChange?.({ timeoutEnabled: !timeoutEnabled })}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${timeoutEnabled ? "left-4" : "left-0.5"}`}
          />
        </button>
      </div>
    </div>
  );
}

function SingleProductMediaPick({ block, onBlockChange }) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const preview = resolveFlowMediaPreviewUrl(block?.mediaUrl || block?.imageUrl || "");

  const applyMedia = (item) => {
    const stored = toStoredFlowMediaUrl(item?.url);
    onBlockChange?.({
      mediaUrl: stored,
      imageUrl: stored,
      mediaFilename: item?.filename || stored.split("/").pop() || "",
      productName: block?.productName || item?.filename || "Product",
    });
    setLibraryOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className="nodrag w-full rounded-lg border border-gray-300 bg-white min-h-[88px] flex flex-col items-center justify-center text-xs text-gray-600 hover:bg-gray-50 overflow-hidden"
        onClick={() => setLibraryOpen(true)}
      >
        {preview ? (
          <img src={preview} alt="" className="w-full h-24 object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
        ) : (
          <>
            <span className="text-lg mb-1">🛒</span>
            {block?.productName ? block.productName : "+ Add Product"}
          </>
        )}
      </button>
      <FlowMediaLibraryModal
        open={libraryOpen}
        mediaType="IMAGE"
        onClose={() => setLibraryOpen(false)}
        onSelect={applyMedia}
        onUploadFile={async (file) => {
          const result = await uploadFlowMedia(file);
          const stored = toStoredFlowMediaUrl(result.storedPath || result.url);
          applyMedia({
            url: stored,
            filename: result.filename || file.name,
            mediaType: "IMAGE",
          });
        }}
        uploading={false}
        uploadPct={0}
        refreshKey={0}
      />
    </>
  );
}

function ButtonNode({ data }) {
  const blocks = normalizeButtonContentBlocks(data);

  const updateBlocks = (nextBlocks) => {
    data?.onChange?.(syncButtonNodeFromContentBlocks(nextBlocks));
  };

  const patchBlock = (index, patch) => {
    const next = blocks.map((b, i) => (i === index ? { ...b, ...patch } : b));
    updateBlocks(next);
  };

  return (
    <FlowNodeShell selected={data?.selected} minWidth="min-w-[300px]" overflowVisible>
      {blocks.map((block, blockIndex) => {
        const buttonsList = Array.isArray(block.buttonsList) ? block.buttonsList : [""];
        return (
          <FlowContentBlockFrame
            key={block.id || `btn-block-${blockIndex}`}
            showRemove={blocks.length > 1}
            onRemove={() => updateBlocks(blocks.filter((_, i) => i !== blockIndex))}
          >
            <FlowAiKeywordField
              value={block.aiKeywords}
              onChange={(v) => patchBlock(blockIndex, { aiKeywords: v })}
            />
            <div className="relative rounded-lg border border-gray-300 bg-white">
              <textarea
                className="nodrag w-full rounded-lg bg-white px-2.5 py-2 text-xs text-gray-800 min-h-[88px] resize-none focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                placeholder="Type message..."
                value={block.message || block.text || ""}
                onChange={(e) =>
                  patchBlock(blockIndex, { message: e.target.value, text: e.target.value })
                }
              />
              <CharCounter value={block.message || block.text} max={1024} />
            </div>
            <FlowInlineButtonsEditor
              buttonsList={buttonsList}
              onChange={(patch) => patchBlock(blockIndex, patch)}
              showHandles={blockIndex === 0}
            />
            <FlowDelayTimeoutFields
              delaySeconds={block.delaySeconds}
              timeoutEnabled={block.timeoutEnabled}
              onChange={(patch) => patchBlock(blockIndex, patch)}
            />
          </FlowContentBlockFrame>
        );
      })}
      <FlowAddContentButton onClick={() => updateBlocks([...blocks, defaultButtonContentBlock()])} />
      <Handle type="source" position={Position.Bottom} className={FLOW_HANDLE} />
    </FlowNodeShell>
  );
}

function ImageNode({ data }) {
  const mediaUrl = resolveFlowMediaPreviewUrl(data?.mediaUrl || data?.imageUrl || "");
  const mediaType = normalizeFlowMediaType(data?.mediaType);
  const buttonsList = Array.isArray(data?.buttonsList) ? data.buttonsList : parseCommaList(data?.buttons);

  return (
    <FlowNodeShell selected={data?.selected} minWidth="min-w-[300px]" overflowVisible>
      <FlowAiKeywordField value={data?.aiKeywords} onChange={(v) => data?.onChange?.({ aiKeywords: v })} />
      <div className="text-[11px] text-gray-600 mb-1">Select media type</div>
      <select
        className="nodrag w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
        value={mediaType}
        onChange={(e) => data?.onChange?.({ mediaType: e.target.value })}
      >
        <option value="IMAGE">Image</option>
        <option value="VIDEO">Video</option>
        <option value="DOCUMENT">Document</option>
      </select>
      <FlowMediaAttachField
        compact
        mediaType={mediaType}
        mediaUrl={data?.mediaUrl || data?.imageUrl || ""}
        mediaFilename={data?.mediaFilename}
        onChange={(patch) => data?.onChange?.(patch)}
      />
      <div className="rounded-lg border border-gray-300 bg-white min-h-[100px] flex flex-col items-center justify-center overflow-hidden mb-2">
        {mediaUrl ? (
          mediaType === "VIDEO" ? (
            <video src={mediaUrl} className="w-full h-24 object-cover" controls muted playsInline />
          ) : mediaType === "DOCUMENT" ? (
            <div className="text-xs text-gray-600 p-3 text-center break-all">📄 {data?.mediaFilename || mediaUrl}</div>
          ) : (
            <img src={mediaUrl} alt="" className="w-full h-24 object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          )
        ) : (
          <div className="text-xs text-gray-400 py-6 px-3 text-center">No file attached yet</div>
        )}
      </div>
      <div className="relative rounded-lg border border-gray-300 bg-white mb-2">
        <textarea
          className="nodrag w-full rounded-lg bg-white px-2.5 py-2 text-xs min-h-[64px] resize-none focus:outline-none focus:ring-2 focus:ring-sky-300/60"
          placeholder="Caption..."
          value={data?.caption || ""}
          onChange={(e) => data?.onChange?.({ caption: e.target.value })}
        />
        <CharCounter value={data?.caption} max={1024} />
      </div>
      <div className="mt-2">
        <div className="text-[11px] text-gray-600 mb-1">Buttons</div>
        <FlowInlineButtonsEditor
          buttonsList={buttonsList.length ? buttonsList : [""]}
          onChange={(patch) => data?.onChange?.(patch)}
          showHandles
        />
      </div>
      <Handle type="source" position={Position.Bottom} className={FLOW_HANDLE} />
    </FlowNodeShell>
  );
}

function QuestionNode({ data }) {
  const selectedFormat = data?.attributeFormat || "any";
  const hasTemplate = Boolean(data?.templateName);
  const templateParts = resolveNodeTemplateParts(data);

  return (
    <div className="rounded-2xl border-4 border-emerald-600 bg-[#f2f2f2] shadow-sm p-2 min-w-[320px] max-w-[360px] relative overflow-visible">
      <Handle
        type="target"
        position={Position.Left}
        className={FLOW_HANDLE_SIDE_PROMINENT}
        style={{ left: -11, top: "50%", transform: "translateY(-50%)" }}
      />
      <div className="rounded-lg bg-white border border-gray-300 px-2 py-1 text-[11px] font-bold text-teal-700 flex items-center gap-1.5">
        <span aria-hidden>❓</span>
        <span>Question</span>
      </div>
      <div className="mt-2 relative rounded-lg border border-gray-300 bg-white">
        <textarea
          className="nodrag w-full rounded-lg bg-white px-2.5 py-2 text-xs text-gray-800 min-h-[88px] resize-none focus:outline-none focus:ring-2 focus:ring-sky-300/60"
          placeholder="Type your question..."
          value={data?.question || ""}
          onChange={(e) => data?.onChange?.({ question: e.target.value })}
        />
        <CharCounter value={data?.question} max={1024} />
      </div>
      <div className="mt-2">
        <div className="text-[11px] text-gray-600 mb-1">Capture answer attribute</div>
        <select
          className="nodrag w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-300/60"
          value={data?.captureAttribute || ""}
          onChange={(e) => data?.onChange?.({ captureAttribute: e.target.value })}
        >
          <option value="">Select attribute</option>
          {QUESTION_CAPTURE_ATTRIBUTES.map((attr) => (
            <option key={attr} value={attr}>
              {attr}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2">
        <div className="text-[11px] text-gray-600 mb-1">Attribute Format</div>
        <div className="flex flex-wrap gap-1.5">
          {QUESTION_ATTRIBUTE_FORMATS.map((fmt) => {
            const active = selectedFormat === fmt.value;
            return (
              <button
                key={fmt.value}
                type="button"
                className={`nodrag rounded-md border px-2 py-1 text-[10px] font-semibold transition ${active
                    ? "border-sky-500 bg-sky-50 text-sky-800 shadow-sm"
                    : "border-gray-300 bg-white text-gray-600 hover:border-sky-200 hover:bg-sky-50/50"
                  }`}
                onClick={() => data?.onChange?.({ attributeFormat: fmt.value })}
              >
                {fmt.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2">
        <div className="text-[11px] text-gray-600 mb-1">Format error message</div>
        <input
          className="nodrag w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-300/60"
          placeholder={defaultQuestionFormatErrorMessage(selectedFormat)}
          value={data?.formatErrorMessage || ""}
          onChange={(e) => data?.onChange?.({ formatErrorMessage: e.target.value })}
        />
      </div>
      {selectedFormat === "regex" ? (
        <div className="mt-2">
          <div className="text-[11px] text-gray-600 mb-1">Regex pattern</div>
          <input
            className="nodrag w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-sky-300/60"
            placeholder="e.g. ^[A-Z].+"
            value={data?.formatRegex || ""}
            onChange={(e) => data?.onChange?.({ formatRegex: e.target.value })}
          />
        </div>
      ) : null}
      <div className="mt-2 text-[11px] text-gray-600">Add upto 1 template for this question</div>
      {hasTemplate ? (
        <div className="mt-1 rounded-md bg-white border border-gray-300 overflow-visible pr-1">
          <div className="px-2 py-1 text-[10px] text-gray-500 border-b border-gray-200 flex items-center justify-between gap-2">
            <span className="truncate font-semibold text-gray-700">{data.templateName}</span>
            <button
              type="button"
              onClick={() => data?.onDeleteTemplate?.()}
              className="shrink-0 inline-flex items-center justify-center h-5 w-5 rounded text-rose-600 hover:text-rose-700 hover:bg-rose-50"
              title="Delete selected template"
              aria-label="Delete selected template"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
          <FlowTemplateHeaderMediaField data={data} onChange={(patch) => data?.onChange?.(patch)} />
          <FlowTemplatePreviewCard parts={templateParts} variant="canvas" showButtonHandles prominentHandles />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => data?.onChooseTemplate?.()}
          className="mt-1 w-full rounded-md bg-white border border-gray-300 px-2 py-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 transition"
        >
          Choose Template
        </button>
      )}
      <Handle type="source" position={Position.Bottom} className={FLOW_HANDLE_PROMINENT} />
    </div>
  );
}

function ListMessageNode({ data }) {
  const sections = Array.isArray(data?.sections) ? data.sections : [];

  return (
    <FlowNodeShell selected={data?.selected} minWidth="min-w-[300px]" overflowVisible>
      <FlowAiKeywordField value={data?.aiKeywords} onChange={(v) => data?.onChange?.({ aiKeywords: v })} />
      <div className="rounded-lg border border-gray-300 bg-white overflow-hidden mb-2">
        <div className="relative border-b border-gray-200">
          <input
            className="nodrag w-full bg-white px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-300/60"
            placeholder="Header"
            value={data?.header || ""}
            onChange={(e) => data?.onChange?.({ header: e.target.value })}
          />
          <CharCounter value={data?.header} max={20} />
        </div>
        <div className="relative border-b border-gray-200">
          <textarea
            className="nodrag w-full bg-white px-2.5 py-2 text-xs min-h-[72px] resize-none focus:outline-none focus:ring-2 focus:ring-sky-300/60"
            placeholder="Body"
            value={data?.body || data?.title || ""}
            onChange={(e) => data?.onChange?.({ body: e.target.value, title: e.target.value })}
          />
          <CharCounter value={data?.body || data?.title} max={1024} />
        </div>
        <div className="relative">
          <input
            className="nodrag w-full bg-white px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-300/60"
            placeholder="Footer"
            value={data?.footer || ""}
            onChange={(e) => data?.onChange?.({ footer: e.target.value })}
          />
          <CharCounter value={data?.footer} max={60} />
        </div>
      </div>
      <button
        type="button"
        className="nodrag w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 mb-2"
        onClick={() => {
          const title = window.prompt("Section title");
          if (title) data?.onChange?.({ sections: [...sections, { title, items: [] }] });
        }}
      >
        + Add Section
      </button>
      {sections.length > 0 ? (
        <div className="mb-2 space-y-1">
          {sections.map((s, i) => (
            <div key={`sec-${i}`} className="text-[11px] text-gray-700 rounded border border-gray-200 bg-white px-2 py-1">
              {s.title || `Section ${i + 1}`}
            </div>
          ))}
        </div>
      ) : null}
      <div className="rounded-lg border border-gray-300 bg-white px-2 py-2.5 text-center text-sm font-semibold text-sky-700">
        <input
          className="nodrag w-full text-center text-sm font-semibold text-sky-700 focus:outline-none"
          value={data?.listButton || "list"}
          onChange={(e) => data?.onChange?.({ listButton: e.target.value })}
        />
      </div>
      <Handle type="source" position={Position.Bottom} className={FLOW_HANDLE} />
    </FlowNodeShell>
  );
}

function SingleProductNode({ data }) {
  const blocks = normalizeSingleProductContentBlocks(data);

  const updateBlocks = (nextBlocks) => {
    data?.onChange?.(syncSingleProductFromContentBlocks(nextBlocks));
  };

  const patchBlock = (index, patch) => {
    const next = blocks.map((b, i) => (i === index ? { ...b, ...patch } : b));
    updateBlocks(next);
  };

  return (
    <FlowNodeShell selected={data?.selected} minWidth="min-w-[280px]">
      {blocks.map((block, blockIndex) => (
        <FlowContentBlockFrame
          key={block.id || `sp-block-${blockIndex}`}
          showRemove={blocks.length > 1}
          onRemove={() => updateBlocks(blocks.filter((_, i) => i !== blockIndex))}
        >
          <FlowAiKeywordField
            value={block.aiKeywords}
            onChange={(v) => patchBlock(blockIndex, { aiKeywords: v })}
          />
          <SingleProductMediaPick block={block} onBlockChange={(patch) => patchBlock(blockIndex, patch)} />
          <input
            className="nodrag w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-sky-300/60"
            placeholder="Body"
            value={block.body || block.text || ""}
            onChange={(e) => patchBlock(blockIndex, { body: e.target.value, text: e.target.value })}
          />
          <input
            className="nodrag w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-300/60"
            placeholder="Footer"
            value={block.footer || ""}
            onChange={(e) => patchBlock(blockIndex, { footer: e.target.value })}
          />
        </FlowContentBlockFrame>
      ))}
      <FlowAddContentButton
        onClick={() => updateBlocks([...blocks, defaultSingleProductContentBlock()])}
      />
      <Handle type="source" position={Position.Bottom} className={FLOW_HANDLE} />
    </FlowNodeShell>
  );
}

function MultiProductNode({ data }) {
  const blocks = normalizeMultiProductContentBlocks(data);

  const updateBlocks = (nextBlocks) => {
    data?.onChange?.(syncMultiProductFromContentBlocks(nextBlocks));
  };

  const patchBlock = (index, patch) => {
    const next = blocks.map((b, i) => (i === index ? { ...b, ...patch } : b));
    updateBlocks(next);
  };

  return (
    <FlowNodeShell selected={data?.selected} minWidth="min-w-[300px]" overflowVisible>
      {blocks.map((block, blockIndex) => {
        const productsList = Array.isArray(block.productsList) ? block.productsList : [];
        const sections = Array.isArray(block.sections) ? block.sections : [];
        return (
          <FlowContentBlockFrame
            key={block.id || `mp-block-${blockIndex}`}
            showRemove={blocks.length > 1}
            onRemove={() => updateBlocks(blocks.filter((_, i) => i !== blockIndex))}
          >
            <FlowAiKeywordField
              value={block.aiKeywords}
              onChange={(v) => patchBlock(blockIndex, { aiKeywords: v })}
            />
            <div className="rounded-lg border border-gray-300 bg-white overflow-hidden">
              <div className="relative border-b border-gray-200">
                <input
                  className="nodrag w-full bg-white px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                  placeholder="Header"
                  value={block.header || block.title || ""}
                  onChange={(e) =>
                    patchBlock(blockIndex, { header: e.target.value, title: e.target.value })
                  }
                />
                <CharCounter value={block.header || block.title} max={20} />
              </div>
              <div className="relative">
                <textarea
                  className="nodrag w-full bg-white px-2.5 py-2 text-xs min-h-[72px] resize-none focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                  placeholder="Body"
                  value={block.body || ""}
                  onChange={(e) => patchBlock(blockIndex, { body: e.target.value })}
                />
                <CharCounter value={block.body} max={1024} />
              </div>
            </div>
            <button
              type="button"
              className="nodrag w-full rounded-lg border border-gray-300 bg-white px-2 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              onClick={() => {
                const title = window.prompt("Section title");
                if (title) {
                  patchBlock(blockIndex, { sections: [...sections, { title, items: [] }] });
                }
              }}
            >
              + Add Section
            </button>
            {sections.length > 0 ? (
              <div className="space-y-1">
                {sections.map((s, si) => (
                  <div
                    key={`sec-${blockIndex}-${si}`}
                    className="text-[11px] text-gray-700 rounded border border-gray-200 bg-white px-2 py-1"
                  >
                    {s.title || `Section ${si + 1}`}
                  </div>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="nodrag w-full rounded-lg border border-gray-300 bg-white min-h-[72px] flex flex-col items-center justify-center text-xs text-gray-600 hover:bg-gray-50"
              onClick={() => {
                const name = window.prompt("Product name");
                if (name) {
                  const nextList = [...productsList, name];
                  patchBlock(blockIndex, {
                    productsList: nextList,
                    products: nextList.join(", "),
                  });
                }
              }}
            >
              <span className="text-lg mb-1">🛒</span>
              + Add Products
            </button>
            {productsList.length > 0 ? (
              <div className="grid grid-cols-2 gap-1">
                {productsList.map((p) => (
                  <div key={p} className="rounded border border-gray-200 bg-white px-2 py-1 text-[11px] truncate">
                    {p}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="relative rounded-lg border border-gray-300 bg-white">
              <input
                className="nodrag w-full bg-white px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-300/60"
                placeholder="Footer"
                value={block.footer || ""}
                onChange={(e) => patchBlock(blockIndex, { footer: e.target.value })}
              />
              <CharCounter value={block.footer} max={60} />
            </div>
            <div className="rounded-lg border border-gray-300 bg-white px-2 py-2.5 text-center text-sm font-semibold text-sky-700">
              View Items
            </div>
          </FlowContentBlockFrame>
        );
      })}
      <FlowAddContentButton
        onClick={() => updateBlocks([...blocks, defaultMultiProductContentBlock()])}
      />
      <Handle type="source" position={Position.Bottom} className={FLOW_HANDLE} />
    </FlowNodeShell>
  );
}

function TemplateNode({ data }) {
  const hasTemplate = Boolean(data?.templateName);
  const templateParts = resolveNodeTemplateParts(data);

  return (
    <FlowNodeShell selected={data?.selected} minWidth="min-w-[320px]">
      <FlowAiKeywordField value={data?.aiKeywords} onChange={(v) => data?.onChange?.({ aiKeywords: v })} />
      {hasTemplate ? (
        <div className="rounded-lg border border-gray-300 bg-white overflow-visible pr-1">
          <div className="px-2 py-1 text-[10px] text-gray-500 border-b border-gray-200 flex items-center justify-between gap-2">
            <span className="truncate font-semibold text-gray-700">{data.templateName}</span>
            <button
              type="button"
              className="nodrag shrink-0 text-rose-600 hover:text-rose-700 text-xs font-bold"
              onClick={() => data?.onDeleteTemplate?.()}
            >
              ×
            </button>
          </div>
          <FlowTemplateHeaderMediaField data={data} onChange={(patch) => data?.onChange?.(patch)} />
          <FlowTemplatePreviewCard parts={templateParts} variant="canvas" showButtonHandles prominentHandles />
        </div>
      ) : (
        <button
          type="button"
          className="nodrag w-full rounded-lg border border-gray-300 bg-white min-h-[120px] flex items-center justify-center text-sm font-semibold text-gray-700 hover:bg-gray-50"
          onClick={() => data?.onChooseTemplate?.()}
        >
          Select Template
        </button>
      )}
      <Handle type="source" position={Position.Bottom} className={FLOW_HANDLE} />
    </FlowNodeShell>
  );
}

const SET_ATTRIBUTE_DEFAULTS = [
  "name",
  "phone",
  "email",
  "city",
  "order_id",
  "custom_field_1",
  "custom_field_2",
];

function SetAttributeNode({ data }) {
  const [userAttributes, setUserAttributes] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchUserAttributes();
        if (!cancelled) {
          setUserAttributes(
            (Array.isArray(list) ? list : [])
              .map((item) => String(item?.name || "").trim())
              .filter(Boolean)
          );
        }
      } catch (_) {
        if (!cancelled) setUserAttributes([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const attributes = useMemo(() => {
    const merged = [...SET_ATTRIBUTE_DEFAULTS];
    userAttributes.forEach((name) => {
      if (name && !merged.includes(name)) merged.push(name);
    });
    const selected = String(data?.attribute || "").trim();
    if (selected && !merged.includes(selected)) {
      merged.push(selected);
    }
    return merged;
  }, [userAttributes, data?.attribute]);

  return (
    <FlowNodeShell selected={data?.selected} minWidth="min-w-[260px]">
      <div className="text-[11px] text-gray-600 mb-1">Select Attribute</div>
      <div className="relative mb-2">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
        <select
          className="nodrag w-full rounded-lg border border-gray-300 bg-white pl-6 pr-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-300/60"
          value={data?.attribute || ""}
          onChange={(e) => data?.onChange?.({ attribute: e.target.value })}
        >
          <option value="">Select attribute</option>
          {attributes.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <div className="text-[11px] text-gray-600 mb-1">Enter or paste value</div>
      <input
        className="nodrag w-full rounded-lg border border-gray-300 bg-white px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-sky-300/60"
        placeholder="Type value..."
        value={data?.attributeValue || ""}
        onChange={(e) => data?.onChange?.({ attributeValue: e.target.value })}
      />
      <Handle type="source" position={Position.Bottom} className={FLOW_HANDLE} />
    </FlowNodeShell>
  );
}

function nodeDataDefaults(type) {
  switch (type) {
    case "start":
      return {
        keywords: "",
        regexEnabled: false,
        regex: "",
        templateName: "",
        templateId: null,
      };
    case "text":
      return { text: "", aiKeywords: "" };
    case "image":
      return { mediaType: "IMAGE", mediaUrl: "", imageUrl: "", caption: "", aiKeywords: "", buttonsList: [] };
    case "question":
      return {
        question: "",
        captureAttribute: "",
        attributeFormat: "any",
        formatErrorMessage: "",
        formatRegex: "",
        options: "",
        aiKeywords: "",
        templateName: "",
        templateId: null,
        templateContent: "",
        templateButtons: [],
        templateParts: null,
      };
    case "button":
      return { message: "", text: "", buttonsList: [""], buttons: "", aiKeywords: "" };
    case "template":
      return {
        aiKeywords: "",
        templateName: "",
        templateId: null,
        templateContent: "",
        templateButtons: [],
        templateParts: null,
      };
    case "list_message":
      return { header: "", body: "", footer: "", listButton: "list", sections: [], aiKeywords: "" };
    case "single_product":
      return { productName: "", body: "", footer: "", text: "", aiKeywords: "" };
    case "multi_product":
      return { header: "", body: "", footer: "", title: "", productsList: [], products: "", aiKeywords: "" };
    case "set_attribute":
      return { attribute: "", attributeValue: "" };
    default:
      return {};
  }
}

function sanitizeNodesForSave(nodes) {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.position?.x || 0, y: n.position?.y || 0 },
    data: Object.fromEntries(
      Object.entries(n.data || {}).filter(([, value]) => typeof value !== "function")
    ),
  }));
}

function sanitizeEdgesForSave(edges) {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || null,
    targetHandle: e.targetHandle || null,
    label: e.label || e.data?.label || "",
    data: e.data || {},
  }));
}

function Flows() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const flowWrapperRef = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);

  const initialNodes = useMemo(
    () => [
      {
        id: "start",
        type: "start",
        position: { x: 240, y: 80 },
        data: nodeDataDefaults("start"),
      },
    ],
    []
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const selectedEdge = useMemo(() => edges.find((e) => e.id === selectedEdgeId) || null, [edges, selectedEdgeId]);

  const [connectStart, setConnectStart] = useState(null);
  const [insertModalOpen, setInsertModalOpen] = useState(false);
  const [pendingInsert, setPendingInsert] = useState(null); // { sourceNodeId, sourceHandleId, position }

  const [flowName, setFlowName] = useState("My Flow");
  const [savedFlowId, setSavedFlowId] = useState(null);
  const [planLimitModal, setPlanLimitModal] = useState(null);
  const [flowStatus, setFlowStatus] = useState("draft");
  const [metaFlowId, setMetaFlowId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadingSavedFlow, setLoadingSavedFlow] = useState(false);
  const [savedFlowsList, setSavedFlowsList] = useState([]);
  const [loadingFlowsList, setLoadingFlowsList] = useState(false);
  const [deletingFlowId, setDeletingFlowId] = useState(null);

  const [testStarted, setTestStarted] = useState(false);
  const [testInput, setTestInput] = useState("");
  const [executionCurrentNodeId, setExecutionCurrentNodeId] = useState(null);
  const [executionLog, setExecutionLog] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [templatePickerLoading, setTemplatePickerLoading] = useState(false);
  const [templatePickerSearch, setTemplatePickerSearch] = useState("");
  const [approvedTemplates, setApprovedTemplates] = useState([]);
  const [templatePickerNodeId, setTemplatePickerNodeId] = useState("start");
  const [templateViewItem, setTemplateViewItem] = useState(null);
  const [templateViewHeaderDraft, setTemplateViewHeaderDraft] = useState({ url: "", filename: "" });
  const [mobilePanel, setMobilePanel] = useState(null); // 'palette' | 'config' | null

  const nodeTypes = useMemo(
    () => ({
      start: StartNode,
      text: TextNode,
      image: ImageNode,
      question: QuestionNode,
      button: ButtonNode,
      list_message: ListMessageNode,
      single_product: SingleProductNode,
      multi_product: MultiProductNode,
      template: TemplateNode,
      set_attribute: SetAttributeNode,
    }),
    []
  );

  const patchNodeData = useCallback(
    (nodeId, patch) => {
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId ? { ...node, data: { ...(node.data || {}), ...(patch || {}) } } : node
        )
      );
    },
    [setNodes]
  );

  const displayNodes = useMemo(
    () =>
      nodes.map((n) => {
        const overflowClass =
          n.type === "button" || n.type === "image" || n.type === "template" || n.type === "start"
            ? "flow-node-overflow-visible"
            : undefined;
        const base = {
          ...n,
          className: overflowClass,
          data: {
            ...(n.data || {}),
            selected: selectedNodeId === n.id,
            onChange: (patch) => patchNodeData(n.id, patch),
          },
        };

        if (n.type === "start") {
          return {
            ...base,
            data: {
              ...base.data,
              onChooseTemplate: () => {
                setTemplatePickerNodeId(n.id);
                setTemplatePickerOpen(true);
              },
              onDeleteTemplate: () => {
                patchNodeData(n.id, {
                  templateId: null,
                  templateName: "",
                  templateContent: "",
                  templateButtons: [],
                  templateParts: null,
                });
              },
            },
          };
        }

        if (n.type === "template") {
          return {
            ...base,
            data: {
              ...base.data,
              onChooseTemplate: () => {
                setTemplatePickerNodeId(n.id);
                setTemplatePickerOpen(true);
              },
              onDeleteTemplate: () => {
                patchNodeData(n.id, {
                  templateId: null,
                  templateName: "",
                  templateContent: "",
                  templateButtons: [],
                  templateParts: null,
                });
              },
            },
          };
        }

        if (n.type === "question") {
          return {
            ...base,
            data: {
              ...base.data,
              onChooseTemplate: () => {
                setTemplatePickerNodeId(n.id);
                setTemplatePickerOpen(true);
              },
              onDeleteTemplate: () => {
                patchNodeData(n.id, {
                  templateId: null,
                  templateName: "",
                  templateContent: "",
                  templateButtons: [],
                  templateParts: null,
                });
              },
            },
          };
        }

        return base;
      }),
    [nodes, patchNodeData, selectedNodeId]
  );

  useEffect(() => {
    const check = async () => {
      try {
        if (!isAuthenticated()) {
          navigate("/login");
          return;
        }
        const userData = await getProfile();
        setUser(userData);
      } catch (e) {
        logout();
        navigate("/login");
      } finally {
        setLoading(false);
      }
    };
    check();
  }, [navigate]);


  const fetchSavedFlowsList = useCallback(async () => {
    setLoadingFlowsList(true);
    try {
      const resp = await axios.get("/flows");
      if (resp?.data?.success && Array.isArray(resp.data.flows)) {
        const uniqueByName = [];
        const seenNames = new Set();
        for (const flow of resp.data.flows) {
          const key = String(flow?.name || "").trim().toLowerCase();
          if (!key || seenNames.has(key)) continue;
          seenNames.add(key);
          uniqueByName.push(flow);
        }
        setSavedFlowsList(uniqueByName);
      }
    } finally {
      setLoadingFlowsList(false);
    }
  }, []);

  const fetchApprovedTemplates = useCallback(async () => {
    setTemplatePickerLoading(true);
    try {
      const data = await getTemplates({ limit: 200 });
      const approved = (data.templates || []).filter((t) => {
        const st = String(t.status || "").toLowerCase();
        const ms = String(t.metaStatus || "").toUpperCase();
        return st === "approved" || ms === "APPROVED";
      });
      const list = await enrichTemplatesForFlow(approved);
      setApprovedTemplates(list);
    } catch (_) {
      setApprovedTemplates([]);
    } finally {
      setTemplatePickerLoading(false);
    }
  }, []);

  useEffect(() => {
    if (templatePickerOpen) {
      fetchApprovedTemplates();
    }
  }, [templatePickerOpen, fetchApprovedTemplates]);

  const filteredApprovedTemplates = useMemo(() => {
    const q = String(templatePickerSearch || "").trim().toLowerCase();
    if (!q) return approvedTemplates;
    return approvedTemplates.filter((t) =>
      String(t?.name || "").toLowerCase().includes(q)
    );
  }, [approvedTemplates, templatePickerSearch]);

  const applyStartTemplateSelection = useCallback(
    async (template, opts = {}) => {
      const nodeId = templatePickerNodeId || "start";
      const resolved = await resolveFlowTemplate(template);
      const templateParts = getTemplatePreviewParts(resolved);
      const pickedHeader =
        opts.headerMediaUrl ||
        templateParts?.headerImageUrl ||
        resolveDisplayableHeaderMediaUrl(
          resolved?.variables?.headerMediaUrl,
          resolved?.variables?.header_media_url,
          resolveHeaderImageFromComponents(resolved?.components || getTemplateComponentsList(resolved))
        ) ||
        null;
      const headerMediaUrl = pickedHeader ? toStoredFlowMediaUrl(pickedHeader) : null;
      const headerFormat =
        templateParts?.headerFormat ||
        resolveFlowTemplateHeaderMediaType(templateParts, resolved) ||
        "IMAGE";
      patchNodeData(nodeId, {
        templateId: resolved?.id || template?.id || null,
        templateName: resolved?.name || template?.name || "",
        templateContent: getTemplateBodyText(resolved),
        templateButtons: templateParts?.buttons || [],
        templateParts: headerMediaUrl
          ? {
              ...templateParts,
              headerImageUrl: resolvePublicMediaUrl(headerMediaUrl, FLOW_PUBLIC_BASE) || headerMediaUrl,
              headerFormat,
            }
          : templateParts,
        header_media_url: headerMediaUrl,
        headerMediaUrl,
        headerMediaFilename: opts.headerMediaFilename || "",
        templateLanguage:
          resolved?.variables?.language ||
          parseTemplateVariablesMeta(resolved?.variables)?.language ||
          template?.language ||
          "en_US",
      });
      setTemplatePickerOpen(false);
      setTemplatePickerSearch("");
      setTemplateViewHeaderDraft({ url: "", filename: "" });
    },
    [templatePickerNodeId, patchNodeData]
  );

  const requestUseFlowTemplate = useCallback(
    (template) => {
      const parts = getTemplatePreviewParts(template);
      if (flowTemplateNeedsHeaderMediaPick(parts, template, null)) {
        setTemplateViewHeaderDraft({ url: "", filename: "" });
        setTemplateViewItem(template);
        return;
      }
      applyStartTemplateSelection(template);
    },
    [applyStartTemplateSelection]
  );

  useEffect(() => {
    if (!loading) fetchSavedFlowsList();
  }, [loading, fetchSavedFlowsList]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      if (!reactFlowInstance) return;
      const type = event.dataTransfer.getData("application/reactflow");
      if (!type) return;

      const bounds = flowWrapperRef.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = reactFlowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const newNodeId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      setNodes((nds) =>
        nds.concat({
          id: newNodeId,
          type,
          position,
          data: nodeDataDefaults(type),
        })
      );
    },
    [reactFlowInstance, setNodes]
  );

  const getSourceOptionLabelForHandle = useCallback((sourceNode, handleId) => {
    return getButtonLabelFromNode(sourceNode, handleId);
  }, []);

  const onConnect = useCallback(
    (params) => {
      const sourceNode = nodes.find((n) => n.id === params?.source) || null;
      const defaultLabel = getSourceOptionLabelForHandle(sourceNode, params?.sourceHandle);

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            label: defaultLabel || "",
            data: { ...(params.data || {}), label: defaultLabel || "" },
          },
          eds
        )
      );
    },
    [getSourceOptionLabelForHandle, nodes, setEdges]
  );

  const onConnectStart = useCallback((event, params) => {
    const nodeId = params?.nodeId || null;
    const handleId = params?.handleId || null;
    setConnectStart({ nodeId, handleId });
  }, []);

  const onConnectEnd = useCallback(
    (event) => {
      if (!connectStart?.nodeId) {
        setConnectStart(null);
        return;
      }

      const overNode = event?.target?.closest?.(".react-flow__node");
      if (overNode) {
        setConnectStart(null);
        return;
      }

      if (!reactFlowInstance || !flowWrapperRef.current) {
        setConnectStart(null);
        return;
      }

      const sourceNode = nodes.find((n) => n.id === connectStart.nodeId) || null;
      if (!sourceNode) {
        setConnectStart(null);
        return;
      }

      const bounds = flowWrapperRef.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });
      const panelWidth = 280;
      const panelHeight = 360;
      const sx = Math.min(Math.max((event.clientX || 0) + 12, 8), (window.innerWidth || 1200) - panelWidth - 8);
      const sy = Math.min(Math.max((event.clientY || 0) + 12, 8), (window.innerHeight || 800) - panelHeight - 8);

      setPendingInsert({
        sourceNodeId: connectStart.nodeId,
        sourceHandleId: connectStart.handleId,
        position,
        screenPosition: { x: sx, y: sy },
      });
      setInsertModalOpen(true);
      setConnectStart(null);
    },
    [connectStart, reactFlowInstance, nodes]
  );

  const handleInsertNodeType = useCallback(
    (type) => {
      if (!pendingInsert) return;
      const sourceNode = nodes.find((n) => n.id === pendingInsert.sourceNodeId) || null;

      const newNodeId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const position = pendingInsert.position || { x: 0, y: 0 };

      setNodes((nds) =>
        nds.concat({
          id: newNodeId,
          type,
          position,
          data: nodeDataDefaults(type),
        })
      );

      const edgeLabel = getSourceOptionLabelForHandle(sourceNode, pendingInsert.sourceHandleId);

      setEdges((eds) =>
        addEdge(
          {
            source: pendingInsert.sourceNodeId,
            target: newNodeId,
            sourceHandle: pendingInsert.sourceHandleId,
            label: edgeLabel || "",
            data: { label: edgeLabel || "" },
          },
          eds
        )
      );

      setSelectedNodeId(newNodeId);
      setSelectedEdgeId(null);
      setPendingInsert(null);
      setInsertModalOpen(false);
      setConnectStart(null);
    },
    [
      pendingInsert,
      nodes,
      setNodes,
      setEdges,
      getSourceOptionLabelForHandle,
      setSelectedNodeId,
      setSelectedEdgeId,
    ]
  );

  const onNodeClick = useCallback((event, node) => {
    event.stopPropagation();
    setSelectedEdgeId(null);
    setSelectedNodeId(node.id);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobilePanel("config");
    }
  }, []);

  const onEdgeClick = useCallback((event, edge) => {
    event.stopPropagation();
    setSelectedNodeId(null);
    setSelectedEdgeId(edge.id);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobilePanel("config");
    }
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setMobilePanel(null);
  }, []);

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;

    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) =>
      eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId)
    );
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [selectedNodeId, setEdges, setNodes]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (!selectedNodeId) return;
      const tag = event.target?.tagName?.toLowerCase?.() || "";
      const isTypingField =
        tag === "input" ||
        tag === "textarea" ||
        event.target?.isContentEditable === true;
      if (isTypingField) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelectedNode();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedNodeId, deleteSelectedNode]);

  const updateSelectedNodeData = useCallback(
    (patch) => {
      if (!selectedNodeId) return;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== selectedNodeId) return n;
          return { ...n, data: { ...(n.data || {}), ...patch } };
        })
      );
    },
    [selectedNodeId, setNodes]
  );

  const updateSelectedEdgeLabel = useCallback(
    (label) => {
      if (!selectedEdgeId) return;
      setEdges((eds) =>
        eds.map((e) => {
          if (e.id !== selectedEdgeId) return e;
          return { ...e, label, data: { ...(e.data || {}), label } };
        })
      );
    },
    [selectedEdgeId, setEdges]
  );

  const contentBlockOptions = useMemo(
    () => [
      { key: "text_button", label: "Text + Button", nodeType: "button", icon: "💬" },
      { key: "media", label: "Media", nodeType: "image", icon: "🖼️" },
      { key: "list_message", label: "List Message", nodeType: "list_message", icon: "📋" },
      { key: "single_product", label: "Single Product Message", nodeType: "single_product", icon: "🛒" },
      { key: "multi_product", label: "Multi Product Message", nodeType: "multi_product", icon: "🧺" },
      { key: "template", label: "Template", nodeType: "template", icon: "📄" },
      { key: "ask_question", label: "Ask Question", nodeType: "question", icon: "❓" },
      { key: "set_attribute", label: "Set Attribute", nodeType: "set_attribute", icon: "🧾" },
    ],
    []
  );

  const palette = contentBlockOptions;

  const handleSaveFlow = useCallback(async () => {
    setSaving(true);
    try {
      if (!savedFlowId) {
        const precheck = await assertCanAddResource('flows');
        if (!precheck.allowed) {
          setPlanLimitModal(precheck);
          return;
        }
      }

      const payload = {
        name: String(flowName || "Untitled").trim() || "Untitled",
        data: {
          nodes: sanitizeNodesForSave(nodes),
          edges: sanitizeEdgesForSave(edges),
        },
      };

      const resp = savedFlowId
        ? await axios.put(`/flows/${savedFlowId}`, payload)
        : await axios.post("/flows", payload);
      if (resp?.data?.success) {
        setSavedFlowId(resp.data.flow?.id || savedFlowId || resp.data.flowId || null);
        fetchSavedFlowsList();
      }
    } catch (error) {
      const limitPayload = extractPlanLimitError(error);
      if (limitPayload) {
        setPlanLimitModal(limitPayload);
      } else {
        window.alert(error?.response?.data?.message || error?.message || "Failed to save flow");
      }
    } finally {
      setSaving(false);
    }
  }, [flowName, nodes, edges, savedFlowId, fetchSavedFlowsList]);

  const handlePublishFlow = useCallback(async () => {
    if (!savedFlowId) {
      window.alert("Save the flow first, then publish to Meta WhatsApp Flows.");
      return;
    }
    setPublishing(true);
    try {
      const resp = await axios.post(`/flows/${savedFlowId}/publish`, {
        categories: ["LEAD_GENERATION"],
      });
      if (resp?.data?.success) {
        setFlowStatus(resp.data.status || "published");
        setMetaFlowId(resp.data.metaFlowId || null);
        window.alert(
          `Published to Meta WhatsApp Flows.\nMeta Flow ID: ${resp.data.metaFlowId || "—"}`
        );
        fetchSavedFlowsList();
      } else {
        const validationErrors = resp?.data?.validation_errors;
        const detail = validationErrors?.length
          ? `${resp?.data?.message || "Publish failed"}\n\n${validationErrors
            .map((e) => e.message || e.error || JSON.stringify(e))
            .join("\n")}`
          : resp?.data?.message || "Publish failed";
        window.alert(detail);
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.response?.data?.error?.message ||
        err?.message ||
        "Publish failed";
      const validationErrors =
        err?.response?.data?.validation_errors || err?.response?.data?.error?.validation_errors;
      const detail = validationErrors?.length
        ? `${msg}\n\n${validationErrors
          .map((e) => e.message || e.error || JSON.stringify(e))
          .join("\n")}`
        : msg;
      window.alert(detail);
    } finally {
      setPublishing(false);
    }
  }, [savedFlowId, fetchSavedFlowsList]);

  const loadFlowById = useCallback(
    async (id) => {
      const fid = String(id || "").trim();
      if (!fid) return;

      setLoadingSavedFlow(true);
      try {
        const resp = await axios.get(`/flows/${fid}`);
        if (resp?.data?.success && resp?.data?.flow?.data) {
          const loaded = resp.data.flow.data;
          const rawNodes = (loaded.nodes || []).map((n) => ({
            id: n.id,
            type: n.type,
            position: n.position || { x: 0, y: 0 },
            data: normalizeFlowNodeMediaData(n.data || {}),
          }));

          const hydratedNodes = await Promise.all(
            rawNodes.map(async (n) => {
              if (n.type !== "start" && n.type !== "template" && n.type !== "question") return n;
              const d = n.data || {};
              if (!d.templateName && !d.templateId) return n;

              let tpl = null;
              if (d.templateId) {
                try {
                  tpl = await getTemplateById(d.templateId);
                } catch (_) {
                  /* optional */
                }
              }
              if (!tpl && d.templateName) {
                try {
                  const data = await getTemplates({ limit: 200 });
                  tpl = (data.templates || []).find(
                    (t) => String(t.name || "").toLowerCase() === String(d.templateName).toLowerCase()
                  );
                } catch (_) {
                  /* optional */
                }
              }
              if (!tpl) return n;

              const resolved = await resolveFlowTemplate(tpl);
              const templateParts = getTemplatePreviewParts(resolved);
              const templateButtons = getTemplateButtons(resolved);
              const headerMediaUrl =
                templateParts?.headerImageUrl ||
                d.header_media_url ||
                d.headerMediaUrl ||
                resolveDisplayableHeaderMediaUrl(
                  resolved?.variables?.headerMediaUrl,
                  resolved?.variables?.header_media_url,
                  resolveHeaderImageFromComponents(resolved?.components || getTemplateComponentsList(resolved))
                ) ||
                null;
              return {
                ...n,
                data: {
                  ...d,
                  templateId: resolved?.id || d.templateId,
                  templateName: resolved?.name || d.templateName,
                  templateContent: getTemplateBodyText(resolved),
                  templateButtons,
                  templateParts: headerMediaUrl
                    ? {
                      ...templateParts,
                      headerImageUrl: headerMediaUrl,
                      headerFormat: templateParts?.headerFormat || 'IMAGE',
                    }
                    : templateParts,
                  header_media_url: headerMediaUrl,
                  headerMediaUrl,
                },
              };
            })
          );

          setNodes(hydratedNodes);
          setEdges(
            (loaded.edges || []).map((e) => ({
              id: e.id,
              source: e.source,
              target: e.target,
              sourceHandle: e.sourceHandle || null,
              targetHandle: e.targetHandle || null,
              label: e.label || e.data?.label || "",
              data: e.data || {},
            }))
          );

          setSavedFlowId(resp.data.flow.id);
          setFlowName(resp.data.flow.name || "My Flow");
          setFlowStatus(resp.data.flow.status || "draft");
          setMetaFlowId(resp.data.flow.metaFlowId || null);
          setTestStarted(false);
          setExecutionCurrentNodeId(null);
          setExecutionLog([]);
        }
      } finally {
        setLoadingSavedFlow(false);
      }
    },
    [setEdges, setNodes]
  );

  const handleLoadFlow = useCallback(async () => {
    const pickLatest = (list) =>
      [...(Array.isArray(list) ? list : [])]
        .sort((a, b) => new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0))[0];

    let target = pickLatest(savedFlowsList);
    if (!target?.id) {
      setLoadingFlowsList(true);
      try {
        const resp = await axios.get("/flows");
        const list = resp?.data?.success && Array.isArray(resp.data.flows) ? resp.data.flows : [];
        if (resp?.data?.success) {
          const uniqueByName = [];
          const seenNames = new Set();
          for (const flow of list) {
            const key = String(flow?.name || "").trim().toLowerCase();
            if (!key || seenNames.has(key)) continue;
            seenNames.add(key);
            uniqueByName.push(flow);
          }
          setSavedFlowsList(uniqueByName);
          target = pickLatest(uniqueByName);
        }
      } finally {
        setLoadingFlowsList(false);
      }
    }

    if (target?.id) {
      loadFlowById(target.id);
    }
  }, [savedFlowsList, loadFlowById]);

  const handleCreateNewFlow = useCallback(() => {
    gatePlanLimit('flows', 1, {
      onBlocked: setPlanLimitModal,
      onAllowed: () => {
        setNodes([
          {
            id: "start",
            type: "start",
            position: { x: 240, y: 80 },
            data: nodeDataDefaults("start"),
          },
        ]);
        setEdges([]);
        setFlowName("My Flow");
        setSavedFlowId(null);
        setFlowStatus("draft");
        setMetaFlowId(null);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
        setTestStarted(false);
        setExecutionCurrentNodeId(null);
        setExecutionLog([]);
        setTestInput("");
      },
    });
  }, [setEdges, setNodes]);

  const handleDeleteFlow = useCallback(
    async (flow, event) => {
      event?.stopPropagation?.();
      const fid = flow?.id;
      if (!fid) return;

      const name = flow?.name || "Untitled Flow";
      if (!window.confirm(`Delete flow "${name}"? This cannot be undone.`)) return;

      setDeletingFlowId(fid);
      try {
        const resp = await axios.delete(`/flows/${fid}`);
        if (resp?.data?.success) {
          if (String(savedFlowId) === String(fid)) {
            handleCreateNewFlow();
          }
          await fetchSavedFlowsList();
        } else {
          window.alert(resp?.data?.message || "Failed to delete flow");
        }
      } catch (err) {
        window.alert(err?.response?.data?.message || err?.message || "Failed to delete flow");
      } finally {
        setDeletingFlowId(null);
      }
    },
    [savedFlowId, handleCreateNewFlow, fetchSavedFlowsList]
  );

  const handleExecuteTest = useCallback(async () => {
    setExecuting(true);
    try {
      const flowData = {
        nodes: sanitizeNodesForSave(nodes),
        edges: sanitizeEdgesForSave(edges),
      };
      const result = runFlowLocal(flowData, {
        userInput: testStarted ? String(testInput || "") : "",
        currentNodeId: testStarted ? executionCurrentNodeId : null,
      });

      const output = result.output || [];
      setExecutionLog((prev) => prev.concat(output));
      setExecutionCurrentNodeId(result.done ? null : result.nextNodeId || null);
      setTestStarted(true);
      setTestInput("");
    } finally {
      setExecuting(false);
    }
  }, [nodes, edges, testInput, testStarted, executionCurrentNodeId]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
      </div>
    );
  }

  const userName = user?.name || "User";
  const userInitial = userName.charAt(0).toUpperCase();
  const headerAvatar = user?.avatar || readSessionUser()?.avatar || "";

  return (
    <>
      <style>{`
        .react-flow__handle {
          opacity: 1 !important;
          visibility: visible !important;
        }
        .react-flow__handle:hover,
        .react-flow__handle.connecting,
        .react-flow__handle.valid {
          transform: scale(1.15);
          background: #0284c7 !important;
          box-shadow: 0 0 0 4px rgba(14, 165, 233, 0.35) !important;
        }
        .react-flow__handle.flow-start-header-handle {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .react-flow__handle.flow-start-header-handle::after {
          content: "+";
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #ffffff;
          font-size: 14px;
          font-weight: 700;
          line-height: 1;
          opacity: 0;
          transition: opacity 0.15s ease;
          pointer-events: none;
        }
        .react-flow__handle.flow-start-header-handle:hover::after,
        .react-flow__handle.flow-start-header-handle.connecting::after {
          opacity: 1;
        }
        .react-flow__connection-path {
          stroke-width: 3px;
        }
        .react-flow__connectionline path {
          stroke-dasharray: 6 4;
        }
      `}</style>
      <div className="h-screen flex flex-row bg-gray-50 overflow-hidden">
        <AppShellSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
          <MainSidebarNav onNavigate={() => setSidebarOpen(false)} />
        </AppShellSidebar>

        <div className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden">
          <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-3 sm:px-4 md:px-6 py-3 md:py-3.5 min-w-0 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3 sm:gap-y-2 shadow-sm shadow-gray-200/50">
            <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1 sm:gap-x-3 sm:flex-1 sm:min-w-0">
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2.5 rounded-xl hover:bg-gray-100/80 active:scale-95 transition lg:hidden shrink-0"
                aria-label="Toggle sidebar"
              >
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div
                className="flex items-center gap-3 transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] shrink-0 cursor-pointer"
                onClick={() => navigate("/dashboard")}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") navigate("/dashboard");
                }}
              ><BrandLogoMark size="md" />
                <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent hidden sm:block">
                  Waabizx
                </h1>
              </div>
              <span className="text-gray-300 hidden md:block shrink-0">|</span>
              <div className="min-w-0 max-w-full flex-1">
                <h2 className="text-base sm:text-lg font-semibold text-sky-700 tracking-tight">Flows</h2>
                <p className="text-xs md:text-sm text-gray-500 truncate hidden sm:block">Drag nodes, connect lines, configure, then save and execute.</p>
              </div>
              <div className="flex lg:hidden w-full gap-2 order-last sm:order-none sm:w-auto">
                <button
                  type="button"
                  onClick={() => setMobilePanel((p) => (p === "palette" ? null : "palette"))}
                  className={`flex-1 sm:flex-none px-3 py-2 rounded-xl text-xs font-semibold border transition ${mobilePanel === "palette"
                      ? "bg-sky-50 border-sky-300 text-sky-800"
                      : "bg-white/80 border-gray-200/80 text-gray-700"
                    }`}
                >
                  Nodes
                </button>
                <button
                  type="button"
                  onClick={() => setMobilePanel((p) => (p === "config" ? null : "config"))}
                  className={`flex-1 sm:flex-none px-3 py-2 rounded-xl text-xs font-semibold border transition ${mobilePanel === "config"
                      ? "bg-sky-50 border-sky-300 text-sky-800"
                      : "bg-white/80 border-gray-200/80 text-gray-700"
                    }`}
                >
                  Config
                </button>
              </div>
              <AdminHeaderProjectSwitch />
            </div>

            <HeaderRightActions className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:max-w-full sm:justify-end sm:shrink-0">
              <button
                type="button"
                onClick={() => navigate("/settings")}
                className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/35 hover:shadow-lg hover:ring-2 ring-sky-300/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none overflow-hidden"
              >
                {headerAvatar ? (
                  <img src={headerAvatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white font-semibold text-sm">{userInitial}</span>
                )}
              </button>
            </HeaderRightActions>
          </header>

          <div className="shrink-0 z-[9] border-b border-gray-200/80 bg-white/95 backdrop-blur-md px-3 sm:px-4 md:px-6 py-2.5 md:py-3 flex flex-wrap items-center gap-2 shadow-sm shadow-gray-200/30">
            <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
              <button
                type="button"
                onClick={handleCreateNewFlow}
                className="px-2.5 py-2 sm:px-3 rounded-xl bg-white/80 border border-gray-200/80 text-gray-700 text-xs sm:text-sm font-semibold hover:bg-white transition-all duration-200"
              >
                New Flow
              </button>
              <input
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                className="min-w-0 flex-1 sm:flex-initial w-[7.5rem] max-w-[14rem] sm:w-40 md:w-52 px-2.5 sm:px-3 py-2 rounded-xl border border-gray-200/80 bg-white/70 focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-xs sm:text-sm"
                placeholder="Flow name"
              />
              <button
                type="button"
                onClick={handleSaveFlow}
                disabled={saving}
                className="px-2.5 py-2 sm:px-3 rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 text-white text-xs sm:text-sm font-semibold shadow-md shadow-sky-500/25 hover:shadow-lg disabled:opacity-60 transition-all duration-200"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={handlePublishFlow}
                disabled={publishing || !savedFlowId}
                className="px-2.5 py-2 sm:px-3 rounded-xl bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 text-white text-xs sm:text-sm font-semibold shadow-md shadow-emerald-500/25 hover:shadow-lg disabled:opacity-60 transition-all duration-200"
                title={savedFlowId ? "Publish to Meta WhatsApp Flows" : "Save flow before publishing"}
              >
                {publishing ? "Publishing..." : "Publish"}
              </button>
              <button
                type="button"
                onClick={handleLoadFlow}
                disabled={loadingSavedFlow || loadingFlowsList}
                className="px-2.5 py-2 sm:px-3 rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 text-white text-xs sm:text-sm font-semibold shadow-md shadow-sky-500/25 hover:shadow-lg disabled:opacity-60 transition-all duration-200"
              >
                {loadingSavedFlow ? "Loading..." : "Load"}
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 min-w-0 overflow-hidden bg-gradient-to-b from-sky-50/50 via-white to-sky-100/30 relative">
            {mobilePanel ? (
              <button
                type="button"
                className="lg:hidden fixed inset-0 z-30 bg-black/30"
                aria-label="Close panel"
                onClick={() => setMobilePanel(null)}
              />
            ) : null}
            <div className="flex h-full min-h-0 min-w-0 flex-col lg:flex-row">
              {/* Palette (left) */}
              <aside
                className={`${mobilePanel === "palette" ? "flex" : "hidden"
                  } lg:flex fixed lg:relative inset-y-0 left-0 z-40 lg:z-auto w-[min(18rem,88vw)] sm:w-60 lg:w-72 shrink-0 border-r border-gray-200/70 bg-white/95 lg:bg-white/60 backdrop-blur-sm p-3 flex-col min-h-0 min-w-0 overflow-hidden shadow-xl lg:shadow-none`}
              >
                <div className="lg:hidden flex items-center justify-between pb-2 mb-2 border-b border-gray-200/70">
                  <span className="text-sm font-bold text-gray-900">Node types</span>
                  <button
                    type="button"
                    onClick={() => setMobilePanel(null)}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                    aria-label="Close nodes panel"
                  >
                    ×
                  </button>
                </div>
                <div className="pb-3 bg-white/60 backdrop-blur-sm">
                  <div className="text-xs font-bold uppercase tracking-wider text-sky-700/80">Node Types</div>
                  <div className="mt-1 text-xs text-gray-500">
                    Drag a type into the canvas. Connect lines using node handles.
                  </div>
                </div>

                <div className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1">
                  <div className="space-y-2">
                    {palette.map((item) => (
                      <div
                        key={item.key || item.nodeType}
                        draggable
                        onDragStart={(event) => {
                          event.dataTransfer.setData("application/reactflow", item.nodeType);
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        className="select-none cursor-grab p-3 rounded-2xl border border-gray-100/80 bg-white/90 hover:border-sky-200/70 hover:shadow-sm transition-all duration-200"
                        title={`Drag to canvas: ${item.label}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm">{item.icon}</span>
                            <div className="text-sm font-bold text-gray-900 truncate">{item.label}</div>
                          </div>
                          <span className="text-[11px] font-bold uppercase tracking-wide text-sky-700/80 shrink-0">Drag</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 p-3 rounded-2xl border border-gray-100/80 bg-gradient-to-br from-white to-sky-50/20">
                    <div className="text-xs font-bold uppercase tracking-wide text-sky-800/80">Tip</div>
                    <p className="mt-1 text-xs text-gray-600 leading-relaxed">
                      For <span className="font-semibold">Question</span> nodes, set <span className="font-semibold">Options</span>, then label the edges with option text.
                    </p>
                  </div>

                  <div className="mt-5 border-t border-gray-200/70 pt-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs font-bold uppercase tracking-wider text-sky-700/80">Your flows</div>
                      <button
                        type="button"
                        onClick={fetchSavedFlowsList}
                        disabled={loadingFlowsList}
                        className="text-[11px] font-bold text-sky-700 hover:text-sky-800 disabled:opacity-50"
                      >
                        {loadingFlowsList ? "…" : "Refresh"}
                      </button>
                    </div>
                    <div className="mt-2 max-h-48 overflow-y-auto space-y-2">
                      {loadingFlowsList && savedFlowsList.length === 0 ? (
                        <div className="text-xs text-gray-500 py-2">Loading…</div>
                      ) : null}
                      {!loadingFlowsList && savedFlowsList.length === 0 ? (
                        <div className="text-xs text-gray-500 leading-relaxed py-1">No saved flows yet. Save one to see it here.</div>
                      ) : null}
                      {savedFlowsList.map((f) => (
                        <div
                          key={f.id}
                          className="flex items-stretch gap-1 rounded-2xl border border-gray-100/80 bg-white/90 hover:border-sky-200/70 hover:shadow-sm transition-all duration-200 overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() => loadFlowById(f.id)}
                            disabled={loadingSavedFlow || deletingFlowId === f.id}
                            className="flex-1 min-w-0 text-left p-3 disabled:opacity-60"
                          >
                            <div className="text-sm font-bold text-gray-900 truncate">{f.name || "Untitled Flow"}</div>
                            {f.updatedAt ? (
                              <div className="mt-1 text-[10px] text-gray-400">
                                {new Date(f.updatedAt).toLocaleString()}
                              </div>
                            ) : null}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDeleteFlow(f, e)}
                            disabled={deletingFlowId === f.id}
                            className="shrink-0 px-2.5 text-gray-500 hover:text-red-600 hover:bg-red-50 border-l border-gray-100 disabled:opacity-50 transition-colors"
                            title="Delete flow"
                            aria-label={`Delete flow ${f.name || "Untitled Flow"}`}
                          >
                            {deletingFlowId === f.id ? (
                              <span className="text-xs font-bold">…</span>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </aside>

              {/* Canvas (center) */}
              <main
                className="flex-1 min-w-0 min-h-[45vh] lg:min-h-0 relative order-1 lg:order-none"
                ref={flowWrapperRef}
                onDrop={onDrop}
                onDragOver={onDragOver}
              >
                <ReactFlow
                  nodes={displayNodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  defaultEdgeOptions={{
                    type: "smoothstep",
                    animated: true,
                    style: { stroke: "#0284c7", strokeWidth: 2 },
                  }}
                  connectionLineStyle={{ stroke: "#0284c7", strokeWidth: 3 }}
                  connectionLineType="smoothstep"
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onConnectStart={onConnectStart}
                  onConnectEnd={onConnectEnd}
                  onNodeClick={onNodeClick}
                  onEdgeClick={onEdgeClick}
                  onPaneClick={clearSelection}
                  onInit={setReactFlowInstance}
                  fitView
                  fitViewOptions={{ padding: 0.2 }}
                >
                  <Background gap={18} size={1} color="#e2e8f0" />
                  <Controls />
                  <MiniMap
                    nodeColor={(n) => {
                      if (n.type === "question") return "#0ea5e9";
                      if (n.type === "template") return "#0284c7";
                      return "#94a3b8";
                    }}
                  />
                </ReactFlow>
              </main>

              {/* Config (right) */}
              <aside
                className={`${mobilePanel === "config" ? "flex" : "hidden"
                  } lg:flex fixed lg:relative inset-y-0 right-0 z-40 lg:z-auto w-[min(18rem,92vw)] sm:w-56 lg:w-64 shrink-0 min-w-0 border-l border-gray-200/70 bg-white/95 lg:bg-white/60 backdrop-blur-sm p-3 overflow-y-auto overflow-x-hidden flex-col shadow-xl lg:shadow-none max-h-full`}
              >
                <div className="lg:hidden flex items-center justify-between pb-2 mb-2 border-b border-gray-200/70 shrink-0">
                  <span className="text-sm font-bold text-gray-900">Configuration</span>
                  <button
                    type="button"
                    onClick={() => setMobilePanel(null)}
                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
                    aria-label="Close config panel"
                  >
                    ×
                  </button>
                </div>
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold uppercase tracking-wider text-sky-700/80">Configuration</div>
                    <div className="mt-1 text-xs text-gray-500">Edit selected node/edge.</div>
                  </div>
                  {savedFlowId ? (
                    <div className="flex min-w-0 shrink flex-col items-end gap-1">
                      <span className="inline-flex max-w-[10rem] min-w-0 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full bg-sky-50 text-sky-800 px-2 py-1 text-[11px] font-bold ring-1 ring-sky-100/60" title={`Flow ID: ${savedFlowId}`}>
                        Flow ID: {savedFlowId}
                      </span>
                      {flowStatus === "published" && metaFlowId ? (
                        <span className="inline-flex max-w-[10rem] min-w-0 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full bg-emerald-50 text-emerald-800 px-2 py-1 text-[10px] font-bold ring-1 ring-emerald-100/60" title={`Meta Flow ID: ${metaFlowId}`}>
                          Meta: {metaFlowId}
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center rounded-full bg-amber-50 text-amber-800 px-2 py-1 text-[10px] font-bold ring-1 ring-amber-100/60">
                          Draft
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-gray-50 text-gray-700 px-2 py-1 text-[11px] font-bold ring-1 ring-gray-200/70">
                      Not saved
                    </span>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  {selectedNode ? (
                    <div className="rounded-2xl border border-gray-100/80 bg-white/90 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Selected Node</div>
                          <div className="mt-1 text-sm font-bold text-gray-900 capitalize">{selectedNode.type}</div>
                        </div>
                        <button
                          type="button"
                          onClick={deleteSelectedNode}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-xs font-bold ring-1 ring-rose-200/70 hover:bg-rose-100 transition-all duration-200"
                        >
                          Delete
                        </button>
                      </div>

                      <div className="mt-3 space-y-2">
                        {selectedNode.type === "start" ? (
                          <div className="space-y-2">
                            <div>
                              <FlowKeywordField
                                compact={false}
                                value={selectedNode.data?.keywords || ""}
                                onChange={(v) => updateSelectedNodeData({ keywords: v })}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-gray-600">Regex</label>
                              <input
                                value={selectedNode.data?.regex || ""}
                                onChange={(e) => updateSelectedNodeData({ regex: e.target.value })}
                                className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                                placeholder="Enter Regex"
                              />
                            </div>
                            <label className="flex items-center gap-2 text-xs text-gray-700">
                              <input
                                type="checkbox"
                                checked={!!selectedNode.data?.regexEnabled}
                                onChange={(e) => updateSelectedNodeData({ regexEnabled: e.target.checked })}
                              />
                              Enable regex matching
                            </label>
                            <div>
                              <label className="text-xs font-semibold text-gray-600">Template</label>
                              <div className="mt-1 flex items-center gap-2">
                                <input
                                  value={selectedNode.data?.templateName || ""}
                                  readOnly
                                  className="flex-1 px-3 py-2 rounded-xl border border-gray-200/80 bg-gray-50 text-sm"
                                  placeholder="No template selected"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTemplatePickerNodeId(selectedNode.id);
                                    setTemplatePickerOpen(true);
                                  }}
                                  className="px-3 py-2 rounded-xl border border-gray-200/80 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                  Choose
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {selectedNode.type === "template" ? (
                          <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-2">
                            <div className="text-xs text-sky-800 leading-relaxed">
                              Edit template text directly inside the template node on canvas.
                            </div>
                          </div>
                        ) : null}

                        {selectedNode.type === "text" ? (
                          <div>
                            <label className="text-xs font-semibold text-gray-600">Text</label>
                            <textarea
                              value={selectedNode.data?.text || ""}
                              onChange={(e) => updateSelectedNodeData({ text: e.target.value })}
                              className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm min-h-[86px]"
                            />
                          </div>
                        ) : null}

                        {selectedNode.type === "image" ? (
                          <div>
                            <label className="text-xs font-semibold text-gray-600">Media type</label>
                            <select
                              value={normalizeFlowMediaType(selectedNode.data?.mediaType)}
                              onChange={(e) => updateSelectedNodeData({ mediaType: e.target.value })}
                              className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                            >
                              <option value="IMAGE">Image</option>
                              <option value="VIDEO">Video</option>
                              <option value="DOCUMENT">Document</option>
                            </select>
                            <FlowMediaAttachField
                              mediaType={normalizeFlowMediaType(selectedNode.data?.mediaType)}
                              mediaUrl={selectedNode.data?.mediaUrl || selectedNode.data?.imageUrl || ""}
                              mediaFilename={selectedNode.data?.mediaFilename}
                              onChange={updateSelectedNodeData}
                            />
                            {resolveFlowMediaPreviewUrl(selectedNode.data?.mediaUrl || selectedNode.data?.imageUrl) ? (
                              <div className="mt-2 rounded-xl overflow-hidden border border-gray-100/80 bg-white">
                                {normalizeFlowMediaType(selectedNode.data?.mediaType) === "VIDEO" ? (
                                  <video
                                    src={resolveFlowMediaPreviewUrl(selectedNode.data?.mediaUrl || selectedNode.data?.imageUrl)}
                                    className="w-full h-28 object-cover"
                                    controls
                                    muted
                                    playsInline
                                  />
                                ) : normalizeFlowMediaType(selectedNode.data?.mediaType) === "DOCUMENT" ? (
                                  <div className="p-3 text-xs text-gray-600 break-all">
                                    📄 {resolveFlowMediaPreviewUrl(selectedNode.data?.mediaUrl || selectedNode.data?.imageUrl)}
                                  </div>
                                ) : (
                                  <img
                                    src={resolveFlowMediaPreviewUrl(selectedNode.data?.mediaUrl || selectedNode.data?.imageUrl)}
                                    alt="preview"
                                    className="w-full h-28 object-cover"
                                  />
                                )}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        {selectedNode.type === "question" ? (
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs font-semibold text-gray-600">Question</label>
                              <textarea
                                value={selectedNode.data?.question || ""}
                                onChange={(e) => updateSelectedNodeData({ question: e.target.value })}
                                className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm min-h-[72px]"
                              />
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-gray-600">Capture answer attribute</label>
                              <select
                                value={selectedNode.data?.captureAttribute || ""}
                                onChange={(e) => updateSelectedNodeData({ captureAttribute: e.target.value })}
                                className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                              >
                                <option value="">Select attribute</option>
                                {QUESTION_CAPTURE_ATTRIBUTES.map((attr) => (
                                  <option key={attr} value={attr}>
                                    {attr}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-gray-600">Attribute Format</label>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {QUESTION_ATTRIBUTE_FORMATS.map((fmt) => {
                                  const active = (selectedNode.data?.attributeFormat || "any") === fmt.value;
                                  return (
                                    <button
                                      key={fmt.value}
                                      type="button"
                                      onClick={() => updateSelectedNodeData({ attributeFormat: fmt.value })}
                                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${active
                                          ? "border-sky-500 bg-sky-50 text-sky-800"
                                          : "border-gray-200 bg-white text-gray-600 hover:border-sky-200"
                                        }`}
                                    >
                                      {fmt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-gray-600">Format error message</label>
                              <input
                                value={selectedNode.data?.formatErrorMessage || ""}
                                onChange={(e) => updateSelectedNodeData({ formatErrorMessage: e.target.value })}
                                placeholder={defaultQuestionFormatErrorMessage(selectedNode.data?.attributeFormat || "any")}
                                className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                              />
                            </div>
                            {(selectedNode.data?.attributeFormat || "any") === "regex" ? (
                              <div>
                                <label className="text-xs font-semibold text-gray-600">Regex pattern</label>
                                <input
                                  value={selectedNode.data?.formatRegex || ""}
                                  onChange={(e) => updateSelectedNodeData({ formatRegex: e.target.value })}
                                  placeholder="e.g. ^[A-Z].+"
                                  className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm font-mono"
                                />
                              </div>
                            ) : null}
                            <div>
                              <label className="text-xs font-semibold text-gray-600">Template</label>
                              <div className="mt-1 flex items-center gap-2">
                                <input
                                  value={selectedNode.data?.templateName || ""}
                                  readOnly
                                  className="flex-1 px-3 py-2 rounded-xl border border-gray-200/80 bg-gray-50 text-sm"
                                  placeholder="No template selected"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTemplatePickerNodeId(selectedNode.id);
                                    setTemplatePickerOpen(true);
                                  }}
                                  className="px-3 py-2 rounded-xl border border-gray-200/80 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                  Choose
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}

                        {selectedNode.type === "button" ? (
                          <div>
                            <label className="text-xs font-semibold text-gray-600">Text</label>
                            <input
                              value={selectedNode.data?.text || ""}
                              onChange={(e) => updateSelectedNodeData({ text: e.target.value })}
                              className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                            />
                            <div className="mt-2">
                              <label className="text-xs font-semibold text-gray-600">Buttons (comma separated)</label>
                              <input
                                value={selectedNode.data?.buttons || ""}
                                onChange={(e) => updateSelectedNodeData({ buttons: e.target.value })}
                                className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                                placeholder="Option A, Option B"
                              />
                            </div>
                          </div>
                        ) : null}

                        {selectedNode.type === "list_message" ? (
                          <div>
                            <label className="text-xs font-semibold text-gray-600">List title</label>
                            <input
                              value={selectedNode.data?.title || ""}
                              onChange={(e) => updateSelectedNodeData({ title: e.target.value })}
                              className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                            />
                            <div className="mt-2">
                              <label className="text-xs font-semibold text-gray-600">Items (comma separated)</label>
                              <input
                                value={selectedNode.data?.items || ""}
                                onChange={(e) => updateSelectedNodeData({ items: e.target.value })}
                                className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                                placeholder="Item 1, Item 2, Item 3"
                              />
                            </div>
                          </div>
                        ) : null}

                        {selectedNode.type === "multi_product" ? (
                          <div>
                            <label className="text-xs font-semibold text-gray-600">Section title</label>
                            <input
                              value={selectedNode.data?.title || ""}
                              onChange={(e) => updateSelectedNodeData({ title: e.target.value })}
                              className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                            />
                            <div className="mt-2">
                              <label className="text-xs font-semibold text-gray-600">Products (comma separated)</label>
                              <input
                                value={selectedNode.data?.products || ""}
                                onChange={(e) => updateSelectedNodeData({ products: e.target.value })}
                                className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                                placeholder="Product A, Product B, Product C"
                              />
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {selectedEdge ? (
                    <div className="rounded-2xl border border-gray-100/80 bg-white/90 p-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Selected Edge</div>
                      <div className="mt-1 text-sm font-bold text-gray-900">Condition / Option label</div>

                      <div className="mt-3">
                        <label className="text-xs font-semibold text-gray-600">Label</label>
                        <input
                          value={selectedEdge.label || selectedEdge.data?.label || ""}
                          onChange={(e) => updateSelectedEdgeLabel(e.target.value)}
                          className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                          placeholder="YES / NO / Option A"
                        />
                      </div>
                      <div className="mt-2 text-xs text-gray-600 leading-relaxed">
                        This label will be matched when the flow reaches a <span className="font-semibold">Question</span> / <span className="font-semibold">Template</span> node.
                      </div>
                    </div>
                  ) : null}

                  {!selectedNode && !selectedEdge ? (
                    <div className="rounded-2xl border border-gray-100/80 bg-white/90 p-3">
                      <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Nothing selected</div>
                      <p className="mt-2 text-xs text-gray-600 leading-relaxed">
                        Click a node to configure it, or click an edge to label the connection.
                      </p>
                    </div>
                  ) : null}

                  {/* Execute Test */}
                  <div className="rounded-2xl border border-gray-100/80 bg-gradient-to-br from-white to-sky-50/30 p-3 min-w-0">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold uppercase tracking-wider text-sky-800/80">Flow Execution</div>
                        <div className="mt-1 text-xs text-gray-600">
                          {testStarted ? "Answer the question" : "Start from the beginning"}
                        </div>
                      </div>
                      <span className="inline-flex max-w-[9rem] min-w-0 shrink-0 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full bg-white/80 px-2 py-1 text-[11px] font-bold ring-1 ring-gray-200/80 text-gray-700" title={executionCurrentNodeId ? `at ${executionCurrentNodeId}` : "start"}>
                        {executionCurrentNodeId ? `at ${executionCurrentNodeId}` : "start"}
                      </span>
                    </div>

                    <div className="mt-3">
                      <label className="text-xs font-semibold text-gray-600">
                        {testStarted ? "Your input (match edge label)" : "Auto-start"}
                      </label>
                      <input
                        value={testInput}
                        onChange={(e) => setTestInput(e.target.value)}
                        disabled={!testStarted}
                        className="mt-1 w-full px-3 py-2 rounded-xl border border-gray-200/80 bg-white disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
                        placeholder={testStarted ? "Type button label (e.g. Shop Now)" : "Click Run to start"}
                      />
                    </div>

                    <div className="mt-3 flex min-w-0 flex-wrap items-stretch gap-2">
                      <button
                        type="button"
                        onClick={handleExecuteTest}
                        disabled={executing}
                        className="min-w-0 flex-1 basis-[8rem] px-2 sm:px-3 py-2 rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 text-white text-xs sm:text-sm font-semibold shadow-md shadow-sky-500/25 hover:shadow-lg disabled:opacity-60 transition-all duration-200"
                      >
                        {executing ? "Running..." : testStarted ? "Run (answer)" : "Run (start)"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setTestStarted(false);
                          setExecutionCurrentNodeId(null);
                          setExecutionLog([]);
                          setTestInput("");
                        }}
                        className="shrink-0 px-2.5 sm:px-3 py-2 rounded-xl bg-white/70 border border-gray-200/80 text-xs sm:text-sm font-semibold text-gray-700 hover:bg-white disabled:opacity-60 transition-all duration-200"
                      >
                        Reset
                      </button>
                    </div>

                    <div className="mt-3 space-y-2">
                      {executionLog.length === 0 ? (
                        <div className="text-xs text-gray-600 leading-relaxed">No outputs yet. Click “Run (start)”.</div>
                      ) : null}
                      {executionLog.slice(-8).map((item, idx) => {
                        const key = `${idx}-${item?.type || "out"}`;
                        if (item.type === "error") {
                          return (
                            <div key={key} className="rounded-xl border border-rose-200 bg-rose-50/90 p-3">
                              <div className="text-xs font-bold uppercase tracking-wide text-rose-700">Validation error</div>
                              <div className="mt-1 text-sm font-semibold text-rose-800">{item.message || "Invalid answer format."}</div>
                            </div>
                          );
                        }
                        if (item.type === "text") {
                          return (
                            <div key={key} className="rounded-xl border border-sky-100 bg-white/90 p-3">
                              <div className="text-xs font-bold uppercase tracking-wide text-sky-800/80">Text</div>
                              <div className="mt-1 text-sm font-semibold text-gray-900">{item.text || ""}</div>
                            </div>
                          );
                        }
                        if (item.type === "media" || item.type === "image") {
                          const previewUrl = resolveFlowMediaPreviewUrl(item.mediaUrl || item.imageUrl || "");
                          const mediaType = normalizeFlowMediaType(item.mediaType);
                          return (
                            <div key={key} className="rounded-xl border border-sky-100 bg-white/90 p-3">
                              <div className="text-xs font-bold uppercase tracking-wide text-sky-800/80">
                                {mediaType === "VIDEO" ? "Video" : mediaType === "DOCUMENT" ? "Document" : "Image"}
                              </div>
                              {previewUrl && mediaType === "VIDEO" ? (
                                <video
                                  src={previewUrl}
                                  className="mt-2 w-full h-28 object-cover rounded-lg border border-gray-100"
                                  controls
                                  muted
                                  playsInline
                                />
                              ) : null}
                              {previewUrl && mediaType === "DOCUMENT" ? (
                                <div className="mt-2 text-xs text-gray-600 break-all rounded-lg border border-gray-100 bg-gray-50 p-2">
                                  📄 {previewUrl}
                                </div>
                              ) : null}
                              {previewUrl && mediaType === "IMAGE" ? (
                                <img
                                  src={previewUrl}
                                  alt="flow media output"
                                  className="mt-2 w-full h-28 object-cover rounded-lg border border-gray-100"
                                />
                              ) : null}
                              {item.caption ? (
                                <div className="mt-1 text-sm font-semibold text-gray-900">{item.caption}</div>
                              ) : null}
                              <div className="mt-1 text-xs text-gray-600 truncate">{previewUrl || ""}</div>
                            </div>
                          );
                        }
                        if (item.type === "question") {
                          return (
                            <div key={key} className="rounded-xl border border-sky-100 bg-white/90 p-3">
                              <div className="text-xs font-bold uppercase tracking-wide text-sky-800/80">Question</div>
                              <div className="mt-1 text-sm font-semibold text-gray-900">{item.question || ""}</div>
                              {Array.isArray(item.options) && item.options.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {item.options.slice(0, 6).map((opt) => (
                                    <span key={opt} className="inline-flex items-center rounded-full bg-sky-50 text-sky-800 px-2 py-0.5 text-[11px] font-bold ring-1 ring-sky-100/60">
                                      {opt}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        }
                        if (item.type === "button") {
                          return (
                            <div key={key} className="rounded-xl border border-sky-100 bg-white/90 p-3">
                              <div className="text-xs font-bold uppercase tracking-wide text-sky-800/80">Buttons</div>
                              <div className="mt-1 text-sm font-semibold text-gray-900">{item.text || ""}</div>
                              {Array.isArray(item.buttons) && item.buttons.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {item.buttons.slice(0, 6).map((b) => (
                                    <span key={b} className="inline-flex items-center rounded-lg bg-sky-50 text-sky-800 px-2 py-0.5 text-[11px] font-bold ring-1 ring-sky-100/60">
                                      {b}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        }

                        return (
                          <div key={key} className="rounded-xl border border-gray-200 bg-white/90 p-3">
                            <div className="text-xs font-bold uppercase tracking-wide text-gray-500">{item?.type || "Output"}</div>
                            <div className="mt-1 text-sm text-gray-800">{item?.text || item?.question || ""}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        </div>
      </div>
      {insertModalOpen && pendingInsert ? (
        <div
          className="fixed inset-0 z-[1400]"
          onClick={() => {
            setInsertModalOpen(false);
            setPendingInsert(null);
            setConnectStart(null);
          }}
        >
          <div
            className="absolute w-[280px] rounded-2xl border border-sky-200/70 bg-white/95 backdrop-blur-md shadow-xl shadow-sky-100/60 p-3 pointer-events-auto"
            style={{
              left: `${pendingInsert.screenPosition?.x ?? 16}px`,
              top: `${pendingInsert.screenPosition?.y ?? 16}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-gray-900">Content Block</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInsertModalOpen(false);
                  setPendingInsert(null);
                  setConnectStart(null);
                }}
                className="w-9 h-9 rounded-full bg-white/80 ring-1 ring-gray-200/80 hover:bg-white transition-all duration-200 text-gray-700 font-bold"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-2 space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
              {contentBlockOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleInsertNodeType(opt.nodeType)}
                  className="w-full px-2.5 py-2 rounded-lg border border-gray-200/80 bg-white/90 hover:border-sky-200/70 hover:shadow-sm transition-all duration-200 text-left flex items-center gap-2"
                >
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-sky-50 text-sky-700 text-[11px]">
                    {opt.icon}
                  </span>
                  <span className="text-xs font-semibold text-gray-800">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
      {templatePickerOpen ? (
        <div className="fixed inset-0 z-[1500] bg-black/20 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-gray-200/80 bg-white/95 backdrop-blur-md shadow-lg p-4 md:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-gray-900">Template Messages</div>
                <div className="mt-1 text-xs text-gray-500">Only approved templates are listed. Click a name to use it on the flow.</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTemplatePickerOpen(false);
                  setTemplatePickerSearch("");
                }}
                className="w-9 h-9 rounded-full bg-white/80 ring-1 ring-gray-200/80 hover:bg-white transition-all duration-200 text-gray-700 font-bold"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <input
              value={templatePickerSearch}
              onChange={(e) => setTemplatePickerSearch(e.target.value)}
              placeholder="Search templates"
              className="mt-3 w-full max-w-sm px-3 py-2 rounded-xl border border-gray-200/80 bg-white/70 focus:outline-none focus:ring-2 focus:ring-sky-300/70 text-sm"
            />
            <div className="mt-4 rounded-xl border border-gray-100 overflow-hidden">
              <div className="grid grid-cols-12 bg-slate-50 text-xs font-semibold text-slate-600 px-3 py-2">
                <div className="col-span-4">Name</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-2">Created At</div>
                <div className="col-span-2 text-right">Action</div>
              </div>
              <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-100">
                {templatePickerLoading ? (
                  <div className="px-3 py-6 text-sm text-gray-500">Loading templates...</div>
                ) : filteredApprovedTemplates.length === 0 ? (
                  <div className="px-3 py-6 text-sm text-gray-500">No approved templates found.</div>
                ) : (
                  filteredApprovedTemplates.map((t) => (
                    <div
                      key={t.id || t.name}
                      className="grid grid-cols-12 px-3 py-3 text-sm items-center hover:bg-sky-50/60 transition"
                    >
                      <button
                        type="button"
                        className="col-span-4 text-left text-gray-800 truncate font-medium hover:text-sky-700"
                        onClick={() => requestUseFlowTemplate(t)}
                      >
                        {t.name}
                      </button>
                      <div className="col-span-2 text-emerald-600 font-semibold">{String(t.status || "APPROVED").toUpperCase()}</div>
                      <div className="col-span-2 text-gray-600 uppercase text-xs">{t.type || t.category || "TEXT"}</div>
                      <div className="col-span-2 text-gray-600 text-xs">{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : "-"}</div>
                      <div className="col-span-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setTemplateViewItem(t)}
                          className="rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => requestUseFlowTemplate(t)}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                        >
                          Use
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {templateViewItem ? (
        <div className="fixed inset-0 z-[1600] bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-[min(100%,44rem)] h-[min(94vh,820px)] sm:h-auto sm:max-h-[min(92vh,820px)] rounded-t-2xl sm:rounded-2xl border border-gray-200 bg-white shadow-xl flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:py-4 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="text-base sm:text-lg font-semibold text-gray-900 truncate">{templateViewItem.name}</div>
                <div className="mt-1 text-[11px] sm:text-xs text-gray-500 break-words">
                  {String(templateViewItem.status || "APPROVED").toUpperCase()} · {templateViewItem.type || templateViewItem.category || "TEXT"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTemplateViewItem(null)}
                className="w-9 h-9 shrink-0 rounded-full bg-gray-50 ring-1 ring-gray-200 hover:bg-gray-100 text-gray-700 font-bold"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5 sm:py-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 text-sm">
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100 min-w-0 order-2 lg:order-1">
                  <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Template info</div>
                  <div className="mt-2 space-y-1.5 text-xs text-gray-700 break-words">
                    <div><span className="font-semibold">Language:</span> {templateViewItem.language || templateViewItem.variables?.language || "en_US"}</div>
                    <div><span className="font-semibold">Category:</span> {templateViewItem.category || templateViewItem.type || "—"}</div>
                    <div><span className="font-semibold">Created:</span> {templateViewItem.createdAt ? new Date(templateViewItem.createdAt).toLocaleString() : "—"}</div>
                    <div className="pt-1 max-h-[28vh] sm:max-h-none overflow-y-auto">
                      <span className="font-semibold">Body:</span>
                      <p className="mt-1 whitespace-pre-wrap text-gray-600">{getTemplatePreviewParts(templateViewItem)?.body || templateViewItem.content || "—"}</p>
                    </div>
                  </div>
                </div>
                <div className="min-w-0 order-1 lg:order-2 flex justify-center">
                  <div className="w-full max-w-[min(100%,22rem)]">
                    <FlowTemplatePreviewCard parts={getTemplatePreviewParts(templateViewItem)} variant="full" />
                    {resolveFlowTemplateHeaderMediaType(
                      getTemplatePreviewParts(templateViewItem),
                      templateViewItem
                    ) ? (
                      <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/40 p-3">
                        <FlowMediaAttachField
                          compact
                          mediaType={
                            resolveFlowTemplateHeaderMediaType(
                              getTemplatePreviewParts(templateViewItem),
                              templateViewItem
                            ) || "IMAGE"
                          }
                          mediaUrl={
                            resolveFlowMediaPreviewUrl(templateViewHeaderDraft.url) ||
                            templateViewHeaderDraft.url
                          }
                          mediaFilename={templateViewHeaderDraft.filename}
                          onChange={(patch) =>
                            setTemplateViewHeaderDraft({
                              url: patch.mediaUrl || patch.imageUrl || "",
                              filename: patch.mediaFilename || "",
                            })
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            <div className="shrink-0 flex flex-wrap justify-end gap-2 border-t border-gray-100 px-4 py-3 sm:px-5 bg-white">
              <button
                type="button"
                onClick={() => {
                  setTemplateViewItem(null);
                  setTemplateViewHeaderDraft({ url: "", filename: "" });
                }}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  const parts = getTemplatePreviewParts(templateViewItem);
                  if (
                    flowTemplateNeedsHeaderMediaPick(
                      parts,
                      templateViewItem,
                      templateViewHeaderDraft.url
                    )
                  ) {
                    window.alert("Please choose header media from the Media Library before using this template.");
                    return;
                  }
                  applyStartTemplateSelection(templateViewItem, {
                    headerMediaUrl: templateViewHeaderDraft.url || undefined,
                    headerMediaFilename: templateViewHeaderDraft.filename,
                  });
                  setTemplateViewItem(null);
                }}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Use template
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <PlanLimitModal open={Boolean(planLimitModal)} payload={planLimitModal} onClose={() => setPlanLimitModal(null)} />
    </>
  );
}

export default Flows;

