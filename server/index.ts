import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { randomBytes } from 'crypto';
import { SandboxManager } from './sandbox';
import { EburonWorker } from './eburon';
import { WhatsAppManager } from './whatsapp';
import * as waTools from './whatsapp-tools';
import type { TaskRequest, TaskStatusResponse } from './types';

const app = express();
const PORT = process.env.SANDBOX_PORT ? parseInt(process.env.SANDBOX_PORT) : 4200;
const SANDBOX_ROOT = process.env.SANDBOX_ROOT || '/var/eburon-ai/sandbox';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'eburon-worker-cloud';
const OLLAMA_FALLBACK = process.env.OLLAMA_FALLBACK || 'eburon-worker';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const sandbox = new SandboxManager(SANDBOX_ROOT);
const worker = new EburonWorker(OLLAMA_URL, OLLAMA_MODEL, OLLAMA_FALLBACK);
const waManager = new WhatsAppManager();

app.use('/sandbox', express.static(SANDBOX_ROOT, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Content-Type', 'text/html');
    }
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript');
    }
    res.setHeader('Content-Security-Policy', "default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: https:; font-src 'self' data:;");
  }
}));

app.get('/api/health', async (_req, res) => {
  const alive = await worker.checkConnection();
  res.json({ status: 'ok', worker: 'connected', model: worker.modelName, ollama: alive, fallbackActive: worker.didFallback });
});

app.get('/api/ollama/status', async (_req, res) => {
  try {
    const available = await worker.checkConnection();
    res.json({ available, model: OLLAMA_MODEL });
  } catch {
    res.json({ available: false, model: OLLAMA_MODEL });
  }
});

app.post('/api/web/glance', async (req, res) => {
  try {
    const query = typeof req.body?.query === 'string' ? req.body.query.trim() : '';
    const maxResults = Math.max(1, Math.min(Number(req.body?.maxResults) || 3, 5));

    if (query.length < 2) {
      res.status(400).json({ error: 'query must be at least 2 characters' });
      return;
    }

    const url = new URL('https://api.duckduckgo.com/');
    url.searchParams.set('q', query.slice(0, 160));
    url.searchParams.set('format', 'json');
    url.searchParams.set('no_html', '1');
    url.searchParams.set('skip_disambig', '1');

    const response = await fetch(url, {
      headers: { 'User-Agent': 'Beatrice Voice Assistant/1.0' },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      res.status(502).json({ error: `Web glance failed with status ${response.status}` });
      return;
    }

    const data: any = await response.json();
    const related: Array<{ title: string; url: string; snippet: string }> = [];
    const stripTags = (value: unknown) => String(value || '').replace(/<[^>]*>/g, '').trim();

    const collect = (item: any) => {
      if (Array.isArray(item?.Topics)) {
        item.Topics.forEach(collect);
        return;
      }

      const title = stripTags(item?.FirstURL ? item.Text?.split(' - ')[0] : item?.Text);
      const snippet = stripTags(item?.Text);
      const itemUrl = stripTags(item?.FirstURL);
      if (title && itemUrl) {
        related.push({ title, url: itemUrl, snippet });
      }
    };

    (Array.isArray(data.RelatedTopics) ? data.RelatedTopics : []).forEach(collect);

    res.json({
      query,
      heading: stripTags(data.Heading) || undefined,
      abstract: stripTags(data.AbstractText) || undefined,
      source: stripTags(data.AbstractSource || 'DuckDuckGo'),
      results: related.slice(0, maxResults),
    });
  } catch (err: any) {
    console.error('Web glance error:', err);
    res.status(500).json({ error: err.message || 'Web glance failed' });
  }
});

app.post('/api/tasks', async (req, res) => {
  try {
    const { type, label, prompt, userRequest, userEmail, userId, context } = req.body as TaskRequest & { context?: string };

    if (!type || !label) {
      res.status(400).json({ error: 'Missing task type or label' });
      return;
    }

    const taskId = sandbox.createTask(type, label, userEmail, userId);
    const task = sandbox.getTask(taskId);
    if (!task) {
      res.status(500).json({ error: 'Failed to create task sandbox' });
      return;
    }

    res.json({
      taskId,
      status: task.status,
      steps: task.steps,
      previewUrl: `/sandbox/tasks/${taskId}/output/`,
      downloadUrl: `/sandbox/tasks/${taskId}/output/`,
    });

    const fullPrompt = context
      ? `Conversation history:\n${context}\n\nUser request: ${prompt || userRequest || label}`
      : (prompt || userRequest || label);

    runTask(taskId, type, fullPrompt, userEmail, userId);
  } catch (err) {
    console.error('Task creation error:', err);
    res.status(500).json({ error: 'Internal error creating task' });
  }
});

app.post('/api/create-document', (req, res) => {
  try {
    const { userId, title, content } = req.body || {};
    const safeTitle = typeof title === 'string' && title.trim() ? title.trim().slice(0, 160) : 'Document';

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ error: 'userId required' });
      return;
    }

    if (!content || typeof content !== 'string') {
      res.status(400).json({ error: 'content required' });
      return;
    }

    const taskId = sandbox.createTask('document', safeTitle, undefined, userId);
    const outputFile = sandbox.writeOutput(taskId, 'document', content, 'html');
    sandbox.markAllStepsDone(taskId);
    sandbox.setTaskStatus(taskId, 'done');
    sandbox.setTaskOutput(taskId, {
      type: 'document',
      title: safeTitle,
      content,
      fileType: 'html',
    });
    sandbox.finishTask(taskId, [outputFile]);

    res.json({
      ok: true,
      taskId,
      title: safeTitle,
      content,
      url: `/sandbox/tasks/${taskId}/output/index.html`,
    });
  } catch (err: any) {
    console.error('Document creation error:', err);
    res.status(500).json({ error: err.message || 'Document creation failed' });
  }
});

app.get('/api/tasks/:taskId', (req, res) => {
  const task = sandbox.getTask(req.params.taskId);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const response: TaskStatusResponse = {
    taskId: task.id,
    status: task.status,
    type: task.type,
    label: task.label,
    steps: task.steps,
    previewUrl: task.status === 'done'
      ? `/sandbox/tasks/${task.id}/output/index.html`
      : null,
    downloadUrl: `/sandbox/tasks/${task.id}/output/`,
    files: task.files || [],
    error: task.error || null,
    output: task.output || null,
    userEmail: task.userEmail,
    userId: task.userId,
  };

  res.json(response);
});

app.post('/api/tasks/:taskId/retry', async (req, res) => {
  const task = sandbox.getTask(req.params.taskId);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  sandbox.resetTask(task.id);
  res.json({ taskId: task.id, status: 'understanding' });
  runTask(task.id, task.type, task.label);
});

app.get('/api/tasks/:taskId/files/:fileName', (req, res) => {
  const { taskId, fileName } = req.params;
  const safeName = path.basename(fileName);
  const filePath = path.join(SANDBOX_ROOT, 'tasks', taskId, 'output', safeName);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  res.download(filePath, safeName);
});

async function runTask(taskId: string, type: string, prompt: string, userEmail?: string, userId?: string) {
  try {
    const userContext = userEmail ? `${userEmail} (${userId || 'unknown'})` : 'unknown user';
    console.log(`Running task ${taskId} [${type}] for user ${userContext}: "${prompt.slice(0, 80)}"`);
    sandbox.updateStep(taskId, 'understanding', 'done');
    sandbox.updateStep(taskId, 'preparing', 'active');
    sandbox.setTaskStatus(taskId, 'preparing');
    await delay(400);

    sandbox.updateStep(taskId, 'preparing', 'done');
    sandbox.updateStep(taskId, 'working', 'active');
    sandbox.setTaskStatus(taskId, 'working');
    await delay(300);

    let result: { content: string; fileType: string; title: string };
    let usedWorker = false;

    const workerAlive = await worker.checkConnection();
    if (workerAlive) {
      try {
        result = await worker.generate(taskId, type, prompt);
        usedWorker = true;
      } catch (e) {
        console.warn(`Eburon Agent failed for ${taskId}, using local fallback:`);
        result = sandbox.generateLocal(taskId, type, prompt);
      }
    } else {
      result = sandbox.generateLocal(taskId, type, prompt);
    }

    sandbox.updateStep(taskId, 'working', 'done');
    sandbox.updateStep(taskId, 'saving', 'active');
    sandbox.setTaskStatus(taskId, 'reviewing');
    await delay(300);

    const outputFile = sandbox.writeOutput(taskId, type, result.content, result.fileType);
    sandbox.updateStep(taskId, 'saving', 'done');
    sandbox.setTaskStatus(taskId, 'done');
    sandbox.setTaskOutput(taskId, {
      type,
      title: result.title,
      content: result.content,
      fileType: result.fileType,
    });
    sandbox.finishTask(taskId, [outputFile]);

  } catch (err: any) {
    console.error(`Task ${taskId} failed:`, err.message);
    sandbox.setTaskStatus(taskId, 'error');
    sandbox.setTaskError(taskId, err.message || 'Unknown error');
    sandbox.markAllStepsDone(taskId);
  }
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── WhatsApp Routes ──

app.post('/api/whatsapp/pair', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
    const result = await waManager.startPairing(userId);
    if ('error' in result) { res.status(500).json(result); return; }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Pairing failed' });
  }
});

app.get('/api/whatsapp/status/:userId', async (req, res) => {
  try {
    const status = await waManager.getStatusOrStart(req.params.userId);
    if (!status) { res.json({ status: 'not_found' }); return; }
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to read WhatsApp status' });
  }
});

app.get('/api/whatsapp/messages/:userId', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const messages = waManager.getRecentMessages(req.params.userId, limit);
  res.json({ messages });
});

app.post('/api/whatsapp/disconnect', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
    await waManager.disconnect(userId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { userId, to, text, permissions } = req.body;
    if (!userId || !to || !text) { res.status(400).json({ error: 'userId, to, text required' }); return; }
    const effectivePermissions = waManager.getEffectivePermissions(userId, permissions);
    const result = await waTools.handleSendMessage(waManager, userId, effectivePermissions, to, text);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/tool', async (req, res) => {
  try {
    const { userId, tool, permissions } = req.body;
    const params = req.body.params || {};
    if (!userId || !tool) { res.status(400).json({ error: 'userId and tool required' }); return; }
    const effectivePermissions = waManager.getEffectivePermissions(userId, permissions);

    let result: any;
    switch (tool) {
      case 'sendMessage':
        result = await waTools.handleSendMessage(waManager, userId, effectivePermissions, params.to, params.text);
        break;
      case 'readChats':
        result = await waTools.handleReadChats(waManager, userId, effectivePermissions, params.limit);
        break;
      case 'getContacts':
        result = await waTools.handleGetContacts(waManager, userId, effectivePermissions);
        break;
      case 'addContact':
        result = await waTools.handleAddContact(waManager, userId, effectivePermissions, params.name, params.number || params.to);
        break;
      case 'getGroups':
        result = await waTools.handleGetGroups(waManager, userId, effectivePermissions);
        break;
      case 'sendGroupMessage':
        result = await waTools.handleSendGroupMessage(waManager, userId, effectivePermissions, params.groupId || params.chatId || params.groupName, params.text);
        break;
      case 'readGroupChat':
        result = await waTools.handleReadGroupChat(waManager, userId, effectivePermissions, params.groupId || params.chatId || params.groupName, params.limit);
        break;
      case 'getMessageHistory':
        result = await waTools.handleGetMessageHistory(waManager, userId, effectivePermissions, params.chatId || params.contactId || params.to || params.name, params.limit);
        break;
      default:
        res.status(400).json({ error: `Unknown tool: ${tool}` });
        return;
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/whatsapp/admin/overview/:userId', async (req, res) => {
  try {
    res.json(await waManager.getAdminOverview(req.params.userId));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load WhatsApp admin overview' });
  }
});

app.get('/api/whatsapp/admin/config/:userId', (req, res) => {
  try {
    res.json({ config: waManager.getAdminConfigPublic(req.params.userId) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to load WhatsApp admin config' });
  }
});

app.post('/api/whatsapp/admin/config', (req, res) => {
  try {
    const { userId, config } = req.body;
    if (!userId) { res.status(400).json({ error: 'userId required' }); return; }
    res.json({ config: waManager.saveAdminConfig(userId, config || {}) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save WhatsApp admin config' });
  }
});

app.post('/api/whatsapp/admin/test-message', async (req, res) => {
  try {
    const { userId, to, text } = req.body;
    if (!userId || !to || !text) { res.status(400).json({ error: 'userId, to, text required' }); return; }
    const permissions = waManager.getEffectivePermissions(userId);
    const result = await waTools.handleSendMessage(waManager, userId, permissions, to, text);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to send test message' });
  }
});

app.get('/api/whatsapp/webhook/:userId', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && waManager.verifyWebhookToken(req.params.userId, token)) {
    res.status(200).send(String(challenge || ''));
    return;
  }
  res.sendStatus(403);
});

app.post('/api/whatsapp/webhook/:userId', (req, res) => {
  try {
    res.json(waManager.ingestCloudWebhook(req.params.userId, req.body));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Webhook ingest failed' });
  }
});

// ── Shutdown hook ──

process.on('SIGTERM', async () => {
  console.log('Shutting down WhatsApp clients...');
  await waManager.shutdown();
  process.exit(0);
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Beatrice Sandbox Server running on http://0.0.0.0:${PORT}`);
  console.log(`Sandbox root: ${SANDBOX_ROOT}`);
  console.log(`Ollama URL: ${OLLAMA_URL}`);
  console.log(`Ollama Model: ${OLLAMA_MODEL}`);
  console.log(`Fallback Model: ${OLLAMA_FALLBACK || 'none'}`);
});
