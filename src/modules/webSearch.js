import { tavily } from '@tavily/core';

const SEARCH_TRIGGERS = [
  'search',
  'find',
  'look up',
  'google',
  'latest',
  'current',
  'today',
  'breaking',
  'news about',
  'recent',
  'who is',
  'what is',
  'latest',
  'recent',
  'today',
  'now',
  'elon musk',
  'ceo',
  'president',
  'news',
  'weather',
  'stock',
  'price',
  'covid',
  'election',
  'sports',
  'movie',
  'celebrity',
  'company',
];

function getSearchClient() {
  const apiKey = process.env.TAVILY_API_KEY_1;
  if (!apiKey) {
    return null;
  }

  return tavily({ apiKey });
}

export function shouldTriggerWebSearch(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const lower = text.trim().toLowerCase();

  if (lower.startsWith('/search')) {
    return true;
  }

  return SEARCH_TRIGGERS.some(trigger => lower.includes(trigger));
}

export function normalizeSearchQuery(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }

  const trimmed = text.trim();
  const commandMatch = trimmed.match(/^\/search\s+(.+)$/i);
  if (commandMatch) {
    return commandMatch[1].trim();
  }

  return trimmed.replace(/^search(?: for)?\s+/i, '').replace(/^find\s+/i, '').replace(/^look up\s+/i, '').trim();
}

export async function performWebSearch(text) {
  const query = normalizeSearchQuery(text);
  if (!query) {
    return null;
  }

  const client = getSearchClient();
  if (!client) {
    throw new Error('Web search is not configured. Missing TAVILY_API_KEY_1.');
  }

  const response = await client.search(query, {
    max_results: 3,
    includeAnswer: 'advanced',
    searchDepth: 'advanced'
  });

  const answer = typeof response?.answer === 'string' && response.answer.trim()
    ? response.answer.trim()
    : '';

  if (answer) {
    return answer;
  }

  const results = Array.isArray(response?.results)
    ? response.results
    : Array.isArray(response?.data)
      ? response.data
      : [];

  if (!results.length) {
    return `I couldn't find reliable results for “${query}”.`;
  }

  const formatted = results
    .slice(0, 2)
    .map((item, index) => {
      const title = item.title || item.name || `Result ${index + 1}`;
      const url = item.url || item.link || '';
      const snippet = item.content || item.snippet || item.description || '';
      const cleanSnippet = String(snippet || '').replace(/\s+/g, ' ').trim();
      return `${index + 1}. ${title}${url ? `\n   ${url}` : ''}${cleanSnippet ? `\n   ${cleanSnippet}` : ''}`;
    })
    .join('\n\n');

  return `Here is a concise summary for “${query}”:\n\n${formatted}`;
}