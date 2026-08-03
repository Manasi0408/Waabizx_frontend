import { useState, useEffect, useRef } from 'react';
import BrandLogoMark from '../components/BrandLogoMark';
import { useNavigate, Link } from 'react-router-dom';
import { getProfile, isAuthenticated, logout, updateProfile, readSessionUser, requestChangePassword, changePasswordWithOtp } from '../services/authService';
import { getSettings } from '../services/settingsService';
import { getNotifications, markAsRead, markAllAsRead } from '../services/notificationService';
import MainSidebarNav from '../components/MainSidebarNav';
import AppShellSidebar from '../components/AppShellSidebar';
import AdminHeaderProjectSwitch from '../components/AdminHeaderProjectSwitch';
import HeaderRightActions from '../components/HeaderRightActions';
import PasswordInput from '../components/PasswordInput';
import AgentSidebar from '../components/AgentSidebar';
import AgentTopbar from '../components/AgentTopbar';

function Settings() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const notificationRef = useRef(null);
  const [isProfileEditing, setIsProfileEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileForm, setProfileForm] = useState({
    displayName: '',
    email: '',
    countryCode: '+91',
    whatsappNumber: '',
    userName: ''
  });
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarDirty, setAvatarDirty] = useState(false);
  const photoInputRef = useRef(null);
  const [settingsSection, setSettingsSection] = useState('profile');
  const [pwdStep, setPwdStep] = useState('request');
  const [pwdOtp, setPwdOtp] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdInfo, setPwdInfo] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  const [settings, setSettings] = useState({
    whatsappNumber: '',
    adminName: '',
    adminEmail: ''
  });

  const splitRegistrationMobile = (mobileNumber) => {
    const digits = String(mobileNumber || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10) {
      return splitWhatsappNumber(`+91${digits}`);
    }
    return splitWhatsappNumber(digits.startsWith('+') ? digits : `+${digits}`);
  };

  const splitWhatsappNumber = (rawValue) => {
    const cleaned = String(rawValue || '').replace(/\s+/g, '');
    const supportedCodes = ['+91', '+1', '+44', '+971', '+65'];
    const matchedCode = supportedCodes.find((code) => cleaned.startsWith(code));
    if (matchedCode) {
      return {
        countryCode: matchedCode,
        whatsappNumber: cleaned.slice(matchedCode.length)
      };
    }
    return {
      countryCode: '+91',
      whatsappNumber: cleaned.replace(/^\+/, '')
    };
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!isAuthenticated()) {
          navigate('/login');
          return;
        }
        setLoadError('');
        const userData = await getProfile();
        setUser(userData);

        let settingsData = null;
        try {
          settingsData = await getSettings();
        } catch (e) {
          console.warn('Settings row not available:', e);
        }

        if (settingsData) {
          setSettings({
            whatsappNumber: settingsData.whatsappNumber || '',
            adminName: settingsData.adminName || '',
            adminEmail: settingsData.adminEmail || ''
          });
        }

        const regSplit = splitRegistrationMobile(userData?.mobileNumber);
        const settingsSplit =
          settingsData?.whatsappNumber && String(settingsData.whatsappNumber).trim()
            ? splitWhatsappNumber(settingsData.whatsappNumber)
            : null;
        const splitNumber = regSplit || settingsSplit || splitWhatsappNumber('');
        const resolvedEmail = userData?.email || settingsData?.adminEmail || '';
        setProfileForm({
          displayName: userData?.name || settingsData?.adminName || '',
          email: resolvedEmail,
          countryCode: splitNumber.countryCode,
          whatsappNumber: splitNumber.whatsappNumber,
          userName: resolvedEmail
        });
        setAvatarPreview(userData?.avatar || '');
        setAvatarDirty(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoadError('Failed to load profile');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [navigate]);

  const fetchNotifications = async (forceRefresh = false) => {
    try {
      setLoadingNotifications(true);
      if (forceRefresh) {
        await new Promise((resolve) => setTimeout(resolve, 50));
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
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, is_read: true } : n))
        );
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }
    setNotificationDropdownOpen(false);
  };

  const handleProfileFormChange = (e) => {
    const { name, value } = e.target;
    setProfileForm((prev) => ({
      ...prev,
      [name]: value
    }));
    setProfileError('');
    setProfileSuccess('');
  };

  const handleProfileEdit = () => {
    setIsProfileEditing(true);
    setProfileError('');
    setProfileSuccess('');
  };

  const handleProfileCancel = () => {
    const regSplit = splitRegistrationMobile(user?.mobileNumber);
    const settingsSplit =
      settings.whatsappNumber && String(settings.whatsappNumber).trim()
        ? splitWhatsappNumber(settings.whatsappNumber)
        : null;
    const restoredWhatsApp = regSplit || settingsSplit || splitWhatsappNumber('');
    const restoredEmail = user?.email || settings.adminEmail || '';
    setProfileForm({
      displayName: user?.name || settings.adminName || '',
      email: restoredEmail,
      countryCode: restoredWhatsApp.countryCode,
      whatsappNumber: restoredWhatsApp.whatsappNumber,
      userName: restoredEmail
    });
    setAvatarPreview(user?.avatar || '');
    setAvatarDirty(false);
    if (photoInputRef.current) photoInputRef.current.value = '';
    setIsProfileEditing(false);
    setProfileError('');
    setProfileSuccess('');
  };

  const handlePhotoSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setProfileError('Please select an image file (JPG, PNG, or WebP).');
      return;
    }
    if (file.size > 512000) {
      setProfileError('Image must be smaller than 500KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarPreview(String(reader.result || ''));
      setAvatarDirty(true);
      setProfileError('');
    };
    reader.readAsDataURL(file);
  };

  const handleProfileSave = async () => {
    setProfileError('');
    setProfileSuccess('');
    setProfileSaving(true);

    try {
      const payload = {
        displayName: profileForm.displayName,
        email: profileForm.email,
        countryCode: profileForm.countryCode,
        whatsappNumber: profileForm.whatsappNumber
      };
      if (avatarDirty && avatarPreview) {
        payload.avatar = avatarPreview;
      }
      await updateProfile(payload);

      const fresh = await getProfile();
      setUser(fresh);
      setSettings((prev) => ({
        ...prev,
        adminName: fresh?.name || prev.adminName,
        adminEmail: fresh?.email || prev.adminEmail,
        whatsappNumber: `${profileForm.countryCode}${profileForm.whatsappNumber}`.replace(/\s+/g, '')
      }));

      setProfileForm((prev) => ({
        ...prev,
        displayName: fresh?.name || prev.displayName,
        email: fresh?.email || prev.email,
        userName: fresh?.email || prev.userName
      }));

      setAvatarPreview(fresh?.avatar || '');
      setAvatarDirty(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
      setProfileSuccess('Profile updated successfully!');
      setIsProfileEditing(false);
      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (profileSaveError) {
      setProfileError(profileSaveError.message || 'Failed to update profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const resetChangePasswordForm = () => {
    setPwdStep('request');
    setPwdOtp('');
    setPwdNew('');
    setPwdConfirm('');
    setPwdError('');
    setPwdInfo('');
    setPwdSuccess('');
    setPwdLoading(false);
  };

  const handleOpenChangePassword = () => {
    setSettingsSection('password');
    resetChangePasswordForm();
  };

  const handleChangePasswordRequest = async (e) => {
    e?.preventDefault?.();
    setPwdError('');
    setPwdInfo('');
    setPwdSuccess('');
    setPwdOtp('');
    setPwdLoading(true);
    try {
      const response = await requestChangePassword();
      if (response?.success) {
        setPwdInfo(
          response?.message ||
            `If an account exists for ${user?.email || 'your email'}, you will receive an OTP shortly.`
        );
        setPwdStep('reset');
      } else {
        setPwdError(response?.message || 'Failed to send OTP');
      }
    } catch (err) {
      setPwdError(err.message || 'Failed to send OTP');
    } finally {
      setPwdLoading(false);
    }
  };

  const handleChangePasswordReset = async (e) => {
    e?.preventDefault?.();
    setPwdError('');
    setPwdSuccess('');
    if (pwdNew !== pwdConfirm) {
      setPwdError('Passwords do not match');
      return;
    }
    setPwdLoading(true);
    try {
      const response = await changePasswordWithOtp(pwdOtp, pwdNew);
      if (response?.success) {
        setPwdSuccess(response?.message || 'Password changed successfully');
        setPwdStep('request');
        setPwdOtp('');
        setPwdNew('');
        setPwdConfirm('');
        setPwdInfo('');
      } else {
        setPwdError(response?.message || 'Password change failed');
      }
    } catch (err) {
      setPwdError(err.message || 'Password change failed');
    } finally {
      setPwdLoading(false);
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

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
          <p className="mt-4 text-gray-600">Loading profile...</p>
        </div>
      </div>
    );
  }

  const userName = user?.name || 'User';
  const userInitial = userName.charAt(0).toUpperCase();
  const headerAvatar = user?.avatar || readSessionUser()?.avatar || '';
  const sessionRole = String(localStorage.getItem('role') || user?.role || '').toLowerCase().trim();
  const isSuperAdmin = sessionRole === 'super_admin' || sessionRole === 'superadmin';
  const isAgent = sessionRole === 'agent';
  const canChangePassword = isSuperAdmin || sessionRole === 'admin';
  const activeSettingsSection =
    settingsSection === 'password' && canChangePassword ? 'password' : 'profile';

  return (
    <div className={`h-screen flex bg-gray-50 overflow-hidden ${isAgent ? 'flex-row' : 'flex-col'}`}>
      {isAgent ? <AgentSidebar open={sidebarOpen || true} /> : null}

      <div className={`flex flex-col min-w-0 min-h-0 ${isAgent ? 'flex-1' : 'flex-1'}`}>
      {isAgent ? (
        <AgentTopbar onMenuClick={() => setSidebarOpen((o) => !o)} />
      ) : (
      <header className="motion-header-enter shrink-0 z-10 bg-white/90 backdrop-blur-md border-b border-gray-200/80 px-4 md:px-8 py-3.5 md:py-4 flex justify-between items-center shadow-sm shadow-gray-200/50">
        <div className="flex items-center gap-4 min-w-0">
          {!isSuperAdmin && (
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
          )}

          <Link to="/dashboard" className="flex items-center gap-3 transition-all duration-300 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] shrink-0"><BrandLogoMark size="md" />
            <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent hidden sm:block">
              Waabizx
            </h1>
          </Link>

          <span className="text-gray-300 hidden md:block shrink-0">|</span>
          <h2 className="text-lg font-semibold text-sky-700 hidden md:block tracking-tight">Settings</h2>
          <AdminHeaderProjectSwitch />
        </div>

        <HeaderRightActions>
          <div className="relative" ref={notificationRef}>
            <button
              type="button"
              onClick={() => {
                const willOpen = !notificationDropdownOpen;
                setNotificationDropdownOpen(willOpen);
                if (willOpen) fetchNotifications(true);
              }}
              className="relative w-10 h-10 rounded-full bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200/80 flex items-center justify-center cursor-pointer hover:from-sky-50 hover:to-sky-100/80 hover:border-sky-200/70 hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
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
                            !notification.is_read ? 'bg-sky-50 border-sky-500' : 'bg-white border-transparent'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                                notification.type === 'campaign'
                                  ? 'bg-sky-100'
                                  : notification.type === 'template'
                                    ? 'bg-green-100'
                                    : notification.type === 'message'
                                      ? 'bg-purple-100'
                                      : 'bg-gray-100'
                              }`}
                            >
                              {notification.type === 'campaign' && (
                                <svg className="w-5 h-5 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                  <div className="flex-shrink-0 w-2 h-2 bg-sky-600 rounded-full mt-1" />
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
      )}

      <div className="flex flex-1 min-h-0">
        {!isAgent && !isSuperAdmin && (
          <AppShellSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
            <MainSidebarNav onNavigate={() => setSidebarOpen(false)} />
          </AppShellSidebar>
        )}

        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
          <div className="relative isolate p-4 md:p-8 lg:p-10 max-w-5xl mx-auto">
            <div className="pointer-events-none absolute inset-0 overflow-hidden -z-10" aria-hidden>
              <div className="absolute -top-28 -right-20 w-[22rem] h-[22rem] bg-sky-400/30 motion-page-blob" />
              <div className="absolute -bottom-36 -left-24 w-[20rem] h-[20rem] bg-blue-400/25 motion-page-blob motion-page-blob--b" />
            </div>
            <div className="relative z-0">
              {loadError && (
                <div className="motion-enter mb-6 p-4 bg-red-50 border border-red-200/90 rounded-xl shadow-sm ring-1 ring-red-100/50">
                  <p className="text-red-600 text-sm">{loadError}</p>
                </div>
              )}

              <div className="motion-enter flex flex-col md:flex-row gap-6 md:gap-8 items-start">
                <aside className="w-full md:w-56 shrink-0 bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg shadow-gray-200/40 border border-gray-100/90 ring-1 ring-gray-100/80 p-4">
                  <h3 className="text-base font-bold text-gray-900 mb-3 px-2">Your Account</h3>
                  <nav className="space-y-1">
                    <button
                      type="button"
                      onClick={() => setSettingsSection('profile')}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                        activeSettingsSection === 'profile'
                          ? 'bg-gray-100 text-gray-900'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <svg className="w-5 h-5 shrink-0 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Your Profile
                    </button>
                    {canChangePassword ? (
                    <button
                      type="button"
                      onClick={handleOpenChangePassword}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                        activeSettingsSection === 'password'
                          ? 'bg-gray-100 text-gray-900'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <svg className="w-5 h-5 shrink-0 text-gray-800" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path d="M12 1a5 5 0 00-5 5v3H6a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2h-1V6a5 5 0 00-5-5zm-3 8V6a3 3 0 116 0v3H9zm3 5a1.5 1.5 0 110 3 1.5 1.5 0 010-3z" />
                      </svg>
                      Change Password
                    </button>
                    ) : null}
                  </nav>
                </aside>

                {activeSettingsSection === 'profile' ? (
              <div className="motion-enter motion-hover-lift flex-1 min-w-0 bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg shadow-gray-200/40 border border-gray-100/90 ring-1 ring-gray-100/80 p-6 md:p-8">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-6">
                  Your Profile
                </h2>
                {(profileError || profileSuccess) && (
                  <div className="mb-4 space-y-3">
                    {profileError && (
                      <div className="motion-enter bg-red-50 border border-red-200/90 text-red-700 px-4 py-3 rounded-xl text-sm shadow-sm ring-1 ring-red-100/50">
                        {profileError}
                      </div>
                    )}
                    {profileSuccess && (
                      <div className="motion-enter bg-emerald-50 border border-emerald-200/90 text-emerald-800 px-4 py-3 rounded-xl text-sm shadow-sm ring-1 ring-emerald-100/50">
                        {profileSuccess}
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="flex flex-col items-center justify-start">
                    <div className="relative mb-4">
                      <div className="w-28 h-28 rounded-full bg-gradient-to-br from-sky-500 via-sky-600 to-blue-800 text-white flex items-center justify-center text-4xl font-semibold shadow-lg shadow-sky-500/35 ring-4 ring-sky-100 overflow-hidden">
                        {avatarPreview ? (
                          <img src={avatarPreview} alt={user?.name || 'Profile'} className="w-full h-full object-cover" />
                        ) : (
                          (user?.name || 'U').charAt(0).toUpperCase()
                        )}
                      </div>
                      {isProfileEditing && (
                        <button
                          type="button"
                          onClick={() => photoInputRef.current?.click()}
                          className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-white border-2 border-sky-200 text-sky-700 shadow-md flex items-center justify-center hover:bg-sky-50 transition"
                          title="Upload photo"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </button>
                      )}
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp,image/gif"
                        className="hidden"
                        onChange={handlePhotoSelect}
                      />
                    </div>
                    {isProfileEditing && (
                      <p className="text-xs text-gray-500 mb-2 text-center">JPG, PNG or WebP · max 500KB</p>
                    )}
                    {!isProfileEditing ? (
                      <button
                        type="button"
                        onClick={handleProfileEdit}
                        className="text-sm text-sky-700 hover:text-sky-800 font-semibold mb-3 transition-colors"
                      >
                        Edit
                      </button>
                    ) : (
                      <div className="mb-3 flex flex-wrap items-center justify-center gap-3">
                        <button
                          type="button"
                          onClick={handleProfileCancel}
                          className="px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleProfileSave}
                          disabled={profileSaving}
                          className="relative overflow-hidden px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-700 shadow-md shadow-sky-500/30 hover:shadow-lg hover:from-sky-500 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          <span className="relative z-10">{profileSaving ? 'Saving...' : 'Save'}</span>
                          {!profileSaving && (
                            <span
                              className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent motion-hero-shimmer"
                              aria-hidden
                            />
                          )}
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        logout();
                        navigate('/login');
                      }}
                      className="px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-red-50 hover:border-red-200 hover:text-red-700 transition"
                    >
                      Logout
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Display Name</label>
                      <input
                        type="text"
                        name="displayName"
                        value={profileForm.displayName}
                        onChange={handleProfileFormChange}
                        disabled={!isProfileEditing}
                        className={`w-full px-4 py-2.5 border-2 rounded-xl text-sm transition ${
                          isProfileEditing
                            ? 'bg-white border-gray-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-400/30 outline-none'
                            : 'bg-gray-50/80 border-gray-100 text-gray-600'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                      <input
                        type="text"
                        name="email"
                        value={profileForm.email}
                        onChange={handleProfileFormChange}
                        disabled={!isProfileEditing}
                        className={`w-full px-4 py-2.5 border-2 rounded-xl text-sm transition ${
                          isProfileEditing
                            ? 'bg-white border-gray-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-400/30 outline-none'
                            : 'bg-gray-50/80 border-gray-100 text-gray-600'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">WhatsApp Number</label>
                      <p className="text-xs text-gray-500 mb-2">Number used at registration (editable when you click Edit).</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <select
                          name="countryCode"
                          value={profileForm.countryCode}
                          onChange={handleProfileFormChange}
                          disabled={!isProfileEditing}
                          className={`px-3 py-2.5 border-2 rounded-xl text-sm transition ${
                            isProfileEditing
                              ? 'bg-white border-gray-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-400/30 outline-none'
                              : 'bg-gray-50/80 border-gray-100 text-gray-600'
                          }`}
                        >
                          <option value="+91">India (+91)</option>
                          <option value="+1">US (+1)</option>
                          <option value="+44">UK (+44)</option>
                          <option value="+971">UAE (+971)</option>
                          <option value="+65">Singapore (+65)</option>
                        </select>
                        <input
                          type="text"
                          name="whatsappNumber"
                          value={profileForm.whatsappNumber}
                          onChange={handleProfileFormChange}
                          disabled={!isProfileEditing}
                          className={`px-3 py-2.5 border-2 rounded-xl text-sm transition ${
                            isProfileEditing
                              ? 'bg-white border-gray-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-400/30 outline-none'
                              : 'bg-gray-50/80 border-gray-100 text-gray-600'
                          }`}
                          placeholder="Mobile number"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">User Name</label>
                      <input
                        type="text"
                        value={profileForm.userName}
                        disabled
                        className="w-full px-4 py-2.5 bg-gray-50/80 border-2 border-gray-100 rounded-xl text-sm text-gray-600"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                      <input
                        type="password"
                        value="********"
                        disabled
                        className="w-full px-4 py-2.5 bg-gray-50/80 border-2 border-gray-100 rounded-xl text-sm text-gray-600"
                      />
                    </div>
                  </div>
                </div>
              </div>
                ) : (
              <div className="motion-enter motion-hover-lift flex-1 min-w-0 bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg shadow-gray-200/40 border border-gray-100/90 ring-1 ring-gray-100/80 p-6 md:p-8">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent mb-2">
                  Change Password
                </h2>
                <p className="text-sm text-gray-500 mb-6">
                  Same process as Forgot Password: we send an OTP to{' '}
                  <span className="font-semibold text-gray-700">{user?.email || 'your email'}</span>, then you set a new password.
                </p>

                {pwdError && (
                  <div className="mb-4 bg-red-50 border border-red-200/90 text-red-700 px-4 py-3 rounded-xl text-sm shadow-sm ring-1 ring-red-100/50" role="alert">
                    {pwdError}
                  </div>
                )}
                {pwdInfo && pwdStep === 'reset' && (
                  <div className="mb-4 bg-emerald-50 border border-emerald-200/90 text-emerald-800 px-4 py-3 rounded-xl text-sm shadow-sm ring-1 ring-emerald-100/50" role="status">
                    {pwdInfo}
                  </div>
                )}
                {pwdSuccess && (
                  <div className="mb-4 bg-emerald-50 border border-emerald-200/90 text-emerald-800 px-4 py-3 rounded-xl text-sm shadow-sm ring-1 ring-emerald-100/50" role="status">
                    {pwdSuccess}
                  </div>
                )}

                {pwdStep === 'request' ? (
                  <form onSubmit={handleChangePasswordRequest} className="max-w-md space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                      <input
                        type="email"
                        value={user?.email || ''}
                        disabled
                        className="w-full px-4 py-2.5 bg-gray-50/80 border-2 border-gray-100 rounded-xl text-sm text-gray-600"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={pwdLoading || !user?.email}
                      className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/25 hover:from-sky-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                      {pwdLoading ? 'Sending…' : 'Send OTP'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleChangePasswordReset} className="max-w-md space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">OTP</label>
                      <input
                        type="text"
                        value={pwdOtp}
                        onChange={(e) => setPwdOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        required
                        inputMode="numeric"
                        className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-400/30 outline-none"
                        placeholder="Enter OTP"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">New password</label>
                      <PasswordInput
                        value={pwdNew}
                        onChange={(e) => setPwdNew(e.target.value)}
                        required
                        autoComplete="new-password"
                        className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-400/30 outline-none"
                        placeholder="At least 4 characters"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
                      <PasswordInput
                        value={pwdConfirm}
                        onChange={(e) => setPwdConfirm(e.target.value)}
                        required
                        autoComplete="new-password"
                        className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-400/30 outline-none"
                        placeholder="Repeat password"
                      />
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setPwdStep('request');
                          setPwdOtp('');
                          setPwdNew('');
                          setPwdConfirm('');
                          setPwdError('');
                          setPwdInfo('');
                        }}
                        className="px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={pwdLoading}
                        className="flex-1 min-h-[44px] rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/25 hover:from-sky-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        {pwdLoading ? 'Updating…' : 'Change password'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
      </div>
    </div>
  );
}

export default Settings;
