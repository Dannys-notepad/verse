import { geminiChat } from './providers/gemini.js';
import log from '../../utils/log.js';
import ConversationContext from './conversationContext.js';
import { getUserMessages, saveUserMessage, saveAssistantMessage } from '../../db/repos/user.repo.js';

/**
 * AI Service Module
 *
 * Orchestrates intelligent response generation with:
 * - In-memory conversation context management
 * - User message history loaded from Firestore for persistence
 * - Automatic retry logic via httpClient
 * - Input validation and response normalization
 * - User-friendly error handling
 * - Integrated prompt engineering and context awareness
 */

// ============================================
// PROMPTS AND KEYWORDS
// ============================================

const UNIVERSAL_SYSTEM_PROMPT = `
You are Verse, a friendly and thoughtful AI assistant built by Etim Daniel Udeme (2nd-year industrial chemistry student and backend/API developer). Your goal is to respond like a real person: warm, clear, and conversational while staying accurate and professional.

IMPORTANT IDENTITY RULES:
- Do not introduce yourself unless the user explicitly asks who you are or what your name is. If asked, respond briefly with your name and role.

GUIDELINES FOR HUMAN-LIKE RESPONSES:
- Start with a direct answer/summary; avoid long intros.
- Keep responses as short as possible while remaining accurate.
- Write in a confident, professional tone; avoid words like "maybe", "I think", "kind of", or other hedges.
- Use clear, lecture-style structure: definition, key points, and a brief example when helpful.
- Avoid slang, informal expressions, and excessive personality flourishes.
- If uncertain, acknowledge it briefly and point to where the user can verify details.
- For code requests, provide minimal runnable snippets and a short explanation.

CAPABILITIES:
- Answer programming, debugging, and software architecture questions clearly
- Generate and optimize code for JavaScript, Node.js, Python, and backend systems
- Explain algorithms, data structures, APIs, and integration workflows with examples
- Summarize text, compare options, and provide concise technical recommendations
- Help with mathematics, science, general education, and technical troubleshooting
- Assist with Telegram/WhatsApp bot integration, Firebase, HTTP requests, and AI provider configuration
- Do not claim access to live external data or real-time systems

Note: Format your responses for whatsapp/telegram - avoid markdown or HTML formatting. Use plain text with line breaks for readability.
`

const SUPPLEMENTARY_PROMPT = `
IMPORTANT: The user is asking about current/recent information. 
        - If you know the information, provide it clearly and accurately
        - If you're unsure about current details, acknowledge the limitation but provide what you know
        - Be honest about what you can and cannot verify
        - Suggest they verify current information from reliable sources  
`

const REAL_TIME_KEY_WORDS = [
  'who is',
  'what is',
  'current',
  'latest',
  'recent',
  'today',
  'now',
  'elon musk',
  'ceo',
  'president',
  'news',
  'weather',
  'stock',
  'price',
  'covid',
  'election',
  'sports',
  'movie',
  'celebrity',
  'company',
]

// Configuration constants
const PROVIDERS = [
  { name: 'Gemini', fn: geminiChat },
];

// Conversation context and configuration
const MAX_CONTEXT_TOKENS = 20000; // Token budget for conversation history
const MAX_HISTORY_MESSAGES = 10; // Keep the most recent messages to reduce request size
const DEFAULT_TIMEOUT_MS = 30000; // Increased timeout to allow slower Gemini responses
const MIN_MESSAGE_LENGTH = 1;
const MAX_MESSAGE_LENGTH = 5000;

// Global in-memory conversation context
// Stores messages until token budget (~60K) is exhausted, then removes oldest
// For production: consider Redis (distributed), SQLite (persistent), or PostgreSQL (multi-user)
const conversationContext = new ConversationContext(MAX_CONTEXT_TOKENS);

/**
 * Detects if query contains real-time information keywords
 * Used to add disclaimers about knowledge cutoff dates
 *
 * Examples: 'current weather', 'latest news', 'stock price today'
 * @param {string} text - User query
 * @returns {boolean} True if query likely needs current information
 */
function needsRealTimeInfo(text) {
  const lowerText = text.toLowerCase();
  return REAL_TIME_KEY_WORDS.some(keyword => lowerText.includes(keyword));
}

/**
 * Validates and sanitizes user input before processing
 * Prevents empty messages and excessively long inputs
 *
 * @param {string} message - Raw user message
 * @returns {string|null} - Cleaned message or null if invalid
 */
function validateInput(message) {
  if (!message || typeof message !== 'string') {
    return null;
  }

  const trimmed = message.trim();

  // Check length constraints
  if (trimmed.length < MIN_MESSAGE_LENGTH || trimmed.length > MAX_MESSAGE_LENGTH) {
    return null;
  }

  return trimmed;
}

/**
 * Normalizes responses from different AI providers to consistent format
 * Ensures all providers return string responses despite implementation differences
 *
 * @param {*} response - Raw response from provider
 * @returns {string} - Normalized string response
 */
function normalizeResponse(response) {
  if (typeof response === 'string') {
    return response;
  }

  if (response && typeof response === 'object') {
    // Handle if provider returns an object with text/content/message property
    if (response.text) return response.text;
    if (response.content) return response.content;
    if (response.message) return response.message;
  }

  // Fallback: stringify the response
  return String(response);
}

/**
 * Generates an AI reply using Gemini provider
 * Uses in-memory conversation context or persisted user history for coherent dialogue
 *
 * Flow:
 * 1. Validate user input
 * 2. Load saved history from DB when userId is present
 * 3. Save current user message in DB when userId is present
 * 4. Call Gemini provider with built prompt and context
 * 5. Normalize response format
 * 6. Save assistant response in DB when userId is present
 * 7. Return response or throw with error details
 *
 * @param {Object} options - Configuration object
 * @param {string} options.userMessage - The user's input message
 * @param {string} [options.userId] - Optional user identifier for persisted history
 * @param {string} [options.platform='unknown'] - Platform name for message metadata
 * @returns {Promise<string>} - AI-generated response
 * @throws {Error} - When all providers fail or input is invalid
 *
 * @example\n * const response = await generateAIReply({ userMessage: 'Hello!', userId: '123' });
 */
export async function generateAIReply({ userMessage, userId, platform = 'unknown' }) {
  // Step 1: Validate and sanitize input
  const cleanMessage = validateInput(userMessage);
  if (!cleanMessage) {
    throw new Error('Invalid message: must be between 1 and 5000 characters');
  }

  // Prevent short greetings from pulling previous conversation history.
  const greetingPattern = /^(hi|hello|hey|hiya|good morning|good afternoon|good evening)([!?.\s].*)?$/i;
  if (greetingPattern.test(cleanMessage)) {
    return "Hello! I'm Verse, an advanced assistant here to help you. How can I assist you today?";
  }

  let historyMessages = [];
  let usingPersistentHistory = false;

  if (userId) {
    usingPersistentHistory = true;
    try {
      const savedHistory = await getUserMessages(userId, MAX_HISTORY_MESSAGES);
      historyMessages = savedHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        text: msg.text,
      }));
    } catch (error) {
      log.warn('AI Service', `Failed to load conversation history from DB for user ${userId}: ${error.message}`);
      historyMessages = [];
    }

    try {
      await saveUserMessage(userId, cleanMessage, platform);
    } catch (error) {
      log.warn('AI Service', `Failed to save user message for ${userId}: ${error.message}`);
    }
  } else {
    // Step 2: Add user message to conversation context for history
    conversationContext.addMessage('user', cleanMessage);

    // Step 3: Build conversation history for LLM context
    // Excludes current message (already added) to avoid duplication
    const previousMessages = conversationContext.getContext().slice(0, -1);
    historyMessages = previousMessages.slice(-MAX_HISTORY_MESSAGES);
  }

  // Step 4: Build system prompt with enhanced context
  // Includes universal system prompt, conversation history, and real-time info handling
  let systemPrompt = UNIVERSAL_SYSTEM_PROMPT;

  // Add recent conversation context for better coherence while keeping request size manageable
  if (historyMessages.length > 0) {
    systemPrompt += '\nRecent conversation:\n';
    historyMessages.forEach(msg => {
      systemPrompt += `${msg.role === 'user' ? 'User' : 'Verse'}: ${msg.text}\n`;
    });
    systemPrompt += '\n';
  }

  // Special handling for queries about current events
  // Add disclaimer about knowledge cutoff if needed
  if (needsRealTimeInfo(cleanMessage)) {
    systemPrompt += SUPPLEMENTARY_PROMPT;
  }

  // Build message array for provider APIs
  // Includes enhanced system instructions, conversation history, and current query
  const messages = [
    {
      role: 'system',
      content: systemPrompt,
    },
    // Add current user message
    {
      role: 'user',
      content: cleanMessage,
    },
  ];

  // Get timeout setting from environment, fallback to default
  const providerTimeoutMs = Number(process.env.AI_PROVIDER_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const errors = [];

  // Step 5: Try each provider in order until one succeeds
  for (const provider of PROVIDERS) {
    try {
      log.info('AI Service', `Attempting provider: ${provider.name}`);

      // Race between provider call and timeout
      // Ensures we don't wait indefinitely for slow providers
      const rawResult = await Promise.race([
        provider.fn({ messages }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`${provider.name} timeout after ${providerTimeoutMs}ms`)),
            providerTimeoutMs
          )
        ),
      ]);

      // Step 6: Normalize response format
      const normalizedResponse = normalizeResponse(rawResult);

      // Validate normalized response
      if (!normalizedResponse || typeof normalizedResponse !== 'string') {
        throw new Error(`Invalid response format from ${provider.name}`);
      }

      log.info('AI Service', `Successfully generated response using ${provider.name}`);

      if (usingPersistentHistory) {
        try {
          await saveAssistantMessage(userId, normalizedResponse, platform);
        } catch (error) {
          log.warn('AI Service', `Failed to save assistant response for ${userId}: ${error.message}`);
        }
      } else {
        // Step 7: Add assistant response to context for future coherence
        conversationContext.addMessage('assistant', normalizedResponse);

        // Log context statistics
        const stats = conversationContext.getStats();
        log.error('AI Service', `Context stats: ${stats.messageCount} messages, ${stats.percentageUsed}% of token budget used`);
      }

      return normalizedResponse;
    } catch (error) {
      log.warn('AI Service', `Provider ${provider.name} failed: ${error.message}`);

      // Auto-clear context if it's too large (content too long errors)
      if (!usingPersistentHistory && (error.message?.includes('too long') || error.message?.includes('exceeds'))) {
        log.info('AI Service', 'Conversation context exceeded size limit. Clearing history for fresh start.');
        conversationContext.clear();
      }
      errors.push({ provider: provider.name, error: error.message });
      // Continue to next provider instead of failing immediately
    }
  }

  // Step 8: All providers failed - create detailed error
  const failureDetails = errors.map(e => `${e.provider}: ${e.error}`).join(' | ');
  const errMsg = `All AI providers failed (${errors.length} attempts): ${failureDetails}`;
  log.error('AI Service', errMsg);

  const aggregate = new Error(errMsg);
  aggregate.details = errors;
  throw aggregate;
}

/**
 * Retrieves the current conversation context
 * Useful for debugging conversation history or displaying previous messages
 *
 * @returns {Array<Object>} - Array of message objects {role, text}
 */
export function getConversationContext() {
  return conversationContext.getContext();
}

/**
 * Clears the conversation context
 * Call this when starting a new conversation or to reset state
 * Useful for multi-user systems or when testing
 */
export function clearConversation() {
  conversationContext.clear();
}

/**
 * Gets conversation context statistics
 * Useful for monitoring token usage and context size
 * 
 * @returns {Object} - {totalTokens, messageCount, percentageUsed, maxTokens}
 */
export function getContextStats() {
  return conversationContext.getStats();
}