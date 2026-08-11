import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import axios from '../api/axios';

function readStoredUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function readSelectedProject() {
  try {
    const raw = localStorage.getItem('selectedProject');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function projectLabel(p) {
  return String(p?.project_name || p?.name || '').trim();
}

function isProjectHidden(p) {
  return Boolean(p?.is_hidden === 1 || p?.is_hidden === true);
}

const listScrollClass =
  'max-h-[min(18rem,70vh)] overflow-y-auto overscroll-contain py-1 ' +
  '[scrollbar-width:thin] [scrollbar-color:rgb(203_213_225)_rgb(248_250_252)] ' +
  '[&::-webkit-scrollbar]:w-2 ' +
  '[&::-webkit-scrollbar-track]:mx-1 [&::-webkit-scrollbar-track]:my-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100/90 ' +
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-slate-300/90 [&::-webkit-scrollbar-thumb]:bg-clip-padding';

/**
 * Admin-only: project name + dropdown in the top header (current project listed first).
 */
export default function AdminHeaderProjectSwitch() {
  const location = useLocation();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState([]);

  const isAdmin = useMemo(() => {
    const r = String(readStoredUser()?.role || '').toLowerCase();
    return r === 'admin';
  }, [location.pathname, location.key]);

  const selected = useMemo(
    () => readSelectedProject(),
    [location.pathname, location.key, open]
  );

  const orderedProjects = useMemo(() => {
    const sid = selected?.id;
    const list = (Array.isArray(projects) ? [...projects] : []).filter(
      (p) => !isProjectHidden(p) || (sid != null && String(p?.id) === String(sid))
    );
    if (sid == null || String(sid).trim() === '') return list;
    const idx = list.findIndex((p) => String(p?.id) === String(sid));
    if (idx <= 0) return list;
    const [cur] = list.splice(idx, 1);
    return [cur, ...list];
  }, [projects, selected]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get('/projects/list');
        if (!cancelled) setProjects(res.data?.projects || []);
      } catch {
        if (!cancelled) setProjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, location.key]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  if (!isAdmin) return null;

  const displayName = projectLabel(selected) || 'Project';

  const onPick = (p) => {
    const same = selected?.id != null && String(selected.id) === String(p?.id);
    if (same) {
      setOpen(false);
      return;
    }
    try {
      localStorage.setItem('selectedProject', JSON.stringify(p));
    } catch (_) {
      /* ignore */
    }
    setOpen(false);
    window.location.reload();
  };

  return (
    <>
      <span className="text-gray-300 hidden md:block shrink-0 dark:text-slate-600" aria-hidden>
        |
      </span>
      <div className="relative min-w-0 max-w-[18rem] lg:max-w-[22rem] hidden md:block shrink-0" ref={wrapRef}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full min-w-0 items-center gap-2 rounded-2xl border border-gray-200/90 bg-white/95 px-3 py-2 text-left text-sm font-semibold text-sky-900 shadow-md shadow-sky-900/[0.06] ring-1 ring-sky-100/60 backdrop-blur-sm transition hover:border-sky-300/80 hover:bg-gradient-to-r hover:from-sky-50/90 hover:to-white hover:shadow-lg hover:shadow-sky-900/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/40 focus-visible:ring-offset-2"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Switch project"
        >
          <span className="min-w-0 flex-1 truncate leading-snug" title={displayName}>
            {displayName}
          </span>
          <svg
            className={`h-4 w-4 shrink-0 text-sky-600/80 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div
            className="motion-pop absolute left-0 z-[60] mt-2 min-w-full w-max max-w-[min(24rem,calc(100vw-2.5rem))] origin-top-left overflow-hidden rounded-2xl border border-gray-200/90 bg-white/95 shadow-2xl shadow-gray-900/12 ring-1 ring-sky-100/50 backdrop-blur-md"
            role="presentation"
          >
            <div className="px-4 pt-3 pb-2.5 border-b border-gray-100/90 bg-gradient-to-r from-slate-50/90 to-white">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-700/90">Workspace</p>
              <p className="text-xs text-gray-500 mt-0.5">Switch active project</p>
            </div>
            <ul className={listScrollClass} role="listbox" aria-label="Projects">
              {orderedProjects.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-gray-500">No projects found</li>
              ) : (
                orderedProjects.map((p) => {
                  const name = projectLabel(p) || 'Untitled';
                  const active = selected?.id != null && String(selected.id) === String(p?.id);
                  return (
                    <li key={p.id} className="px-1.5">
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => onPick(p)}
                        className={`group flex w-full min-w-0 items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                          active
                            ? 'bg-gradient-to-r from-sky-50 to-sky-50/40 text-sky-950 ring-1 ring-sky-200/70'
                            : 'text-gray-800 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                            active
                              ? 'border-sky-500 bg-sky-500 text-white shadow-sm shadow-sky-500/30'
                              : 'border-gray-200 bg-white text-transparent group-hover:border-sky-200'
                          }`}
                          aria-hidden
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold leading-snug break-words text-gray-900">
                            {name}
                          </span>
                          {active ? (
                            <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-sky-600">
                              <span className="h-1 w-1 rounded-full bg-emerald-500" aria-hidden />
                              Active
                            </span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
