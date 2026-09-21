import { api } from '../shared/browser.js';

/**
 * Registry of which frames in a tab carry form controls. Subframes announce
 * themselves; the top-frame panel asks for the list and then addresses each
 * frame by id. Lives in session storage because the worker can be recycled.
 */
const key = (tabId) => `kr:frames:${tabId}`;

const session = () => api.storage.session || api.storage.local;

const STALE_MS = 60000;

/**
 * Every frame in a tab announces at roughly the same moment, and
 * read-modify-write against chrome.storage is not atomic, so concurrent
 * announces would overwrite each other and the panel would only ever learn
 * about whichever frame happened to write last.
 */
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

async function read(tabId) {
  const stored = await session().get(key(tabId));
  return stored?.[key(tabId)] || [];
}

/** Returns true when the panel's view of this tab's frames actually changed. */
export function registerFrame(sender, { url, fieldCount, isTop }) {
  const tabId = sender?.tab?.id;
  const frameId = sender?.frameId;
  if (typeof tabId !== 'number' || typeof frameId !== 'number') return Promise.resolve(false);

  return serialize(tabId, async () => {
    const frames = await read(tabId);
    const previous = frames.find((frame) => frame.frameId === frameId);
    const entry = { frameId, url, fieldCount, isTop: Boolean(isTop), updatedAt: Date.now() };
    await session().set({ [key(tabId)]: [entry, ...frames.filter((frame) => frame.frameId !== frameId)] });

    // Heartbeats repeat unchanged data; only a real change is worth notifying.
    return !previous || previous.fieldCount !== fieldCount || previous.url !== url;
  });
}

export async function listFrames(tabId) {
  if (typeof tabId !== 'number') return [];
  const cutoff = Date.now() - STALE_MS;
  const frames = (await read(tabId)).filter((frame) => frame.updatedAt >= cutoff);
  return frames.sort((a, b) => b.fieldCount - a.fieldCount);
}

export function dropFrame(tabId, frameId) {
  if (typeof tabId !== 'number') return Promise.resolve();
  return serialize(tabId, async () => {
    // Top-frame navigation invalidates every subframe in the tab.
    if (frameId === 0) {
      await session().remove(key(tabId));
      return;
    }
    const frames = await read(tabId);
    await session().set({ [key(tabId)]: frames.filter((frame) => frame.frameId !== frameId) });
  });
}

export function dropTab(tabId) {
  if (typeof tabId !== 'number') return Promise.resolve();
  return serialize(tabId, () => session().remove(key(tabId)));
}
