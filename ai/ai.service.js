import { deepseekChat } from './providers/deepseek.js';
import { geminiChat } from './providers/gemini.js';
import log from '../utils/log.js';

const PROVIDERS = [
  { name: 'Deepseek', fn: deepseekChat },
  { name: 'Gemini', fn: geminiChat },
];

export async function generateAIReply({ userMessage }) {
  const messages = [
    {
      role: 'system',
      content: 'You are Verse AI, a helpful assistant for students and general users.',
    },
    {
      role: 'user',
      content: userMessage,
    },
  ];

  const providerTimeoutMs = Number(process.env.AI_PROVIDER_TIMEOUT_MS ?? 6000);
  const errors = [];

  for (const provider of PROVIDERS) {
    try {
      log.info('AI Service', `Trying provider: ${provider.name}`);

      const result = await Promise.race([
        provider.fn({ messages }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`${provider.name} timeout after ${providerTimeoutMs}ms`)), providerTimeoutMs)
        ),
      ]);

      log.info('AI Service', `Provider ${provider.name} succeeded`);
      return result;
    } catch (error) {
      log.error('AI Service', `${provider.name} failed: ${error.message}`);
      errors.push({ provider: provider.name, error: error.message });
      // Continue to next provider
    }
  }

  const errMsg = `All AI providers failed: ${errors.map(e => `${e.provider}: ${e.error}`).join(' | ')}`;
  log.error('AI Service', errMsg);
  const aggregate = new Error(errMsg);
  aggregate.details = errors;
  throw aggregate;
}