import { api } from '../shared/browser.js';

/**
 * Replaces GM_getTab/GM_saveTab. Session storage is cleared when the browser
 * closes, which matches the old tab-object lifetime, and the worker can be
 * killed at any time without losing the binding.
 */
const key = (tabId) => `jc:tab:${tabId}`;

const session = () => api.storage.session || api.storage.local;

export async function bindTabSession(tabId, sessionId) {
  if (typeof tabId !== 'number') return;
  await session().set({ [key(tabId)]: sessionId });
}

export async function getTabSession(tabId) {
  if (typeof tabId !== 'number') return null;
  const stored = await session().get(key(tabId));
  return stored?.[key(tabId)] || null;
}

export async function clearTabSession(tabId) {
  if (typeof tabId !== 'number') return;
  await session().remove(key(tabId));
}

export function watchTabLifecycle() {
  api.tabs.onRemoved.addListener((tabId) => {
    clearTabSession(tabId).catch(() => {});
  });
}
