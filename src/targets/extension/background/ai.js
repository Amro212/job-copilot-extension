import { readApiKey } from './storage.js';

const ALLOWED_ORIGIN = 'https://openrouter.ai';

/**
 * Performs the OpenRouter call on behalf of a page context and attaches the
 * Authorization header here so the key never leaves the worker. Returns a plain
 * object because errors cannot cross the message boundary as Error instances.
 */
export async function proxyAiRequest(options) {
  const { method = 'POST', url, headers = {}, data, timeout = 60000 } = options || {};

  if (typeof url !== 'string' || !url.startsWith(`${ALLOWED_ORIGIN}/`)) {
    return { error: `Blocked request to non-OpenRouter URL`, kind: 'BLOCKED' };
  }

  const apiKey = await readApiKey();
  if (!apiKey) {
    return { error: 'No OpenRouter API key configured.', kind: 'NO_KEY' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: { ...headers, Authorization: `Bearer ${apiKey}` },
      body: data,
      signal: controller.signal,
    });
    const responseText = await response.text();
    return { status: response.status, responseText, responseHeaders: '' };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return {
        error: `OpenRouter request timed out after ${timeout / 1000}s. Try again or choose a faster model.`,
        kind: 'TIMEOUT',
      };
    }
    return { error: err?.message || 'Network error', kind: 'NETWORK' };
  } finally {
    clearTimeout(timer);
  }
}
