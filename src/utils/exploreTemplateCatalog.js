const slugify = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

export const EXPLORE_INDUSTRIES = [
  { key: 'general', label: 'General', section: 'main' },
  { key: 'top_rated', label: 'Top Rated', section: 'main' },
  { key: 'ecommerce', label: 'Ecommerce', section: 'industry' },
  { key: 'education', label: 'Education', section: 'industry' },
  { key: 'banking', label: 'Banking', section: 'industry' },
  { key: 'webinar', label: 'Webinar', section: 'industry' },
  { key: 'healthcare', label: 'Healthcare', section: 'industry' },
  { key: 'automobile', label: 'Automobile', section: 'industry' },
  { key: 'real_estate', label: 'Real Estate', section: 'industry' },
  { key: 'services', label: 'Services', section: 'industry' },
  { key: 'nonprofit', label: 'Non-profit', section: 'industry' },
];

export const EXPLORE_TEMPLATE_CATALOG = [
  {
    id: 'explore_referrals',
    title: 'Increase Referrals',
    industry: 'services',
    topRated: true,
    templateType: 'text',
    category: 'marketing',
    badges: ['TEXT', 'Quick Replies'],
    icon: '🤝',
    accent: 'from-violet-400 to-purple-600',
    content:
      'Hi {{1}}, thank you for choosing us! Refer a friend and both of you get *10% off* on the next purchase. Reply *YES* to get your referral link.',
    footer: 'Reply STOP to opt out',
    actionMode: 'quick_reply',
    quickReplies: [{ id: 'qr-1', label: 'YES' }, { id: 'qr-2', label: 'Not now' }],
  },
  {
    id: 'explore_festive',
    title: 'Festive Wishes',
    industry: 'general',
    topRated: true,
    templateType: 'image',
    category: 'marketing',
    badges: ['IMAGE', 'Quick Replies'],
    icon: '🎉',
    accent: 'from-amber-400 to-orange-500',
    imageUrl: 'https://images.unsplash.com/photo-1512389142860-9c449e58a814?w=600&auto=format&fit=crop&q=80',
    content:
      'Warm wishes from {{1}}! May this festive season bring joy and prosperity to you and your family.',
    footer: 'Team {{1}}',
    actionMode: 'quick_reply',
    quickReplies: [{ id: 'qr-1', label: 'Thank you' }],
  },
  {
    id: 'explore_webinar',
    title: 'Webinar Invite',
    industry: 'webinar',
    topRated: true,
    templateType: 'text',
    category: 'utility',
    badges: ['TEXT', 'Call To Action'],
    icon: '📅',
    accent: 'from-sky-400 to-blue-600',
    content:
      'Hello {{1}}, you are invited to our live webinar on *{{2}}* on {{3}} at {{4}}. Tap below to register your seat.',
    footer: 'Limited seats available',
    actionMode: 'cta',
    callToActions: [{ id: 'cta-1', type: 'url', label: 'Register Now', value: 'https://example.com/webinar' }],
  },
  {
    id: 'explore_order_update',
    title: 'Order Shipped',
    industry: 'ecommerce',
    templateType: 'text',
    category: 'utility',
    badges: ['TEXT'],
    icon: '📦',
    accent: 'from-emerald-400 to-teal-600',
    content:
      'Hi {{1}}, great news! Your order *#{{2}}* has been shipped and will arrive by {{3}}. Track your package anytime.',
    footer: 'Thank you for shopping with us',
    actionMode: 'cta',
    callToActions: [{ id: 'cta-1', type: 'url', label: 'Track Order', value: 'https://example.com/track' }],
  },
  {
    id: 'explore_cart_recovery',
    title: 'Cart Recovery',
    industry: 'ecommerce',
    topRated: true,
    templateType: 'image',
    category: 'marketing',
    badges: ['IMAGE', 'Quick Replies'],
    icon: '🛒',
    accent: 'from-pink-400 to-rose-500',
    imageUrl: 'https://images.unsplash.com/photo-1472851294607-062f824d29cc?w=600&auto=format&fit=crop&q=80',
    content:
      'Hi {{1}}, you left items in your cart. Complete checkout now and get *free delivery* on your order.',
    actionMode: 'quick_reply',
    quickReplies: [{ id: 'qr-1', label: 'Checkout now' }, { id: 'qr-2', label: 'Remind later' }],
  },
  {
    id: 'explore_course_reminder',
    title: 'Class Reminder',
    industry: 'education',
    templateType: 'text',
    category: 'utility',
    badges: ['TEXT'],
    icon: '🎓',
    accent: 'from-indigo-400 to-violet-600',
    content:
      'Reminder: Your class *{{1}}* starts today at {{2}}. Join from your student portal. Reply HELP if you need assistance.',
    actionMode: 'quick_reply',
    quickReplies: [{ id: 'qr-1', label: 'HELP' }],
  },
  {
    id: 'explore_loan_update',
    title: 'Loan Application Update',
    industry: 'banking',
    templateType: 'text',
    category: 'utility',
    badges: ['TEXT', 'Call To Action'],
    icon: '🏦',
    accent: 'from-cyan-400 to-sky-600',
    content:
      'Dear {{1}}, your loan application *{{2}}* is under review. We will notify you within 24 hours. Tap below for status.',
    actionMode: 'cta',
    callToActions: [{ id: 'cta-1', type: 'url', label: 'Check Status', value: 'https://example.com/loan' }],
  },
  {
    id: 'explore_appointment',
    title: 'Appointment Reminder',
    industry: 'healthcare',
    templateType: 'text',
    category: 'utility',
    badges: ['TEXT', 'Quick Replies'],
    icon: '🏥',
    accent: 'from-teal-400 to-emerald-600',
    content:
      'Hello {{1}}, this is a reminder for your appointment on *{{2}}* at {{3}} with Dr. {{4}}. Reply CONFIRM or RESCHEDULE.',
    actionMode: 'quick_reply',
    quickReplies: [{ id: 'qr-1', label: 'CONFIRM' }, { id: 'qr-2', label: 'RESCHEDULE' }],
  },
  {
    id: 'explore_test_drive',
    title: 'Test Drive Invite',
    industry: 'automobile',
    templateType: 'image',
    category: 'marketing',
    badges: ['IMAGE', 'Call To Action'],
    icon: '🚗',
    accent: 'from-slate-500 to-slate-800',
    imageUrl: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=600&auto=format&fit=crop&q=80',
    content:
      'Hi {{1}}, experience the all-new model with a complimentary test drive at {{2}}. Book your slot today.',
    actionMode: 'cta',
    callToActions: [{ id: 'cta-1', type: 'url', label: 'Book Test Drive', value: 'https://example.com/drive' }],
  },
  {
    id: 'explore_site_visit',
    title: 'Site Visit Invite',
    industry: 'real_estate',
    templateType: 'image',
    category: 'marketing',
    badges: ['IMAGE', 'Quick Replies'],
    icon: '🏠',
    accent: 'from-lime-500 to-green-700',
    imageUrl: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=600&auto=format&fit=crop&q=80',
    content:
      'Hello {{1}}, a new property matching your preferences is available at *{{2}}*. Would you like to schedule a site visit?',
    actionMode: 'quick_reply',
    quickReplies: [{ id: 'qr-1', label: 'Schedule visit' }, { id: 'qr-2', label: 'Send details' }],
  },
  {
    id: 'explore_feedback',
    title: 'Service Feedback',
    industry: 'services',
    templateType: 'text',
    category: 'utility',
    badges: ['TEXT', 'Quick Replies'],
    icon: '⭐',
    accent: 'from-yellow-400 to-amber-500',
    content:
      'Hi {{1}}, how was your recent experience with us? Your feedback helps us serve you better.',
    actionMode: 'quick_reply',
    quickReplies: [{ id: 'qr-1', label: 'Great' }, { id: 'qr-2', label: 'Needs improvement' }],
  },
  {
    id: 'explore_donation',
    title: 'Donation Appeal',
    industry: 'nonprofit',
    templateType: 'text',
    category: 'marketing',
    badges: ['TEXT', 'Call To Action'],
    icon: '💚',
    accent: 'from-green-400 to-emerald-700',
    content:
      'Dear {{1}}, your support can change lives. Join our mission this month and help us reach {{2}} families in need.',
    actionMode: 'cta',
    callToActions: [{ id: 'cta-1', type: 'url', label: 'Donate Now', value: 'https://example.com/donate' }],
  },
];

export function exploreItemToLocalForm(item) {
  if (!item) return null;
  const baseName = slugify(item.name || item.title);
  return {
    name: baseName,
    category: item.category || 'marketing',
    language: item.language || 'en_US',
    templateType: item.templateType || 'text',
    content: item.content || '',
    footer: item.footer || '',
    actionMode: item.actionMode || 'none',
    callToActions: Array.isArray(item.callToActions)
      ? item.callToActions
      : [{ id: 'cta-1', type: 'url', label: '', value: '' }],
    quickReplies: Array.isArray(item.quickReplies)
      ? item.quickReplies
      : [
          { id: 'qr-1', label: '' },
          { id: 'qr-2', label: '' },
        ],
    headerMediaUrl: item.imageUrl || '',
  };
}

export function exploreItemToTemplateRecord(item) {
  if (!item) return null;
  const form = exploreItemToLocalForm(item);
  return {
    id: item.id,
    name: form.name,
    category: form.category,
    language: form.language,
    content: form.content,
    status: 'APPROVED',
    metaStatus: 'APPROVED',
    variables: {
      templateType: form.templateType,
      actionMode: form.actionMode,
      callToActions: form.callToActions,
      quickReplies: form.quickReplies,
      footer: form.footer,
      headerMediaUrl: form.headerMediaUrl,
    },
  };
}

export function filterExploreCatalog(catalog, industryKey, search = '') {
  const list = Array.isArray(catalog) ? catalog : [];
  const key = String(industryKey || 'general');
  const q = String(search || '').trim().toLowerCase();

  let filtered = list;
  if (key === 'top_rated') {
    filtered = list.filter((item) => item.topRated);
  } else if (key !== 'general') {
    filtered = list.filter((item) => item.industry === key);
  }

  if (!q) return filtered;
  return filtered.filter((item) => {
    const hay = `${item.title || ''} ${item.content || ''} ${(item.badges || []).join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
}
