import { useEffect, useState } from 'react';
import BrandLogoMark, { BrandLogoWatermark } from '../components/BrandLogoMark';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { login, requestPasswordReset, resetPassword, getProfile } from '../services/authService';
import { getConversationQuota } from '../services/dashboardService';
import ThemeToggle from '../components/ThemeToggle';
import PasswordInput from '../components/PasswordInput';

const inputClass =
  'w-full rounded-xl border-2 border-gray-200/90 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition-all placeholder:text-gray-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10 sm:py-3';

const AUTH_MARQUEE_TAGS = [
  'Waabizx',
  'WhatsApp Business',
  'Broadcast',
  'Templates',
  'Live inbox',
  'Analytics',
  'Campaigns',
  'Team routing',
  'API ready',
];

function Login() {
  const TERMS_FILE_HREF = '/Terms-and-Conditions-Waabizx.pdf';
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState({
    email: location.state?.email ?? '',
    password: '',
  });
  const showRegisteredMessage = !!location.state?.registered;
  const showPasswordResetMessage = !!location.state?.passwordReset;
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(location.pathname === '/login/forgot-password');
  const [forgotStep, setForgotStep] = useState('request'); // request | reset
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotInfo, setForgotInfo] = useState('');

  const isForgotPasswordRoute = location.pathname === '/login/forgot-password';

  useEffect(() => {
    setForgotOpen(isForgotPasswordRoute);
    if (isForgotPasswordRoute) {
      setForgotStep('request');
      setForgotError('');
      setForgotLoading(false);
      setForgotOtp('');
      setForgotNewPassword('');
      setForgotConfirmPassword('');
      setForgotEmail(location.state?.email ?? formData.email ?? '');
    }
  }, [isForgotPasswordRoute]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await login(formData.email, formData.password);
      console.log('LOGIN RESPONSE:', response);

      if (response.success && response.token) {
        localStorage.setItem('token', response.token);
        // Source-of-truth role: profile from backend after token is set.
        // This avoids stale/partial login payloads.
        let resolvedUser = response.user || { id: response.id, name: response.name, role: response.role };
        try {
          const profile = await getProfile();
          if (profile && typeof profile === 'object') {
            resolvedUser = profile.user || profile;
          }
        } catch (_) {
          // Keep fallback from login response if profile fetch fails.
        }

        localStorage.setItem('user', JSON.stringify(resolvedUser));
        const normalizedRole = (resolvedUser.role || response.role || '')
          .toString()
          .toLowerCase()
          .trim()
          .replace(/-/g, '_')
          .replace(/\s+/g, '_');
        localStorage.setItem('role', normalizedRole);


        try {
          const uid = Number(resolvedUser?.id);
          let selectedProjectId = null;
          try {
            const raw = localStorage.getItem('selectedProject');
            if (raw) {
              const sp = JSON.parse(raw);
              selectedProjectId = sp?.id != null ? String(sp.id) : null;
            }
          } catch (_) {
            /* ignore */
          }
          console.log('[Login][WCC] After successful login — what the app will use for WCC', {
            userId: Number.isInteger(uid) ? uid : null,
            email: resolvedUser?.email,
            role: normalizedRole,
            selectedProjectId,
            note: 'WCC balance = users.wcc_credits for this userId, loaded via GET /dashboard/:userId with header x-project-id when a project is selected.',
          });
          if (Number.isInteger(uid) && uid > 0 && selectedProjectId) {
            const quota = await getConversationQuota(uid);
            console.log('[Login][WCC] Quota fetch right after login (same as dashboard WCC card)', {
              wccCreditsShownInUI: quota.wccCredits,
              used24hConversations: quota.used,
              remainingDailySendSlot: quota.remaining,
              limit: quota.limit,
            });
          } else if (Number.isInteger(uid) && uid > 0) {
            console.log(
              '[Login][WCC] Skipping quota call — no selectedProject in localStorage yet. Open /admin (or project dashboard) so a project is selected; then WCC loads in the right panel.'
            );
          }
        } catch (wccLogErr) {
          console.warn('[Login][WCC] Optional quota log failed', wccLogErr?.message || wccLogErr);
        }

        if (normalizedRole === 'super_admin' || normalizedRole === 'superadmin') {
          navigate('/super-admin');
        } else if (normalizedRole === 'admin') {
          navigate('/project-dashboard');
        } else if (normalizedRole === 'manager') {
          navigate('/admin');
        } else if (normalizedRole === 'agent') {
          navigate('/agent');
        } else {
          navigate('/admin');
        }
        return;
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotRequest = async (e) => {
    e?.preventDefault?.();
    setForgotError('');
    setForgotInfo('');
    setForgotLoading(true);
    setForgotOtp('');
    try {
      const response = await requestPasswordReset(forgotEmail);
      if (response?.success) {
        setForgotInfo(
          response?.message ||
            `If an account exists for ${forgotEmail}, you will receive an OTP at that email address shortly.`
        );
        setForgotStep('reset');
      } else {
        setForgotError(response?.message || 'Failed to send OTP');
      }
    } catch (err) {
      setForgotError(err.message || 'Failed to send OTP');
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotReset = async (e) => {
    e?.preventDefault?.();
    setForgotError('');

    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError('Passwords do not match');
      return;
    }

    setForgotLoading(true);
    try {
      const response = await resetPassword(forgotEmail, forgotOtp, forgotNewPassword);
      if (response?.success) {
        setForgotOpen(false);
        setForgotStep('request');
        setForgotEmail('');
        setForgotOtp('');
        setForgotNewPassword('');
        setForgotConfirmPassword('');

        navigate('/login', { state: { passwordReset: true }, replace: true });
      } else {
        setForgotError(response?.message || 'Password reset failed');
      }
    } catch (err) {
      setForgotError(err.message || 'Password reset failed');
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="login-page fixed inset-0 z-[1] flex flex-col overflow-hidden overscroll-none bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -right-24 -top-32 h-[28rem] w-[28rem] rounded-full bg-sky-400/25 blur-3xl" />
        <div className="absolute -left-32 top-1/3 h-[22rem] w-[22rem] rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-[20rem] w-[20rem] rounded-full bg-cyan-300/20 blur-3xl" />
      </div>

      <div className="relative grid h-full min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Brand column — premium mesh + glass panels */}
        <aside className="relative hidden h-full min-h-0 overflow-hidden lg:flex lg:flex-col">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-900 via-blue-950 to-slate-950" aria-hidden />
          <div
            className="absolute inset-0 bg-[radial-gradient(ellipse_90%_55%_at_10%_15%,rgba(56,189,248,0.28),transparent_52%)]"
            aria-hidden
          />
          <div
            className="absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_95%_85%,rgba(59,130,246,0.22),transparent_50%)]"
            aria-hidden
          />
          <div
            className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px]"
            aria-hidden
          />
          <div
            className="absolute inset-0 opacity-[0.45] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[length:22px_22px]"
            aria-hidden
          />
          <div
            className="auth-left-ambient-orb pointer-events-none absolute -right-4 top-24 h-[420px] w-[420px] rounded-full bg-sky-500/10 blur-3xl"
            aria-hidden
          />
          <BrandLogoWatermark className="absolute bottom-6 right-0 h-44 w-auto xl:h-52" />

          <div className="relative z-10 flex h-full min-h-0 flex-col overflow-hidden px-8 py-8 text-white shadow-2xl shadow-black/20 xl:px-11 xl:py-10">
            <header className="flex shrink-0 items-center gap-3.5">
              <div className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center xl:h-[58px] xl:w-[58px]">
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
                  <div className="auth-logo-orbit-ring h-[52px] w-[52px] rounded-full border-2 border-white/10 border-t-sky-300/80 border-r-sky-400/35 xl:h-[58px] xl:w-[58px]" />
                </div>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-70" aria-hidden>
                  <div className="auth-logo-orbit-ring--reverse h-[44px] w-[44px] rounded-full border border-dashed border-white/30 xl:h-[50px] xl:w-[50px]" />
                </div><BrandLogoMark size="lg" className="auth-brand-logo-pulse relative z-10" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold tracking-tight xl:text-lg">Waabizx</p>
                <p className="text-[10px] font-medium uppercase tracking-wider text-sky-200/80 xl:text-[11px]">
                  WhatsApp Business Platform
                </p>
              </div>
            </header>

            <div
              className="auth-marquee-sheen relative mt-3 shrink-0 overflow-hidden rounded-lg border border-white/10 py-2 shadow-inner ring-1 ring-white/5 xl:mt-4 xl:py-2.5"
              aria-hidden
            >
              <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-8 bg-gradient-to-r from-blue-950 to-transparent xl:w-12" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-8 bg-gradient-to-l from-blue-950 to-transparent xl:w-12" />
              <div className="auth-marquee-row">
                {[...AUTH_MARQUEE_TAGS, ...AUTH_MARQUEE_TAGS].map((tag, i) => (
                  <span
                    key={`${tag}-${i}`}
                    className="flex items-center gap-3 whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.14em] text-sky-100/95 xl:text-[10px]"
                  >
                    {tag}
                    <span className="h-1 w-1 shrink-0 rounded-full bg-sky-300/70 shadow-[0_0_6px_rgba(125,211,252,0.6)]" />
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden xl:mt-4 xl:gap-3">
              <div className="max-w-lg shrink-0">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/90 xl:mb-2 xl:text-[11px]">
                  Secure access
                </p>
                <h2 className="text-xl font-bold leading-snug tracking-tight xl:text-3xl xl:leading-tight">
                  Welcome to your workspace
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-sky-100/88 xl:mt-3 xl:text-sm">
                  Campaigns, broadcast, inbox, and analytics — unified in one clean dashboard.
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                {[
                  { k: 'Messaging', v: '98.9% delivery' },
                  { k: 'Teams', v: 'Smart routing' },
                  { k: 'Insights', v: 'Live metrics' },
                ].map(({ k, v }) => (
                  <div
                    key={k}
                    className="rounded-lg border border-white/20 bg-white/[0.1] px-3 py-1.5 shadow-md backdrop-blur-md xl:rounded-xl xl:px-4 xl:py-2"
                  >
                    <p className="text-[9px] font-bold uppercase tracking-wider text-sky-200/75 xl:text-[10px]">{k}</p>
                    <p className="mt-0.5 text-xs font-bold text-white xl:text-sm">{v}</p>
                  </div>
                ))}
              </div>

              <div className="relative h-[200px] shrink-0 overflow-hidden rounded-xl border border-white/20 bg-gradient-to-br from-white/[0.08] to-white/[0.03] p-0.5 shadow-xl shadow-sky-950/20 backdrop-blur-md ring-1 ring-white/15 xl:h-[220px] xl:rounded-2xl">
                <div className="relative h-full rounded-[0.65rem] bg-slate-950/55 p-2.5 xl:rounded-[0.9rem] xl:p-3">
                  <div
                    className="auth-inbox-top-glow pointer-events-none absolute inset-x-4 top-2 h-px rounded-full bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent xl:inset-x-5"
                    aria-hidden
                  />
                  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden>
                    <div className="auth-inbox-shimmer-beam absolute -left-1/2 top-1/4 h-[55%] w-1/2 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
                  </div>

                  <div className="relative mb-1.5 flex items-center justify-between gap-2 xl:mb-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500/35 to-emerald-500/25 ring-1 ring-white/15">
                        <svg className="h-3.5 w-3.5 text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                          />
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-bold text-white xl:text-[11px]">Waabizx Inbox</p>
                        <p className="truncate text-[9px] font-medium text-sky-200/70">Live conversation preview</p>
                      </div>
                    </div>
                    <span className="auth-inbox-live-pill shrink-0 rounded-md bg-emerald-500/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-100 ring-1 ring-emerald-400/35 xl:text-[10px]">
                      Live
                    </span>
                  </div>

                  <div className="relative space-y-1.5 overflow-hidden rounded-lg border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/95 p-2 shadow-inner xl:space-y-2 xl:rounded-xl xl:p-2.5">
                    <div className="flex justify-start">
                      <div className="auth-inbox-bubble-a max-w-[92%] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.11] px-2.5 py-1.5 shadow-sm backdrop-blur-[2px] xl:px-3 xl:py-2">
                        <p className="text-[10px] font-medium leading-snug text-white/95 xl:text-[11px]">
                          Hi — is my order out for delivery? Need ETA too.
                        </p>
                        <p className="mt-0.5 text-[9px] text-white/40">Customer · WhatsApp</p>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="auth-inbox-bubble-b max-w-[92%] rounded-2xl rounded-br-md border border-sky-400/25 bg-gradient-to-br from-sky-500/45 via-sky-600/35 to-emerald-600/30 px-2.5 py-1.5 shadow-md shadow-sky-900/20 xl:px-3 xl:py-2">
                        <p className="text-[10px] font-semibold leading-snug text-white xl:text-[11px]">
                          Yes! Shipped this morning. ETA: 4:30 PM. Track link sent ✓
                        </p>
                        <p className="mt-0.5 text-right text-[9px] font-medium text-sky-100/70">Waabizx · auto</p>
                      </div>
                    </div>
                    <div className="flex justify-start pt-0.5">
                      <div
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.08] px-2.5 py-1.5 ring-1 ring-white/5"
                        aria-hidden
                      >
                        <span className="auth-inbox-dot inline-block h-1.5 w-1.5 rounded-full bg-sky-300" />
                        <span className="auth-inbox-dot inline-block h-1.5 w-1.5 rounded-full bg-sky-300" />
                        <span className="auth-inbox-dot inline-block h-1.5 w-1.5 rounded-full bg-sky-300" />
                        <span className="ml-1 text-[9px] font-medium text-white/45">typing…</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2">
                      {[
                        { label: 'SLA', value: '< 2m' },
                        { label: 'CSAT', value: '4.9/5' },
                        { label: 'Active', value: '412' },
                      ].map((kpi) => (
                        <span
                          key={kpi.label}
                          className="rounded-full border border-white/10 bg-white/[0.08] px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-sky-100/85"
                        >
                          {kpi.label} {kpi.value}
                        </span>
                      ))}
                    </div>

                    <div className="flex h-6 items-end justify-center gap-1.5 border-t border-white/5 pt-1.5 xl:h-7 xl:gap-2 xl:pt-2">
                      {[44, 72, 100, 58, 36].map((pct, i) => (
                        <div key={i} className="flex h-6 w-1.5 items-end justify-center xl:h-7 xl:w-2">
                          <div
                            className="auth-inbox-meter-bar w-full rounded-sm bg-gradient-to-t from-sky-500/55 to-emerald-400/45 shadow-sm shadow-sky-500/10"
                            style={{ height: `${pct}%` }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-2 shrink-0 rounded-xl border border-white/15 bg-gradient-to-br from-white/[0.16] to-white/[0.05] p-3.5 shadow-xl backdrop-blur-xl xl:mt-3 xl:rounded-2xl xl:p-4">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200/90 xl:mb-3 xl:text-[11px]">
                Why teams choose Waabizx
              </p>
              <ul className="space-y-2 text-xs font-medium leading-snug text-white/95 xl:space-y-2.5 xl:text-sm">
                {[
                  'Template messages, approvals, and broadcast flows',
                  'Live inbox with smart routing and agent handover',
                  'AI-assisted replies for faster first response',
                  'Revenue-focused analytics that scale with volume',
                ].map((item) => (
                  <li key={item} className="flex gap-2 xl:gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 ring-1 ring-emerald-400/35 xl:h-6 xl:w-6">
                      <svg className="h-3 w-3 text-emerald-300 xl:h-3.5 xl:w-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        {/* Form column */}
        <main className="flex h-full min-h-0 flex-col justify-center overflow-hidden px-4 py-6 sm:px-6 lg:px-10 xl:px-14">
          <div className="mx-auto w-full max-w-md shrink-0">
            <div className="mb-4 text-center lg:hidden">
              <div className="mx-auto mb-2 flex justify-center">
                <BrandLogoMark size="lg" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-600/90 dark:text-sky-400/90">Waabizx</p>
            </div>

            {!forgotOpen ? (
              <div className="mb-4 text-center lg:mb-5 lg:text-left">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-600/90 lg:mb-1.5 lg:text-[11px] lg:text-sky-600">
                  Sign in
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                  <span className="bg-gradient-to-r from-gray-900 via-sky-800 to-gray-800 bg-clip-text text-transparent">
                    Welcome
                  </span>
                </h1>
                <p className="mt-1 text-xs text-gray-600 sm:text-sm">Use your work email to access the dashboard.</p>
              </div>
            ) : (
              <div className="mb-4 text-center lg:mb-5 lg:text-left">
                <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-600/90 lg:mb-1.5 lg:text-[11px] lg:text-sky-600">
                  Forgot password
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                  <span className="bg-gradient-to-r from-gray-900 via-sky-800 to-gray-800 bg-clip-text text-transparent">
                    Reset password
                  </span>
                </h1>
                <p className="mt-1 text-xs text-gray-600 sm:text-sm">Enter your email to receive an OTP.</p>
              </div>
            )}

            <div className="relative overflow-hidden rounded-2xl border border-gray-100/90 bg-white/95 p-5 shadow-xl shadow-sky-900/[0.06] ring-1 ring-gray-100/80 backdrop-blur-sm sm:p-6">
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-600"
                aria-hidden
              />

              <div className="relative pt-1">
                {!forgotOpen && (
                  <>
                    {showRegisteredMessage && (
                  <div
                    className="mb-4 rounded-xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50/90 to-teal-50/50 p-3 text-xs font-medium text-emerald-900 ring-1 ring-emerald-100/80 sm:p-4 sm:text-sm"
                    role="status"
                  >
                    <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                    Account created successfully. Please sign in.
                  </div>
                )}
                {showPasswordResetMessage && (
                  <div
                    className="mb-4 rounded-xl border border-emerald-200/90 bg-gradient-to-r from-emerald-50/90 to-teal-50/50 p-3 text-xs font-medium text-emerald-900 ring-1 ring-emerald-100/80 sm:p-4 sm:text-sm"
                    role="status"
                  >
                    <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </span>
                    Password reset successfully. Please sign in.
                  </div>
                )}
                {error && (
                  <div
                    className="mb-4 rounded-xl border border-red-200/90 bg-red-50/90 p-3 text-xs font-medium text-red-800 ring-1 ring-red-100/80 sm:p-4 sm:text-sm"
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4">
                  <div>
                    <label htmlFor="email" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:mb-2 sm:text-xs">
                      Email
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      autoComplete="email"
                      className={inputClass}
                      placeholder="you@company.com"
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:mb-2 sm:text-xs">
                      Password
                    </label>
                    <PasswordInput
                      id="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      required
                      autoComplete="current-password"
                      className={inputClass}
                      placeholder="••••••••"
                    />
                  </div>

                  <div className="rounded-xl border border-gray-200/90 bg-gray-50/70 px-3 py-2.5">
                    <label className="flex items-start gap-2.5 text-[11px] leading-relaxed text-gray-600 sm:text-xs">
                      <input
                        type="checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span>
                        By signing in, you agree to our{' '}
                        <a
                          href={TERMS_FILE_HREF}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.preventDefault();
                            window.open(TERMS_FILE_HREF, '_blank', 'noopener,noreferrer');
                          }}
                          className="font-semibold text-sky-700 hover:text-sky-800 underline underline-offset-2"
                        >
                          Terms of Service
                        </a>.
                      </span>
                    </label>
                  </div>

                  <div className="flex items-center justify-end pt-0.5">
                    <button
                      type="button"
                      className="text-sm font-semibold text-sky-600 transition-colors hover:text-sky-800"
                      onClick={() => {
                        navigate('/login/forgot-password', {
                          state: { email: formData.email || '' }
                        });
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !acceptedTerms}
                    className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/25 transition-all hover:from-sky-500 hover:to-blue-500 hover:shadow-xl active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:min-h-[48px] sm:py-3.5"
                  >
                    {loading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                        Signing in…
                      </>
                    ) : (
                      'Sign in'
                    )}
                  </button>
                  </form>
                  </>
                )}

                {forgotOpen && (
                  <div className="mt-4 rounded-xl border border-sky-100/90 bg-sky-50/40 p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-sky-800">Forgot password</p>
                      <button
                        type="button"
                        className="text-sm font-semibold text-sky-600 transition-colors hover:text-sky-800"
                        onClick={() => {
                          setForgotInfo('');
                          navigate('/login', { replace: true });
                        }}
                      >
                        Close
                      </button>
                    </div>

                    {forgotError && (
                      <div
                        className="mt-3 rounded-xl border border-red-200/90 bg-red-50/90 p-3 text-xs font-medium text-red-800 ring-1 ring-red-100/80 sm:p-4 sm:text-sm"
                        role="alert"
                      >
                        {forgotError}
                      </div>
                    )}

                    {forgotInfo && forgotStep === 'reset' && (
                      <div
                        className="mt-3 rounded-xl border border-emerald-200/90 bg-emerald-50/90 p-3 text-xs font-medium text-emerald-800 ring-1 ring-emerald-100/80 sm:p-4 sm:text-sm"
                        role="status"
                      >
                        {forgotInfo}
                      </div>
                    )}

                    {forgotStep === 'request' ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleForgotRequest(e);
                        }}
                        className="mt-3 space-y-3.5 sm:space-y-4"
                      >
                        <div>
                          <label htmlFor="forgotEmail" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:mb-2 sm:text-xs">
                            Email
                          </label>
                          <input
                            type="email"
                            id="forgotEmail"
                            name="forgotEmail"
                            value={forgotEmail}
                            onChange={(e) => setForgotEmail(e.target.value)}
                            required
                            autoComplete="email"
                            className={inputClass}
                            placeholder="you@company.com"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={forgotLoading}
                          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/25 transition-all hover:from-sky-500 hover:to-blue-500 hover:shadow-xl active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:min-h-[48px] sm:py-3.5"
                        >
                          {forgotLoading ? 'Sending…' : 'Send OTP'}
                        </button>
                      </form>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleForgotReset(e);
                        }}
                        className="mt-3 space-y-3.5 sm:space-y-4"
                      >
                        <div>
                          <label htmlFor="forgotOtp" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:mb-2 sm:text-xs">
                            OTP
                          </label>
                          <input
                            type="text"
                            id="forgotOtp"
                            name="forgotOtp"
                            value={forgotOtp}
                            onChange={(e) => setForgotOtp(e.target.value.replace(/\\D/g, '').slice(0, 6))}
                            required
                            inputMode="numeric"
                            className={inputClass}
                            placeholder="Enter OTP"
                          />
                        </div>

                        <div>
                          <label htmlFor="forgotNewPassword" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:mb-2 sm:text-xs">
                            New password
                          </label>
                          <PasswordInput
                            id="forgotNewPassword"
                            name="forgotNewPassword"
                            value={forgotNewPassword}
                            onChange={(e) => setForgotNewPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                            className={inputClass}
                            placeholder="At least 4 characters"
                          />
                        </div>

                        <div>
                          <label htmlFor="forgotConfirmPassword" className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:mb-2 sm:text-xs">
                            Confirm password
                          </label>
                          <PasswordInput
                            id="forgotConfirmPassword"
                            name="forgotConfirmPassword"
                            value={forgotConfirmPassword}
                            onChange={(e) => setForgotConfirmPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                            className={inputClass}
                            placeholder="Repeat password"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={forgotLoading}
                          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/25 transition-all hover:from-sky-500 hover:to-blue-500 hover:shadow-xl active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:min-h-[48px] sm:py-3.5"
                        >
                          {forgotLoading ? 'Resetting…' : 'Reset password'}
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {!forgotOpen && (
                  <div className="relative mt-5 border-t border-gray-100/90 pt-4 text-center sm:mt-6 sm:pt-5">
                    <p className="text-xs text-gray-600 sm:text-sm">
                      Don&apos;t have an account?{' '}
                      <Link to="/register" className="font-bold text-sky-600 transition-colors hover:text-sky-800">
                        Create one free
                      </Link>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default Login;
