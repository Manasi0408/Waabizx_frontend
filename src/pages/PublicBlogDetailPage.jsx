import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import axios from '../api/axios';

const formatDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
};

const blogBodyClass =
  'blog-rich-content prose prose-sm sm:prose-base max-w-none text-gray-800 ' +
  '[&_h1]:text-3xl [&_h1]:font-bold [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:text-xl [&_h3]:font-semibold ' +
  '[&_h4]:text-lg [&_h4]:font-semibold [&_h5]:text-base [&_h5]:font-semibold [&_h6]:text-sm [&_h6]:font-semibold ' +
  '[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 ' +
  '[&_blockquote]:border-l-4 [&_blockquote]:border-sky-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600 ' +
  '[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-gray-900 [&_pre]:p-4 [&_pre]:text-sm [&_pre]:text-gray-100 ' +
  '[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 ' +
  '[&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-200 [&_td]:px-3 [&_td]:py-2 ' +
  '[&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:px-3 [&_th]:py-2 [&_a]:text-sky-600 [&_a]:underline ' +
  '[&_img]:max-w-full [&_img]:rounded-lg';

function parseKeywords(blog) {
  if (Array.isArray(blog?.keywords) && blog.keywords.length) return blog.keywords;
  return String(blog?.meta_keywords || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

export default function PublicBlogDetailPage() {
  const { id } = useParams();
  const [blog, setBlog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axios.get(`/blogs/public/${id}`);
        if (!cancelled) setBlog(res?.data?.blog || null);
      } catch (e) {
        if (!cancelled) {
          setError(e?.response?.data?.message || e?.message || 'Failed to load blog');
          setBlog(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const keywords = useMemo(() => parseKeywords(blog), [blog]);
  const htmlBody = blog?.details || blog?.content || blog?.body || '';

  useEffect(() => {
    if (!blog) return;
    const title = blog.meta_title || blog.title || 'Blog';
    document.title = title;
    const setMeta = (name, content) => {
      if (!content) return;
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    setMeta('description', blog.meta_description || '');
    setMeta('keywords', blog.meta_keywords || keywords.join(', '));
  }, [blog, keywords]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50/80 via-white to-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Link to="/public/blogs" className="text-sm font-semibold text-sky-700 hover:text-sky-900">
          ← All blogs
        </Link>

        {loading ? (
          <p className="mt-8 text-sm text-gray-500">Loading…</p>
        ) : error ? (
          <p className="mt-8 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : !blog ? (
          <p className="mt-8 text-sm text-gray-500">Blog not found.</p>
        ) : (
          <article className="mt-6">
            {(blog.image_url || blog.image_public_url) ? (
              <img
                src={blog.image_public_url || blog.image_url}
                alt={blog.title || ''}
                className="mb-6 max-h-80 w-full rounded-2xl object-cover shadow-sm"
              />
            ) : null}

            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm ring-1 ring-gray-100/80 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Date</p>
                  <p className="mt-0.5 font-semibold text-gray-900">{formatDate(blog.blog_date || blog.date)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Author</p>
                  <p className="mt-0.5 font-semibold text-gray-900">{blog.created_by || blog.author || 'Waabizx'}</p>
                </div>
              </div>

              {blog.meta_title && blog.meta_title !== blog.title ? (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Meta title</p>
                  <p className="mt-0.5 text-sm font-semibold text-gray-800">{blog.meta_title}</p>
                </div>
              ) : null}

              {blog.meta_description ? (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Meta description</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-gray-700">{blog.meta_description}</p>
                </div>
              ) : null}

              {keywords.length > 0 ? (
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Meta keywords</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {keywords.map((kw) => (
                      <span
                        key={kw}
                        className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800 ring-1 ring-sky-100"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <h1 className="mt-6 text-3xl font-bold tracking-tight text-gray-900">{blog.title}</h1>

            {htmlBody ? (
              <div
                className={`mt-6 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm ring-1 ring-gray-100/80 ${blogBodyClass}`}
                dangerouslySetInnerHTML={{ __html: htmlBody }}
              />
            ) : (
              <p className="mt-6 text-sm text-gray-500">No blog content available.</p>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
