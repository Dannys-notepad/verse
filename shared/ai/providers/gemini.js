import { GoogleGenAI } from "@google/genai";

// The client gets the API key from the environment variable `GEMINI_API_KEY`.
const ai = new GoogleGenAI({});

export async function geminiChat({ messages }) {
    if (!Array.isArray(messages)) {
        throw new Error('geminiChat expects { messages } array');
    }

    // Convert messages array to a single string prompt (system + user messages)
    const prompt = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

    const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview',
        contents: prompt,
    });

    // Maintain compatibility with different response shapes
    if (typeof response.text === 'string') return response.text;
    if (response?.candidates?.[0]?.content) return response.candidates[0].content;

    throw new Error('Unexpected Gemini response format');
}
