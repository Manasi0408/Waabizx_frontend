import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from 0 up to `value` whenever it mounts or `value` changes.
 * Purely presentational — the final rendered value always equals `value`.
 */
export default function CountUp({
  value = 0,
  duration = 1400,
  decimals = 0,
  suffix = '',
  prefix = '',
  className,
  locale = true,
}) {
  const target = Number(value) || 0;
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    if (target === 0) {
      setDisplay(0);
      return undefined;
    }

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const tick = (now) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const current = target * easeOutCubic(progress);
      setDisplay(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(target);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration]);

  const rounded =
    decimals > 0 ? Number(display.toFixed(decimals)) : Math.round(display);
  const text = locale
    ? rounded.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : String(rounded);

  return (
    <span className={className}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
