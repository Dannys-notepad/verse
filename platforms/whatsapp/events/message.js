/**
 * WhatsApp Message Event Handler
 *
 * Processes incoming WhatsApp messages and generates intelligent AI responses
 * Handles message validation, normalization, and automatic reply generation
 *
 * Features:
 * - Message type filtering (ignores system/ephemeral messages)
 * - Broadcast/status filtering
 * - Unicode normalization
 * - AI-powered response generation
 * - Typing indicators for better UX
 * - Comprehensive logging
 */
import { generateResponse } from '../../../src/response/ai/responseGenerator.js';
import log from '../../../src/utils/log.js';

/**
 * Configuration constants
 */
const CONFIG = {
    // Set to true to reply to bot's own messages (for testing)
    REPLY_TO_SELF: false,
    // Maximum message age to process (prevents processing old messages)
    // 60000ms = 1 minute
    MAX_MESSAGE_AGE_MS: 60000,
    // Typing indicator delay to appear more natural (ms)
    TYPING_DELAY_MS: 1200,
};

/**
 * Main message event handler
 * Entry point for all incoming WhatsApp messages
 *
 * Processing flow:
 * 1. Validate message structure and age
 * 2. Filter out system/broadcast messages
 * 3. Extract and normalize message content
 * 4. Generate AI response
 * 5. Send response with typing indicator
 *
 * @param {Object} msg - Message object from WhatsApp
 * @param {Object} sock - Socket connection to WhatsApp
 */
export default async function handleMessage(msg, sock) {
    try {
        // STAGE 1: Validate message structure
        // Reject if no message content
        if (!msg.message) {
            log.info('WhatsApp Client', 'Rejected: No message content');
            return;
        }

        // STAGE 2: Check message age
        // Ignore messages older than MAX_MESSAGE_AGE_MS (prevents processing stale messages)
        const messageTimestamp = msg.messageTimestamp * 1000;
        const currentTime = Date.now();
        const messageAge = currentTime - messageTimestamp;

        if (messageAge > CONFIG.MAX_MESSAGE_AGE_MS && msg.type === 'notify') {
            log.info('WhatsApp Client', `Rejected: Message too old (${messageAge}ms)`);
            return;
        }

        // STAGE 3: Filter out system messages and special message types
        // These don't require responses
        if (msg.message.protocolMessage ||
            msg.message.senderKeyDistributionMessage ||
            msg.message.stickerMessage ||
            msg.message.ephemeralMessage) {
            log.info('WhatsApp Client', 'Rejected: System/special message type');
            return;
        }

        // STAGE 4: Filter out broadcasts and status updates
        const chatId = getChatId(msg);
        if (chatId.endsWith('@broadcast') || chatId.endsWith('status@broadcast')) {
            log.info('WhatsApp Client', 'Rejected: Broadcast or status message');
            return;
        }

        // STAGE 5: Filter self-messages based on configuration
        const isFromSelf = isFromMe(msg);
        if (isFromSelf && !CONFIG.REPLY_TO_SELF) {
            //log.info('WhatsApp Client', 'Rejected: Message from self');
            return;
        }

        // Mark incoming message as read for the sender (if possible)
        // This acknowledges receipt on the recipient side and prevents unread badges
        try {
            if (!isFromSelf) await markAsRead(sock, msg, chatId);
        } catch (err) {
            log.warn('WhatsApp Client', `markAsRead failed: ${err.message}`);
        }

        // STAGE 6: Extract message content and metadata
        const senderId = getSenderId(msg, sock, isFromSelf);
        const rawBody = getMessageBody(msg);

        if (!rawBody) {
            log.info('WhatsApp Client', 'Rejected: No extractable message body');
            return;
        }

        // Record when message was received for latency calculation
        const receivedAt = Date.now();

        // STAGE 7: Normalize message text
        // Removes accents, invisible characters, and trims whitespace
        // Ensures consistent text processing
        const normalizedMessage = rawBody
            .normalize('NFKC') // Canonical composition normalization
            .replace(/[\u0300-\u036f\u00b4\u0060\u005e\u007e]/g, '') // Remove accents
            .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '') // Remove invisible characters
            .trim();

        log.info('WhatsApp Client', `📥 Message received | User: ${senderId} | Content: "${normalizedMessage.substring(0, 50)}${normalizedMessage.length > 50 ? '...' : ''}"`);

        // STAGE 8: Generate AI response
        // Call the response generation system with platform context
        let aiResponse;
        try {
            aiResponse = await generateResponse({
                userMessage: normalizedMessage,
                userId: senderId,
                platform: 'whatsapp',
            });

            log.info('WhatsApp Client', `✨ Response generated | Length: ${aiResponse.length} chars`);
        } catch (error) {
            log.error('WhatsApp Client', `Failed to generate response: ${error.message}`);
            // Use fallback message if generation fails
            aiResponse = "Sorry, I encountered an error processing your message. Please try again.";
        }

        // STAGE 9: Send response with typing indicator
        const sendResult = await sendReplyWithTyping(sock, msg, chatId, aiResponse, receivedAt, senderId);

        if (sendResult) {
            log.info('WhatsApp Client', `✅ Response sent successfully`);
        } else {
            log.warn('WhatsApp Client', `⚠️ Failed to send response`);
        }

    } catch (err) {
        log.error('WhatsApp Client', `Unexpected error handling message: ${err.message}`, err);
    }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract chat ID from message
 * Used to determine where to send the reply
 *
 * @param {Object} msg - Message object
 * @returns {string} Chat ID (JID format)
 */
function getChatId(msg) {
    return msg.key?.remoteJid || '';
}

/**
 * Extract sender ID from message
 * Handles both individual chats and group messages
 *
 * For group messages: returns participant JID
 * For individual chats: returns sender's JID
 * For self-messages: returns bot's JID
 *
 * @param {Object} msg - Message object
 * @param {Object} sock - Socket connection
 * @param {boolean} isFromSelf - Whether message is from bot
 * @returns {string} Sender's JID
 */
function getSenderId(msg, sock, isFromSelf) {
    // If it's from the bot itself, use bot's JID
    if (isFromSelf && sock && sock.user && sock.user.id) {
        return sock.user.id;
    }

    // Try to get participant from group message
    if (msg.key?.participant) {
        return msg.key.participant;
    }

    // Fallback to remote JID (individual chat sender)
    return msg.key?.remoteJid || 'unknown';
}

/**
 * Extract message body text
 * Handles multiple message types: text, captions, quoted messages
 *
 * Supported types:
 * - Regular text conversation
 * - Extended text (with formatting)
 * - Image captions
 * - Video captions
 * - Document captions
 *
 * @param {Object} msg - Message object
 * @returns {string} Message body text
 */
function getMessageBody(msg) {
    if (!msg.message) return '';

    // Text-only message
    if (msg.message?.conversation) {
        return msg.message.conversation;
    }

    // Extended text message (with mentions, formatting)
    if (msg.message?.extendedTextMessage?.text) {
        return msg.message.extendedTextMessage.text;
    }

    // Image with caption
    if (msg.message?.imageMessage?.caption) {
        return msg.message.imageMessage.caption;
    }

    // Video with caption
    if (msg.message?.videoMessage?.caption) {
        return msg.message.videoMessage.caption;
    }

    // Document with caption
    if (msg.message?.documentWithCaptionMessage?.message?.documentMessage?.caption) {
        return msg.message.documentWithCaptionMessage.message.documentMessage.caption;
    }

    // No extractable text
    return '';
}

/**
 * Check if message is from the bot itself
 * Used to prevent infinite reply loops
 *
 * @param {Object} msg - Message object
 * @returns {boolean} True if message is from bot
 */
function isFromMe(msg) {
    return msg.key?.fromMe || false;
}

/**
 * Attempt to mark the incoming message as read for the sender.
 * Tries multiple possible socket methods defensively and logs the outcome.
 * This prevents unread badges for the user and improves UX.
 *
 * @param {Object} sock - Socket connection
 * @param {Object} msg - Original message object
 * @param {string} chatId - Chat ID to mark as read
 * @returns {Promise<boolean>} True if marked as read, false otherwise
 */
async function markAsRead(sock, msg, chatId) {
    if (!sock) return false;

    try {
        // Common Baileys-style API: sendReadReceipt(chatId, participant, messageId)
        if (typeof sock.sendReadReceipt === 'function') {
            try {
                await sock.sendReadReceipt(chatId, msg.key?.participant || msg.key?.remoteJid, msg.key?.id);
                log.info('WhatsApp Client', `Marked as read via sendReadReceipt for ${chatId}`);
                return true;
            } catch (e) {
                log.error('WhatsApp Client', `sendReadReceipt failed: ${e.message}`);
            }
        }

        // Alternative: readMessages(keys[])
        if (typeof sock.readMessages === 'function') {
            try {
                await sock.readMessages([msg.key]);
                log.info('WhatsApp Client', `Marked as read via readMessages for ${chatId}`);
                return true;
            } catch (e) {
                log.error('WhatsApp Client', `readMessages failed: ${e.message}`);
            }
        }

        // Alternative: send a low-level read action if available
        if (typeof sock.sendRead === 'function') {
            try {
                await sock.sendRead(chatId);
                log.info('WhatsApp Client', `Marked as read via sendRead for ${chatId}`);
                return true;
            } catch (e) {
                log.error('WhatsApp Client', `sendRead failed: ${e.message}`);
            }
        }

        // No supported read API found
        log.warn('WhatsApp Client', 'No supported mark-as-read API available on socket');
        return false;
    } catch (error) {
        log.warn('WhatsApp Client', `markAsRead unexpected error: ${error.message}`);
        return false;
    }
}
/**
 * Send reply with typing indicator for natural UX
 * Shows "typing..." status before sending response
 *
 * Typing indicators make the bot appear more natural and less automated
 * Improves user experience by setting expectations
 *
 * @param {Object} sock - Socket connection
 * @param {Object} msg - Original message object
 * @param {string} chatId - Chat ID to send response to
 * @param {string} content - Response content to send
 * @param {number} receivedAt - Timestamp when original message was received
 * @param {string} senderId - ID of sender (for logging)
 * @returns {Promise<boolean>} True if message sent successfully
 */
async function sendReplyWithTyping(sock, msg, chatId, content, receivedAt, senderId) {
    // Calculate latency (time from receipt to response)
    const latency = Date.now() - receivedAt;
    const latencySec = (latency / 1000).toFixed(2);

    try {
        // Send typing indicator if socket supports it
        if (sock && typeof sock.sendPresenceUpdate === 'function') {
            try {
                await sock.sendPresenceUpdate('composing', chatId);
                log.info('WhatsApp Client', `⌨️ Typing indicator sent to ${chatId}`);

                // Wait a bit to appear natural (not instant response)
                await new Promise(resolve => setTimeout(resolve, CONFIG.TYPING_DELAY_MS));
            } catch (e) {
                log.warn('WhatsApp Client', `sendPresenceUpdate failed: ${e.message}`);
            }
        }

        // Validate socket and method availability
        if (!sock || !sock.sendMessage) {
            log.error('WhatsApp Client', 'Socket or sendMessage method not available');
            return false;
        }

        // Validate response content
        if (!content) {
            log.warn('WhatsApp Client', 'Attempted to send empty message');
            return false;
        }

        // Send message with quote (reply context)
        // quoted: msg links the reply to the original message
        await sock.sendMessage(chatId, { text: content }, { quoted: msg });

        // Clear typing indicator after sending
        if (sock && typeof sock.sendPresenceUpdate === 'function') {
            try {
                await sock.sendPresenceUpdate('paused', chatId);
            } catch (e) {
                log.warn('WhatsApp Client', `Failed to clear typing presence: ${e.message}`);
            }
        }

        log.info('WhatsApp Client', `📤 Response sent | To: ${senderId} | Latency: ${latencySec}s | Length: ${content.length} chars`);
        return true;

    } catch (error) {
        log.error('WhatsApp Client', `Failed to send response to ${senderId}: ${error.message}`);
        return false;
    }
}