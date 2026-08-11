import { useState } from 'react';
import BrandLogoMark, { BrandLogoWatermark } from '../components/BrandLogoMark';
import { useNavigate, Link } from 'react-router-dom';
import { register } from '../services/authService';
import ThemeToggle from '../components/ThemeToggle';
import PasswordInput from '../components/PasswordInput';

const inputClass =
  'w-full rounded-xl border-2 border-gray-200/90 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition-all placeholder:text-gray-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10 sm:py-3';

const AUTH_MARQUEE_TAGS = [
  'Waabizx',
  'WhatsApp Business',
  'Onboarding',
  'Templates',
  'Live inbox',
  'Analytics',
  'Multi-project',
  'Role-based',
  'Scale ready',
];

const REGISTER_COUNTRIES = [
  { code: 'IN', name: 'India', dialCode: '+91', mobileLength: 10 },
  { code: 'US', name: 'United States', dialCode: '+1', mobileLength: 10 },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', mobileLength: 10 },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', mobileLength: 9 },
  { code: 'SG', name: 'Singapore', dialCode: '+65', mobileLength: 8 },
  { code: 'CA', name: 'Canada', dialCode: '+1', mobileLength: 10 },
  { code: 'AU', name: 'Australia', dialCode: '+61', mobileLength: 9 },
  { code: 'DE', name: 'Germany', dialCode: '+49', mobileLength: 11 },
  { code: 'FR', name: 'France', dialCode: '+33', mobileLength: 9 },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '+966', mobileLength: 9 },
];

const countryFlag = (isoCode) => {
  const code = String(isoCode || '').trim().toUpperCase();
  if (code.length !== 2) return '';
  return code.replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
};

const formatCountryOption = (item) => `${countryFlag(item.code)} ${item.name} (${item.dialCode})`;

function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    country: 'IN',
    countryCode: '+91',
    mobileNumber: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const hasError = Boolean(error);
  const selectedCountry =
    REGISTER_COUNTRIES.find((item) => item.code === formData.country) || REGISTER_COUNTRIES[0];

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'country') {
      const nextCountry = REGISTER_COUNTRIES.find((item) => item.code === value) || REGISTER_COUNTRIES[0];
      setFormData((prev) => ({
        ...prev,
        country: nextCountry.code,
        countryCode: nextCountry.dialCode,
        mobileNumber: '',
      }));
      setError('');
      return;
    }

    const nextValue =
      name === 'mobileNumber'
        ? value.replace(/\D/g, '').slice(0, selectedCountry.mobileLength)
        : value;

    setFormData({
      ...formData,
      [name]: nextValue,
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 4) {
      setError('Password must be at least 4 characters long');
      return;
    }

    if (!formData.country || !formData.countryCode) {
      setError('Please select your country');
      return;
    }

    if (!formData.mobileNumber || formData.mobileNumber.length < 6) {
      setError('Please enter a valid WhatsApp mobile number');
      return;
    }

    setLoading(true);

    try {
      const response = await register(
        formData.name,
        formData.email,
        formData.password,
        formData.mobileNumber,
        formData.country,
        formData.countryCode
      );
      if (response.success) {
        navigate('/register/verify-otp', {
          state: {
            email: formData.email,
            mobileNumber: formData.mobileNumber,
            country: formData.country,
            countryCode: formData.countryCode,
            otpExpiresInSeconds: Number(response.expiresInSeconds || 600),
          },
        });
      } else {
        setError(response?.message || 'Registration failed. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1] flex flex-col overflow-hidden overscroll-none bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -right-24 -top-32 h-[28rem] w-[28rem] rounded-full bg-sky-400/25 blur-3xl" />
        <div className="absolute -left-32 top-1/4 h-[22rem] w-[22rem] rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute bottom-1/3 left-1/3 h-[18rem] w-[18rem] rounded-full bg-emerald-300/15 blur-3xl" />
      </div>

      <div className="relative grid h-full min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <aside className="relative hidden h-full min-h-0 overflow-hidden lg:flex lg:flex-col">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-900 via-blue-950 to-slate-950" aria-hidden />
          <div
            className="absolute inset-0 bg-[radial-gradient(ellipse_85%_50%_at_15%_20%,rgba(45,212,191,0.12),transparent_50%)]"
            aria-hidden
          />
          <div
            className="absolute inset-0 bg-[radial-gradient(ellipse_75%_50%_at_100%_90%,rgba(59,130,246,0.24),transparent_52%)]"
            aria-hidden
          />
          <div
            className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px]"
            aria-hidden
          />
          <div
            className="absolute inset-0 opacity-[0.45] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.055)_1px,transparent_1px)] bg-[length:22px_22px]"
            aria-hidden
          />
          <div
            className="auth-left-ambient-orb pointer-events-none absolute left-1/4 top-1/3 h-80 w-80 -translate-x-1/2 rounded-full bg-teal-400/10 blur-3xl"
            aria-hidden
          />
          <BrandLogoWatermark className="absolute bottom-4 right-0 h-44 w-auto xl:h-52" />

          <div className="relative z-10 flex h-full min-h-0 flex-col overflow-hidden px-8 py-8 text-white shadow-2xl shadow-black/20 xl:px-11 xl:py-10">
            <header className="flex shrink-0 items-center gap-3.5">
              <div className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center xl:h-[58px] xl:w-[58px]">
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
                  <div className="auth-logo-orbit-ring h-[52px] w-[52px] rounded-full border-2 border-white/10 border-t-teal-300/75 border-r-sky-400/35 xl:h-[58px] xl:w-[58px]" />
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
                    <span className="h-1 w-1 shrink-0 rounded-full bg-teal-300/70 shadow-[0_0_6px_rgba(94,234,212,0.5)]" />
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden xl:mt-4 xl:gap-3">
              <div className="max-w-lg shrink-0">
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-teal-200/90 xl:mb-2 xl:text-[11px]">
                  Get started
                </p>
                <h2 className="text-xl font-bold leading-snug tracking-tight xl:text-3xl xl:leading-tight">
                  Start in minutes — scale when you&apos;re ready
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-sky-100/88 xl:mt-3 xl:text-sm">
                  One account for templates, contacts, campaigns, and real-time conversations with your customers.
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                {[
                  { k: 'Setup', v: 'Under 3 min' },
                  { k: 'Security', v: 'Role-based' },
                  { k: 'Scale', v: 'Multi-project' },
                ].map(({ k, v }) => (
                  <div
                    key={k}
                    className="rounded-lg border border-white/20 bg-white/[0.1] px-3 py-1.5 shadow-md backdrop-blur-md xl:rounded-xl xl:px-4 xl:py-2"
                  >
                    <p className="text-[9px] font-bold uppercase tracking-wider text-teal-200/80 xl:text-[10px]">{k}</p>
                    <p className="mt-0.5 text-xs font-bold text-white xl:text-sm">{v}</p>
                  </div>
                ))}
              </div>

              <div className="relative h-[200px] shrink-0 overflow-hidden rounded-xl border border-white/20 bg-gradient-to-br from-white/[0.08] to-white/[0.03] p-0.5 shadow-xl shadow-sky-950/20 backdrop-blur-md ring-1 ring-white/15 xl:h-[220px] xl:rounded-2xl">
                <div className="relative h-full rounded-[0.65rem] bg-slate-950/55 p-2.5 xl:rounded-[0.9rem] xl:p-3">
                  <div
                    className="auth-inbox-top-glow pointer-events-none absolute inset-x-4 top-2 h-px rounded-full bg-gradient-to-r from-transparent via-teal-400/55 to-transparent xl:inset-x-5"
                    aria-hidden
                  />
                  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]" aria-hidden>
                    <div className="auth-inbox-shimmer-beam absolute -left-1/2 top-1/4 h-[55%] w-1/2 bg-gradient-to-r from-transparent via-teal-200/12 to-transparent" />
                  </div>

                  <div className="relative mb-1.5 flex items-center justify-between gap-2 xl:mb-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500/35 to-sky-500/25 ring-1 ring-white/15">
                        <svg className="h-3.5 w-3.5 text-white/90" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-bold text-white xl:text-[11px]">Waabizx Setup</p>
                        <p className="truncate text-[9px] font-medium text-teal-200/70">Guided onboarding preview</p>
                      </div>
                    </div>
                    <span className="auth-inbox-live-pill shrink-0 rounded-md bg-teal-500/25 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-teal-100 ring-1 ring-teal-400/35 xl:text-[10px]">
                      New
                    </span>
                  </div>

                  <div className="relative space-y-1.5 overflow-hidden rounded-lg border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/95 p-2 shadow-inner xl:space-y-2 xl:rounded-xl xl:p-2.5">
                    <div className="flex justify-start">
                      <div className="auth-inbox-bubble-a max-w-[92%] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.11] px-2.5 py-1.5 shadow-sm backdrop-blur-[2px] xl:px-3 xl:py-2">
                        <p className="text-[10px] font-medium leading-snug text-white/95 xl:text-[11px]">
                          Welcome! Connect your WhatsApp Business number to start onboarding.
                        </p>
                        <p className="mt-0.5 text-[9px] text-white/40">Waabizx · setup</p>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <div className="auth-inbox-bubble-b max-w-[92%] rounded-2xl rounded-br-md border border-teal-400/25 bg-gradient-to-br from-teal-500/40 via-sky-600/35 to-sky-700/30 px-2.5 py-1.5 shadow-md xl:px-3 xl:py-2">
                        <p className="text-[10px] font-semibold leading-snug text-white xl:text-[11px]">
                          Templates submitted. Meta review in progress ✓
                        </p>
                        <p className="mt-0.5 text-right text-[9px] font-medium text-teal-100/75">You · account</p>
                      </div>
                    </div>
                    <div className="flex justify-start pt-0.5">
                      <div
                        className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.08] px-2.5 py-1.5 ring-1 ring-white/5"
                        aria-hidden
                      >
                        <span className="auth-inbox-dot inline-block h-1.5 w-1.5 rounded-full bg-teal-300" />
                        <span className="auth-inbox-dot inline-block h-1.5 w-1.5 rounded-full bg-teal-300" />
                        <span className="auth-inbox-dot inline-block h-1.5 w-1.5 rounded-full bg-teal-300" />
                        <span className="ml-1 text-[9px] font-medium text-white/45">next step…</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2">
                      {[
                        { label: 'Steps', value: '3 left' },
                        { label: 'Review', value: '~ 24h' },
                        { label: 'Go-live', value: 'Fast' },
                      ].map((kpi) => (
                        <span
                          key={kpi.label}
                          className="rounded-full border border-white/10 bg-white/[0.08] px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-teal-100/85"
                        >
                          {kpi.label} {kpi.value}
                        </span>
                      ))}
                    </div>

                    <div className="flex h-6 items-end justify-center gap-1.5 border-t border-white/5 pt-1.5 xl:h-7 xl:gap-2 xl:pt-2">
                      {[38, 68, 100, 52, 30].map((pct, i) => (
                        <div key={i} className="flex h-6 w-1.5 items-end justify-center xl:h-7 xl:w-2">
                          <div
                            className="auth-inbox-meter-bar w-full rounded-sm bg-gradient-to-t from-teal-500/55 to-sky-500/45 shadow-sm shadow-teal-500/10"
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
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-teal-200/85 xl:mb-3 xl:text-[11px]">
                What you unlock with Waabizx
              </p>
              <ul className="space-y-2 text-xs font-medium leading-snug text-white/95 xl:space-y-2.5 xl:text-sm">
                {[
                  'Onboard your team with roles and project workspaces',
                  'Connect WhatsApp Business API without setup friction',
                  'Launch first campaign quickly with guided steps',
                  'Use polished dashboards and inbox from day one',
                ].map((item) => (
                  <li key={item} className="flex gap-2 xl:gap-3">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-400/20 ring-1 ring-teal-400/35 xl:h-6 xl:w-6">
                      <svg className="h-3 w-3 text-teal-300 xl:h-3.5 xl:w-3.5" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
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

        <main className={`flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain px-4 sm:px-6 lg:px-10 xl:px-14 ${hasError ? 'justify-start pt-6 pb-4 lg:pt-8' : 'justify-start py-6 sm:py-8 lg:py-10'}`}>
          <div className="mx-auto w-full max-w-md shrink-0">
            <div className="mb-3 text-center lg:hidden">
              <div className="mx-auto mb-1.5 flex justify-center">
                <BrandLogoMark size="lg" />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-600/90 dark:text-sky-400/90">Waabizx</p>
            </div>

            <div className="mb-4 text-center lg:mb-5 lg:text-left">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-600/90 lg:text-[11px] lg:text-sky-600">
                Create account
              </p>
              <h1 className="overflow-visible text-2xl font-bold leading-[1.25] tracking-tight text-gray-900 sm:text-3xl sm:leading-[1.2]">
                <span className="inline-block bg-gradient-to-r from-gray-900 via-sky-800 to-gray-800 bg-clip-text pb-0.5 text-transparent">
                  Join Waabizx
                </span>
              </h1>
              <p className="mt-1 text-xs text-gray-600 sm:text-sm">Set up your profile — invite your team later.</p>
            </div>

            <div className={`relative overflow-hidden rounded-2xl border border-gray-100/90 bg-white/95 shadow-xl shadow-sky-900/[0.06] ring-1 ring-gray-100/80 backdrop-blur-sm ${hasError ? 'p-3 sm:p-4' : 'p-4 sm:p-5'}`}>
              <div
                className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-emerald-400 via-sky-500 to-blue-600"
                aria-hidden
              />

              <div className="relative pt-1">
                {error && (
                  <div
                    className="mb-3 rounded-xl border border-red-200/90 bg-red-50/90 p-3 text-xs font-medium text-red-800 ring-1 ring-red-100/80 sm:mb-4 sm:p-4 sm:text-sm"
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className={`${hasError ? 'space-y-2' : 'space-y-2.5 sm:space-y-3.5'}`}>
                  <div>
                    <label htmlFor="name" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:mb-1.5 sm:text-xs">
                      Full name
                    </label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      autoComplete="name"
                      className={inputClass}
                      placeholder="Jane Cooper"
                    />
                  </div>

                  <div>
                    <label htmlFor="email" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:mb-1.5 sm:text-xs">
                      Work email
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
                    <label htmlFor="country" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:mb-1.5 sm:text-xs">
                      Country <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="country"
                      name="country"
                      value={formData.country}
                      onChange={handleChange}
                      required
                      className={inputClass}
                    >
                      {REGISTER_COUNTRIES.map((item) => (
                        <option key={item.code} value={item.code}>
                          {formatCountryOption(item)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="mobileNumber" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:mb-1.5 sm:text-xs">
                      WhatsApp mobile number <span className="text-red-500">*</span>
                    </label>
                    <div className="flex gap-2">
                      <div
                        className="flex shrink-0 items-center gap-1.5 rounded-xl border-2 border-gray-200/90 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-700 shadow-sm sm:py-3"
                        aria-label={`Country code ${formData.countryCode}`}
                      >
                        <span className="text-base leading-none" aria-hidden>
                          {countryFlag(formData.country)}
                        </span>
                        <span>{formData.countryCode}</span>
                      </div>
                      <input
                        type="text"
                        id="mobileNumber"
                        name="mobileNumber"
                        value={formData.mobileNumber}
                        onChange={handleChange}
                        required
                        autoComplete="tel-national"
                        inputMode="numeric"
                        maxLength={selectedCountry.mobileLength}
                        className={`${inputClass} min-w-0 flex-1`}
                        placeholder={formData.country === 'IN' ? '9876543210' : 'Mobile number'}
                      />
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500">
                      Enter number without country code
                    </p>
                  </div>

                  <div>
                    <label htmlFor="password" className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:mb-1.5 sm:text-xs">
                      Password
                    </label>
                    <PasswordInput
                      id="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      required
                      autoComplete="new-password"
                      className={inputClass}
                      placeholder="At least 4 characters"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="confirmPassword"
                      className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-gray-500 sm:mb-1.5 sm:text-xs"
                    >
                      Confirm password
                    </label>
                    <PasswordInput
                      id="confirmPassword"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      required
                      autoComplete="new-password"
                      className={inputClass}
                      placeholder="Repeat password"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-1 flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-600/25 transition-all hover:from-sky-500 hover:to-blue-500 hover:shadow-xl active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none sm:mt-2 sm:min-h-[48px] sm:py-3.5"
                  >
                    {loading ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                        Creating account…
                      </>
                    ) : (
                      'Create account'
                    )}
                  </button>
                </form>

                <div className={`relative border-t border-gray-100/90 text-center ${hasError ? 'mt-3 pt-2.5' : 'mt-4 pt-3 sm:mt-5 sm:pt-4'}`}>
                  <p className="text-xs text-gray-600 sm:text-sm">
                    Already registered?{' '}
                    <Link to="/login" className="font-bold text-sky-600 transition-colors hover:text-sky-800">
                      Sign in
                    </Link>
                  </p>
                </div>
              </div>
            </div>

            {!hasError && (
              <p className="mt-3 text-center text-[10px] leading-relaxed text-gray-500 sm:mt-4 sm:text-xs">
                By creating an account, you agree to our{' '}
                <span className="font-medium text-gray-600">Terms of Service</span> and{' '}
                <span className="font-medium text-gray-600">Privacy Policy</span>
              </p>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

export default Register;
