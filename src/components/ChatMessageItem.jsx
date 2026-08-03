import React from 'react';
import MessageRenderer from './Chat/MessageRenderer';

/**
 * @deprecated Use MessageRenderer directly — kept for backward compatibility.
 */
export default function ChatMessageItem(props) {
  return <MessageRenderer {...props} source={props.message?.source || 'inbox'} />;
}
