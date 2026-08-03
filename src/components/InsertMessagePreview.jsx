import React, { useRef, useState } from "react";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";
import { uploadBroadcastHeaderMedia } from "../services/broadcastService";

/**
 * AiSensy-style WhatsApp bubble preview for Insert (canned / template).
 * For image/video/document templates, optional header media upload before send.
 */
export default function InsertMessagePreview({
  title,
  bodyText,
  preview,
  apiBase = "",
  hint = "Review the message above, then click Send to deliver it to the customer.",
  allowHeaderUpload = false,
  templateName = "",
  onHeaderMediaChange,
}) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const headerText = String(preview?.headerText || "").trim();
  const headerFormat = String(preview?.headerFormat || "").toUpperCase();
  const footer = String(preview?.footer || "").trim();
  const buttons = Array.isArray(preview?.buttons) ? preview.buttons : [];
  const body = String(preview?.body || bodyText || "").trim();
  const resolvedImage = resolvePublicMediaUrl(
    preview?.headerImageUrl || preview?.header?.url || "",
    apiBase
  );

  const mediaFormat =
    headerFormat ||
    (preview?.header?.type === "image"
      ? "IMAGE"
      : preview?.header?.type === "video"
        ? "VIDEO"
        : preview?.header?.type === "document"
          ? "DOCUMENT"
          : "");

  const needsMediaHeader = ["IMAGE", "VIDEO", "DOCUMENT"].includes(mediaFormat);
  const showImageSlot =
    Boolean(resolvedImage) || needsMediaHeader || preview?.header?.type === "image";
  const showUpload = allowHeaderUpload && needsMediaHeader;

  const accept =
    mediaFormat === "VIDEO"
      ? "video/mp4,video/3gpp"
      : mediaFormat === "DOCUMENT"
        ? ".pdf,.doc,.docx,application/pdf"
        : "image/jpeg,image/png,image/webp";

  const mediaLabel =
    mediaFormat === "VIDEO" ? "Video" : mediaFormat === "DOCUMENT" ? "Document" : "Image";

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || typeof onHeaderMediaChange !== "function") return;
    setUploadError("");
    setUploading(true);
    try {
      const uploaded = await uploadBroadcastHeaderMedia(file);
      const url = uploaded?.url || uploaded?.publicUrl || uploaded?.headerMediaUrl || null;
      if (!url) throw new Error("Upload succeeded but no media URL was returned");
      onHeaderMediaChange(url, { templateName, fileName: file.name });
    } catch (err) {
      setUploadError(err?.message || "Failed to upload header media");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-0 flex-1">
      {title ? (
        <div className="px-4 pt-3 shrink-0">
          <p className="text-xs font-bold uppercase tracking-wide text-sky-700 mb-1">Selected</p>
          <p className="text-sm font-semibold text-gray-900 break-words">{title}</p>
        </div>
      ) : null}

      <div className="px-4 pt-3 pb-2 shrink-0">
        <p className="text-xs font-bold uppercase tracking-wide text-sky-700 mb-2">Preview</p>
      </div>

      <div className="px-4 pb-3 flex-1 min-h-0 overflow-y-auto overscroll-contain max-h-[min(52vh,420px)]">
        <div className="rounded-2xl bg-[#e5ddd5] p-3 sm:p-4 min-h-[120px]">
          <div className="ml-auto w-full max-w-[300px] rounded-xl rounded-tr-sm bg-[#dcf8c6] shadow-sm border border-emerald-100/80 overflow-hidden">
            {resolvedImage ? (
              <div className="bg-black/5 border-b border-emerald-100/80">
                <img
                  src={resolvedImage}
                  alt=""
                  className="w-full max-h-44 object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                    const fallback = e.currentTarget.nextElementSibling;
                    if (fallback) fallback.classList.remove("hidden");
                  }}
                />
                <div className="hidden w-full px-3 py-8 text-center bg-gradient-to-b from-gray-100 to-gray-50 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                  {mediaLabel}
                </div>
              </div>
            ) : showImageSlot ? (
              <div className="w-full px-3 py-8 text-center bg-gradient-to-b from-gray-100 to-gray-50 border-b border-emerald-100/80 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                {mediaLabel}
              </div>
            ) : null}
            <div className="px-3 py-2.5 space-y-1.5">
              {headerText ? (
                <p className="text-sm font-bold text-gray-900 whitespace-pre-wrap break-words">{headerText}</p>
              ) : null}
              {body ? (
                <p className="text-sm text-gray-900 whitespace-pre-wrap break-words leading-relaxed">{body}</p>
              ) : (
                <p className="text-sm text-gray-500 italic">No preview text</p>
              )}
              {footer ? (
                <p className="text-xs text-gray-500 whitespace-pre-wrap break-words pt-1 border-t border-emerald-200/60">
                  {footer}
                </p>
              ) : null}
            </div>
            {buttons.length > 0 ? (
              <div className="border-t border-emerald-200/70 divide-y divide-emerald-200/60 bg-[#d4f0c0]/60">
                {buttons.map((btn, idx) => (
                  <div
                    key={btn.id || btn.text || idx}
                    className="px-3 py-2 text-center text-sm font-semibold text-sky-700 truncate"
                  >
                    {btn.text || btn.title || `Button ${idx + 1}`}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {showUpload ? (
          <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-3">
            <label className="block text-xs font-bold uppercase tracking-wide text-sky-800 mb-2">
              Upload header {mediaLabel.toLowerCase()}
              {!resolvedImage ? " *" : ""}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept={accept}
              disabled={uploading}
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-sky-800 hover:file:bg-sky-200 disabled:opacity-60"
            />
            <p className="mt-1.5 text-[11px] text-sky-700/80">
              {resolvedImage
                ? "Header media ready. You can replace it before sending."
                : `Required for this ${mediaLabel.toLowerCase()} template before send.`}
            </p>
            {uploading ? (
              <p className="mt-1.5 text-xs font-semibold text-sky-700">Uploading…</p>
            ) : null}
            {uploadError ? (
              <p className="mt-1.5 text-xs text-red-600">{uploadError}</p>
            ) : null}
          </div>
        ) : null}

        {hint ? <p className="mt-2 text-xs text-gray-500 leading-relaxed">{hint}</p> : null}
      </div>
    </div>
  );
}
