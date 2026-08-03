import React from 'react';
import { getMessageRenderType, normalizeMessage } from '../../utils/messageParser';
import { isTemplateMessage } from '../../utils/whatsappTemplatePreview';
import TextMessage from './TextMessage';
import ImageMessage from './ImageMessage';
import VideoMessage from './VideoMessage';
import AudioMessage from './AudioMessage';
import DocumentMessage from './DocumentMessage';
import TemplateMessage from './TemplateMessage';
import InteractiveMessage from './InteractiveMessage';
import ListMessage from './ListMessage';
import FlowMessage from './FlowMessage';
import StickerMessage from './StickerMessage';
import LocationMessage from './LocationMessage';
import ContactMessage from './ContactMessage';

const DEFAULT_API_BASE =
  process.env.REACT_APP_API_URL?.replace(/\/api\/?$/i, '') ||
  // 'https://wabizx.techwhizzc.com';
  'https://api.waabizx.com';

/**
 * AiSensy-style message renderer — switch on normalized message type.
 * Never renders raw webhook JSON; always goes through normalizeMessage first.
 */
export default function MessageRenderer({
  message: rawMessage,
  source = 'unknown',
  templateCatalog,
  apiBase = DEFAULT_API_BASE,
  formatTime,
  status,
  onButtonClick,
  align,
}) {
  const message = normalizeMessage(rawMessage, source);
  if (!message) return null;

  const resolvedAlign =
    align ||
    (message.type === 'outgoing' || message.sender === 'agent' ? 'right' : 'left');

  const renderType = isTemplateMessage(message) ? 'template' : getMessageRenderType(message);
  const common = {
    message,
    align: resolvedAlign,
    formatTime,
    status: status || message.status,
    apiBase,
  };

  switch (renderType) {
    case 'template':
      return (
        <TemplateMessage
          {...common}
          templateCatalog={templateCatalog}
        />
      );

    case 'image':
      return <ImageMessage {...common} />;

    case 'video':
      return <VideoMessage {...common} />;

    case 'audio':
      return <AudioMessage {...common} />;

    case 'document':
      return <DocumentMessage {...common} />;

    case 'sticker':
      return <StickerMessage {...common} />;

    case 'location':
      return <LocationMessage {...common} />;

    case 'contact':
      return <ContactMessage {...common} />;

    case 'interactive':
      return <InteractiveMessage {...common} />;

    case 'list':
      return <ListMessage {...common} />;

    case 'flow':
      return <FlowMessage {...common} />;

    case 'text':
    default:
      return (
        <TextMessage
          {...common}
          onButtonClick={
            !isTemplateMessage(message) &&
            message.type === 'incoming' &&
            Array.isArray(message.buttons) &&
            message.buttons.length > 0
              ? onButtonClick
              : undefined
          }
        />
      );
  }
}
