import { randomBytes } from 'crypto';

interface WaClient {
  userId: string;
  status: 'init' | 'qr_ready' | 'paired' | 'disconnected';
  qrCode: string | null;
  phone: string | null;
  client: any | null;
  pairingCode: string;
  error: string | null;
}

export class WhatsAppManager {
  private clients = new Map<string, WaClient>();
  private browser: any = null;

  async getBrowser() {
    if (this.browser) return this.browser;
    try {
      const { default: puppeteer } = await import('puppeteer');
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });
      return this.browser;
    } catch (e) {
      console.error('Failed to launch browser for WhatsApp:', e);
      return null;
    }
  }

  async startPairing(userId: string): Promise<{ pairingCode: string } | { error: string }> {
    const existing = this.clients.get(userId);
    if (existing && (existing.status === 'init' || existing.status === 'qr_ready' || existing.status === 'paired')) {
      return { pairingCode: existing.pairingCode };
    }

    const pairingCode = randomBytes(8).toString('hex');
    const entry: WaClient = {
      userId,
      status: 'init',
      qrCode: null,
      phone: null,
      client: null,
      pairingCode,
      error: null,
    };
    this.clients.set(userId, entry);

    try {
      const { Client, LocalAuth } = await import('whatsapp-web.js');
      const browser = await this.getBrowser();
      if (!browser) {
        return { error: 'Failed to launch browser' };
      }

      const client = new Client({
        authStrategy: new LocalAuth({ clientId: `beatrice_${userId}` }),
        puppeteer: { browser },
      });

      client.on('qr', (qr: string) => {
        entry.status = 'qr_ready';
        entry.qrCode = qr;
      });

      client.on('ready', () => {
        entry.status = 'paired';
        entry.phone = client.info?.wid?.user || client.info?.me?.user || 'unknown';
        entry.qrCode = null;
        console.log(`WhatsApp paired for user ${userId}: ${entry.phone}`);
      });

      client.on('disconnected', (reason: string) => {
        console.log(`WhatsApp disconnected for user ${userId}: ${reason}`);
        entry.status = 'disconnected';
        entry.qrCode = null;
        entry.client = null;
      });

      client.on('auth_failure', (msg: string) => {
        console.error(`WhatsApp auth failure for user ${userId}:`, msg);
        entry.error = msg;
        entry.status = 'disconnected';
      });

      client.on('message', async (msg: any) => {
        if (entry.status === 'paired') {
          console.log(`WhatsApp message for ${userId} from ${msg.from}: ${msg.body?.slice(0, 80)}`);
        }
      });

      await client.initialize();
      entry.client = client;

      return { pairingCode };
    } catch (e: any) {
      console.error(`WhatsApp init error for ${userId}:`, e);
      this.clients.delete(userId);
      return { error: e.message || 'Failed to initialize WhatsApp' };
    }
  }

  getStatus(userId: string): { status: string; qrCode?: string; phone?: string; error?: string } | null {
    const entry = this.clients.get(userId);
    if (!entry) return null;
    return {
      status: entry.status,
      qrCode: entry.qrCode || undefined,
      phone: entry.phone || undefined,
      error: entry.error || undefined,
    };
  }

  async disconnect(userId: string): Promise<void> {
    const entry = this.clients.get(userId);
    if (!entry) return;
    try {
      if (entry.client) {
        await entry.client.destroy();
      }
    } catch (e) {
      console.error(`WhatsApp destroy error for ${userId}:`, e);
    }
    this.clients.delete(userId);
  }

  getClient(userId: string): any {
    const entry = this.clients.get(userId);
    if (!entry || entry.status !== 'paired' || !entry.client) return null;
    return entry.client;
  }

  isPaired(userId: string): boolean {
    const entry = this.clients.get(userId);
    return entry?.status === 'paired';
  }

  async shutdown(): Promise<void> {
    for (const [userId] of this.clients) {
      await this.disconnect(userId);
    }
    if (this.browser) {
      try { await this.browser.close(); } catch { }
      this.browser = null;
    }
  }
}
