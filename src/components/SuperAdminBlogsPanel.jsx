import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from '../api/axios';

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

const FONT_SIZE_MAP = {
  small: '13px',
  normal: '16px',
  large: '20px',
  huge: '28px',
};

function RichTextEditor({ value, onChange }) {
  const editorRef = useRef(null);
  const lastHtmlRef = useRef('');
  const savedSelectionRef = useRef(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const next = value || '';
    if (next !== lastHtmlRef.current && el.innerHTML !== next) {
      el.innerHTML = next;
      lastHtmlRef.current = next;
    }
  }, [value]);

  const emitChange = () => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
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
  };

  const restoreSelection = () => {
    const range = savedSelectionRef.current;
    if (!range) return false;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  };

  const focusEditor = () => {
    editorRef.current?.focus();
    restoreSelection();
  };

  const wrapSelection = (mutateNode) => {
    focusEditor();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const editor = editorRef.current;
    if (!editor || !editor.contains(range.commonAncestorContainer)) return;

    if (range.collapsed) return;

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
    savedSelectionRef.current = range.cloneRange();
    emitChange();
  };

  const run = (command, arg = null) => {
    focusEditor();
    try {
      document.execCommand(command, false, arg);
    } catch (_) {
      /* ignore */
    }
    emitChange();
  };

  const applyFontFamily = (fontFamily) => {
    if (!fontFamily) return;
    wrapSelection((node) => {
      node.style.fontFamily = fontFamily;
    });
  };

  const applyFontSize = (sizeKey) => {
    const fontSize = FONT_SIZE_MAP[sizeKey];
    if (!fontSize) return;
    wrapSelection((node) => {
      node.style.fontSize = fontSize;
    });
  };

  const applyLink = () => {
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

  const preventToolbarFocusLoss = (e) => {
    e.preventDefault();
    saveSelection();
  };

  const btnClass =
    'px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-sky-50 hover:border-sky-200 transition';

  return (
    <div className="rounded-xl border-2 border-gray-200 overflow-hidden focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-500/10">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-200 bg-gray-50 px-2 py-2">
        <button
          type="button"
          className={btnClass}
          onMouseDown={preventToolbarFocusLoss}
          onClick={() => run('bold')}
          title="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className={btnClass}
          onMouseDown={preventToolbarFocusLoss}
          onClick={() => run('italic')}
          title="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className={btnClass}
          onMouseDown={preventToolbarFocusLoss}
          onClick={() => run('underline')}
          title="Underline"
        >
          <span className="underline">U</span>
        </button>
        <button
          type="button"
          className={btnClass}
          onMouseDown={preventToolbarFocusLoss}
          onClick={applyLink}
          title="Hyperlink"
        >
          Link
        </button>
        <span className="mx-1 h-5 w-px bg-gray-300" aria-hidden />
        <label className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600">
          Font
          <select
            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
            defaultValue=""
            onMouseDown={preventToolbarFocusLoss}
            onChange={(e) => {
              const font = e.target.value;
              if (font) applyFontFamily(font);
              e.target.value = '';
            }}
          >
            <option value="" disabled>
              Family
            </option>
            <option value="Arial, sans-serif">Arial</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="'Times New Roman', Times, serif">Times New Roman</option>
            <option value="Verdana, sans-serif">Verdana</option>
            <option value="'Courier New', Courier, monospace">Courier New</option>
            <option value="Tahoma, sans-serif">Tahoma</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600">
          Size
          <select
            className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs"
            defaultValue=""
            onMouseDown={preventToolbarFocusLoss}
            onChange={(e) => {
              const sizeKey = e.target.value;
              if (sizeKey) applyFontSize(sizeKey);
              e.target.value = '';
            }}
          >
            <option value="" disabled>
              Size
            </option>
            <option value="small">Small</option>
            <option value="normal">Normal</option>
            <option value="large">Large</option>
            <option value="huge">Huge</option>
          </select>
        </label>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label="Blog details"
        className="min-h-[180px] max-h-[360px] overflow-y-auto bg-white px-3 py-3 text-sm text-gray-800 outline-none prose prose-sm max-w-none [&_a]:text-sky-600 [&_a]:underline"
        onInput={emitChange}
        onBlur={emitChange}
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

  const openCreate = () => {
    setForm(emptyForm(defaultAuthor));
    setImageFile(null);
    setImagePreview('');
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  const openEdit = (blog) => {
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
    setImageFile(null);
    setImagePreview(resolveMediaUrl(blog.image_url));
    setShowForm(true);
    setError('');
    setSuccess('');
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
      const fd = new FormData();
      fd.append('title', form.title.trim());
      fd.append('blog_date', form.blog_date);
      fd.append('created_by', form.created_by.trim());
      fd.append('meta_title', form.meta_title.trim());
      fd.append('meta_description', form.meta_description.trim());
      fd.append('meta_keywords', form.meta_keywords.trim());
      fd.append('details', form.details || '');
      fd.append('is_active', form.is_active ? 'true' : 'false');
      if (imageFile) {
        fd.append('image', imageFile);
      } else if (form.image_url) {
        fd.append('image_url', form.image_url);
      }

      if (form.id) {
        await axios.put(`/blogs/${form.id}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        setSuccess('Blog updated successfully.');
      } else {
        await axios.post('/blogs', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
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
    <div className="motion-enter space-y-6">
      <section className="relative overflow-hidden rounded-2xl border border-amber-100/90 bg-white/95 p-5 md:p-6 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 backdrop-blur-sm">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500"
          aria-hidden
        />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800 ring-1 ring-amber-200/70">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
              Content
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 md:text-3xl">
              <span className="bg-gradient-to-r from-gray-900 via-amber-800 to-orange-900 bg-clip-text text-transparent">
                Blog management
              </span>
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600 md:text-base">
              Create and edit blog posts with title, date, author, image, SEO meta fields, and rich text details.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadBlogs}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60 transition"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:shadow-lg transition"
            >
              + New blog
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {success ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        <div className="rounded-2xl border border-gray-100/90 bg-white/90 p-4 shadow-lg shadow-gray-200/30 ring-1 ring-gray-100/80">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Total blogs</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{blogs.length}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100/90 bg-gradient-to-br from-emerald-50/80 via-white to-teal-50/40 p-4 shadow-lg">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800/70">Active</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">
            {blogs.filter((b) => b.is_active !== false).length}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-100/90 bg-gradient-to-br from-amber-50/80 via-white to-orange-50/40 p-4 shadow-lg">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-800/70">Showing</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{filteredBlogs.length}</p>
        </div>
      </div>

      {showForm ? (
        <form
          onSubmit={handleSave}
          className="rounded-2xl border border-gray-100/90 bg-white/95 p-5 md:p-6 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 space-y-4"
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
                Select text first, then use toolbar for bold, underline, hyperlink, font family, or font size.
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

      <section className="rounded-2xl border border-gray-100/90 bg-white/95 p-4 md:p-5 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80">
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
          <div className="space-y-3">
            {filteredBlogs.map((blog) => (
              <article
                key={blog.id}
                className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center"
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
        )}
      </section>
    </div>
  );
}

export default SuperAdminBlogsPanel;
