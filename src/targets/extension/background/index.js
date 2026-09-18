import { api } from '../shared/browser.js';
import { MSG, BROADCAST_KEYS } from '../shared/protocol.js';
import { buildSnapshot, applySet, applyDelete, writeSecret, clearSecret, hasApiKey } from './storage.js';
import { proxyAiRequest } from './ai.js';
import { bindTabSession, getTabSession, watchTabLifecycle } from './tabs.js';
import { registerFrame, listFrames, dropFrame, dropTab } from './frames.js';

/**
 * MV3 workers are terminated when idle, so this file holds no durable state.
 * Everything lives in chrome.storage; every handler reads what it needs.
 */

const handlers = {
  [MSG.SNAPSHOT]: () => buildSnapshot(),

  [MSG.STORAGE_SET]: async ({ key, value }, sender) => {
    await applySet(key, value);
    broadcastKeys({ [key]: value }, sender);
    return { ok: true };
  },

  [MSG.STORAGE_DELETE]: async ({ key }, sender) => {
    await applyDelete(key);
    broadcastKeys({ [key]: null }, sender);
    return { ok: true };
  },

  [MSG.SECRET_WRITE]: async ({ apiKey }) => {
    await writeSecret(apiKey);
    const present = await hasApiKey();
    broadcastSecret(present);
    return { ok: true, hasApiKey: present };
  },

  [MSG.SECRET_CLEAR]: async () => {
    await clearSecret();
    broadcastSecret(false);
    return { ok: true, hasApiKey: false };
  },

  [MSG.AI_REQUEST]: ({ options }) => proxyAiRequest(options),

  [MSG.TAB_BIND]: async ({ sessionId }, sender) => {
    await bindTabSession(sender?.tab?.id, sessionId);
    return { ok: true };
  },

  [MSG.TAB_BOUND_ID]: async (_payload, sender) => ({
    sessionId: await getTabSession(sender?.tab?.id),
  }),

  [MSG.OPEN_OPTIONS]: async () => {
    await api.runtime.openOptionsPage();
    return { ok: true };
  },

  [MSG.FRAME_ANNOUNCE]: async (payload, sender) => {
    await registerFrame(sender, payload);
    return { ok: true };
  },

  // tabId is explicit for callers without a tab of their own (popup, options).
  [MSG.FRAME_LIST]: async (payload, sender) => ({
    frames: await listFrames(payload?.tabId ?? sender?.tab?.id),
  }),

  [MSG.FRAME_COMMAND]: async (payload, sender) => forwardToFrame(payload?.tabId ?? sender?.tab?.id, payload),
};

function deliver(payload, excludeTabId) {
  api.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (typeof tab.id === 'number' && tab.id !== excludeTabId) {
        api.tabs.sendMessage(tab.id, payload, () => void api.runtime.lastError);
      }
    }
  });
  // Extension pages (options, popup) listen on the runtime channel.
  api.runtime.sendMessage(payload, () => void api.runtime.lastError);
}

/** Shared state only. The originating tab already updated its own cache. */
function broadcastKeys(changed, sender) {
  const keys = {};
  for (const [key, value] of Object.entries(changed)) {
    if (BROADCAST_KEYS.includes(key)) keys[key] = value;
  }
  if (!Object.keys(keys).length) return;
  deliver({ type: MSG.STORAGE_CHANGED, keys, secretChanged: false }, sender?.tab?.id);
}

function broadcastSecret(present) {
  deliver({ type: MSG.STORAGE_CHANGED, keys: {}, secretChanged: true, hasApiKey: present });
}

/** Sends a command to one subframe agent and returns its reply. */
function forwardToFrame(tabId, { frameId, command }) {
  if (typeof tabId !== 'number' || typeof frameId !== 'number') {
    return Promise.resolve({ error: 'Unknown frame target' });
  }
  return new Promise((resolve) => {
    api.tabs.sendMessage(tabId, { type: MSG.FRAME_COMMAND, command }, { frameId }, (response) => {
      const err = api.runtime.lastError;
      resolve(err ? { error: err.message } : response);
    });
  });
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler) return false;

  Promise.resolve(handler(message, sender))
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err?.message || String(err) }));

  return true; // async response
});

// Toolbar click toggles the in-page panel, replacing GM_registerMenuCommand.
const action = api.action || api.browserAction;
action?.onClicked.addListener((tab) => {
  if (typeof tab?.id !== 'number') return;
  api.tabs.sendMessage(tab.id, { type: MSG.TOGGLE_PANEL }, { frameId: 0 }, () => void api.runtime.lastError);
});

api.commands?.onCommand.addListener((command) => {
  if (command !== 'toggle-panel') return;
  api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs?.[0]?.id;
    if (typeof tabId === 'number') {
      api.tabs.sendMessage(tabId, { type: MSG.TOGGLE_PANEL }, { frameId: 0 }, () => void api.runtime.lastError);
    }
  });
});

watchTabLifecycle();
api.tabs.onRemoved.addListener((tabId) => { dropTab(tabId).catch(() => {}); });
api.webNavigation?.onCommitted.addListener(({ tabId, frameId }) => {
  dropFrame(tabId, frameId).catch(() => {});
});
