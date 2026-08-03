import React from 'react';

export function StatusTicks({ status }) {
  const s = String(status || '').toLowerCase();
  if (s === 'read') {
    return (
      <svg className="w-[15px] h-[15px] text-[#53bdeb]" viewBox="0 0 16 15" fill="currentColor" aria-hidden>
        <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.892 7.77a.366.366 0 0 0-.514.064l-.39.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512z" />
      </svg>
    );
  }
  if (s === 'delivered' || s === 'received') {
    return (
      <svg className="w-[15px] h-[15px] text-[#667781]" viewBox="0 0 16 15" fill="currentColor" aria-hidden>
        <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.88a.32.32 0 0 1-.484.032l-.358-.325a.32.32 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.88a.32.32 0 0 1-.484.032L1.892 7.77a.366.366 0 0 0-.514.064l-.39.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512z" />
      </svg>
    );
  }
  if (s === 'failed') {
    return <span className="text-[10px] text-red-500">!</span>;
  }
  return (
    <svg className="w-[15px] h-[15px] text-[#667781]" viewBox="0 0 12 11" fill="currentColor" aria-hidden>
      <path d="M11 0.5L4.5 7 1.5 4" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

/** Time + read receipts — bottom right like WhatsApp */
export default function MessageMeta({ formatTime, status, outgoing = false }) {
  if (typeof formatTime !== 'function') return null;
  return (
    <div className="flex items-center justify-end gap-0.5 -mt-0.5 pb-0.5 px-0.5 text-[#667781]">
      <span className="text-[11px] leading-none">{formatTime()}</span>
      {outgoing && <StatusTicks status={status} />}
    </div>
  );
}
