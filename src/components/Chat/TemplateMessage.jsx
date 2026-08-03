import React from 'react';
import WhatsAppMessageBubble from '../WhatsAppMessageBubble';
import {
  resolveMessageTemplatePreview,
} from '../../utils/whatsappTemplatePreview';

export default function TemplateMessage({
  message,
  templateCatalog,
  align,
  formatTime,
  status,
  apiBase,
}) {
  const preview = resolveMessageTemplatePreview(message, templateCatalog);
  return (
    <WhatsAppMessageBubble
      message={message}
      preview={preview}
      align={align}
      apiBase={apiBase}
      formatTime={formatTime}
      status={status || message?.status}
    />
  );
}
