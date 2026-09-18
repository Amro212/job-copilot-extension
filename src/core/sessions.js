import { gmGet, gmSet } from './storage.js';
import { STORAGE_KEYS } from './constants.js';
import { platform } from './platform.js';

const key = id => `${STORAGE_KEYS.SESSIONS}:${id}`;
const now = () => new Date().toISOString();

// crypto.randomUUID is secure-context only, so it is missing on plain http pages.
function newSessionId() {
  const uuid = globalThis.crypto?.randomUUID;
  if (typeof uuid === 'function') return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function saveSession(session) {
  session.updatedAt = now();
  gmSet(key(session.id), session);
  const ids = gmGet(STORAGE_KEYS.SESSIONS, []);
  gmSet(STORAGE_KEYS.SESSIONS, [session.id, ...ids.filter(id => id !== session.id)].slice(0, 100));
  return session;
}
export function bindTab(session) {
  platform.tab.bind(session.id);
}
export function createSession(job) {
  const session = {
    id: newSessionId(), job, currentUrl: window.location.href,
    identityVersion: 2, completedSteps: 0, currentStep: '',
    history: [], answers: {}, errors: [], steps: {}, status: 'idle', reason: 'Ready to start.',
    active: false, createdAt: now(), updatedAt: now(), pendingUrl: '', transitions: 0,
  };
  saveSession(session);
  bindTab(session);
  return session;
}
export function matchesSession(session, url) {
  return Boolean(session && [session.currentUrl, session.pendingUrl, session.job?.listingUrl, session.job?.applicationUrl, ...(session.history || []).map(page => page.url)].filter(Boolean).includes(url));
}
function pendingRedirectMatches(session, url) {
  if (!session?.active || !session.pendingUrl || !session.pendingAt || Date.now() - session.pendingAt > 120000) return false;
  try {
    const pending = new URL(session.pendingUrl), target = new URL(url);
    if (pending.origin !== target.origin) return false;
    const parts = pending.pathname.split('/').filter(Boolean);
    if (/^(?:step|page|stage)[-_]?\d+$/i.test(parts.at(-1))) parts.pop();
    if (parts.length < 2) return false;
    const prefix = '/' + parts.join('/');
    if (target.pathname !== prefix && !target.pathname.startsWith(prefix + '/')) return false;
    for (const [name, value] of pending.searchParams) {
      if (!/^(step|page|stage)$/i.test(name) && target.searchParams.get(name) !== value) return false;
    }
    return true;
  } catch { return false; }
}
export async function restoreSession(url = window.location.href) {
  const boundId = await platform.tab.boundId();
  if (boundId) {
    const session = gmGet(key(boundId));
    if (matchesSession(session, url) || pendingRedirectMatches(session, url)) return session;
  }
  const candidates = gmGet(STORAGE_KEYS.SESSIONS, []).map(id => gmGet(key(id))).filter(s => matchesSession(s, url));
  // Shared generic endpoints may belong to several jobs. Never guess in that case.
  return candidates.length === 1 ? candidates[0] : null;
}
