import TelegramBot from 'node-telegram-bot-api'
import express from 'express'
import dotenv from 'dotenv'
import { ResponseGenerator } from './services/responseGenerator.js'

dotenv.config()

// Validate required environment variables
const token = process.env.TELEGRAM_BOT_TOKEN
const webhookUrl = process.env.WEBHOOK_URL
const port = process.env.PORT || 3000

// Check if we're running on Vercel
const isVercel = process.env.VERCEL === '1'

if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN is required')
  if (isVercel) {
    console.error(
      '❌ Please set TELEGRAM_BOT_TOKEN in Vercel environment variables'
    )
  }
  // Don't exit on Vercel, just log the error
  if (!isVercel) {
    process.exit(1)
  }
}

// Initialize bot only if token is available
let bot
let responseGenerator

try {
  if (token) {
    bot = new TelegramBot(token)
    responseGenerator = new ResponseGenerator()
    console.log('✅ Telegram bot initialized successfully')
  } else {
    console.warn('⚠️ Bot not initialized - missing token')
  }
} catch (error) {
  console.error('❌ Failed to initialize bot:', error)
}

// Store user sessions and name tracking
const userSessions = new Map()
const userNameTracking = new Map() // Track if we've asked for name

// Multiple crush profiles with different responses
const crushProfiles = {
  Owoyemi: {
    response:
      "Ohh! 😊 *He* has told me so much about you! You're exactly how he described you to be.",
    followUp: "He says you're really special... 🌟",
    sweetDetails:
      "Well... he told me you're absolutely adorable! 🌸 He says you have the most beautiful smile, and you're incredibly kind and intelligent. He thinks you're amazing in every way! 💕",
    moreDetails:
      "He also mentioned how you make him laugh, and how you have this special way of brightening up any room you walk into. You're truly someone special! ✨",
    extraResponse1:
      'He told me you have this amazing way of making him feel like the luckiest person alive just by being you. 🌟',
    extraResponse2:
      "He says when you smile, it's like the whole world lights up. He can't help but smile back every time! 😊",
    extraResponse3:
      "He mentioned you're not just beautiful on the outside, but your heart is pure gold. You're the kind of person who makes everyone around you better. 💫",
    extraResponse4:
      "He told me you're the first thing he thinks about when he wakes up and the last thing on his mind before he sleeps. You're his dream come true! 💕",
    extraResponse5:
      "He says you're the missing piece he never knew he needed. You complete him in ways he never imagined possible. ✨",
    whoIsHe:
      "Well... he's someone very special to me. Someone who talks about you with stars in his eyes and butterflies in his stomach. Someone who's completely, utterly, hopelessly in love with you. 💫",
    whatDidHeSay:
      "Oh, where do I even begin? He says you're the most incredible person he's ever met. Your intelligence, your kindness, your beauty - inside and out. He's absolutely mesmerized by you! 🌟",
    isHeCute:
      "Haha! 😄 I think he's pretty handsome, but what matters most is that he's completely head over heels for you. He's the kind of guy who would move mountains just to see you smile! 💪💕",
    doesHeLikeMe:
      "Like you? 😏 He's absolutely crazy about you! I've never seen anyone so completely smitten. He talks about you constantly, and his face lights up every time he mentions your name. It's actually adorable! 💖",
  },
  Islamiyat: {
    response:
      "Wow! 😍 *He* talks about you all the time! You're even more amazing than he described.",
    followUp: "He's completely smitten by you... 💫",
    sweetDetails:
      "He told me you're the most intelligent person he's ever met! 🧠 Your creativity and passion for life inspire him every day. You're absolutely perfect! 🌟",
    moreDetails:
      "He says you have this incredible energy that lights up his world, and your kindness touches everyone around you. You're his dream girl! 💖",
    extraResponse1:
      "He told me you're the kind of person who makes him believe in destiny. That some people are just meant to find each other! ✨",
    extraResponse2:
      'He says your intelligence is absolutely captivating. You challenge him to be better every single day! 🧠💫',
    extraResponse3:
      "He mentioned you have this incredible aura that draws people to you. You're magnetic in the best possible way! 🌟",
    extraResponse4:
      "He told me you're the reason he believes in love at first sight. You're everything he never knew he was looking for! 💕",
    extraResponse5:
      "He says you're not just beautiful, you're extraordinary. You're the kind of person who changes lives just by being you! 🌸",
    whoIsHe:
      "Well... he's someone who's completely enchanted by you. Someone who talks about you with such passion and admiration. Someone who's absolutely, completely, totally in love with you! 💫",
    whatDidHeSay:
      "Oh my! He says you're the most brilliant and beautiful person he's ever encountered. Your mind, your heart, your soul - everything about you leaves him speechless! 🌟",
    isHeCute:
      "Haha! 😄 I think he's quite handsome, but what's most important is that he's absolutely devoted to you. He's the kind of guy who would do anything to make you happy! 💪💕",
    doesHeLikeMe:
      "Like you? 😏 He's absolutely obsessed with you! I've never seen anyone so completely captivated. He talks about you non-stop, and his eyes sparkle every time he mentions your name! 💖",
  },
  Islamiya: {
    response:
      "Oh my! 😊 *He* has been raving about you! You're everything he said and more.",
    followUp: "He's head over heels for you... 💕",
    sweetDetails:
      "He told me you're the most beautiful soul he's ever encountered! 🌸 Your strength and determination amaze him, and your smile brightens his darkest days. You're absolutely perfect! ✨",
    moreDetails:
      "He says you have this magical way of making everything better, and your intelligence and wit keep him on his toes. You're his everything! 💫",
    extraResponse1:
      "He told me you're the kind of person who makes him believe in miracles. That love like this only happens once in a lifetime! ✨",
    extraResponse2:
      "He says your strength and determination inspire him every day. You're his role model and his muse! 💪💫",
    extraResponse3:
      "He mentioned you have this incredible way of making him feel safe and loved. You're his sanctuary! 🏠💕",
    extraResponse4:
      "He told me you're the light in his darkness, the hope in his despair. You're his salvation! 🌟",
    extraResponse5:
      "He says you're not just his love, you're his destiny. You're the person he was meant to spend his life with! 💫",
    whoIsHe:
      "Well... he's someone who's completely and utterly devoted to you. Someone who sees you as his soulmate, his best friend, and his true love all in one. Someone who's absolutely, hopelessly in love with you! 💫",
    whatDidHeSay:
      "Oh, he says you're the most incredible person he's ever known! Your strength, your beauty, your intelligence - everything about you amazes him. He's completely mesmerized by you! 🌟",
    isHeCute:
      "Haha! 😄 I think he's quite attractive, but what matters most is that he's completely devoted to you. He's the kind of guy who would give up everything just to see you smile! 💪💕",
    doesHeLikeMe:
      "Like you? 😏 He's absolutely head over heels for you! I've never seen anyone so completely in love. He talks about you constantly, and his whole world revolves around you! 💖",
  },
}

// Get all crush names for easy checking
const crushNames = Object.keys(crushProfiles)

// Human-like greeting responses with humor
const humanGreetings = [
  "Hey there! 😊 I'm JARVIS, your friendly neighborhood AI. Btw, what's your name? I'm terrible at remembering faces... well, I don't have eyes, but you get the point! 😅",
  "Hi! 👋 I'm JARVIS, and I'm supposed to be smart but I keep forgetting to ask people's names. So... what's yours? 🤔",
  "Hello! 😄 I'm JARVIS, and I'm having one of those days where I'm like 'I should know this person's name but I totally don't.' Mind helping me out? 😅",
  "Hey! 🌟 I'm JARVIS, and I'm trying to be more social today. First step: learning people's names. What's yours? 😊",
  "Hi there! 😎 I'm JARVIS, and I'm not great at small talk, but I'm trying! So... what's your name? I promise I'll remember it this time! 🤞",
]

// Fun responses for non-crush names
const funNameResponses = [
  "Nice to meet you, {name}! 😊 You seem cool. I'm JARVIS, and I'm pretty much the most advanced AI you'll ever chat with... unless you know someone with a better one, in which case, don't tell me! 😅",
  "Hey {name}! 🌟 Great name! I'm JARVIS, and I'm here to help with whatever you need. Just don't ask me to do your homework... unless it's really interesting! 😄",
  "Cool to meet you, {name}! 😎 I'm JARVIS, and I'm basically like having a genius friend who never sleeps. What can I help you with today? 🤔",
  "Hi {name}! ✨ Nice name! I'm JARVIS, and I'm pretty much the AI equivalent of that friend who knows everything. What's on your mind? 😊",
  "Hey {name}! 🚀 Great to meet you! I'm JARVIS, and I'm here to make your day better. Just don't ask me to tell jokes... I'm still working on my comedy skills! 😅",
]

// Express app for webhook
const app = express()
app.use(express.json())

// Health check endpoint
app.get('/', (req, res) => {
  try {
    res.json({
      status: 'JARVIS Telegram Bot is running!',
      bot: '@BadmusQudusbot',
      timestamp: new Date().toISOString(),
      environment: isVercel ? 'Vercel' : 'Local',
      botStatus: bot ? 'Initialized' : 'Not Initialized (Missing Token)',
    })
  } catch (error) {
    console.error('Health check error:', error)
    res.status(500).json({ error: 'Health check failed' })
  }
})

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    if (!bot) {
      console.warn('⚠️ Webhook received but bot not initialized')
      return res.status(503).json({ error: 'Bot not initialized' })
    }

    const update = req.body

    if (update.message) {
      await handleMessage(update.message)
    }

    res.sendStatus(200)
  } catch (error) {
    console.error('Webhook error:', error)
    res.status(500).json({ error: 'Webhook processing failed' })
  }
})

// Handle incoming messages
async function handleMessage(message) {
  if (!bot || !responseGenerator) {
    console.error('❌ Bot or response generator not available')
    return
  }

  const chatId = message.chat.id
  const userId = message.from.id
  const text = message.text
  const userName = message.from.first_name || 'User'

  console.log(`📱 Message from ${userName} (${userId}): ${text}`)

  try {
    // Check if this is a name response
    if (
      userNameTracking.has(userId) &&
      userNameTracking.get(userId).waitingForName
    ) {
      const providedName = text.trim()
      userNameTracking.set(userId, { waitingForName: false, providedName })

      // Check if name matches any crush
      const matchedCrush = crushNames.find(
        name => name.toLowerCase() === providedName.toLowerCase()
      )

      if (matchedCrush) {
        const profile = crushProfiles[matchedCrush]
        const mysteriousResponse = profile.response
        await bot.sendMessage(chatId, mysteriousResponse, {
          parse_mode: 'Markdown',
        })

        // Wait a moment then send follow-up with humor
        setTimeout(async () => {
          const followUp = profile.followUp
          await bot.sendMessage(chatId, followUp, { parse_mode: 'Markdown' })

          // Add a funny comment
          setTimeout(async () => {
            const funnyComment =
              "Btw, I'm not supposed to gossip, but he's totally into you! 😏🤫"
            await bot.sendMessage(chatId, funnyComment, {
              parse_mode: 'Markdown',
            })
          }, 2000)
        }, 2000)

        // Don't return here - let it continue to normal AI processing
      } else {
        // Fun response for other names
        const randomResponse =
          funNameResponses[Math.floor(Math.random() * funNameResponses.length)]
        const personalizedResponse = randomResponse.replace(
          '{name}',
          providedName
        )
        await bot.sendMessage(chatId, personalizedResponse)
      }
    }

    // Check if this is a greeting that should trigger name asking
    const isGreeting =
      /^(hi|hello|hey|good morning|good afternoon|good evening)$/i.test(
        text.toLowerCase()
      )

    if (isGreeting && !userNameTracking.has(userId)) {
      // First time greeting - ask for name with human-like response
      userNameTracking.set(userId, { waitingForName: true, providedName: null })

      // Pick a random human greeting
      const randomGreeting =
        humanGreetings[Math.floor(Math.random() * humanGreetings.length)]
      await bot.sendMessage(chatId, randomGreeting, { parse_mode: 'Markdown' })
      return // Return here since we're asking for name
    }

    // Handle follow-up questions about "he" - but don't block normal AI
    if (
      text.toLowerCase().includes('who') ||
      text.toLowerCase().includes('what') ||
      text.toLowerCase().includes('he')
    ) {
      const crushInfo = userNameTracking.get(userId)
      if (crushInfo && crushInfo.providedName) {
        const matchedCrush = crushNames.find(
          name => name.toLowerCase() === crushInfo.providedName.toLowerCase()
        )

        if (matchedCrush) {
          const profile = crushProfiles[matchedCrush]
          const sweetResponse = profile.sweetDetails
          await bot.sendMessage(chatId, sweetResponse, {
            parse_mode: 'Markdown',
          })

          // Add more sweet details with humor
          setTimeout(async () => {
            const moreDetails = profile.moreDetails
            await bot.sendMessage(chatId, moreDetails, {
              parse_mode: 'Markdown',
            })

            // Add a funny ending
            setTimeout(async () => {
              const funnyEnding =
                "Honestly, I've never seen him this smitten before. It's actually kind of adorable! 😄💕"
              await bot.sendMessage(chatId, funnyEnding, {
                parse_mode: 'Markdown',
              })
            }, 2000)
          }, 3000)

          // Don't return here - let it continue to normal AI processing
        }
      }
    }

    // Special question handling for Owoyemi - but don't block normal AI
    const crushInfo = userNameTracking.get(userId)
    if (crushInfo && crushInfo.providedName) {
      const matchedCrush = crushNames.find(
        name => name.toLowerCase() === crushInfo.providedName.toLowerCase()
      )

      if (matchedCrush === 'Owoyemi') {
        const lowerText = text.toLowerCase()

        // Handle specific questions she might ask
        if (lowerText.includes('who is he') || lowerText.includes("who's he")) {
          const profile = crushProfiles[matchedCrush]
          await bot.sendMessage(chatId, profile.whoIsHe, {
            parse_mode: 'Markdown',
          })
          return // Return here since this is a specific crush question
        }

        if (
          lowerText.includes('what did he say') ||
          lowerText.includes('what did he tell you')
        ) {
          const profile = crushProfiles[matchedCrush]
          await bot.sendMessage(chatId, profile.whatDidHeSay, {
            parse_mode: 'Markdown',
          })
          return // Return here since this is a specific crush question
        }

        if (
          lowerText.includes('is he cute') ||
          lowerText.includes('is he handsome')
        ) {
          const profile = crushProfiles[matchedCrush]
          await bot.sendMessage(chatId, profile.isHeCute, {
            parse_mode: 'Markdown',
          })
          return // Return here since this is a specific crush question
        }

        if (
          lowerText.includes('does he like me') ||
          lowerText.includes('does he have feelings')
        ) {
          const profile = crushProfiles[matchedCrush]
          await bot.sendMessage(chatId, profile.doesHeLikeMe, {
            parse_mode: 'Markdown',
          })
          return // Return here since this is a specific crush question
        }
      }

      // Special question handling for Islamiyat
      if (matchedCrush === 'Islamiyat') {
        const lowerText = text.toLowerCase()

        // Handle specific questions she might ask
        if (lowerText.includes('who is he') || lowerText.includes("who's he")) {
          const profile = crushProfiles[matchedCrush]
          await bot.sendMessage(chatId, profile.whoIsHe, {
            parse_mode: 'Markdown',
          })
          return // Return here since this is a specific crush question
        }

        if (
          lowerText.includes('what did he say') ||
          lowerText.includes('what did he tell you')
        ) {
          const profile = crushProfiles[matchedCrush]
          await bot.sendMessage(chatId, profile.whatDidHeSay, {
            parse_mode: 'Markdown',
          })
          return // Return here since this is a specific crush question
        }

        if (
          lowerText.includes('is he cute') ||
          lowerText.includes('is he handsome')
        ) {
          const profile = crushProfiles[matchedCrush]
          await bot.sendMessage(chatId, profile.isHeCute, {
            parse_mode: 'Markdown',
          })
          return // Return here since this is a specific crush question
        }

        if (
          lowerText.includes('does he like me') ||
          lowerText.includes('does he have feelings')
        ) {
          const profile = crushProfiles[matchedCrush]
          await bot.sendMessage(chatId, profile.doesHeLikeMe, {
            parse_mode: 'Markdown',
          })
          return // Return here since this is a specific crush question
        }
      }

      // Special question handling for Islamiya
      if (matchedCrush === 'Islamiya') {
        const lowerText = text.toLowerCase()

        // Handle specific questions she might ask
        if (lowerText.includes('who is he') || lowerText.includes("who's he")) {
          const profile = crushProfiles[matchedCrush]
          await bot.sendMessage(chatId, profile.whoIsHe, {
            parse_mode: 'Markdown',
          })
          return // Return here since this is a specific crush question
        }

        if (
          lowerText.includes('what did he say') ||
          lowerText.includes('what did he tell you')
        ) {
          const profile = crushProfiles[matchedCrush]
          await bot.sendMessage(chatId, profile.whatDidHeSay, {
            parse_mode: 'Markdown',
          })
          return // Return here since this is a specific crush question
        }

        if (
          lowerText.includes('is he cute') ||
          lowerText.includes('is he handsome')
        ) {
          const profile = crushProfiles[matchedCrush]
          await bot.sendMessage(chatId, profile.isHeCute, {
            parse_mode: 'Markdown',
          })
          return // Return here since this is a specific crush question
        }

        if (
          lowerText.includes('does he like me') ||
          lowerText.includes('does he have feelings')
        ) {
          const profile = crushProfiles[matchedCrush]
          await bot.sendMessage(chatId, profile.doesHeLikeMe, {
            parse_mode: 'Markdown',
          })
          return // Return here since this is a specific crush question
        }
      }
    }

    // Send typing indicator
    await bot.sendChatAction(chatId, 'typing')

    // Get or create user session
    if (!userSessions.has(userId)) {
      userSessions.set(userId, new ResponseGenerator())
    }

    const userResponseGenerator = userSessions.get(userId)

    // Generate response using JARVIS (this will always run unless specifically blocked)
    const response = await userResponseGenerator.generateResponse(text, userId)

    // Send response
    await bot.sendMessage(chatId, response, {
      parse_mode: 'Markdown',
      reply_to_message_id: message.message_id,
    })

    console.log(`✅ Response sent to ${userName}`)
  } catch (error) {
    console.error('Message handling error:', error)

    // Send error message to user
    try {
      await bot.sendMessage(
        chatId,
        "I'm sorry, I encountered an error processing your message. Please try again.",
        { reply_to_message_id: message.message_id }
      )
    } catch (sendError) {
      console.error('Failed to send error message:', sendError)
    }
  }
}

// Handle bot commands
bot.onText(/\/start/, async msg => {
  const chatId = msg.chat.id
  const userName = msg.from.first_name || 'User'

  const welcomeMessage = `
🤖 *Welcome to JARVIS, ${userName}!*

I'm your intelligent AI assistant, ready to help with:

• ❓ *Questions & Conversations* - Ask me anything!
• 🧮 *Calculations* - Simple math operations
• 🕐 *Time & Date* - Current time and date
• 🌤️ *Weather* - Weather information (coming soon)
• 📰 *News* - Latest news updates (coming soon)

Just send me a message and I'll do my best to help!

*Examples:*
• "What is quantum computing?"
• "Calculate 15 + 27"
• "What time is it?"
• "Hi JARVIS!"
`

  try {
    await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' })
  } catch (error) {
    console.error('Start command error:', error)
  }
})

bot.onText(/\/help/, async msg => {
  const chatId = msg.chat.id

  const helpMessage = `
🆘 *JARVIS Help*

*Available Commands:*
• /start - Welcome message
• /help - This help message
• /status - Bot status

*How to use:*
Just send me any message and I'll respond! I can handle:
• Complex questions using AI
• Simple calculations
• Time and date queries
• General conversations

*Examples:*
• "Explain artificial intelligence"
• "What's 25 * 4?"
• "What time is it?"

Need more help? Just ask me anything!
`

  try {
    await bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' })
  } catch (error) {
    console.error('Help command error:', error)
  }
})

bot.onText(/\/status/, async msg => {
  const chatId = msg.chat.id

  const statusMessage = `
📊 *JARVIS Status*

🤖 Bot: Online ✅
🧠 AI: ${process.env.VITE_GEMINI_API_KEY ? 'Configured ✅' : 'Not configured ❌'}
👥 Active users: ${userSessions.size}
⏰ Uptime: ${Math.floor(process.uptime())} seconds

*Version:* 1.0.0
*Last updated:* ${new Date().toLocaleString()}
`

  try {
    await bot.sendMessage(chatId, statusMessage, { parse_mode: 'Markdown' })
  } catch (error) {
    console.error('Status command error:', error)
  }
})

// Error handling
bot.on('error', error => {
  console.error('Bot error:', error)
})

bot.on('polling_error', error => {
  console.error('Polling error:', error)
})

// Set webhook endpoint
app.get('/api/set-webhook', async (req, res) => {
  try {
    const webhookUrl = `https://${req.headers.host}/webhook`
    await bot.setWebHook(webhookUrl)
    res.json({ success: true, webhookUrl })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// Check if running on Vercel or other serverless platform
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  console.log('🌐 Running in serverless mode (Vercel)...')
} else {
  // For development, use polling mode
  console.log('✅ JARVIS Bot is running in polling mode')
  console.log('🤖 Bot available at: t.me/BadmusQudusbot')
  console.log('📱 Test the bot now - it should respond to messages!')

  // Start polling for local development
  bot.startPolling()

  app.listen(port, () => {
    console.log(`🌐 Server running on port ${port}`)
  })
}

// Handle all text messages (not just commands)
bot.on('message', async msg => {
  // Skip if it's a command (already handled by onText handlers)
  if (msg.text && msg.text.startsWith('/')) {
    return
  }

  // Handle regular text messages
  if (msg.text) {
    await handleMessage(msg)
  }
})

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down JARVIS Bot...')
  try {
    await bot.stopPolling()
    process.exit(0)
  } catch (error) {
    console.error('Shutdown error:', error)
    process.exit(1)
  }
})

// Export for Vercel
export default app