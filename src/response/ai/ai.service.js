import { deepseekChat } from './providers/deepseek.js';
import { geminiChat } from './providers/gemini.js';
import log from '../../utils/log.js';
import ConversationContext from './conversationContext.js';

/**
 * AI Service Module
 *
 * Orchestrates intelligent response generation with:
 * - Multi-provider failover (Gemini → Deepseek)
 * - In-memory conversation context management
 * - Automatic retry logic via httpClient
 * - Input validation and response normalization
 * - User-friendly error handling
 */

// Configuration constants
const PROVIDERS = [
  { name: 'Gemini', fn: geminiChat },
  { name: 'Deepseek', fn: deepseekChat },
];

// Conversation context and configuration
const MAX_CONTEXT_MESSAGES = 3;
const DEFAULT_TIMEOUT_MS = 10000; // Increased from 6s for complex queries
const MIN_MESSAGE_LENGTH = 1;
const MAX_MESSAGE_LENGTH = 5000;

// Global in-memory conversation context
// Stores last N messages per conversation for coherent dialogue
const conversationContext = new ConversationContext(MAX_CONTEXT_MESSAGES);

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
 * Generates an AI reply using multi-provider failover strategy
 * Uses in-memory conversation context for coherent dialogue
 *
 * Flow:
 * 1. Validate user input
 * 2. Add message to conversation history
 * 3. Try providers in order (Gemini first, Deepseek as fallback)
 * 4. Normalize response format
 * 5. Add response to context for future coherence
 * 6. Return response or throw with all error details
 *
 * @param {Object} options - Configuration object
 * @param {string} options.userMessage - The user's input message
 * @returns {Promise<string>} - AI-generated response
 * @throws {Error} - When all providers fail or input is invalid
 *
 * @example\n * const response = await generateAIReply({ userMessage: 'Hello!' });
 */
export async function generateAIReply({ userMessage }) {
  // Step 1: Validate and sanitize input
  const cleanMessage = validateInput(userMessage);
  if (!cleanMessage) {
    throw new Error('Invalid message: must be between 1 and 5000 characters');
  }

  // Step 2: Add user message to conversation context for history
  conversationContext.addMessage('user', cleanMessage);

  // Step 3: Build conversation history for LLM context
  // Excludes current message (already added) to avoid duplication
  const previousMessages = conversationContext.getContext().slice(0, -1);

  // Step 4: Build message array for provider APIs
  // Includes system instructions, conversation history, and current query
  const messages = [
    {
      role: 'system',
      content: 'You are Verse AI, a helpful assistant for students and general users. Provide clear, accurate, and helpful responses.',
    },
    // Add previous conversation messages for context awareness
    ...previousMessages.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.text,
    })),
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

      // Step 7: Add assistant response to context for future coherence
      conversationContext.addMessage('assistant', normalizedResponse);

      return normalizedResponse;
    } catch (error) {
      log.warn('AI Service', `Provider ${provider.name} failed: ${error.message}`);
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