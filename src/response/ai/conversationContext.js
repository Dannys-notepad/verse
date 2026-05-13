/**
 * Conversation Context Module
 *
 * Manages in-memory conversation history with token-aware windowing
 * Prevents Gemini API errors from oversized context
 *
 * Features:
 * - Fast: Pure in-memory, no database overhead
 * - Smart: Token-aware (approximate), not just message count
 * - Adaptive: Automatically removes old messages when token limit approached
 * - Safe: Prevents "content too long" errors from Gemini
 *
 * Limitations:
 * - Resets on server restart (use database for persistence)
 * - Single instance (not distributed across servers)
 * - Per-session (not ideal for multi-user systems)
 *
 * Token Budget:
 * - System prompts: ~1500 tokens (handled separately)
 * - Context window: ~60K tokens max (safe for Gemini free tier)
 * - Query + response: ~4K tokens
 *
 * Better Alternatives for Production:
 * - Redis with TTL: Distributed cache with automatic cleanup (24h sessions)
 * - SQLite: Persistent per-user storage, survives restarts
 * - PostgreSQL: Multi-user system with query history
 */
class ConversationContext {
  /**
   * Initialize conversation context manager with token limits
   * @param {number} maxTokens - Maximum tokens to retain (default: 60000)
   */
  constructor(maxTokens = 60000) {
    this.messages = [];
    this.maxTokens = maxTokens;
    this.totalTokens = 0;
    this.clearThreshold = Math.ceil(maxTokens * 0.85); // Auto-clear when context is too large
  }

  /**
   * Estimate tokens for text (rough approximation)
   * Gemini tokenizes ~4 chars per token on average
   * @param {string} text - Text to estimate tokens for
   * @returns {number} Estimated token count
   */
  estimateTokens(text) {
    return Math.ceil((text?.length || 0) / 4);
  }

  /**
   * Add a message to conversation history
   * Automatically removes oldest messages when token budget exceeded
   * Implements token-aware FIFO sliding window
   *
   * @param {string} role - Message role: 'user' or 'assistant'
   * @param {string} text - Message content text
   */
  addMessage(role, text) {
    // Validate role
    if (role !== 'user' && role !== 'assistant') {
      throw new Error('Role must be "user" or "assistant"');
    }

    const messageTokens = this.estimateTokens(text);

    // Auto-clear the entire history if the context is approaching the configured threshold
    if (this.totalTokens + messageTokens > this.clearThreshold) {
      this.clear();
    }

    const message = { role, text, tokens: messageTokens };
    this.messages.push(message);
    this.totalTokens += messageTokens;

    // Enforce token budget - remove oldest messages if exceeded
    while (this.totalTokens > this.maxTokens && this.messages.length > 1) {
      const removed = this.messages.shift();
      this.totalTokens -= removed.tokens;
    }
  }

  /**
   * Get copy of current conversation context
   * Returns shallow copy to prevent external state mutation
   * Strips token metadata for API calls
   *
   * @returns {Array<Object>} Array of message objects {role, text}
   */
  getContext() {
    return this.messages.map(msg => ({
      role: msg.role,
      text: msg.text
    }));
  }

  /**
   * Get token usage statistics
   * @returns {Object} {totalTokens, messageCount, percentageUsed}
   */
  getStats() {
    return {
      totalTokens: this.totalTokens,
      messageCount: this.messages.length,
      percentageUsed: ((this.totalTokens / this.maxTokens) * 100).toFixed(1),
      maxTokens: this.maxTokens,
    };
  }

  /**
   * Clear all conversation history
   * Useful for starting fresh conversation or cleanup
   * Use before switching users in multi-user systems
   */
  clear() {
    this.messages = [];
    this.totalTokens = 0;
  }

  /**
   * Get remaining token budget
   * @returns {number} Tokens still available
   */
  getRemainingTokens() {
    return Math.max(0, this.maxTokens - this.totalTokens);
  }

  /**
   * Get formatted conversation string for logging/display
   * Useful for debugging conversation state or showing history
   *
   * @returns {string} Formatted conversation text with line breaks
   * @example
   * // Returns:
   * // User: Hello
   * // Verse: Hi there!
   * // User: How are you?
   * // Verse: I'm doing great!
   */
  getFormattedContext() {
    return this.messages
      .map(msg => `${msg.role === 'user' ? 'User' : 'Verse'}: ${msg.text}`)
      .join('\n');
  }
}

export default ConversationContext;
