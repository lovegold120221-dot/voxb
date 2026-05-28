import { getBackendUrl } from './whatsappClient';

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

export async function createDocumentOnVps(userId: string, args: { title: string; content: string }) {
  return requestJson<{ content?: string; url?: string; title?: string }>('/api/create-document', {
    method: 'POST',
    body: JSON.stringify({ userId, ...args }),
  });
}
