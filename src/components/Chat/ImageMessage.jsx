import React, { useState } from 'react';
import MessageBubble from './MessageBubble';
import ImagePreviewModal from './ImagePreviewModal';
import { formatWhatsAppBody } from '../../utils/whatsappTemplatePreview';
import { resolvePublicMediaUrl, resolveWhatsAppMediaUrl } from '../../utils/mediaUrl';
import { useMediaSrc } from './useMediaSrc';

function isProtectedWhatsAppMediaUrl(url) {
  return Boolean(url && /\/api\/media\/whatsapp\//i.test(String(url)));
}

function isPlaceholderMediaCaption(text) {
  return /^\[Image\]$/i.test(String(text || '').trim());
}

async function downloadMediaFile(src, filename = 'whatsapp-image.jpg') {
  if (!src) return;
  const token = localStorage.getItem('token');
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const projectRaw = localStorage.getItem('selectedProject');
  if (projectRaw) {
    try {
      const p = JSON.parse(projectRaw);
      if (p?.id != null) headers['x-project-id'] = String(p.id);
    } catch (_) {}
  }
  const res = await fetch(src, { headers });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

export default function ImageMessage({ message, align, formatTime, status, apiBase }) {
  const [preview, setPreview] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const rawSrc =
    resolveWhatsAppMediaUrl(message, apiBase) ||
    (message?.mediaUrl ? resolvePublicMediaUrl(message.mediaUrl, apiBase) : '');
  const protectedMedia = isProtectedWhatsAppMediaUrl(rawSrc);
  const { src, failed, setFailed, loading } = useMediaSrc(rawSrc, apiBase);
  const captionRaw = String(message?.content || '').trim();
  const caption = isPlaceholderMediaCaption(captionRaw) ? '' : captionRaw;
  const imgSrc = protectedMedia ? src : src || rawSrc;
  const canShowImage = protectedMedia ? Boolean(src) && !failed : Boolean(imgSrc) && !failed;

  const handleDownload = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const downloadSrc = imgSrc || rawSrc;
    if (!downloadSrc || downloading) return;
    setDownloading(true);
    try {
      const ext =
        message?.mimeType && message.mimeType.includes('png')
          ? 'png'
          : message?.mimeType && message.mimeType.includes('webp')
            ? 'webp'
            : 'jpg';
      await downloadMediaFile(downloadSrc, message?.mediaFilename || `whatsapp-image.${ext}`);
    } catch (err) {
      console.error('Image download failed:', err);
      alert('Could not download image. Try opening the preview and saving manually.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <MessageBubble message={message} align={align} formatTime={formatTime} status={status}>
        <div className="mb-1 -mx-0.5">
          {loading && protectedMedia && !canShowImage ? (
            <div className="w-full bg-gray-100 rounded-md py-12 text-center text-xs text-gray-500">
              Loading image…
            </div>
          ) : canShowImage ? (
            <>
              <img
                src={imgSrc}
                alt=""
                className="w-full max-h-72 rounded-md object-cover cursor-pointer"
                onClick={() => setPreview(imgSrc)}
                onError={() => setFailed(true)}
              />
              <div className="mt-1 flex justify-end">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="text-[11px] font-semibold text-[#008069] hover:underline disabled:opacity-50"
                >
                  {downloading ? 'Downloading…' : 'Download'}
                </button>
              </div>
            </>
          ) : (
            <div className="w-full bg-gray-100 rounded-md py-12 text-center text-xs text-gray-500 uppercase tracking-widest">
              Image
            </div>
          )}
        </div>
        {caption ? (
          <p className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words px-0.5 pb-0.5">
            {formatWhatsAppBody(caption)}
          </p>
        ) : null}
      </MessageBubble>
      {preview && (
        <ImagePreviewModal src={preview} onClose={() => setPreview(null)} onDownload={handleDownload} />
      )}
    </>
  );
}
