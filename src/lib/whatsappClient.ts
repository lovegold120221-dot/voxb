const SANDBOX_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SANDBOX_URL)
  || 'http://168.231.78.113';

export async function startWhatsAppPairing(userId: string): Promise<{ pairingCode: string }> {
  const res = await fetch(`${SANDBOX_URL}/api/whatsapp/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Pairing request failed' }));
    throw new Error(err.error || `Server returned ${res.status}`);
  }
  return res.json();
}

export async function getWhatsAppStatus(userId: string): Promise<{
  status: string;
  qrCode?: string;
  phone?: string;
  error?: string;
}> {
  const res = await fetch(`${SANDBOX_URL}/api/whatsapp/status/${encodeURIComponent(userId)}`);
  if (!res.ok) return { status: 'error', error: `Server returned ${res.status}` };
  return res.json();
}

export async function disconnectWhatsApp(userId: string): Promise<void> {
  await fetch(`${SANDBOX_URL}/api/whatsapp/disconnect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  });
}

export async function sendWhatsAppMessage(userId: string, to: string, text: string): Promise<any> {
  const res = await fetch(`${SANDBOX_URL}/api/whatsapp/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, to, text }),
  });
  return res.json();
}

export async function callWhatsAppTool(
  userId: string,
  tool: string,
  params: Record<string, any>,
  permissions?: Record<string, boolean>,
): Promise<any> {
  const res = await fetch(`${SANDBOX_URL}/api/whatsapp/tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, tool, params, permissions }),
  });
  return res.json();
}
