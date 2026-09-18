/**
 * Userscript host: Tampermonkey GM APIs when present, in-memory + fetch when
 * not (fixtures, jsdom tests). GM globals are probed per call because test
 * harnesses install and remove them between cases.
 */
const SECRETS_KEY = 'jc:secrets';

export function createGmHost() {
  const memoryStore = new Map();
  const resolved = Promise.resolve();

  const hasGmStorage = () => typeof GM_getValue === 'function' && typeof GM_setValue === 'function';

  function storageGet(key, defaultValue = null) {
    try {
      if (hasGmStorage()) {
        const value = GM_getValue(key, defaultValue);
        return value !== undefined ? value : defaultValue;
      }
      return memoryStore.has(key) ? memoryStore.get(key) : defaultValue;
    } catch (err) {
      console.error(`[JobCopilot:Storage] Failed to read "${key}":`, err);
      return defaultValue;
    }
  }

  function storageSet(key, value) {
    try {
      if (hasGmStorage()) {
        GM_setValue(key, value);
      } else {
        memoryStore.set(key, value);
      }
    } catch (err) {
      console.error(`[JobCopilot:Storage] Failed to write "${key}":`, err);
    }
  }

  function storageDelete(key) {
    try {
      if (typeof GM_deleteValue === 'function') {
        GM_deleteValue(key);
      } else {
        memoryStore.delete(key);
      }
    } catch (err) {
      console.error(`[JobCopilot:Storage] Failed to delete "${key}":`, err);
    }
  }

  function secretRead() {
    const secrets = storageGet(SECRETS_KEY, {});
    return secrets && secrets.apiKey ? String(secrets.apiKey).trim() : '';
  }

  function aiRequest(options) {
    const apiKey = secretRead();
    const headers = { ...options.headers };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const timeoutError = () => new Error(`OpenRouter request timed out after ${options.timeout / 1000}s. Try again or choose a faster model.`);

    return new Promise((resolve, reject) => {
      if (typeof GM_xmlhttpRequest === 'function') {
        GM_xmlhttpRequest({
          ...options,
          headers,
          onload: (response) => resolve(response),
          onerror: (err) => reject(err),
          ontimeout: () => reject(timeoutError()),
        });
        return;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(timeoutError()), options.timeout);
      fetch(options.url, {
        method: options.method,
        headers,
        body: options.data,
        signal: controller.signal,
      })
        .then(async (res) => {
          const text = await res.text();
          resolve({ status: res.status, responseText: text, responseHeaders: '' });
        })
        .catch(reject)
        .finally(() => clearTimeout(timer));
    });
  }

  return {
    name: 'userscript',
    capabilities: {
      // The panel may collect the key directly: GM storage is not reachable
      // from the page, so there is no safer context to move it to.
      writeSecretsInPage: true,
      menuCommands: typeof GM_registerMenuCommand === 'function',
      crossFrame: false,
      fileUpload: false,
    },
    storageReady: () => resolved,
    storageGet,
    storageSet,
    storageDelete,
    storageOnExternalChange: () => () => {},
    secretRead,
    secretWrite: (apiKey) => storageSet(SECRETS_KEY, { apiKey: typeof apiKey === 'string' ? apiKey.trim() : '' }),
    secretClear: () => storageDelete(SECRETS_KEY),
    secretHas: () => Boolean(secretRead()),
    aiRequest,
    tabBind: (sessionId) => {
      if (typeof GM_getTab === 'function' && typeof GM_saveTab === 'function') {
        GM_getTab((tab) => GM_saveTab({ ...tab, jobCopilotSession: sessionId }));
      }
    },
    tabBoundId: () => {
      if (typeof GM_getTab !== 'function') return Promise.resolve(null);
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 500);
        GM_getTab((tab) => {
          clearTimeout(timer);
          resolve(tab?.jobCopilotSession || null);
        });
      });
    },
    // A userscript has no way to address another origin's frame.
    framesList: () => Promise.resolve([]),
    frameCommand: () => Promise.resolve({ error: 'Cross-frame commands need the extension host' }),
    // No navigation API: a constant marker keeps the engine on DOM comparison.
    navigationMarker: () => ({ id: 0, url: '', frameId: 0, kind: '', at: 0 }),
    navigationOnChange: () => () => {},
    openOptions: () => {},
    menuRegister: (label, handler) => {
      if (typeof GM_registerMenuCommand === 'function') {
        try {
          GM_registerMenuCommand(label, handler);
        } catch (err) {
          console.warn('[JobCopilot] Could not register GM menu command:', err);
        }
      }
    },
  };
}
