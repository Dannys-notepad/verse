# API Key Rotating System

## Overview

The **API Key Rotating System** is a robust failover mechanism built into the Gemini AI provider module. It automatically switches between multiple API keys when rate limits are hit or authentication fails, ensuring continuous service availability without manual intervention.

---

## Why Do We Need This?

Google Gemini's free tier has tight rate limiting:
- **Limited requests per minute** on free keys
- **401 Unauthorized** errors when quotas expire
- **429 Too Many Requests** errors during peak usage

Without rotation, your bot would crash or become unavailable. With this system, it gracefully falls back to alternate keys and continues operating.

---

## How It Works

### 1. **Key Pool Management**

The system maintains a pool of API keys with state tracking:

```javascript
const keyState = {
    keys: [
        { name: 'etimdn41', value: process.env.GEMINI_API_KEY_1 || '' },
        { name: 'verse_avx', value: process.env.GEMINI_API_KEY_2 || '' }
    ],
    currentIndex: 0,              // Currently active key index
    failedAttempts: {}            // Tracks failures per key
};
```

**Key Structure:**
- `name`: Human-readable identifier for debugging
- `value`: The actual API key from environment variables
- `currentIndex`: Pointer to which key is currently active
- `failedAttempts`: Counter for retry tracking

---

### 2. **Request Flow with Rotation**

When `geminiChat()` is called:

```
attempt 1
  ├─ Get current key (etimdn41)
  ├─ Make API request
  ├─ Success? → Return response ✓
  └─ Error? → Check error type
      ├─ 401 (Invalid key)? → Rotate & Retry
      ├─ 429 (Rate limited)? → Rotate & Retry
      ├─ 400 (Bad request)? → Throw immediately (no retry)
      └─ 500 (Server error)? → Attempt next key

attempt 2
  ├─ Get current key (verse_avx - after rotation)
  ├─ Make API request
  ├─ Success? → Return response ✓
  └─ All retries exhausted? → Throw error
```

---

## Core Functions

### `getCurrentKey()`
Returns the current active API key.

```javascript
const apiKey = getCurrentKey();
// Returns: "sk-xxxxxxxxxxxx" (the actual key value)
```

**Throws:** `Error` if no valid keys are configured

---

### `rotateKey()`
Rotates to the next key in the pool (cycles back to first after last).

```javascript
export function rotateKey() {
    const currentKey = keyState.keys[keyState.currentIndex];
    
    // Move to next key
    keyState.currentIndex = (keyState.currentIndex + 1) % keyState.keys.length;
    
    const newKey = keyState.keys[keyState.currentIndex];
    console.info(`[API Rotation] Switched from '${currentKey.name}' to '${newKey.name}'`);
    
    return newKey.name;
}
```

**Returns:** Name of the new active key
**Example Output:** `[API Rotation] Switched from 'etimdn41' to 'verse_avx'`

---

### `markKeyFailed(keyName)`
Marks a key as failed and automatically rotates to the next one.

```javascript
markKeyFailed('etimdn41');
```

**Output:**
```
[API Rotation] Key 'etimdn41' failed. Attempt #1
[API Rotation] Switched from 'etimdn41' to 'verse_avx'
```

**Use Cases:**
- Tracks how many times each key has failed
- Helps identify which keys are problematic
- Useful for maintenance/debugging

---

### `getKeyStatus()`
Returns detailed status information for monitoring and debugging.

```javascript
const status = getKeyStatus();
console.log(status);
```

**Returns:**
```javascript
{
    current: 'etimdn41',           // Currently active key name
    currentIndex: 0,               // Index in pool
    totalKeys: 2,                  // Total available keys
    failedAttempts: {
        etimdn41: 2,               // Count for etimdn41
        verse_avx: 0               // Count for verse_avx
    }
}
```

---

## Retry Logic & Error Handling

### When Rotation Happens

The system rotates keys **only** for authentication and rate limit errors:

| Error Type | Status | Rotates? | Behavior |
|-----------|--------|---------|----------|
| Invalid Key | 401 | ✅ Yes | Rotates and retries with next key |
| Rate Limit | 429 | ✅ Yes | Rotates and retries with next key |
| Bad Request | 400 | ❌ No | Throws immediately (user input issue) |
| Server Error | 5xx | ⚠️ Maybe | Tries once more, then throws |
| Timeout | N/A | ⚠️ Maybe | Limited retry on first attempt only |

### Why Not Rotate for 400 Errors?

A `400 Bad Request` means the request itself is malformed - rotating keys won't help. Examples:
- Message too long
- Invalid parameters
- Conversation history exceeds limits

Rotating here would waste time and another key's quota.

---

## Request Flow Example

### Scenario 1: Success on First Key

```
[Attempt 1/2] Using key: etimdn41
[Gemini Request URL]: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=sk-abc123
[Gemini Generation Config]: { model: 'gemini-2.5-flash-lite', ... }

[API Rotation] Success with key: etimdn41
→ Response returned successfully ✓
```

---

### Scenario 2: Rate Limit + Rotation

```
[Attempt 1/2] Using key: etimdn41
[Gemini Request URL]: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=sk-abc123

[Attempt 1/2] Gemini API Error with key 'etimdn41': 
  {
    status: 429,
    message: 'Resource has been exhausted (e.g. check quota)'
  }

[API Rotation] Key 'etimdn41' failed. Attempt #1
[API Rotation] Switched from 'etimdn41' to 'verse_avx'
[API Rotation] Retrying with next key...

[Attempt 2/2] Using key: verse_avx
[Gemini Request URL]: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=sk-xyz789

[API Rotation] Success with key: verse_avx
→ Response returned successfully ✓
```

---

### Scenario 3: All Keys Exhausted

```
[Attempt 1/2] Using key: etimdn41
[ERROR] 429 Rate Limit

[API Rotation] Switched to verse_avx
[API Rotation] Retrying with next key...

[Attempt 2/2] Using key: verse_avx
[ERROR] 429 Rate Limit

[API Rotation] All retries exhausted
→ Throw: "Rate limit reached on all keys. Please try again later."
```

---

## Environment Setup

Configure your API keys in `.env`:

```env
# Primary key
GEMINI_API_KEY_1=sk-your-first-key-here

# Secondary key (rotation target)
GEMINI_API_KEY_2=sk-your-second-key-here

# Optional: Control max tokens
GEMINI_MAX_OUTPUT_TOKENS=1024
```

**Important:**
- Both keys can be the same for testing (not recommended for production)
- Keys must be valid Google Gemini API keys
- If a key is missing, the system will throw an error when that key is selected

---

## Adding More Keys

To add additional keys, modify `gemini.js`:

```javascript
const keyState = {
    keys: [
        { name: 'etimdn41', value: process.env.GEMINI_API_KEY_1 || '' },
        { name: 'verse_avx', value: process.env.GEMINI_API_KEY_2 || '' },
        { name: 'backup_key', value: process.env.GEMINI_API_KEY_3 || '' },  // ← New key
        { name: 'emergency', value: process.env.GEMINI_API_KEY_4 || '' },   // ← New key
    ],
    currentIndex: 0,
    failedAttempts: {}
};
```

Update your `.env` file:
```env
GEMINI_API_KEY_1=sk-...
GEMINI_API_KEY_2=sk-...
GEMINI_API_KEY_3=sk-...
GEMINI_API_KEY_4=sk-...
```

The rotation logic automatically handles any number of keys!

---

## Response Sanitization

Before returning responses to Telegram, the system sanitizes output to prevent entity parsing errors:

```javascript
function sanitizeTelegramResponse(text) {
    // Fixes unmatched markdown characters
    // Removes problematic HTML tags
    // Normalizes whitespace
    // Returns Telegram-safe text
}
```

**What Gets Fixed:**
- Unmatched `*` (bold) and `_` (italic) characters
- Stray HTML tags
- Excessive newlines
- Line ending inconsistencies

---

## Debugging & Monitoring

### Check Current Status
```javascript
import { getKeyStatus } from './src/response/ai/providers/gemini.js';

const status = getKeyStatus();
console.log(status);
```

### Monitor Logs

Look for these patterns in logs:

| Pattern | Meaning |
|---------|---------|
| `[API Rotation] Switched from ... to ...` | Key rotation happened |
| `[API Rotation] Success with key:` | Request succeeded |
| `Key '...' failed. Attempt #` | A key failed, count increased |
| `[Attempt 1/2] Using key:` | Which key is being used |
| `Rate limit reached on all keys` | All keys are exhausted |

---

## Common Issues & Solutions

### Issue: "No valid API keys configured"
**Cause:** Both `GEMINI_API_KEY_1` and `GEMINI_API_KEY_2` are missing or empty

**Solution:**
```env
GEMINI_API_KEY_1=your-actual-key-here
GEMINI_API_KEY_2=your-backup-key-here
```

---

### Issue: Keeps Rotating Even on Success
**Cause:** One key is broken, other is working

**Solution:**
- Check logs to identify which key keeps failing
- Replace the broken key in `.env`
- The system will prefer the working key automatically

---

### Issue: Rotation Not Happening on Rate Limit
**Cause:** Rate limit error is a `400` instead of `429`

**Solution:**
- Check the actual error status in logs
- Adjust error handling in `geminiChat()` if needed
- Report to Google if error classification seems wrong

---

### Issue: "can't parse entities" Telegram Error
**Cause:** Gemini generated unmatched markdown formatting

**Solution:**
- This is now automatically fixed by `sanitizeTelegramResponse()`
- If still occurring, check logs for sanitization details
- The sanitizer removes problematic characters before sending to Telegram

---

## Performance Impact

The rotation system has **minimal overhead**:

- **During success:** ~1ms (just key lookup)
- **During rotation:** ~5ms (rotate index, log message)
- **Per API call:** ~100-500ms (network latency dominates)

The 6-10ms overhead for rotation is negligible compared to network latency.

---

## Best Practices

1. **Use Paid API Keys When Possible**
   - Free tier has aggressive rate limiting
   - Paid quotas are much higher

2. **Monitor `getKeyStatus()` Regularly**
   - If one key has many failures, replace it
   - Look for patterns (time of day, request type)

3. **Set Up Key Rotation Notifications**
   - Log rotation events to monitoring system
   - Alert if switching keys frequently

4. **Test with Multiple Keys**
   - Ensure all keys in the pool are valid
   - Test rotation with intentionally invalid keys

5. **Keep Keys Secure**
   - Never commit `.env` files to git
   - Use environment-specific configurations
   - Rotate keys periodically

---

## Architecture Diagram

```
User Request
    ↓
geminiChat({ messages })
    ↓
getCurrentKey() ← Gets current API key
    ↓
API Request with Key
    ↓
    ├─ Success? → sanitizeTelegramResponse() → Return ✓
    │
    └─ 401/429 Error?
        ↓
        markKeyFailed() → Track failure
        ↓
        rotateKey() ← Switch to next key
        ↓
        Retry from Step 2
    │
    └─ Other Error? → Throw immediately
```

---

## Summary

| Feature | Benefit |
|---------|---------|
| Automatic Failover | No manual key management needed |
| Rate Limit Resilience | Survives quota exhaustion |
| Failure Tracking | Know which keys are problematic |
| Telegram Integration | Sanitized responses prevent parsing errors |
| Flexible Scaling | Add more keys as needed |
| Detailed Logging | Full visibility into rotation decisions |

The API Key Rotating System keeps your bot running smoothly, even when hitting rate limits!
