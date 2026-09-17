import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchUserAttributes,
  saveUserAttributes,
} from '../services/userAttributeService';
import { resolveActiveProjectId } from '../utils/activeProject';

const newRow = () => ({
  id: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
});

export default function UserAttributesPage({ embedded = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [projectId, setProjectId] = useState(() => resolveActiveProjectId());

  const loadAttributes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await fetchUserAttributes();
      setRows(
        list.map((item) => ({
          id: item.id,
          name: item.name || '',
        }))
      );
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load user attributes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAttributes();
  }, [loadAttributes, projectId]);

  useEffect(() => {
    const syncProject = () => setProjectId(resolveActiveProjectId());
    window.addEventListener('waabiz-project-changed', syncProject);
    window.addEventListener('focus', syncProject);
    return () => {
      window.removeEventListener('waabiz-project-changed', syncProject);
      window.removeEventListener('focus', syncProject);
    };
  }, []);

  const persistRows = async (nextRows, successMessage) => {
    const payload = nextRows
      .map((row) => ({
        id: String(row.id).startsWith('new-') ? null : row.id,
        name: String(row.name || '').trim(),
      }))
      .filter((row) => row.name);

    const saved = await saveUserAttributes(payload);
    setRows(
      saved.map((item) => ({
        id: item.id,
        name: item.name || '',
      }))
    );
    if (successMessage) {
      setSuccess(successMessage);
      setTimeout(() => setSuccess(''), 3500);
    }
  };

  const filteredRows = useMemo(() => {
    const q = String(search || '').trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => String(row.name || '').toLowerCase().includes(q));
  }, [rows, search]);

  const handleAddAttribute = () => {
    setRows((prev) => [...prev, newRow()]);
    setSuccess('');
  };

  const handleNameChange = (rowId, value) => {
    setRows((prev) =>
      prev.map((row) => (row.id === rowId ? { ...row, name: value } : row))
    );
    setSuccess('');
  };

  const handleDeleteRow = async (rowId) => {
    const nextRows = rows.filter((row) => row.id !== rowId);
    setRows(nextRows);
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await persistRows(nextRows, 'Attribute deleted.');
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to delete attribute');
      await loadAttributes();
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await persistRows(rows, 'Attributes saved successfully.');
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save attributes');
    } finally {
      setSaving(false);
    }
  };

  const shellClass = embedded ? 'space-y-6' : 'min-h-screen bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50 p-4 md:p-8';

  return (
    <div className={shellClass}>
      <div className={embedded ? '' : 'max-w-5xl mx-auto'}>
        {!embedded && (
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">User attributes</h1>
            <p className="text-sm text-gray-600 mt-1">
              Define custom contact fields for your project.
            </p>
          </div>
        )}

        <div className="bg-white border border-gray-200/90 rounded-2xl shadow-sm ring-1 ring-gray-100/80 overflow-hidden">
          <div className="p-4 md:p-5 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
            <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1 min-w-[220px]">
                <svg
                  className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by attributes name"
                  className="w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 py-2.5 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                />
              </div>
              <select
                className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 min-w-[120px] focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                defaultValue="all"
                disabled
              >
                <option value="all">All</option>
              </select>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleAddAttribute}
                className="inline-flex items-center gap-1.5 rounded-lg border border-teal-600 px-4 py-2.5 text-sm font-semibold text-teal-700 bg-white hover:bg-teal-50 transition"
              >
                <span className="text-base leading-none">+</span>
                Add attribute
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60 transition"
              >
                {saving ? 'Saving…' : 'Save Attributes'}
              </button>
            </div>
          </div>

          {error && (
            <div className="mx-4 md:mx-5 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="mx-4 md:mx-5 mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 md:px-5 py-3 text-left text-sm font-semibold text-teal-700">
                    Name<span className="text-red-500">*</span>
                  </th>
                  <th className="px-4 md:px-5 py-3 text-right text-sm font-semibold text-teal-700 w-24">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={2} className="px-4 md:px-5 py-10 text-center text-sm text-gray-500">
                      Loading attributes…
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 md:px-5 py-10 text-center text-sm text-gray-500">
                      {rows.length === 0
                        ? 'No attributes yet. Click “Add attribute” to create one.'
                        : 'No attributes match your search.'}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-50 last:border-b-0">
                      <td className="px-4 md:px-5 py-3">
                        <input
                          value={row.name}
                          onChange={(e) => handleNameChange(row.id, e.target.value)}
                          placeholder="Enter attribute name"
                          className="w-full rounded-lg border border-transparent bg-gray-100 px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/25 focus:border-teal-500 focus:bg-white"
                        />
                      </td>
                      <td className="px-4 md:px-5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(row.id)}
                          disabled={saving}
                          className="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                          title="Delete attribute"
                          aria-label="Delete attribute"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-7 0h8m-1-2a1 1 0 00-1-1h-2a1 1 0 00-1 1l-.2 1h4.4l-.2-1z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
