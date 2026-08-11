import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getProfile, logout, isAuthenticated, readSessionUser } from '../services/authService';
import { getNotifications, markAsRead, markAllAsRead } from '../services/notificationService';
import { getDashboardStats, getConversationQuota } from '../services/dashboardService';
import { getQualityRating } from '../services/projectService';
import { getMetaTemplates, getTemplates } from '../services/templateService';
import MainSidebarNav from '../components/MainSidebarNav';
import AppShellSidebar from '../components/AppShellSidebar';
import AdminHeaderProjectSwitch from '../components/AdminHeaderProjectSwitch';
import HeaderRightActions from '../components/HeaderRightActions';
import AgentRightPanel from '../components/AgentRightPanel';
import CountUp from '../components/CountUp';

function readSelectedProjectFromStorage() {
  try {
    const raw = localStorage.getItem('selectedProject');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedProject, setSelectedProject] = useState(readSelectedProjectFromStorage);
  const [resolvedProjectId, setResolvedProjectId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [dashboardData, setDashboardData] = useState({
    stats: {
      totalContacts: 0,
      activeCampaigns: 0,
      messagesToday: 0,
      deliveryRate: '0%'
    },
    chartData: [],
    activities: []
  });
  const [conversationQuota, setConversationQuota] = useState({
    used: 0,
    remaining: 0,
    limit: 0,
    messagesSentToday: 0,
    templatesSentToday: 0,
    accountName: null,
    projectId: null,
    wccCredits: 0,
    wccRemainingCredits: 0,
    remainingEstimatedMessages: 0,
    creditUnitCost: 1,
    planInfo: null,
    wabaTier: null,
    wabaTierLabel: null,
    wabaThroughputLevel: null,
    wabaQualityRating: null,
    tierDailyLimit: 0,
    tierRemaining: 0,
    tierSource: 'local',
  });
  const [loadingQuota, setLoadingQuota] = useState(true);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [templateCategoryStats, setTemplateCategoryStats] = useState({
    marketing: 0,
    utility: 0,
    authentication: 0,
    total: 0,
  });
  const [loadingTemplateStats, setLoadingTemplateStats] = useState(true);
  const [isWhatsAppApiLive, setIsWhatsAppApiLive] = useState(false);
  const [qualityRating, setQualityRating] = useState('');
  const [loadingQualityRating, setLoadingQualityRating] = useState(false);
  const [chartTimeRange, setChartTimeRange] = useState(1); // 1 (Today), 7, 30, or 90 days
  const notificationRef = useRef(null);
  const API_BASE = (process.env.REACT_APP_API_URL || 'http://localhost:5000').replace(/\/$/, '');

  const activeProjectId = useMemo(() => {
    const fromSelected = selectedProject?.id;
    if (fromSelected != null && String(fromSelected).trim() !== '') {
      return String(fromSelected).trim();
    }
    const fromUser = user?.projectId;
    if (fromUser != null && String(fromUser).trim() !== '') {
      return String(fromUser).trim();
    }
    if (resolvedProjectId != null && String(resolvedProjectId).trim() !== '') {
      return String(resolvedProjectId).trim();
    }
    return null;
  }, [selectedProject?.id, user?.projectId, resolvedProjectId]);

  const panelSelectedProject = useMemo(() => {
    if (selectedProject?.id != null) return selectedProject;
    if (activeProjectId == null) return null;
    return { id: activeProjectId };
  }, [selectedProject, activeProjectId]);

  useEffect(() => {
    setSelectedProject(readSelectedProjectFromStorage());
  }, [location.key, user?.id]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === 'selectedProject' || event.key == null) {
        setSelectedProject(readSelectedProjectFromStorage());
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Fetch user profile on component mount
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
        // If profile fetch fails, redirect to login
        logout();
        navigate('/login');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

  // Fetch notifications function
  const fetchNotifications = async (forceRefresh = false) => {
    try {
      console.log('Fetching notifications...', { forceRefresh });
      setLoadingNotifications(true);
      
      // Add a small delay to ensure fresh data if force refresh
      if (forceRefresh) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      const data = await getNotifications();
      console.log('Notifications fetched:', data?.length || 0, 'items');
      
      // Sort notifications by created_at DESC (newest first) to ensure latest appear first
      const sortedData = (data || []).sort((a, b) => {
        const dateA = new Date(a.created_at || 0);
        const dateB = new Date(b.created_at || 0);
        return dateB - dateA; // Descending order (newest first)
      });
      
      console.log('Sorted notifications (newest first):', sortedData.map(n => ({ id: n.id, title: n.title, created_at: n.created_at })));
      
      // Always update to ensure latest notifications are shown
      setNotifications(sortedData);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoadingNotifications(false);
    }
  };

  // Fetch notifications on mount and when dropdown opens
  useEffect(() => {
    if (isAuthenticated()) {
      fetchNotifications();
      // Refresh notifications every 10 seconds (more frequent)
      const interval = setInterval(fetchNotifications, 10000);
      return () => clearInterval(interval);
    }
  }, []);

  // Refresh notifications when dropdown opens
  useEffect(() => {
    if (notificationDropdownOpen && isAuthenticated()) {
      // Force immediate fetch when dropdown opens
      console.log('Dropdown opened, fetching fresh notifications...');
      fetchNotifications(true);
    }
  }, [notificationDropdownOpen]);

  // Fetch dashboard stats
  useEffect(() => {
    const fetchDashboardStats = async () => {
      if (!isAuthenticated()) return;
      
      try {
        setLoadingDashboard(true);
        const data = await getDashboardStats(chartTimeRange);
        setDashboardData({
          stats: data.stats || {
            totalContacts: 0,
            activeCampaigns: 0,
            messagesToday: 0,
            deliveryRate: '0%'
          },
          chartData: data.chartData || [],
          activities: data.activities || []
        });
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        // Keep default values on error
      } finally {
        setLoadingDashboard(false);
      }
    };

    if (!loading && isAuthenticated()) {
      fetchDashboardStats();
    }
  }, [loading, chartTimeRange]);

  // Fetch templates and group counts by category (Marketing / Utility / Authentication).
  useEffect(() => {
    const normalizeCategory = (raw) => {
      const value = String(raw || '').trim().toLowerCase();
      if (value === 'marketing') return 'marketing';
      if (value === 'utility') return 'utility';
      if (value === 'authentication' || value === 'notification') return 'authentication';
      return null;
    };

    const fetchTemplateStats = async () => {
      if (!isAuthenticated()) return;
      setLoadingTemplateStats(true);
      try {
        let rows = [];
        try {
          rows = await getMetaTemplates();
        } catch (metaErr) {
          rows = [];
        }

        if (!Array.isArray(rows) || rows.length === 0) {
          const local = await getTemplates({ limit: 500 });
          rows = Array.isArray(local?.templates) ? local.templates : [];
        }

        const counts = { marketing: 0, utility: 0, authentication: 0, total: 0 };
        rows.forEach((tpl) => {
          const cat = normalizeCategory(tpl?.category || tpl?.metaCategory);
          if (cat) {
            counts[cat] += 1;
            counts.total += 1;
          }
        });
        setTemplateCategoryStats(counts);
      } catch (error) {
        console.error('Error fetching template category stats:', error);
        setTemplateCategoryStats({ marketing: 0, utility: 0, authentication: 0, total: 0 });
      } finally {
        setLoadingTemplateStats(false);
      }
    };

    if (!loading && isAuthenticated()) {
      fetchTemplateStats();
    }
  }, [loading, activeProjectId]);

  const templatePieData = useMemo(
    () =>
      [
        { key: 'marketing', name: 'Marketing', value: templateCategoryStats.marketing, color: '#0ea5e9' },
        { key: 'utility', name: 'Utility', value: templateCategoryStats.utility, color: '#8b5cf6' },
        { key: 'authentication', name: 'Authentication', value: templateCategoryStats.authentication, color: '#10b981' },
      ].filter((d) => d.value > 0),
    [templateCategoryStats]
  );

  // Fetch WhatsApp conversation quota (24-hour rolling) for this account.
  // Initial load + poll + tab focus so counts update after sending from Inbox/Live Chat/etc.
  useEffect(() => {
    if (!isAuthenticated() || loading) return;
    const accountId = user?.id;
    if (accountId == null) return;

    let cancelled = false;

    // Clear previous project's wallet/plan while the new project quota loads.
    setConversationQuota((prev) => ({
      ...prev,
      projectId: activeProjectId != null ? Number(activeProjectId) || activeProjectId : null,
      wccCredits: 0,
      wccRemainingCredits: 0,
      remainingEstimatedMessages: 0,
      planInfo: null,
    }));

    const fetchQuota = async (opts = { showLoading: true }) => {
      if (!isAuthenticated()) return;
      if (opts.showLoading) setLoadingQuota(true);
      try {
        const quota = await getConversationQuota(accountId);
        if (!cancelled) setConversationQuota(quota);
      } catch (error) {
        console.error('Error fetching conversation quota:', error);
      } finally {
        if (!cancelled && opts.showLoading) setLoadingQuota(false);
      }
    };

    fetchQuota({ showLoading: true });

    const intervalId = setInterval(() => {
      fetchQuota({ showLoading: false });
    }, 10000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchQuota({ showLoading: false });
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loading, user?.id, activeProjectId]);

  const refreshConversationQuota = useCallback(async () => {
    if (!isAuthenticated() || user?.id == null) return;
    try {
      const quota = await getConversationQuota(user.id);
      setConversationQuota(quota);
    } catch (error) {
      console.error('Error refreshing conversation quota:', error);
    }
  }, [user?.id, activeProjectId]);

  useEffect(() => {
    const onWccUpdated = () => {
      refreshConversationQuota();
    };
    window.addEventListener('wcc-quota-updated', onWccUpdated);
    return () => window.removeEventListener('wcc-quota-updated', onWccUpdated);
  }, [refreshConversationQuota]);

  // WhatsApp API LIVE + project scope from server (not localStorage cache).
  useEffect(() => {
    const clientId = Number(user?.id);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      setIsWhatsAppApiLive(false);
      return undefined;
    }

    let cancelled = false;

    const fetchOnboardingStatus = async () => {
      const projectId = activeProjectId;
      try {
        const token = localStorage.getItem('token');
        const headers = {};
        if (token) headers.Authorization = `Bearer ${token}`;
        if (projectId) headers['x-project-id'] = projectId;

        let url = `${API_BASE}/meta/onboarding-status?client_id=${clientId}`;
        if (projectId) {
          url += `&projectId=${encodeURIComponent(projectId)}`;
        }
        const res = await fetch(url, { headers });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          setIsWhatsAppApiLive(false);
          return;
        }

        const live = Boolean(
          data?.onboardingCompleted || data?.whatsappConnected || data?.metaLinked
        );
        setIsWhatsAppApiLive(live);

        const linkedProjectId = data?.projectId;
        if (linkedProjectId != null && String(linkedProjectId).trim() !== '') {
          setResolvedProjectId(String(linkedProjectId).trim());
        }
      } catch (_) {
        if (!cancelled) setIsWhatsAppApiLive(false);
      }
    };

    fetchOnboardingStatus();
    const intervalId = setInterval(fetchOnboardingStatus, 10000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchOnboardingStatus();
    };
    const onFocus = () => fetchOnboardingStatus();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [API_BASE, user?.id, activeProjectId]);

  useEffect(() => {
    const projectId = activeProjectId;
    if (projectId == null) {
      setQualityRating('');
      return undefined;
    }

    let cancelled = false;

    const fetchQuality = async () => {
      try {
        setLoadingQualityRating(true);
        const res = await getQualityRating(projectId);
        if (!cancelled) {
          setQualityRating(res?.qualityRating || '');
          if (res?.success !== false) {
            setIsWhatsAppApiLive(true);
          }
        }
      } catch (error) {
        if (!cancelled) setQualityRating('');
      } finally {
        if (!cancelled) setLoadingQualityRating(false);
      }
    };

    fetchQuality();
    const intervalId = setInterval(fetchQuality, 60000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [activeProjectId]);

  const formatQualityRatingLabel = (rating) => {
    switch (String(rating || '').toUpperCase()) {
      case 'GREEN':
      case 'HIGH':
        return 'High';
      case 'YELLOW':
      case 'MEDIUM':
        return 'Medium';
      case 'RED':
      case 'LOW':
        return 'Low';
      default:
        return '';
    }
  };

  const getQualityRatingBadgeClass = (rating) => {
    switch (String(rating || '').toUpperCase()) {
      case 'GREEN':
      case 'HIGH':
        return 'bg-emerald-50 text-emerald-700 ring-emerald-200/80';
      case 'YELLOW':
      case 'MEDIUM':
        return 'bg-amber-50 text-amber-800 ring-amber-200/80';
      case 'RED':
      case 'LOW':
        return 'bg-rose-50 text-rose-700 ring-rose-200/80';
      default:
        return 'bg-gray-50 text-gray-800 ring-gray-200/80';
    }
  };

  const qualityRatingDisplay = loadingQualityRating
    ? '...'
    : formatQualityRatingLabel(qualityRating) || '—';

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setNotificationDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleNotificationClick = async (notification) => {
    // Mark as read if unread
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
    
    // Close dropdown after clicking (like Waabizx)
    setNotificationDropdownOpen(false);
    
    // Optional: Navigate based on notification type
    // You can add navigation logic here if needed
    // if (notification.type === 'campaign') {
    //   navigate('/campaigns');
    // }
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

  // Format notification time
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

  const userName = user?.name || 'User';
  const userAvatar = user?.avatar || readSessionUser()?.avatar || '';
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-4">
          {/* Menu Toggle Button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2.5 rounded-xl hover:bg-gray-100/80 active:scale-95 transition lg:hidden"
            aria-label="Toggle sidebar"
          >
            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-sky-500 via-sky-600 to-blue-900 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/30 ring-2 ring-white">
              <span className="text-white font-bold text-lg">W</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent hidden sm:block">
              Waabizx
            </h1>
          </div>
          
          {/* Page Title */}
          <span className="text-gray-300 hidden md:block">|</span>
          <h2 className="text-lg font-semibold text-sky-700 hidden md:block tracking-tight">Dashboard</h2>
          <AdminHeaderProjectSwitch />
          {isWhatsAppApiLive ? (
            <div className="flex flex-wrap items-center gap-3 md:gap-6 ml-2 pl-2 border-l border-sky-100/80 shrink-0">
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  WhatsApp Business API Status :
                </span>
                <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-[10px] font-bold ring-1 ring-emerald-200/80">
                  LIVE
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  Quality Rating :
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${getQualityRatingBadgeClass(qualityRating)}`}
                >
                  {qualityRatingDisplay}
                </span>
              </div>
            </div>
          ) : null}
        </div>
        
        <HeaderRightActions>
          {/* Notifications */}
          <div className="relative" ref={notificationRef}>
            <button
              onClick={async () => {
                const willOpen = !notificationDropdownOpen;
                setNotificationDropdownOpen(willOpen);
                // Always fetch fresh notifications when opening dropdown
                if (willOpen) {
                  // Force refresh when opening dropdown
                  fetchNotifications(true);
                }
              }}
              className={`group relative w-10 h-10 rounded-full border flex items-center justify-center cursor-pointer transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-sky-400/45 ${
                notificationDropdownOpen
                  ? 'bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 border-sky-400/70 shadow-lg shadow-sky-600/30 ring-2 ring-white/80'
                  : 'bg-gradient-to-br from-white via-sky-50/80 to-blue-50/70 border-sky-100/90 shadow-md shadow-sky-200/25 hover:from-sky-500 hover:via-sky-600 hover:to-blue-700 hover:border-sky-400/70 hover:shadow-lg hover:shadow-sky-600/30 hover:ring-2 hover:ring-white/80'
              }`}
            >
              <svg
                className={`w-5 h-5 transition-colors duration-300 ${notificationDropdownOpen ? 'text-white' : 'text-sky-700 group-hover:text-white'}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <>
                  {/* Red dot indicator */}
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full border-2 border-white bg-rose-500 shadow-[0_0_0_2px_rgba(14,165,233,0.22)]"></span>
                  {/* Count badge */}
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-gradient-to-r from-rose-500 to-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center px-1.5 border-2 border-white shadow-md">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                </>
              )}
            </button>

            {/* Notification Dropdown */}
            {notificationDropdownOpen && (
              <div className="motion-pop absolute right-0 mt-3 w-80 md:w-96 rounded-2xl bg-white/95 backdrop-blur-md shadow-2xl shadow-sky-900/20 border border-sky-100/80 z-50 max-h-[500px] flex flex-col overflow-hidden ring-1 ring-sky-100/80 origin-top-right">
                {/* Header */}
                <div className="px-4 py-3.5 border-b border-sky-100/80 flex items-center justify-between bg-gradient-to-r from-sky-50/90 via-white to-blue-50/70">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-800 tracking-tight">Notifications</h3>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 bg-gradient-to-r from-rose-500 to-red-500 text-white text-xs font-semibold rounded-full shadow-sm shadow-rose-500/30">
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
                      className="text-xs font-semibold text-sky-700 hover:text-sky-900 transition-colors"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                {/* Notifications List */}
                <div className="overflow-y-auto flex-1">
                  {loadingNotifications ? (
                    <div className="px-4 py-8 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-2 border-sky-200 border-t-sky-600 mx-auto"></div>
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
                          className={`group w-full px-4 py-3 text-left transition border-l-4 ${
                            !notification.is_read 
                              ? 'bg-gradient-to-r from-sky-50/90 to-white border-sky-500 hover:from-sky-100/80 hover:to-sky-50/50' 
                              : 'bg-white/90 border-transparent hover:bg-sky-50/50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            {/* Notification Icon */}
                            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ring-1 ${
                              notification.type === 'campaign' ? 'bg-gradient-to-br from-sky-100 to-blue-100 text-sky-700 ring-sky-200/80' :
                              notification.type === 'template' ? 'bg-gradient-to-br from-emerald-100 to-teal-100 text-emerald-700 ring-emerald-200/80' :
                              notification.type === 'message' ? 'bg-gradient-to-br from-indigo-100 to-sky-100 text-indigo-700 ring-indigo-200/80' :
                              'bg-gradient-to-br from-gray-100 to-slate-100 text-gray-700 ring-gray-200/80'
                            }`}>
                              {notification.type === 'campaign' && (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                              )}
                              {notification.type === 'template' && (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                              )}
                              {notification.type === 'message' && (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                </svg>
                              )}
                              {!['campaign', 'template', 'message'].includes(notification.type) && (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                              )}
                            </div>

                            {/* Notification Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1">
                                  <p className={`text-sm font-medium transition-colors ${
                                    !notification.is_read ? 'text-gray-900' : 'text-gray-700 group-hover:text-gray-900'
                                  }`}>
                                    {notification.title}
                                  </p>
                                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                                    {notification.body}
                                  </p>
                                </div>
                                {!notification.is_read && (
                                  <div className="flex-shrink-0 w-2 h-2 bg-sky-600 rounded-full mt-1 shadow-[0_0_0_2px_rgba(14,165,233,0.15)]"></div>
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
          
          {/* User Profile — opens profile page */}
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 flex items-center justify-center cursor-pointer shadow-md shadow-sky-500/35 hover:shadow-lg hover:ring-2 ring-sky-300/60 hover:scale-[1.03] transition-all duration-200 focus:outline-none overflow-hidden"
          >
            {userAvatar ? (
              <img
                src={userAvatar}
                alt={userName}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-white font-semibold text-sm">{userInitial}</span>
            )}
          </button>
        </HeaderRightActions>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Collapsible Sidebar */}
        <AppShellSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
          <MainSidebarNav onNavigate={() => setSidebarOpen(false)} />
        </AppShellSidebar>

        {/* Main Content */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
          <div className="p-4 md:p-8 lg:p-10 max-w-[1800px] mx-auto">
          <div className="flex flex-col xl:flex-row xl:items-start gap-6 xl:gap-8">
          <div className="flex-1 min-w-0">
          {selectedProject?.project_name ? (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-600/90">Workspace</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-200/90 bg-white/90 px-4 py-1.5 text-sm font-semibold text-sky-900 shadow-sm ring-1 ring-sky-100/80">
                <svg className="w-4 h-4 text-sky-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
                {selectedProject.project_name}
              </span>
            </div>
          ) : null}
          {/* Header Greeting */}
          <div className="relative mb-8 md:mb-10 rounded-3xl overflow-hidden bg-gradient-to-br from-sky-900 via-sky-800 to-blue-950 px-6 py-8 md:px-10 md:py-10 shadow-xl shadow-sky-900/30 ring-1 ring-sky-400/20">
            <div className="motion-hero-blob-a pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" aria-hidden />
            <div className="motion-hero-blob-b pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-blue-400/15 blur-3xl" aria-hidden />
            <div className="pointer-events-none absolute top-0 right-1/4 h-px w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent" aria-hidden />
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden>
              <div className="motion-hero-shimmer absolute top-0 left-0 h-full w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12" />
            </div>
            <div className="relative motion-hero-enter">
              <p className="text-sky-200/95 text-xs font-semibold uppercase tracking-[0.2em] mb-3">{"Today's overview"}</p>
              <h2 className="text-2xl md:text-4xl font-bold text-white tracking-tight leading-tight">
                {loading ? (
                  'Loading...'
                ) : (
                  <>
                    Welcome Back,{' '}
                    <span className="motion-gradient-text inline-block bg-gradient-to-r from-sky-200 via-white to-sky-100 bg-clip-text text-transparent">
                      {userName}
                    </span>
                    !
                  </>
                )}
              </h2>
              <p className="text-sky-100/90 text-sm md:text-base mt-3 max-w-xl leading-relaxed">
                {"Here's what's happening with your campaigns today."}
              </p>
            </div>
          </div>

          {/* Channel status — WhatsApp live / RCS pending Google approval */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5 mb-6">
            <div className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">WhatsApp</p>
                <p className="text-xs text-emerald-600 font-medium mt-1">Active</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                Live
              </span>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-white p-4 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-800">RCS</p>
                <p className="text-xs text-amber-600 font-medium mt-1">Pending Approval</p>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                Coming Soon
              </span>
            </div>
          </div>

          {/* Statistics KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5 mb-8 md:mb-10">
            <div className="motion-enter motion-delay-1 motion-hover-lift group relative bg-white rounded-2xl border border-gray-100/80 p-5 md:p-6 shadow-sm shadow-gray-200/40 hover:shadow-xl hover:shadow-sky-400/10 hover:border-sky-100 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-400 via-sky-500 to-blue-500 opacity-90" aria-hidden />
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-500 tracking-tight">Total Contacts</h3>
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center shadow-lg shadow-sky-500/30 group-hover:scale-105 transition-transform duration-300">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl md:text-4xl font-bold text-gray-900 mb-2 tabular-nums tracking-tight">
                {loadingDashboard ? '...' : <CountUp value={dashboardData.stats.totalContacts} />}
              </p>
              <p className="text-xs font-medium text-sky-600 flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-50">↑</span>
                12% from last month
              </p>
            </div>

            <div className="motion-enter motion-delay-2 motion-hover-lift group relative bg-white rounded-2xl border border-gray-100/80 p-5 md:p-6 shadow-sm shadow-gray-200/40 transition-all duration-300 hover:shadow-xl hover:shadow-sky-400/10 hover:border-sky-100 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-300 via-sky-500 to-blue-500 opacity-90" aria-hidden />
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-500 tracking-tight">Active Campaigns</h3>
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center shadow-lg shadow-sky-500/25 group-hover:scale-105 transition-transform duration-300">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl md:text-4xl font-bold text-gray-900 mb-2 tabular-nums tracking-tight">
                {loadingDashboard ? '...' : <CountUp value={dashboardData.stats.activeCampaigns} />}
              </p>
              <p className="text-xs font-medium text-sky-600 flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-50">↑</span>
                2 new this week
              </p>
            </div>

            <div className="motion-enter motion-delay-3 motion-hover-lift group relative bg-white rounded-2xl border border-gray-100/80 p-5 md:p-6 shadow-sm shadow-gray-200/40 hover:shadow-xl hover:shadow-sky-400/10 hover:border-sky-100 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 via-sky-400 to-sky-300 opacity-90" aria-hidden />
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-500 tracking-tight">Msgs Today</h3>
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-sky-500 flex items-center justify-center shadow-lg shadow-sky-500/30 group-hover:scale-105 transition-transform duration-300">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl md:text-4xl font-bold text-gray-900 mb-2 tabular-nums tracking-tight">
                {loadingDashboard ? '...' : <CountUp value={dashboardData.stats.messagesToday} />}
              </p>
              <p className="text-xs font-medium text-sky-600 flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-50">→</span>
                On track for daily goal
              </p>
            </div>

            <div className="motion-enter motion-delay-4 motion-hover-lift group relative bg-white rounded-2xl border border-gray-100/80 p-5 md:p-6 shadow-sm shadow-gray-200/40 hover:shadow-xl hover:shadow-sky-400/10 hover:border-sky-100 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-sky-500 via-blue-400 to-sky-400 opacity-90" aria-hidden />
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-500 tracking-tight">Delivery Rate</h3>
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-sky-600 to-blue-700 flex items-center justify-center shadow-lg shadow-sky-600/30 group-hover:scale-105 transition-transform duration-300">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl md:text-4xl font-bold text-gray-900 mb-2 tabular-nums tracking-tight">
                {loadingDashboard ? '...' : <CountUp value={parseFloat(dashboardData.stats.deliveryRate) || 0} suffix={String(dashboardData.stats.deliveryRate).includes('%') ? '%' : ''} />}
              </p>
              <p className="text-xs font-medium text-sky-600 flex items-center gap-1.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-sky-50">↑</span>
                2% improvement
              </p>
            </div>
          </div>

          {/* Conversation Quota (Meta-style, rolling 24h) */}
          <div className="motion-enter motion-delay-5 relative overflow-hidden rounded-3xl border border-sky-100/80 bg-gradient-to-br from-sky-50/70 via-white to-blue-50/70 shadow-xl shadow-sky-200/30 p-6 md:p-8 mb-8 ring-1 ring-sky-100/70">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.18),transparent_40%)]" aria-hidden />
            <div className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-sky-200/25 blur-3xl" aria-hidden />
            <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-5">
              <div>
                <h3 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">WhatsApp Conversation Credits (WCC)</h3>
                <p className="text-sm text-slate-600 mt-1.5">Per-project wallet, Meta messaging tier, and daily cap — refreshed every 10 seconds</p>
                <p className="text-xs text-slate-500 mt-2">
                  Project: {loadingQuota ? '...' : (conversationQuota.projectName || selectedProject?.project_name || '—')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-white/90 text-sky-700 px-3 py-1 text-[11px] font-bold ring-1 ring-sky-200/70 shadow-sm">
                  Live refresh
                </span>
                <span className="inline-flex items-center rounded-full bg-sky-600 text-white px-3 py-1 text-[11px] font-bold shadow-sm">
                  10s
                </span>
              </div>
            </div>
            <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 motion-stagger-children">
              <div className="motion-hover-lift rounded-2xl border border-amber-200/80 bg-white/95 backdrop-blur-sm p-5 ring-1 ring-amber-200/60 shadow-md shadow-amber-100/60">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-amber-700 uppercase tracking-wide">Remaining WCC</div>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-sm">₹</span>
                </div>
                <div className="mt-2 text-2xl md:text-3xl font-bold text-slate-900 tabular-nums">
                  {loadingQuota ? '...' : <CountUp value={Number(conversationQuota.wccRemainingCredits || 0)} />}
                </div>
                <p className="mt-2 text-[11px] text-slate-500 leading-snug">
                  Internal prepaid balance for this project (1 credit ≈ ₹1). Deducted after each successful WhatsApp send.
                </p>
              </div>
              <div className="motion-hover-lift rounded-2xl border border-indigo-200/80 bg-white/95 backdrop-blur-sm p-5 ring-1 ring-indigo-200/60 shadow-md shadow-indigo-100/50">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wide">Est. messages left</div>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-sm">≈</span>
                </div>
                <div className="mt-2 text-2xl md:text-3xl font-bold text-slate-900 tabular-nums">
                  {loadingQuota ? '...' : <CountUp value={Number(conversationQuota.remainingEstimatedMessages || 0)} />}
                </div>
                <p className="mt-2 text-[11px] text-slate-500 leading-snug">
                  Credits ÷ {conversationQuota.creditUnitCost || 1} credit(s) per send (configurable on server).
                </p>
              </div>
              <div className="motion-hover-lift rounded-2xl border border-fuchsia-200/80 bg-white/95 backdrop-blur-sm p-5 ring-1 ring-fuchsia-200/60 shadow-md shadow-fuchsia-100/50">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-fuchsia-700 uppercase tracking-wide">WABA tier</div>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-fuchsia-100 text-fuchsia-700 text-sm">⬆</span>
                </div>
                <div className="mt-2 text-xl md:text-2xl font-bold text-slate-900">
                  {loadingQuota ? '...' : (conversationQuota.wabaTierLabel || '—')}
                </div>
                <p className="mt-2 text-[11px] text-slate-500 leading-snug">
                  {conversationQuota.tierSource === 'meta_graph'
                    ? `Meta Graph · ${conversationQuota.wabaThroughputLevel || 'throughput n/a'} · ${conversationQuota.wabaQualityRating || 'quality n/a'}`
                    : 'Link WhatsApp to load tier from Meta'}
                </p>
              </div>
              <div className="motion-hover-lift rounded-2xl border border-sky-200/80 bg-white/95 backdrop-blur-sm p-5 sm:col-span-2 lg:col-span-1 ring-1 ring-sky-200/60 shadow-md shadow-sky-100/60">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-sky-700 uppercase tracking-wide">Messages sent today</div>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-700 text-sm">✉</span>
                </div>
                <div className="mt-2 text-2xl md:text-3xl font-bold text-slate-900 tabular-nums">
                  {loadingQuota ? '...' : <CountUp value={Number(conversationQuota.messagesSentToday || 0)} />}
                </div>
                <p className="mt-2 text-[11px] text-slate-500 leading-snug">Every outbound send (inbox, live chat, campaigns). Resets at midnight (server time).</p>
              </div>
              <div className="motion-hover-lift rounded-2xl border border-emerald-200/80 bg-white/95 backdrop-blur-sm p-5 ring-1 ring-emerald-200/60 shadow-md shadow-emerald-100/60">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">Remaining</div>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 text-sm">✓</span>
                </div>
                <div className="mt-2 text-2xl md:text-3xl font-bold text-slate-900 tabular-nums">
                  {loadingQuota ? '...' : <CountUp value={Number(conversationQuota.remaining || 0)} />}
                </div>
                <p className="mt-2 text-[11px] text-slate-500 leading-snug">Tier cap minus template sends today (Meta messaging limit when available).</p>
              </div>
              <div className="motion-hover-lift rounded-2xl border border-violet-200/80 bg-white/95 backdrop-blur-sm p-5 ring-1 ring-violet-200/60 shadow-md shadow-violet-100/50">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-semibold text-violet-700 uppercase tracking-wide">Tier daily limit</div>
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-violet-700 text-sm">⚑</span>
                </div>
                <div className="mt-2 text-2xl md:text-3xl font-bold text-slate-900 tabular-nums">
                  {loadingQuota ? '...' : <CountUp value={Number(conversationQuota.tierDailyLimit || conversationQuota.limit || 0)} />}
                </div>
                <p className="mt-2 text-[11px] text-slate-500 leading-snug">
                  {conversationQuota.tierSource === 'meta_graph' ? 'From Meta messaging_limit_tier' : 'Local account default until Meta tier loads'}
                </p>
              </div>
            </div>
          </div>

          {/* Main Chart Area */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 md:gap-8 mb-8 md:mb-10">
            <div className="motion-enter motion-delay-5 xl:col-span-2 bg-white rounded-2xl border border-gray-100/90 shadow-lg shadow-gray-200/50 p-6 md:p-8 ring-1 ring-gray-100/80">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-lg md:text-xl font-bold text-gray-900 tracking-tight">
                    {chartTimeRange === 1 
                      ? 'Messages Sent Today' 
                      : `Messages Sent Over Last ${chartTimeRange} Days`}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1.5">Track your messaging performance</p>
                </div>
                <select 
                  value={chartTimeRange}
                  onChange={(e) => setChartTimeRange(parseInt(e.target.value))}
                  className="text-sm font-medium border-2 border-gray-200 rounded-xl px-4 py-2.5 text-gray-700 bg-gray-50/80 hover:bg-white hover:border-sky-300/70 focus:outline-none focus:ring-2 focus:ring-sky-400/45 focus:border-sky-400 transition-all cursor-pointer shadow-sm"
                >
                  <option value={1}>Today</option>
                  <option value={7}>Last 7 days</option>
                  <option value={30}>Last 30 days</option>
                  <option value={90}>Last 90 days</option>
                </select>
              </div>
              <div className="h-64 md:h-80 rounded-xl bg-gradient-to-b from-slate-50/80 to-white border border-gray-100/80 p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dashboardData.chartData.length > 0 ? dashboardData.chartData : []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis 
                      dataKey="name" 
                      stroke="#94a3b8"
                      tick={{ fill: '#64748b', fontSize: 12 }}
                      angle={chartTimeRange === 1 ? -45 : 0}
                      textAnchor={chartTimeRange === 1 ? 'end' : 'middle'}
                      height={chartTimeRange === 1 ? 80 : 30}
                    />
                    <YAxis stroke="#94a3b8" tick={{ fill: '#64748b', fontSize: 12 }} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #e2e8f0', 
                        borderRadius: '12px',
                        boxShadow: '0 10px 40px -10px rgba(14, 165, 233, 0.28)'
                      }} 
                      labelFormatter={(label) => chartTimeRange === 1 ? `Hour: ${label}` : `Date: ${label}`}
                      formatter={(value) => [`${value} messages`, 'Messages']}
                    />
                    <Legend wrapperStyle={{ paddingTop: '12px' }} />
                    <Line 
                      type="monotone" 
                      dataKey="messages" 
                      stroke="#0284c7" 
                      strokeWidth={3}
                      dot={{ fill: '#0284c7', r: 4, strokeWidth: 2, stroke: '#fff' }}
                      activeDot={{ r: 7, stroke: '#fff', strokeWidth: 2 }}
                      name="Messages Sent"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Templates by Category (Pie) */}
            <div className="motion-enter motion-delay-5 bg-white rounded-2xl border border-gray-100/90 shadow-lg shadow-gray-200/50 p-6 md:p-8 ring-1 ring-gray-100/80 flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <h3 className="text-lg md:text-xl font-bold text-gray-900 tracking-tight">Templates by Category</h3>
                  <p className="text-sm text-gray-500 mt-1.5">Approved &amp; submitted templates</p>
                </div>
                <span className="inline-flex items-center rounded-full bg-sky-50 text-sky-700 px-3 py-1 text-[11px] font-bold ring-1 ring-sky-200/70">
                  {loadingTemplateStats ? '...' : <><CountUp value={templateCategoryStats.total} /> total</>}
                </span>
              </div>

              <div className="relative h-56 md:h-60 mt-2">
                {loadingTemplateStats ? (
                  <div className="h-full flex items-center justify-center text-sm text-gray-400">Loading…</div>
                ) : templatePieData.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center px-4">
                    <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-sm text-gray-500">No templates yet</p>
                    <button
                      onClick={() => navigate('/templates')}
                      className="mt-3 text-sm font-semibold text-sky-600 hover:text-sky-700"
                    >
                      Create a template
                    </button>
                  </div>
                ) : (
                  <>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={templatePieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={2}
                          stroke="#fff"
                          strokeWidth={2}
                        >
                          {templatePieData.map((entry) => (
                            <Cell key={entry.key} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#fff',
                            border: '1px solid #e2e8f0',
                            borderRadius: '12px',
                            boxShadow: '0 10px 40px -10px rgba(14, 165, 233, 0.28)',
                          }}
                          formatter={(value, name) => [`${value} template${value === 1 ? '' : 's'}`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl md:text-3xl font-bold text-gray-900 tabular-nums">
                        <CountUp value={templateCategoryStats.total} />
                      </span>
                      <span className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Templates</span>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 motion-stagger-children">
                {[
                  { label: 'Marketing', value: templateCategoryStats.marketing, color: '#0ea5e9' },
                  { label: 'Utility', value: templateCategoryStats.utility, color: '#8b5cf6' },
                  { label: 'Auth', value: templateCategoryStats.authentication, color: '#10b981' },
                ].map((item) => (
                  <div key={item.label} className="motion-hover-lift rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">{item.label}</span>
                    </div>
                    <div className="mt-1 text-lg font-bold text-gray-900 tabular-nums">
                      {loadingTemplateStats ? '...' : <CountUp value={item.value} />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
            {/* Quick Action Buttons */}
            <div className="motion-enter motion-delay-6 bg-white rounded-2xl border border-gray-100/90 shadow-lg shadow-gray-200/40 p-6 md:p-8 ring-1 ring-gray-100/60">
              <div className="flex items-center gap-2 mb-6">
                <span className="h-8 w-1 rounded-full bg-gradient-to-b from-sky-500 to-blue-500" aria-hidden />
                <h3 className="text-lg md:text-xl font-bold text-gray-900 tracking-tight">Quick Actions</h3>
              </div>
              <div className="space-y-3">
                <button 
                  onClick={() => navigate('/campaigns')}
                  className="w-full group relative overflow-hidden bg-gradient-to-r from-sky-600 via-sky-500 to-blue-600 text-white px-6 py-4 rounded-xl font-semibold transition-all duration-300 flex items-center justify-center gap-3 shadow-lg shadow-sky-600/30 hover:shadow-xl hover:shadow-sky-500/35 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/15 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" aria-hidden />
                  <span className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-white/15">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </span>
                  <span className="relative">New Campaign</span>
                </button>
                <button 
                  onClick={() => navigate('/contacts')}
                  className="w-full group bg-gradient-to-r from-slate-700 to-slate-800 text-white px-6 py-4 rounded-xl font-semibold hover:from-slate-800 hover:to-slate-900 transition-all duration-300 flex items-center justify-center gap-3 shadow-md shadow-slate-900/20 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 group-hover:bg-white/15 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </span>
                  <span>Add Contacts</span>
                </button>
                <button 
                  onClick={() => navigate('/templates')}
                  className="w-full group border-2 border-gray-200 bg-white text-gray-800 px-6 py-4 rounded-xl font-semibold hover:border-sky-300 hover:bg-sky-50/60 transition-all duration-300 flex items-center justify-center gap-3 shadow-sm hover:shadow-md"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-600 group-hover:bg-sky-100 group-hover:text-sky-800 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </span>
                  <span>Create Template</span>
                </button>
              </div>
            </div>

            {/* Recent Activity Feed */}
            <div className="motion-enter motion-delay-7 bg-white rounded-2xl border border-gray-100/90 shadow-lg shadow-gray-200/40 p-6 md:p-8 ring-1 ring-gray-100/60">
              <div className="flex items-center gap-2 mb-6">
                <span className="h-8 w-1 rounded-full bg-gradient-to-b from-sky-400 to-blue-500" aria-hidden />
                <h3 className="text-lg md:text-xl font-bold text-gray-900 tracking-tight">Recent Activity</h3>
              </div>
              <ul className="relative space-y-0">
                {dashboardData.activities.length > 0 ? dashboardData.activities.map((activity, idx) => (
                  <li key={activity.id} className="relative flex items-start gap-4 pb-5 last:pb-0">
                    {idx < dashboardData.activities.length - 1 && (
                      <span className="absolute left-[19px] top-11 bottom-0 w-px bg-gradient-to-b from-gray-200 to-transparent" aria-hidden />
                    )}
                    <div className="relative z-[1] w-10 h-10 rounded-full bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200/80 flex items-center justify-center flex-shrink-0 text-xl shadow-sm">
                      {activity.icon}
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-gray-800 text-sm md:text-base leading-relaxed font-medium">{activity.message}</p>
                      <p className="text-gray-400 text-xs mt-1.5 font-medium">{activity.time}</p>
                    </div>
                  </li>
                )) : (
                  <li className="text-center py-12 px-4 rounded-xl bg-gradient-to-br from-gray-50 to-slate-50 border border-dashed border-gray-200">
                    <p className="text-gray-500 text-sm font-medium">No recent activity</p>
                  </li>
                )}
              </ul>
            </div>
          </div>
          </div>

          <aside className="w-full xl:w-[22rem] shrink-0 xl:sticky xl:top-4 xl:self-start">
            <AgentRightPanel
              user={user}
              selectedProject={panelSelectedProject}
              conversationQuota={conversationQuota}
              loadingQuota={loadingQuota}
              onRefreshConversationQuota={refreshConversationQuota}
              isWhatsAppApiLive={isWhatsAppApiLive}
            />
          </aside>
          </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default Dashboard;
