import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { setPlatform } from '../../src/core/platform.js';
import { createGmHost } from '../../src/core/hosts/gm.js';
import { saveProfile } from '../../src/core/storage.js';
import { captureFixture, fixtureFileName } from '../../src/core/capture.js';

const PROFILE = {
  fullName: 'Amrit Kaur Singh',
  email: 'amrit.singh@example.com',
  phone: '+1 416 555 0134',
  location: 'Toronto, Ontario, Canada',
  linkedin: 'https://linkedin.com/in/amrit-singh',
};

function load(html) {
  const dom = new JSDOM(html, { url: 'https://acme.wd1.myworkdayjobs.com/en-US/careers/job/apply' });
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'Element', 'Event', 'Node', 'NodeFilter']) {
    globalThis[key] = dom.window[key];
  }
  globalThis.CSS = { escape: (value) => value };
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetWidth', { get: () => 200, configurable: true });
  return dom;
}

beforeEach(() => {
  const storage = new Map();
  globalThis.GM_getValue = (key, fallback) => (storage.has(key) ? structuredClone(storage.get(key)) : fallback);
  globalThis.GM_setValue = (key, value) => storage.set(key, structuredClone(value));
  globalThis.GM_deleteValue = (key) => storage.delete(key);
  setPlatform(createGmHost());
});

test('applicant answers and identity never survive a capture', () => {
  load(`
    <body>
      <form>
        <label for="name">Full legal name</label>
        <input id="name" name="name" value="Amrit Kaur Singh" />
        <label for="email">Email</label>
        <input id="email" type="email" value="amrit.singh@example.com" />
        <label for="phone">Phone</label>
        <input id="phone" type="tel" value="+1 416 555 0134" />
        <label for="why">Why us?</label>
        <textarea id="why">I have shipped payments systems at scale.</textarea>
        <label><input type="checkbox" id="consent" checked /> I agree</label>
        <label for="country">Country</label>
        <select id="country">
          <option value="">Select</option>
          <option value="ca" selected>Canada</option>
          <option value="us">United States</option>
        </select>
        <div contenteditable="true" id="notes">Reachable at amrit.singh@example.com</div>
        <p>Confirmation sent to amrit.singh@example.com or call 416-555-0134.</p>
      </form>
    </body>
  `);
  saveProfile(PROFILE);

  const { html } = captureFixture(document);

  for (const secret of ['Amrit Kaur Singh', 'amrit.singh@example.com', '416 555 0134', '416-555-0134', 'shipped payments systems']) {
    assert.equal(html.includes(secret), false, `"${secret}" must not appear in the fixture`);
  }
  // Structure the field engine depends on is preserved.
  assert.match(html, /id="name"/);
  assert.match(html, /Full legal name/);
  assert.match(html, /<option value="us"/);
  assert.match(html, /Canada/);
  assert.equal(/\schecked/.test(html), false, 'checkbox state is cleared');
  assert.equal(/\sselected/.test(html), false, 'selected option is cleared');
});

test('scripts, inline handlers, and the copilot panel are stripped', () => {
  load(`
    <body>
      <div id="job-copilot-root">panel host</div>
      <div id="job-copilot-inline-rewrite">badge</div>
      <form>
        <input id="name" onfocus="steal()" onchange="track()" />
        <button onclick="submitNow()">Next</button>
        <img src="https://tracker.example.com/pixel.gif" alt="Company logo" />
      </form>
      <script>window.__analytics = 'beacon';</script>
      <noscript>enable js</noscript>
    </body>
  `);
  saveProfile(PROFILE);

  const { html } = captureFixture(document);

  assert.equal(html.includes('__analytics'), false, 'scripts are removed');
  assert.equal(html.includes('onfocus'), false);
  assert.equal(html.includes('onchange'), false);
  assert.equal(html.includes('onclick'), false);
  assert.equal(html.includes('job-copilot-root'), false, 'the panel is not part of the page under test');
  assert.equal(html.includes('job-copilot-inline-rewrite'), false);
  assert.equal(html.includes('tracker.example.com'), false, 'remote image sources are blanked');
  assert.match(html, /alt="Company logo"/, 'alt text is kept for label extraction');
  assert.match(html, />Next</);
});

test('embedded frames point at their own captured files', () => {
  load(`
    <body>
      <h1>Careers</h1>
      <iframe src="https://job-boards.greenhouse.io/acme/jobs/42/embed"></iframe>
      <iframe src="https://tracker.example.com/beacon"></iframe>
    </body>
  `);
  saveProfile(PROFILE);

  const { html, meta } = captureFixture(document, { frameFiles: ['acme-frame1.html', 'acme-frame2.html'] });

  assert.equal(meta.frameCount, 2);
  assert.match(html, /src="acme-frame1\.html"/);
  assert.match(html, /src="acme-frame2\.html"/);
  // The original host is recorded so a reviewer can tell which ATS it was.
  assert.match(html, /data-jc-original-host="job-boards\.greenhouse\.io"/);
  assert.equal(html.includes('https://job-boards.greenhouse.io/acme/jobs/42/embed'), false);
});

test('metadata records where the capture came from', () => {
  load('<body><form><label for="a">Name</label><input id="a" required></form></body>');
  saveProfile(PROFILE);

  const { html, meta } = captureFixture(document, { label: 'workday-my-information' });

  assert.equal(meta.host, 'acme.wd1.myworkdayjobs.com');
  assert.equal(meta.label, 'workday-my-information');
  assert.equal(meta.fieldCount, 1);
  assert.match(html, /^<!DOCTYPE html>/);
  assert.match(html, /Job Copilot captured fixture/);
  assert.match(html, /workday-my-information/);
});

test('file names are filesystem safe and identify the source host', () => {
  const name = fixtureFileName('https://acme.wd1.myworkdayjobs.com/en-US/careers/job/apply');
  assert.match(name, /^acme\.wd1\.myworkdayjobs\.com-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.html$/);
  assert.equal(/[\\/:*?"<>|]/.test(name), false);

  const frame = fixtureFileName('https://job-boards.greenhouse.io/acme/jobs/42', 'frame1');
  assert.match(frame, /^job-boards\.greenhouse\.io-frame1-/);

  // A malformed URL still produces a usable name.
  assert.match(fixtureFileName('not a url'), /^capture-/);
});

test('a profile with short or empty values does not redact unrelated text', () => {
  load('<body><form><label for="a">Province</label><input id="a" value="ON"></form><p>ON Semiconductor</p></body>');
  // Two-character values must not be used as redaction needles.
  saveProfile({ ...PROFILE, fullName: 'ON', location: '' });

  const { html } = captureFixture(document);
  assert.match(html, /ON Semiconductor/);
});
