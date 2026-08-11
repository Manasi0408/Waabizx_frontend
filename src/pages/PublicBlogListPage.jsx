import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from '../api/axios';

const formatDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

function parseKeywords(blog) {
  if (Array.isArray(blog?.keywords) && blog.keywords.length) return blog.keywords;
  return String(blog?.meta_keywords || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

export default function PublicBlogListPage() {
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await axios.get('/blogs/public');
        if (!cancelled) {
          setBlogs(Array.isArray(res?.data?.blogs) ? res.data.blogs : []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e?.response?.data?.message || e?.message || 'Failed to load blogs');
          setBlogs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50/80 via-white to-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <header className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-sky-600">Blog</p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Latest articles</h1>
        </header>

        {loading ? (
          <p className="text-sm text-gray-500">Loading blogs…</p>
        ) : error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : blogs.length === 0 ? (
          <p className="text-sm text-gray-500">No blog posts published yet.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {blogs.map((blog) => {
              const keywords = parseKeywords(blog);
              const imageSrc = blog.image_public_url || blog.image_url;
              const summary = blog.meta_description || blog.excerpt || '';
              return (
                <article
                  key={blog.id}
                  className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm ring-1 ring-gray-100/80"
                >
                  {imageSrc ? (
                    <img src={imageSrc} alt={blog.title || ''} className="h-44 w-full object-cover" />
                  ) : (
                    <div className="flex h-44 items-center justify-center bg-gray-50 text-xs font-bold uppercase tracking-wide text-gray-400">
                      No image
                    </div>
                  )}
                  <div className="p-5">
                    <p className="text-xs font-semibold text-gray-500">
                      {formatDate(blog.blog_date || blog.date)} · {blog.created_by || blog.author || 'Waabizx'}
                    </p>
                    <h2 className="mt-2 text-lg font-bold text-gray-900">{blog.title}</h2>
                    {blog.meta_title && blog.meta_title !== blog.title ? (
                      <p className="mt-1 text-xs font-semibold text-violet-700">{blog.meta_title}</p>
                    ) : null}
                    {summary ? (
                      <p className="mt-2 line-clamp-3 text-sm text-gray-600">{summary}</p>
                    ) : null}
                    {keywords.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {keywords.map((kw) => (
                          <span
                            key={kw}
                            className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-100"
                          >
                            {kw}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <Link
                      to={`/public/blogs/${blog.id}`}
                      className="mt-4 inline-flex text-sm font-semibold text-sky-700 hover:text-sky-900"
                    >
                      Read more →
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
