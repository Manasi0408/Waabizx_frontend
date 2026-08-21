import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import axios from "../api/axios";
import { getApiOrigin } from "../utils/apiBase";

const Icon = {
  Search: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
    </svg>
  ),
  Plus: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
    </svg>
  ),
  Eye: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ),
  Pencil: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 4h2m-1 0a1 1 0 011 1v2m-4 14l-1-1 8-8 1 1-8 8z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 19l14-14" />
    </svg>
  ),
  Trash: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M9 6h6m-7 4h10l-1 11H8L7 10z" />
    </svg>
  ),
  Star: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.518 4.675a1 1 0 00.95.69h4.916c.969 0 1.371 1.24.588 1.81l-3.975 2.89a1 1 0 00-.364 1.118l1.518 4.675c.3.921-.755 1.688-1.54 1.118l-3.975-2.89a1 1 0 00-1.175 0l-3.975 2.89c-.784.57-1.838-.197-1.54-1.118l1.518-4.675a1 1 0 00-.364-1.118l-3.975-2.89c-.783-.57-.38-1.81.588-1.81h4.916a1 1 0 00.95-.69l1.518-4.675z" />
    </svg>
  ),
  X: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  ArrowLeft: (props) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
    </svg>
  ),
};

const blankForm = { name: "", messageType: "TEXT", text: "" };

function cannedTypeStyle(type) {
  const t = String(type || "TEXT").toUpperCase();
  if (t === "IMAGE") {
    return {
      bar: "from-emerald-400 via-teal-500 to-cyan-500",
      badge: "bg-emerald-50 text-emerald-800 ring-emerald-200/90",
      iconWrap: "from-emerald-500 via-teal-600 to-cyan-700",
      label: "Image",
      previewShell: "border-emerald-200/80 bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/30 ring-emerald-100/50",
    };
  }
  if (t === "FILE") {
    return {
      bar: "from-violet-400 via-purple-500 to-indigo-600",
      badge: "bg-violet-50 text-violet-800 ring-violet-200/90",
      iconWrap: "from-violet-500 via-purple-600 to-indigo-800",
      label: "File",
      previewShell: "border-violet-200/80 bg-gradient-to-br from-violet-50/60 via-white to-indigo-50/30 ring-violet-100/50",
    };
  }
  return {
    bar: "from-sky-400 via-blue-500 to-cyan-400",
    badge: "bg-sky-50 text-sky-800 ring-sky-200/90",
    iconWrap: "from-sky-500 via-sky-600 to-blue-800",
    label: "Text",
    previewShell: "border-sky-200/80 bg-gradient-to-br from-sky-50/60 via-white to-blue-50/30 ring-sky-100/50",
  };
}

function cannedPreviewLine(msg) {
  const t = String(msg?.type || "TEXT").toUpperCase();
  if (t === "TEXT") return String(msg?.text || "").trim() || "—";
  if (msg?.mediaUrl) {
    const tail = String(msg.mediaUrl).split("/").pop();
    return tail || "Attachment saved";
  }
  return t === "IMAGE" ? "Image attachment" : "File attachment";
}

export default function CannedMessagesPage({ apiPath = "/canned-messages" } = {}) {
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const apiBase = useMemo(() => {
    const p = String(apiPath || "/canned-messages");
    return p.endsWith("/") ? p.slice(0, -1) : p;
  }, [apiPath]);

  const resolveMediaUrl = (url) => {
    const u = String(url || "");
    if (!u) return u;
    if (u.startsWith("http://") || u.startsWith("https://")) return u;
    // Backend serves static uploads from `${API_HOST}/uploads/...`
    // if (u.startsWith("/")) return `https://wabizx.techwhizzc.com/{u}`;
    if (u.startsWith("/")) return `${getApiOrigin()}${u}`;
    return u;
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // create | edit | view
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [serverMediaUrl, setServerMediaUrl] = useState(null);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      setError("");

      const params = {};
      if (search && String(search).trim()) params.search = search.trim();

      const res = await axios.get(apiBase, { params });
      const list = res?.data?.messages || [];
      setMessages(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to load canned messages");
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setModalMode("create");
    setEditingId(null);
    setForm(blankForm);
    setFile(null);
    setPreviewUrl(null);
    setServerMediaUrl(null);
    setModalOpen(true);
  };

  const openEdit = (msg) => {
    setModalMode("edit");
    setEditingId(msg.id);
    setForm({
      name: msg.name || "",
      messageType: msg.type || "TEXT",
      text: msg.type === "TEXT" ? msg.text || "" : "",
    });
    setFile(null);
    setPreviewUrl(null);
    setServerMediaUrl(msg.mediaUrl || null);
    setModalOpen(true);
  };

  const openView = (msg) => {
    setModalMode("view");
    setEditingId(msg.id);
    setForm({
      name: msg.name || "",
      messageType: msg.type || "TEXT",
      text: msg.type === "TEXT" ? msg.text || "" : "",
    });
    setFile(null);
    setPreviewUrl(null);
    setServerMediaUrl(msg.mediaUrl || null);
    setModalOpen(true);
  };

  const isReadOnly = modalMode === "view";
  const modalAccent = cannedTypeStyle(form.messageType);

  const handleFileChange = (f) => {
    setFile(f || null);
    if (!f) {
      setPreviewUrl(null);
      return;
    }
    if (f.type && f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  };

  useEffect(() => {
    // Cleanup blob URLs
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const previewText = useMemo(() => {
    if (form.messageType === "TEXT") {
      return String(form.text || "").trim();
    }
    if (previewUrl) return "Image selected";
    if (file) return file.name;
    if (serverMediaUrl) return serverMediaUrl.split("/").pop() || "Selected file";
    return "";
  }, [form.messageType, form.text, previewUrl, file, serverMediaUrl]);

  const handleSubmit = async () => {
    try {
      setError("");

      const fd = new FormData();
      fd.append("name", form.name || "");
      fd.append("messageType", form.messageType);

      if (form.messageType === "TEXT") {
        fd.append("text", form.text || "");
      } else {
        // IMAGE | FILE
        if (file) fd.append("file", file);
      }

      if (modalMode === "edit") {
        await axios.put(`${apiBase}/${editingId}`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      } else {
        await axios.post(apiBase, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      setModalOpen(false);
      setFile(null);
      setPreviewUrl(null);
      setServerMediaUrl(null);
      await fetchMessages();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to save canned message");
    }
  };

  const deleteMessage = async (msg) => {
    const ok = window.confirm(`Delete canned message "${msg.name}"?`);
    if (!ok) return;
    try {
      setError("");
      await axios.delete(`${apiBase}/${msg.id}`);
      await fetchMessages();
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || "Failed to delete");
    }
  };

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 motion-enter">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-800 text-white shadow-lg shadow-sky-500/35 ring-2 ring-white">
              <Icon.Star className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-bold tracking-tight bg-gradient-to-r from-gray-900 via-gray-800 to-sky-800 bg-clip-text text-transparent">
                Canned Messages
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">Reusable snippets for faster replies in live chat</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="group relative shrink-0 overflow-hidden inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-600 via-sky-500 to-blue-600 shadow-lg shadow-sky-600/30 hover:shadow-xl hover:shadow-sky-500/35 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" aria-hidden />
          <Icon.Plus className="w-5 h-5 relative" />
          <span className="relative">Create</span>
        </button>
      </div>

      <div className="motion-enter motion-delay-1 motion-hover-lift bg-white/95 backdrop-blur-sm rounded-2xl border border-gray-100/90 mb-4 p-4 md:p-6 shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 transition-all duration-300 hover:shadow-xl hover:shadow-sky-500/10">
        <div className="relative overflow-hidden rounded-2xl border border-sky-200/60 bg-gradient-to-br from-white via-sky-50/40 to-blue-50/50 p-4 md:p-6 mb-6 shadow-inner ring-1 ring-sky-100/40">
          <span className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-sky-400/20 blur-2xl" aria-hidden />
          <span className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-blue-400/15 blur-2xl" aria-hidden />
          <div className="relative flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-md shadow-sky-600/25">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-bold text-sky-950 tracking-tight">Quick guide</h3>
              <p className="mt-1 text-sm text-gray-700 leading-relaxed">
                Save templates here and insert them instantly during conversations.
              </p>
              <ol className="mt-4 grid gap-2 sm:grid-cols-3 text-sm">
                {["Tap Create", "Pick type & content", "Save — use in chat"].map((step, i) => (
                  <li
                    key={step}
                    className="flex items-center gap-2 rounded-xl border border-sky-100/80 bg-white/70 px-3 py-2.5 shadow-sm"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-xs font-bold text-white shadow-sm">
                      {i + 1}
                    </span>
                    <span className="font-medium text-gray-800">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
          <div className="flex-1 relative">
            <Icon.Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search canned message by name"
              className="w-full border-2 border-gray-200 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 bg-gray-50/80 hover:bg-white transition-all shadow-sm"
            />
          </div>
          <button
            type="button"
            onClick={fetchMessages}
            className="px-4 py-2.5 bg-white border-2 border-gray-200 rounded-xl text-sm font-semibold text-gray-800 hover:bg-sky-50/80 hover:border-sky-200/70 transition-all duration-200 active:scale-[0.98]"
          >
            Search
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200/90 text-sm text-red-700 rounded-xl ring-1 ring-red-100/50 motion-enter">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-gray-100/90 ring-1 ring-gray-100/70 bg-gradient-to-b from-sky-50/30 via-white/50 to-white p-3 md:p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-14 text-sm text-gray-600 motion-enter">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
              <p className="mt-3 font-medium text-gray-500">Loading canned messages…</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-4 text-center motion-enter">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-100 to-sky-200 text-sky-600 shadow-inner ring-2 ring-white">
                <Icon.Star className="h-8 w-8 opacity-80" />
              </div>
              <p className="text-sm font-semibold text-gray-700">No canned messages yet</p>
              <p className="mt-1 max-w-sm text-xs text-gray-500">Create your first template to speed up replies in live chat.</p>
            </div>
          ) : (
            <div className="space-y-4 md:space-y-5 motion-stagger-children">
              {messages.map((msg) => {
                const ts = cannedTypeStyle(msg.type);
                const preview = cannedPreviewLine(msg);
                const creator = String(msg.createdBy || "—");
                const creatorInitial = creator.trim().charAt(0).toUpperCase() || "?";
                return (
                  <article
                    key={msg.id}
                    className="group relative motion-card-rich overflow-hidden rounded-2xl border border-gray-200/80 bg-white/95 backdrop-blur-md shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 transition-all duration-300 motion-hover-lift hover:-translate-y-0.5 hover:border-sky-300/50 hover:shadow-2xl hover:shadow-sky-500/12"
                  >
                    <div
                      className={`pointer-events-none absolute inset-x-0 top-0 z-[5] h-[3px] bg-gradient-to-r ${ts.bar}`}
                      aria-hidden
                    />
                    <span
                      className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-sky-400/15 blur-2xl transition-all duration-500 group-hover:bg-sky-400/25"
                      aria-hidden
                    />
                    <span
                      className="pointer-events-none absolute -bottom-8 left-1/4 h-20 w-20 rounded-full bg-blue-500/10 blur-2xl"
                      aria-hidden
                    />
                    <span
                      className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white via-white to-sky-50/20 opacity-100 transition-all duration-500 group-hover:via-sky-50/30 group-hover:to-sky-100/40"
                      aria-hidden
                    />
                    <span className="motion-card-shine pointer-events-none absolute inset-0 z-[2] overflow-hidden rounded-2xl" aria-hidden>
                      <span className="motion-card-shine__beam absolute inset-0" />
                    </span>

                    <div className="relative z-[3] flex flex-col lg:flex-row lg:items-stretch">
                      <div className="flex flex-1 min-w-0 gap-4 p-5">
                        <div
                          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${ts.iconWrap} text-sm font-bold text-white shadow-lg shadow-sky-900/20 ring-4 ring-white/90 transition-transform duration-300 group-hover:scale-[1.04]`}
                          title={ts.label}
                        >
                          {String(msg.type || "T").charAt(0)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 gap-y-1">
                            <h3 className="truncate text-base font-bold tracking-tight text-gray-900 transition-all duration-300 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-sky-800 group-hover:to-blue-800 group-hover:bg-clip-text">
                              {msg.name}
                            </h3>
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${ts.badge}`}
                            >
                              {msg.type}
                            </span>
                          </div>
                          <div className="mt-3 rounded-xl border border-gray-100/90 bg-gray-50/80 px-3 py-2.5 text-sm text-gray-700 shadow-inner transition-colors group-hover:border-sky-100/80 group-hover:bg-white/80">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Preview</p>
                            <p className="mt-1 line-clamp-2 leading-relaxed" title={preview}>
                              {preview}
                            </p>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200/80 bg-white/90 py-1 pl-1 pr-3 text-xs font-medium text-gray-700 shadow-sm">
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-300 text-xs font-bold text-slate-700">
                                {creatorInitial}
                              </span>
                              <span className="truncate max-w-[12rem]">
                                <span className="text-gray-400 font-normal">By </span>
                                {creator}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-1 border-t border-gray-100/90 bg-white/70 px-4 py-3 backdrop-blur-sm lg:w-[10.5rem] lg:flex-col lg:justify-center lg:gap-2 lg:border-l lg:border-t-0 lg:px-3">
                        <button
                          type="button"
                          onClick={() => openView(msg)}
                          className="flex items-center justify-center gap-2 rounded-xl border border-transparent p-2.5 text-sky-700 transition-all hover:border-sky-200 hover:bg-sky-50 hover:text-sky-900 active:scale-95 lg:w-full"
                          title="View"
                        >
                          <Icon.Eye className="h-5 w-5 shrink-0" />
                          <span className="hidden text-xs font-bold uppercase tracking-wide lg:inline">View</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(msg)}
                          className="flex items-center justify-center gap-2 rounded-xl border border-transparent p-2.5 text-sky-700 transition-all hover:border-sky-200 hover:bg-sky-50 hover:text-sky-900 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 lg:w-full"
                          title="Edit"
                          disabled={msg.type !== "TEXT" && !msg.mediaUrl}
                        >
                          <Icon.Pencil className="h-5 w-5 shrink-0" />
                          <span className="hidden text-xs font-bold uppercase tracking-wide lg:inline">Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteMessage(msg)}
                          className="flex items-center justify-center gap-2 rounded-xl border border-transparent p-2.5 text-red-600 transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-700 active:scale-95 lg:w-full"
                          title="Delete"
                        >
                          <Icon.Trash className="h-5 w-5 shrink-0" />
                          <span className="hidden text-xs font-bold uppercase tracking-wide lg:inline">Delete</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal — portaled to body so it clears Manage header (z-10) and scroll/overflow clipping */}
      {modalOpen &&
        createPortal(
          <div className="motion-enter fixed inset-0 z-[300] overflow-y-auto overscroll-contain">
            <div className="flex min-h-full justify-center p-4 py-12 sm:items-center sm:py-8">
              <div className="fixed inset-0 bg-slate-900/45 backdrop-blur-md" aria-hidden />
              <div className="motion-pop relative z-10 my-auto flex min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-gray-200/80 bg-white/95 shadow-2xl shadow-sky-900/25 ring-1 ring-black/5 backdrop-blur-xl max-h-[min(88dvh,calc(100vh-3rem))] sm:max-h-[min(90dvh,calc(100vh-4rem))]">
            <div
              className={`pointer-events-none absolute inset-x-0 top-0 z-[5] h-[3px] bg-gradient-to-r ${modalAccent.bar}`}
              aria-hidden
            />
            <span
              className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sky-400/15 blur-3xl"
              aria-hidden
            />
            <span
              className="pointer-events-none absolute -bottom-20 -left-12 h-36 w-36 rounded-full bg-blue-500/10 blur-3xl"
              aria-hidden
            />

            <header className="relative z-[1] flex shrink-0 items-start gap-3 border-b border-gray-100/90 bg-gradient-to-r from-white via-sky-50/40 to-blue-50/30 px-4 py-4 md:px-5">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="mt-0.5 shrink-0 rounded-xl border border-gray-200/80 bg-white/90 p-2 text-gray-600 shadow-sm transition-all hover:border-sky-200 hover:bg-sky-50 hover:text-sky-800 active:scale-95"
                aria-label="Back"
              >
                <Icon.ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 gap-y-1">
                  <h2 className="text-lg font-bold tracking-tight text-gray-900 md:text-xl">
                    {modalMode === "create"
                      ? "New canned message"
                      : modalMode === "edit"
                        ? "Edit canned message"
                        : "Canned message"}
                  </h2>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${modalAccent.badge}`}>
                    {form.messageType}
                  </span>
                  {modalMode === "view" && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 ring-1 ring-slate-200/80">
                      Read only
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-gray-500 md:text-sm">
                  {modalMode === "create" && "Build a reusable snippet for live chat."}
                  {modalMode === "edit" && "Update name, type, or content — changes save on submit."}
                  {modalMode === "view" && "Preview how this canned message is stored."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="shrink-0 rounded-xl border border-transparent p-2 text-gray-500 transition-all hover:border-gray-200 hover:bg-white hover:text-gray-900 active:scale-95"
                title="Close"
              >
                <Icon.X className="h-5 w-5" />
              </button>
            </header>

            <div className="relative z-[1] flex-1 overflow-y-auto min-h-0 bg-gradient-to-b from-sky-50/25 via-white to-sky-50/20">
              <div className="p-5 md:p-6">
                {error && (
                  <div className="motion-enter mb-5 rounded-xl border border-red-200/90 bg-red-50 p-4 text-sm text-red-700 shadow-sm ring-1 ring-red-100/50">
                    {error}
                  </div>
                )}

                <div className="relative overflow-hidden rounded-2xl border border-gray-100/90 bg-white/90 p-4 shadow-lg shadow-gray-200/30 ring-1 ring-gray-100/80 md:p-6">
                  <span className="motion-card-shine pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden>
                    <span className="motion-card-shine__beam absolute inset-0" />
                  </span>
                  <div className="relative z-[1] grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
                    <div className="md:col-span-2">
                      <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-sky-800/70">
                        Name
                      </label>
                      <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Pick a name which describes your message"
                        disabled={isReadOnly}
                        className="w-full rounded-xl border-2 border-gray-200/90 bg-gray-50/90 px-4 py-3 text-sm text-gray-900 shadow-inner transition-all placeholder:text-gray-400 hover:border-sky-200/80 hover:bg-white focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400/35 disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-100/80 disabled:text-gray-600"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-sky-800/70">
                        Message type
                      </label>
                      <div className="relative">
                        <select
                          value={form.messageType}
                          onChange={(e) => {
                            const t = e.target.value;
                            setForm((p) => ({ ...p, messageType: t }));
                            setFile(null);
                            setPreviewUrl(null);
                            setServerMediaUrl(null);
                          }}
                          disabled={isReadOnly}
                          className="w-full appearance-none rounded-xl border-2 border-gray-200/90 bg-gray-50/90 px-4 py-3 pr-10 text-sm font-semibold text-gray-800 shadow-inner transition-all hover:border-sky-200/80 hover:bg-white focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400/35 disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-100/80"
                        >
                          <option value="TEXT">TEXT</option>
                          <option value="IMAGE">IMAGE</option>
                          <option value="FILE">FILE</option>
                        </select>
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sky-600">
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </span>
                      </div>
                    </div>

                    {form.messageType === "TEXT" ? (
                      <div className="md:col-span-2">
                        <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-sky-800/70">
                          Text
                        </label>
                        <textarea
                          value={form.text}
                          onChange={(e) => setForm((p) => ({ ...p, text: e.target.value }))}
                          placeholder="Enter your text message"
                          disabled={isReadOnly}
                          className="min-h-[140px] w-full resize-y rounded-xl border-2 border-gray-200/90 bg-gray-50/90 px-4 py-3 text-sm leading-relaxed text-gray-900 shadow-inner transition-all placeholder:text-gray-400 hover:border-sky-200/80 hover:bg-white focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-400/35 disabled:cursor-not-allowed disabled:border-gray-100 disabled:bg-gray-100/80 disabled:text-gray-600"
                        />
                        <p className="mt-2 rounded-lg border border-sky-100/80 bg-sky-50/50 px-3 py-2 text-xs text-sky-900/80">
                          <span className="font-bold text-sky-800">Tip:</span> use{" "}
                          <span className="font-semibold">-bold</span> and <span className="font-semibold">-italic</span>{" "}
                          for formatting. Shown below in preview.
                        </p>
                      </div>
                    ) : (
                      <div className="md:col-span-2">
                        <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-sky-800/70">
                          Upload {form.messageType === "IMAGE" ? "image" : "file"}
                        </label>
                        <div
                          className={`rounded-xl border-2 border-dashed px-4 py-6 transition-colors ${isReadOnly ? "border-gray-200 bg-gray-50/50" : "border-sky-200/80 bg-sky-50/20 hover:border-sky-300 hover:bg-sky-50/40"}`}
                        >
                          <input
                            type="file"
                            onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                            disabled={isReadOnly}
                            className="w-full cursor-pointer text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-gradient-to-r file:from-sky-600 file:to-blue-600 file:px-4 file:py-2 file:text-xs file:font-bold file:text-white file:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </div>
                        {serverMediaUrl && !file ? (
                          <p className="mt-2 text-xs font-medium text-sky-800/80">
                            Current file is saved. Upload a new file to replace it.
                          </p>
                        ) : null}
                      </div>
                    )}

                    <div className="md:col-span-2">
                      <label className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-sky-800/70">
                        Live preview
                      </label>
                      <div
                        className={`motion-card-rich relative overflow-hidden rounded-xl border-2 px-4 py-4 shadow-inner ring-1 ${modalAccent.previewShell}`}
                      >
                        <span className="motion-card-shine pointer-events-none absolute inset-0 overflow-hidden rounded-xl" aria-hidden>
                          <span className="motion-card-shine__beam absolute inset-0 opacity-60" />
                        </span>
                        <div className="relative z-[1]">
                          {form.messageType === "IMAGE" ? (
                            previewUrl ? (
                              <img src={previewUrl} alt="Preview" className="max-h-52 w-full rounded-lg object-contain shadow-md" />
                            ) : serverMediaUrl ? (
                              <img src={resolveMediaUrl(serverMediaUrl)} alt="Preview" className="max-h-52 w-full rounded-lg object-contain shadow-md" />
                            ) : (
                              <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-white/60 text-sm text-gray-400">
                                No image selected
                              </div>
                            )
                          ) : form.messageType === "FILE" ? (
                            <div className="rounded-lg bg-white/80 px-3 py-3 text-sm font-medium text-gray-800 ring-1 ring-gray-100">
                              {previewText || <span className="text-gray-400">No file selected</span>}
                            </div>
                          ) : (
                            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">
                              {previewText || <span className="text-gray-400">Nothing to preview yet</span>}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <footer className="shrink-0 border-t border-gray-200/90 bg-gradient-to-r from-white via-sky-50/30 to-white px-5 py-4 backdrop-blur-sm md:px-6">
              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border-2 border-gray-200/90 bg-white px-5 py-2.5 text-sm font-bold text-gray-700 shadow-sm transition-all hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98]"
                >
                  {modalMode === "view" ? "Close" : "Cancel"}
                </button>
                {modalMode !== "view" && (
                  <button
                    type="button"
                    onClick={handleSubmit}
                    className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-sky-600 via-sky-500 to-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-600/30 transition-all hover:shadow-xl hover:shadow-sky-500/35 active:scale-[0.98]"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 motion-hero-shimmer" aria-hidden />
                    <span className="relative">{modalMode === "create" ? "Create message" : "Save changes"}</span>
                  </button>
                )}
              </div>
            </footer>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

