import React, { useMemo } from "react";
import { resolvePublicMediaUrl } from "../utils/mediaUrl";
import FlowMediaAttachField from "./FlowMediaLibraryField";

function resolveButtonLabel(btn) {
  if (!btn || typeof btn !== "object") return String(btn || "").trim();
  const raw = btn.text ?? btn.title ?? btn.label ?? "";
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object") {
    return String(raw.text || raw.body || raw.title || raw.label || "").trim();
  }
  return "";
}

function resolveHeaderPreviewSrc(preview, apiBase) {
  const candidates = [preview?.headerImageUrl, preview?.header?.url].filter(Boolean);
  for (const candidate of candidates) {
    const raw = String(candidate).trim();
    if (!raw || raw.startsWith("blob:")) continue;
    const resolved = resolvePublicMediaUrl(raw, apiBase);
    if (resolved) return resolved;
    if (/^https?:\/\//i.test(raw) && !/^\d+::/.test(raw)) return raw;
  }
  return "";
}

function normalizeStoredMediaPath(url) {
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

/**
 * AiSensy-style WhatsApp bubble preview for Insert (canned / template).
 * For image/video/document templates, header media is chosen from Media Library.
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
  onCarouselCardMediaChange,
}) {
  const headerText = String(preview?.headerText || "").trim();
  const headerFormat = String(preview?.headerFormat || "").toUpperCase();
  const footer = String(preview?.footer || "").trim();
  const buttons = Array.isArray(preview?.buttons) ? preview.buttons : [];
  const body = String(preview?.body || bodyText || "").trim();
  const headerMediaUrl = normalizeStoredMediaPath(preview?.headerImageUrl || preview?.header?.url || "");
  const resolvedImage = useMemo(() => {
    const fromPreview = resolveHeaderPreviewSrc(preview, apiBase);
    if (fromPreview) return fromPreview;
    if (headerMediaUrl) return resolvePublicMediaUrl(headerMediaUrl, apiBase);
    return "";
  }, [preview, apiBase, headerMediaUrl]);

  const mediaFormat =
    headerFormat ||
    (preview?.header?.type === "image"
      ? "IMAGE"
      : preview?.header?.type === "video"
        ? "VIDEO"
        : preview?.header?.type === "document"
          ? "DOCUMENT"
          : "");

  const isCarousel = Boolean(preview?.isCarousel);
  const carouselCards = Array.isArray(preview?.carouselCards) ? preview.carouselCards : [];
  const carouselMediaType = String(preview?.carouselMediaType || "IMAGE").toUpperCase();

  const needsMediaHeader = ["IMAGE", "VIDEO", "DOCUMENT"].includes(mediaFormat);
  const showImageSlot =
    !isCarousel && (Boolean(resolvedImage) || needsMediaHeader || preview?.header?.type === "image");
  const showUpload = allowHeaderUpload && needsMediaHeader && !isCarousel;
  const showCarouselUpload = allowHeaderUpload && isCarousel && carouselCards.length > 0;

  const mediaLabel =
    mediaFormat === "VIDEO" ? "Video" : mediaFormat === "DOCUMENT" ? "Document" : "Image";

  const isVideo = mediaFormat === "VIDEO" || preview?.header?.type === "video";
  const isDocument = mediaFormat === "DOCUMENT" || preview?.header?.type === "document";
  const mediaFileName = (url) => {
    if (!url) return "document.pdf";
    try {
      return decodeURIComponent(String(url).split("/").pop()?.split("?")[0] || "document.pdf");
    } catch {
      return String(url).split("/").pop()?.split("?")[0] || "document.pdf";
    }
  };

  const renderHeaderSlot = () => {
    if (resolvedImage && isVideo) {
      return (
        <div className="bg-black/5 border-b border-emerald-100/80">
          <video src={resolvedImage} className="w-full max-h-44 object-cover" controls muted playsInline />
        </div>
      );
    }
    if (resolvedImage && isDocument) {
      return (
        <div className="w-full px-3 py-6 text-center bg-gradient-to-b from-gray-100 to-gray-50 border-b border-emerald-100/80">
          <p className="text-2xl mb-1" aria-hidden>📄</p>
          <p className="text-xs font-semibold text-gray-700 break-all">{mediaFileName(resolvedImage)}</p>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mt-1">Document</p>
        </div>
      );
    }
    if (resolvedImage) {
      return (
        <div className="bg-black/5 border-b border-emerald-100/80">
          <img
            src={resolvedImage}
            alt=""
            className="w-full max-h-44 object-cover"
            onError={(e) => {
              const fallback = e.currentTarget.nextElementSibling;
              e.currentTarget.style.display = "none";
              if (fallback) fallback.classList.remove("hidden");
            }}
            onLoad={(e) => {
              e.currentTarget.style.display = "";
              const fallback = e.currentTarget.nextElementSibling;
              if (fallback) fallback.classList.add("hidden");
            }}
          />
          <div className="hidden w-full px-3 py-8 text-center bg-gradient-to-b from-gray-100 to-gray-50 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            {mediaLabel}
          </div>
        </div>
      );
    }
    if (showImageSlot) {
      return (
        <div className="w-full px-3 py-8 text-center bg-gradient-to-b from-gray-100 to-gray-50 border-b border-emerald-100/80 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
          {isDocument && headerMediaUrl ? (
            <>
              <p className="text-xl mb-1" aria-hidden>📄</p>
              <p className="text-xs normal-case tracking-normal text-gray-700 break-all">{mediaFileName(headerMediaUrl)}</p>
            </>
          ) : null}
          <p>{mediaLabel}</p>
        </div>
      );
    }
    return null;
  };

  const handleMediaLibraryChange = ({ mediaUrl: storedUrl, mediaFilename }) => {
    if (typeof onHeaderMediaChange !== "function") return;
    const stored = normalizeStoredMediaPath(storedUrl);
    if (!stored) return;
    onHeaderMediaChange(stored, { templateName, fileName: mediaFilename || stored.split("/").pop() || "" });
  };

  const handleCarouselCardMediaChange = (cardIndex, { mediaUrl: storedUrl, mediaFilename }) => {
    if (typeof onCarouselCardMediaChange !== "function") return;
    const stored = normalizeStoredMediaPath(storedUrl);
    if (!stored) return;
    onCarouselCardMediaChange(cardIndex, stored, {
      templateName,
      fileName: mediaFilename || stored.split("/").pop() || "",
    });
  };

  const resolveCardMediaSrc = (card) => {
    const raw = normalizeStoredMediaPath(card?.headerImageUrl || "");
    if (!raw) return "";
    return resolvePublicMediaUrl(raw, apiBase) || raw;
  };

  const carouselMediaLabel = carouselMediaType === "VIDEO" ? "Video" : "Image";

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
            {renderHeaderSlot()}
            <div className="px-3 py-2.5 space-y-1.5">
              {headerText ? (
                <p className="text-sm font-bold text-gray-900 whitespace-pre-wrap break-words">{headerText}</p>
              ) : null}
              {body ? (
                <p className="text-sm text-gray-900 whitespace-pre-wrap break-words leading-relaxed">{body}</p>
              ) : (
                <p className="text-sm text-gray-500 italic">No preview text</p>
              )}
              {isCarousel && carouselCards.length > 0 ? (
                <div className="pt-2 space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    {carouselMediaLabel} carousel
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                    {carouselCards.map((card, idx) => {
                      const cardSrc = resolveCardMediaSrc(card);
                      const cardButtons = Array.isArray(card.buttons) ? card.buttons : [];
                      return (
                        <div
                          key={card.index ?? idx}
                          className="shrink-0 w-[168px] rounded-lg border border-emerald-200/80 bg-white overflow-hidden shadow-sm"
                        >
                          {cardSrc && carouselMediaType === "VIDEO" ? (
                            <video
                              src={cardSrc}
                              className="w-full h-24 object-cover bg-black/5"
                              muted
                              playsInline
                            />
                          ) : cardSrc ? (
                            <img src={cardSrc} alt="" className="w-full h-24 object-cover bg-gray-100" />
                          ) : (
                            <div className="w-full h-24 flex items-center justify-center bg-gray-100 text-[10px] font-semibold uppercase text-gray-500">
                              {carouselMediaLabel} {idx + 1}
                            </div>
                          )}
                          <div className="px-2 py-1.5 space-y-1">
                            {card.body ? (
                              <p className="text-[11px] text-gray-800 line-clamp-3 whitespace-pre-wrap break-words">
                                {card.body}
                              </p>
                            ) : null}
                            {cardButtons.slice(0, 2).map((btn, bi) => (
                              <p
                                key={btn.id || bi}
                                className="text-[10px] font-semibold text-sky-700 truncate text-center"
                              >
                                {resolveButtonLabel(btn)}
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
                    {resolveButtonLabel(btn) || `Button ${idx + 1}`}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {showCarouselUpload ? (
          <div className="mt-3 space-y-3 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-3">
            <p className="text-xs font-semibold text-sky-900">
              Card {carouselMediaLabel.toLowerCase()} (required for each card)
            </p>
            {carouselCards.map((card, idx) => {
              const stored = normalizeStoredMediaPath(card?.headerImageUrl || "");
              return (
                <FlowMediaAttachField
                  key={`carousel-card-${idx}`}
                  mediaType={carouselMediaType === "VIDEO" ? "VIDEO" : "IMAGE"}
                  label={`Card ${idx + 1} ${carouselMediaLabel.toLowerCase()}${!stored ? " *" : ""}`}
                  hint={
                    stored
                      ? "Media ready. Open library to replace."
                      : `Choose ${carouselMediaLabel.toLowerCase()} from Media Library.`
                  }
                  mediaUrl={stored}
                  mediaFilename={stored ? stored.split("/").pop() : ""}
                  onChange={(payload) => handleCarouselCardMediaChange(idx, payload)}
                />
              );
            })}
          </div>
        ) : null}

        {showUpload ? (
          <div className="mt-3 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-3">
            <FlowMediaAttachField
              key={templateName || "insert-header-media"}
              mediaType={
                mediaFormat === "VIDEO" ? "VIDEO" : mediaFormat === "DOCUMENT" ? "DOCUMENT" : "IMAGE"
              }
              label={`Header ${mediaLabel.toLowerCase()}${!headerMediaUrl ? " *" : ""}`}
              hint={
                headerMediaUrl
                  ? "Header media ready. Open library to replace before sending."
                  : "Required for this template. Choose from Media Library — browse, upload, or delete files."
              }
              mediaUrl={headerMediaUrl}
              mediaFilename={headerMediaUrl ? headerMediaUrl.split("/").pop() : ""}
              onChange={handleMediaLibraryChange}
            />
          </div>
        ) : null}

        {hint ? (
          <p className="mt-2 text-xs text-gray-500 leading-relaxed">
            {showCarouselUpload &&
            carouselCards.some((c) => !normalizeStoredMediaPath(c?.headerImageUrl || ""))
              ? "Review the intro and cards above, attach media for every card, then click Send."
              : showUpload && !headerMediaUrl
                ? "Review the template preview above, choose header media, then click Send."
                : hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
