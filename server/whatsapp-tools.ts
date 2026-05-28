import type { WhatsAppManager } from './whatsapp';
import { toWhatsAppJid } from './whatsapp';

const ALL_PERMISSIONS = [
  'send_messages',
  'read_chats',
  'access_contacts',
  'manage_contacts',
  'access_groups',
  'send_group_messages',
  'read_group_chats',
  'view_message_history',
] as const;

type Permission = typeof ALL_PERMISSIONS[number];

function requirePerm(permissions: Record<string, boolean> | undefined, perm: Permission): string | null {
  if (!permissions?.[perm]) {
    return `Permission denied: "${perm}" is not enabled. User must enable this toggle in settings.`;
  }
  return null;
}

function cleanLimit(limit: unknown, fallback = 20): number {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), 50);
}

function requireText(value: unknown, label: string): string | null {
  const text = String(value || '').trim();
  if (!text) return `${label} required`;
  return null;
}

export async function handleSendMessage(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, boolean> | undefined,
  to: string,
  text: string,
): Promise<{ ok: true; sent: boolean; chatId: string; messageId?: string } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'send_messages');
  if (denied) return { ok: false, error: denied };

  const recipientError = requireText(to, 'Recipient');
  if (recipientError) return { ok: false, error: recipientError };
  const textError = requireText(text, 'Message text');
  if (textError) return { ok: false, error: textError };

  try {
    const sock = wa.getClient(userId);
    const chatId = toWhatsAppJid(to);
    if (!sock) {
      const cloudSent = await wa.sendCloudTextMessage(userId, to, text);
      if (cloudSent) {
        return { ok: true, sent: true, chatId: cloudSent.chatId, messageId: cloudSent.messageId };
      }
      return { ok: false, error: 'WhatsApp not paired and no WhatsApp Cloud API credentials are configured' };
    }
    const sent = await sock.sendMessage(chatId, { text });
    return { ok: true, sent: true, chatId, messageId: sent?.key?.id };
  } catch (error: any) {
    return { ok: false, error: error.message || 'Send failed' };
  }
}

export async function handleReadChats(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, boolean> | undefined,
  limit: number = 20,
): Promise<{ ok: true; chats: any[] } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'read_chats');
  if (denied) return { ok: false, error: denied };
  if (!wa.isPaired(userId)) return { ok: false, error: 'WhatsApp not paired' };
  return { ok: true, chats: wa.getChats(userId, cleanLimit(limit)) };
}

export async function handleGetContacts(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, boolean> | undefined,
): Promise<{ ok: true; contacts: any[] } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'access_contacts');
  if (denied) return { ok: false, error: denied };
  if (!wa.isPaired(userId)) return { ok: false, error: 'WhatsApp not paired' };
  return { ok: true, contacts: wa.getContacts(userId) };
}

export async function handleAddContact(
  _wa: WhatsAppManager,
  _userId: string,
  permissions: Record<string, boolean> | undefined,
  name: string,
  number: string,
): Promise<{ ok: true; added: boolean } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'manage_contacts');
  if (denied) return { ok: false, error: denied };
  const nameError = requireText(name, 'Contact name');
  if (nameError) return { ok: false, error: nameError };
  const numberError = requireText(number, 'Contact number');
  if (numberError) return { ok: false, error: numberError };
  return {
    ok: false,
    error: 'Adding contacts is not exposed by Baileys as a reliable WhatsApp Web operation. Save the contact on the device, then refresh contacts.',
  };
}

export async function handleGetGroups(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, boolean> | undefined,
): Promise<{ ok: true; groups: any[] } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'access_groups');
  if (denied) return { ok: false, error: denied };
  if (!wa.isPaired(userId)) return { ok: false, error: 'WhatsApp not paired' };
  try {
    const groups = await wa.getGroups(userId);
    return { ok: true, groups };
  } catch (error: any) {
    return { ok: false, error: error.message || 'Failed to get groups' };
  }
}

export async function handleSendGroupMessage(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, boolean> | undefined,
  groupId: string,
  text: string,
): Promise<{ ok: true; sent: boolean; groupId: string; messageId?: string } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'send_group_messages');
  if (denied) return { ok: false, error: denied };

  const groupError = requireText(groupId, 'Group ID');
  if (groupError) return { ok: false, error: groupError };
  const textError = requireText(text, 'Message text');
  if (textError) return { ok: false, error: textError };

  const sock = wa.getClient(userId);
  if (!sock) return { ok: false, error: 'WhatsApp not paired' };

  try {
    const jid = toWhatsAppJid(groupId, true);
    const sent = await sock.sendMessage(jid, { text });
    return { ok: true, sent: true, groupId: jid, messageId: sent?.key?.id };
  } catch (error: any) {
    return { ok: false, error: error.message || 'Failed to send group message' };
  }
}

export async function handleReadGroupChat(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, boolean> | undefined,
  groupId: string,
  limit: number = 20,
): Promise<{ ok: true; messages: any[] } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'read_group_chats');
  if (denied) return { ok: false, error: denied };
  if (!wa.isPaired(userId)) return { ok: false, error: 'WhatsApp not paired' };
  const groupError = requireText(groupId, 'Group ID');
  if (groupError) return { ok: false, error: groupError };
  return { ok: true, messages: wa.getMessageHistory(userId, toWhatsAppJid(groupId, true), cleanLimit(limit)) };
}

export async function handleGetMessageHistory(
  wa: WhatsAppManager,
  userId: string,
  permissions: Record<string, boolean> | undefined,
  chatId: string,
  limit: number = 20,
): Promise<{ ok: true; messages: any[] } | { ok: false; error: string }> {
  const denied = requirePerm(permissions, 'view_message_history');
  if (denied) return { ok: false, error: denied };
  if (!wa.isPaired(userId)) return { ok: false, error: 'WhatsApp not paired' };
  const chatError = requireText(chatId, 'Chat ID');
  if (chatError) return { ok: false, error: chatError };
  return { ok: true, messages: wa.getMessageHistory(userId, chatId, cleanLimit(limit)) };
}
