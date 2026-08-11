import { useState, useEffect, useRef } from 'react';
import BrandLogoMark from '../components/BrandLogoMark';
import { useNavigate, Link } from 'react-router-dom';
import { getProfile, isAuthenticated, logout, readSessionUser } from '../services/authService';
import { getNotifications, markAsRead, markAllAsRead } from '../services/notificationService';
import {
  getCampaigns,
  createCampaign,
  deleteCampaign,
  startCampaign,
  pauseCampaign,
  resumeCampaign,
  getCampaignById,
  getCampaignAudience
} from '../services/campaignService';
import MainSidebarNav from '../components/MainSidebarNav';
import AppShellSidebar from '../components/AppShellSidebar';
import AdminHeaderProjectSwitch from '../components/AdminHeaderProjectSwitch';
import HeaderRightActions from '../components/HeaderRightActions';
import { uploadCSV } from '../services/broadcastService';
import {
  estimateCampaignMessageCost,
  formatInr,
  getBillingCategoryLabel,
  getMessageRateForBillingCategory,
} from '../utils/planPricing';
import PlanLimitModal from '../components/PlanLimitModal';
import { extractPlanLimitError, assertCanAddResource } from '../services/planLimitService';
// Campaign creation now uses parse-only CSV upload (no heavy contact loading)

function Campaigns() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [campaigns, setCampaigns] = useState([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1, limit: 10 });
  const [filters, setFilters] = useState({ status: '', type: '', page: 1 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showAudienceModal, setShowAudienceModal] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [campaignDetails, setCampaignDetails] = useState(null);
  const [audienceLogs, setAudienceLogs] = useState([]);
  const [loadingAudience, setLoadingAudience] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    template_name: '',
    template_language: 'en_US',
    schedule_time: null,
    audience: [{ phone: '', var1: '', var2: '', var3: '', var4: '', var5: '' }]
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [planLimitModal, setPlanLimitModal] = useState(null);
  const [loadingCSV, setLoadingCSV] = useState(false);
  // uploadContactsResult removed (no contacts upload in campaign modal)
  const notificationRef = useRef(null);
  const csvInputRef = useRef(null);
  // contactsCsvInputRef removed

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

  // Fetch campaigns
  const fetchCampaigns = async () => {
    try {
      setLoadingCampaigns(true);
      const result = await getCampaigns(filters);
      setCampaigns(result.campaigns || []);
      setPagination(result.pagination || {});
    } catch (error) {
      console.error('Error fetching campaigns:', error);
      setError('Failed to load campaigns');
    } finally {
      setLoadingCampaigns(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated()) {
      fetchCampaigns();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Keep campaign stats (delivered/read) fresh while page is open.
  useEffect(() => {
    if (!isAuthenticated()) return undefined;
    const interval = setInterval(() => {
      fetchCampaigns();
    }, 7000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.type, filters.page]);

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

  // kept uploadContactsCSV import for other pages; campaign creation uses parse-only CSV upload

  // Campaign handlers
  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);

    try {
      const precheck = await assertCanAddResource('campaigns');
      if (!precheck.allowed) {
        setPlanLimitModal(precheck);
        setError('');
        return;
      }

      const validAudience = formData.audience.filter(a => a.phone && a.phone.trim() !== '');
      if (validAudience.length === 0) {
        setError('Upload CSV (or add at least one row manually) to create a campaign.');
        setSaving(false);
        return;
      }

      await createCampaign({
        name: formData.name,
        template_name: formData.template_name,
        template_language: formData.template_language,
        schedule_time: formData.schedule_time || null,
        audience: validAudience.map(a => ({
          phone: a.phone.trim(),
          var1: a.var1 || null,
          var2: a.var2 || null,
          var3: a.var3 || null,
          var4: a.var4 || null,
          var5: a.var5 || null
        }))
      });
      setSuccess('Campaign created successfully!');
      setShowCreateModal(false);
      setFormData({
        name: '',
        template_name: '',
        template_language: 'en_US',
        schedule_time: null,
        audience: [{ phone: '', var1: '', var2: '', var3: '', var4: '', var5: '' }]
      });
      fetchCampaigns();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      const limitPayload = extractPlanLimitError(error);
      if (limitPayload) {
        setPlanLimitModal(limitPayload);
        setError('');
      } else {
        setError(error.message || 'Failed to create campaign');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCampaign = async () => {
    try {
      await deleteCampaign(selectedCampaign.id);
      setSuccess('Campaign deleted successfully!');
      setShowDeleteModal(false);
      setSelectedCampaign(null);
      fetchCampaigns();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError(error.message || 'Failed to delete campaign');
    }
  };

  const handleStartCampaign = async (campaignId) => {
    try {
      await startCampaign(campaignId);
      setSuccess('Campaign started successfully!');
      fetchCampaigns();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError(error.message || 'Failed to start campaign');
    }
  };

  const handlePauseCampaign = async (campaignId) => {
    try {
      await pauseCampaign(campaignId);
      setSuccess('Campaign paused successfully!');
      fetchCampaigns();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError(error.message || 'Failed to pause campaign');
    }
  };

  const handleResumeCampaign = async (campaignId) => {
    try {
      await resumeCampaign(campaignId);
      setSuccess('Campaign resumed successfully!');
      fetchCampaigns();
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      setError(error.message || 'Failed to resume campaign');
    }
  };

  const handleViewDetails = async (campaign) => {
    try {
      const details = await getCampaignById(campaign.id);
      // Backend returns { id, name, status, stats: { total, sent, delivered, read, failed } }
      // Map it to include all fields for display
      const sentCount = details.stats?.sent || details.sent || campaign.sent || 0;
      const billingCategory =
        details.template_billing_category ||
        campaign.template_billing_category ||
        'marketing';
      const ratePerMessage =
        details.rate_per_message != null
          ? Number(details.rate_per_message)
          : getMessageRateForBillingCategory(billingCategory);
      const totalCreditUsage =
        details.totalCreditUsage ??
        campaign.totalCreditUsage ??
        estimateCampaignMessageCost(sentCount, billingCategory);

      const campaignData = {
        ...details,
        id: details.id || campaign.id,
        name: details.name || campaign.name,
        status: details.status || campaign.status,
        template_name: details.template_name || campaign.template_name,
        template_language: details.template_language || campaign.template_language,
        template_billing_category: billingCategory,
        template_category_label:
          details.template_category_label || getBillingCategoryLabel(billingCategory),
        rate_per_message: ratePerMessage,
        createdAt: details.createdAt || campaign.createdAt,
        updatedAt: details.updatedAt || campaign.updatedAt,
        total: details.stats?.total || details.total || campaign.total || 0,
        sent: sentCount,
        delivered: details.stats?.delivered || details.delivered || campaign.delivered || 0,
        read: details.stats?.read || details.read || campaign.read || 0,
        failed: details.stats?.failed || details.failed || campaign.failed || 0,
        audience:
          details.audience ??
          campaign.totalRecipients ??
          campaign.total ??
          0,
        totalCreditUsage,
        stats: details.stats || {
          total: details.total || campaign.total || 0,
          sent: details.sent || campaign.sent || 0,
          delivered: details.delivered || campaign.delivered || 0,
          read: details.read || campaign.read || 0,
          failed: details.failed || campaign.failed || 0
        }
      };
      setCampaignDetails(campaignData);
      setShowDetailsModal(true);
    } catch (error) {
      setError(error.message || 'Failed to load campaign details');
    }
  };

  const handleViewAudience = async (campaign) => {
    try {
      setLoadingAudience(true);
      const audience = await getCampaignAudience(campaign.id);
      setAudienceLogs(audience);
      setSelectedCampaign(campaign);
      setShowAudienceModal(true);
    } catch (error) {
      setError(error.message || 'Failed to load audience logs');
    } finally {
      setLoadingAudience(false);
    }
  };

  const addAudienceMember = () => {
    setFormData({
      ...formData,
      audience: [...formData.audience, { phone: '', var1: '', var2: '', var3: '', var4: '', var5: '' }]
    });
  };

  const removeAudienceMember = (index) => {
    const newAudience = formData.audience.filter((_, i) => i !== index);
    setFormData({ ...formData, audience: newAudience });
  };

  const updateAudienceMember = (index, field, value) => {
    const newAudience = [...formData.audience];
    newAudience[index] = { ...newAudience[index], [field]: value };
    setFormData({ ...formData, audience: newAudience });
  };

  // Handle CSV upload for audience (same as Broadcast)
  const handleCSVUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingCSV(true);
    setError('');
    try {
      const result = await uploadCSV(file);
      const rows = result.data || [];
      const columns = result.columns || [];
      const phoneCol = columns.find(c => /phone/i.test(c)) || columns[0];
      const varCols = columns.filter(c => c !== phoneCol);
      const audience = rows.map(row => {
        const member = {
          phone: row.phone || row[phoneCol] || '',
          var1: '', var2: '', var3: '', var4: '', var5: ''
        };
        varCols.slice(0, 5).forEach((col, i) => {
          member[`var${i + 1}`] = row[col] != null ? String(row[col]) : '';
        });
        return member;
      });
      setFormData(prev => ({ ...prev, audience }));
      setSuccess(`CSV uploaded: ${audience.length} recipients added`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to upload CSV');
    } finally {
      setLoadingCSV(false);
      e.target.value = '';
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toUpperCase()) {
      case 'PROCESSING':
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'COMPLETED': return 'bg-sky-100 text-sky-800';
      case 'SCHEDULED':
      case 'PENDING': return 'bg-yellow-100 text-yellow-800';
      case 'PAUSED': return 'bg-orange-100 text-orange-800';
      case 'DRAFT': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'broadcast': return 'Broadcast';
      case 'automation': return 'Automation';
      case 'sequence': return 'Sequence';
      default: return type;
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
      {/* Top Navigation Bar */}
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-4">
          <button
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
          <h2 className="text-lg font-semibold text-sky-700 hidden md:block tracking-tight">Campaigns</h2>
          <AdminHeaderProjectSwitch />
        </div>

        <HeaderRightActions>
          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button
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
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
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
                          onClick={() => handleNotificationClick(notification)}
                          className={`w-full px-4 py-3 text-left hover:bg-gray-50 transition border-l-4 ${
                            !notification.is_read 
                              ? 'bg-blue-50 border-blue-500' 
                              : 'bg-white border-transparent'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                              notification.type === 'campaign' ? 'bg-blue-100' :
                              notification.type === 'template' ? 'bg-green-100' :
                              notification.type === 'message' ? 'bg-purple-100' :
                              'bg-gray-100'
                            }`}>
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
                                  <p className={`text-sm font-medium ${
                                    !notification.is_read ? 'text-gray-900' : 'text-gray-700'
                                  }`}>
                                    {notification.title}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                    {notification.body}
                                  </p>
                                </div>
                                {!notification.is_read && (
                                  <div className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full mt-1"></div>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-1">
                                {formatTime(notification.created_at)}
                              </p>
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

          <div className="motion-enter mb-6 md:mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 tracking-tight">Campaigns</h2>
            <p className="text-gray-600 text-sm md:text-base">Manage and track your WhatsApp campaigns</p>
          </div>

          {/* Filters */}
          <div className="motion-enter motion-delay-1 bg-white rounded-2xl shadow-lg shadow-gray-200/40 border border-gray-100/90 p-4 md:p-5 mb-6 md:mb-8 ring-1 ring-gray-100/80 motion-hover-lift hover:shadow-xl">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none bg-gray-50/80 hover:bg-white transition-all cursor-pointer text-sm font-medium text-gray-700 shadow-sm"
                >
                  <option value="">All Status</option>
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-2">Type</label>
                <select
                  value={filters.type}
                  onChange={(e) => setFilters({ ...filters, type: e.target.value, page: 1 })}
                  className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none bg-gray-50/80 hover:bg-white transition-all cursor-pointer text-sm font-medium text-gray-700 shadow-sm"
                >
                  <option value="">All Types</option>
                  <option value="broadcast">Broadcast</option>
                  <option value="automation">Automation</option>
                  <option value="sequence">Sequence</option>
                </select>
              </div>
            </div>
          </div>

          {/* Campaigns List */}
          <div className="motion-enter motion-delay-2 bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100/90 overflow-hidden ring-1 ring-gray-100/80">
            {loadingCampaigns ? (
              <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-2 border-sky-200 border-t-sky-600 mx-auto" />
                <p className="mt-4 text-gray-600">Loading campaigns...</p>
              </div>
            ) : campaigns.length === 0 ? (
              <div className="p-12 text-center motion-enter">
                <svg className="w-16 h-16 text-sky-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
                <p className="text-gray-600">No campaigns found. Start a broadcast from Contacts → Import → Broadcast.</p>
              </div>
            ) : (
              <>
                <div className="p-4 md:p-6 space-y-3 md:space-y-4">
                  {campaigns.map((campaign) => (
                    <article
                      key={campaign.id}
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
                              {campaign.name}
                            </h3>
                            <span
                              className={`shrink-0 px-2.5 py-0.5 text-xs font-semibold rounded-full ${getStatusColor(campaign.status)}`}
                            >
                              {campaign.status}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                            {campaign.description || 'No description'}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-2 text-xs text-gray-600">
                            <span>
                              <span className="font-medium text-gray-500">Type</span>{' '}
                              {getTypeLabel(campaign.type)}
                            </span>
                            <span className="text-gray-300" aria-hidden>
                              |
                            </span>
                            <span>
                              <span className="font-medium text-gray-500">Created</span>{' '}
                              {new Date(campaign.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:flex-nowrap lg:shrink-0 xl:gap-3">
                          <div className="inline-flex items-center gap-2 rounded-xl border border-sky-100/80 bg-sky-50/70 px-3 py-2 shrink-0">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-800/85">
                              Recipients
                            </span>
                            <span className="text-base font-bold text-gray-900 tabular-nums">
                              {campaign.total || campaign.totalRecipients || 0}
                            </span>
                          </div>
                          <div className="flex flex-1 flex-wrap items-stretch gap-1.5 sm:min-w-[min(100%,280px)] lg:min-w-0">
                            <div className="flex min-h-[2.75rem] min-w-[4.25rem] flex-1 flex-col justify-center rounded-lg border border-gray-100 bg-gray-50/90 px-2 py-1 sm:flex-none sm:min-w-[4.5rem]">
                              <span className="text-[9px] font-medium uppercase text-gray-500">Sent</span>
                              <span className="text-sm font-semibold tabular-nums text-gray-900">
                                {parseInt(campaign.sent, 10) || 0}
                              </span>
                            </div>
                            <div className="flex min-h-[2.75rem] min-w-[4.25rem] flex-1 flex-col justify-center rounded-lg border border-gray-100 bg-gray-50/90 px-2 py-1 sm:flex-none sm:min-w-[4.5rem]">
                              <span className="text-[8px] font-medium uppercase leading-tight text-gray-500 sm:text-[9px]">
                                Delivered
                              </span>
                              <span className="text-sm font-semibold tabular-nums text-gray-900">
                                {parseInt(campaign.delivered, 10) || 0}
                              </span>
                            </div>
                            <div className="flex min-h-[2.75rem] min-w-[4.25rem] flex-1 flex-col justify-center rounded-lg border border-gray-100 bg-gray-50/90 px-2 py-1 sm:flex-none sm:min-w-[4.5rem]">
                              <span className="text-[9px] font-medium uppercase text-gray-500">Read</span>
                              <span className="text-sm font-semibold tabular-nums text-gray-700">
                                {parseInt(campaign.read, 10) || 0}
                              </span>
                            </div>
                            <div className="flex min-h-[2.75rem] min-w-[4.25rem] flex-1 flex-col justify-center rounded-lg border border-red-100/80 bg-red-50/80 px-2 py-1 sm:flex-none sm:min-w-[4.5rem]">
                              <span className="text-[9px] font-medium uppercase text-red-600/90">Failed</span>
                              <span className="text-sm font-semibold tabular-nums text-red-600">
                                {parseInt(campaign.failed, 10) || 0}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-3 lg:flex-nowrap lg:justify-end lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 xl:min-w-[200px]">
                            {(campaign.status === 'PENDING' || campaign.status === 'draft') && (
                              <button
                                type="button"
                                onClick={() => handleStartCampaign(campaign.id)}
                                className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-all duration-200 active:scale-95 shadow-sm hover:shadow"
                                title="Start Campaign"
                              >
                                Start
                              </button>
                            )}
                            {campaign.status === 'PROCESSING' && (
                              <button
                                type="button"
                                onClick={() => handlePauseCampaign(campaign.id)}
                                className="px-3 py-1.5 bg-orange-600 text-white text-xs font-medium rounded-lg hover:bg-orange-700 transition-all duration-200 active:scale-95 shadow-sm hover:shadow"
                                title="Pause Campaign"
                              >
                                Pause
                              </button>
                            )}
                            {campaign.status === 'PAUSED' && (
                              <button
                                type="button"
                                onClick={() => handleResumeCampaign(campaign.id)}
                                className="px-3 py-1.5 bg-sky-600 text-white text-xs font-medium rounded-lg hover:bg-sky-700 transition-all duration-200 active:scale-95"
                                title="Resume Campaign"
                              >
                                Resume
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleViewDetails(campaign)}
                              className="p-2 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all duration-200 active:scale-95"
                              title="View Details"
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
                              onClick={() => handleViewAudience(campaign)}
                              className="p-2 text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all duration-200 active:scale-95"
                              title="View Audience Logs"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCampaign(campaign);
                                setShowDeleteModal(true);
                              }}
                              className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 active:scale-95"
                              title="Delete Campaign"
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
                  <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="text-sm text-gray-700">
                      Showing {((pagination.page - 1) * pagination.limit) + 1} to {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} campaigns
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                        disabled={filters.page === 1}
                        className="px-4 py-2 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-white hover:border-sky-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98]"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
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
        </main>
      </div>

      {/* Create Campaign Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="motion-pop bg-white rounded-2xl shadow-2xl shadow-gray-900/15 border border-gray-100/90 max-w-2xl w-full max-h-[90vh] overflow-y-auto ring-1 ring-black/5">
            <div className="p-5 md:p-6 border-b border-gray-100 bg-gradient-to-r from-slate-50 via-sky-50/50 to-sky-50/30">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Create New Campaign</h3>
                  <p className="text-sm text-gray-600 mt-1">Template, schedule, and audience in one flow</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormData({ name: '', description: '', type: 'broadcast', message: '', scheduledAt: '' });
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
            <form onSubmit={handleCreateCampaign} className="p-5 md:p-6 space-y-5 bg-gradient-to-b from-white to-sky-50/20">
              <div className="rounded-2xl border border-gray-100/90 bg-white p-4 md:p-5 shadow-sm ring-1 ring-gray-100/70 space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-700/90">Basics</p>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Campaign Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl bg-gray-50/70 hover:bg-white focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none transition-all shadow-sm text-sm"
                    placeholder="Enter campaign name"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-2">Template Name *</label>
                    <input
                      type="text"
                      value={formData.template_name}
                      onChange={(e) => setFormData({ ...formData, template_name: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl bg-gray-50/70 hover:bg-white focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none transition-all shadow-sm text-sm"
                      placeholder="e.g., hello_world"
                    />
                    <p className="mt-1.5 text-xs text-gray-500 leading-relaxed">Use an approved template name from Meta</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-800 mb-2">Template Language *</label>
                    <select
                      value={formData.template_language}
                      onChange={(e) => setFormData({ ...formData, template_language: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl bg-gray-50/70 hover:bg-white focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none transition-all shadow-sm text-sm font-medium cursor-pointer"
                    >
                      <option value="en_US">English (US)</option>
                      <option value="en_GB">English (UK)</option>
                      <option value="es_ES">Spanish</option>
                      <option value="fr_FR">French</option>
                      <option value="de_DE">German</option>
                      <option value="hi_IN">Hindi</option>
                      <option value="mr_IN">Marathi</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-800 mb-2">Schedule (Optional)</label>
                  <input
                    type="datetime-local"
                    value={formData.schedule_time || ''}
                    onChange={(e) => setFormData({ ...formData, schedule_time: e.target.value || null })}
                    className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl bg-gray-50/70 hover:bg-white focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none transition-all shadow-sm text-sm"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100/90 bg-white p-4 md:p-5 shadow-sm ring-1 ring-gray-100/70 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-sky-700/90">Audience *</p>
                  <span className="text-xs font-medium text-gray-600 bg-sky-50 px-2.5 py-1 rounded-full border border-sky-100">
                    {formData.audience.length} row{formData.audience.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="rounded-xl border-2 border-dashed border-sky-200/90 bg-gradient-to-br from-sky-50/40 to-white p-4 flex flex-wrap items-center gap-3">
                  <input ref={csvInputRef} type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
                  <button
                    type="button"
                    onClick={() => csvInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 text-white text-sm font-semibold shadow-md shadow-sky-600/25 hover:bg-sky-700 transition-all duration-200 active:scale-[0.98]"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Upload CSV
                  </button>
                  <button
                    type="button"
                    onClick={addAudienceMember}
                    className="text-sm font-semibold text-sky-700 hover:text-sky-800 px-3 py-2 rounded-xl hover:bg-sky-100/80 transition-colors"
                  >
                    + Add Row
                  </button>
                </div>
                {loadingCSV && (
                  <div className="flex items-center gap-2 text-sm text-sky-800 font-medium">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-200 border-t-sky-600" />
                    Uploading CSV…
                  </div>
                )}
                <div className="space-y-3 max-h-64 overflow-y-auto rounded-xl border border-gray-200/90 bg-gray-50/30 p-3 ring-1 ring-gray-100/80">
                  {formData.audience.map((member, index) => (
                    <div
                      key={index}
                      className="rounded-xl border border-gray-100 bg-white p-3 md:p-4 shadow-sm ring-1 ring-gray-100/60 hover:border-sky-100/90 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <span className="inline-flex items-center text-xs font-bold text-sky-800 bg-sky-100/90 px-2.5 py-1 rounded-lg border border-sky-200/60">
                          Row {index + 1}
                        </span>
                        {formData.audience.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeAudienceMember(index)}
                            className="text-xs font-semibold text-red-600 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                        <input
                          type="text"
                          value={member.phone}
                          onChange={(e) => updateAudienceMember(index, 'phone', e.target.value)}
                          placeholder="Phone (e.g., 919876543210)"
                          required
                          className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none text-sm transition-all"
                        />
                        <input
                          type="text"
                          value={member.var1}
                          onChange={(e) => updateAudienceMember(index, 'var1', e.target.value)}
                          placeholder="Var 1 ({{1}})"
                          className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none text-sm transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={member.var2}
                          onChange={(e) => updateAudienceMember(index, 'var2', e.target.value)}
                          placeholder="Var 2 ({{2}})"
                          className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none text-sm transition-all"
                        />
                        <input
                          type="text"
                          value={member.var3}
                          onChange={(e) => updateAudienceMember(index, 'var3', e.target.value)}
                          placeholder="Var 3 ({{3}})"
                          className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none text-sm transition-all"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        <input
                          type="text"
                          value={member.var4}
                          onChange={(e) => updateAudienceMember(index, 'var4', e.target.value)}
                          placeholder="Var 4 ({{4}})"
                          className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none text-sm transition-all"
                        />
                        <input
                          type="text"
                          value={member.var5}
                          onChange={(e) => updateAudienceMember(index, 'var5', e.target.value)}
                          placeholder="Var 5 ({{5}})"
                          className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 outline-none text-sm transition-all"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  CSV upload fills rows automatically. No contact loading (prevents browser freeze).
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-200/80 sticky bottom-0 bg-gradient-to-t from-white via-white to-transparent pb-1 -mb-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setFormData({ 
                      name: '', 
                      template_name: '', 
                      template_language: 'en_US', 
                      schedule_time: null,
                      audience: [{ phone: '', var1: '', var2: '', var3: '', var4: '', var5: '' }] 
                    });
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
                  {saving ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedCampaign && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="motion-pop bg-white rounded-2xl shadow-2xl shadow-gray-900/15 border border-gray-100/90 max-w-md w-full ring-1 ring-black/5">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-800 mb-2">Delete Campaign</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete "{selectedCampaign.name}"? This action cannot be undone.
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setSelectedCampaign(null);
                  }}
                  className="px-6 py-2.5 border-2 border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-all duration-200 active:scale-[0.98]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteCampaign}
                  className="px-6 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 shadow-md transition-all duration-200 hover:shadow-lg active:scale-[0.98]"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Details Modal */}
      {showDetailsModal && campaignDetails && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="motion-pop bg-white rounded-2xl shadow-2xl shadow-gray-900/15 border border-gray-100/90 max-w-3xl w-full max-h-[90vh] overflow-y-auto ring-1 ring-black/5">
            <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-sky-50/40">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-gray-800">Campaign Details</h3>
                <button
                  onClick={() => {
                    setShowDetailsModal(false);
                    setCampaignDetails(null);
                  }}
                  className="text-gray-400 hover:text-gray-700 rounded-lg p-1 transition-all duration-200 hover:bg-white/80 active:scale-95"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-600">Campaign Name</label>
                <p className="text-lg font-semibold text-gray-900">{campaignDetails.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Template Name</label>
                  <p className="text-gray-900">{campaignDetails.template_name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Template Language</label>
                  <p className="text-gray-900">{campaignDetails.template_language || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Template Category</label>
                  <p className="text-gray-900">{campaignDetails.template_category_label || 'Marketing'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Rate per message</label>
                  <p className="text-gray-900">
                    {campaignDetails.template_billing_category === 'service'
                      ? 'Free'
                      : `₹ ${formatInr(campaignDetails.rate_per_message ?? 0)}`}
                  </p>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Status</label>
                <span className={`inline-block px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(campaignDetails.status)}`}>
                  {campaignDetails.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                <div className="bg-indigo-50 p-4 rounded-xl ring-1 ring-indigo-100/80">
                  <label className="text-sm font-medium text-gray-600">Audience</label>
                  <p className="text-2xl font-bold text-indigo-600">{campaignDetails.audience ?? 0}</p>
                </div>
                <div className="bg-amber-50 p-4 rounded-xl ring-1 ring-amber-100/80">
                  <label className="text-sm font-medium text-gray-600">Total Credit Usage</label>
                  <p className="text-2xl font-bold text-amber-700">
                    ₹ {formatInr(campaignDetails.totalCreditUsage ?? 0)}
                  </p>
                  <p className="mt-1 text-[11px] text-amber-800/80">
                    {campaignDetails.sent || 0} sent × ₹ {formatInr(campaignDetails.rate_per_message ?? 0)}
                  </p>
                </div>
                <div className="bg-sky-50 p-4 rounded-xl ring-1 ring-sky-100/80 motion-hover-lift">
                  <label className="text-sm font-medium text-gray-600">Total</label>
                  <p className="text-2xl font-bold text-sky-600">{campaignDetails.total || 0}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <label className="text-sm font-medium text-gray-600">Sent</label>
                  <p className="text-2xl font-bold text-green-600">{campaignDetails.sent || 0}</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <label className="text-sm font-medium text-gray-600">Delivered</label>
                  <p className="text-2xl font-bold text-purple-600">{campaignDetails.delivered || 0}</p>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <label className="text-sm font-medium text-gray-600">Read</label>
                  <p className="text-2xl font-bold text-yellow-600">{campaignDetails.read || 0}</p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <label className="text-sm font-medium text-gray-600">Failed</label>
                  <p className="text-2xl font-bold text-red-600">{campaignDetails.failed || 0}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <label className="text-sm font-medium text-gray-600">Created</label>
                  <p className="text-sm text-gray-700">{new Date(campaignDetails.createdAt).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audience Logs Modal */}
      {showAudienceModal && selectedCampaign && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="motion-pop bg-white rounded-2xl shadow-2xl shadow-gray-900/15 border border-gray-100/90 max-w-5xl w-full max-h-[90vh] overflow-y-auto ring-1 ring-black/5">
            <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-sky-50/40">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-gray-800">Audience Logs</h3>
                  <p className="text-sm text-gray-600 mt-1">{selectedCampaign.name}</p>
                </div>
                <button
                  onClick={() => {
                    setShowAudienceModal(false);
                    setSelectedCampaign(null);
                    setAudienceLogs([]);
                  }}
                  className="text-gray-400 hover:text-gray-700 rounded-lg p-1 transition-all duration-200 hover:bg-white/80 active:scale-95"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-6">
              {loadingAudience ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-2 border-sky-200 border-t-sky-600 mx-auto" />
                  <p className="mt-4 text-gray-600">Loading audience logs...</p>
                </div>
              ) : audienceLogs.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-600">No audience logs found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gradient-to-r from-sky-50/95 to-slate-50/90 border-b border-gray-200/80">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Phone</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Variables</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Message ID</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Error</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Sent At</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {audienceLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-sky-50/40 transition-colors duration-200">
                          <td className="px-4 py-3 text-sm text-gray-900">{log.phone}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              (log.status || '').toLowerCase() === 'sent' ? 'bg-green-100 text-green-800' :
                              (log.status || '').toLowerCase() === 'delivered' ? 'bg-sky-100 text-sky-800' :
                              (log.status || '').toLowerCase() === 'read' ? 'bg-purple-100 text-purple-800' :
                              (log.status || '').toLowerCase() === 'failed' ? 'bg-red-100 text-red-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {(log.status || 'pending').toLowerCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {[log.var1, log.var2, log.var3, log.var4, log.var5].filter(v => v).join(', ') || 'None'}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600 font-mono">{log.waMessageId || 'N/A'}</td>
                          <td className="px-4 py-3 text-xs text-red-600">{log.errorMessage || '-'}</td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {log.sentAt ? new Date(log.sentAt).toLocaleString() : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <PlanLimitModal open={Boolean(planLimitModal)} payload={planLimitModal} onClose={() => setPlanLimitModal(null)} />
    </div>
  );
}

export default Campaigns;

