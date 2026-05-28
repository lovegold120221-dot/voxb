const BACKEND_URL_KEY = 'beatrice_backend_url';

export function getBackendUrl(): string {
  const envUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SANDBOX_URL) || '';
  try {
    const stored = localStorage.getItem(BACKEND_URL_KEY);
    if (stored) return stored.replace(/\/+$/, '');
  } catch {}

  if (envUrl) return envUrl.replace(/\/+$/, '');

  if (typeof window !== 'undefined') {
    const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
    return isLocal ? 'http://localhost:4200' : window.location.origin;
  }

  return 'http://localhost:4200';
}

export function setBackendUrl(url: string): string {
  const cleaned = url.trim().replace(/\/+$/, '');
  try {
    if (cleaned) localStorage.setItem(BACKEND_URL_KEY, cleaned);
    else localStorage.removeItem(BACKEND_URL_KEY);
  } catch {}
  return cleaned || getBackendUrl();
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getBackendUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
  return data as T;
}

export async function startWhatsAppPairing(userId: string): Promise<{ pairingCode: string; status?: string }> {
  return requestJson('/api/whatsapp/pair', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function getWhatsAppStatus(userId: string): Promise<{
  status: string;
  qrCode?: string;
  phone?: string;
  error?: string;
}> {
  const res = await fetch(`${getBackendUrl()}/api/whatsapp/status/${encodeURIComponent(userId)}`);
  if (!res.ok) return { status: 'error', error: `Server returned ${res.status}` };
  return res.json();
}

export async function disconnectWhatsApp(userId: string): Promise<void> {
  await requestJson('/api/whatsapp/disconnect', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function sendWhatsAppMessage(
  userId: string,
  to: string,
  text: string,
  permissions?: Record<string, boolean>,
): Promise<any> {
  return requestJson('/api/whatsapp/send', {
    method: 'POST',
    body: JSON.stringify({ userId, to, text, permissions }),
  });
}

export async function callWhatsAppTool(
  userId: string,
  tool: string,
  params: Record<string, any>,
  permissions?: Record<string, boolean>,
): Promise<any> {
  return requestJson('/api/whatsapp/tool', {
    method: 'POST',
    body: JSON.stringify({ userId, tool, params, permissions }),
  });
}

export async function getWhatsAppMessages(userId: string, limit = 20): Promise<{ messages: any[] }> {
  const res = await fetch(`${getBackendUrl()}/api/whatsapp/messages/${encodeURIComponent(userId)}?limit=${limit}`);
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  return res.json();
}

export async function getWhatsAppAdminOverview(userId: string): Promise<any> {
  return requestJson(`/api/whatsapp/admin/overview/${encodeURIComponent(userId)}`);
}

export async function saveWhatsAppAdminConfig(userId: string, config: Record<string, any>): Promise<any> {
  return requestJson('/api/whatsapp/admin/config', {
    method: 'POST',
    body: JSON.stringify({ userId, config }),
  });
}

export async function sendWhatsAppTestMessage(userId: string, to: string, text: string): Promise<any> {
  return requestJson('/api/whatsapp/admin/test-message', {
    method: 'POST',
    body: JSON.stringify({ userId, to, text }),
  });
}
