import React from 'react';
import MessageBubble from './MessageBubble';

export default function LocationMessage({ message, align, formatTime, status }) {
  const name = message?.locationName || message?.content || 'Location';
  const lat = message?.latitude;
  const lng = message?.longitude;
  const mapsUrl =
    lat != null && lng != null
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : null;

  return (
    <MessageBubble message={message} align={align} formatTime={formatTime} status={status}>
      <div className="px-1 py-1">
        <div className="w-full h-28 bg-gradient-to-br from-green-100 to-green-200 rounded-md flex items-center justify-center mb-2">
          <span className="text-3xl">📍</span>
        </div>
        <p className="text-[14px] font-medium text-[#111b21]">{name}</p>
        {message?.locationAddress ? (
          <p className="text-[12px] text-gray-500 mt-0.5">{message.locationAddress}</p>
        ) : null}
        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-[13px] text-[#00a5f4]"
          >
            Open in Maps
          </a>
        ) : null}
      </div>
    </MessageBubble>
  );
}
