import { GoogleGenAI } from "@google/genai";
import 'dotenv/config';

if (!process.env.GEMINI_API_KEY) {
    // Be explicit so caller knows why provider may fail fast
    console.warn('Gemini provider disabled: GEMINI_API_KEY not set');
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function geminiChat({ messages }) {
    if (!Array.isArray(messages)) {
        throw new Error('geminiChat expects { messages } array');
    }

    // Convert messages array to a single string prompt (system + user messages)
    const prompt = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');

    try {
        const response = await ai.models.generateContent({
            model: process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview',
            // Use the newer `contents` shape similar to other providers
            contents: [{ parts: [{ text: prompt }] }],
            // Allow some sensible defaults
            // generationConfig: { temperature: 0.7, maxOutputTokens: 800 }
        });

        // Normalize different shapes returned by the client
        if (typeof response?.text === 'string') return response.text;
        if (response?.candidates?.[0]?.content) {
            // Gemini may return a nested structure
            const c = response.candidates[0].content;
            if (typeof c === 'string') return c;
            if (c?.parts?.[0]?.text) return c.parts[0].text;
        }

        throw new Error('Unexpected Gemini response format');
    } catch (err) {
        // Provide clearer error messages for common failure modes
        if (err?.message?.toLowerCase().includes('unauthorized') || err?.message?.toLowerCase().includes('401')) {
            throw new Error('Gemini authentication failed. Please check GEMINI_API_KEY.');
        }
        if (err?.message?.toLowerCase().includes('timeout')) {
            throw new Error('Gemini request timed out.');
        }
        throw err;
    }
}
