/**
 * Deepseek AI Provider Module
 *
 * Implements OpenAI-compatible chat completion API calls
 * Used as primary failover option in multi-provider strategy
 *
 * Benefits:
 * - Alternative provider for better uptime
 * - Cost-effective option
 * - Fast response times
 *
 * Note: httpClient automatically handles retries for 429/5xx errors
 */
import http from '../../../utils/http.js';
import dotenv from 'dotenv/config';

// API configuration loaded from environment variables
const BASE_URL = process.env.DEEPSEEK_BASE_URL;
const MODEL = process.env.AI_DEFAULT_MODEL;

/**
 * Calls Deepseek's chat completion API
 * Uses OpenAI-compatible message format for consistency
 *
 * @param {Object} options - Request configuration
 * @param {Array<Object>} options.messages - Conversation messages in OpenAI format
 *   Each message has {role: 'system'|'user'|'assistant', content: string}
 * @returns {Promise<string>} - Generated response text
 * @throws {Error} - On API errors (after automatic retries)
 *
 * Implementation Details:
 * - Uses httpClient which automatically retries on 429 (rate limit) and 5xx errors
 * - Exponential backoff: waits 1s, 2s, 3s between retries
 * - Max 3 retries before failing
 *
 * @example
 * const response = await deepseekChat({
 *   messages: [
 *     { role: 'system', content: 'You are helpful.' },
 *     { role: 'user', content: 'Hello!' }
 *   ]
 * });
 */
export async function deepseekChat({ messages }) {
  try {
    const requestUrl = `${BASE_URL}/chat/completions`;
    const maxTokens = Number(process.env.AI_MAX_TOKENS ?? 800);
    const temperature = Number(process.env.AI_TEMPERATURE ?? 0.7);

    // Helpful debug logging for endpoint and request config
    console.info('Deepseek Request URL:', requestUrl);
    console.info('Deepseek Request Config:', {
      model: MODEL,
      max_tokens: maxTokens,
      temperature,
      messageCount: messages.length,
      apiKeySet: !!process.env.DEEPSEEK_API_KEY,
    });

    // Call Deepseek API with automatic retry logic from httpClient
    const res = await http.post(
      requestUrl,
      {
        // Model identifier
        model: MODEL,
        // Conversation message history
        messages,
        // Limits response token count (controls length)
        // Default 800 tokens ≈ 600 words
        max_tokens: maxTokens,
        // Temperature controls randomness/creativity
        // 0.7 = balanced between creativity and consistency
        temperature,
      },
      {
        // Authentication headers for Deepseek API
        headers: {
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
      }
    );

    // Extract response text from OpenAI-compatible response format
    // Structure: { choices: [{ message: { content: string } }] }
    return res.data.choices[0].message.content;
  } catch (error) {
    // Detailed error logging to help debug 4xx/5xx responses and configuration issues
    console.error('Deepseek Generation Error:', {
      message: error?.message,
      status: error?.response?.status,
      responseData: error?.response?.data,
      requestUrl: error?.config?.url,
      stack: error?.stack,
    });
    throw error;
  }
}