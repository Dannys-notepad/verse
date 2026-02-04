/**
 * Conversation Context Module
 *
 * Manages in-memory conversation history for context-aware responses
 * Implements sliding window pattern - keeps only recent messages
 *
 * Features:
 * - Fast: Pure in-memory, no database overhead
 * - Simple: Straightforward API
 * - Memory-efficient: Automatic old message removal
 *
 * Limitations:
 * - Resets on server restart (use database for persistence)
 * - Single instance (not distributed across servers)
 * - Per-session (not ideal for multi-user systems)
 *
 * Use Case:
 * Ideal for single-bot conversations or testing.
 * For production multi-user systems, consider database storage.
 */
class ConversationContext {
  /**
   * Initialize conversation context manager
   * @param {number} maxMessages - Maximum messages to retain (default: 3)
   */
  constructor(maxMessages = 3) {
    this.messages = [];
    this.maxMessages = maxMessages;
  }

  /**
   * Add a message to conversation history
   * Automatically removes oldest message when capacity exceeded
   * Implements FIFO (First-In-First-Out) sliding window
   *
   * @param {string} role - Message role: 'user' or 'assistant'
   * @param {string} text - Message content text
   */
  addMessage(role, text) {
    // Validate role
    if (role !== 'user' && role !== 'assistant') {
      throw new Error('Role must be "user" or "assistant"');
    }

    this.messages.push({ role, text });

    // Enforce capacity limit - remove oldest message if exceeded
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }
  }

  /**
   * Get copy of current conversation context
   * Returns shallow copy to prevent external state mutation
   *
   * @returns {Array<Object>} Array of message objects {role, text}
   */
  getContext() {
    return [...this.messages];
  }

  /**
   * Clear all conversation history
   * Useful for starting fresh conversation or cleanup
   * Use before switching users in multi-user systems
   */
  clear() {
    this.messages = [];
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
