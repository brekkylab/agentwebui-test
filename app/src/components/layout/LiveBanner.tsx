// LIVE backend-v2 banner — same role as app-live's top banner.
// Tells the user this is the live adapter and gives an instant logout.

import { useNavigate } from '@tanstack/react-router';
import { useAuthStore } from '@/stores/auth';
import { getBaseUrl } from '@/api/client';

export function LiveBanner() {
  const navigate = useNavigate();
  const reset = useAuthStore((s) => s.reset);

  function logout() {
    reset();
    navigate({ to: '/login' });
  }

  return (
    <div className="cw-live-banner">
      <span><strong>LIVE backend-v2</strong>: auth/projects/sessions/messages/files · {getBaseUrl()}</span>
      <span className="is-demo">Unsupported rich metadata is labeled local demo</span>
      <button type="button" onClick={logout}>Logout</button>
    </div>
  );
}
