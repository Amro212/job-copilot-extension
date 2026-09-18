import { api } from '../shared/browser.js';

/**
 * Registry of which frames in a tab carry form controls. Subframes announce
 * themselves; the top-frame panel asks for the list and then addresses each
 * frame by id. Lives in session storage because the worker can be recycled.
 */
const key = (tabId) => `jc:frames:${tabId}`;

const session = () => api.storage.session || api.storage.local;

const STALE_MS = 60000;

async function read(tabId) {
  const stored = await session().get(key(tabId));
  return stored?.[key(tabId)] || [];
}

async function write(tabId, frames) {
  await session().set({ [key(tabId)]: frames });
}

export async function registerFrame(sender, { url, fieldCount, isTop }) {
  const tabId = sender?.tab?.id;
  const frameId = sender?.frameId;
  if (typeof tabId !== 'number' || typeof frameId !== 'number') return;

  const frames = await read(tabId);
  const entry = { frameId, url, fieldCount, isTop: Boolean(isTop), updatedAt: Date.now() };
  await write(tabId, [entry, ...frames.filter((f) => f.frameId !== frameId)]);
}

export async function listFrames(tabId) {
  if (typeof tabId !== 'number') return [];
  const cutoff = Date.now() - STALE_MS;
  const frames = (await read(tabId)).filter((f) => f.updatedAt >= cutoff);
  return frames.sort((a, b) => b.fieldCount - a.fieldCount);
}

export async function dropFrame(tabId, frameId) {
  if (typeof tabId !== 'number') return;
  if (frameId === 0) {
    // Top-frame navigation invalidates every subframe in the tab.
    await session().remove(key(tabId));
    return;
  }
  const frames = await read(tabId);
  await write(tabId, frames.filter((f) => f.frameId !== frameId));
}

export async function dropTab(tabId) {
  if (typeof tabId !== 'number') return;
  await session().remove(key(tabId));
}
