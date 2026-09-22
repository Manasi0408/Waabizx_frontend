import { useEffect, useMemo, useState } from 'react';
import BrandLogoMark, { BrandLogoWatermark } from '../components/BrandLogoMark';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { resendRegisterOtp, verifyRegisterOtp, logout } from '../services/authService';
import ThemeToggle from '../components/ThemeToggle';

const inputClass =
  'w-full rounded-xl border-2 border-gray-200/90 bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm outline-none transition-all placeholder:text-gray-400 focus:border-sky-400 focus:ring-4 focus:ring-sky-500/10 sm:py-3';

const AUTH_MARQUEE_TAGS = [
  'Waabizx',
  'Email OTP',
  'Verification',
  'Secure Login',
  'Templates',
  'Broadcast',
  'Analytics',
];

function RegisterOtpVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = useMemo(() => String(location.state?.email || '').trim().toLowerCase(), [location.state]);
  const mobileNumber = useMemo(() => String(location.state?.mobileNumber || '').trim(), [location.state]);
  const initialTimer = Number(location.state?.otpExpiresInSeconds || 600);

  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [timer, setTimer] = useState(initialTimer);

  useEffect(() => {
    if (!email) {
      navigate('/register', { replace: true });
    }
  }, [email, navigate]);

  useEffect(() => {
    if (timer <= 0) return undefined;
    const id = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [timer]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await verifyRegisterOtp(email, otp);
      if (response.success) {
        try {
          localStorage.removeItem('selectedProject');
        } catch (_) {
          /* ignore */
        }
        logout();
        navigate('/login', { replace: true, state: { email, registered: true } });
      }
    } catch (err) {
      setError(err.message || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setResending(true);
    try {
      const response = await resendRegisterOtp(email);
      if (response.success) {
        setTimer(Number(response.expiresInSeconds || 600));
      }
    } catch (err) {
      setError(err.message || 'Failed to resend OTP');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1] flex flex-col overflow-hidden overscroll-none bg-gradient-to-b from-sky-50/90 via-white to-sky-100/50">
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -right-24 -top-32 h-[28rem] w-[28rem] rounded-full bg-sky-400/25 blur-3xl" />
        <div className="absolute -left-32 top-1/3 h-[22rem] w-[22rem] rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 h-[20rem] w-[20rem] rounded-full bg-cyan-300/20 blur-3xl" />
      </div>

      <div className="relative grid h-full min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
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
          <BrandLogoWatermark className="absolute bottom-6 right-0 h-44 w-auto xl:h-52" />

          <div className="relative z-10 flex h-full min-h-0 flex-col overflow-hidden px-8 py-8 text-white shadow-2xl shadow-black/20 xl:px-11 xl:py-10">
            <header className="flex shrink-0 items-center gap-3.5">
              <div className="relative flex h-[52px] w-[52px] shrink-0 items-center justify-center xl:h-[58px] xl:w-[58px]">
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
                  <div className="auth-logo-orbit-ring h-[52px] w-[52px] rounded-full border-2 border-white/10 border-t-sky-300/80 border-r-sky-400/35 xl:h-[58px] xl:w-[58px]" />
                </div>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-70" aria-hidden>
                  <div className="auth-logo-orbit-ring--reverse h-[44px] w-[44px] rounded-full border border-dashed border-white/30 xl:h-[50px] xl:w-[50px]" />
                </div>
                <BrandLogoMark size="lg" className="auth-brand-logo-pulse relative z-10" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold tracking-tight xl:text-lg">Waabizx</p>
                <p className="text-[10px] font-medium uppercase tracking-wider text-sky-200/80 xl:text-[11px]">
                  WhatsApp Business Platform
                </p>
              </div>
            </header>

            <div className="relative mt-4 shrink-0 overflow-hidden rounded-lg border border-white/10 py-2 shadow-inner ring-1 ring-white/5">
              <div className="auth-marquee-row">
                {[...AUTH_MARQUEE_TAGS, ...AUTH_MARQUEE_TAGS].map((tag, i) => (
                  <span
                    key={`${tag}-${i}`}
                    className="mr-5 inline-flex items-center gap-2 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.14em] text-sky-100/95"
                  >
                    {tag}
                    <span className="h-1 w-1 shrink-0 rounded-full bg-sky-300/70 shadow-[0_0_6px_rgba(125,211,252,0.6)]" />
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 max-w-lg">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-sky-300/90">
                Secure verification
              </p>
              <h2 className="text-3xl font-bold leading-tight tracking-tight">
                Confirm your account with email OTP
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-sky-100/88">
                Fast and secure verification before login. Your code is time-bound for safety.
              </p>
            </div>
          </div>
        </aside>

        <section className="relative flex min-h-0 items-center justify-center p-4 md:p-6">
          <div className="w-full max-w-md rounded-2xl border border-gray-100/90 bg-white/95 p-5 shadow-xl shadow-sky-900/[0.06] ring-1 ring-gray-100/80 backdrop-blur-sm sm:p-6">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-sky-600/90">Verify OTP</p>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Confirm email OTP
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Enter the OTP sent to{' '}
              <span className="font-semibold text-gray-800">{email || 'your email address'}</span>.
            </p>

            {error && (
              <div className="mt-4 rounded-xl border border-red-200/90 bg-red-50/90 p-3 text-sm font-medium text-red-800 ring-1 ring-red-100/80">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <label htmlFor="otp" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-gray-500">
                  OTP
                </label>
                <input
                  type="text"
                  id="otp"
                  name="otp"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  className={inputClass}
                  placeholder="Enter 6-digit OTP"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-gray-600">
                  {timer > 0 ? `OTP expires in ${timer}s` : 'OTP expired'}
                </p>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={timer > 0 || resending}
                  className="text-xs font-semibold text-sky-700 disabled:text-gray-400"
                >
                  {resending ? 'Resending...' : 'Resend OTP'}
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/25 transition-all hover:from-sky-500 hover:to-blue-500 hover:shadow-xl active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Verify OTP'}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-gray-600">
              Back to{' '}
              <Link to="/register" className="font-bold text-sky-600 hover:text-sky-800">
                Register
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default RegisterOtpVerification;
