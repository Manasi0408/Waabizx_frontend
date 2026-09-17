import { useState, useEffect, useRef } from 'react';
import BrandLogoMark from '../components/BrandLogoMark';
import { useNavigate, Link } from 'react-router-dom';
import { getProfile, isAuthenticated, logout, readSessionUser } from '../services/authService';
import { getNotifications, markAsRead, markAllAsRead } from '../services/notificationService';
import {
  getTemplates,
  createTemplate,
  deleteTemplate,
  createMetaTemplate,
  getMetaTemplates
} from '../services/templateService';
import MainSidebarNav from '../components/MainSidebarNav';
import AppShellSidebar from '../components/AppShellSidebar';
import AdminHeaderProjectSwitch from '../components/AdminHeaderProjectSwitch';
import HeaderRightActions from '../components/HeaderRightActions';
import CreateLocalTemplateModal, { templateToLocalForm } from '../components/CreateLocalTemplateModal';
import TemplateFullViewModal from '../components/TemplateFullViewModal';
import { buildTemplatePreview } from '../utils/whatsappTemplatePreview';
import PlanLimitModal from '../components/PlanLimitModal';
import { extractPlanLimitError, gatePlanLimit, assertCanAddResource } from '../services/planLimitService';

function Templates() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, limit: 20 });
  const [filters, setFilters] = useState({ category: '', status: '', page: 1 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createPrefill, setCreatePrefill] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [metaTemplates, setMetaTemplates] = useState([]);
  const [loadingMetaTemplates, setLoadingMetaTemplates] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    content: '',
    category: 'other',
    variables: []
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [planLimitModal, setPlanLimitModal] = useState(null);
  const [success, setSuccess] = useState('');
  const notificationRef = useRef(null);

  // Fetch user profile
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        if (!isAuthenticated()) {
          navigate('/login');
          return;
        }
        const userData = await getProfile();
        setUser(userData);
      } catch (error) {
        console.error('Error fetching profile:', error);
        logout();
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [navigate]);

  // Fetch notifications
  const fetchNotifications = async (forceRefresh = false) => {
    try {
      setLoadingNotifications(true);
      if (forceRefresh) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const data = await getNotifications();
      const sortedData = (data || []).sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA;
      });
      setNotifications(sortedData);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated()) {
      fetchNotifications();
      const interval = setInterval(fetchNotifications, 10000);
      return () => clearInterval(interval);
    }
  }, []);

  useEffect(() => {
    if (notificationDropdownOpen && isAuthenticated()) {
      fetchNotifications(true);
    }
  }, [notificationDropdownOpen]);

  // Fetch templates
  const fetchTemplates = async () => {
    try {
      setLoadingTemplates(true);
      const result = await getTemplates(filters);
      setTemplates(result.templates || []);
      setPagination(result.pagination || {});
      setError('');
    } catch (error) {
      console.error('Error fetching templates:', error);
      const msg = String(error?.message || '');
      if (/project is required/i.test(msg)) {
        setTemplates([]);
        setError('');
      } else {
        setError(msg || 'Failed to load templates');
      }
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated()) return;
    fetchTemplates();
    const retryTimer = setTimeout(fetchTemplates, 350);
    return () => clearTimeout(retryTimer);
  }, [filters]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setNotificationDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (notification) => {
    if (!notification.is_read) {
      try {
        await markAsRead(notification.id);
        setNotifications(prev => 
          prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n)
        );
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }
    setNotificationDropdownOpen(false);
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const formatTime = (dateString) => {
    if (!dateString) return 'Just now';
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  // Template handlers
  const handleCreateTemplate = async (eOrPayload, onSuccess) => {
    const isEvent = eOrPayload && typeof eOrPayload.preventDefault === 'function';
    if (isEvent) eOrPayload.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const precheck = await assertCanAddResource('templates');
      if (!precheck.allowed) {
        setPlanLimitModal(precheck);
        setError('');
        return;
      }

      let payload = eOrPayload;
      if (isEvent) {
        const isAuthCategory = String(formData.category || '').toLowerCase() === 'authentication';
        payload = isAuthCategory
          ? { ...formData, content: 'Your OTP is {{1}}. Do not share it with anyone.' }
          : formData;
      }
      await createTemplate(payload);
      setSuccess('Template created successfully!');
      setShowCreateModal(false);
      setCreatePrefill(null);
      setFormData({ name: '', content: '', category: 'other', variables: [] });
      if (typeof onSuccess === 'function') onSuccess();
      fetchTemplates();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      const limitPayload = extractPlanLimitError(error);
      if (limitPayload) {
        setPlanLimitModal(limitPayload);
        setError('');
      } else {
        const msg = error?.message;
        setError(typeof msg === 'string' && msg !== '[object Object]' ? msg : 'Failed to create template');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async () => {
    try {
      await deleteTemplate(selectedTemplate.id);
      setSuccess('Template deleted successfully!');
      setShowDeleteModal(false);
      setSelectedTemplate(null);
      fetchTemplates();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError(error.message || 'Failed to delete template');
    }
  };

  const handleFetchMetaTemplates = async () => {
    try {
      setError('');
      setLoadingMetaTemplates(true);
      const templates = await getMetaTemplates();
      setMetaTemplates(Array.isArray(templates) ? templates : []);
      setSuccess(`Fetched ${Array.isArray(templates) ? templates.length : 0} templates from Meta`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      const msg = err?.message;
      setError(typeof msg === 'string' && msg !== '[object Object]' ? msg : 'Failed to fetch templates from Meta');
    } finally {
      setLoadingMetaTemplates(false);
    }
  };

  const handleSubmitLocalToMeta = async (metaPayload, onSuccess) => {
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const precheck = await assertCanAddResource('templates');
      if (!precheck.allowed) {
        setPlanLimitModal(precheck);
        setError('');
        throw new Error(precheck.message);
      }

      const result = await createMetaTemplate(metaPayload);
      setSuccess(`Template submitted to Meta! Status: ${result.status || 'PENDING'}`);
      setShowCreateModal(false);
      setCreatePrefill(null);
      if (typeof onSuccess === 'function') onSuccess();
      await fetchTemplates();
      await handleFetchMetaTemplates();
      setTimeout(() => setSuccess(''), 5000);
    } catch (error) {
      const limitPayload = extractPlanLimitError(error);
      if (limitPayload) {
        setPlanLimitModal(limitPayload);
        setError('');
        throw error;
      }
      const msg = error.message || 'Failed to submit template to Meta';
      setError(msg);
      throw new Error(msg);
    } finally {
      setSaving(false);
    }
  };

  const normalizeStatusLabel = (status) => {
    const s = String(status || '').trim();
    if (!s) return 'Unknown';
    const upper = s.toUpperCase();
    if (upper === 'APPROVED') return 'Approved';
    if (upper === 'REJECTED') return 'Rejected';
    if (upper === 'PENDING') return 'Pending';
    if (upper === 'DRAFT') return 'Draft';
    // fallback: Title Case first letter only
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  };

  const getStatusPillClass = (status) => {
    const statusUpper = String(status || '').toUpperCase();
    switch (statusUpper) {
      case 'APPROVED':
        return 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200';
      case 'REJECTED':
        return 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200';
      case 'PENDING':
        return 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200';
      case 'DRAFT':
        return 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200';
      default:
        return 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-200';
    }
  };

  const getCategoryLabel = (category) => {
    switch (category) {
      case 'welcome': return 'Welcome';
      case 'promotional': return 'Promotional';
      case 'marketing': return 'Marketing';
      case 'utility': return 'Utility';
      case 'transactional': return 'Transactional';
      case 'notification': return 'Notification';
      case 'other': return 'Other';
      default: return category;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50 flex items-center justify-center">
        <div className="text-center motion-enter">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-sky-200 border-t-sky-600 mx-auto" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  const userName = user?.name || 'User';
  const userInitial = userName.charAt(0).toUpperCase();
  const headerAvatar = user?.avatar || readSessionUser()?.avatar || '';

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2.5 rounded-xl hover:bg-gray-100/80 active:scale-95 transition lg:hidden"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link to="/dashboard" className="flex items-center gap-3 transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"><BrandLogoMark size="md" />
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent hidden sm:block">
              Waabizx
            </h1>
          </Link>

          <span className="text-gray-300 hidden md:block">|</span>
          <h2 className="text-lg font-semibold text-sky-700 hidden md:block tracking-tight">Templates</h2>
          <AdminHeaderProjectSwitch />
        </div>

        <HeaderRightActions>
          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => {
                setNotificationDropdownOpen(!notificationDropdownOpen);
                if (!notificationDropdownOpen) {
                  fetchNotifications(true);
                }
              }}
              className="relative w-10 h-10 rounded-full bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200/80 flex items-center justify-center cursor-pointer hover:from-sky-50 hover:to-sky-100/80 hover:border-sky-200/70 hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <>
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1.5 border-2 border-white shadow-sm">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                </>
              )}
            </button>

            {notificationDropdownOpen && (
              <div className="motion-pop absolute right-0 mt-3 w-80 md:w-96 bg-white rounded-2xl shadow-2xl shadow-gray-900/10 border border-gray-100 z-50 max-h-[500px] flex flex-col overflow-hidden ring-1 ring-black/5 origin-top-right">
                <div className="px-4 py-3.5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-slate-50 to-gray-50/80">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-800">Notifications</h3>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 bg-red-500 text-white text-xs font-semibold rounded-full">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        await handleMarkAllAsRead();
                        fetchNotifications();
                      }}
                      className="text-xs text-sky-600 hover:text-sky-700 font-medium transition"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>
                <div className="overflow-y-auto flex-1">
                  {loadingNotifications ? (
                    <div className="px-4 py-8 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-sky-200 border-t-sky-600 mx-auto" />
                      <p className="mt-2 text-sm text-gray-500">Loading notifications...</p>
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <svg className="w-12 h-12 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      <p className="text-sm text-gray-500">No notifications</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {notifications.map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => handleNotificationClick(notification)}
                          className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition border-l-4 ${
                            !notification.is_read
                              ? 'bg-blue-50 border-blue-500'
                              : 'bg-white border-transparent'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                                notification.type === 'campaign'
                                  ? 'bg-blue-100'
                                  : notification.type === 'template'
                                    ? 'bg-green-100'
                                    : notification.type === 'message'
                                      ? 'bg-purple-100'
                                      : 'bg-gray-100'
                              }`}
                            >
                              {notification.type === 'campaign' && (
                                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                              )}
                              {notification.type === 'template' && (
                                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              )}
                              {notification.type === 'message' && (
                                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                </svg>
                              )}
                              {!['campaign', 'template', 'message'].includes(notification.type) && (
                                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <p
                                    className={`text-sm font-medium ${
                                      !notification.is_read ? 'text-gray-900' : 'text-gray-700'
                                    }`}
                                  >
                                    {notification.title}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{notification.body}</p>
                                </div>
                                {!notification.is_read && (
                                  <div className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full mt-1" />
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-1">{formatTime(notification.created_at)}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/35 hover:shadow-lg hover:ring-2 ring-sky-300/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none overflow-hidden"
          >
            {headerAvatar ? (
              <img src={headerAvatar} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-semibold text-sm">{userInitial}</span>
            )}
          </button>
        </HeaderRightActions>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <AppShellSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
          <MainSidebarNav onNavigate={() => setSidebarOpen(false)} />
        </AppShellSidebar>

        {/* Main Content */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
          <div className="p-4 md:p-8 lg:p-10 max-w-[1600px] mx-auto">
          {/* Success/Error Messages */}
          {success && (
            <div className="motion-enter mb-6 p-4 bg-green-50 border border-green-200/90 rounded-xl shadow-sm ring-1 ring-green-100/50">
              <p className="text-green-600 text-sm">{success}</p>
            </div>
          )}
          {error && (
            <div className="motion-enter mb-6 p-4 bg-red-50 border border-red-200/90 rounded-xl shadow-sm ring-1 ring-red-100/50">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {/* Header with Create Buttons */}
          <div className="motion-enter mb-6 md:mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 tracking-tight">Templates</h2>
              <p className="text-gray-600 text-sm md:text-base">Create and manage your WhatsApp message templates</p>
            </div>
            <div className="flex flex-wrap items-stretch gap-2 sm:gap-3 justify-end">
              <button
                type="button"
                onClick={handleFetchMetaTemplates}
                disabled={loadingMetaTemplates}
                className="group relative overflow-hidden shrink-0 bg-gradient-to-r from-purple-600 via-purple-600 to-violet-700 text-white px-5 py-3 sm:px-6 rounded-xl font-semibold shadow-lg shadow-purple-600/25 hover:shadow-xl hover:shadow-purple-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center gap-2 disabled:opacity-50 disabled:pointer-events-none disabled:hover:scale-100"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" aria-hidden />
                {loadingMetaTemplates ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/40 border-t-white relative" />
                    <span className="relative">Fetching...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 relative" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="relative">Fetch from Meta</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  gatePlanLimit('templates', 1, {
                    onBlocked: setPlanLimitModal,
                    onAllowed: () => {
                      setCreatePrefill(null);
                      setShowCreateModal(true);
                      setError('');
                    },
                  });
                }}
                className="group relative overflow-hidden shrink-0 bg-gradient-to-r from-sky-600 via-sky-500 to-blue-600 text-white px-5 py-3 sm:px-6 rounded-xl font-semibold shadow-lg shadow-sky-600/30 hover:shadow-xl hover:shadow-sky-500/35 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center gap-2"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" aria-hidden />
                <svg className="w-5 h-5 relative" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="relative">Create Local</span>
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="motion-enter motion-delay-1 bg-white rounded-2xl shadow-lg shadow-gray-200/40 border border-gray-100/90 p-4 md:p-5 mb-6 md:mb-8 ring-1 ring-gray-100/80 motion-hover-lift hover:shadow-xl">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
                <select
                  value={filters.category}
                  onChange={(e) => setFilters({ ...filters, category: e.target.value, page: 1 })}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none bg-gray-50/80 hover:bg-white transition-all cursor-pointer text-sm font-medium text-gray-700 shadow-sm"
                >
                  <option value="">All Categories</option>
                  <option value="welcome">Welcome</option>
                  <option value="promotional">Promotional</option>
                  <option value="marketing">Marketing</option>
                  <option value="utility">Utility</option>
                  <option value="transactional">Transactional</option>
                  <option value="notification">Notification</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none bg-gray-50/80 hover:bg-white transition-all cursor-pointer text-sm font-medium text-gray-700 shadow-sm"
                >
                  <option value="">All Status</option>
                  <option value="draft">Draft</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
          </div>

          {/* Templates List */}
          <div className="motion-enter motion-delay-2 bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100/90 overflow-hidden ring-1 ring-gray-100/80">
            {loadingTemplates ? (
              <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-2 border-sky-200 border-t-sky-600 mx-auto" />
                <p className="mt-4 text-gray-600">Loading templates...</p>
              </div>
            ) : templates.length === 0 ? (
              <div className="p-12 text-center motion-enter">
                <svg className="w-16 h-16 text-sky-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-600 mb-4">No templates found</p>
                <button
                  type="button"
                  onClick={() => {
                    gatePlanLimit('templates', 1, {
                      onBlocked: setPlanLimitModal,
                      onAllowed: () => {
                        setFormData({ name: '', content: '', category: 'other', status: 'draft', variables: [] });
                        setCreatePrefill(null);
                        setShowCreateModal(true);
                      },
                    });
                  }}
                  className="bg-sky-600 text-white px-6 py-2.5 rounded-xl hover:bg-sky-700 transition-all duration-300 shadow-md shadow-sky-600/25 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] font-medium"
                >
                  Create Your First Template
                </button>
              </div>
            ) : (
              <>
                <div className="p-4 md:p-6 space-y-3 md:space-y-4 motion-stagger-children">
                  {templates.map((template) => (
                    <article
                      key={template.id}
                      className="group relative flex min-h-0 flex-row rounded-2xl border border-gray-100/90 bg-white shadow-sm shadow-gray-200/40 ring-1 ring-gray-100/80 overflow-hidden motion-hover-lift hover:shadow-xl hover:border-sky-100/90 transition-all duration-300"
                    >
                      <div
                        className="w-1.5 shrink-0 self-stretch bg-gradient-to-b from-sky-400 via-sky-500 to-blue-600 opacity-95"
                        aria-hidden
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-4 lg:flex-row lg:items-center lg:gap-5 xl:gap-6">
                        <div className="min-w-0 flex-1 lg:max-w-md xl:max-w-lg">
                          <div className="flex flex-wrap items-center gap-2 gap-y-1">
                            <h3 className="text-base font-semibold text-gray-900 leading-snug line-clamp-2 min-w-0">
                              {template.name}
                            </h3>
                            {template.metaStatus ? (
                              <span
                                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] font-semibold rounded-full ${getStatusPillClass(template.metaStatus)}`}
                              >
                                <span className="text-gray-500 font-medium">Meta</span>
                                <span className="opacity-80">•</span>
                                <span>{normalizeStatusLabel(template.metaStatus)}</span>
                              </span>
                            ) : (
                              <span
                                className={`shrink-0 inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-full ${getStatusPillClass(template.status)}`}
                              >
                                {normalizeStatusLabel(template.status)}
                              </span>
                            )}
                            {(String(template.metaStatus || '').toUpperCase() === 'REJECTED' ||
                              String(template.status || '').toLowerCase() === 'rejected') && (
                              <button
                                type="button"
                                title="View rejection reason"
                                onClick={() => {
                                  setSelectedTemplate(template);
                                  setShowRejectionModal(true);
                                }}
                                className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-all duration-200 active:scale-95"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                  />
                                </svg>
                              </button>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                            {template.content || 'No content'}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2 text-xs text-gray-600">
                            <span>
                              <span className="font-medium text-gray-500">Category</span>{' '}
                              {getCategoryLabel(template.category)}
                            </span>
                            <span className="text-gray-300" aria-hidden>
                              |
                            </span>
                            <span>
                              <span className="font-medium text-gray-500">Created</span>{' '}
                              {new Date(template.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:flex-nowrap lg:shrink-0 xl:gap-3">
                          <div className="inline-flex items-center gap-2 rounded-xl border border-sky-100/80 bg-sky-50/70 px-3 py-2 shrink-0">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-800/85">
                              Usage
                            </span>
                            <span className="text-base font-bold text-gray-900 tabular-nums">
                              {template.usageCount || 0}
                            </span>
                            <span className="text-xs font-medium text-gray-500">times</span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-3 lg:flex-nowrap lg:justify-end lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 xl:min-w-[72px]">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTemplate(template);
                              setShowViewModal(true);
                            }}
                            className="p-2 text-gray-600 hover:text-sky-700 hover:bg-sky-50 rounded-lg transition-all duration-200 active:scale-95"
                            title="View template"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                              />
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              gatePlanLimit('templates', 1, {
                                onBlocked: setPlanLimitModal,
                                onAllowed: () => {
                                  setCreatePrefill(templateToLocalForm(template));
                                  setShowCreateModal(true);
                                  setError('');
                                },
                              });
                            }}
                            className="p-2 text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-all duration-200 active:scale-95"
                            title="Copy template"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTemplate(template);
                              setShowDeleteModal(true);
                            }}
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 active:scale-95"
                            title="Delete template"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                {/* Pagination */}
                {pagination.pages > 1 && (
                  <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/50 px-6 py-4">
                    <button
                      type="button"
                      onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                      disabled={filters.page === 1}
                      className="px-4 py-2 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-white hover:border-sky-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98]"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                      disabled={filters.page >= pagination.pages}
                      className="px-4 py-2 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-white hover:border-sky-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98]"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          </div>
        </main>
      </div>

      <CreateLocalTemplateModal
        open={showCreateModal}
        saving={saving}
        initialForm={createPrefill}
        onClose={() => {
          setShowCreateModal(false);
          setCreatePrefill(null);
          setError('');
        }}
        onSubmit={handleSubmitLocalToMeta}
      />

      <TemplateFullViewModal
        open={showViewModal && Boolean(selectedTemplate)}
        template={selectedTemplate}
        onClose={() => {
          setShowViewModal(false);
          setSelectedTemplate(null);
        }}
        previewParts={
          selectedTemplate
            ? buildTemplatePreview(selectedTemplate, { content: selectedTemplate.content || '' })
            : null
        }
      />

      {/* Rejection Reason Modal */}
      {showRejectionModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="motion-pop bg-white rounded-2xl shadow-2xl shadow-gray-900/15 border border-gray-100/90 max-w-lg w-full ring-1 ring-black/5 overflow-hidden">
            <div className="p-5 md:p-6 border-b border-gray-100 bg-gradient-to-r from-rose-50/80 via-slate-50 to-sky-50/30 flex items-start justify-between gap-4">
              <h3 className="text-lg md:text-xl font-bold text-gray-900 tracking-tight">Template Rejection Reason</h3>
              <button
                type="button"
                onClick={() => {
                  setShowRejectionModal(false);
                  setSelectedTemplate(null);
                }}
                className="shrink-0 text-gray-400 hover:text-gray-700 rounded-xl p-2 transition-all duration-200 hover:bg-white/90 active:scale-95 ring-1 ring-transparent hover:ring-gray-200/80"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 md:p-6 space-y-4 bg-gradient-to-b from-white to-sky-50/15">
              <div className="rounded-xl border border-gray-100/90 bg-white p-4 shadow-sm ring-1 ring-gray-100/60">
                <p className="text-sm font-semibold text-gray-700 mb-1">Template</p>
                <p className="text-sm text-gray-900">{selectedTemplate.name}</p>
              </div>
              <div className="rounded-xl border border-gray-100/90 bg-white p-4 shadow-sm ring-1 ring-gray-100/60">
                <p className="text-sm font-semibold text-gray-700 mb-1">Reason</p>
                <p className="text-sm text-gray-800 whitespace-pre-wrap">
                  {selectedTemplate.rejectionReason || selectedTemplate.rejectionInfo || 'Meta did not provide a reason yet. Wait a bit and click “Sync from Meta” again.'}
                </p>
              </div>
              {selectedTemplate.rejectionRecommendation && (
                <div className="rounded-xl border border-gray-100/90 bg-white p-4 shadow-sm ring-1 ring-gray-100/60">
                  <p className="text-sm font-semibold text-gray-700 mb-1">Recommendation</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{selectedTemplate.rejectionRecommendation}</p>
                </div>
              )}
              <div className="pt-2 flex justify-end border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowRejectionModal(false);
                    setSelectedTemplate(null);
                  }}
                  className="px-5 py-2.5 rounded-xl border-2 border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition-all duration-200 active:scale-[0.98]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="motion-pop bg-white rounded-2xl shadow-2xl shadow-gray-900/15 border border-gray-100/90 max-w-md w-full ring-1 ring-black/5 overflow-hidden">
            <div className="p-5 md:p-6 border-b border-gray-100 bg-gradient-to-r from-slate-50 via-red-50/40 to-rose-50/30">
              <h3 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Delete Template</h3>
            </div>
            <div className="p-5 md:p-6 bg-gradient-to-b from-white to-sky-50/15">
              <p className="text-gray-600 mb-6 text-sm md:text-base leading-relaxed">
                Are you sure you want to delete "{selectedTemplate.name}"? This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setSelectedTemplate(null);
                  }}
                  className="px-6 py-2.5 border-2 border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-all duration-200 active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteTemplate}
                  className="px-6 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 shadow-md shadow-red-600/25 transition-all duration-200 hover:shadow-lg active:scale-[0.98]"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PlanLimitModal open={Boolean(planLimitModal)} payload={planLimitModal} onClose={() => setPlanLimitModal(null)} />
    </div>
  );
}

export default Templates;

