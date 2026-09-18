/**
 * Host adapter boundary.
 *
 * Core modules never touch GM_* or chrome.* directly. They talk to `platform`,
 * which forwards to whichever host a build target installed. The default host
 * is the userscript/page host, so a plain bundle behaves exactly like the
 * original Tampermonkey script with no installation step.
 *
 * Storage reads are deliberately synchronous. Hosts whose real storage is async
 * (the extension) must hydrate a cache during `storage.ready()` and answer
 * `storage.get` from memory afterwards.
 */
import { createGmHost } from './hosts/gm.js';

let host = createGmHost();

export function setPlatform(nextHost) {
  host = nextHost;
}

export function getHostName() {
  return host.name;
}

export const platform = {
  get capabilities() {
    return host.capabilities;
  },
  storage: {
    ready: () => host.storageReady(),
    get: (key, defaultValue = null) => host.storageGet(key, defaultValue),
    set: (key, value) => host.storageSet(key, value),
    delete: (key) => host.storageDelete(key),
    onExternalChange: (listener) => host.storageOnExternalChange(listener),
  },
  secrets: {
    // Returns '' where the host refuses to expose the key to this context.
    read: () => host.secretRead(),
    write: (apiKey) => host.secretWrite(apiKey),
    clear: () => host.secretClear(),
    has: () => host.secretHas(),
  },
  ai: {
    // Hosts attach the Authorization header themselves so the key never has to
    // pass through core or, in the extension, through the content script.
    request: (options) => host.aiRequest(options),
  },
  tab: {
    bind: (sessionId) => host.tabBind(sessionId),
    boundId: () => host.tabBoundId(),
  },
  menu: {
    register: (label, handler) => host.menuRegister(label, handler),
  },
  openOptions: () => host.openOptions(),
};
