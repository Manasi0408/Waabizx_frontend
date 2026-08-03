import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchTags,
  createTag,
  updateTag,
  deleteTag,
} from '../services/tagService';

const PRESET_COLORS = [
  '#3B82F6',
  '#00C853',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#14B8A6',
  '#64748B',
];

export default function TagsPage({ embedded = false }) {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const loadTags = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await fetchTags();
      setTags(list);
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to load tags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await createTag({ name: name.trim(), color });
      setName('');
      setColor(PRESET_COLORS[0]);
      await loadTags();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to create tag');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (tag) => {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color || PRESET_COLORS[0]);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditColor(PRESET_COLORS[0]);
  };

  const handleUpdate = async (id) => {
    if (!editName.trim()) return;
    setSaving(true);
    setError('');
    try {
      await updateTag(id, { name: editName.trim(), color: editColor });
      cancelEdit();
      await loadTags();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to update tag');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this tag? It will be removed from all contacts.')) return;
    setSaving(true);
    setError('');
    try {
      await deleteTag(id);
      if (editingId === id) cancelEdit();
      await loadTags();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to delete tag');
    } finally {
      setSaving(false);
    }
  };

  const shellClass = embedded
    ? 'space-y-6'
    : 'min-h-screen bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50 p-4 md:p-8';

  return (
    <div className={shellClass}>
      <div className={embedded ? '' : 'max-w-3xl mx-auto'}>
        {!embedded && (
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Tags</h1>
            <p className="text-sm text-gray-600 mt-1">
              Organize contacts with colored labels. Use tags in Inbox, Contacts filter, and campaigns.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form
          onSubmit={handleCreate}
          className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm mb-6"
        >
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Create Tag</h2>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-600 mb-1">Tag Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Interested"
                maxLength={100}
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-full border-2 transition ${
                      color === c ? 'border-gray-900 scale-110' : 'border-white shadow'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="shrink-0 px-5 py-2.5 rounded-xl bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        </form>

        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Your Tags</h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm text-gray-500">Loading tags…</div>
          ) : tags.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No tags yet. Create one above.</div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {tags.map((tag) => (
                <li key={tag.id} className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  {editingId === tag.id ? (
                    <>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                      />
                      <div className="flex gap-2">
                        {PRESET_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setEditColor(c)}
                            className={`w-7 h-7 rounded-full border-2 ${
                              editColor === c ? 'border-gray-900' : 'border-white shadow'
                            }`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleUpdate(tag.id)}
                          disabled={saving}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-sky-600 rounded-lg"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="px-3 py-1.5 text-sm text-gray-600 rounded-lg border"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color || '#3B82F6' }}
                        />
                        <span className="font-medium text-gray-900 truncate">{tag.name}</span>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEdit(tag)}
                          className="px-3 py-1.5 text-sm text-sky-700 hover:bg-sky-50 rounded-lg"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(tag.id)}
                          disabled={saving}
                          className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
