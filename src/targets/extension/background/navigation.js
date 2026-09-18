import { api } from '../shared/browser.js';

/**
 * Authoritative record of navigations in a tab, including SPA history updates.
 *
 * The userscript could only infer "did the page advance?" by diffing the DOM,
 * which is what produced false step changes on Workday. A counter kept here
 * survives content script reloads, so a fresh document can still tell that its
 * predecessor's Continue click really did navigate.
 */
const key = (tabId) => `jc:nav:${tabId}`;

const session = () => api.storage.session || api.storage.local;

const queues = new Map();

function serialize(tabId, task) {
  const previous = queues.get(tabId) || Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.catch(() => {});
  queues.set(tabId, tail);
  tail.then(() => {
    if (queues.get(tabId) === tail) queues.delete(tabId);
  });
  return run;
}

export async function readNavigation(tabId) {
  if (typeof tabId !== 'number') return { id: 0, url: '', frameId: 0, at: 0, kind: '' };
  const stored = await session().get(key(tabId));
  return stored?.[key(tabId)] || { id: 0, url: '', frameId: 0, at: 0, kind: '' };
}

export function recordNavigation(tabId, { url, frameId, kind }) {
  if (typeof tabId !== 'number') return Promise.resolve(null);
  return serialize(tabId, async () => {
    const current = await readNavigation(tabId);
    const next = { id: current.id + 1, url, frameId, kind, at: Date.now() };
    await session().set({ [key(tabId)]: next });
    return next;
  });
}

export function clearNavigation(tabId) {
  if (typeof tabId !== 'number') return Promise.resolve();
  return serialize(tabId, () => session().remove(key(tabId)));
}
