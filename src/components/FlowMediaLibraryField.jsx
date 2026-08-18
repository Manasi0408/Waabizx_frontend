import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { uploadFlowMedia, getFlowMediaLibrary, deleteFlowMedia } from "../services/flowService";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";

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

function toStoredFlowMediaUrl(url) {
  return normalizeStoredFlowMediaPath(url);
}

function resolveFlowMediaPreviewUrl(url) {
  return resolvePublicMediaUrl(url);
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
                className={`shrink-0 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
                  active
                    ? "border-[#1e3a5f] text-[#1e3a5f]"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab.label} ({count})
              </button>
            );
          })}
        </div>

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
                        className={`w-full rounded-xl border bg-white overflow-hidden text-left transition-all hover:shadow-lg hover:-translate-y-0.5 ${
                          isSelected ? "border-sky-500 ring-2 ring-sky-200 shadow-md" : "border-slate-200 hover:border-slate-300"
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

export default function FlowMediaAttachField({
  mediaType,
  mediaUrl,
  mediaFilename,
  onChange,
  compact = false,
  label = "Attach media",
  hint = "Opens Media Library — browse, upload, or delete files",
}) {
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
      <div className={compact ? "text-[11px] text-gray-600 mb-1" : labelClass}>{label}</div>
      <button type="button" className={buttonClass} onClick={openLibrary} disabled={uploading}>
        {uploading
          ? uploadPct > 0
            ? `Uploading ${uploadPct}%...`
            : "Uploading..."
          : mediaUrl
            ? "Change media"
            : "Choose media"}
      </button>
      <div className={hintClass}>{hint}</div>
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
