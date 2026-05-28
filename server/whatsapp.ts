import { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import fs from 'fs';
import path from 'path';
import P from 'pino';
import QRCode from 'qrcode';

type WaStatus = 'init' | 'qr_ready' | 'paired' | 'disconnected' | 'error';

export interface WaRecentMessage {
  id: string;
  chatId: string;
  from: string;
  body: string;
  timestamp: number;
  fromMe: boolean;
  isGroup: boolean;
  isMedia: boolean;
}

export interface WaChatSummary {
  id: string;
  name: string;
  unreadCount: number;
  lastMessage: string;
  timestamp: number;
  isGroup: boolean;
}

export interface WaContactSummary {
  id: string;
  name: string;
  number: string;
}

interface WaSession {
  userId: string;
  status: WaStatus;
  qrCode: string | null;
  qrRaw: string | null;
  phone: string | null;
  sock: any | null;
  authDir: string;
  dataFile: string;
  error: string | null;
  recentMessages: WaRecentMessage[];
  contacts: Record<string, WaContactSummary>;
  messageById: Map<string, any>;
  reconnecting: boolean;
  saveTimer: NodeJS.Timeout | null;
}

const logger = P({ level: process.env.WA_LOG_LEVEL || 'silent' });

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeUserId(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function messageText(message: any): string {
  const m = message?.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    ''
  );
}

function timestampMs(value: any): number {
  if (!value) return Date.now();
  if (typeof value === 'number') return value > 10_000_000_000 ? value : value * 1000;
  if (typeof value?.toNumber === 'function') return value.toNumber() * 1000;
  return Date.now();
}

export function toWhatsAppJid(value: string, group = false): string {
  const input = String(value || '').trim();
  if (!input) return '';
  if (input.includes('@s.whatsapp.net') || input.includes('@g.us') || input.includes('@broadcast')) {
    return input;
  }
  const cleaned = input.replace(/[^\d-]/g, '');
  if (!cleaned) return input;
  return `${cleaned}@${group ? 'g.us' : 's.whatsapp.net'}`;
}

function jidNumber(jid: string): string {
  return jid.split('@')[0] || jid;
}

function readSessionData(dataFile: string): Pick<WaSession, 'recentMessages' | 'contacts'> {
  try {
    if (!fs.existsSync(dataFile)) return { recentMessages: [], contacts: {} };
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return {
      recentMessages: Array.isArray(parsed.recentMessages) ? parsed.recentMessages : [],
      contacts: parsed.contacts && typeof parsed.contacts === 'object' ? parsed.contacts : {},
    };
  } catch {
    return { recentMessages: [], contacts: {} };
  }
}

function writeSessionData(entry: WaSession) {
  const payload = {
    recentMessages: entry.recentMessages.slice(0, 250),
    contacts: entry.contacts,
  };
  fs.writeFileSync(entry.dataFile, JSON.stringify(payload, null, 2));
}

export class WhatsAppManager {
  private sessions = new Map<string, WaSession>();
  private authRoot = process.env.WA_AUTH_ROOT || path.join(process.cwd(), '.baileys_auth');

  async startPairing(userId: string): Promise<{ pairingCode: string; status: string }> {
    const existing = this.sessions.get(userId);
    if (existing && ['init', 'qr_ready', 'paired'].includes(existing.status)) {
      return { pairingCode: safeUserId(userId), status: existing.status };
    }

    await this.startSession(userId);
    return { pairingCode: safeUserId(userId), status: this.sessions.get(userId)?.status || 'init' };
  }

  async startSession(userId: string): Promise<void> {
    const safeId = safeUserId(userId);
    const authDir = path.join(this.authRoot, safeId);
    const dataFile = path.join(authDir, 'session-data.json');
    ensureDir(authDir);

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();
    const savedData = readSessionData(dataFile);

    const entry: WaSession = {
      userId,
      status: 'init',
      qrCode: null,
      qrRaw: null,
      phone: null,
      sock: null,
      authDir,
      dataFile,
      error: null,
      recentMessages: savedData.recentMessages,
      contacts: savedData.contacts,
      messageById: new Map(),
      reconnecting: false,
      saveTimer: null,
    };

    this.sessions.set(userId, entry);

    const sock = makeWASocket({
      version,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      generateHighQualityLinkPreview: true,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      getMessage: async (key) => {
        const jid = key.remoteJid;
        const id = key.id;
        if (!jid || !id) return undefined;
        return entry.messageById.get(`${jid}:${id}`)?.message;
      },
    });

    entry.sock = sock;
    entry.saveTimer = setInterval(() => {
      try {
        writeSessionData(entry);
      } catch (error) {
        console.warn(`Failed to write WhatsApp data for ${userId}:`, error);
      }
    }, 10_000);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        entry.qrRaw = qr;
        entry.qrCode = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
        entry.status = 'qr_ready';
        entry.error = null;
      }

      if (connection === 'open') {
        entry.status = 'paired';
        entry.qrCode = null;
        entry.qrRaw = null;
        entry.error = null;
        entry.phone = sock.user?.id ? jidNumber(sock.user.id) : 'connected';
        console.log(`WhatsApp paired for user ${userId}: ${entry.phone}`);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        entry.status = loggedOut ? 'disconnected' : 'error';
        entry.error = loggedOut ? null : (lastDisconnect?.error?.message || 'WhatsApp connection closed');
        entry.sock = null;
        this.clearSaveTimer(entry);

        if (!loggedOut && !entry.reconnecting) {
          entry.reconnecting = true;
          setTimeout(async () => {
            try {
              await this.startSession(userId);
            } catch (error: any) {
              const current = this.sessions.get(userId);
              if (current) {
                current.status = 'error';
                current.error = error.message || 'Reconnect failed';
              }
            }
          }, 2_000);
        }
      }
    });

    sock.ev.on('messages.upsert', ({ messages }: any) => {
      for (const msg of messages || []) {
        const chatId = msg.key?.remoteJid || '';
        if (!chatId || chatId === 'status@broadcast') continue;
        if (msg.key?.id) entry.messageById.set(`${chatId}:${msg.key.id}`, msg);

        const body = messageText(msg) || '[media]';
        const record: WaRecentMessage = {
          id: msg.key?.id || `${chatId}:${Date.now()}`,
          chatId,
          from: msg.key?.participant || msg.key?.remoteJid || '',
          body: body.slice(0, 1000),
          timestamp: timestampMs(msg.messageTimestamp),
          fromMe: !!msg.key?.fromMe,
          isGroup: chatId.endsWith('@g.us'),
          isMedia: !!msg.message?.imageMessage || !!msg.message?.videoMessage || !!msg.message?.documentMessage,
        };
        entry.recentMessages.unshift(record);
      }
      entry.recentMessages = entry.recentMessages.slice(0, 250);
    });

    const updateContacts = (contacts: any[]) => {
      for (const contact of contacts || []) {
        const id = contact.id || contact.jid;
        if (!id || !String(id).endsWith('@s.whatsapp.net')) continue;
        entry.contacts[id] = {
          id,
          name: contact.name || contact.notify || contact.verifiedName || entry.contacts[id]?.name || id,
          number: jidNumber(id),
        };
      }
    };

    sock.ev.on('contacts.upsert', updateContacts);
    sock.ev.on('contacts.update', updateContacts);
  }

  getStatus(userId: string): { status: string; qrCode?: string; phone?: string; error?: string } | null {
    const entry = this.sessions.get(userId);
    if (!entry) return null;
    return {
      status: entry.status,
      qrCode: entry.qrCode || undefined,
      phone: entry.phone || undefined,
      error: entry.error || undefined,
    };
  }

  getRecentMessages(userId: string, limit = 20): WaRecentMessage[] {
    const entry = this.sessions.get(userId);
    if (!entry) return [];
    return entry.recentMessages.slice(0, Math.min(limit, 50));
  }

  getChats(userId: string, limit = 20): WaChatSummary[] {
    const entry = this.sessions.get(userId);
    if (!entry) return [];

    const byId = new Map<string, WaChatSummary>();
    for (const msg of entry.recentMessages) {
      const current = byId.get(msg.chatId);
      if (!current || msg.timestamp >= current.timestamp) {
        byId.set(msg.chatId, {
          id: msg.chatId,
          name: current?.name || entry.contacts[msg.chatId]?.name || msg.chatId,
          unreadCount: current?.unreadCount || 0,
          lastMessage: msg.body.slice(0, 160),
          timestamp: msg.timestamp,
          isGroup: msg.isGroup,
        });
      }
    }

    return [...byId.values()]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, Math.min(limit, 50));
  }

  getContacts(userId: string, limit = 100): WaContactSummary[] {
    const entry = this.sessions.get(userId);
    if (!entry?.contacts) return [];

    return Object.values(entry.contacts)
      .filter(contact => contact.id.endsWith('@s.whatsapp.net'))
      .slice(0, Math.min(limit, 500));
  }

  async getGroups(userId: string): Promise<WaChatSummary[]> {
    const sock = this.getClient(userId);
    if (!sock) return [];
    const groups = await sock.groupFetchAllParticipating();
    return Object.entries(groups).map(([id, meta]: [string, any]) => ({
      id,
      name: meta.subject || id,
      unreadCount: 0,
      lastMessage: '',
      timestamp: timestampMs(meta.creation),
      isGroup: true,
    }));
  }

  getMessageHistory(userId: string, chatId: string, limit = 20): WaRecentMessage[] {
    const entry = this.sessions.get(userId);
    if (!entry) return [];
    const jid = toWhatsAppJid(chatId, chatId.endsWith('@g.us'));
    return entry.recentMessages
      .filter(message => message.chatId === jid)
      .slice(0, Math.min(limit, 50));
  }

  async disconnect(userId: string): Promise<void> {
    const entry = this.sessions.get(userId);
    if (!entry) return;
    try {
      if (entry.sock) {
        await entry.sock.logout().catch(async () => entry.sock?.end?.(undefined));
      }
    } catch (error) {
      console.error(`WhatsApp disconnect error for ${userId}:`, error);
    }

    this.clearSaveTimer(entry);
    this.sessions.delete(userId);
    fs.rmSync(entry.authDir, { recursive: true, force: true });
  }

  getClient(userId: string): any {
    const entry = this.sessions.get(userId);
    if (!entry || entry.status !== 'paired' || !entry.sock) return null;
    return entry.sock;
  }

  isPaired(userId: string): boolean {
    return this.sessions.get(userId)?.status === 'paired';
  }

  async shutdown(): Promise<void> {
    for (const entry of this.sessions.values()) {
      this.clearSaveTimer(entry);
      try {
        writeSessionData(entry);
        entry.sock?.end?.(undefined);
      } catch {}
    }
    this.sessions.clear();
  }

  private clearSaveTimer(entry: WaSession) {
    if (entry.saveTimer) {
      clearInterval(entry.saveTimer);
      entry.saveTimer = null;
    }
  }
}
