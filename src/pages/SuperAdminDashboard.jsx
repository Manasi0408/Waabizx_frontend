import React, { useEffect, useMemo, useState } from "react";
import axios from "../api/axios";
import { useNavigate } from "react-router-dom";
import { logout } from "../services/authService";
import HeaderRightActions from "../components/HeaderRightActions";
import BrandLogoMark from "../components/BrandLogoMark";
import SuperAdminPlansPanel from "../components/SuperAdminPlansPanel";
import SuperAdminLeadsPanel from "../components/SuperAdminLeadsPanel";
import SuperAdminDemoBookingsPanel from "../components/SuperAdminDemoBookingsPanel";

function SuperAdminDashboard() {
  const navigate = useNavigate();
  const [admins, setAdmins] = useState([]);
  const [selectedAdminId, setSelectedAdminId] = useState("");
  const [contacts, setContacts] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("admins");

  const user = (() => {
    try {
      const raw = localStorage.getItem("user");
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  })();
  const userName = user?.name || "SuperAdmin";
  const userInitial = String(userName || "S").charAt(0).toUpperCase();

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  useEffect(() => {
    const fetchAdmins = async () => {
      setError("");
      setLoadingAdmins(true);
      try {
        const res = await axios.get("/admins");
        const list = Array.isArray(res?.data) ? res.data : [];
        setAdmins(list);
        if (list.length && !selectedAdminId) setSelectedAdminId(String(list[0]?.id ?? ""));
      } catch (e) {
        setError(e?.response?.data?.message || e?.message || "Failed to load admins");
        setAdmins([]);
      } finally {
        setLoadingAdmins(false);
      }
    };

    fetchAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedAdmin = useMemo(
    () => admins.find((a) => String(a?.id) === String(selectedAdminId)) || null,
    [admins, selectedAdminId]
  );

  useEffect(() => {
    const fetchContacts = async () => {
      if (!selectedAdminId) return;
      setError("");
      setLoadingContacts(true);
      try {
        const res = await axios.get(`/admins/${selectedAdminId}/contacts`);
        const list = Array.isArray(res?.data) ? res.data : [];
        setContacts(list);
      } catch (e) {
        setError(
          e?.response?.data?.message || e?.message || "Failed to load admin contacts"
        );
        setContacts([]);
      } finally {
        setLoadingContacts(false);
      }
    };

    fetchContacts();
  }, [selectedAdminId]);

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-3 shrink-0">
            <BrandLogoMark size="md" />
            <h2 className="text-lg font-semibold text-sky-700 hidden md:block tracking-tight">SuperAdmin</h2>
          </div>
          <span className="text-gray-300 hidden md:block shrink-0">|</span>
          <p className="text-xs md:text-sm text-gray-500 truncate">View Admins and their uploaded Contacts</p>
        </div>

        <HeaderRightActions>
          <button
            type="button"
            onClick={() => navigate("/settings")}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/35 hover:shadow-lg hover:ring-2 ring-sky-300/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none"
            aria-label="Settings"
          >
            <span className="text-white font-semibold text-sm">{userInitial}</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 via-red-600 to-rose-700 flex items-center justify-center cursor-pointer shadow-md shadow-red-500/25 hover:shadow-lg hover:ring-2 ring-red-200/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none"
            aria-label="Logout"
            title="Logout"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m10 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h8a3 3 0 013 3v1" />
            </svg>
          </button>
        </HeaderRightActions>
      </header>

      <main className="relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
          <div className="pointer-events-none absolute inset-0 overflow-hidden z-0" aria-hidden>
            <div className="absolute -top-24 -right-16 w-[18rem] h-[18rem] bg-sky-400/25 motion-page-blob" />
            <div className="absolute top-1/2 -left-20 w-[16rem] h-[16rem] bg-blue-400/20 motion-page-blob motion-page-blob--b" />
          </div>

          <div className="relative z-[1] min-h-full">
            <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
              {/* Professional hero (Welcome back + quick stats) */}
              <section className="motion-enter relative mb-6 md:mb-8">
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-600"
                  aria-hidden
                />

                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-xl">
                    <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-sky-700 shadow-sm ring-1 ring-sky-100/80 backdrop-blur-sm">
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"
                        aria-hidden
                      />
                      SuperAdmin workspace
                    </p>

                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
                      <span className="bg-gradient-to-r from-gray-900 via-sky-800 to-blue-900 bg-clip-text text-transparent">
                        {userName}, your platform command center
                      </span>
                    </h1>

                    <p className="mt-3 text-base leading-relaxed text-gray-600 md:text-[17px]">
                      Monitor every admin tenant and review uploaded contacts instantly in one place.
                    </p>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-sky-50 to-blue-50 px-3 py-1 text-xs font-semibold capitalize text-sky-900 ring-1 ring-sky-200/70">
                        <svg className="h-3.5 w-3.5 text-sky-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                          <path
                            fillRule="evenodd"
                            d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                            clipRule="evenodd"
                          />
                        </svg>
                        super_admin
                      </span>
                      {selectedAdmin ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200/80 backdrop-blur-sm">
                          Selected: {selectedAdmin.name || selectedAdmin.email}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid w-full max-w-md grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:w-auto lg:grid-cols-[240px_1fr]">
                    <div className="rounded-2xl border border-gray-100/90 bg-white/90 p-4 shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 backdrop-blur-sm motion-hover-lift">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Admins</p>
                      <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-gray-900">{admins.length}</p>
                      <p className="mt-1 text-xs font-medium text-sky-600/90">Total registered admins</p>
                    </div>

                    <div className="rounded-2xl border border-sky-100/90 bg-gradient-to-br from-sky-500/10 via-white to-blue-500/10 p-4 shadow-lg shadow-sky-200/30 ring-1 ring-sky-100/60 backdrop-blur-sm motion-hover-lift">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-sky-800/70">Quick tip</p>
                      <p className="mt-1 text-sm font-semibold leading-snug text-gray-800">
                        Pick an admin and scan contacts using horizontal cards for fast review.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <div className="mb-6 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab("admins")}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    activeTab === "admins"
                      ? "bg-gradient-to-r from-sky-600 to-blue-600 text-white shadow-md"
                      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  Admins & contacts
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("plans")}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    activeTab === "plans"
                      ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md"
                      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  Plans
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("leads")}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    activeTab === "leads"
                      ? "bg-gradient-to-r from-violet-600 to-blue-600 text-white shadow-md"
                      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  Website leads
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("demos")}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${
                    activeTab === "demos"
                      ? "bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-md"
                      : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  Demo bookings
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/super-admin/blogs")}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition bg-white text-gray-700 border border-gray-200 hover:bg-amber-50 hover:border-amber-200 hover:text-amber-800"
                >
                  Blogs
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/super-admin/businesses")}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition bg-white text-gray-700 border border-gray-200 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-800"
                >
                  Businesses
                </button>
              </div>

              {activeTab === "plans" ? (
                <SuperAdminPlansPanel />
              ) : activeTab === "leads" ? (
                <SuperAdminLeadsPanel />
              ) : activeTab === "demos" ? (
                <SuperAdminDemoBookingsPanel />
              ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4">
                {/* Admins card */}
                <section className="motion-enter motion-delay-1 motion-hover-lift bg-white/95 backdrop-blur-sm border border-gray-100/90 rounded-2xl shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 p-4 overflow-hidden">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h3 className="text-sm font-bold text-gray-900">Admins</h3>
                    {loadingAdmins && (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
                    )}
                  </div>

                  {error && (
                    <div className="mb-3 p-3 bg-red-50 border border-red-200/90 rounded-xl text-sm text-red-700 ring-1 ring-red-100/50">
                      {error}
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wide text-gray-600 mb-1">
                      Select admin
                    </label>
                    <select
                      className="w-full rounded-xl border-2 border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10"
                      value={selectedAdminId}
                      onChange={(e) => setSelectedAdminId(e.target.value)}
                      disabled={!admins.length}
                    >
                      {admins.length ? (
                        admins.map((a) => (
                          <option key={a.id} value={String(a.id)}>
                            {a.name || a.email || `Admin ${a.id}`}
                          </option>
                        ))
                      ) : (
                        <option value="">No admins found</option>
                      )}
                    </select>
                  </div>

                </section>

                {/* Contacts card */}
                <section className="motion-enter motion-delay-2 motion-hover-lift bg-white/95 backdrop-blur-sm border border-gray-100/90 rounded-2xl shadow-lg shadow-gray-200/35 ring-1 ring-gray-100/80 p-4 overflow-hidden">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-gray-900">Uploaded Contacts</h3>
                      {selectedAdmin ? (
                        <div className="mt-1 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-sky-800/80">
                          <span className="h-1.5 w-1.5 rounded-full bg-sky-500 shadow-[0_0_10px_rgba(56,189,248,0.6)]" aria-hidden />
                          {selectedAdmin.name || selectedAdmin.email || "Selected admin"}
                        </div>
                      ) : null}
                    </div>
                    {loadingContacts && (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
                    )}
                  </div>

                  {selectedAdminId && !loadingContacts && contacts.length === 0 && (
                    <div className="py-12 text-center text-sm text-gray-500">
                      No contacts uploaded by this admin yet.
                    </div>
                  )}

                  {!selectedAdminId && (
                    <div className="py-12 text-center text-sm text-gray-500">
                      Select an admin to view their contacts.
                    </div>
                  )}

                  {contacts.length > 0 && (
                    <div className="overflow-hidden rounded-2xl border border-gray-100/90 bg-gradient-to-b from-white to-sky-50/20 shadow-sm">
                      <div className="px-4 pt-4 pb-3 border-b border-gray-100/90 bg-gradient-to-r from-white via-sky-50/30 to-white">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-[10rem]">
                            <div className="text-xs font-bold uppercase tracking-wide text-gray-600">Contacts</div>
                            <div className="mt-1 text-lg font-bold tracking-tight text-gray-900">
                              {Math.min(200, contacts.length)}
                              <span className="text-sm font-semibold text-gray-500"> / {contacts.length}</span>
                            </div>
                          </div>
                          {contacts.length > 200 && (
                            <div className="text-xs font-bold uppercase tracking-wide text-sky-800/80 bg-sky-50 ring-1 ring-sky-100/70 px-3 py-1 rounded-full">
                              Showing first 200
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="p-4 md:p-5">
                      <div className="space-y-3 motion-stagger-children">
                          {contacts.slice(0, 200).map((c) => {
                            const displayName = c.displayName || c.name || "Unnamed contact";
                            const displayPhone = c.displayPhone || c.phone || "Not provided";
                            const displayEmail = c.displayEmail || c.email || "Not provided";
                            const displayStatus = c.displayStatus || String(c.status || "active");
                            const statusKey = String(c.status || "active").toLowerCase();
                            const badgeClass =
                              statusKey === "active"
                                ? "bg-emerald-50 text-emerald-800 ring-emerald-200/90"
                                : statusKey === "unsubscribed"
                                  ? "bg-amber-50 text-amber-800 ring-amber-200/90"
                                  : "bg-gray-100 text-gray-600 ring-gray-200/80";
                            const initialMatch = String(displayName).match(/[A-Za-z]/);
                            const initial = (initialMatch ? initialMatch[0] : "C").toUpperCase();

                            return (
                              <article
                                key={c.id}
                              className="group relative rounded-2xl border border-gray-100/90 bg-white/90 backdrop-blur-sm p-4 shadow-sm transition-all duration-300 hover:shadow-md hover:border-sky-200/70 flex items-center gap-4 motion-hover-lift"
                              >
                                <div className="pointer-events-none absolute inset-x-0 top-0 h-[3px] rounded-t-2xl bg-gradient-to-r from-sky-400 via-blue-500 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity" />

                              <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-900 text-white flex items-center justify-center ring-2 ring-white/70 shadow-sm">
                                <span className="text-sm font-bold">{initial}</span>
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 space-y-1">
                                    <div className="text-sm font-bold text-gray-900 truncate">{displayName}</div>
                                    <div className="text-xs text-gray-600 truncate">
                                      <span className="font-semibold text-gray-500">Phone:</span> {displayPhone}
                                    </div>
                                    <div className="text-xs text-gray-600 truncate">
                                      <span className="font-semibold text-gray-500">Email:</span> {displayEmail}
                                    </div>
                                  </div>

                                  <div className="shrink-0 inline-flex items-center px-2 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ring-1">
                                    <span className={`inline-flex items-center ${badgeClass} rounded-full px-2 py-1`}>
                                      {displayStatus}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              </article>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              </div>
              )}
            </div>
          </div>
        </main>
    </div>
  );
}

export default SuperAdminDashboard;

