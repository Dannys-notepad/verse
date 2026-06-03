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
    const AiBotVersion = process.env.AI_BOT_VERSION

    // Pattern 1: Greetings - instant friendly response
    if (/^(hi|hello|hey|watsup|what's up|good morning|good afternoon|good evening)([!?.\s].*)?$/i.test(lower)) {
        return "Hello! I'm Verse, an advanced assistant here to help you. How can I assist you today?";
    }

    // Pattern 2: Identity questions - explain who Verse is
    if (/^(who are you|what are you|about|info|who created you|who built you|who owns you)$/i.test(lower)) {
        return "I'm Verse, an intelligent multi-social-media AI/bot hybrid assitant built to help you with questions, tasks and more.";
    }

    // Pattern 3: about dev - telling who built Verse
    if (/^(who created you|who built you|who owns you)$/i.test(lower)) {
        return "I was built by Etim Daniel Udeme a 2nd year Industrial Chemistry Student, to help you with questions, tasks and more.";
    }


    // Pattern 4: Version queries - return the current bot version without API call
    if (/^(?:what(?:'s| is| are)?(?: the)? version|version|show me your version|current version)(?:[!?.\s].*)?$/i.test(lower)) {
        const versionText = AiBotVersion ? `v${AiBotVersion}` : 'unknown';
        return `Verse is currently running on version ${versionText}.`;
    }

    // Pattern 5: Time queries - return current time without API call
    if (/^(time|what time)/.test(lower)) {
        return `The current time is ${new Date().toLocaleTimeString()}`;
    }

    // Pattern 6: Date queries - return current date without API call
    if (/^(date|what date)/.test(lower)) {
        return `Today is ${new Date().toLocaleDateString()}`;
    }

    // Pattern 7: Simple arithmetic - parse and calculate instantly
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
export async function generateResponse({ userMessage, userId, platform = 'unknown' } = {}) {
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
        const aiText = await generateAIReply({ userMessage, userId, platform });

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