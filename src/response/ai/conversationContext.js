import log from '../../utils/log.js';

/**
 * Conversation Context Module
 *
 * Manages in-memory conversation history with token-aware windowing
 * Prevents Gemini API errors from oversized context
 * Summarizes older conversation turns when history grows beyond limits
 *
 * Features:
 * - Fast: Pure in-memory, no database overhead
 * - Smart: Token-aware and message-aware
 * - Compact: Combines old turns into a single summary message
 * - Safe: Prevents "content too long" errors from Gemini
 *
 * Limitations:
 * - Resets on server restart (use database for persistence)
 * - Single instance (not distributed across servers)
 * - Per-session (not ideal for multi-user systems)
 */
class ConversationContext {
  /**
   * Initialize conversation context manager with token limits
   * @param {number} maxTokens - Maximum tokens to retain (default: 60000)
   * @param {number} maxMessages - Maximum raw messages to keep before summarizing (default: 10)
   */
  constructor(maxTokens = 60000, maxMessages = 10) {
    this.messages = [];
    this.maxTokens = maxTokens;
    this.maxMessages = maxMessages;
    this.summaryTriggerCount = 20;
    this.totalTokens = 0;
    this.clearThreshold = Math.ceil(maxTokens * 0.85); // Trigger summarization/cleanup when near max capacity
    this.summaryTokenTrigger = Math.ceil(maxTokens * 0.8);
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
   * Automatically summarizes older messages when the message count grows too large
   * @param {string} role - Message role: 'user' or 'assistant'
   * @param {string} text - Message content text
   */
  addMessage(role, text) {
    if (role !== 'user' && role !== 'assistant') {
      throw new Error('Role must be "user" or "assistant"');
    }

    const messageTokens = this.estimateTokens(text);
    const message = { role, text, tokens: messageTokens };

    this.messages.push(message);
    this.totalTokens += messageTokens;

    if (this._shouldCompact()) {
      this._compactHistory();
    }

    this._enforceTokenBudget();
  }

  /**
   * Condense older conversation turns into a summary message when history gets long
   * Keeps the most recent turns and replaces older turns with one short summary
   */
  _compactHistory() {
    const hasExistingSummary = this.messages[0]?.summary === true;
    const actualMessages = hasExistingSummary ? this.messages.slice(1) : this.messages;
    const allowedActualMessages = this.maxMessages;

    if (actualMessages.length <= allowedActualMessages) {
      return;
    }

    const overflowCount = actualMessages.length - allowedActualMessages;
    const oldMessages = actualMessages.slice(0, overflowCount);
    const remainingMessages = actualMessages.slice(overflowCount);

    const summaryText = this._buildSummary(oldMessages, hasExistingSummary ? this.messages[0] : null);
    const summaryTokens = this.estimateTokens(summaryText);
    const summaryMessage = {
      role: 'assistant',
      text: summaryText,
      tokens: summaryTokens,
      summary: true,
    };

    this.messages = [summaryMessage, ...remainingMessages];
    this.totalTokens = this.messages.reduce((sum, msg) => sum + msg.tokens, 0);

    log.info('ConversationContext', `Summarized ${overflowCount} old messages into one summary message. Total messages now ${this.messages.length}.`);
  }

  /**
   * Build a simple text summary for older conversation turns
   * @param {Array<Object>} messages - Messages to summarize
   * @param {Object|null} previousSummary - Existing summary message to merge with
   * @returns {string}
   */
  _buildSummary(messages, previousSummary = null) {
    const lines = messages.map(msg => {
      const roleLabel = msg.role === 'user' ? 'User' : 'Verse';
      const text = msg.text.replace(/\s+/g, ' ').trim();
      const preview = text.length > 120 ? `${text.slice(0, 120)}...` : text;
      return `${roleLabel}: ${preview}`;
    });

    if (previousSummary && previousSummary.text) {
      lines.unshift(previousSummary.text.replace(/\s+/g, ' ').trim());
    }

    const summaryBody = lines.join(' | ');
    return `Earlier conversation summary: ${summaryBody}`;
  }

  _shouldCompact() {
    return (
      this.messages.length > this.summaryTriggerCount ||
      this.totalTokens > this.summaryTokenTrigger
    );
  }

  /**
   * Enforce the token budget by removing oldest messages until the history fits
   */
  _enforceTokenBudget() {
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
    return this.messages.map(msg => ({ role: msg.role, text: msg.text }));
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
