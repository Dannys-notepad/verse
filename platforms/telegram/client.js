import TelegramBot from 'node-telegram-bot-api'
import dotenv from 'dotenv'
import { generateAIReply } from '../../src/response/ai/ai.service.js'
import log from '../../src/utils/log.js'

dotenv.config()

/**
 * Initialize Telegram client
 * Integrates with main app server (polling mode)
 */
async function initTelegramClient() {
  const token = process.env.TELEGRAM_BOT_TOKEN

  if (!token) {
    log.warn('Telegram Client', '❌ TELEGRAM_BOT_TOKEN not configured - skipping Telegram')
    return {
      waitForReady: () => Promise.resolve(),
      stop: async () => { }
    }
  }

  let isReady = false
  let bot = null

  try {
    bot = new TelegramBot(token, { polling: true })
    log.info('Telegram Client', '✅ Telegram bot initialized')

    // Handle ALL messages (no command filtering)
    bot.on('message', async (msg) => {
      if (!msg.text) return

      const chatId = msg.chat.id
      const userId = msg.from.id
      const userName = msg.from.first_name || 'User'
      const text = msg.text

      log.info('Telegram Client', `📱 Message from ${userName}: ${text}`)

      try {
        // Send typing indicator
        await bot.sendChatAction(chatId, 'typing')

        // Generate response using AI service
        const response = await generateAIReply({ userMessage: text })

        // Send response
        await bot.sendMessage(chatId, response, {
          parse_mode: 'Markdown',
          reply_to_message_id: msg.message_id,
        })

        log.info('Telegram Client', `✅ Response sent to ${userName}`)
      } catch (error) {
        log.error('Telegram Client', `Message handling error: ${error.message}`)

        try {
          await bot.sendMessage(
            chatId,
            "Sorry, I encountered an error. Please try again.",
            { reply_to_message_id: msg.message_id }
          )
        } catch (sendError) {
          log.error('Telegram Client', `Failed to send error message: ${sendError.message}`)
        }
      }
    })

    // Error handling
    bot.on('error', (error) => {
      log.error('Telegram Client', `Bot error: ${error.message}`)
    })

    bot.on('polling_error', (error) => {
      log.error('Telegram Client', `Polling error: ${error.message}`)
    })

    isReady = true
    log.info('Telegram Client', '🚀 Telegram client ready to receive messages')

  } catch (error) {
    log.error('Telegram Client', `Failed to initialize: ${error.message}`)
  }

  // Return handle for lifecycle management
  return {
    waitForReady: () => Promise.resolve(isReady),
    stop: async () => {
      try {
        if (bot && typeof bot.stopPolling === 'function') {
          await bot.stopPolling()
          log.info('Telegram Client', '✅ Telegram bot stopped')
        }
      } catch (error) {
        log.error('Telegram Client', `Error during stop: ${error.message}`)
      }
    }
  }
}

export default initTelegramClient
