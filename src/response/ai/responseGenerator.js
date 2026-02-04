import log from '../../utils/log.js';
import { generateAIReply } from './ai.service.js';

/**
 * Response Generator Module
 *
 * Central entry point for response generation across all platforms (Telegram, WhatsApp, etc.)
 * Implements a three-tier strategy:
 * 1. Built-in handlers - Fast, no API calls
 * 2. AI providers - Intelligent responses
 * 3. Fallback - User-friendly error message
 */

/**
 * Handles built-in commands for instant responses
 * These bypass AI providers for faster responses and reduced API calls
 *
 * Supported patterns:
 * - Greetings: 'hi', 'hello', 'hey', 'good morning', etc.
 * - Identity: 'who are you', 'what are you', 'about', etc.
 * - Time: 'time', 'what time'
 * - Date: 'date', 'what date'
 * - Math: '5 + 3', '10 * 2', '100 / 5', etc.
 *
 * @param {string} text - Raw user input
 * @returns {string|null} - Built-in response or null if no pattern matches
 */
function handleBuiltIns(text) {
    // Input validation
    if (!text || typeof text !== 'string') return null;

    const lower = text.trim().toLowerCase();

    // Pattern 1: Greetings - instant friendly response
    if (/^(hi|hello|hey|good morning|good afternoon|good evening)$/i.test(lower)) {
        return "Hello! I'm Verse, an advanced assistant here to help you. How can I assist you today?";
    }

    // Pattern 2: Identity questions - explain who Verse is
    if (/^(who are you|what are you|about|info|who created you|who built you|who owns you)$/i.test(lower)) {
        return "I'm Verse, an intelligent assistant built to help you with questions, tasks and more.";
    }

    // Pattern 3: Time queries - return current time without API call
    if (/^(time|what time)/.test(lower)) {
        return `The current time is ${new Date().toLocaleTimeString()}`;
    }

    // Pattern 4: Date queries - return current date without API call
    if (/^(date|what date)/.test(lower)) {
        return `Today is ${new Date().toLocaleDateString()}`;
    }

    // Pattern 5: Simple arithmetic - parse and calculate instantly
    // Supports: +, -, *, / with optional decimal numbers
    const mathMatch = text.match(/^\s*(\d+(?:\.\d+)?)\s*([\+\-\*\/])\s*(\d+(?:\.\d+)?)\s*$/);
    if (mathMatch) {
        const [, a, op, b] = mathMatch;
        const n1 = parseFloat(a);
        const n2 = parseFloat(b);

        // Perform operation and return formatted result
        switch (op) {
            case '+': return `${n1} + ${n2} = ${n1 + n2}`;
            case '-': return `${n1} - ${n2} = ${n1 - n2}`;
            case '*': return `${n1} * ${n2} = ${n1 * n2}`;
            case '/': return n2 === 0 ? 'Cannot divide by zero' : `${n1} / ${n2} = ${n1 / n2}`;
            default: return null;
        }
    }

    // No built-in pattern matched - delegate to AI
    return null;
}

/**
 * Central response generation system
 * Main entry point for all platforms (Telegram, WhatsApp, etc.)
 *
 * Three-stage processing:
 * 1. Check for built-in patterns (fast, no API calls)
 * 2. Call AI providers for intelligent responses
 * 3. Return fallback message if all stages fail
 *
 * @param {Object} options - Configuration object
 * @param {string} options.userMessage - User's input text (required)
 * @param {string} [options.userId='user'] - User identifier for logging/analytics
 * @param {string} [options.platform='unknown'] - Platform name (telegram, whatsapp, etc.)
 * @returns {Promise<string>} - Response text ready to send back to user
 *
 * @example
 * const response = await generateResponse({
 *   userMessage: 'What is the capital of France?',
 *   userId: 'user_123',
 *   platform: 'telegram'
 * });
 */
export async function generateResponse({ userMessage, userId = 'user', platform = 'unknown' } = {}) {
    // Log incoming request for debugging and analytics
    log.info('ResponseGenerator', `Generating response for ${platform} | user=${userId}`);

    // TIER 1: Try built-in handlers first (instant, no API calls)
    const builtIn = handleBuiltIns(userMessage);
    if (builtIn) {
        log.info('ResponseGenerator', 'Built-in handler matched - skipping AI provider');
        return builtIn;
    }

    // TIER 2: Delegate to AI service for intelligent response generation
    try {
        const aiText = await generateAIReply({ userMessage });

        // Validate AI response is in correct format
        if (!aiText || typeof aiText !== 'string') {
            throw new Error('AI provider returned invalid response');
        }

        log.info('ResponseGenerator', 'AI provider generated response successfully');
        return aiText;
    } catch (error) {
        // TIER 3: Fallback response when AI fails
        log.error('ResponseGenerator', 'AI reply failed', error.message);

        // Return user-friendly error that doesn't expose internal implementation details
        return "Sorry, I couldn't process that. Please try again later.";
    }
}
