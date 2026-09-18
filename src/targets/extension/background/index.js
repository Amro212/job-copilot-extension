import { api, isFirefox } from '../shared/browser.js';
import { MSG, BROADCAST_KEYS } from '../shared/protocol.js';
import { buildSnapshot, applySet, applyDelete, writeSecret, clearSecret, hasApiKey } from './storage.js';
import { proxyAiRequest } from './ai.js';
import { bindTabSession, getTabSession, watchTabLifecycle } from './tabs.js';
import { registerFrame, listFrames, dropFrame, dropTab } from './frames.js';
import { recordNavigation, readNavigation, clearNavigation } from './navigation.js';
import { putDocument, getDocument, documentMeta, deleteDocument } from './documents.js';

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
    const changed = await registerFrame(sender, payload);
    // The panel lives in the top frame and cannot see subframes, so tell it when
    // an embedded frame appears or its field count moves.
    if (changed && !payload.isTop && typeof sender?.tab?.id === 'number') {
      api.tabs.sendMessage(
        sender.tab.id,
        { type: MSG.FRAMES_CHANGED },
        { frameId: 0 },
        () => void api.runtime.lastError,
      );
    }
    return { ok: true };
  },

  // tabId is explicit for callers without a tab of their own (popup, options).
  [MSG.FRAME_LIST]: async (payload, sender) => ({
    frames: await listFrames(payload?.tabId ?? sender?.tab?.id),
  }),

  [MSG.FRAME_COMMAND]: async (payload, sender) => forwardToFrame(payload?.tabId ?? sender?.tab?.id, payload),

  [MSG.NAV_STATE]: async (payload, sender) => readNavigation(payload?.tabId ?? sender?.tab?.id),

  [MSG.DOC_META]: async () => ({ meta: await documentMeta() }),
  [MSG.DOC_GET]: () => getDocument(),
  [MSG.DOC_PUT]: ({ name, type, mimeType, buffer }) => putDocument({ name, type: mimeType || type, buffer }),
  [MSG.DOC_DELETE]: () => deleteDocument(),
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
api.tabs.onRemoved.addListener((tabId) => {
  dropTab(tabId).catch(() => {});
  clearNavigation(tabId).catch(() => {});
});

/**
 * Real navigation evidence for the application engine. `onCommitted` covers full
 * document loads; the history and fragment events cover the single-page step
 * changes that multi-step ATS flows use, where no document reload happens.
 */
async function announceNavigation(kind, { tabId, frameId, url }) {
  if (kind === 'committed') await dropFrame(tabId, frameId).catch(() => {});
  const record = await recordNavigation(tabId, { url, frameId, kind }).catch(() => null);
  if (!record) return;
  api.tabs.sendMessage(
    tabId,
    { type: MSG.NAV_COMMITTED, navigation: record },
    { frameId: 0 },
    () => void api.runtime.lastError,
  );
}

api.webNavigation?.onCommitted.addListener((details) => void announceNavigation('committed', details));
api.webNavigation?.onHistoryStateUpdated.addListener((details) => void announceNavigation('history', details));
api.webNavigation?.onReferenceFragmentUpdated.addListener((details) => void announceNavigation('fragment', details));

/**
 * Firefox MV3 treats host_permissions as opt-in. A first-run page asks for them
 * so the content script and OpenRouter proxy are not silently inert.
 */
api.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install' && details.reason !== 'update') return;
  const origins = ['<all_urls>'];
  const openFirstRun = () => {
    api.tabs.create({ url: api.runtime.getURL('first-run/index.html') }, () => void api.runtime.lastError);
  };
  if (isFirefox && api.permissions?.contains) {
    Promise.resolve(api.permissions.contains({ origins }))
      .then((granted) => { if (!granted) openFirstRun(); })
      .catch(openFirstRun);
    return;
  }
  if (isFirefox) openFirstRun();
});
