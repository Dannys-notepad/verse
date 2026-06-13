import TelegramBot from 'node-telegram-bot-api'
import dotenv from 'dotenv'
import { generateResponse } from '../../src/response/ai/responseGenerator.js'
import log from '../../src/utils/log.js'
import { checkUser, deductUserToken, resetUserToken } from '../../src/service/user.service.js'
import { shouldResetTokens } from '../../src/models/user.model.js'

dotenv.config()

let isNewUser = false;

function isLocalWebhookUrl(url) {
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return ['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(parsed.hostname) || parsed.hostname.startsWith('192.168.') || parsed.hostname.startsWith('10.') || parsed.hostname.startsWith('172.');
  } catch (error) {
    return false;
  }
}

function shouldUsePolling(webhookUrl) {
  const forcePolling = ['1', 'true', 'yes'].includes(String(process.env.TELEGRAM_USE_POLLING || '').toLowerCase());
  return forcePolling || isLocalWebhookUrl(webhookUrl);
}

const defaultMsg = {
  banned: `
    ⚠️ Your account has been temporarily suspended.

    This usually happens when our Terms of Service are violated or suspicious activity is detected.

    If you believe this is incorrect, please reply here or contact verse.avx@gmail.com for support.
  `,
  freeQuota: `
    ⏳ Your message quota for today has been used.

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
async function initTelegramClient(app) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL
  const webhookPath = process.env.TELEGRAM_WEBHOOK_PATH || '/telegram/webhook'
  const forcePolling = shouldUsePolling(webhookUrl)
  const useWebhook = Boolean(webhookUrl && app && !forcePolling)

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
    if (useWebhook) {
      bot = new TelegramBot(token)
      const fullWebhookUrl = `${webhookUrl.replace(/\/$/, '')}${webhookPath}`
      await bot.setWebHook(fullWebhookUrl)
      log.info('Telegram Client', `✅ Telegram webhook configured at ${fullWebhookUrl}`)

      app.post(webhookPath, async (req, res) => {
        try {
          await bot.processUpdate(req.body)
          res.sendStatus(200)
        } catch (error) {
          log.error('Telegram Client', `Webhook update error: ${error.message}`)
          res.sendStatus(500)
        }
      })
    } else {
      bot = new TelegramBot(token, { polling: true })
      if (forcePolling) {
        log.info('Telegram Client', '✅ Telegram bot initialized in polling mode for local testing')
      } else {
        log.info('Telegram Client', '✅ Telegram bot initialized in polling mode')
      }
    }

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
      const userCheckResult = await checkUser(payload)

      // log.info('Telegram Client', `📱 Message from ${userName}: ${text}`)
      log.info('Telegram Client', `📱 Message from ${userName}: ********`)

      try {
        /************ BOT REPLYING WITHOUT USER DATA */

        /// Send typing indicator
        // await bot.sendChatAction(chatId, 'typing')

        // // Generate response using AI service
        // let response = await generateAIReply({ userMessage: text })

        // // Send response
        // await bot.sendMessage(chatId, response, {
        //   parse_mode: 'Markdown',
        //   reply_to_message_id: msg.message_id,
        // })

        // log.info('Telegram Client', `✅ Response sent to ${userName}`)


        /**************************************************** */
        if (userCheckResult === 'user was temporarily banned') {
          // Send response
          await bot.sendMessage(chatId, defaultMsg.banned, {
            parse_mode: 'Markdown',
            reply_to_message_id: msg.message_id,
          })

          log.info('Telegram Client', `✅ Response sent to ${userName}`)
        } else if (userCheckResult === 'quota exhausted') {
          // Send quota exhausted message
          await bot.sendMessage(chatId, defaultMsg.freeQuota, {
            parse_mode: 'Markdown',
            reply_to_message_id: msg.message_id,
          })

          log.info('Telegram Client', `✅ Response sent to ${userName}`)
        } else if (userCheckResult === 'new user') {
          isNewUser = true

          // Send typing indicator
          await bot.sendChatAction(chatId, 'typing')

          // Generate response using the shared response pipeline
          let response = await generateResponse({ userMessage: text, userId, platform: 'telegram' })
          response = defaultMsg.termsOfService + "\n\n" + response
          isNewUser = false

          // Send response
          await bot.sendMessage(chatId, response, {
            parse_mode: 'Markdown',
            reply_to_message_id: msg.message_id,
          })

          log.info('Telegram Client', `✅ Response sent to ${userName}`)

          await deductUserToken(userId)
        } else {
          // userCheckResult is a valid user object
          const user = userCheckResult

          // Check if tokens should be reset (past 00:20 and 24 hours since last reset)
          if (shouldResetTokens(user.lastTokenReset)) {
            await resetUserToken(userId)
          }

          // Send typing indicator
          await bot.sendChatAction(chatId, 'typing')

          // Generate response using the shared response pipeline
          const response = await generateResponse({ userMessage: text, userId, platform: 'telegram' })


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
