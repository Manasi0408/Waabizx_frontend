import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import BrandLogoMark from '../components/BrandLogoMark';
import MainSidebarNav from '../components/MainSidebarNav';
import AppShellSidebar from '../components/AppShellSidebar';
import AdminHeaderProjectSwitch from '../components/AdminHeaderProjectSwitch';
import AddContentMenu from '../components/forms/AddContentMenu';
import FormMobilePreview from '../components/forms/FormMobilePreview';
import { getProfile, isAuthenticated, logout } from '../services/authService';
import { createEmptyForm, getFormById, saveForm } from '../utils/formStorage';
import { defaultBlockForType, getTypeLabel } from '../utils/formContentTypes';

const MAX_SCREENS = 5;
const CATEGORIES = ['SURVEY', 'APPOINTMENT_BOOKING', 'LEAD_GEN', 'SIGN_UP', 'OTHER'];

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export default function FormBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formName, setFormName] = useState('Untitled Form');
  const [formCategory, setFormCategory] = useState('SURVEY');
  const [formId, setFormId] = useState(null);
  const [screens, setScreens] = useState([]);
  const [activeScreenId, setActiveScreenId] = useState(null);
  const [newScreenTitle, setNewScreenTitle] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        if (!isAuthenticated()) {
          navigate('/login');
          return;
        }
        await getProfile();
        if (isEdit) {
          const existing = getFormById(id);
          if (!existing) {
            navigate('/form');
            return;
          }
          setFormId(existing.id);
          setFormName(existing.name || 'Untitled Form');
          setFormCategory(existing.category || 'SURVEY');
          setScreens(existing.screens?.length ? existing.screens : createEmptyForm().screens);
          setActiveScreenId(existing.screens?.[0]?.id || null);
        } else {
          const blank = createEmptyForm();
          setFormId(blank.id);
          setScreens(blank.screens);
          setActiveScreenId(blank.screens[0]?.id || null);
        }
      } catch {
        logout();
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [id, isEdit, navigate]);

  const activeScreen = useMemo(
    () => screens.find((s) => s.id === activeScreenId) || screens[0] || null,
    [screens, activeScreenId]
  );

  const updateScreen = (screenId, patch) => {
    setScreens((prev) => prev.map((s) => (s.id === screenId ? { ...s, ...patch } : s)));
  };

  const updateBlock = (screenId, blockId, patch) => {
    setScreens((prev) =>
      prev.map((s) => {
        if (s.id !== screenId) return s;
        return {
          ...s,
          content: (s.content || []).map((b) => (b.id === blockId ? { ...b, ...patch } : b)),
        };
      })
    );
  };

  const removeBlock = (screenId, blockId) => {
    setScreens((prev) =>
      prev.map((s) =>
        s.id === screenId ? { ...s, content: (s.content || []).filter((b) => b.id !== blockId) } : s
      )
    );
  };

  const addContentBlock = (type) => {
    if (!activeScreen) return;
    const block = defaultBlockForType(type);
    updateScreen(activeScreen.id, {
      content: [...(activeScreen.content || []), block],
    });
  };

  const handleAddScreen = () => {
    const title = newScreenTitle.trim();
    if (!title || screens.length >= MAX_SCREENS) return;
    const screen = { id: uid('screen'), title: title.slice(0, 20), footerButton: 'Continue', content: [] };
    setScreens((prev) => [...prev, screen]);
    setActiveScreenId(screen.id);
    setNewScreenTitle('');
  };

  const handleRemoveScreen = (screenId) => {
    if (screens.length <= 1) return;
    const next = screens.filter((s) => s.id !== screenId);
    setScreens(next);
    if (activeScreenId === screenId) setActiveScreenId(next[0]?.id || null);
  };

  const handleSavePublish = async () => {
    setSaving(true);
    try {
      const payload = {
        id: formId,
        name: formName.trim() || 'Untitled Form',
        category: formCategory,
        status: 'published',
        createdAt: isEdit ? getFormById(formId)?.createdAt : new Date().toISOString(),
        responses: isEdit ? getFormById(formId)?.responses || 0 : 0,
        linkedTemplates: isEdit ? getFormById(formId)?.linkedTemplates || [] : [],
        screens,
      };
      saveForm(payload);
      navigate('/form');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-sky-200 border-t-sky-600" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <header className="shrink-0 z-10 bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg hover:bg-gray-100 lg:hidden">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
            <BrandLogoMark size="sm" />
            <span className="font-bold text-gray-800 hidden sm:inline">Waabizx</span>
          </Link>
          <span className="text-gray-300">|</span>
          <span className="text-sm font-semibold text-gray-700">Forms</span>
          <AdminHeaderProjectSwitch />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/form')}
            className="px-4 py-2 text-sm font-medium border-2 border-emerald-600 text-emerald-700 rounded-lg hover:bg-emerald-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleSavePublish}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save & Publish'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AppShellSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
          <MainSidebarNav onNavigate={() => setSidebarOpen(false)} />
        </AppShellSidebar>

        <main className="flex-1 min-h-0 overflow-hidden flex flex-col lg:flex-row">
          {/* Screens */}
          <section className="w-full lg:w-64 shrink-0 border-r border-gray-200 bg-white p-4 overflow-y-auto">
            <h3 className="text-sm font-bold text-gray-800 mb-3">Screens (Upto {MAX_SCREENS})</h3>
            <div className="space-y-2 mb-4">
              {screens.map((screen) => (
                <div
                  key={screen.id}
                  className={`flex items-center gap-2 rounded-lg border px-2 py-2 cursor-pointer ${
                    activeScreenId === screen.id
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                  onClick={() => setActiveScreenId(screen.id)}
                  onKeyDown={() => {}}
                  role="button"
                  tabIndex={0}
                >
                  <span className="text-gray-400 cursor-grab">⋮⋮</span>
                  <span className="flex-1 text-sm font-medium text-gray-800 truncate">{screen.title}</span>
                  {screens.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveScreen(screen.id);
                      }}
                      className="text-gray-400 hover:text-red-500 text-lg leading-none"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            {screens.length < MAX_SCREENS && (
              <div className="rounded-lg border border-gray-200 p-3 bg-gray-50/50">
                <label className="text-xs font-medium text-gray-600">Screen Title</label>
                <input
                  type="text"
                  maxLength={20}
                  value={newScreenTitle}
                  onChange={(e) => setNewScreenTitle(e.target.value)}
                  placeholder="Screen Title"
                  className="mt-1 w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/30"
                />
                <div className="flex justify-between items-center mt-1">
                  <span className="text-[10px] text-gray-400">{newScreenTitle.length}/20</span>
                  <button
                    type="button"
                    onClick={handleAddScreen}
                    disabled={!newScreenTitle.trim()}
                    className="px-3 py-1 text-xs font-semibold bg-emerald-600 text-white rounded-md disabled:opacity-50"
                  >
                    Add +
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Edit content */}
          <section className="flex-1 min-w-0 overflow-y-auto p-4 md:p-6 bg-white border-r border-gray-200">
            <div className="max-w-xl">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="text-xs font-semibold text-gray-600">Form Name</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600">Form Category</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {activeScreen && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Screen Title</label>
                      <input
                        type="text"
                        value={activeScreen.title}
                        onChange={(e) => updateScreen(activeScreen.id, { title: e.target.value.slice(0, 20) })}
                        className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-gray-600">Footer Button</label>
                      <input
                        type="text"
                        value={activeScreen.footerButton}
                        onChange={(e) => updateScreen(activeScreen.id, { footerButton: e.target.value })}
                        className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                      />
                    </div>
                  </div>

                  <h3 className="text-sm font-bold text-gray-800 mb-3">Edit Content</h3>

                  <div className="space-y-3 mb-6">
                    {(activeScreen.content || []).map((block) => (
                      <div key={block.id} className="rounded-xl border border-gray-200 p-4 bg-gray-50/50">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-semibold text-emerald-700 uppercase">{getTypeLabel(block.type)}</span>
                          <button
                            type="button"
                            onClick={() => removeBlock(activeScreen.id, block.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Remove
                          </button>
                        </div>

                        {block.type.startsWith('text_') && !block.type.startsWith('text_answer') && (
                          <input
                            type="text"
                            value={block.text || ''}
                            onChange={(e) => updateBlock(activeScreen.id, block.id, { text: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                            placeholder="Enter text"
                          />
                        )}

                        {block.type.startsWith('text_answer') && (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={block.label || ''}
                              onChange={(e) => updateBlock(activeScreen.id, block.id, { label: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                              placeholder="Field label"
                            />
                            <input
                              type="text"
                              value={block.placeholder || ''}
                              onChange={(e) => updateBlock(activeScreen.id, block.id, { placeholder: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                              placeholder="Placeholder"
                            />
                          </div>
                        )}

                        {block.type.startsWith('media_') && (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={block.label || ''}
                              onChange={(e) => updateBlock(activeScreen.id, block.id, { label: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                              placeholder="Label"
                            />
                            {block.type === 'media_image' && (
                              <input
                                type="url"
                                value={block.imageUrl || ''}
                                onChange={(e) => updateBlock(activeScreen.id, block.id, { imageUrl: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                placeholder="Image URL (optional)"
                              />
                            )}
                          </div>
                        )}

                        {block.type.startsWith('selection_') && (
                          <div className="space-y-2">
                            <input
                              type="text"
                              value={block.label || ''}
                              onChange={(e) => updateBlock(activeScreen.id, block.id, { label: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                              placeholder="Question label"
                            />
                            {block.type === 'selection_opt_in' ? (
                              <input
                                type="text"
                                value={block.text || ''}
                                onChange={(e) => updateBlock(activeScreen.id, block.id, { text: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                placeholder="Opt-in text"
                              />
                            ) : (
                              <textarea
                                value={(block.options || []).join('\n')}
                                onChange={(e) =>
                                  updateBlock(activeScreen.id, block.id, {
                                    options: e.target.value.split('\n').filter(Boolean),
                                  })
                                }
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                                placeholder="One option per line"
                              />
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <AddContentMenu onSelect={addContentBlock} />
                </>
              )}
            </div>
          </section>

          {/* Mobile preview */}
          <section className="w-full lg:w-[340px] shrink-0 bg-gray-100 p-6 overflow-y-auto flex items-start justify-center">
            {activeScreen && (
              <FormMobilePreview
                screenTitle={activeScreen.title}
                footerButton={activeScreen.footerButton}
                content={activeScreen.content || []}
              />
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
