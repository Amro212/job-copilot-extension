/**
 * Cross-browser runtime handle. Firefox exposes promise-based `browser`, Chrome
 * exposes callback-based `chrome` with promise support on MV3. Using `chrome`
 * where available keeps one code path, since Firefox aliases `chrome` too.
 */
export const api = typeof browser !== 'undefined' && browser.runtime ? browser : chrome;

export const isFirefox = typeof browser !== 'undefined' && Boolean(browser.runtime?.getBrowserInfo);

export function sendMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      api.runtime.sendMessage(message, (response) => {
        const err = api.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
          return;
        }
        resolve(response);
      });
    } catch (err) {
      reject(err);
    }
  });
}

/** Resolves once, then caches. Used for `chrome.storage.session` access level. */
export function onceAsync(fn) {
  let promise = null;
  return () => (promise ||= fn());
}
