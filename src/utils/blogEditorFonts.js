export const ITALIC_FONT_VALUE = '__italic__';

export const BLOG_GOOGLE_FONTS = [
  { label: 'Inter', family: 'Inter', stack: "'Inter', sans-serif" },
  { label: 'Roboto', family: 'Roboto', stack: "'Roboto', sans-serif" },
  { label: 'Open Sans', family: 'Open Sans', stack: "'Open Sans', sans-serif" },
  { label: 'Lato', family: 'Lato', stack: "'Lato', sans-serif" },
  { label: 'Poppins', family: 'Poppins', stack: "'Poppins', sans-serif" },
  { label: 'Montserrat', family: 'Montserrat', stack: "'Montserrat', sans-serif" },
  { label: 'Nunito', family: 'Nunito', stack: "'Nunito', sans-serif" },
  { label: 'Raleway', family: 'Raleway', stack: "'Raleway', sans-serif" },
  { label: 'Ubuntu', family: 'Ubuntu', stack: "'Ubuntu', sans-serif" },
  { label: 'Rubik', family: 'Rubik', stack: "'Rubik', sans-serif" },
  { label: 'Work Sans', family: 'Work Sans', stack: "'Work Sans', sans-serif" },
  { label: 'Oswald', family: 'Oswald', stack: "'Oswald', sans-serif" },
  { label: 'PT Sans', family: 'PT Sans', stack: "'PT Sans', sans-serif" },
  { label: 'Merriweather', family: 'Merriweather', stack: "'Merriweather', serif" },
  { label: 'Playfair Display', family: 'Playfair Display', stack: "'Playfair Display', serif" },
  { label: 'Source Sans 3', family: 'Source Sans 3', stack: "'Source Sans 3', sans-serif" },
  { label: 'DM Sans', family: 'DM Sans', stack: "'DM Sans', sans-serif" },
  { label: 'Manrope', family: 'Manrope', stack: "'Manrope', sans-serif" },
];

export const BLOG_SYSTEM_FONTS = [
  { label: 'Arial', stack: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', stack: 'Georgia, serif' },
  { label: 'Times New Roman', stack: "'Times New Roman', Times, serif" },
  { label: 'Courier New', stack: "'Courier New', Courier, monospace" },
  { label: 'Verdana', stack: 'Verdana, Geneva, sans-serif' },
  { label: 'Tahoma', stack: 'Tahoma, Geneva, sans-serif' },
];

export const FONT_FAMILY_OPTIONS = [
  ...BLOG_GOOGLE_FONTS.map(({ label, stack }) => ({ label, value: stack })),
  ...BLOG_SYSTEM_FONTS.map(({ label, stack }) => ({ label, value: stack })),
  { label: 'Italic', value: ITALIC_FONT_VALUE },
];

export const BLOG_EDITOR_GOOGLE_FONTS_HREF = `https://fonts.googleapis.com/css2?${BLOG_GOOGLE_FONTS.map(
  (item) => `family=${item.family.replace(/ /g, '+')}:wght@400;600;700`
).join('&')}&display=swap`;

const BLOG_GOOGLE_FONTS_LINK_ID = 'blog-google-fonts';

/** Load Google Fonts used by the blog editor / public blog body HTML. */
export function ensureBlogGoogleFontsLoaded() {
  if (typeof document === 'undefined') return;
  let link = document.getElementById(BLOG_GOOGLE_FONTS_LINK_ID);
  if (!link) {
    link = document.createElement('link');
    link.id = BLOG_GOOGLE_FONTS_LINK_ID;
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
  if (link.href !== BLOG_EDITOR_GOOGLE_FONTS_HREF) {
    link.href = BLOG_EDITOR_GOOGLE_FONTS_HREF;
  }
}

export function normalizeFontFamily(value) {
  return String(value || '')
    .replace(/["']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function resolveFontOptionValue(rawFontFamily) {
  if (!rawFontFamily) return '';
  const normalized = normalizeFontFamily(rawFontFamily);
  const exact = FONT_FAMILY_OPTIONS.find(
    (item) => item.value !== ITALIC_FONT_VALUE && normalizeFontFamily(item.value) === normalized
  );
  if (exact) return exact.value;
  const primary = normalized.split(',')[0]?.trim();
  const partial = FONT_FAMILY_OPTIONS.find(
    (item) => item.value !== ITALIC_FONT_VALUE && normalizeFontFamily(item.label) === primary
  );
  return partial?.value || '';
}

export function detectFontFamilyAtCursor(editor) {
  if (!editor) return '';
  const sel = window.getSelection();
  if (!sel?.rangeCount) return '';
  let node = sel.getRangeAt(0).startContainer;
  if (node?.nodeType === Node.TEXT_NODE) node = node.parentElement;
  while (node && node !== editor) {
    const inlineFont = node.style?.fontFamily;
    if (inlineFont) return resolveFontOptionValue(inlineFont);
    node = node.parentElement;
  }
  return '';
}
