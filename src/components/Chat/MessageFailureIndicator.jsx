import React from 'react';
import { getDeliveryFailureInfo } from '../../utils/messageDeliveryFailure';

/** Small grey AiSensy-style failed delivery indicator with hover tooltip. */
export default function MessageFailureIndicator({ message, status, formatTime }) {
  const info = getDeliveryFailureInfo(message, status);
  if (!info) return null;

  const timeLabel = typeof formatTime === 'function' ? String(formatTime() || '').trim() : '';

  return (
    <span className="relative inline-flex shrink-0 group align-middle">
      <span
        className="inline-flex h-[14px] w-[14px] items-center justify-center rounded-[3px] bg-[#8696a0] text-white cursor-help"
        aria-label="Message delivery failed"
        role="img"
      >
        <svg className="h-[9px] w-[9px]" viewBox="0 0 12 12" fill="currentColor" aria-hidden>
          <path d="M2 1.5h8a.5.5 0 0 1 .5.5v6.8L6.6 10.5a.5.5 0 0 1-.6 0L1.5 8.8V2a.5.5 0 0 1 .5-.5zm1 1.4v4.3l2.5 1.4 2.5-1.4V2.9H3z" />
        </svg>
      </span>
      <span
        className="pointer-events-none absolute bottom-full right-0 z-[120] mb-1.5 hidden min-w-[12rem] max-w-[16rem] group-hover:block"
        role="tooltip"
      >
        <span className="block rounded-md border border-gray-200 bg-white px-3 py-2 text-left shadow-lg ring-1 ring-black/5">
          {timeLabel ? (
            <span className="block text-[10px] leading-snug text-gray-500">{timeLabel}</span>
          ) : null}
          <span className="mt-0.5 block text-[11px] font-semibold text-gray-800">Message not delivered</span>
          <span className="mt-1 block text-[10px] leading-snug text-gray-600">
            <span className="font-medium text-gray-700">Reason:</span> {info.errorMessage}
          </span>
          {info.errorCode ? (
            <span className="mt-1 block text-[10px] leading-snug text-gray-500">
              Error code: {info.errorCode}
            </span>
          ) : null}
        </span>
      </span>
    </span>
  );
}
