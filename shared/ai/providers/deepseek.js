import http from '../../utils/http.js';

const BASE_URL = process.env.DEEPSEEK_BASE_URL;
const MODEL = process.env.AI_DEFAULT_MODEL;

export async function deepseekChat({ messages }) {
  const res = await http.post(
    `${BASE_URL}/chat/completions`,
    {
      model: MODEL,
      messages,
      max_tokens: Number(process.env.AI_MAX_TOKENS ?? 800),
      temperature: Number(process.env.AI_TEMPERATURE ?? 0.7),
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
    }
  );

  return res.data.choices[0].message.content;
}