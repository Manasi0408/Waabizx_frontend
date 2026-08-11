import React, { useEffect, useMemo, useState } from "react";
import axios from "../api/axios";
import { useLocation } from "react-router-dom";
import SuperAdminLayout, { resolveSuperAdminSection } from "../components/SuperAdminLayout";
import SuperAdminPlansPanel from "../components/SuperAdminPlansPanel";
import SuperAdminLeadsPanel from "../components/SuperAdminLeadsPanel";
import SuperAdminDemoBookingsPanel from "../components/SuperAdminDemoBookingsPanel";
import SuperAdminBlogsPanel from "../components/SuperAdminBlogsPanel";
import SuperAdminBusinessesPanel from "../components/SuperAdminBusinessesPanel";
import SuperAdminPagination, { useSuperAdminPagination } from "../components/SuperAdminPagination";

function SuperAdminDashboard() {
  const location = useLocation();
  const activeSection = resolveSuperAdminSection(location.pathname);

  const [admins, setAdmins] = useState([]);
  const [selectedAdminId, setSelectedAdminId] = useState("");
  const [contacts, setContacts] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [error, setError] = useState("");

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

  useEffect(() => {
    if (activeSection !== "admins") return undefined;
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
  }, [activeSection]);

  const selectedAdmin = useMemo(
    () => admins.find((a) => String(a?.id) === String(selectedAdminId)) || null,
    [admins, selectedAdminId]
  );

  useEffect(() => {
    if (activeSection !== "admins" || !selectedAdminId) return undefined;
    const fetchContacts = async () => {
      setError("");
      setLoadingContacts(true);
      try {
        const res = await axios.get(`/admins/${selectedAdminId}/contacts`);
        setContacts(Array.isArray(res?.data) ? res.data : []);
      } catch (e) {
        setError(e?.response?.data?.message || e?.message || "Failed to load admin contacts");
        setContacts([]);
      } finally {
        setLoadingContacts(false);
      }
    };
    fetchContacts();
  }, [selectedAdminId, activeSection]);

  const {
    page: contactsPage,
    setPage: setContactsPage,
    totalPages: contactsTotalPages,
    paginatedItems: paginatedContacts,
    totalItems: contactsTotalItems,
    pageSize: contactsPageSize,
  } = useSuperAdminPagination(contacts, [selectedAdminId]);

  const renderSection = () => {
    if (activeSection === "plans") return <SuperAdminPlansPanel />;
    if (activeSection === "leads") return <SuperAdminLeadsPanel />;
    if (activeSection === "demos") return <SuperAdminDemoBookingsPanel />;
    if (activeSection === "blogs") return <SuperAdminBlogsPanel />;
    if (activeSection === "businesses") return <SuperAdminBusinessesPanel />;

    return (
      <div className="motion-enter space-y-6">
        <section className="relative overflow-hidden rounded-2xl border border-gray-100/90 bg-white/95 p-5 shadow-lg ring-1 ring-gray-100/80 md:p-6">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Admins & contacts</h2>
          <p className="mt-2 text-sm text-gray-600">
            Select an admin to review contacts they uploaded to the platform.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Total admins</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{admins.length}</p>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-sky-700">Contacts</p>
              <p className="mt-1 text-3xl font-bold tabular-nums text-gray-900">{contacts.length}</p>
            </div>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-gray-100/90 bg-white/95 p-4 shadow-lg ring-1 ring-gray-100/80">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-gray-900">Admins</h3>
              {loadingAdmins ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
              ) : null}
            </div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-600">Select admin</label>
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
          </section>

          <section className="overflow-hidden rounded-2xl border border-gray-100/90 bg-white/95 shadow-lg ring-1 ring-gray-100/80">
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Uploaded contacts</h3>
                {selectedAdmin ? (
                  <p className="mt-0.5 text-xs text-gray-500">{selectedAdmin.name || selectedAdmin.email}</p>
                ) : null}
              </div>
              {loadingContacts ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
              ) : null}
            </div>

            {!selectedAdminId ? (
              <div className="py-12 text-center text-sm text-gray-500">Select an admin to view contacts.</div>
            ) : !loadingContacts && contacts.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">No contacts uploaded by this admin yet.</div>
            ) : (
              <>
                <div className="space-y-3 p-4">
                  {paginatedContacts.map((c) => {
                    const displayName = c.displayName || c.name || "Unnamed contact";
                    const displayPhone = c.displayPhone || c.phone || "Not provided";
                    const displayEmail = c.displayEmail || c.email || "Not provided";
                    const initialMatch = String(displayName).match(/[A-Za-z]/);
                    const initial = (initialMatch ? initialMatch[0] : "C").toUpperCase();
                    return (
                      <article
                        key={c.id}
                        className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-900 text-sm font-bold text-white">
                          {initial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold text-gray-900">{displayName}</div>
                          <div className="truncate text-xs text-gray-600">
                            <span className="font-semibold text-gray-500">Phone:</span> {displayPhone}
                          </div>
                          <div className="truncate text-xs text-gray-600">
                            <span className="font-semibold text-gray-500">Email:</span> {displayEmail}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <SuperAdminPagination
                  page={contactsPage}
                  totalPages={contactsTotalPages}
                  onPageChange={setContactsPage}
                  totalItems={contactsTotalItems}
                  pageSize={contactsPageSize}
                />
              </>
            )}
          </section>
        </div>
      </div>
    );
  };

  return (
    <SuperAdminLayout userName={userName} userInitial={userInitial}>
      {renderSection()}
    </SuperAdminLayout>
  );
}

export default SuperAdminDashboard;
