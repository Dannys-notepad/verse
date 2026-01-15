import path from 'path';
import { fileURLToPath } from 'url';
import log from '../../../shared/utils/log.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function handleMessage(msg, sock) {
  try {
    await privateMessage(msg, sock);
  } catch (error) {
    log.error('WhatsApp Client', 'Failed to handle message', error.message);
  }
}

async function privateMessage(msg, sock) {
  try {
    // --------------------------------------------------
    // 1. BASIC VALIDATION
    // --------------------------------------------------
    if (!msg || !msg.message) return;

    // Ignore very old messages (WhatsApp reconnect flood protection)
    const messageTimestamp = Number(msg.messageTimestamp) * 1000;
    const now = Date.now();
    if (now - messageTimestamp > 60_000) return;

    // Ignore system / protocol messages
    if (
      msg.message.protocolMessage ||
      msg.message.senderKeyDistributionMessage ||
      msg.message.stickerMessage ||
      msg.message.ephemeralMessage
    ) {
      return;
    }

    const chatId = getChatId(msg);

    // Ignore broadcast & status messages
    if (
      chatId.endsWith('@broadcast') ||
      chatId === 'status@broadcast'
    ) {
      return;
    }

    // --------------------------------------------------
    // 2. EXTRACT MESSAGE DATA
    // --------------------------------------------------
    const senderId = getSenderId(msg);
    const rawBody = getMessageBody(msg);
    if (!rawBody) return;

    const receivedAt = Date.now();

    // --------------------------------------------------
    // 3. NORMALIZE MESSAGE TEXT
    // --------------------------------------------------
    const normalizedBody = rawBody
      .normalize('NFKC')
      .replace(/[\u0300-\u036f\u00b4\u0060\u005e\u007e]/g, '')
      .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
      .trim();

    if (!normalizedBody) return;

    log.info(
      'WhatsApp Client',
      `📩 Message received | Sender: ${senderId}`
    );

    // --------------------------------------------------
    // 4. BUILD PLATFORM-AGNOSTIC MESSAGE OBJECT
    // --------------------------------------------------
    const messageObj = {
      platform: 'whatsapp',
      chatId,
      senderId,
      text: normalizedBody,
      raw: msg,

      hasQuotedMsg: hasQuotedMsg(msg),
      getQuotedMessage: () => getQuotedMessage(msg),
      mentionedIds: getMentionedIds(msg),

      /**
       * Unified reply method
       * Core / AI layer never touches Baileys directly
       */
      reply: async (content, options = {}) => {
        const latencyMs = Date.now() - receivedAt;
        log.info(
          'WhatsApp Client',
          `💬 Replying to ${senderId} (${latencyMs}ms)`
        );

        // Show typing indicator for better UX
        if (sock?.sendPresenceUpdate) {
          await sock.sendPresenceUpdate('composing', chatId);
        }

        return replyMessage(sock, msg, content, options);
      },
    };


  } catch (error) {
    log.error(
      'WhatsApp Client',
      'Error while handling private message',
      error
    );
  }
}

// --------------------------------------------------
// HELPER FUNCTIONS
// --------------------------------------------------

function getChatId(msg) {
  return msg.key?.remoteJid ?? '';
}

function getSenderId(msg) {
  // For private chats, remoteJid is the sender
  if (msg.key?.remoteJid) {
    return msg.key.remoteJid;
  }

  // Fallback (groups)
  return msg.key?.participant ?? '';
}

function getMessageBody(msg) {
  if (!msg.message) return '';

  if (msg.message.conversation) return msg.message.conversation;

  if (msg.message.extendedTextMessage?.text)
    return msg.message.extendedTextMessage.text;

  if (msg.message.imageMessage?.caption)
    return msg.message.imageMessage.caption;

  if (msg.message.videoMessage?.caption)
    return msg.message.videoMessage.caption;

  if (
    msg.message.documentWithCaptionMessage?.message?.documentMessage?.caption
  ) {
    return msg.message.documentWithCaptionMessage.message.documentMessage.caption;
  }

  return '';
}

function hasQuotedMsg(msg) {
  return Boolean(
    msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
  );
}

function getQuotedMessage(msg) {
  return msg.message?.extendedTextMessage?.contextInfo?.quotedMessage ?? null;
}

function getMentionedIds(msg) {
  return (
    msg.message?.extendedTextMessage?.contextInfo?.mentionedJid ?? []
  );
}

async function replyMessage(sock, msg, content, options = {}) {
  if (!content) {
    log.warn('WhatsApp Client', 'Attempted to send empty reply');
    return;
  }

  const chatId = getChatId(msg);

  try {
    await sock.sendMessage(
      chatId,
      { text: String(content) },
      { quoted: options.quoted ?? msg }
    );

    log.info('WhatsApp Client', `✅ Replied to ${chatId}`);
  } catch (error) {
    log.error(
      'WhatsApp Client',
      `❌ Failed to reply to ${chatId}`,
      error.message
    );
  }
}