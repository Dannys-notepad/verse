import log from '../utils/log.js';
import { generateAIReply } from './ai.service.js';

/**
 * Simple built-in command handler for fast responses without calling LLMs
 */
function handleBuiltIns(text) {
    if (!text || typeof text !== 'string') return null;
    const lower = text.trim().toLowerCase();

    // Greetings
    if (/^(hi|hello|hey|good morning|good afternoon|good evening)$/i.test(lower)) {
        return "Hello! I'm Verse, an advanced assistant here to help you. How can I assist you today?";
    }

    // What are you / About
    if (/^(who are you|what are you|about|info|who created you|who built you|who owns you)$/i.test(lower)) {
        return "I'm Verse, an intelligent assistant built to help you with questions, tasks and more.";
    }

    // Time
    if (/^(time|what time)/.test(lower)) {
        return `The current time is ${new Date().toLocaleTimeString()}`;
    }

    // Date
    if (/^(date|what date)/.test(lower)) {
        return `Today is ${new Date().toLocaleDateString()}`;
    }

    // Simple math
    const mathMatch = text.match(/^\s*(\d+(?:\.\d+)?)\s*([\+\-\*\/])\s*(\d+(?:\.\d+)?)\s*$/);
    if (mathMatch) {
        const [, a, op, b] = mathMatch;
        const n1 = parseFloat(a);
        const n2 = parseFloat(b);
        switch (op) {
            case '+': return `${n1} + ${n2} = ${n1 + n2}`;
            case '-': return `${n1} - ${n2} = ${n1 - n2}`;
            case '*': return `${n1} * ${n2} = ${n1 * n2}`;
            case '/': return n2 === 0 ? 'Cannot divide by zero' : `${n1} / ${n2} = ${n1 / n2}`;
            default: return null;
        }
    }

    return null;
}

/**
 * Response outlet - central place to produce a reply for platforms
 */
export async function generateResponse({ userMessage, userId = 'user', platform = 'unknown' } = {}) {
    log.info('ResponseGenerator', `Generating response for ${platform} | user=${userId}`);

    // Built-in quick handlers
    const builtIn = handleBuiltIns(userMessage);
    if (builtIn) {
        log.info('ResponseGenerator', 'Responding with built-in handler');
        return builtIn;
    }

    // Otherwise, delegate to AI providers via shared AI service
    try {
        const aiText = await generateAIReply({ userMessage });
        if (!aiText || typeof aiText !== 'string') {
            throw new Error('AI provider returned invalid response');
        }

        return aiText;
    } catch (error) {
        log.error('ResponseGenerator', 'AI reply failed', error.message);
        // Friendly fallback
        return "Sorry, I couldn't process that. Please try again later.";
    }
}
