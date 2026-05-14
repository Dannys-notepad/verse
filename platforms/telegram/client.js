import TelegramBot from 'node-telegram-bot-api'
import dotenv from 'dotenv'
import { generateAIReply } from '../../src/response/ai/ai.service.js'
import log from '../../src/utils/log.js'
import { checkUser, deductUserToken, resetUserToken } from '../../src/service/user.service.js'
import { shouldResetTokens } from '../../src/models/user.model.js'

dotenv.config()

let isNewUser = false;
const defaultMsg = {
  banned: `
    ⚠️ Your account has been temporarily suspended.

    This usually happens when our Terms of Service are violated or suspicious activity is detected.

    If you believe this is incorrect, please reply here or contact verse.avx@gmail.com for support.
  `,
  freeQuota: `
    ⏳ Your free message quota for today has been used.

    You can continue using VERSE again after the daily quota resets at 00:20.
    If you need more access, consider upgrading your plan or checking your account status.
  `,
  termsOfService: `
    *VERSE - Terms of Service*

    By using VERSE, you agree to these terms. Please read carefully.

    *1. Use Agreement*
    VERSE is an AI-powered conversational service. By messaging this bot, you accept these terms and agree to comply with all applicable laws.

    *2. User Responsibilities*
    You agree to:
    • Use VERSE for lawful purposes only
    • Provide accurate information
    • Not attempt to abuse, exploit, or gain unauthorized access
    • Respect intellectual property rights

    *3. Prohibited Uses*
    You must not use VERSE to:
    • Generate illegal, harmful, or hateful content
    • Harass, threaten, or harm others
    • Spread misinformation or disinformation
    • Bypass security measures or manipulate the service
    • Violate anyone's rights or laws

    *4. Service Limitations*
    VERSE is provided on an "as-is" basis. We do not guarantee:
    • Uninterrupted service availability
    • Accuracy of all responses
    • Freedom from errors or vulnerabilities

    *5. Data & Privacy*
    Your conversations may be used to improve our service. For details, see our Privacy Policy.

    *6. Account Suspension*
    We reserve the right to suspend or terminate accounts that violate these terms.

    *7. Contact*
    Questions or appeals? Contact verse.avx@gmail.com

    By continuing, you acknowledge you have read and agree to these terms.
  `
}


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
      const payload = {
        id: userId,
        platform: 'telegram'
      }
      // check user before proceeding
      const userStat = await checkUser(payload)

      log.info('Telegram Client', `📱 Message from ${userName}: ${text}`)

      try {
        if (userStat === 'user was temporarily banned') {
          // Send response
          await bot.sendMessage(chatId, defaultMsg.banned, {
            parse_mode: 'Markdown',
            reply_to_message_id: msg.message_id,
          })

          log.info('Telegram Client', `✅ Response sent to ${userName}`)
        } else if (userStat === 'quota exhuated') {

          // Reset tokens if needed
          if (shouldResetTokens(user.lastTokenReset)) {
            user.token = 20;
            user.lastTokenReset = new Date().toISOString();
            await resetUserToken(user); // Save to database

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

            await deductUserToken(userId)
          } else if (userStat === 'new user') {
            isNewUser = true;
          } else {
            // Send response
            await bot.sendMessage(chatId, defaultMsg.freeQuota, {
              parse_mode: 'Markdown',
              reply_to_message_id: msg.message_id,
            })

            log.info('Telegram Client', `✅ Response sent to ${userName}`)
          }


        } else {
          // Send typing indicator
          await bot.sendChatAction(chatId, 'typing')

          // Generate response using AI service
          const response = await generateAIReply({ userMessage: text })
          if (isNewUser) {
            response = defaultMsg.termsOfService + "\n\n" + response;
            isNewUser = false;
          }
          // Send response
          await bot.sendMessage(chatId, response, {
            parse_mode: 'Markdown',
            reply_to_message_id: msg.message_id,
          })

          log.info('Telegram Client', `✅ Response sent to ${userName}`)

          await deductUserToken(userId)
        }
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
