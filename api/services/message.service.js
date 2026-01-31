import { generateAIReply } from '../../shared/ai/ai.service.js';

export async function handleMessage({ text, chatId, platform }) {
  const replyText = await generateAIReply({
    userMessage: text,
  });

  return {
    platform,
    chatId,
    type: 'text',
    payload: {
      text: replyText,
    },
  };
}