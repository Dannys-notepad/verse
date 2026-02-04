/**
 * Google Gemini AI Provider Module
 *
 * Provides text generation via Google's Gemini API
 * Used as secondary provider in multi-provider failover strategy
 *
 * Features:
 * - Advanced reasoning capabilities
 * - Strong multi-turn conversation support
 * - Safety filters against harmful content
 * - Token-based pricing (pay per character)
 */
import dotenv from 'dotenv/config';
import httpClient from '../../../utils/http.js';

/**
 * Google Gemini API Configuration
 * Controls model behavior and API endpoints
 *
 * Note: Pinned to stable version (gemini-1.5-flash) instead of 'latest'
 * to prevent breaking changes from API updates
 */
const GEMINI_CONFIG = {
    // Stable model version - avoids unexpected behavior changes
    model: 'gemini-2.5-flash-lite',
    // Google's generative API endpoint
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    // Temperature: 0.7 = balanced creativity vs consistency
    // Range: 0 (deterministic) to 1+ (very creative)
    temperature: 0.7,
    // topK: Consider only top K most likely tokens
    // Reduces nonsensical responses while maintaining diversity
    topK: 40,
    // topP: Nucleus sampling (cumulative probability)
    // Keeps tokens with cumulative prob ≤ P
    topP: 0.95,
    // Maximum tokens in response (roughly 1 token = 4 characters)
    // 2048 tokens ≈ 8000 characters
    maxOutputTokens: 2048,
};

/**
 * LLMService - Google Gemini Provider
 *
 * Handles communication with Google's Gemini API
 * Supports multi-turn conversations and custom prompting
 */
class GeminiChat {
    /**
     * Initialize Gemini service with API configuration
     * Loads API key from environment variables
     */
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY || ''
        this.baseUrl = GEMINI_CONFIG.baseUrl
        this.model = GEMINI_CONFIG.model

        console.log('LLM Service Constructor (Gemini):', {
            apiKeySet: !!this.apiKey,
            provider: 'Google Gemini',
        })
    }

    /**
     * Checks if service is properly configured
     * @returns {boolean} True if API key is set
     */
    isConfigured() {
        return !!this.apiKey
    }

    /**
     * Detects if query contains real-time information keywords
     * Used to add disclaimers about knowledge cutoff dates
     *
     * Examples: 'current weather', 'latest news', 'stock price today'
     * @param {string} text - User query
     * @returns {boolean} True if query likely needs current information
     */
    needsRealTimeInfo(text) {
        // Keywords indicating query needs current information
        const realTimeKeywords = [
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

        const lowerText = text.toLowerCase()
        return realTimeKeywords.some(keyword => lowerText.includes(keyword))
    }

    /**
     * Generates AI response using Gemini API
     * Includes conversation context for coherent multi-turn dialogue
     *
     * @param {string} text - User message
     * @param {Array<Object>} context - Previous messages [{role, text}, ...]
     * @returns {Promise<string>} - Generated response
     * @throws {Error} - If API key missing or API fails
     */
    async generateResponse(text, context = []) {
        if (!this.isConfigured()) {
            throw new Error('LLM not configured - missing API key')
        }

        try {
            /**
             * System prompt defines Verse's identity and behavior
             * Critical for brand consistency across conversations
             */
            let prompt = `You are Verse, an advanced AI assistant created by Etim Daniel Udeme, a 2nd year industrial chemistry student and talented backend/api developer. \nIMPORTANT IDENTITY RULES:
- You are Verse, built by Etim Daniel Udeme
- ALWAYS refer to yourself as Verse
- NEVER mention Google, Gemini, or any other company as your creator
- You are an independent AI assistant created by Etim Daniel Udeme
- Be helpful, intelligent, and professional
- When greeting users, introduce yourself properly
CAPABILITIES:
- You have access to a vast knowledge base
- You can provide detailed, accurate information
- You can explain complex topics in simple terms
- You can help with programming, math, science, history, and more
- You can engage in meaningful conversations
`

            // Add previous conversation context for better coherence
            // Helps model understand ongoing discussion
            if (context.length > 0) {
                prompt += 'Recent conversation:\n'
                context.forEach(msg => {
                    prompt += `${msg.role === 'user' ? 'User' : 'Verse'}: ${msg.text}\n`
                })
                prompt += '\n'
            }

            // Special handling for queries about current events
            // Add disclaimer about knowledge cutoff if needed
            if (this.needsRealTimeInfo(text)) {
                prompt += `IMPORTANT: The user is asking about current/recent information. 
        - If you know the information, provide it clearly and accurately
        - If you're unsure about current details, acknowledge the limitation but provide what you know
        - Be honest about what you can and cannot verify
        - Suggest they verify current information from reliable sources
        
        `
            }

            // Append user message to complete the prompt
            prompt += `User: ${text}\nVerse:`

            // Call Gemini API with constructed prompt
            const requestUrl = `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`;

            // Helpful debug logging for endpoint and generation settings
            console.info('Gemini Request URL:', requestUrl);
            console.info('Gemini Generation Config:', {
                model: this.model,
                temperature: GEMINI_CONFIG.temperature,
                topK: GEMINI_CONFIG.topK,
                topP: GEMINI_CONFIG.topP,
                maxOutputTokens: GEMINI_CONFIG.maxOutputTokens,
            });

            const response = await httpClient.post(requestUrl,
                {
                    // Gemini expects single content block with parts array
                    contents: [
                        {
                            parts: [
                                {
                                    text: prompt,
                                },
                            ],
                        },
                    ],
                    // Model behavior configuration
                    generationConfig: {
                        temperature: GEMINI_CONFIG.temperature,
                        topK: GEMINI_CONFIG.topK,
                        topP: GEMINI_CONFIG.topP,
                        maxOutputTokens: GEMINI_CONFIG.maxOutputTokens,
                    },
                    // Safety filters to prevent harmful content generation
                    // BLOCK_MEDIUM_AND_ABOVE blocks moderate to high probability harm
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
                }
            )

            // Extract response data from Gemini API response
            const data = response.data

            // Validate response structure and extract text
            if (data.candidates && data.candidates[0] && data.candidates[0].content) {
                let responseText = data.candidates[0].content.parts[0].text.trim()

                // Add disclaimer for real-time queries about current events
                if (this.needsRealTimeInfo(text)) {
                    responseText +=
                        '\n\n💡 Note: For the most current information, I recommend verifying details from reliable sources as my knowledge may not be completely up-to-date.'
                }

                return responseText
            } else {
                throw new Error('Invalid response format from AI service')
            }
        } catch (error) {
            // Detailed error logging to help debug 4xx/5xx responses and URL issues
            console.error('LLM Generation Error:', {
                message: error?.message,
                status: error?.response?.status,
                responseData: error?.response?.data,
                requestUrl: error?.config?.url,
                stack: error?.stack,
            });

            /**
             * Translate API errors to user-friendly messages
             * Hide technical implementation details while providing helpful context
             */
            if (error.response) {
                const status = error.response.status
                // HTTP status-specific error handling
                if (status === 400) {
                    // Bad request - usually malformed user input
                    throw new Error('Invalid request to AI service. Please rephrase your question.')
                } else if (status === 401) {
                    // Unauthorized - authentication/credentials issue
                    throw new Error('AI service authentication failed. Please check configuration.')
                } else if (status === 429) {
                    // Rate limit hit - too many requests
                    throw new Error('AI service is busy. Please try again in a moment.')
                } else if (status >= 500) {
                    // Server errors - temporary service issue
                    throw new Error('AI service is temporarily unavailable. Please try again later.')
                } else {
                    // Other HTTP errors
                    throw new Error(`AI service error: ${status}`)
                }
            } else if (error.message.includes('timeout')) {
                // Request took too long
                throw new Error('AI service request timed out. Please try again.')
            } else if (error.message.includes('AI service')) {
                // Already formatted error message
                throw error
            } else {
                // Catch-all for unexpected errors
                throw new Error('I encountered an error while processing your request. Please try again.')
            }
        }
    }
}

// Wrapper to match existing ai.service.js provider contract
// Accepts an object with `messages` (OpenAI-style) and returns a string
export async function geminiChat({ messages }) {
    // messages: [{ role: 'system'|'user'|'assistant', content: string }, ...]
    // Extract last user message as the main input text
    const userMessages = messages.filter(m => m.role === 'user');
    const lastUser = userMessages[userMessages.length - 1];
    const text = lastUser ? lastUser.content : '';

    // Build context from previous messages (exclude system and the current user message)
    const context = messages
        .filter((m, idx) => m.role !== 'system')
        .slice(0, -1)
        .map(m => ({ role: m.role, text: m.content }));

    const client = new GeminiChat();
    return client.generateResponse(text, context);
}