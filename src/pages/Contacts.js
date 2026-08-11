import { useState, useEffect, useRef } from 'react';
import BrandLogoMark from '../components/BrandLogoMark';
import { useNavigate, Link } from 'react-router-dom';
import { getProfile, isAuthenticated, logout, readSessionUser } from '../services/authService';
import { getNotifications, markAsRead, markAllAsRead } from '../services/notificationService';
import {
  getContacts,
  createContact,
  updateContact,
  deleteContact,
  optOutContact,
  optInContact,
  getContactById,
  uploadContactsCSV
} from '../services/contactService';
import { fetchTags } from '../services/tagService';
import MainSidebarNav from '../components/MainSidebarNav';
import AppShellSidebar from '../components/AppShellSidebar';
import AdminHeaderProjectSwitch from '../components/AdminHeaderProjectSwitch';
import HeaderRightActions from '../components/HeaderRightActions';
import PlanLimitModal from '../components/PlanLimitModal';
import { extractPlanLimitError, gatePlanLimit, assertCanAddResource } from '../services/planLimitService';

function Contacts() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, limit: 20 });
  const [filters, setFilters] = useState({ status: '', type: '', search: '', tag: '', page: 1 });
  const [projectTags, setProjectTags] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importModalError, setImportModalError] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showOptOutModal, setShowOptOutModal] = useState(false);
  const [selectedContact, setSelectedContact] = useState(null);
  const [formData, setFormData] = useState({
    phone: '',
    name: '',
    email: '',
    tags: '',
    country: ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [planLimitModal, setPlanLimitModal] = useState(null);
  const [success, setSuccess] = useState('');
  const [toast, setToast] = useState({ show: false, type: 'info', message: '' });
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const importMenuRef = useRef(null);
  const notificationRef = useRef(null);

  const showToast = (message, type = 'info') => {
    setToast({ show: true, type, message });
    setTimeout(() => setToast({ show: false, type: 'info', message: '' }), 3500);
  };

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

  useEffect(() => {
    fetchTags()
      .then(setProjectTags)
      .catch((e) => console.warn('[Contacts] fetchTags', e?.message || e));
  }, []);

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

  // Fetch contacts — optional override merges with current filters (e.g. after import).
  const fetchContacts = async (override = null) => {
    try {
      setLoadingContacts(true);
      const q = override != null ? { ...filters, ...override } : filters;
      const data = await getContacts({
        status: q.status,
        type: q.type,
        search: q.search,
        tag: q.tag,
        page: q.page,
        limit: q.limit ?? 20
      });
      setContacts(data.contacts || []);
      setPagination(data.pagination || { total: 0, page: 1, pages: 1, limit: 20 });
    } catch (error) {
      console.error('Error fetching contacts:', error);
      setError(error.message || 'Failed to fetch contacts');
    } finally {
      setLoadingContacts(false);
    }
  };

  useEffect(() => {
    if (!loading && isAuthenticated()) {
      fetchContacts();
    }
  }, [loading, filters]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setNotificationDropdownOpen(false);
      }
      if (importMenuRef.current && !importMenuRef.current.contains(event.target)) {
        setImportMenuOpen(false);
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

  const openImportModal = () => {
    gatePlanLimit('contacts', 1, {
      onBlocked: setPlanLimitModal,
      onAllowed: () => {
        setImportFile(null);
        setImportModalError('');
        setShowImportModal(true);
        setError('');
      },
    });
  };

  const handleImportContacts = async (e) => {
    e.preventDefault();
    setImportModalError('');
    if (!importFile) {
      return;
    }
    setImporting(true);
    try {
      const data = await uploadContactsCSV(importFile);
      const msg =
        data?.message ||
        (data?.importedCount != null
          ? `Imported ${data.importedCount} contact(s).`
          : 'Import completed.');
      showToast(msg, 'info');
      setShowImportModal(false);
      setImportFile(null);
      setFilters((prev) => ({ ...prev, status: '', type: '', search: '', tag: '', page: 1 }));
      await fetchContacts({ status: '', type: '', search: '', page: 1 });
      if (Array.isArray(data.contacts) && data.contacts.length > 0) {
        setContacts((prev) => {
          const incomingIds = new Set(data.contacts.map((c) => Number(c.id)));
          const tail = (prev || []).filter((c) => !incomingIds.has(Number(c.id)));
          return [...data.contacts, ...tail];
        });
      }
    } catch (err) {
      const limitPayload = extractPlanLimitError(err);
      if (limitPayload) {
        setPlanLimitModal(limitPayload);
        setImportModalError('');
        setShowImportModal(false);
      } else {
        setImportModalError(err?.message || 'Import failed. Try again.');
      }
    } finally {
      setImporting(false);
    }
  };

  const handleCreateContact = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const precheck = await assertCanAddResource('contacts');
      if (!precheck.allowed) {
        setPlanLimitModal(precheck);
        setError('');
        showToast(precheck.message, 'error');
        return;
      }

      const tagsArray = formData.tags ? formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
      const payload = {
        phone: formData.phone,
        name: formData.name,
        email: formData.email || null,
        tags: tagsArray,
        country: formData.country || null,
      };
      console.log('[Contacts] createContact submit', payload);
      await createContact(payload);
      setSuccess('Contact created successfully!');
      setShowCreateModal(false);
      setFormData({ phone: '', name: '', email: '', tags: '', country: '' });
      fetchContacts();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      const limitPayload = extractPlanLimitError(error);
      if (limitPayload) {
        setPlanLimitModal(limitPayload);
        setError('');
        showToast(limitPayload.message, 'error');
      } else {
        const msg = error.message || 'Failed to create contact';
        setError(msg);
        showToast(msg, 'error');
        console.error('[Contacts] createContact failed', {
          message: msg,
          error,
          formData: { phone: formData.phone, name: formData.name },
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const handleEditContact = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const tagsArray = formData.tags ? formData.tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];
      await updateContact(selectedContact.id, {
        name: formData.name,
        email: formData.email || null,
        tags: tagsArray,
        country: formData.country || null
      });
      setSuccess('Contact updated successfully!');
      setShowEditModal(false);
      setSelectedContact(null);
      fetchContacts();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError(error.message || 'Failed to update contact');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContact = async () => {
    try {
      await deleteContact(selectedContact.id);
      setSuccess('Contact deleted successfully!');
      setShowDeleteModal(false);
      setSelectedContact(null);
      fetchContacts();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError(error.message || 'Failed to delete contact');
    }
  };

  const handleOptOutContact = async () => {
    try {
      await optOutContact(selectedContact.id);
      setSuccess('Contact opted out successfully!');
      setShowOptOutModal(false);
      setSelectedContact(null);
      fetchContacts();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError(error.message || 'Failed to opt-out contact');
    }
  };

  const handleOptInContact = async (contactId) => {
    try {
      await optInContact(contactId);
      setSuccess('Contact opted in successfully!');
      setSelectedContact(null);
      fetchContacts();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError(error.message || 'Failed to opt-in contact');
    }
  };

  const openInboxChat = (contact, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!contact?.phone || !String(contact.phone).trim()) return;
    navigate('/inbox', {
      state: {
        openChatContact: {
          id: contact.id ?? null,
          phone: String(contact.phone).trim(),
          name: contact.name || '',
          email: contact.email ?? null,
          status: contact.status ?? 'active',
          whatsappOptInAt: contact.whatsappOptInAt ?? null,
        },
      },
    });
  };

  const openEditModal = async (contact) => {
    try {
      const fullContact = await getContactById(contact.id);
      setSelectedContact(fullContact);
      setFormData({
        phone: fullContact.phone || '',
        name: fullContact.name || '',
        email: fullContact.email || '',
        tags: Array.isArray(fullContact.tags) ? fullContact.tags.join(', ') : '',
        country: fullContact.country || ''
      });
      setShowEditModal(true);
    } catch (error) {
      setError(error.message || 'Failed to load contact details');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'unsubscribed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active': return 'Active';
      case 'inactive': return 'Inactive';
      case 'unsubscribed': return 'Opted Out';
      default: return status;
    }
  };

  const handlePageChange = (newPage) => {
    setFilters({ ...filters, page: newPage });
  };

  const handleTagFilter = (tagName) => {
    setFilters((prev) => ({
      ...prev,
      tag: prev.tag === tagName ? '' : tagName,
      page: 1,
    }));
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters({ ...filters, [name]: value, page: 1 });
  };

  const handleSearchChange = (e) => {
    setFilters({ ...filters, search: e.target.value, page: 1 });
  };

  const getContactInitials = (name, phone) => {
    const n = String(name || '').trim();
    if (n) {
      const parts = n.split(/\s+/).filter(Boolean);
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return n.slice(0, 2).toUpperCase();
    }
    const p = String(phone || '').replace(/\D/g, '');
    return p.length >= 2 ? p.slice(-2) : '?';
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
      {toast.show && (
        <div className="fixed top-5 right-5 z-[9999] motion-pop">
          <div
            className={`rounded-xl border px-4 py-3 shadow-xl backdrop-blur-sm max-w-sm ${
              toast.type === 'warning'
                ? 'bg-amber-50/95 border-amber-200 text-amber-800'
                : toast.type === 'success'
                  ? 'bg-green-50/95 border-green-200 text-green-800'
                  : 'bg-sky-50/95 border-sky-200 text-sky-800'
            }`}
          >
            <p className="text-sm font-medium">{toast.message}</p>
          </div>
        </div>
      )}
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-4 min-w-0">
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

          <Link to="/dashboard" className="flex items-center gap-3 transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] shrink-0"><BrandLogoMark size="md" />
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent hidden sm:block">
              Waabizx
            </h1>
          </Link>

          <span className="text-gray-300 hidden md:block shrink-0">|</span>
          <h2 className="text-lg font-semibold text-sky-700 hidden md:block tracking-tight">Contacts</h2>
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
                            !notification.is_read ? 'bg-blue-50 border-blue-500' : 'bg-white border-transparent'
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
          <div className="relative isolate p-4 md:p-8 lg:p-10 max-w-[1600px] mx-auto">
          <div className="pointer-events-none absolute inset-0 overflow-hidden -z-10" aria-hidden>
            <div className="absolute -top-28 -right-20 w-[22rem] h-[22rem] bg-sky-400/30 motion-page-blob" />
            <div className="absolute -bottom-36 -left-24 w-[20rem] h-[20rem] bg-blue-400/25 motion-page-blob motion-page-blob--b" />
          </div>
          <div className="relative z-0">
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

          <div className="motion-enter mb-6 md:mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between relative z-30 overflow-visible">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 tracking-tight">Contacts</h2>
              <p className="text-gray-600 text-sm md:text-base">Manage your WhatsApp contacts</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 relative z-30">
              <div ref={importMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setImportMenuOpen((open) => !open)}
                  className="inline-flex items-center gap-2 px-5 py-3 sm:px-6 rounded-xl font-semibold border-2 border-sky-200/90 bg-white text-sky-800 shadow-sm shadow-sky-900/5 hover:bg-sky-50/80 hover:border-sky-300 hover:shadow-md transition-all duration-300"
                  aria-expanded={importMenuOpen}
                  aria-haspopup="menu"
                >
                  <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Import
                  <svg className={`w-4 h-4 transition-transform ${importMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {importMenuOpen && (
                  <ul
                    className="absolute right-0 top-full z-[250] mt-2 min-w-[12.5rem] rounded-xl border border-gray-200 bg-white py-1 shadow-2xl shadow-gray-900/15 ring-1 ring-black/5"
                    role="menu"
                  >
                    <li role="none">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setImportMenuOpen(false);
                          openImportModal();
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-sky-50"
                      >
                        Import contacts
                      </button>
                    </li>
                    <li role="none">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setImportMenuOpen(false);
                          navigate('/campaigns/create');
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm font-medium text-gray-800 hover:bg-sky-50"
                      >
                        Broadcast
                      </button>
                    </li>
                  </ul>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  gatePlanLimit('contacts', 1, {
                    onBlocked: setPlanLimitModal,
                    onAllowed: () => {
                      setFormData({ phone: '', name: '', email: '', tags: '', country: '' });
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
                <span className="relative">Add Contact</span>
              </button>
            </div>
          </div>

          <div className="motion-enter motion-delay-1 bg-white rounded-2xl shadow-lg shadow-gray-200/40 border border-gray-100/90 p-4 md:p-5 mb-6 md:mb-8 ring-1 ring-gray-100/80 motion-hover-lift hover:shadow-xl">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
                <input
                  type="text"
                  name="search"
                  value={filters.search}
                  onChange={handleSearchChange}
                  placeholder="Search by name, phone, or email..."
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none bg-gray-50/80 hover:bg-white transition-all shadow-sm text-sm"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  name="status"
                  value={filters.status}
                  onChange={handleFilterChange}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none bg-gray-50/80 hover:bg-white transition-all cursor-pointer text-sm font-medium text-gray-700 shadow-sm"
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="unsubscribed">Opted Out</option>
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                <select
                  name="type"
                  value={filters.type}
                  onChange={handleFilterChange}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none bg-gray-50/80 hover:bg-white transition-all cursor-pointer text-sm font-medium text-gray-700 shadow-sm"
                >
                  <option value="">All</option>
                  <option value="opted_in">Opted-in</option>
                  <option value="not_opted_in">Not opted-in</option>
                </select>
              </div>
            </div>
            {projectTags.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-2">Filter by tag</label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setFilters((prev) => ({ ...prev, tag: '', page: 1 }))}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                      !filters.tag
                        ? 'bg-sky-600 text-white border-sky-600'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-sky-300'
                    }`}
                  >
                    All
                  </button>
                  {projectTags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => handleTagFilter(tag.name)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                        filters.tag === tag.name
                          ? 'text-white border-transparent'
                          : 'bg-white text-gray-700 border-gray-200 hover:border-sky-300'
                      }`}
                      style={
                        filters.tag === tag.name
                          ? { backgroundColor: tag.color || '#3B82F6' }
                          : undefined
                      }
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="motion-enter motion-delay-2">
            {loadingContacts ? (
              <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100/90 shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 p-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-2 border-sky-200 border-t-sky-600 mx-auto" />
                <p className="mt-4 text-gray-600">Loading contacts...</p>
              </div>
            ) : contacts.length === 0 ? (
              <div className="rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-100/90 shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 p-12 text-center motion-enter">
                <svg className="w-16 h-16 text-sky-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="text-gray-600 mb-4">No contacts found</p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => openImportModal()}
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl border-2 border-sky-200 bg-white text-sky-800 font-medium hover:bg-sky-50 transition-all duration-300 shadow-sm"
                  >
                    <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Import CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      gatePlanLimit('contacts', 1, {
                        onBlocked: setPlanLimitModal,
                        onAllowed: () => {
                          setFormData({ phone: '', name: '', email: '', tags: '', country: '' });
                          setShowCreateModal(true);
                        },
                      });
                    }}
                    className="bg-sky-600 text-white px-6 py-2.5 rounded-xl hover:bg-sky-700 transition-all duration-300 shadow-md shadow-sky-600/25 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] font-medium"
                  >
                    Add Your First Contact
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100/90 overflow-hidden ring-1 ring-gray-100/80">
                  <div className="p-4 md:p-6 space-y-3 md:space-y-4">
                    {contacts.map((contact) => (
                      <article
                        key={contact.id}
                        className="group relative flex min-h-0 flex-row rounded-2xl border border-gray-100/90 bg-white shadow-sm shadow-gray-200/40 ring-1 ring-gray-100/80 overflow-hidden motion-hover-lift hover:shadow-xl hover:border-sky-100/90 transition-all duration-300"
                      >
                        <div
                          className="w-1.5 shrink-0 self-stretch bg-gradient-to-b from-sky-400 via-sky-500 to-blue-600 opacity-95"
                          aria-hidden
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-4 lg:flex-row lg:items-center lg:gap-5 xl:gap-6">
                          <div
                            role="button"
                            tabIndex={0}
                            className="min-w-0 flex-1 lg:max-w-md xl:max-w-lg text-left cursor-pointer rounded-xl -m-1 p-1 transition hover:bg-sky-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 focus-visible:ring-offset-2"
                            onClick={() => openInboxChat(contact)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openInboxChat(contact);
                              }
                            }}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 text-white font-bold text-xs flex items-center justify-center shadow-md shadow-sky-500/30 ring-2 ring-white">
                                {getContactInitials(contact.name, contact.phone)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 gap-y-1">
                                  <h3 className="text-base font-semibold text-gray-900 leading-snug line-clamp-2 min-w-0">
                                    {contact.name || 'N/A'}
                                  </h3>
                                  <span className={`shrink-0 px-2.5 py-0.5 text-xs font-semibold rounded-full ${getStatusColor(contact.status)}`}>
                                    {getStatusLabel(contact.status)}
                                  </span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1 line-clamp-2 break-all">
                                  {contact.phone}
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2 text-xs text-gray-600">
                              <span>
                                <span className="font-medium text-gray-500">Email</span>{' '}
                                {contact.email || 'N/A'}
                              </span>
                              <span className="text-gray-300" aria-hidden>
                                |
                              </span>
                              <span>
                                <span className="font-medium text-gray-500">Country</span>{' '}
                                {contact.country || 'N/A'}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {Array.isArray(contact.tags) && contact.tags.length > 0 ? (
                                contact.tags.map((tag, idx) => (
                                  <span key={idx} className="px-2 py-0.5 bg-sky-50 text-sky-800 text-xs font-medium rounded-lg border border-sky-100/80">
                                    {tag}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-gray-400">No tags</span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-3 lg:flex-nowrap lg:justify-end lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 xl:min-w-[190px]">
                            {(() => {
                              const optedOut = contact.status === 'unsubscribed' || !contact.whatsappOptInAt;
                              if (optedOut) {
                                return (
                                  <button
                                    type="button"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      handleOptInContact(contact.id);
                                    }}
                                    className="px-3 py-1.5 bg-sky-600 text-white text-xs font-medium rounded-lg hover:bg-sky-700 transition-all duration-200 active:scale-95 shadow-sm hover:shadow"
                                    title="Opt-in"
                                  >
                                    Opt-in
                                  </button>
                                );
                              }

                              return (
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    setSelectedContact(contact);
                                    setShowOptOutModal(true);
                                  }}
                                  className="px-3 py-1.5 bg-orange-600 text-white text-xs font-medium rounded-lg hover:bg-orange-700 transition-all duration-200 active:scale-95 shadow-sm hover:shadow"
                                  title="Opt-out"
                                >
                                  Opt-out
                                </button>
                              );
                            })()}
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                openEditModal(contact);
                              }}
                              className="p-2 text-gray-600 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-all duration-200 active:scale-95"
                              title="Edit"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                setSelectedContact(contact);
                                setShowDeleteModal(true);
                              }}
                              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 active:scale-95"
                              title="Delete"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                {pagination.pages > 1 && (
                  <div className="mt-6 md:mt-8 rounded-2xl border border-gray-100/90 bg-white/90 backdrop-blur-sm px-4 py-4 md:px-6 shadow-md shadow-gray-200/30 ring-1 ring-gray-100/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="text-sm text-gray-700">
                      Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} contacts
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handlePageChange(filters.page - 1)}
                        disabled={filters.page === 1}
                        className="px-4 py-2 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-white hover:border-sky-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98]"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePageChange(filters.page + 1)}
                        disabled={filters.page >= pagination.pages}
                        className="px-4 py-2 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-white hover:border-sky-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98]"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          </div>
          </div>
        </main>
      </div>

      {/* Create Contact Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="motion-pop w-full max-w-lg max-h-[92vh] overflow-hidden rounded-2xl shadow-2xl shadow-sky-900/20 border border-white/20 ring-1 ring-black/5 flex flex-col bg-white">
            <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-sky-600 via-sky-500 to-blue-700 text-white px-6 pt-7 pb-8 md:px-8 md:pt-8 md:pb-10">
              <div className="pointer-events-none absolute -right-16 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" aria-hidden />
              <div className="pointer-events-none absolute -bottom-20 -left-10 h-36 w-36 rounded-full bg-blue-900/30 blur-2xl" aria-hidden />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="shrink-0 w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center shadow-lg">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <h3 className="text-xl md:text-2xl font-bold tracking-tight">Add new contact</h3>
                    <p className="mt-1 text-sm text-sky-100/95 leading-snug">
                      Save a WhatsApp number and details for campaigns and inbox.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormData({ phone: '', name: '', email: '', tags: '', country: '' });
                    setError('');
                  }}
                  className="shrink-0 rounded-xl p-2 text-white/90 hover:text-white hover:bg-white/15 transition-all duration-200 active:scale-95"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateContact} className="flex flex-col flex-1 min-h-0 overflow-y-auto bg-gradient-to-b from-gray-50/80 via-white to-sky-50/25">
              <div className="p-5 md:p-6 space-y-5">
                <div className="rounded-2xl border-2 border-sky-100/90 bg-white p-4 md:p-5 shadow-sm ring-1 ring-sky-50/80 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-sky-600/90">Required</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-1">
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </span>
                        Phone number *
                      </label>
                      <input
                        type="text"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        required
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50/80 hover:bg-white focus:ring-2 focus:ring-sky-400/50 focus:border-sky-500 outline-none transition-all text-sm shadow-inner shadow-gray-100/50"
                        placeholder="e.g., 919999999999"
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                        </span>
                        Name *
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50/80 hover:bg-white focus:ring-2 focus:ring-sky-400/50 focus:border-sky-500 outline-none transition-all text-sm shadow-inner shadow-gray-100/50"
                        placeholder="Enter contact name"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200/90 bg-white p-4 md:p-5 shadow-sm ring-1 ring-gray-100/70 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Optional</p>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </span>
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50/80 hover:bg-white focus:ring-2 focus:ring-sky-400/50 focus:border-sky-500 outline-none transition-all text-sm"
                      placeholder="Enter email address"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-800 mb-2">Tags</label>
                      <input
                        type="text"
                        value={formData.tags}
                        onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50/80 hover:bg-white focus:ring-2 focus:ring-sky-400/50 focus:border-sky-500 outline-none transition-all text-sm"
                        placeholder="e.g., customer, vip (comma separated)"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-800 mb-2">Country</label>
                      <input
                        type="text"
                        value={formData.country}
                        onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl bg-gray-50/80 hover:bg-white focus:ring-2 focus:ring-sky-400/50 focus:border-sky-500 outline-none transition-all text-sm"
                        placeholder="Enter country"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-auto sticky bottom-0 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 px-5 py-4 md:px-6 md:py-5 border-t border-gray-200/80 bg-white/95 backdrop-blur-md">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormData({ phone: '', name: '', email: '', tags: '', country: '' });
                    setError('');
                  }}
                  className="w-full sm:w-auto px-6 py-3 border-2 border-gray-200 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-all duration-200 active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="group relative w-full sm:w-auto overflow-hidden px-6 py-3 rounded-xl font-semibold text-white shadow-lg shadow-sky-600/35 transition-all duration-300 hover:shadow-xl hover:shadow-sky-500/40 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 bg-gradient-to-r from-sky-600 via-sky-500 to-blue-600"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" aria-hidden />
                  <span className="relative flex items-center justify-center gap-2">
                    {saving ? (
                      <>
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Create Contact
                      </>
                    )}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import contacts (CSV) */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="motion-pop w-full max-w-lg max-h-[92vh] overflow-hidden rounded-2xl shadow-2xl shadow-sky-900/20 border border-white/20 ring-1 ring-black/5 flex flex-col bg-white">
            <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-emerald-600 via-sky-600 to-blue-700 text-white px-6 pt-7 pb-8 md:px-8 md:pt-8 md:pb-10">
              <div className="pointer-events-none absolute -right-16 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" aria-hidden />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 min-w-0">
                  <div className="shrink-0 w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center shadow-lg">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <h3 className="text-xl md:text-2xl font-bold tracking-tight">Import contacts</h3>
                    <p className="mt-1 text-sm text-white/90 leading-snug">
                      Upload a file (CSV, text, or similar). Rows are saved to this project; the list refreshes right away.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!importing) {
                      setShowImportModal(false);
                      setImportFile(null);
                      setImportModalError('');
                    }
                  }}
                  className="shrink-0 rounded-xl p-2 text-white/90 hover:text-white hover:bg-white/15 transition-all duration-200 active:scale-95 disabled:opacity-50"
                  aria-label="Close"
                  disabled={importing}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <form onSubmit={handleImportContacts} className="flex flex-col flex-1 min-h-0 overflow-y-auto bg-gradient-to-b from-gray-50/80 via-white to-sky-50/25">
              <div className="p-5 md:p-6 space-y-5">
                {importModalError && (
                  <div className="rounded-xl border border-red-200/90 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {importModalError}
                  </div>
                )}
                <div className="rounded-2xl border-2 border-sky-100/90 bg-white p-4 md:p-5 shadow-sm ring-1 ring-sky-50/80 space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-sky-600/90">File tips</p>
                  <p className="text-sm text-gray-600">
                    Tabular files are read row-by-row. If there is no dedicated phone column, the first non-empty cell in each row is used when possible; otherwise a unique reference is generated so every row can be stored. Extra columns are kept as custom fields.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Choose file</label>
                  <input
                    type="file"
                    disabled={importing}
                    onChange={(ev) => {
                      const f = ev.target.files?.[0];
                      setImportFile(f || null);
                      setImportModalError('');
                    }}
                    className="block w-full text-sm text-gray-600 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-sky-600 file:text-white hover:file:bg-sky-700 file:cursor-pointer cursor-pointer"
                  />
                  {importFile && (
                    <p className="mt-2 text-xs text-gray-500">
                      Selected: <span className="font-medium text-gray-700">{importFile.name}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-auto sticky bottom-0 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 px-5 py-4 md:px-6 md:py-5 border-t border-gray-200/80 bg-white/95 backdrop-blur-md">
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => {
                    setShowImportModal(false);
                    setImportFile(null);
                    setImportModalError('');
                  }}
                  className="w-full sm:w-auto px-6 py-3 border-2 border-gray-200 rounded-xl text-gray-700 font-semibold hover:bg-gray-50 transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importing}
                  className="group relative w-full sm:w-auto overflow-hidden px-6 py-3 rounded-xl font-semibold text-white shadow-lg shadow-sky-600/35 transition-all duration-300 hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-emerald-600 via-sky-600 to-blue-600"
                >
                  <span className="relative flex items-center justify-center gap-2">
                    {importing ? (
                      <>
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Importing…
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        Import
                      </>
                    )}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Contact Modal */}
      {showEditModal && selectedContact && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="motion-pop bg-white rounded-2xl shadow-2xl shadow-gray-900/15 border border-gray-100/90 max-w-2xl w-full max-h-[90vh] overflow-y-auto ring-1 ring-black/5">
            <div className="p-5 md:p-6 border-b border-gray-100 bg-gradient-to-r from-slate-50 via-sky-50/50 to-sky-50/30">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Edit Contact</h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedContact(null);
                    setFormData({ phone: '', name: '', email: '', tags: '', country: '' });
                    setError('');
                  }}
                  className="shrink-0 text-gray-400 hover:text-gray-700 rounded-xl p-2 transition-all duration-200 hover:bg-white/90 active:scale-95 ring-1 ring-transparent hover:ring-gray-200/80"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <form onSubmit={handleEditContact} className="p-5 md:p-6 space-y-5 bg-gradient-to-b from-white to-sky-50/20">
              <div className="rounded-2xl border border-gray-100/90 bg-white p-4 md:p-5 shadow-sm ring-1 ring-gray-100/70 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Phone Number</label>
                  <input
                    type="text"
                    value={formData.phone}
                    disabled
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl bg-gray-100/80 text-gray-500 cursor-not-allowed text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-1.5">Phone number cannot be changed</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl bg-gray-50/70 hover:bg-white focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none transition-all shadow-sm text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl bg-gray-50/70 hover:bg-white focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none transition-all shadow-sm text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-2">Tags</label>
                    <input
                      type="text"
                      value={formData.tags}
                      onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl bg-gray-50/70 hover:bg-white focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none transition-all shadow-sm text-sm"
                      placeholder="e.g., customer, vip (comma separated)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-2">Country</label>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl bg-gray-50/70 hover:bg-white focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none transition-all shadow-sm text-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedContact(null);
                    setFormData({ phone: '', name: '', email: '', tags: '', country: '' });
                    setError('');
                  }}
                  className="px-6 py-2.5 border-2 border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-all duration-200 active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-sky-600 text-white rounded-xl font-semibold hover:bg-sky-700 shadow-md shadow-sky-600/25 transition-all duration-200 hover:shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                >
                  {saving ? 'Updating...' : 'Update Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedContact && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="motion-pop bg-white rounded-2xl shadow-2xl shadow-gray-900/15 border border-gray-100/90 max-w-md w-full ring-1 ring-black/5 overflow-hidden">
            <div className="p-5 md:p-6 border-b border-gray-100 bg-gradient-to-r from-slate-50 via-red-50/40 to-rose-50/30">
              <h3 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Delete Contact</h3>
            </div>
            <div className="p-5 md:p-6 bg-gradient-to-b from-white to-sky-50/15">
              <p className="text-gray-600 mb-6 text-sm md:text-base leading-relaxed">
                Are you sure you want to delete "{selectedContact.name || selectedContact.phone}"? This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setSelectedContact(null);
                  }}
                  className="px-6 py-2.5 border-2 border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-all duration-200 active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteContact}
                  className="px-6 py-2.5 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 shadow-md shadow-red-600/25 transition-all duration-200 hover:shadow-lg active:scale-[0.98]"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Opt-out Confirmation Modal */}
      {showOptOutModal && selectedContact && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="motion-pop bg-white rounded-2xl shadow-2xl shadow-gray-900/15 border border-gray-100/90 max-w-md w-full ring-1 ring-black/5 overflow-hidden">
            <div className="p-5 md:p-6 border-b border-gray-100 bg-gradient-to-r from-slate-50 via-amber-50/50 to-orange-50/35">
              <h3 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Opt-out Contact</h3>
            </div>
            <div className="p-5 md:p-6 bg-gradient-to-b from-white to-amber-50/15">
              <p className="text-gray-600 mb-6 text-sm md:text-base leading-relaxed">
                Are you sure you want to opt-out/block "{selectedContact.name || selectedContact.phone}"? They will no longer receive messages from you.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => {
                    setShowOptOutModal(false);
                    setSelectedContact(null);
                  }}
                  className="px-6 py-2.5 border-2 border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-all duration-200 active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleOptOutContact}
                  className="px-6 py-2.5 bg-orange-600 text-white rounded-xl font-semibold hover:bg-orange-700 shadow-md shadow-orange-600/25 transition-all duration-200 hover:shadow-lg active:scale-[0.98]"
                >
                  Opt-out
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

export default Contacts;

