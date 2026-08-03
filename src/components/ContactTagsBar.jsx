import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchTags,
  fetchContactTags,
  assignContactTag,
  removeContactTag,
} from '../services/tagService';

export default function ContactTagsBar({ contactId, phone, onChange, onContactResolved }) {
  const [tags, setTags] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [resolvedContactId, setResolvedContactId] = useState(contactId || null);
  const pickerRef = useRef(null);
  const addBtnRef = useRef(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 160 });

  useEffect(() => {
    setResolvedContactId(contactId || null);
  }, [contactId]);

  const load = useCallback(async () => {
    if (!phone && !contactId) {
      setTags([]);
      return;
    }
    setLoading(true);
    setActionError('');
    try {
      const [contactTags, projectTags] = await Promise.all([
        fetchContactTags({ contactId, phone }),
        fetchTags(),
      ]);
      setTags(contactTags);
      setAllTags(projectTags);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to load tags';
      console.warn('[ContactTagsBar] load failed', msg);
      setActionError(msg);
    } finally {
      setLoading(false);
    }
  }, [contactId, phone]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!pickerOpen) return undefined;
    const onDocClick = (e) => {
      if (pickerRef.current?.contains(e.target)) return;
      if (addBtnRef.current?.contains(e.target)) return;
      setPickerOpen(false);
    };
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, [pickerOpen]);

  const openPicker = () => {
    if (addBtnRef.current) {
      const rect = addBtnRef.current.getBoundingClientRect();
      setMenuPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 160),
      });
    }
    setPickerOpen((v) => !v);
    setActionError('');
  };

  const assignedIds = new Set(tags.map((t) => t.id));
  const available = allTags.filter((t) => !assignedIds.has(t.id));

  const handleAssign = async (tagId) => {
    setActionError('');
    try {
      const result = await assignContactTag({ contactId: resolvedContactId, tagId, phone });
      if (result?.contactId) {
        setResolvedContactId(result.contactId);
        onContactResolved?.(result.contactId);
      }
      await load();
      onChange?.();
      setPickerOpen(false);
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to assign tag';
      console.error('[ContactTagsBar] assign failed', msg);
      setActionError(msg);
    }
  };

  const handleRemove = async (tagId) => {
    setActionError('');
    try {
      await removeContactTag({ contactId: resolvedContactId, tagId, phone });
      await load();
      onChange?.();
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || 'Failed to remove tag';
      console.error('[ContactTagsBar] remove failed', msg);
      setActionError(msg);
    }
  };

  if (!phone && !contactId) return null;

  const pickerMenu =
    pickerOpen &&
    createPortal(
      <div
        ref={pickerRef}
        className="fixed z-[9999] max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl py-1"
        style={{ top: menuPos.top, left: menuPos.left, minWidth: menuPos.width }}
      >
        {available.length === 0 ? (
          <div className="px-3 py-2 text-xs text-gray-500">
            {allTags.length === 0 ? 'Create tags in Manage → Tags' : 'All tags assigned'}
          </div>
        ) : (
          available.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleAssign(tag.id);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-sky-50 flex items-center gap-2"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: tag.color || '#3B82F6' }}
              />
              {tag.name}
            </button>
          ))
        )}
      </div>,
      document.body
    );

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
      {tags.map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs font-medium text-white"
          style={{ backgroundColor: tag.color || '#3B82F6' }}
        >
          {tag.name}
          <button
            type="button"
            onClick={() => handleRemove(tag.id)}
            className="ml-0.5 w-4 h-4 rounded-full hover:bg-black/20 flex items-center justify-center"
            aria-label={`Remove ${tag.name}`}
          >
            ×
          </button>
        </span>
      ))}
      <button
        ref={addBtnRef}
        type="button"
        onClick={openPicker}
        disabled={loading}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-sky-700 bg-sky-50 border border-sky-200 hover:bg-sky-100"
      >
        + Add Tag
      </button>
      {actionError ? (
        <span className="text-[10px] text-red-600 w-full">{actionError}</span>
      ) : null}
      {pickerMenu}
    </div>
  );
}
