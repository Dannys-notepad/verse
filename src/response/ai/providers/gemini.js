/**
 * Google Gemini AI Provider Module
 *
 * Handles direct communication with Google's Gemini API
 * Receives pre-formatted messages from ai.service.js and returns responses
 *
 * Features:
 * - Advanced reasoning capabilities
 * - Strong multi-turn conversation support
 * - Safety filters against harmful content
 */
import dotenv from 'dotenv/config';
import httpClient from '../../../utils/http.js';

/**
 * Google Gemini API Configuration
 * Controls model behavior and API endpoints
 */
const GEMINI_CONFIG = {
    model: 'gemini-2.5-flash-lite',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    temperature: 0.7,
    topK: 40,
    topP: 0.95,
    maxOutputTokens: Number(process.env.GEMINI_MAX_OUTPUT_TOKENS ?? 1024),
};

/**
 * API Key Rotating Mechanism
 * Maintains a pool of API keys and rotates between them
 */

// Key state management
const keyState = {
    keys: [
        { name: 'etimdn41', value: process.env.GEMINI_API_KEY_1 || '' },
        { name: 'verse_avx', value: process.env.GEMINI_API_KEY_2 || '' },
        { name: 'isereke_tim', value: process.env.GEMINI_API_KEY_3 || '' },
        { name: 'drioddraft', value: process.env.GEMINI_API_KEY_4 || '' },
        { name: 'whoami.doodle', value: process.env.GEMINI_API_KEY_5 || '' },
    ],
    currentIndex: 0,
    failedAttempts: {} // Track failed keys
};

/**
 * Get current API key from the rotation pool
 * @returns {string} Current API key
 */
export function getCurrentKey() {
    const currentKey = keyState.keys[keyState.currentIndex];
    if (!currentKey.value) {
        throw new Error('No valid API keys configured');
    }
    return currentKey.value;
}

/**
 * Rotate to the next API key in the pool
 * @returns {string} New API key name
 */
export function rotateKey() {
    const currentKey = keyState.keys[keyState.currentIndex];

    // Move to next key
    keyState.currentIndex = (keyState.currentIndex + 1) % keyState.keys.length;

    const newKey = keyState.keys[keyState.currentIndex];
    console.info(`[API Rotation] Switched from '${currentKey.name}' to '${newKey.name}'`);

    return newKey.name;
}

/**
 * Mark a key as failed and rotate to next
 * @param {string} keyName - Name of the failed key
 */
export function markKeyFailed(keyName) {
    keyState.failedAttempts[keyName] = (keyState.failedAttempts[keyName] || 0) + 1;
    console.warn(`[API Rotation] Key '${keyName}' failed. Attempt #${keyState.failedAttempts[keyName]}`);
    rotateKey();
}

/**
 * Get key rotation status for debugging
 */
export function getKeyStatus() {
    return {
        current: keyState.keys[keyState.currentIndex].name,
        currentIndex: keyState.currentIndex,
        totalKeys: keyState.keys.length,
        failedAttempts: keyState.failedAttempts
    };
}

/**
 * Sanitize response text for Telegram compatibility
 * Fixes broken markdown entities that cause "can't parse entities" errors
 * @param {string} text - Raw response text from Gemini
 * @returns {string} - Sanitized text safe for Telegram
 */
function sanitizeTelegramResponse(text) {
    if (!text || typeof text !== 'string') return text;

    // Remove unmatched asterisks and underscores
    let sanitized = text;

    // Fix unmatched * (bold markers)
    const asteriskCount = (sanitized.match(/\*/g) || []).length;
    if (asteriskCount % 2 !== 0) {
        // Remove all * to avoid formatting errors
        sanitized = sanitized.replace(/\*/g, '');
    }

    // Fix unmatched _ (italic markers)
    const underscoreCount = (sanitized.match(/_/g) || []).length;
    if (underscoreCount % 2 !== 0) {
        // Remove all _ to avoid formatting errors
        sanitized = sanitized.replace(/_/g, '');
    }

    // Remove problematic HTML tags that Gemini might generate
    sanitized = sanitized.replace(/<\/?[^>]+(>|$)/g, '');

    // Remove backticks if unmatched (code blocks)
    const backtickCount = (sanitized.match(/`/g) || []).length;
    if (backtickCount % 2 !== 0) {
        sanitized = sanitized.replace(/`/g, '');
    }

    // Normalize whitespace to avoid parsing issues
    sanitized = sanitized
        .replace(/\n{3,}/g, '\n\n')  // Replace 3+ newlines with 2
        .replace(/\r\n/g, '\n')       // Normalize line endings
        .trim();

    return sanitized;
}

/**
 * Calls Gemini API with pre-formatted messages
 * Prompt engineering is handled by ai.service.js
 *
 * @param {Object} options - Request configuration
 * @param {Array<Object>} options.messages - Messages in OpenAI format
 *   Each message has {role: 'system'|'user'|'assistant', content: string}
 * @returns {Promise<string>} - Generated response text
 * @throws {Error} - On API errors
 *
 * @example
 * const response = await geminiChat({
 *   messages: [
 *     { role: 'system', content: 'You are helpful...' },
 *     { role: 'user', content: 'Hello!' }
 *   ]
 * });
 */
export async function geminiChat({ messages }) {
    const maxRetries = keyState.keys.length;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let currentKeyName = 'unknown';
        try {
            const apiKey = getCurrentKey();
            currentKeyName = keyState.keys[keyState.currentIndex].name;

            // Build request URL
            const requestUrl = `${GEMINI_CONFIG.baseUrl}/models/${GEMINI_CONFIG.model}:generateContent?key=${apiKey}`;

            // Helpful debug logging
            console.info(`[Attempt ${attempt}/${maxRetries}] Using key: ${currentKeyName}`);
            console.info('Gemini Request URL:', requestUrl);
            console.info('Gemini Generation Config:', {
                model: GEMINI_CONFIG.model,
                temperature: GEMINI_CONFIG.temperature,
                topK: GEMINI_CONFIG.topK,
                topP: GEMINI_CONFIG.topP,
                maxOutputTokens: GEMINI_CONFIG.maxOutputTokens,
            });

            // Convert OpenAI-style messages to Gemini format
            // Gemini expects: contents: [{ parts: [{ text: '...' }] }]
            const contents = messages
                .filter(msg => msg.role === 'user' || msg.role === 'assistant')
                .map(msg => ({
                    role: msg.role === 'user' ? 'user' : 'model',
                    parts: [{ text: msg.content }],
                }));

            // Add system message as first user message if present
            const systemMsg = messages.find(msg => msg.role === 'system');
            if (systemMsg && contents.length === 0) {
                contents.push({
                    role: 'user',
                    parts: [{ text: systemMsg.content }],
                });
            } else if (systemMsg && contents[0]?.role === 'user') {
                // Prepend system prompt to first user message
                contents[0].parts[0].text = systemMsg.content + '\n\n' + contents[0].parts[0].text;
            }

            const response = await httpClient.post(requestUrl, {
                contents,
                generationConfig: {
                    temperature: GEMINI_CONFIG.temperature,
                    topK: GEMINI_CONFIG.topK,
                    topP: GEMINI_CONFIG.topP,
                    maxOutputTokens: GEMINI_CONFIG.maxOutputTokens,
                },
                safetySettings: [
                    {
                        category: 'HARM_CATEGORY_HARASSMENT',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
                    },
                    {
                        category: 'HARM_CATEGORY_HATE_SPEECH',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
                    },
                    {
                        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
                    },
                    {
                        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                        threshold: 'BLOCK_MEDIUM_AND_ABOVE',
                    },
                ],
            });

            const data = response.data;

            // Extract response text
            if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                console.info(`[API Rotation] Success with key: ${currentKeyName}`);
                const rawResponse = data.candidates[0].content.parts[0].text.trim();
                const sanitizedResponse = sanitizeTelegramResponse(rawResponse);
                return sanitizedResponse;
            } else {
                throw new Error('Invalid response format from Gemini API');
            }
        } catch (error) {
            lastError = error;

            console.error(`[Attempt ${attempt}/${maxRetries}] Gemini API Error with key '${currentKeyName}':`, {
                message: error?.message,
                status: error?.response?.status,
                responseData: error?.response?.data,
                requestUrl: error?.config?.url,
            });

            // Determine if we should retry with another key
            if (error.response) {
                const status = error.response.status;
                const errorData = error.response.data;
                const errorMessage = errorData?.error?.message?.toLowerCase() || '';

                // Only rotate for auth and rate limit errors
                if (status === 401 || status === 429) {
                    markKeyFailed(currentKeyName);
                    if (attempt < maxRetries) {
                        console.info(`[API Rotation] Retrying with next key...`);
                        continue; // Try next key
                    }
                }

                // For other 4xx/5xx errors, throw immediately
                if (status === 400) {
                    if (errorMessage.includes('request is too large') ||
                        errorMessage.includes('exceeds max') ||
                        errorMessage.includes('content_filter_result') ||
                        errorMessage.includes('too long')) {
                        throw new Error('Your message or conversation history is too long. Try a shorter message or start a new conversation. I\'m clearing the history now - your next message will start fresh.');
                    }
                    // Check for invalid API key errors - should rotate and retry
                    if (errorMessage.includes('api key not valid') ||
                        errorMessage.includes('invalid api key') ||
                        errorMessage.includes('unauthorized')) {
                        markKeyFailed(currentKeyName);
                        if (attempt < maxRetries) {
                            console.info(`[API Rotation] Invalid API key detected. Retrying with next key...`);
                            continue; // Try next key
                        }
                        throw new Error('AI service authentication failed. All keys invalid. Please check configuration.');
                    }
                    throw new Error('Invalid request to AI service. Please rephrase your question.');
                } else if (status >= 500) {
                    throw new Error('AI service is temporarily unavailable. Please try again later.');
                }
            } else if (error.message?.includes('timeout')) {
                // Don't rotate for timeout errors on first attempt
                if (attempt >= maxRetries) {
                    throw new Error('AI service request timed out. Please try again.');
                }
                continue;
            }

            // If no retry should happen, throw the last error
            if (attempt === maxRetries) {
                break;
            }
        }
    }

    // All retries exhausted
    if (lastError) {
        if (lastError.response) {
            const status = lastError.response.status;
            const errorData = lastError.response.data;
            const errorMessage = errorData?.error?.message?.toLowerCase() || '';

            if (status === 400) {
                if (errorMessage.includes('request is too large') ||
                    errorMessage.includes('exceeds max') ||
                    errorMessage.includes('content_filter_result') ||
                    errorMessage.includes('too long')) {
                    throw new Error('Your message or conversation history is too long. Try a shorter message or start a new conversation. I\'m clearing the history now - your next message will start fresh.');
                }
                throw new Error('Invalid request to AI service. Please rephrase your question.');
            } else if (status === 401) {
                throw new Error('AI service authentication failed. All keys invalid. Please check configuration.');
            } else if (status === 429) {
                throw new Error('Rate limit reached on all keys. Please try again later.');
            } else if (status >= 500) {
                throw new Error('AI service is temporarily unavailable. Please try again later.');
            } else {
                throw new Error(`AI service error: ${status}`);
            }
        } else if (lastError.message?.includes('timeout')) {
            throw new Error('AI service request timed out. Please try again.');
        }
    }
}