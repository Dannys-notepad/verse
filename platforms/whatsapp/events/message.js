import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import log from '../../../shared/utils/log.js';


// Recreate __filename and __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export default async function handleMessage(msg, sock){
  try {
    await privateMessage(msg, sock)
  } catch (e) {
    log.error('WhatsApp Client', 'Failed to handle message', error.message);
  }
}

async function groupMessage(msg, sock){
  
}

async function privateMessage(msg, sock) {  
  try {
    
    // --- TOGGLE FOR SELF-MESSAGES ---
    const REPLY_TO_SELF = null;
    
    // --- VALIDATION CHECKS ---
    if (!msg.message) return;
    
    const messageTimestamp = msg.messageTimestamp * 1000;
    const currentTime = Date.now();
    if (currentTime - messageTimestamp > 60000 && msg.type === "notify") return;
    
    if (msg.message.protocolMessage || 
        msg.message.senderKeyDistributionMessage ||
        msg.message.stickerMessage ||
        msg.message.ephemeralMessage) {
      return;
    }

    const chatId = getChatId(msg);
    if (chatId.endsWith('@broadcast') || chatId.endsWith('status@broadcast')) {
      return;
    }

    /*const isFromSelf = isFromMe(msg);
    if (isFromSelf && !REPLY_TO_SELF) {
      return;
    }*/

    // --- EXTRACT MESSAGE DATA ---
    const senderId = getSenderId(msg, sock, isFromSelf);
    const body = getMessageBody(msg);
    
    if (!body) return;

    // Check if message has the command prefix
    //const hasPrefix = body.startsWith(BOT.COMMAND_PREFIX);
    //if (!hasPrefix) return;

    const receivedAt = Date.now();

    // --- NORMALIZE MESSAGE ---
    const normalizedBody = body
      .normalize("NFKC")
      .replace(/[\u0300-\u036f\u00b4\u0060\u005e\u007e]/g, "")
      .replace(/[\u200B-\u200D\uFEFF\u2060]/g, "")
      .trim();

    // Extract command and args
    //const commandBody = normalizedBody.substring(BOT.COMMAND_PREFIX.length).trim();
    //const args = commandBody.split(/\s+/);
    //const commandName = args.shift()?.toLowerCase() || '';
    //const cleanArgs = args;
    
    //log.info('WhatsApp Client', `Command: ${commandName}, Sender: ${senderId}, FromMe: ${isFromSelf}`);
    
    log.info('WhatsApp Client', `Message received from, Sender: ${senderId}`);

    // --- CREATE MESSAGE OBJECT ---
    const messageObj = {
      ...msg,
      body: commandBody,
      senderId,
      chatId,
      fromMe: isFromSelf,
      sock,
      hasQuotedMsg: hasQuotedMsg(msg),
      getQuotedMessage: () => getQuotedMessage(msg),
      mentionedIds: getMentionedIds(msg),
      
      // REPLY FUNCTION
      reply: async (content, options = {}) => {
        const latency = Date.now() - receivedAt;
        const latencySec = (latency / 1000).toFixed(2);
        log.info('WhatsApp Client', `💬 Replying to ${senderId} - Latency: ${latencySec}s`);
        
        // Send typing indicator
        if (sock && sock.sendPresenceUpdate) {
          await sock.sendPresenceUpdate('composing', chatId);
          //await new Promise(resolve => setTimeout(resolve, 300));
        }
        
        return replyMessage(sock, msg, content, options);
      },
    };

  } catch (err) {
    log.error('WhatsApp Client', "Error handling message:", err);
  }
}

// --- HELPER FUNCTIONS ---
function getChatId(msg) { 
  return msg.key?.remoteJid || ''; 
}

function getSenderId(msg, sock, isFromSelf) { 
  // If it's from self, use the sock.user.id (bot's JID)
  /*if (isFromSelf && sock && sock.user && sock.user.id) {
    return sock.user.id;
  }*/
  
  // For group messages, use participant; for individual chats, use remoteJid
  if (msg.key?.fromMe && msg.key?.id) {
    return msg.key.id.split('_')[0] || '';
  }
  
  return msg.key?.participant || msg.key?.remoteJid || ''; 
}

function getMessageBody(msg) {
  if (!msg.message) return '';
  
  // Check different message types
  if (msg.message?.conversation) return msg.message.conversation;
  if (msg.message?.extendedTextMessage?.text) return msg.message.extendedTextMessage.text;
  if (msg.message?.imageMessage?.caption) return msg.message.imageMessage.caption;
  if (msg.message?.videoMessage?.caption) return msg.message.videoMessage.caption;
  if (msg.message?.documentWithCaptionMessage?.message?.documentMessage?.caption) 
    return msg.message.documentWithCaptionMessage.message.documentMessage.caption;
  return '';
}

/*function isFromMe(msg) { 
  return msg.key?.fromMe || false; 
}*/

function hasQuotedMsg(msg) { 
  return !!msg.message?.extendedTextMessage?.contextInfo?.quotedMessage; 
}

function getQuotedMessage(msg) { 
  return msg.message?.extendedTextMessage?.contextInfo?.quotedMessage; 
}

function getMentionedIds(msg) { 
  const mentions = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || []; 
  return mentions.filter(id => id); 
}

async function replyMessage(sock, msg, content, options = {}) {
  const chatId = getChatId(msg);
  
  if (!content) {
    log.warn('WhatsApp Client', 'Attempted to send empty message');
    return;
  }
  
  if (sock && sock.sendMessage) {
    try {
      await sock.sendMessage(chatId, { text: content }, {
        quoted: options.quoted || msg
      });
      log.info('WhatsApp Client', `✅ Replied to ${chatId}`);
    } catch (error) {
      log.error('WhatsApp Client', `❌ Failed to reply ${chatId}:`, error.message);
    }
  } else {
    log.warn('WhatsApp Client', 'Socket or sendMessage not available');
  }
}