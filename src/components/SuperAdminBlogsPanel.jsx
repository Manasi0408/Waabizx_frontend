import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from '../api/axios';
import SuperAdminPagination, { BLOG_PAGE_SIZE, useSuperAdminPagination } from './SuperAdminPagination';
import {
  SuperAdminAlert,
  SuperAdminHero,
  SuperAdminPage,
  SuperAdminPanel,
  SuperAdminStatGrid,
  SuperAdminStatTile,
} from './SuperAdminUi';
import {
  ensureBlogGoogleFontsLoaded,
  detectFontFamilyAtCursor,
  FONT_FAMILY_OPTIONS,
  ITALIC_FONT_VALUE,
} from '../utils/blogEditorFonts';

const API_ORIGIN = String(axios.defaults.baseURL || '')
  .replace(/\/api\/?$/, '')
  .replace(/\/$/, '');

const resolveMediaUrl = (url) => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  // Backend now returns absolute /api/uploads URLs — use as-is
  if (/^https?:\/\//i.test(raw)) return raw;
  // Legacy relative /uploads/... → proxy-safe /api/uploads/...
  if (raw.startsWith('/api/uploads/')) return `${API_ORIGIN}${raw}`;
  if (raw.startsWith('/uploads/')) return `${API_ORIGIN}/api${raw}`;
  if (raw.startsWith('/')) return `${API_ORIGIN}${raw}`;
  return `${API_ORIGIN}/${raw}`;
};

const todayInputValue = () => new Date().toISOString().slice(0, 10);

const formatDisplayDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const emptyForm = (userName = 'SuperAdmin') => ({
  id: null,
  title: '',
  blog_date: todayInputValue(),
  created_by: userName,
  image_url: '',
  meta_title: '',
  meta_description: '',
  meta_keywords: '',
  details: '',
  is_active: true,
});

const BLOCK_FORMATS = [
  { label: 'Normal', tag: 'p' },
  { label: 'Quote', tag: 'blockquote' },
  { label: 'Code', tag: 'pre' },
  { label: 'Header 1', tag: 'h1' },
  { label: 'Header 2', tag: 'h2' },
  { label: 'Header 3', tag: 'h3' },
  { label: 'Header 4', tag: 'h4' },
  { label: 'Header 5', tag: 'h5' },
  { label: 'Header 6', tag: 'h6' },
];

const LINE_SPACING_OPTIONS = [
  { label: '1.0', value: '1' },
  { label: '1.5', value: '1.5' },
  { label: '2.0', value: '2' },
];

const FONT_SIZE_OPTIONS = [
  { label: '10', value: '10px' },
  { label: '12', value: '12px' },
  { label: '14', value: '14px' },
  { label: '16', value: '16px' },
  { label: '18', value: '18px' },
  { label: '20', value: '20px' },
  { label: '24', value: '24px' },
  { label: '28', value: '28px' },
  { label: '32', value: '32px' },
  { label: '36', value: '36px' },
];

function AlignIcon({ type }) {
  const lines = {
    left: ['w-full', 'w-4/5', 'w-full', 'w-3/5'],
    center: ['w-4/5 mx-auto', 'w-full mx-auto', 'w-3/5 mx-auto', 'w-4/5 mx-auto'],
    right: ['w-full ml-auto', 'w-4/5 ml-auto', 'w-full ml-auto', 'w-3/5 ml-auto'],
    full: ['w-full', 'w-full', 'w-full', 'w-full'],
  };
  return (
    <span className="inline-flex w-4 flex-col gap-0.5" aria-hidden>
      {(lines[type] || lines.left).map((cls, i) => (
        <span key={i} className={`block h-0.5 rounded bg-current ${cls}`} />
      ))}
    </span>
  );
}

const editorBodyClass =
  'min-h-[180px] max-h-[360px] overflow-y-auto bg-white px-3 py-3 text-sm text-gray-800 outline-none prose prose-sm max-w-none ' +
  '[&_a]:text-sky-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 ' +
  '[&_blockquote]:border-l-4 [&_blockquote]:border-sky-300 [&_blockquote]:pl-4 [&_blockquote]:italic ' +
  '[&_pre]:rounded-lg [&_pre]:bg-gray-900 [&_pre]:p-3 [&_pre]:text-gray-100 [&_table]:w-full [&_table]:border-collapse ' +
  '[&_td]:border [&_td]:border-gray-300 [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1.5 ' +
  '[&_.blog-editor-table-wrap_table]:w-full [&_.blog-editor-table-remove:hover]:bg-red-50';

const BLOCK_TAGS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'BLOCKQUOTE', 'PRE', 'TD', 'TH']);

const EMPTY_EDITOR_HTML = '<p><br></p>';
const TABLE_WRAP_CLASS = 'blog-editor-table-wrap';
const TABLE_REMOVE_CLASS = 'blog-editor-table-remove';

async function uploadBlogInlineImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const res = await axios.post('/blogs/inline-image', fd);
  return res?.data?.url || res?.data?.image_url || '';
}

async function persistBlobImagesInDetails(html) {
  const raw = String(html || '');
  if (!raw.includes('blob:')) return raw;
  const doc = new DOMParser().parseFromString(raw, 'text/html');
  const imgs = [...doc.querySelectorAll('img[src^="blob:"]')];
  for (const img of imgs) {
    try {
      const blob = await fetch(img.getAttribute('src')).then((response) => response.blob());
      const ext = blob.type === 'image/png' ? '.png' : blob.type === 'image/webp' ? '.webp' : '.jpg';
      const file = new File([blob], `inline-${Date.now()}${ext}`, { type: blob.type || 'image/jpeg' });
      const url = await uploadBlogInlineImage(file);
      if (url) img.setAttribute('src', url);
    } catch (_) {
      // Keep existing src if upload fails.
    }
  }
  return doc.body.innerHTML;
}

function createTableElement(rows, cols) {
  const table = document.createElement('table');
  table.setAttribute('border', '1');
  table.setAttribute('cellpadding', '8');
  table.setAttribute('cellspacing', '0');
  table.style.borderCollapse = 'collapse';
  table.style.width = '100%';

  const tbody = document.createElement('tbody');
  for (let r = 0; r < rows; r += 1) {
    const tr = document.createElement('tr');
    for (let c = 0; c < cols; c += 1) {
      const td = document.createElement('td');
      td.innerHTML = '&nbsp;';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function wrapTableWithRemoveControl(table) {
  if (!table || table.closest(`.${TABLE_WRAP_CLASS}`)) return table?.closest(`.${TABLE_WRAP_CLASS}`) || table;

  const wrap = document.createElement('div');
  wrap.className = TABLE_WRAP_CLASS;
  wrap.style.position = 'relative';
  wrap.style.margin = '0.5rem 0';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = TABLE_REMOVE_CLASS;
  removeBtn.title = 'Remove table';
  removeBtn.setAttribute('aria-label', 'Remove table');
  removeBtn.textContent = '×';
  removeBtn.contentEditable = 'false';
  removeBtn.style.cssText =
    'position:absolute;top:-8px;right:-8px;z-index:2;width:20px;height:20px;padding:0;' +
    'border:1px solid #fca5a5;border-radius:9999px;background:#fff;color:#dc2626;' +
    'font-size:14px;line-height:1;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,0.08);';

  if (table.parentNode) {
    table.parentNode.insertBefore(wrap, table);
  }
  wrap.appendChild(removeBtn);
  wrap.appendChild(table);
  return wrap;
}

function normalizeTablesForEditor(editor) {
  if (!editor) return;
  editor.querySelectorAll('table').forEach((table) => {
    if (!table.closest(`.${TABLE_WRAP_CLASS}`)) {
      wrapTableWithRemoveControl(table);
    }
  });
}

function serializeEditorHtml(editor) {
  if (!editor) return '';
  const clone = editor.cloneNode(true);
  clone.querySelectorAll(`.${TABLE_WRAP_CLASS}`).forEach((wrap) => {
    const table = wrap.querySelector('table');
    if (table) {
      wrap.replaceWith(table.cloneNode(true));
    } else {
      wrap.remove();
    }
  });
  return clone.innerHTML;
}

function focusTableCell(table) {
  const cell = table?.querySelector('td, th');
  if (!cell) return;
  const range = document.createRange();
  range.selectNodeContents(cell);
  range.collapse(true);
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

function getBlockElement(node, editor) {
  let current = node;
  if (current?.nodeType === Node.TEXT_NODE) current = current.parentElement;
  while (current && current !== editor && !BLOCK_TAGS.has(current.tagName)) {
    current = current.parentElement;
  }
  return current && current !== editor ? current : null;
}

function ensureEditorHasBlock(editor) {
  if (!editor) return null;
  const text = String(editor.textContent || '').replace(/\u200b/g, '').trim();
  if (!text && !editor.querySelector('p,div,h1,h2,h3,h4,h5,h6,ul,ol,table,blockquote,pre')) {
    editor.innerHTML = EMPTY_EDITOR_HTML;
  }
  const sel = window.getSelection();
  if (!sel) return editor.querySelector('p') || editor.firstElementChild;
  if (sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) {
    const block = editor.querySelector('p') || editor.firstElementChild;
    if (block) {
      const range = document.createRange();
      range.selectNodeContents(block);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  return getBlockElement(sel.anchorNode, editor);
}

function RichTextEditor({ value, onChange }) {
  const editorRef = useRef(null);
  const imageInputRef = useRef(null);
  const lastHtmlRef = useRef('');
  const savedSelectionRef = useRef(null);
  const uploadingImageRef = useRef(false);

  useEffect(() => {
    ensureBlogGoogleFontsLoaded();
  }, []);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const next = value || '';
    if (next !== lastHtmlRef.current) {
      el.innerHTML = next || EMPTY_EDITOR_HTML;
      normalizeTablesForEditor(el);
      lastHtmlRef.current = next || EMPTY_EDITOR_HTML;
    }
  }, [value]);

  const emitChange = () => {
    const el = editorRef.current;
    if (!el) return;
    const html = serializeEditorHtml(el);
    lastHtmlRef.current = html;
    onChange(html);
  };

  const saveSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const editor = editorRef.current;
    if (!editor || !editor.contains(range.commonAncestorContainer)) return;
    savedSelectionRef.current = range.cloneRange();
    setSelectedFontFamily(detectFontFamilyAtCursor(editor));
  };

  const restoreSelection = () => {
    const range = savedSelectionRef.current;
    if (!range) return false;
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  };

  const focusEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    if (!restoreSelection()) {
      ensureEditorHasBlock(editor);
    }
  };

  const withEditorSelection = (fn) => {
    const editor = editorRef.current;
    if (!editor) return;
    focusEditor();
    ensureEditorHasBlock(editor);
    fn(editor);
    saveSelection();
    emitChange();
  };

  const wrapSelectionInline = (mutateNode) => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;

    if (range.collapsed) {
      const span = document.createElement('span');
      mutateNode(span);
      span.appendChild(document.createTextNode('\u200b'));
      range.insertNode(span);
      range.setStart(span.firstChild, 1);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return;
    }

    const wrapper = document.createElement('span');
    mutateNode(wrapper);
    try {
      range.surroundContents(wrapper);
    } catch (_) {
      const fragment = range.extractContents();
      wrapper.appendChild(fragment);
      range.insertNode(wrapper);
    }
    range.setStartAfter(wrapper);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const exec = (command, arg = null) => {
    try {
      return document.execCommand(command, false, arg);
    } catch (_) {
      return false;
    }
  };

  const run = (command, arg = null) => {
    withEditorSelection(() => {
      exec(command, arg);
    });
  };

  const toolbarAction = (handler) => (e) => {
    e.preventDefault();
    saveSelection();
    handler();
  };

  const applyBlockFormat = (tag) => {
    if (!tag) return;
    withEditorSelection((editor) => {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const block = getBlockElement(sel.getRangeAt(0).commonAncestorContainer, editor) || ensureEditorHasBlock(editor);
      const applied =
        exec('formatBlock', `<${tag}>`) ||
        exec('formatBlock', tag);

      if (!applied && block?.parentNode) {
        const replacement = document.createElement(tag);
        if (tag === 'pre') {
          const code = document.createElement('code');
          code.textContent = block.textContent || '';
          replacement.appendChild(code);
        } else {
          replacement.innerHTML = block.innerHTML || '<br>';
        }
        block.parentNode.replaceChild(replacement, block);
        const range = document.createRange();
        range.selectNodeContents(replacement);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
  };

  const applyTextColor = (color) => {
    if (!color) return;
    withEditorSelection(() => {
      exec('styleWithCSS', true);
      if (!exec('foreColor', color)) {
        wrapSelectionInline((node) => {
          node.style.color = color;
        });
      }
    });
  };

  const applyHighlightColor = (color) => {
    if (!color) return;
    withEditorSelection(() => {
      exec('styleWithCSS', true);
      if (color === 'transparent') {
        wrapSelectionInline((node) => {
          node.style.backgroundColor = 'transparent';
        });
        return;
      }
      if (!exec('hiliteColor', color) && !exec('backColor', color)) {
        wrapSelectionInline((node) => {
          node.style.backgroundColor = color;
        });
      }
    });
  };

  const applyFontSize = (size) => {
    if (!size) return;
    withEditorSelection(() => {
      wrapSelectionInline((node) => {
        node.style.fontSize = size;
      });
    });
  };

  const applyFontFamily = (fontFamily) => {
    if (!fontFamily) return;
    if (fontFamily === ITALIC_FONT_VALUE) {
      withEditorSelection(() => {
        exec('styleWithCSS', true);
        if (!exec('italic')) {
          wrapSelectionInline((node) => {
            node.style.fontStyle = 'italic';
          });
        }
      });
      return;
    }
    withEditorSelection(() => {
      exec('styleWithCSS', true);
      wrapSelectionInline((node) => {
        node.style.fontFamily = fontFamily;
      });
    });
    setSelectedFontFamily(fontFamily);
  };

  const applyLineSpacing = (lineHeight) => {
    if (!lineHeight) return;
    withEditorSelection((editor) => {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const range = sel.getRangeAt(0);

      if (!range.collapsed) {
        const wrapper = document.createElement('span');
        wrapper.style.lineHeight = lineHeight;
        wrapper.style.display = 'inline-block';
        try {
          range.surroundContents(wrapper);
        } catch (_) {
          const fragment = range.extractContents();
          wrapper.appendChild(fragment);
          range.insertNode(wrapper);
        }
        return;
      }

      const block = getBlockElement(range.startContainer, editor) || ensureEditorHasBlock(editor);
      if (block) block.style.lineHeight = lineHeight;
    });
  };

  const applyAlign = (align) => {
    const commandMap = {
      left: 'justifyLeft',
      center: 'justifyCenter',
      right: 'justifyRight',
      full: 'justifyFull',
    };
    withEditorSelection((editor) => {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const block = getBlockElement(sel.getRangeAt(0).commonAncestorContainer, editor) || ensureEditorHasBlock(editor);
      exec(commandMap[align]);
      if (block) {
        block.style.textAlign = align === 'full' ? 'justify' : align;
      }
    });
  };

  const [textColor, setTextColor] = useState('#111827');
  const [highlightColor, setHighlightColor] = useState('#fef08a');
  const [selectedFontFamily, setSelectedFontFamily] = useState('');

  const insertImageAtSelection = (url) => {
    if (!url) return;
    withEditorSelection((editor) => {
      const img = document.createElement('img');
      img.src = url;
      img.alt = '';
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.borderRadius = '8px';

      const sel = window.getSelection();
      if (sel?.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(img);
        const spacer = document.createElement('p');
        spacer.innerHTML = '<br>';
        img.after(spacer);
      } else {
        editor.appendChild(img);
        const spacer = document.createElement('p');
        spacer.innerHTML = '<br>';
        editor.appendChild(spacer);
      }
    });
  };

  const handleInlineImageUpload = async (file) => {
    if (!file || uploadingImageRef.current) return;
    uploadingImageRef.current = true;
    try {
      const url = await uploadBlogInlineImage(file);
      insertImageAtSelection(url);
    } catch (err) {
      window.alert(err?.response?.data?.message || err?.message || 'Failed to upload image');
    } finally {
      uploadingImageRef.current = false;
    }
  };

  const handleImagePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await handleInlineImageUpload(file);
  };

  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items?.length) return;
    for (const item of items) {
      if (!String(item.type || '').startsWith('image/')) continue;
      e.preventDefault();
      const file = item.getAsFile();
      if (file) await handleInlineImageUpload(file);
      return;
    }
  };

  const openImagePicker = () => {
    saveSelection();
    imageInputRef.current?.click();
  };

  const insertTable = () => {
    const rowsRaw = window.prompt('How many rows?', '3');
    if (rowsRaw == null) return;
    const colsRaw = window.prompt('How many columns?', '3');
    if (colsRaw == null) return;

    const rows = Math.min(20, Math.max(0, parseInt(String(rowsRaw).trim(), 10) || 0));
    const cols = Math.min(20, Math.max(0, parseInt(String(colsRaw).trim(), 10) || 0));
    if (rows < 1 || cols < 1) {
      window.alert('Please enter valid numbers for rows and columns (1–20).');
      return;
    }

    withEditorSelection((editor) => {
      const table = createTableElement(rows, cols);
      const wrap = wrapTableWithRemoveControl(table);

      const sel = window.getSelection();
      if (sel?.rangeCount && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(wrap);
        const spacer = document.createElement('p');
        spacer.innerHTML = '<br>';
        wrap.after(spacer);
      } else {
        editor.appendChild(wrap);
        const spacer = document.createElement('p');
        spacer.innerHTML = '<br>';
        editor.appendChild(spacer);
      }

      focusTableCell(table);
    });
  };

  const handleEditorMouseDown = (e) => {
    if (e.target.closest(`.${TABLE_REMOVE_CLASS}`)) {
      e.preventDefault();
    }
  };

  const handleEditorClick = (e) => {
    const removeBtn = e.target.closest(`.${TABLE_REMOVE_CLASS}`);
    if (!removeBtn) return;
    e.preventDefault();
    e.stopPropagation();
    const wrap = removeBtn.closest(`.${TABLE_WRAP_CLASS}`);
    if (wrap) {
      wrap.remove();
      ensureEditorHasBlock(editorRef.current);
      emitChange();
    }
  };

  const applyLink = () => {
    saveSelection();
    focusEditor();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const editor = editorRef.current;
    if (!editor || !editor.contains(range.commonAncestorContainer)) return;

    const url = window.prompt('Enter link URL (https://...)');
    if (!url) return;

    let href = url.trim();
    if (!href) return;
    if (!/^https?:\/\//i.test(href) && !/^mailto:/i.test(href)) {
      href = `https://${href}`;
    }

    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';

    if (range.collapsed) {
      anchor.textContent = href;
      range.insertNode(anchor);
      range.setStartAfter(anchor);
      range.collapse(true);
    } else {
      try {
        range.surroundContents(anchor);
      } catch (_) {
        const fragment = range.extractContents();
        anchor.appendChild(fragment);
        range.insertNode(anchor);
      }
      range.setStartAfter(anchor);
      range.collapse(true);
    }

    sel.removeAllRanges();
    sel.addRange(range);
    savedSelectionRef.current = range.cloneRange();
    emitChange();
  };

  const saveSelectionForSelect = () => {
    saveSelection();
  };

  const handleSelectChange = (handler) => (e) => {
    const value = e.target.value;
    e.target.selectedIndex = 0;
    if (!value) return;
    handler({ ...e, target: { ...e.target, value } });
  };

  const handleEditorFocus = () => {
    ensureEditorHasBlock(editorRef.current);
  };

  const btnClass =
    'inline-flex items-center justify-center min-w-[2rem] px-2 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-sky-50 hover:border-sky-200 transition';

  const selectClass =
    'rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-sky-400';

  return (
    <div className="rounded-xl border-2 border-gray-200 overflow-hidden focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-500/10">
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-2">
        <button type="button" className={btnClass} onMouseDown={toolbarAction(() => run('bold'))} title="Bold">
          <strong>B</strong>
        </button>
        <button type="button" className={btnClass} onMouseDown={toolbarAction(() => run('italic'))} title="Italic">
          <em>I</em>
        </button>
        <button type="button" className={btnClass} onMouseDown={toolbarAction(() => run('underline'))} title="Underline">
          <span className="underline">U</span>
        </button>
        <button type="button" className={btnClass} onMouseDown={toolbarAction(applyLink)} title="Link">
          Link
        </button>

        <span className="mx-0.5 h-5 w-px bg-gray-300" aria-hidden />

        <select
          className={`${selectClass} max-w-[72px]`}
          defaultValue=""
          onMouseDown={saveSelectionForSelect}
          onFocus={saveSelectionForSelect}
          onChange={handleSelectChange((e) => {
            if (e.target.value) applyFontSize(e.target.value);
          })}
          title="Font size"
        >
          <option value="" disabled>
            Size
          </option>
          {FONT_SIZE_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <select
          className={`${selectClass} max-w-[132px]`}
          value={selectedFontFamily}
          onMouseDown={saveSelectionForSelect}
          onFocus={saveSelectionForSelect}
          onChange={(e) => {
            const value = e.target.value;
            if (!value) return;
            applyFontFamily(value);
          }}
          style={selectedFontFamily ? { fontFamily: selectedFontFamily } : undefined}
          title="Font family"
        >
          <option value="">Font</option>
          {FONT_FAMILY_OPTIONS.map((item) => (
            <option
              key={item.label}
              value={item.value}
              style={
                item.value === ITALIC_FONT_VALUE
                  ? { fontStyle: 'italic' }
                  : { fontFamily: item.value }
              }
            >
              {item.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={btnClass}
          onMouseDown={toolbarAction(() => run('insertUnorderedList'))}
          title="Bulleted list"
        >
          •
        </button>
        <button
          type="button"
          className={btnClass}
          onMouseDown={toolbarAction(() => run('insertOrderedList'))}
          title="Numbered list"
        >
          1.
        </button>

        <span className="mx-0.5 h-5 w-px bg-gray-300" aria-hidden />

        <button type="button" className={btnClass} onMouseDown={toolbarAction(() => applyAlign('left'))} title="Align left">
          <AlignIcon type="left" />
        </button>
        <button type="button" className={btnClass} onMouseDown={toolbarAction(() => applyAlign('center'))} title="Align center">
          <AlignIcon type="center" />
        </button>
        <button type="button" className={btnClass} onMouseDown={toolbarAction(() => applyAlign('right'))} title="Align right">
          <AlignIcon type="right" />
        </button>
        <button type="button" className={btnClass} onMouseDown={toolbarAction(() => applyAlign('full'))} title="Justify">
          <AlignIcon type="full" />
        </button>

        <select
          className={`${selectClass} max-w-[88px]`}
          defaultValue=""
          onMouseDown={saveSelectionForSelect}
          onFocus={saveSelectionForSelect}
          onChange={handleSelectChange((e) => {
            if (e.target.value) applyLineSpacing(e.target.value);
          })}
          title="Line spacing"
        >
          <option value="" disabled>
            Spacing
          </option>
          {LINE_SPACING_OPTIONS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <span className="mx-0.5 h-5 w-px bg-gray-300" aria-hidden />

        <label
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-xs font-semibold text-gray-700"
          title="Text color"
        >
          <span>A</span>
          <span className="h-1 w-5 rounded-sm" style={{ backgroundColor: textColor }} aria-hidden />
          <input
            type="color"
            value={textColor}
            className="h-7 w-8 cursor-pointer rounded border border-gray-200 bg-white p-0.5"
            onMouseDown={saveSelectionForSelect}
            onFocus={saveSelectionForSelect}
            onInput={(e) => {
              setTextColor(e.target.value);
              applyTextColor(e.target.value);
            }}
          />
        </label>

        <label
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-gray-200 bg-white px-1.5 py-1 text-xs font-semibold text-gray-700"
          title="Highlight color"
        >
          <span>HL</span>
          <span
            className="h-1 w-5 rounded-sm border border-gray-200"
            style={{ backgroundColor: highlightColor }}
            aria-hidden
          />
          <input
            type="color"
            value={highlightColor}
            className="h-7 w-8 cursor-pointer rounded border border-gray-200 bg-white p-0.5"
            onMouseDown={saveSelectionForSelect}
            onFocus={saveSelectionForSelect}
            onInput={(e) => {
              setHighlightColor(e.target.value);
              applyHighlightColor(e.target.value);
            }}
          />
        </label>

        <button type="button" className={btnClass} onMouseDown={toolbarAction(insertTable)} title="Insert table">
          Table
        </button>

        <button type="button" className={btnClass} onMouseDown={toolbarAction(openImagePicker)} title="Insert image">
          Image
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleImagePick}
        />
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Blog details"
        className={editorBodyClass}
        onInput={emitChange}
        onBlur={emitChange}
        onPaste={handlePaste}
        onClick={handleEditorClick}
        onMouseDown={handleEditorMouseDown}
        onFocus={handleEditorFocus}
        onMouseUp={saveSelection}
        onKeyUp={saveSelection}
      />
    </div>
  );
}

function SuperAdminBlogsPanel() {
  const sessionUser = useMemo(() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }, []);
  const defaultAuthor = String(sessionUser?.name || sessionUser?.email || 'SuperAdmin').trim();

  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(() => emptyForm(defaultAuthor));
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [search, setSearch] = useState('');

  const loadBlogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axios.get('/blogs');
      setBlogs(Array.isArray(res?.data?.blogs) ? res.data.blogs : []);
    } catch (e) {
      setBlogs([]);
      setError(e?.response?.data?.message || e?.message || 'Failed to load blogs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBlogs();
  }, [loadBlogs]);

  useEffect(() => {
    if (!imageFile) return undefined;
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const filteredBlogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return blogs;
    return blogs.filter((b) => {
      const hay = [b.title, b.created_by, b.meta_title, b.meta_keywords]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    });
  }, [blogs, search]);

  const { page, setPage, totalPages, paginatedItems, totalItems, pageSize } = useSuperAdminPagination(
    filteredBlogs,
    [search],
    BLOG_PAGE_SIZE
  );

  const openCreate = () => {
    setForm(emptyForm(defaultAuthor));
    setImageFile(null);
    setImagePreview('');
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  const openEdit = async (blog) => {
    setError('');
    setSuccess('');
    setShowForm(true);
    setImageFile(null);
    setImagePreview(resolveMediaUrl(blog.image_url));
    try {
      const res = await axios.get(`/blogs/${blog.id}`);
      const full = res?.data?.blog || blog;
      setForm({
        id: full.id,
        title: full.title || '',
        blog_date: String(full.blog_date || todayInputValue()).slice(0, 10),
        created_by: full.created_by || defaultAuthor,
        image_url: full.image_url || full.image_public_url || '',
        meta_title: full.meta_title || '',
        meta_description: full.meta_description || '',
        meta_keywords: full.meta_keywords || '',
        details: full.details || '',
        is_active: full.is_active !== false,
      });
      setImagePreview(resolveMediaUrl(full.image_url || full.image_public_url));
    } catch (err) {
      setForm({
        id: blog.id,
        title: blog.title || '',
        blog_date: String(blog.blog_date || todayInputValue()).slice(0, 10),
        created_by: blog.created_by || defaultAuthor,
        image_url: blog.image_url || '',
        meta_title: blog.meta_title || '',
        meta_description: blog.meta_description || '',
        meta_keywords: blog.meta_keywords || '',
        details: blog.details || '',
        is_active: blog.is_active !== false,
      });
      setError(err?.response?.data?.message || err?.message || 'Failed to load blog for editing');
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setImageFile(null);
    setImagePreview('');
    setForm(emptyForm(defaultAuthor));
  };

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const normalizedDetails = await persistBlobImagesInDetails(form.details || '');
      const payload = {
        title: form.title.trim(),
        blog_date: form.blog_date,
        created_by: form.created_by.trim(),
        meta_title: form.meta_title.trim(),
        meta_description: form.meta_description.trim(),
        meta_keywords: form.meta_keywords.trim(),
        details: normalizedDetails,
        is_active: form.is_active,
      };

      if (form.id) {
        if (imageFile) {
          const fd = new FormData();
          Object.entries(payload).forEach(([key, value]) => {
            fd.append(key, key === 'is_active' ? (value ? 'true' : 'false') : String(value ?? ''));
          });
          fd.append('image', imageFile);
          await axios.put(`/blogs/${form.id}`, fd);
        } else {
          if (form.image_url) payload.image_url = form.image_url;
          await axios.put(`/blogs/${form.id}`, payload);
        }
        setSuccess('Blog updated successfully.');
      } else if (imageFile) {
        const fd = new FormData();
        Object.entries(payload).forEach(([key, value]) => {
          fd.append(key, key === 'is_active' ? (value ? 'true' : 'false') : String(value ?? ''));
        });
        fd.append('image', imageFile);
        await axios.post('/blogs', fd);
        setSuccess('Blog created successfully.');
      } else {
        await axios.post('/blogs', payload);
        setSuccess('Blog created successfully.');
      }
      closeForm();
      await loadBlogs();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to save blog');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (blog) => {
    if (!blog?.id) return;
    const ok = window.confirm(`Delete blog “${blog.title || blog.id}”? This cannot be undone.`);
    if (!ok) return;
    setDeletingId(blog.id);
    setError('');
    setSuccess('');
    try {
      await axios.delete(`/blogs/${blog.id}`);
      setSuccess('Blog deleted.');
      if (form.id === blog.id) closeForm();
      await loadBlogs();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to delete blog');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <SuperAdminPage>
      <SuperAdminHero
        accent="amber"
        badge="Content"
        title="Blog management"
        description="Create and edit blog posts with title, date, author, image, SEO meta fields, and rich text details."
        actions={
          <>
            <button
              type="button"
              onClick={loadBlogs}
              disabled={loading}
              className="motion-hover-lift inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-50 disabled:opacity-60"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="motion-hover-lift inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:shadow-lg"
            >
              + New blog
            </button>
          </>
        }
      />

      {error ? <SuperAdminAlert>{error}</SuperAdminAlert> : null}
      {success ? <SuperAdminAlert type="success">{success}</SuperAdminAlert> : null}

      <SuperAdminStatGrid className="sm:grid-cols-3">
        <SuperAdminStatTile label="Total blogs" value={blogs.length} />
        <SuperAdminStatTile
          label="Active"
          value={blogs.filter((b) => b.is_active !== false).length}
          tone="emerald"
        />
        <SuperAdminStatTile label="Showing" value={filteredBlogs.length} tone="amber" />
      </SuperAdminStatGrid>

      {showForm ? (
        <form
          onSubmit={handleSave}
          className="group motion-card-rich motion-hover-lift relative space-y-4 overflow-hidden rounded-2xl border border-gray-100/90 bg-white/95 p-5 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 md:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-gray-900">
              {form.id ? 'Edit blog' : 'Create blog'}
            </h3>
            <button
              type="button"
              onClick={closeForm}
              className="text-sm font-semibold text-gray-500 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wide text-gray-600 mb-1">
                Blog Title *
              </label>
              <input
                required
                value={form.title}
                onChange={(e) => setField('title', e.target.value)}
                className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10"
                placeholder="Enter blog title"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-gray-600 mb-1">
                Date *
              </label>
              <input
                type="date"
                required
                value={form.blog_date}
                onChange={(e) => setField('blog_date', e.target.value)}
                className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-gray-600 mb-1">
                Created By *
              </label>
              <input
                required
                value={form.created_by}
                onChange={(e) => setField('created_by', e.target.value)}
                className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10"
                placeholder="Author name"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wide text-gray-600 mb-1">
                Blog Image
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                onChange={(e) => setImageFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-sky-700 hover:file:bg-sky-100"
              />
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Blog preview"
                  className="mt-3 h-36 w-auto max-w-full rounded-xl border border-gray-200 object-cover"
                />
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-gray-600 mb-1">
                Meta Title
              </label>
              <input
                value={form.meta_title}
                onChange={(e) => setField('meta_title', e.target.value)}
                className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10"
                placeholder="SEO title"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-gray-600 mb-1">
                Meta Keywords
              </label>
              <input
                value={form.meta_keywords}
                onChange={(e) => setField('meta_keywords', e.target.value)}
                className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10"
                placeholder="keyword1, keyword2"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wide text-gray-600 mb-1">
                Meta Description
              </label>
              <textarea
                rows={3}
                value={form.meta_description}
                onChange={(e) => setField('meta_description', e.target.value)}
                className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10"
                placeholder="SEO description"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wide text-gray-600 mb-1">
                Blog Details
              </label>
              <RichTextEditor value={form.details} onChange={(html) => setField('details', html)} />
              <p className="mt-1.5 text-xs text-gray-500">
                Use the toolbar for headings, lists, alignment, colors, tables, links, and rich formatting.
                {form.id ? (
                  <>
                    {' '}
                    <a
                      href={`/public/blogs/${form.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-sky-600 hover:text-sky-800"
                    >
                      Preview public page
                    </a>
                  </>
                ) : null}
              </p>
            </div>

            <div className="md:col-span-2 flex items-center gap-2">
              <input
                id="blog-active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setField('is_active', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
              />
              <label htmlFor="blog-active" className="text-sm font-semibold text-gray-700">
                Active
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
            >
              {saving ? 'Saving…' : form.id ? 'Update blog' : 'Create blog'}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <SuperAdminPanel accent="amber" padding="p-4 md:p-5" interactive={false}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-bold text-gray-900">All blogs</h3>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, author, keywords…"
            className="w-full sm:w-72 rounded-xl border-2 border-gray-200 px-3 py-2 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10"
          />
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-500">Loading blogs…</div>
        ) : filteredBlogs.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">
            No blogs yet. Click “New blog” to create one.
          </div>
        ) : (
          <>
          <div className="motion-stagger-children space-y-3">
            {paginatedItems.map((blog) => (
              <article
                key={blog.id}
                className="group motion-card-rich motion-hover-lift flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center"
              >
                <div className="shrink-0 h-16 w-24 overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                  {blog.image_url ? (
                    <img
                      src={resolveMediaUrl(blog.image_url)}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] font-bold uppercase tracking-wide text-gray-400">
                      No image
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-bold text-gray-900 truncate">{blog.title || 'Untitled'}</h4>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${
                        blog.is_active !== false
                          ? 'bg-emerald-50 text-emerald-800 ring-emerald-200/90'
                          : 'bg-gray-100 text-gray-600 ring-gray-200/80'
                      }`}
                    >
                      {blog.is_active !== false ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-600">
                    <span className="font-semibold">Date:</span> {formatDisplayDate(blog.blog_date)}
                    <span className="mx-2 text-gray-300">|</span>
                    <span className="font-semibold">By:</span> {blog.created_by || '—'}
                  </p>
                  {blog.meta_title ? (
                    <p className="mt-0.5 text-xs text-gray-500 truncate">
                      Meta: {blog.meta_title}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(blog)}
                    className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === blog.id}
                    onClick={() => handleDelete(blog)}
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                  >
                    {deletingId === blog.id ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </article>
            ))}
          </div>
          <SuperAdminPagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={totalItems}
            pageSize={pageSize}
          />
          </>
        )}
      </SuperAdminPanel>
    </SuperAdminPage>
  );
}

export default SuperAdminBlogsPanel;
