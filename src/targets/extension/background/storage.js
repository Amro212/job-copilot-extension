import { api } from '../shared/browser.js';
import { SECRET_KEYS, STORAGE_AREA } from '../shared/protocol.js';

const area = () => api.storage[STORAGE_AREA];

function isSecret(key) {
  return SECRET_KEYS.includes(key);
}

/**
 * Everything a page context is allowed to see, plus a presence flag standing in
 * for the API key. Content scripts hydrate a synchronous cache from this.
 */
export async function buildSnapshot() {
  const all = await area().get(null);
  const data = {};
  for (const [key, value] of Object.entries(all)) {
    if (!isSecret(key)) data[key] = value;
  }
  return {
    data,
    hasApiKey: Boolean(all['kr:secrets']?.apiKey),
  };
}

export async function applySet(key, value) {
  if (isSecret(key)) throw new Error(`Refusing to write secret key "${key}" from a page context`);
  await area().set({ [key]: value });
}

export async function applyDelete(key) {
  if (isSecret(key)) throw new Error(`Refusing to delete secret key "${key}" from a page context`);
  await area().remove(key);
}

export async function writeSecret(apiKey) {
  const clean = typeof apiKey === 'string' ? apiKey.trim() : '';
  await area().set({ 'kr:secrets': { apiKey: clean } });
}

export async function clearSecret() {
  await area().remove('kr:secrets');
}

export async function readApiKey() {
  const stored = await area().get('kr:secrets');
  const key = stored?.['kr:secrets']?.apiKey;
  return typeof key === 'string' ? key.trim() : '';
}

export async function hasApiKey() {
  return Boolean(await readApiKey());
}
