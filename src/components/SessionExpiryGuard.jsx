import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import SessionExpiredModal from './SessionExpiredModal';
import {
  SESSION_EXPIRED_EVENT_NAME,
  consumeSessionExpiredFlag,
} from '../services/sessionExpiryService';

export default function SessionExpiryGuard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (consumeSessionExpiredFlag()) {
      setOpen(true);
      if (!location.pathname.startsWith('/login')) {
        navigate('/login', { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onSessionExpired = () => {
      setOpen(true);
      if (!window.location.pathname.startsWith('/login')) {
        navigate('/login', { replace: true });
      }
    };

    window.addEventListener(SESSION_EXPIRED_EVENT_NAME, onSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT_NAME, onSessionExpired);
  }, [navigate]);

  return (
    <SessionExpiredModal
      open={open}
      onClose={() => setOpen(false)}
    />
  );
}
