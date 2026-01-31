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

    // Ignore messages sent by this client (prevents reply loops)
    if (msg.key?.fromMe) return;

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
          try {
            await sock.sendPresenceUpdate('composing', chatId);
          } catch (e) {
            // Ignore presence update errors
            log.error('WhatsApp Client', 'Failed to send presence update', e.message);
          }
        }

        const replyResult = await replyMessage(sock, msg, content, options);
        
        // Mark our own reply as read immediately after sending
        if (replyResult && sock?.sendReadReceipt) {
          try {
            // For our own messages, we mark them as read immediately
            // This gives the impression of a seamless conversation
            setTimeout(async () => {
              try {
                // Use the reply's message key to mark it as read
                // If replyResult contains the sent message info
                if (replyResult.key?.id) {
                  await sock.sendReadReceipt(chatId, null, [replyResult.key.id]);
                  log.error('WhatsApp Client', `Marked our reply ${replyResult.key.id} as read`);
                }
              } catch (e) {
                // Silent fail for read receipt on our own messages
              }
            }, 1000); // Small delay before marking our own message as read
          } catch (e) {
            // Ignore errors for marking our own messages as read
          }
        }
        
        return replyResult;
      },
      
      /**
       * Mark message as read (blue tick)
       */
      markAsRead: async () => {
        if (!sock?.sendReadReceipt) return false;
        
        try {
          // Get the message ID
          const messageId = msg.key?.id;
          if (!messageId) return false;
          
          // For direct chats, just use chatId and messageId
          // For group chats, include the participant
          const participant = msg.key?.participant ?? null;
          
          await sock.sendReadReceipt(chatId, participant, [messageId]);
          log.info('WhatsApp Client', `✅ Marked message ${messageId} as read`);
          return true;
        } catch (error) {
          log.error('WhatsApp Client', 'Failed to mark message as read', error.message);
          return false;
        }
      },
      
      /**
       * Mark message as delivered (double grey tick)
       */
      markAsDelivered: async () => {
        if (!sock?.sendReceipt) return false;
        
        try {
          await sock.sendReceipt(chatId, msg.key?.participant, [msg.key?.id]);
          log.error('WhatsApp Client', `Marked message ${msg.key?.id} as delivered`);
          return true;
        } catch (error) {
          log.error('WhatsApp Client', 'Failed to mark message as delivered', error.message);
          return false;
        }
      },
    };

    // --------------------------------------------------
    // 5. MARK INCOMING MESSAGE AS READ
    // --------------------------------------------------
    // Mark as delivered first (usually happens automatically but we ensure it)
    await messageObj.markAsDelivered();
    
    // Mark as read after a short delay (more natural UX)
    setTimeout(async () => {
      await messageObj.markAsRead();
    }, 1000); // 1 second delay before showing blue tick

    // --------------------------------------------------
    // 6. PROCESS MESSAGE & GENERATE REPLY
    // --------------------------------------------------
    await processMessageAndReply(messageObj);

  } catch (error) {
    log.error(
      'WhatsApp Client',
      'Error while handling private message',
      error.message
    );
  }
}

/**
 * Process message through AI and send reply
 */
async function processMessageAndReply(messageObj) {
  let replyAttempted = false;
  
  try {
    const { generateAIReply } = await import('../../../shared/ai/ai.service.js');

    // Generate AI reply
    const aiResponse = await generateAIReply({
      userMessage: messageObj.text,
    });

    // Send reply through WhatsApp
    replyAttempted = true;
    const replyResult = await messageObj.reply(aiResponse);
    return replyResult;
  } catch (error) {
    log.error(
      'WhatsApp Client',
      'Failed to process message and generate reply',
      error.message
    );
    
    // Only send error reply if we haven't already attempted to reply
    if (!replyAttempted) {
      try {
        await messageObj.reply('Sorry, I encountered an error processing your message. Please try again.');
      } catch (replyError) {
        // If sending error message also fails, just log it and don't retry
        log.error(
          'WhatsApp Client',
          'Failed to send error message to user',
          replyError.message
        );
      }
    }
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
    return null;
  }

  const chatId = getChatId(msg);

  try {
    // Add typing indicator before sending
    if (sock?.sendPresenceUpdate) {
      try {
        await sock.sendPresenceUpdate('composing', chatId);
      } catch (e) {
        // Ignore presence errors
      }
    }
    
    const sentMessage = await sock.sendMessage(
      chatId,
      { text: String(content) },
      { quoted: options.quoted ?? msg }
    );

    log.info('WhatsApp Client', `✅ Replied to ${chatId}`);
    return sentMessage;
  } catch (error) {
    log.error(
      'WhatsApp Client',
      `❌ Failed to reply to ${chatId}`,
      error.message
    );
    throw error; // Re-throw so caller knows reply failed
  } finally {
    // Clear typing indicator after sending
    if (sock?.sendPresenceUpdate) {
      try {
        await sock.sendPresenceUpdate('paused', chatId);
      } catch (e) {
        // Ignore presence errors
      }
    }
  }
}