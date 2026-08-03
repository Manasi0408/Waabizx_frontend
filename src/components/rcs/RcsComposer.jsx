import React, { useEffect, useState } from 'react';

const TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'card', label: 'Card' },
  { value: 'carousel', label: 'Carousel' },
];

const inputClass =
  'mt-1 w-full px-3 py-2 border-2 border-gray-200 rounded-xl text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 bg-white';

const defaultCard = () => ({
  type: 'card',
  header: { image: 'https://picsum.photos/400/250' },
  title: 'Product Name',
  description: 'Short description',
  buttons: [
    { type: 'reply', text: 'YES' },
    { type: 'reply', text: 'NO' },
    { type: 'url', text: 'Buy', url: 'https://example.com' },
  ],
});

const defaultCarousel = () => ({
  type: 'carousel',
  cards: [
    {
      title: 'Card 1',
      description: 'Offer A',
      image: 'https://picsum.photos/400/250?1',
      buttons: [{ type: 'reply', text: 'YES' }],
    },
    {
      title: 'Card 2',
      description: 'Offer B',
      image: 'https://picsum.photos/400/250?2',
      buttons: [{ type: 'reply', text: 'INTERESTED' }],
    },
    {
      title: 'Card 3',
      description: 'Offer C',
      image: 'https://picsum.photos/400/250?3',
      buttons: [{ type: 'reply', text: 'NO' }],
    },
  ],
});

/**
 * RCS send composer — Text / Image / Card / Carousel.
 */
export default function RcsComposer({ onSend, sending = false, defaultPhone = '' }) {
  const [phone, setPhone] = useState(defaultPhone);
  const [messageType, setMessageType] = useState('text');
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('https://picsum.photos/400/250');
  const [cardTitle, setCardTitle] = useState('Personal Loan');
  const [cardDesc, setCardDesc] = useState('Get loan up to ₹10L');
  const [contactName, setContactName] = useState('');

  useEffect(() => {
    if (defaultPhone) setPhone(defaultPhone);
  }, [defaultPhone]);

  const buildPayload = () => {
    const base = {
      channel: 'rcs',
      to: phone,
      contactName: contactName || undefined,
      messageType,
    };

    if (messageType === 'text') {
      return { ...base, message: text, content: null };
    }
    if (messageType === 'image') {
      return {
        ...base,
        message: text || 'Image',
        content: { type: 'image', url: imageUrl, caption: text },
      };
    }
    if (messageType === 'card') {
      const content = {
        ...defaultCard(),
        header: { image: imageUrl },
        title: cardTitle,
        description: cardDesc,
      };
      return { ...base, message: cardTitle, content };
    }
    return {
      ...base,
      message: 'Carousel',
      content: defaultCarousel(),
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!phone.trim()) return;
    await onSend?.(buildPayload());
    if (messageType === 'text') setText('');
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-2xl border border-gray-100/90 bg-white/95 backdrop-blur-sm p-4 shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900 tracking-tight">Send Message</h3>
        <span className="rounded-full bg-amber-50 border border-amber-200/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
          Mock RCS
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-gray-600">
          To (phone)
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9198xxxxxxxx"
            className={inputClass}
            required
          />
        </label>
        <label className="block text-xs font-semibold text-gray-600">
          Name (optional)
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="John"
            className={inputClass}
          />
        </label>
      </div>

      <fieldset>
        <legend className="text-xs font-semibold text-gray-600 mb-2">Type</legend>
        <div className="flex flex-wrap gap-3">
          {TYPES.map((t) => (
            <label key={t.value} className="inline-flex items-center gap-1.5 text-sm text-gray-800 cursor-pointer">
              <input
                type="radio"
                name="rcsType"
                value={t.value}
                checked={messageType === t.value}
                onChange={() => setMessageType(t.value)}
                className="text-sky-600"
              />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      {messageType === 'text' || messageType === 'image' ? (
        <label className="block text-xs font-semibold text-gray-600">
          {messageType === 'image' ? 'Caption' : 'Message'}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className={inputClass}
            placeholder="Hello from RCS…"
            required={messageType === 'text'}
          />
        </label>
      ) : null}

      {(messageType === 'image' || messageType === 'card') && (
        <label className="block text-xs font-semibold text-gray-600">
          Image URL
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className={inputClass}
          />
        </label>
      )}

      {messageType === 'card' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-gray-600">
            Product Name
            <input
              value={cardTitle}
              onChange={(e) => setCardTitle(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block text-xs font-semibold text-gray-600">
            Description
            <input
              value={cardDesc}
              onChange={(e) => setCardDesc(e.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      )}

      {messageType === 'carousel' && (
        <p className="text-xs text-gray-500">Sends a 3-card sample carousel (YES / INTERESTED / NO).</p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="w-full inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-sky-500/25 hover:from-sky-500 hover:to-blue-500 disabled:opacity-60 transition"
      >
        {sending ? 'Sending…' : 'Send RCS'}
      </button>
    </form>
  );
}
