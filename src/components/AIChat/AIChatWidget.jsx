import { useEffect, useRef, useState } from 'react';
import { sendAIMessage } from '../../api/aiApi';
import { isAuthenticated } from '../../services/authService';
import './AIChatWidget.css';

const WELCOME_MESSAGE = {
  id: 'welcome',
  role: 'assistant',
  text: "Hi! I'm the WaabizX assistant. Ask me what WaabizX is or how it can help your business.",
};

function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([WELCOME_MESSAGE]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, loading]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  if (isAuthenticated()) {
    return null;
  }

  const handleSend = async () => {
    const text = String(message || '').trim();
    if (!text || loading) return;

    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
    };

    setMessages((prev) => [...prev, userMsg]);
    setMessage('');
    setLoading(true);

    try {
      const data = await sendAIMessage(text);
      const replyText =
        data?.success && data?.reply
          ? String(data.reply)
          : 'Sorry, I could not generate a reply right now.';

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: replyText,
        },
      ]);
    } catch (err) {
      const errText =
        err?.response?.data?.message ||
        'Unable to reach the assistant. Please try again in a moment.';
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'error',
          text: errText,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      {!isOpen ? (
        <button
          type="button"
          className="ai-chat-fab"
          aria-label="Open WaabizX AI assistant"
          onClick={() => setIsOpen(true)}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 3C7.03 3 3 6.58 3 11c0 2.13 1.01 4.04 2.62 5.38L5 21l4.28-2.14c.86.24 1.77.37 2.72.37 4.97 0 9-3.58 9-8s-4.03-8-9-8Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ) : null}

      {isOpen ? (
        <div className="ai-chat-panel" role="dialog" aria-label="WaabizX AI chat">
          <div className="ai-chat-header">
            <div>
              <p className="ai-chat-header-title">WaabizX Assistant</p>
              <p className="ai-chat-header-sub">Ask about WaabizX features & services</p>
            </div>
            <button
              type="button"
              className="ai-chat-close"
              aria-label="Close chat"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
          </div>

          <div className="ai-chat-messages">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`ai-chat-bubble ${
                  m.role === 'user'
                    ? 'ai-chat-bubble-user'
                    : m.role === 'error'
                      ? 'ai-chat-bubble-error'
                      : 'ai-chat-bubble-bot'
                }`}
              >
                {m.text}
              </div>
            ))}
            {loading ? <div className="ai-chat-typing">Thinking…</div> : null}
            <div ref={messagesEndRef} />
          </div>

          <div className="ai-chat-composer">
            <input
              ref={inputRef}
              type="text"
              className="ai-chat-input"
              placeholder="Ask about WaabizX…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={loading}
            />
            <button
              type="button"
              className="ai-chat-send"
              onClick={handleSend}
              disabled={loading || !String(message).trim()}
            >
              Send
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default AIChatWidget;
