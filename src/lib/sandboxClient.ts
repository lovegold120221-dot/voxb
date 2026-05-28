import type { ComputerTask, ComputerStep, ComputerOutput } from './executionDetector';

function getBackendUrl(): string {
  const envUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SANDBOX_URL) || '';
  try {
    const stored = localStorage.getItem('beatrice_backend_url');
    if (stored) return stored.replace(/\/+$/, '');
  } catch {}
  if (envUrl) return envUrl.replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    const isLocal = ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
    return isLocal ? 'http://localhost:4200' : window.location.origin;
  }
  return 'http://localhost:4200';
}

interface BackendTask {
  taskId: string;
  status: string;
  type: string;
  label: string;
  steps: { key: string; label: string; status: string }[];
  previewUrl: string | null;
  downloadUrl: string | null;
  files: { name: string; type: string; size: number; url: string }[];
  error: string | null;
  output: { type: string; title: string; content: string; fileType: string } | null;
}

function mapBackendStatus(status: string): ComputerTask['status'] {
  const map: Record<string, ComputerTask['status']> = {
    understanding: 'understanding',
    preparing: 'preparing',
    working: 'working',
    reviewing: 'reviewing',
    finalizing: 'finalizing',
    done: 'done',
    error: 'error',
  };
  return map[status] || 'working';
}

function mapBackendSteps(steps: { key: string; label: string; status: string }[]): ComputerStep[] {
  return steps.map(s => ({
    key: s.key,
    label: s.label,
    done: s.status === 'done',
    active: s.status === 'active',
  }));
}

export async function createSandboxTask(type: string, label: string, prompt: string, userEmail?: string, userId?: string, context?: string): Promise<{ taskId: string; task: ComputerTask }> {
  const res = await fetch(`${getBackendUrl()}/api/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, label, userRequest: prompt, userEmail, userId, context }),
  });

  if (!res.ok) {
    throw new Error(`Sandbox server returned ${res.status}`);
  }

  const data = await res.json();
  const task: ComputerTask = {
    id: data.taskId,
    type,
    label,
    status: 'understanding',
    steps: data.steps ? mapBackendSteps(data.steps) : [],
    output: null,
    createdAt: Date.now(),
  };

  return { taskId: data.taskId, task };
}

let pollingIds: Map<string, boolean> = new Map();

export function pollTaskStatus(
  taskId: string,
  onUpdate: (task: ComputerTask, previewUrl?: string | null, downloadUrl?: string | null) => void,
  onComplete: (task: ComputerTask, output: ComputerOutput | null, previewUrl?: string | null, downloadUrl?: string | null) => void,
  onError: (error: string) => void,
) {
  pollingIds.set(taskId, true);

  let attempts = 0;
  const maxAttempts = 120;

  const interval = setInterval(async () => {
    if (!pollingIds.get(taskId)) {
      clearInterval(interval);
      return;
    }

    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(interval);
      pollingIds.delete(taskId);
      onError('Task timed out');
      return;
    }

    try {
      const res = await fetch(`${getBackendUrl()}/api/tasks/${taskId}`);
      if (!res.ok) {
        if (res.status === 404) return;
        clearInterval(interval);
        pollingIds.delete(taskId);
        onError(`Server error: ${res.status}`);
        return;
      }

      const data: BackendTask = await res.json();
      const status = mapBackendStatus(data.status);
      const steps = mapBackendSteps(data.steps);

      const task: ComputerTask = {
        id: taskId,
        type: data.type,
        label: data.label,
        status,
        steps,
        output: null,
        createdAt: Date.now(),
      };

      onUpdate(task, data.previewUrl, data.downloadUrl);

      if (status === 'done') {
        clearInterval(interval);
        pollingIds.delete(taskId);

        let output: ComputerOutput | null = null;
        if (data.output) {
          output = {
            type: data.output.type as ComputerOutput['type'],
            title: data.output.title,
            content: data.output.content,
            fileType: data.output.fileType,
          };
        }

        onComplete({ ...task, output }, output, data.previewUrl, data.downloadUrl);
      }

      if (status === 'error') {
        clearInterval(interval);
        pollingIds.delete(taskId);
        const errorTask: ComputerTask = { ...task, output: data.output ? {
          type: data.output.type as ComputerOutput['type'],
          title: data.output.title,
          content: data.output.content,
          fileType: data.output.fileType,
        } : null };
        onComplete(errorTask, errorTask.output, data.previewUrl, data.downloadUrl);
      }
    } catch (err) {
      console.warn(`Poll error for ${taskId}:`, err);
    }
  }, 1500);
}

export function stopPolling(taskId: string) {
  pollingIds.set(taskId, false);
  pollingIds.delete(taskId);
}

export function getPreviewUrl(taskId: string): string {
  return `${getBackendUrl()}/sandbox/tasks/${taskId}/output/index.html`;
}

export function getDownloadUrl(taskId: string, fileName: string): string {
  return `${getBackendUrl()}/api/tasks/${taskId}/files/${fileName}`;
}

export async function retryTask(taskId: string): Promise<{ taskId: string; task: ComputerTask }> {
  const res = await fetch(`${getBackendUrl()}/api/tasks/${taskId}/retry`, {
    method: 'POST',
  });

  if (!res.ok) {
    throw new Error(`Retry request returned ${res.status}`);
  }

  const data = await res.json();
  const task: ComputerTask = {
    id: data.taskId,
    type: '',
    label: '',
    status: 'understanding',
    steps: [],
    output: null,
    createdAt: Date.now(),
  };

  return { taskId: data.taskId, task };
}
