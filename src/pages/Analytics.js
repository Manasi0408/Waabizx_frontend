import { useState, useEffect, useRef } from 'react';
import BrandLogoMark from '../components/BrandLogoMark';
import { useNavigate, Link } from 'react-router-dom';
import { getProfile, isAuthenticated, logout, readSessionUser } from '../services/authService';
import { getNotifications, markAsRead, markAllAsRead } from '../services/notificationService';
import { getOverview, getCampaignAnalytics, getMessageAnalytics, getContactAnalytics, getCostAnalytics } from '../services/analyticsService';
import { getCampaigns } from '../services/campaignService';
import MainSidebarNav from '../components/MainSidebarNav';
import AppShellSidebar from '../components/AppShellSidebar';
import AdminHeaderProjectSwitch from '../components/AdminHeaderProjectSwitch';
import HeaderRightActions from '../components/HeaderRightActions';

const CAMPAIGN_ANALYTICS_PAGE_SIZE = 6;

function Analytics() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [timeRange, setTimeRange] = useState('month'); // day, week, month
  const [summaryData, setSummaryData] = useState({
    messagesSent: 0,
    delivered: 0,
    read: 0,
    failed: 0,
    replies: 0
  });
  const [campaignAnalytics, setCampaignAnalytics] = useState([]);
  const [campaignPage, setCampaignPage] = useState(1);
  const [messageAnalytics, setMessageAnalytics] = useState({
    textMessages: 0,
    imageMessages: 0,
    buttonClicks: 0,
    linkClicks: 0
  });
  const [contactAnalytics, setContactAnalytics] = useState({
    totalContacts: 0,
    activeUsers: 0,
    optedOutUsers: 0,
    newContacts: 0
  });
  const [costAnalytics, setCostAnalytics] = useState({
    conversationsStarted: 0,
    marketingConversations: 0,
    utilityConversations: 0,
    costToday: 0,
    costThisMonth: 0
  });
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
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

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalytics = async () => {
      if (!isAuthenticated()) return;
      
      try {
        setLoadingAnalytics(true);
        
        // Map frontend timeRange to backend timeRange
        // frontend: 'day', 'week', 'month' -> backend: 'today', 'week', 'month'
        const backendTimeRange =
          timeRange === 'day'
            ? 'today'
            : timeRange === 'week'
              ? 'week'
              : timeRange === 'month'
                ? 'month'
                : 'all';
        
        // Fetch all analytics in parallel with timeRange filter
        const [overview, campaignsData, messages, contacts, cost] = await Promise.all([
          getOverview(backendTimeRange).catch(err => {
            console.error('Error fetching overview:', err);
            return { messagesSent: 0, delivered: 0, read: 0, failed: 0, replies: 0 };
          }),
          getCampaigns({ page: 1, limit: 1000 }).catch(err => {
            console.error('Error fetching campaigns:', err);
            return { campaigns: [] };
          }),
          getMessageAnalytics(backendTimeRange).catch(err => {
            console.error('Error fetching message analytics:', err);
            return { text: 0, image: 0, button: 0, linkClicks: 0 };
          }),
          getContactAnalytics(backendTimeRange).catch(err => {
            console.error('Error fetching contact analytics:', err);
            return { totalContacts: 0, activeUsers: 0, optedOutUsers: 0, newContactsToday: 0 };
          }),
          getCostAnalytics(backendTimeRange).catch(err => {
            console.error('Error fetching cost analytics:', err);
            return { conversationsStarted: 0, marketing: 0, utility: 0, costToday: 0, costThisMonth: 0 };
          })
        ]);

        // Set overview data
        setSummaryData({
          messagesSent: overview.messagesSent || 0,
          delivered: overview.delivered || 0,
          read: overview.read || 0,
          failed: overview.failed || 0,
          replies: overview.replies || 0
        });

        // Get campaigns from the campaigns API (same as Campaigns page)
        const campaigns = campaignsData.campaigns || [];
        
        // Calculate replies for each campaign (incoming messages with campaignId)
        // We'll use the analytics API to get replies count per campaign
        let repliesMap = {};
        if (campaigns.length > 0) {
          try {
            const analyticsCampaigns = await getCampaignAnalytics(backendTimeRange).catch(() => []);
            analyticsCampaigns.forEach(campaign => {
              if (campaign.campaignId) {
                repliesMap[campaign.campaignId] = parseInt(campaign.replies) || 0;
              }
            });
          } catch (err) {
            console.error('Error fetching replies:', err);
          }
        }

        // Format campaigns data - use same data structure as Campaigns page
        const formattedCampaigns = campaigns.map(campaign => ({
          id: campaign.id,
          name: campaign.name || 'Unknown Campaign',
          sent: parseInt(campaign.sent) || 0,
          delivered: parseInt(campaign.delivered) || 0,
          read: parseInt(campaign.read) || 0,
          clicked: parseInt(campaign.clicked) || 0,
          replies: repliesMap[campaign.id] || 0
        }));
        setCampaignAnalytics(formattedCampaigns);

        // Set message analytics
        setMessageAnalytics({
          textMessages: messages.text || 0,
          imageMessages: messages.image || 0,
          buttonClicks: messages.button || 0,
          linkClicks: messages.linkClicks || 0
        });

        // Set contact analytics
        setContactAnalytics({
          totalContacts: contacts.totalContacts || 0,
          activeUsers: contacts.activeUsers || 0,
          optedOutUsers: contacts.optedOutUsers || 0,
          newContacts: contacts.newContactsToday || 0
        });

        // Set cost analytics
        setCostAnalytics({
          conversationsStarted: cost.conversationsStarted || 0,
          marketingConversations: cost.marketing || 0,
          utilityConversations: cost.utility || 0,
          costToday: parseFloat(cost.costToday || 0),
          costThisMonth: parseFloat(cost.costThisMonth || 0)
        });
      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setLoadingAnalytics(false);
      }
    };

    if (!loading && isAuthenticated()) {
      fetchAnalytics();
    }
  }, [loading, timeRange]);

  useEffect(() => {
    setCampaignPage(1);
  }, [timeRange]);

  const campaignTotalPages = Math.max(
    1,
    Math.ceil(campaignAnalytics.length / CAMPAIGN_ANALYTICS_PAGE_SIZE)
  );
  const paginatedCampaigns = campaignAnalytics.slice(
    (campaignPage - 1) * CAMPAIGN_ANALYTICS_PAGE_SIZE,
    campaignPage * CAMPAIGN_ANALYTICS_PAGE_SIZE
  );

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
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex flex-wrap justify-between items-center gap-3 shadow-sm shadow-gray-200/50">
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
          <h2 className="text-lg font-semibold text-sky-700 hidden md:block tracking-tight">Analytics</h2>
          <AdminHeaderProjectSwitch />
        </div>

        <HeaderRightActions className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 md:gap-4">
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
          <div className="motion-enter mb-6 md:mb-8 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 tracking-tight">Analytics</h2>
              <p className="text-gray-600 text-sm md:text-base">Track your WhatsApp messaging performance and insights</p>
            </div>
            <div
              className="flex shrink-0 items-center gap-1 self-start rounded-xl border border-gray-200/80 bg-white/90 p-1 shadow-sm ring-1 ring-gray-100/80 sm:mt-1"
              role="group"
              aria-label="Time range"
            >
              <button
                type="button"
                onClick={() => setTimeRange('day')}
                className={`px-2.5 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm font-semibold rounded-lg transition-all duration-200 active:scale-[0.98] ${
                  timeRange === 'day'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('week')}
                className={`px-2.5 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm font-semibold rounded-lg transition-all duration-200 active:scale-[0.98] ${
                  timeRange === 'week'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Week
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('month')}
                className={`px-2.5 py-1.5 text-xs sm:px-3 sm:py-2 sm:text-sm font-semibold rounded-lg transition-all duration-200 active:scale-[0.98] ${
                  timeRange === 'month'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                Month
              </button>
            </div>
          </div>

          {loadingAnalytics && (
            <div className="motion-enter mb-6 md:mb-8 text-center py-12 rounded-2xl border border-gray-100/90 bg-white/90 shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80">
              <div className="animate-spin rounded-full h-12 w-12 border-2 border-sky-200 border-t-sky-600 mx-auto" />
              <p className="mt-4 text-gray-600">Loading analytics...</p>
            </div>
          )}

          {/* 1. Top Summary Cards */}
          {!loadingAnalytics && (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 md:gap-5 mb-6 md:mb-8 motion-stagger-children">
            <div className="group rounded-2xl border border-gray-100/90 bg-white shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 p-5 md:p-6 motion-hover-lift hover:shadow-xl hover:border-sky-100/80 transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">Messages Sent</p>
                <svg className="w-5 h-5 text-sky-500 motion-icon-spin-hover" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </div>
              <p className="text-2xl font-bold text-gray-900">{summaryData.messagesSent.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">Total messages sent</p>
            </div>

            <div className="group rounded-2xl border border-gray-100/90 bg-white shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 p-5 md:p-6 motion-hover-lift hover:shadow-xl hover:border-sky-100/80 transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">Delivered</p>
                <svg className="w-5 h-5 text-green-500 motion-icon-spin-hover" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-2xl font-bold text-gray-900">{summaryData.delivered.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">{summaryData.messagesSent > 0 ? ((summaryData.delivered / summaryData.messagesSent) * 100).toFixed(1) : 0}% delivery rate</p>
            </div>

            <div className="group rounded-2xl border border-gray-100/90 bg-white shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 p-5 md:p-6 motion-hover-lift hover:shadow-xl hover:border-sky-100/80 transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">Read</p>
                <svg className="w-5 h-5 text-purple-500 motion-icon-spin-hover" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <p className="text-2xl font-bold text-gray-900">{summaryData.read.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">{summaryData.delivered > 0 ? ((summaryData.read / summaryData.delivered) * 100).toFixed(1) : 0}% read rate</p>
            </div>

            <div className="group rounded-2xl border border-gray-100/90 bg-white shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 p-5 md:p-6 motion-hover-lift hover:shadow-xl hover:border-sky-100/80 transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">Failed</p>
                <svg className="w-5 h-5 text-red-500 motion-icon-spin-hover" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-2xl font-bold text-gray-900">{summaryData.failed.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">{summaryData.messagesSent > 0 ? ((summaryData.failed / summaryData.messagesSent) * 100).toFixed(1) : 0}% failure rate</p>
            </div>

            <div className="group rounded-2xl border border-gray-100/90 bg-white shadow-lg shadow-gray-200/40 ring-1 ring-gray-100/80 p-5 md:p-6 motion-hover-lift hover:shadow-xl hover:border-sky-100/80 transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-600">Replies</p>
                <svg className="w-5 h-5 text-orange-500 motion-icon-spin-hover" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <p className="text-2xl font-bold text-gray-900">{summaryData.replies.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-1">{summaryData.delivered > 0 ? ((summaryData.replies / summaryData.delivered) * 100).toFixed(1) : 0}% reply rate</p>
            </div>
          </div>

          {/* 2. Campaign Analytics */}
          <div className="motion-enter motion-delay-2 bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100/90 overflow-hidden ring-1 ring-gray-100/80 p-5 md:p-6 mb-6 md:mb-8 motion-hover-lift hover:shadow-xl transition-all duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 md:mb-5">
              <h3 className="text-lg md:text-xl font-bold text-gray-900 tracking-tight">Campaign Analytics</h3>
              <p className="text-sm text-gray-500">Performance per campaign</p>
            </div>
            <div className="rounded-xl border border-gray-100/80 ring-1 ring-gray-100/60 bg-gray-50/30 p-3 md:p-4">
              {campaignAnalytics.length === 0 ? (
                <div className="text-center py-10 motion-enter">
                  <p className="text-gray-500">No campaign data available</p>
                </div>
              ) : (
                <>
                <div className="space-y-3 md:space-y-4 motion-stagger-children">
                  {paginatedCampaigns.map((campaign, index) => {
                    const sent = campaign.sent || 0;
                    const delivered = campaign.delivered || 0;
                    const read = campaign.read || 0;
                    const clicked = campaign.clicked || 0;
                    const replies = campaign.replies || 0;
                    const delPct = sent > 0 ? ((delivered / (sent || 1)) * 100).toFixed(1) : 0;
                    const readPct = delivered > 0 ? ((read / (delivered || 1)) * 100).toFixed(1) : 0;
                    const clickPct = read > 0 ? ((clicked / (read || 1)) * 100).toFixed(1) : 0;
                    const repPct = delivered > 0 ? ((replies / (delivered || 1)) * 100).toFixed(1) : 0;
                    const rowKey = campaign.id != null ? campaign.id : `campaign-${index}`;
                    return (
                      <article
                        key={rowKey}
                        className="group relative flex min-h-0 flex-row rounded-2xl border border-gray-100/90 bg-white shadow-sm shadow-gray-200/40 ring-1 ring-gray-100/80 overflow-hidden motion-hover-lift hover:shadow-xl hover:border-sky-100/90 transition-all duration-300"
                      >
                        <div
                          className="w-1.5 shrink-0 self-stretch bg-gradient-to-b from-sky-400 via-sky-500 to-blue-600 opacity-95"
                          aria-hidden
                        />
                        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 sm:p-4 lg:flex-row lg:items-stretch lg:gap-5 xl:gap-6">
                          <div className="min-w-0 flex-1 lg:max-w-xs xl:max-w-md">
                            <h3 className="text-base font-semibold text-gray-900 leading-snug line-clamp-2 min-w-0">
                              {campaign.name || campaign.campaignName || 'Unknown Campaign'}
                            </h3>
                            <p className="text-xs text-gray-500 mt-1.5">
                              <span className="font-medium text-gray-500">Sent</span>{' '}
                              <span className="text-gray-800 font-semibold tabular-nums">{sent.toLocaleString()}</span>
                              <span className="text-gray-400"> · </span>
                              <span className="text-gray-500">Performance per campaign</span>
                            </p>
                          </div>

                          <div className="flex flex-1 flex-wrap items-stretch gap-1.5 sm:gap-2 lg:min-w-0 lg:justify-end">
                            <div className="flex min-h-[3rem] min-w-[4.5rem] flex-1 flex-col justify-center rounded-xl border border-gray-100 bg-gray-50/90 px-2.5 py-1.5 sm:flex-none sm:min-w-[5rem]">
                              <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">Sent</span>
                              <span className="text-sm font-bold tabular-nums text-gray-900">{sent.toLocaleString()}</span>
                            </div>
                            <div className="flex min-h-[3rem] min-w-[4.5rem] flex-1 flex-col justify-center rounded-xl border border-emerald-100/80 bg-emerald-50/70 px-2.5 py-1.5 sm:flex-none sm:min-w-[5.25rem]">
                              <span className="text-[9px] font-semibold uppercase text-emerald-800/90">Delivered</span>
                              <span className="text-sm font-bold tabular-nums text-gray-900">{delivered.toLocaleString()}</span>
                              <span className="text-[10px] text-gray-500 tabular-nums">{delPct}%</span>
                            </div>
                            <div className="flex min-h-[3rem] min-w-[4.5rem] flex-1 flex-col justify-center rounded-xl border border-violet-100/80 bg-violet-50/70 px-2.5 py-1.5 sm:flex-none sm:min-w-[5.25rem]">
                              <span className="text-[9px] font-semibold uppercase text-violet-800/90">Read</span>
                              <span className="text-sm font-bold tabular-nums text-gray-900">{read.toLocaleString()}</span>
                              <span className="text-[10px] text-gray-500 tabular-nums">{readPct}%</span>
                            </div>
                            <div className="flex min-h-[3rem] min-w-[4.5rem] flex-1 flex-col justify-center rounded-xl border border-amber-100/80 bg-amber-50/70 px-2.5 py-1.5 sm:flex-none sm:min-w-[5.25rem]">
                              <span className="text-[9px] font-semibold uppercase text-amber-800/90">Clicked</span>
                              <span className="text-sm font-bold tabular-nums text-gray-900">{clicked.toLocaleString()}</span>
                              <span className="text-[10px] text-gray-500 tabular-nums">{clickPct}%</span>
                            </div>
                            <div className="flex min-h-[3rem] min-w-[4.5rem] flex-1 flex-col justify-center rounded-xl border border-sky-100/80 bg-sky-50/70 px-2.5 py-1.5 sm:flex-none sm:min-w-[5.25rem]">
                              <span className="text-[9px] font-semibold uppercase text-sky-800/90">Replies</span>
                              <span className="text-sm font-bold tabular-nums text-gray-900">{replies.toLocaleString()}</span>
                              <span className="text-[10px] text-gray-500 tabular-nums">{repPct}%</span>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {campaignTotalPages > 1 && (
                  <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="text-sm text-gray-700">
                      Showing {(campaignPage - 1) * CAMPAIGN_ANALYTICS_PAGE_SIZE + 1} to{' '}
                      {Math.min(campaignPage * CAMPAIGN_ANALYTICS_PAGE_SIZE, campaignAnalytics.length)} of{' '}
                      {campaignAnalytics.length} campaigns
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCampaignPage((p) => Math.max(1, p - 1))}
                        disabled={campaignPage === 1}
                        className="px-4 py-2 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-white hover:border-sky-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.98]"
                      >
                        Previous
                      </button>
                      <span className="px-3 py-2 text-sm text-gray-600 tabular-nums">
                        Page {campaignPage} of {campaignTotalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCampaignPage((p) => Math.min(campaignTotalPages, p + 1))}
                        disabled={campaignPage >= campaignTotalPages}
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

          {/* 3. Message Analytics & 4. Contact Analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 mb-6 md:mb-8">
            {/* Message Analytics */}
            <div className="motion-enter motion-delay-3 bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100/90 ring-1 ring-gray-100/80 p-5 md:p-6 motion-hover-lift hover:shadow-xl transition-all duration-300">
              <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-4 tracking-tight">Message Analytics</h3>
              <div className="space-y-3 md:space-y-4 motion-stagger-children">
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl border border-blue-100/80 ring-1 ring-blue-100/50 motion-hover-lift hover:shadow-md transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Text Messages</p>
                      <p className="text-xs text-gray-500">Plain text messages sent</p>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{messageAnalytics.textMessages.toLocaleString()}</p>
                </div>

                <div className="flex items-center justify-between p-4 bg-purple-50 rounded-xl border border-purple-100/80 ring-1 ring-purple-100/50 motion-hover-lift hover:shadow-md transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Image Messages</p>
                      <p className="text-xs text-gray-500">Messages with images</p>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{messageAnalytics.imageMessages.toLocaleString()}</p>
                </div>

                <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100/80 ring-1 ring-green-100/50 motion-hover-lift hover:shadow-md transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Button Clicks</p>
                      <p className="text-xs text-gray-500">Interactive button clicks</p>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{messageAnalytics.buttonClicks.toLocaleString()}</p>
                </div>

                <div className="flex items-center justify-between p-4 bg-orange-50 rounded-xl border border-orange-100/80 ring-1 ring-orange-100/50 motion-hover-lift hover:shadow-md transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Link Clicks</p>
                      <p className="text-xs text-gray-500">Links clicked by users</p>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{messageAnalytics.linkClicks.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Contact Analytics */}
            <div className="motion-enter motion-delay-4 bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100/90 ring-1 ring-gray-100/80 p-5 md:p-6 motion-hover-lift hover:shadow-xl transition-all duration-300">
              <h3 className="text-lg md:text-xl font-bold text-gray-900 mb-4 tracking-tight">Contact Analytics</h3>
              <div className="space-y-3 md:space-y-4 motion-stagger-children">
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-xl border border-blue-100/80 ring-1 ring-blue-100/50 motion-hover-lift hover:shadow-md transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Total Contacts</p>
                      <p className="text-xs text-gray-500">WhatsApp users in database</p>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{contactAnalytics.totalContacts.toLocaleString()}</p>
                </div>

                <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl border border-green-100/80 ring-1 ring-green-100/50 motion-hover-lift hover:shadow-md transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Active Users</p>
                      <p className="text-xs text-gray-500">Users who replied</p>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{contactAnalytics.activeUsers.toLocaleString()}</p>
                </div>

                <div className="flex items-center justify-between p-4 bg-red-50 rounded-xl border border-red-100/80 ring-1 ring-red-100/50 motion-hover-lift hover:shadow-md transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Opted-out Users</p>
                      <p className="text-xs text-gray-500">Blocked/unsubscribed</p>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{contactAnalytics.optedOutUsers.toLocaleString()}</p>
                </div>

                <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-xl border border-yellow-100/80 ring-1 ring-yellow-100/50 motion-hover-lift hover:shadow-md transition-all duration-300">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                      <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">New Contacts</p>
                      <p className="text-xs text-gray-500">Added today</p>
                    </div>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{contactAnalytics.newContacts.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>

          {/* 5. Cost / Billing Analytics */}
          <div className="motion-enter motion-delay-5 bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100/90 ring-1 ring-gray-100/80 p-5 md:p-6 motion-hover-lift hover:shadow-xl transition-all duration-300">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 md:mb-5">
              <h3 className="text-lg md:text-xl font-bold text-gray-900 tracking-tight">Cost / Billing Analytics</h3>
              <p className="text-sm text-gray-500">WhatsApp conversation costs</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 md:gap-5 motion-stagger-children">
              <div className="p-4 md:p-5 bg-blue-50 rounded-xl border border-blue-100/80 ring-1 ring-blue-100/50 motion-hover-lift hover:shadow-md transition-all duration-300">
                <p className="text-sm font-medium text-gray-600 mb-1">Conversations Started</p>
                <p className="text-2xl font-bold text-gray-900">{costAnalytics.conversationsStarted.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Chargeable conversations</p>
              </div>

              <div className="p-4 md:p-5 bg-purple-50 rounded-xl border border-purple-100/80 ring-1 ring-purple-100/50 motion-hover-lift hover:shadow-md transition-all duration-300">
                <p className="text-sm font-medium text-gray-600 mb-1">Marketing Conversations</p>
                <p className="text-2xl font-bold text-gray-900">{costAnalytics.marketingConversations.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Promo messages</p>
              </div>

              <div className="p-4 md:p-5 bg-green-50 rounded-xl border border-green-100/80 ring-1 ring-green-100/50 motion-hover-lift hover:shadow-md transition-all duration-300">
                <p className="text-sm font-medium text-gray-600 mb-1">Utility Conversations</p>
                <p className="text-2xl font-bold text-gray-900">{costAnalytics.utilityConversations.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Transactional</p>
              </div>

              <div className="p-4 md:p-5 bg-orange-50 rounded-xl border border-orange-100/80 ring-1 ring-orange-100/50 motion-hover-lift hover:shadow-md transition-all duration-300">
                <p className="text-sm font-medium text-gray-600 mb-1">Cost Today</p>
                <p className="text-2xl font-bold text-gray-900">₹{costAnalytics.costToday.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Spent today</p>
              </div>

              <div className="p-4 md:p-5 bg-red-50 rounded-xl border border-red-100/80 ring-1 ring-red-100/50 motion-hover-lift hover:shadow-md transition-all duration-300">
                <p className="text-sm font-medium text-gray-600 mb-1">Cost This Month</p>
                <p className="text-2xl font-bold text-gray-900">₹{costAnalytics.costThisMonth.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">Monthly cost</p>
              </div>
            </div>
          </div>
          </>
          )}
          </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default Analytics;

