import { deepseekChat } from './providers/deepseek.js';

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

  return deepseekChat({ messages });
}