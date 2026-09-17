import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import BrandLogoMark from '../components/BrandLogoMark';
import MainSidebarNav from '../components/MainSidebarNav';
import AppShellSidebar from '../components/AppShellSidebar';
import AdminHeaderProjectSwitch from '../components/AdminHeaderProjectSwitch';
import HeaderRightActions from '../components/HeaderRightActions';
import { getProfile, isAuthenticated, logout } from '../services/authService';
import { getTemplates } from '../services/templateService';
import { resolveActiveProjectId } from '../utils/activeProject';
import { getPublicApiOrigin } from '../utils/apiBase';
import {
  createApiToken,
  fetchApiTokenStatus,
  revokeApiToken,
  setApiTokenTemplate,
  updateApiToken,
} from '../services/apiTokenApi';
import { useProjectWhatsAppConnected } from '../hooks/useProjectWhatsAppConnected';

const inputClass =
  'mt-2 w-full px-3 py-2.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/20 bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100';

const primaryBtnClass =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 transition disabled:opacity-60';

const cardClass =
  'rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm';

function fullTokenStorageKey(projectId) {
  return `wz_full_token_${projectId}`;
}

function validateIpv4Client(ip) {
  const raw = String(ip || '').trim();
  if (!raw) return 'IP address is required.';
  const parts = raw.split('.');
  if (parts.length !== 4) return 'Enter a valid IPv4 address (example: 103.25.100.20).';
  const valid = parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const num = Number(part);
    return num >= 0 && num <= 255;
  });
  if (!valid) return 'Each IP segment must be a number between 0 and 255.';
  return '';
}

function validateDomainClient(domain) {
  const raw = String(domain || '').trim();
  if (!raw) return 'Domain is required.';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Domain must start with http:// or https://.';
    }
    if (!parsed.hostname || parsed.hostname.length < 3) {
      return 'Enter a valid domain hostname (example: https://mycrm.com).';
    }
    return '';
  } catch {
    return 'Enter a valid domain URL (example: https://mycrm.com).';
  }
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-slate-600'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function CodeBlock({ title, children }) {
  return (
    <div className="rounded-lg overflow-hidden border border-slate-700/80">
      {title ? (
        <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-800/80 border-b border-slate-700">
          {title}
        </div>
      ) : null}
      <pre className="p-3 text-[11px] leading-relaxed text-emerald-300 bg-[#1e293b] overflow-x-auto whitespace-pre-wrap break-all font-mono">
        {children}
      </pre>
    </div>
  );
}

function TemplatePreviewCard({ template }) {
  if (!template) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-gray-200 dark:border-slate-600 p-4 text-xs text-gray-500 dark:text-gray-400">
        Select a template to see preview.
      </div>
    );
  }

  const category = String(template.category || 'utility').toUpperCase();
  const body = String(template.content || '').trim() || 'No template body available.';

  return (
    <div className="mt-3 rounded-lg border border-gray-200 dark:border-slate-600 overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 dark:bg-slate-900/60 border-b border-gray-200 dark:border-slate-600 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">Preview</span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
          {category}
        </span>
      </div>
      <div className="p-3 bg-[#e5ddd5] dark:bg-[#0b141a]">
        <div
          className="rounded-lg bg-white px-3 py-3 text-[13px] leading-relaxed whitespace-pre-wrap break-words text-[#111b21] shadow-sm"
          style={{ color: '#111b21', backgroundColor: '#ffffff' }}
        >
          {body}
        </div>
      </div>
      <div className="px-3 py-2 text-[11px] text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-slate-700">
        {template.name}
      </div>
    </div>
  );
}

function ApiDocsPanel({ apiRoot, selectedTemplate, displayToken, allowedDomain, allowedIp }) {
  const templateName = selectedTemplate?.name || 'your_template_name';
  const templateId = selectedTemplate?.id || 0;
  const tokenSample = displayToken || 'your_api_token';
  const originSample = allowedDomain || 'https://your-website.com';
  const endpoint = `${apiRoot}/direct-api/sendMessage`;

  const requestBody = JSON.stringify(
    {
      phone: '919876543210',
      templateId,
      templateName,
    },
    null,
    2
  );

  const curlSample = `curl --request POST \\
  --url ${endpoint} \\
  --header 'Authorization: Bearer ${tokenSample}' \\
  --header 'Content-Type: application/json' \\
  --header 'Origin: ${originSample}' \\
  --data '${requestBody.replace(/\n/g, '\n  ')}'`;

  const responseSample = JSON.stringify(
    {
      success: true,
      remoteAddress: allowedIp || '103.25.100.20',
      origin: originSample,
      token: tokenSample,
      allowedIp: allowedIp || '103.25.100.20',
      allowedDomain: originSample,
      phone: '919876543210',
      templateId,
      templateName,
    },
    null,
    2
  );

  return (
    <div className={`${cardClass} overflow-hidden h-full flex flex-col`}>
      <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 bg-gray-50/80 dark:bg-slate-900/50">
        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Send Template Message</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          API reference for sending messages with your project token.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="grid xl:grid-cols-2 gap-0">
          <div className="p-4 border-b xl:border-b-0 xl:border-r border-gray-100 dark:border-slate-700">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                POST
              </span>
              <code className="text-[11px] text-gray-600 dark:text-gray-400 break-all">{endpoint}</code>
            </div>
            <div className="space-y-3 text-xs text-gray-700 dark:text-gray-300">
              <p>
                <span className="font-semibold">Authorization:</span> Bearer{' '}
                <code className="text-emerald-600 dark:text-emerald-400 break-all">{tokenSample}</code>
              </p>
              <p>
                <span className="font-semibold">Origin:</span>{' '}
                <code className="text-emerald-600 dark:text-emerald-400 break-all">{originSample}</code>
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Calls must come from your registered domain ({originSample}) and server IP (
                {allowedIp || 'your allowed IP'}) in production.
              </p>
              <ul className="space-y-1.5">
                <li>
                  <code className="text-red-500">phone</code> — Recipient number (required)
                </li>
                <li>
                  <code className="text-red-500">templateId</code> — Selected template ID
                </li>
                <li>
                  <code className="text-gray-500">templateName</code> — Template name
                </li>
              </ul>
            </div>
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-900/40 space-y-3">
            <CodeBlock title="Request sample">{curlSample}</CodeBlock>
            <CodeBlock title="Payload">{requestBody}</CodeBlock>
            <CodeBlock title="Response">{responseSample}</CodeBlock>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ApiTokenPage() {
  const navigate = useNavigate();
  const whatsappConnected = useProjectWhatsAppConnected();
  const apiRoot = getPublicApiOrigin();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [ip, setIp] = useState('');
  const [domain, setDomain] = useState('');
  const [ipError, setIpError] = useState('');
  const [domainError, setDomainError] = useState('');
  const [storedFullToken, setStoredFullToken] = useState('');
  const [revealedToken, setRevealedToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState({ hasToken: false, token: null });
  const [toast, setToast] = useState('');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [waChecked, setWaChecked] = useState(false);
  const [approvedTemplates, setApprovedTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const projectId = resolveActiveProjectId();
  const hasToken = Boolean(status.hasToken);
  const displayToken = status.token?.token || revealedToken || storedFullToken || '';

  const selectedTemplate = useMemo(
    () => approvedTemplates.find((t) => String(t.id) === String(selectedTemplateId)) || null,
    [approvedTemplates, selectedTemplateId]
  );

  const persistFullToken = useCallback(
    (token) => {
      if (!projectId || !token) return;
      sessionStorage.setItem(fullTokenStorageKey(projectId), token);
      setStoredFullToken(token);
    },
    [projectId]
  );

  const clearFullToken = useCallback(() => {
    if (projectId) sessionStorage.removeItem(fullTokenStorageKey(projectId));
    setStoredFullToken('');
    setRevealedToken('');
  }, [projectId]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3200);
  };

  const loadApprovedTemplates = useCallback(async () => {
    try {
      setTemplatesLoading(true);
      const data = await getTemplates({ status: 'approved', limit: 200, page: 1 });
      setApprovedTemplates(data?.templates || []);
    } catch {
      setApprovedTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    if (!projectId) {
      setStatus({ hasToken: false, token: null });
      setStatusLoading(false);
      return;
    }
    try {
      setStatusLoading(true);
      const data = await fetchApiTokenStatus(projectId);
      setStatus({
        hasToken: Boolean(data?.hasToken),
        token: data?.token || null,
      });
      if (data?.token?.token) {
        persistFullToken(data.token.token);
      } else if (!data?.hasToken) {
        clearFullToken();
      } else {
        const saved = sessionStorage.getItem(fullTokenStorageKey(projectId)) || '';
        setStoredFullToken(saved);
      }
      if (data?.token?.allowedIp) setIp(data.token.allowedIp);
      if (data?.token?.allowedDomain) setDomain(data.token.allowedDomain);
      setSelectedTemplateId(
        data?.token?.templateId != null && data.token.templateId !== ''
          ? String(data.token.templateId)
          : ''
      );
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to load API token status');
    } finally {
      setStatusLoading(false);
    }
  }, [projectId, clearFullToken, persistFullToken]);

  useEffect(() => {
    const init = async () => {
      try {
        if (!isAuthenticated()) {
          navigate('/login');
          return;
        }
        setUser(await getProfile());
        await loadApprovedTemplates();
      } catch {
        logout();
        navigate('/login');
      } finally {
        setPageLoading(false);
      }
    };
    init();
  }, [navigate, loadApprovedTemplates]);

  useEffect(() => {
    if (!whatsappConnected) {
      if (waChecked) return undefined;
      const timer = setTimeout(() => {
        setWaChecked(true);
        if (!whatsappConnected) navigate('/dashboard', { replace: true });
      }, 1200);
      return () => clearTimeout(timer);
    }
    setWaChecked(true);
    loadStatus();
    return undefined;
  }, [whatsappConnected, loadStatus, navigate, waChecked]);

  const handleCreate = async (replaceExisting = false) => {
    const ipMsg = validateIpv4Client(ip);
    const domainMsg = validateDomainClient(domain);
    setIpError(ipMsg);
    setDomainError(domainMsg);
    if (ipMsg || domainMsg) return;

    try {
      setSaving(true);
      const data = await createApiToken({
        projectId: Number(projectId),
        allowedIp: ip.trim(),
        allowedDomain: domain.trim(),
        replaceExisting,
      });
      setConfirmReplace(false);
      setEnabled(false);
      setShowUpdateForm(false);
      if (data?.token) {
        persistFullToken(data.token);
        setRevealedToken(data.token);
      }
      showToast('API token created successfully');
      await loadStatus();
    } catch (error) {
      if (error?.response?.data?.code === 'TOKEN_EXISTS' && !replaceExisting) {
        setConfirmReplace(true);
        return;
      }
      showToast(error?.response?.data?.message || 'Failed to create token');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateData = async () => {
    const ipMsg = validateIpv4Client(ip);
    const domainMsg = validateDomainClient(domain);
    setIpError(ipMsg);
    setDomainError(domainMsg);
    if (ipMsg || domainMsg) return;

    try {
      setSaving(true);
      const data = await updateApiToken({
        projectId: Number(projectId),
        allowedIp: ip.trim(),
        allowedDomain: domain.trim(),
        regenerateToken: true,
      });
      if (data?.token) {
        persistFullToken(data.token);
        setRevealedToken(data.token);
      }
      setShowUpdateForm(false);
      showToast('Data updated successfully');
      await loadStatus();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to update data');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteData = async () => {
    if (!window.confirm('Delete API token data? This removes the record from the database.')) return;
    try {
      setDeleting(true);
      await revokeApiToken(Number(projectId));
      clearFullToken();
      setEnabled(false);
      setShowUpdateForm(false);
      setConfirmReplace(false);
      setIp('');
      setDomain('');
      setSelectedTemplateId('');
      showToast('Data deleted successfully');
      await loadStatus();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to delete data');
    } finally {
      setDeleting(false);
    }
  };

  const handleTemplateChange = async (nextId) => {
    const normalizedId = nextId ? String(nextId) : '';
    setSelectedTemplateId(normalizedId);
    if (!hasToken) return;
    try {
      setSavingTemplate(true);
      await setApiTokenTemplate({
        projectId: Number(projectId),
        templateId: normalizedId ? Number(normalizedId) : null,
      });
      showToast(normalizedId ? 'Template saved' : 'Template removed');
      await loadStatus();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to save template');
      await loadStatus();
    } finally {
      setSavingTemplate(false);
    }
  };

  const copyToken = async () => {
    if (!displayToken) return;
    try {
      await navigator.clipboard.writeText(displayToken);
      showToast('Token copied');
    } catch {
      showToast('Could not copy token');
    }
  };

  const userName = user?.name || user?.email || 'User';
  const userInitial = String(userName).charAt(0).toUpperCase();
  const userAvatar = user?.avatar || '';

  if (pageLoading || (!waChecked && !whatsappConnected)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-200 border-t-emerald-600" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-slate-900 overflow-hidden">
      <header className="shrink-0 z-10 bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-gray-200/80 dark:border-slate-700/80 px-4 md:px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 lg:hidden"
            aria-label="Toggle sidebar"
          >
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
            <BrandLogoMark size="md" />
            <span className="text-lg font-bold text-gray-800 dark:text-gray-100 hidden sm:block">Waabizx</span>
          </Link>
          <span className="text-gray-300 dark:text-slate-600 hidden md:block">|</span>
          <h2 className="text-base font-semibold text-emerald-700 dark:text-emerald-400 hidden md:block">API Token</h2>
          <AdminHeaderProjectSwitch />
        </div>
        <HeaderRightActions>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center overflow-hidden"
          >
            {userAvatar ? (
              <img src={userAvatar} alt={userName} className="w-full h-full rounded-full object-cover" />
            ) : (
              <span className="text-white font-semibold text-xs">{userInitial}</span>
            )}
          </button>
        </HeaderRightActions>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <AppShellSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)}>
          <MainSidebarNav
            onNavigate={() => setSidebarOpen(false)}
            navClassName="!overflow-hidden"
            listClassName="!overflow-hidden !flex-none md:!overflow-hidden md:!flex-none"
          />
        </AppShellSidebar>

        <main className="flex-1 min-h-0 overflow-y-auto bg-gray-50 dark:bg-slate-900">
          <div className="max-w-[1400px] mx-auto p-4 md:p-6">
            <div className="mb-5">
              <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span aria-hidden>🔑</span> API Token
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Manage your project API token and send template messages securely.
              </p>
            </div>

            {toast ? (
              <div className="mb-4 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-sm text-emerald-800 dark:text-emerald-200">
                {toast}
              </div>
            ) : null}

            <div className="grid lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] gap-5 items-start">
              {/* LEFT — compact token panel */}
              <div className="space-y-4">
                <div className={cardClass}>
                  {!hasToken ? (
                    <>
                      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-slate-700">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Create token</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Enable to configure IP & domain</p>
                        </div>
                        <ToggleSwitch checked={enabled} onChange={setEnabled} />
                      </div>
                      {enabled ? (
                        <div className="p-4 space-y-4">
                          <div>
                            <label htmlFor="api-ip" className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                              Allowed IP
                            </label>
                            <input
                              id="api-ip"
                              className={`${inputClass} ${ipError ? 'border-red-400' : ''}`}
                              placeholder="103.25.100.20"
                              value={ip}
                              onChange={(e) => {
                                setIp(e.target.value);
                                if (ipError) setIpError('');
                              }}
                            />
                            {ipError ? <p className="mt-1 text-xs text-red-500">{ipError}</p> : null}
                          </div>
                          <div>
                            <label htmlFor="api-domain" className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                              Domain
                            </label>
                            <input
                              id="api-domain"
                              className={`${inputClass} ${domainError ? 'border-red-400' : ''}`}
                              placeholder="https://mycrm.com"
                              value={domain}
                              onChange={(e) => {
                                setDomain(e.target.value);
                                if (domainError) setDomainError('');
                              }}
                            />
                            {domainError ? <p className="mt-1 text-xs text-red-500">{domainError}</p> : null}
                          </div>
                          {confirmReplace ? (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs">
                              <p className="font-semibold text-amber-900 dark:text-amber-200 mb-2">Replace existing token?</p>
                              <div className="flex gap-2">
                                <button type="button" className={primaryBtnClass} disabled={saving} onClick={() => handleCreate(true)}>
                                  Replace
                                </button>
                                <button type="button" className="px-3 py-2 text-xs border rounded-lg" onClick={() => setConfirmReplace(false)}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button type="button" className={`${primaryBtnClass} w-full`} disabled={saving} onClick={() => handleCreate(false)}>
                              {saving ? 'Creating…' : 'Create Token'}
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="p-4 text-xs text-gray-500 dark:text-gray-400">Turn on the toggle to create a token.</p>
                      )}
                    </>
                  ) : showUpdateForm ? (
                    <div className="p-4 space-y-4">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">Update data</p>
                      <div>
                        <label htmlFor="edit-ip" className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          Allowed IP
                        </label>
                        <input
                          id="edit-ip"
                          className={`${inputClass} ${ipError ? 'border-red-400' : ''}`}
                          value={ip}
                          onChange={(e) => {
                            setIp(e.target.value);
                            if (ipError) setIpError('');
                          }}
                        />
                        {ipError ? <p className="mt-1 text-xs text-red-500">{ipError}</p> : null}
                      </div>
                      <div>
                        <label htmlFor="edit-domain" className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          Domain
                        </label>
                        <input
                          id="edit-domain"
                          className={`${inputClass} ${domainError ? 'border-red-400' : ''}`}
                          value={domain}
                          onChange={(e) => {
                            setDomain(e.target.value);
                            if (domainError) setDomainError('');
                          }}
                        />
                        {domainError ? <p className="mt-1 text-xs text-red-500">{domainError}</p> : null}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" className={`${primaryBtnClass} flex-1`} disabled={saving} onClick={handleUpdateData}>
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="px-3 py-2 text-xs border border-gray-300 dark:border-slate-600 rounded-lg"
                          onClick={() => setShowUpdateForm(false)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 dark:text-gray-400">Status</span>
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">Active</span>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500 dark:text-gray-400">Token</span>
                        <p className="mt-0.5 font-mono text-[11px] leading-relaxed break-all text-gray-900 dark:text-gray-100">
                          {displayToken}
                        </p>
                        {displayToken ? (
                          <button type="button" onClick={copyToken} className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                            Copy token
                          </button>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-1 gap-2 text-xs">
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Allowed IP</span>
                          <p className="font-mono text-gray-900 dark:text-gray-100">{status.token?.allowedIp || '—'}</p>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-gray-400">Domain</span>
                          <p className="break-all text-gray-900 dark:text-gray-100">{status.token?.allowedDomain || '—'}</p>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button type="button" className={`${primaryBtnClass} flex-1`} onClick={() => setShowUpdateForm(true)}>
                          Update Data
                        </button>
                        <button
                          type="button"
                          disabled={deleting}
                          onClick={handleDeleteData}
                          className="px-3 py-2.5 text-xs font-semibold rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-60"
                        >
                          {deleting ? 'Deleting…' : 'Delete Data'}
                        </button>
                      </div>
                    </div>
                  )}

                </div>

                {hasToken ? (
                  <div className={cardClass + ' p-4'}>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Approved Template</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-2">Link a template for API sends</p>
                    <select
                      className={inputClass}
                      value={selectedTemplateId}
                      disabled={templatesLoading || savingTemplate}
                      onChange={(e) => handleTemplateChange(e.target.value)}
                    >
                      <option value="">Select template</option>
                      {approvedTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    {templatesLoading ? <p className="mt-2 text-xs text-gray-500">Loading…</p> : null}
                    <TemplatePreviewCard template={selectedTemplate} />
                  </div>
                ) : null}
              </div>

              {/* RIGHT — API docs always visible */}
              <div className="min-h-[480px]">
                <ApiDocsPanel
                  apiRoot={apiRoot}
                  selectedTemplate={selectedTemplate}
                  projectId={projectId}
                  displayToken={displayToken}
                  allowedDomain={status.token?.allowedDomain || domain}
                  allowedIp={status.token?.allowedIp || ip}
                />
              </div>
            </div>

            {statusLoading ? (
              <p className="text-center text-xs text-gray-500 dark:text-gray-400 mt-4">Loading token status…</p>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}
