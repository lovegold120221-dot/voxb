import type { WhatsAppManager } from './whatsapp';

const ALL_PERMISSIONS = [
  'send_messages',
  'read_chats',
  'access_contacts',
  'manage_contacts',
  'access_groups',
  'send_group_messages',
  'read_group_chats',
  'manage_media',
  'view_message_history',
] as const;

type Permission = typeof ALL_PERMISSIONS[number];

function requirePerm(permissions: Record<string, boolean> | undefined, perm: Permission, action: string): string | null {
  if (!permissions?.[perm]) {
    return `Permission denied: "${perm}" is not enabled. User must enable this toggle in settings.`;
  }
  return null;
}

export async function handleSendMessage(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, boolean> | undefined,
  to: string,
  text: string,
): Promise<{ ok: true; sent: boolean } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'send_messages', 'send message');
  if (denied) return { ok: false, error: denied };

  const client = wa.getClient(userId);
  if (!client) return { ok: false, error: 'WhatsApp not paired' };

  try {
    const chatId = to.includes('@c.us') || to.includes('@g.us') ? to : `${to}@c.us`;
    await client.sendMessage(chatId, text);
    return { ok: true, sent: true };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Send failed' };
  }
}

export async function handleReadChats(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, boolean> | undefined,
  limit: number = 20,
): Promise<{ ok: true; chats: any[] } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'read_chats', 'read chats');
  if (denied) return { ok: false, error: denied };

  const client = wa.getClient(userId);
  if (!client) return { ok: false, error: 'WhatsApp not paired' };

  try {
    const chats = await client.getChats();
    const recent = chats.slice(0, Math.min(limit, 50));
    return { ok: true, chats: recent.map((c: any) => ({
      id: c.id?._serialized || '',
      name: c.name || 'Unknown',
      unreadCount: c.unreadCount || 0,
      lastMessage: c.lastMessage?.body?.slice(0, 120) || '',
      timestamp: c.timestamp,
    }))};
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to read chats' };
  }
}

export async function handleGetContacts(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, boolean> | undefined,
): Promise<{ ok: true; contacts: any[] } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'access_contacts', 'access contacts');
  if (denied) return { ok: false, error: denied };

  const client = wa.getClient(userId);
  if (!client) return { ok: false, error: 'WhatsApp not paired' };

  try {
    const contacts = await client.getContacts();
    const filtered = contacts.filter((c: any) => c.id?._serialized?.includes('@c.us'));
    return { ok: true, contacts: filtered.map((c: any) => ({
      id: c.id?._serialized || '',
      name: c.name || c.pushname || 'Unknown',
      number: c.number || '',
      isMyContact: !!c.isMyContact,
    }))};
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to get contacts' };
  }
}

export async function handleAddContact(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, boolean> | undefined,
  name: string,
  number: string,
): Promise<{ ok: true; added: boolean } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'manage_contacts', 'manage contacts');
  if (denied) return { ok: false, error: denied };

  const client = wa.getClient(userId);
  if (!client) return { ok: false, error: 'WhatsApp not paired' };

  try {
    const contactId = number.includes('@c.us') ? number : `${number}@c.us`;
    await client.addContact(contactId, name);
    return { ok: true, added: true };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to add contact' };
  }
}

export async function handleGetGroups(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, boolean> | undefined,
): Promise<{ ok: true; groups: any[] } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'access_groups', 'access groups');
  if (denied) return { ok: false, error: denied };

  const client = wa.getClient(userId);
  if (!client) return { ok: false, error: 'WhatsApp not paired' };

  try {
    const chats = await client.getChats();
    const groups = chats.filter((c: any) => c.id?._serialized?.includes('@g.us'));
    return { ok: true, groups: groups.map((g: any) => ({
      id: g.id?._serialized || '',
      name: g.name || 'Unnamed Group',
      participantCount: g.participants?.length || 0,
      unreadCount: g.unreadCount || 0,
    }))};
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to get groups' };
  }
}

export async function handleSendGroupMessage(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, boolean> | undefined,
  groupId: string,
  text: string,
): Promise<{ ok: true; sent: boolean } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'send_group_messages', 'send group messages');
  if (denied) return { ok: false, error: denied };

  const client = wa.getClient(userId);
  if (!client) return { ok: false, error: 'WhatsApp not paired' };

  try {
    const gid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
    await client.sendMessage(gid, text);
    return { ok: true, sent: true };
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to send group message' };
  }
}

export async function handleReadGroupChat(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, boolean> | undefined,
  groupId: string,
  limit: number = 20,
): Promise<{ ok: true; messages: any[] } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'read_group_chats', 'read group chats');
  if (denied) return { ok: false, error: denied };

  const client = wa.getClient(userId);
  if (!client) return { ok: false, error: 'WhatsApp not paired' };
  if (!groupId) return { ok: false, error: 'Group ID required' };

  try {
    const gid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
    const chat = await client.getChatById(gid);
    const msgs = await chat.fetchMessages({ limit: Math.min(limit, 50) });
    return { ok: true, messages: msgs.map((m: any) => ({
      from: m.from || '',
      author: m.author || m.from || '',
      body: m.body?.slice(0, 300) || '',
      timestamp: m.timestamp,
      isMedia: !!m.hasMedia,
    }))};
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to read group chat' };
  }
}

export async function handleGetMessageHistory(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, boolean> | undefined,
  chatId: string,
  limit: number = 20,
): Promise<{ ok: true; messages: any[] } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'view_message_history', 'view message history');
  if (denied) return { ok: false, error: denied };

  const client = wa.getClient(userId);
  if (!client) return { ok: false, error: 'WhatsApp not paired' };

  try {
    const cid = chatId.includes('@c.us') || chatId.includes('@g.us') ? chatId : `${chatId}@c.us`;
    const chat = await client.getChatById(cid);
    const msgs = await chat.fetchMessages({ limit: Math.min(limit, 50) });
    return { ok: true, messages: msgs.map((m: any) => ({
      from: m.from || '',
      author: m.author || m.from || '',
      body: m.body?.slice(0, 500) || '',
      timestamp: m.timestamp,
      isMedia: !!m.hasMedia,
      isForwarded: !!m.isForwarded,
    }))};
  } catch (e: any) {
    return { ok: false, error: e.message || 'Failed to get message history' };
  }
}
