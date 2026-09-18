import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { setPlatform } from '../../src/core/platform.js';
import { createGmHost } from '../../src/core/hosts/gm.js';
import { createApplicationEngine } from '../../src/core/application.js';
import { createSession, saveSession } from '../../src/core/sessions.js';
import { observePage, pageSignature } from '../../src/core/navigation.js';
import { scanFormFields } from '../../src/core/fields/scanner.js';
import { saveSettings, saveProfile } from '../../src/core/storage.js';
import { logger } from '../../src/core/debug.js';

let dom;
let navigation;
let navListeners;
let engines;

/** Host that behaves like the extension: a navigation marker the test can advance. */
function installHost() {
  const base = createGmHost();
  navigation = { id: 0, url: 'https://example.com/apply', frameId: 0, kind: '', at: 0 };
  navListeners = new Set();
  setPlatform({
    ...base,
    name: 'test-extension',
    capabilities: { ...base.capabilities, crossFrame: false },
    navigationMarker: () => navigation,
    navigationOnChange: (listener) => {
      navListeners.add(listener);
      return () => navListeners.delete(listener);
    },
  });
}

/** Simulates chrome.webNavigation reporting a navigation in this tab. */
function commitNavigation(url, kind = 'committed') {
  navigation = { id: navigation.id + 1, url, frameId: 0, kind, at: Date.now() };
  for (const listener of navListeners) listener(navigation);
}

function newEngine(options = {}) {
  const engine = createApplicationEngine({ answer: answers, settleMs: 0, transitionMs: 10, navigationTimeoutMs: 300, ...options });
  engines.push(engine);
  return engine;
}

beforeEach(() => {
  dom = new JSDOM('<body><main></main></body>', { url: 'https://example.com/apply' });
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Event', 'KeyboardEvent', 'MouseEvent', 'MutationObserver']) globalThis[key] = dom.window[key];
  globalThis.CSS = { escape: (value) => value };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { get: () => 200 });
  HTMLElement.prototype.scrollIntoView = () => {};

  const storage = new Map();
  globalThis.GM_getValue = (key, fallback) => structuredClone(storage.has(key) ? storage.get(key) : fallback);
  globalThis.GM_setValue = (key, value) => storage.set(key, structuredClone(value));
  globalThis.GM_deleteValue = (key) => storage.delete(key);
  globalThis.GM_getTab = undefined;

  engines = [];
  installHost();
  saveSettings({ autoContinue: true });
  saveProfile({ fullName: 'Test Applicant', email: 'test@example.com' });
});

// Engines run async work between ticks, so they must be stopped and allowed to
// unwind before the window goes away.
afterEach(async () => {
  for (const engine of engines) engine.destroy();
  await new Promise((resolve) => setTimeout(resolve, 50));
  dom.window.close();
});

const render = (html) => { document.querySelector('main').innerHTML = html; };
const answers = async (fields) => ({ answers: fields.map((field) => ({ fieldId: field.fieldId, value: 'Applicant' })) });
const job = () => ({ title: 'Engineer', company: 'Example', listingUrl: 'https://example.com/jobs/1', applicationUrl: window.location.href });

/**
 * The failure this signal exists for: a server round trip that keeps the same URL
 * and re-renders a structurally similar step. `comparePages` compares URL, step
 * marker, heading and overlapping questions, so it reads "same" and the engine
 * wrongly concludes Continue did nothing. The navigation record is the only
 * evidence that the step really advanced.
 */
const lookalikeStep = (id, label) => `<h2>Application</h2><label for="${id}">${label}</label><input id="${id}" required><button id="next" type="button">Next</button>`;
const SAME_URL = 'https://example.com/apply';

test('a same-URL navigation still advances the step when the page looks unchanged', async () => {
  render(lookalikeStep('field-a', 'Full name'));

  let clicks = 0;
  document.querySelector('#next').onclick = () => {
    clicks++;
    // A POST-back: identical heading, identical question, identical URL.
    if (clicks === 1) commitNavigation(SAME_URL);
  };

  const engine = newEngine();
  await engine.initialize();
  await engine.start(job());
  await new Promise((resolve) => setTimeout(resolve, 600));

  assert.equal(clicks >= 1, true, 'Continue was clicked');
  // Crediting the step is the whole point: the companion test below shows the
  // same page without a navigation record stays at zero.
  assert.equal(engine.session.completedSteps >= 1, true, `the step should be credited, got ${engine.session.completedSteps}`);
});

test('without a navigation event an unchanged page still reports that Continue did nothing', async () => {
  render(lookalikeStep('field-a', 'Full name'));

  // The click does nothing at all: no DOM change and no navigation.
  document.querySelector('#next').onclick = () => {};

  const engine = newEngine({ navigationTimeoutMs: 200 });
  await engine.initialize();
  await engine.start(job());
  await new Promise((resolve) => setTimeout(resolve, 500));

  assert.equal(engine.session.status, 'paused');
  assert.match(engine.session.reason, /did not change the step|disabled|Check the page/i);
  assert.equal(engine.session.completedSteps, 0, 'no step is credited without evidence');
});

test('a navigation recorded after the Continue click completes the pending step on reload', async () => {
  render(lookalikeStep('field-b', 'Email'));

  // An active session whose Continue click was in flight when the document
  // reloaded. The new page is structurally identical and sits at the same URL, so
  // only the navigation record can show that the step advanced.
  const session = createSession(job());
  const signature = pageSignature(scanFormFields());
  session.identityVersion = 2;
  session.active = true;
  session.status = 'running';
  session.currentStep = signature;
  session.pendingStep = signature;
  session.pendingAt = Date.now() - 500;
  session.pendingUrl = SAME_URL;
  session.steps[signature] = {
    primary: true, answers: {}, questions: {}, lateRequests: 0, repairs: 0, clicks: 1,
    observation: observePage(scanFormFields()),
  };
  saveSession(session);

  commitNavigation(SAME_URL);

  const resumed = newEngine({ navigationTimeoutMs: 100 });
  await resumed.initialize();

  assert.equal(resumed.session?.id, session.id, 'the session is restored for this tab');
  assert.equal(resumed.session.completedSteps >= 1, true, `pending step should be completed, got ${resumed.session.completedSteps}`);
});

test('without a navigation record the same reload leaves the pending step open', async () => {
  render(lookalikeStep('field-b', 'Email'));

  const session = createSession(job());
  const signature = pageSignature(scanFormFields());
  session.identityVersion = 2;
  session.active = true;
  session.status = 'running';
  session.currentStep = signature;
  session.pendingStep = signature;
  session.pendingAt = Date.now() - 500;
  session.pendingUrl = SAME_URL;
  session.steps[signature] = {
    primary: true, answers: {}, questions: {}, lateRequests: 0, repairs: 0, clicks: 1,
    observation: observePage(scanFormFields()),
  };
  saveSession(session);

  const resumed = newEngine({ navigationTimeoutMs: 100 });
  await resumed.initialize();

  assert.equal(resumed.session.completedSteps, 0, 'no evidence means no credit');
});

test('the engine subscribes to navigation events and releases them on destroy', async () => {
  render(lookalikeStep('field-c', 'Phone'));
  document.querySelector('#next').onclick = () => {};

  const engine = newEngine({ navigationTimeoutMs: 100 });
  await engine.initialize();
  assert.equal(navListeners.size, 1, 'initialize subscribes');

  // A single-page step change can mutate almost nothing, so the event itself has
  // to reach the engine rather than relying on a DOM mutation.
  commitNavigation(SAME_URL, 'history');
  await new Promise((resolve) => setTimeout(resolve, 50));
  const logged = logger.getLogs().some((entry) => /Navigation history in frame 0/.test(entry.message));
  assert.equal(logged, true, 'the engine observed the navigation event');

  engine.destroy();
  assert.equal(navListeners.size, 0, 'destroy unsubscribes');
});
