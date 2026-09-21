import { api, sendMessage } from '../shared/browser.js';
import { MSG } from '../shared/protocol.js';

/**
 * Extension host. Core reads storage synchronously, so this host hydrates a
 * full snapshot once during `storageReady()` and answers reads from memory
 * afterwards. Writes go to the background (the authority) and are applied to the
 * cache immediately so a read-after-write in the same tick sees the new value.
 *
 * The API key is never part of the snapshot. Only a presence flag crosses over.
 */
export function createExtensionHost() {
  const cache = new Map();
  const listeners = new Set();
  const navListeners = new Set();
  let keyPresent = false;
  let hydrated = null;
  // Seeded from the background so a freshly loaded document inherits the tab's
  // navigation count instead of restarting at zero.
  let navigation = { id: 0, url: '', frameId: 0, kind: '', at: 0 };

  function hydrate() {
    return Promise.all([
      sendMessage({ type: MSG.SNAPSHOT }),
      sendMessage({ type: MSG.NAV_STATE }).catch(() => null),
    ]).then(([snapshot, nav]) => {
      if (!snapshot || snapshot.error) {
        throw new Error(snapshot?.error || 'Storage snapshot failed');
      }
      cache.clear();
      for (const [key, value] of Object.entries(snapshot.data)) cache.set(key, value);
      keyPresent = Boolean(snapshot.hasApiKey);
      if (nav && !nav.error) navigation = nav;
    });
  }

  // Changes made in other frames or tabs arrive here and refresh the cache.
  api.runtime.onMessage.addListener((message) => {
    if (message?.type === MSG.NAV_COMMITTED && message.navigation) {
      navigation = message.navigation;
      for (const listener of navListeners) {
        try { listener(navigation); } catch {}
      }
      return;
    }
    if (message?.type !== MSG.STORAGE_CHANGED) return;
    for (const [key, value] of Object.entries(message.keys || {})) {
      if (value === null) cache.delete(key);
      else cache.set(key, value);
    }
    if (message.secretChanged) keyPresent = Boolean(message.hasApiKey);
    for (const listener of listeners) {
      try { listener(message.keys || {}); } catch {}
    }
  });

  function storageGet(key, defaultValue = null) {
    if (!cache.has(key)) return defaultValue;
    const value = cache.get(key);
    return value === undefined ? defaultValue : value;
  }

  function storageSet(key, value) {
    cache.set(key, value);
    sendMessage({ type: MSG.STORAGE_SET, key, value }).catch((err) => {
      console.error(`[Kareer:Storage] Failed to persist "${key}":`, err);
    });
  }

  function storageDelete(key) {
    cache.delete(key);
    sendMessage({ type: MSG.STORAGE_DELETE, key }).catch((err) => {
      console.error(`[Kareer:Storage] Failed to delete "${key}":`, err);
    });
  }

  async function aiRequest(options) {
    const { headers, ...rest } = options;
    const result = await sendMessage({
      type: MSG.AI_REQUEST,
      options: { ...rest, headers },
    });
    if (!result || result.error) {
      throw new Error(result?.error || 'AI request failed');
    }
    return result;
  }

  return {
    name: 'extension',
    capabilities: {
      // The panel lives in the page. Collecting the key there would expose it to
      // the content script, so the options page owns it instead.
      writeSecretsInPage: false,
      menuCommands: false,
      crossFrame: true,
      fileUpload: true,
    },
    storageReady: () => (hydrated ||= hydrate()),
    storageGet,
    storageSet,
    storageDelete,
    storageOnExternalChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    secretRead: () => '',
    secretWrite: (apiKey) => {
      sendMessage({ type: MSG.SECRET_WRITE, apiKey }).catch(() => {});
    },
    secretClear: () => {
      sendMessage({ type: MSG.SECRET_CLEAR }).catch(() => {});
    },
    secretHas: () => keyPresent,
    aiRequest,
    tabBind: (sessionId) => {
      sendMessage({ type: MSG.TAB_BIND, sessionId }).catch(() => {});
    },
    tabBoundId: () => sendMessage({ type: MSG.TAB_BOUND_ID })
      .then((res) => res?.sessionId || null)
      .catch(() => null),
    navigationMarker: () => navigation,
    navigationOnChange: (listener) => {
      navListeners.add(listener);
      return () => navListeners.delete(listener);
    },
    framesList: () => sendMessage({ type: MSG.FRAME_LIST })
      .then((res) => res?.frames || [])
      .catch(() => []),
    frameCommand: (frameId, command) => sendMessage({ type: MSG.FRAME_COMMAND, frameId, command })
      .catch((err) => ({ error: err?.message || 'Frame command failed' })),
    documentsMeta: () => sendMessage({ type: MSG.DOC_META }).then((res) => res?.meta || null).catch(() => null),
    documentsGet: () => sendMessage({ type: MSG.DOC_GET }).then((res) => (res?.error ? null : res)).catch(() => null),
    documentsPut: (doc) => sendMessage({
      type: MSG.DOC_PUT,
      name: doc.name,
      mimeType: doc.mimeType || doc.type,
      buffer: doc.buffer,
    }),
    documentsDelete: () => sendMessage({ type: MSG.DOC_DELETE }),
    openOptions: () => {
      sendMessage({ type: MSG.OPEN_OPTIONS }).catch(() => {});
    },
    menuRegister: () => {},
  };
}
