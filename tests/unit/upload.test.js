import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { setPlatform } from '../../src/core/platform.js';
import { createGmHost } from '../../src/core/hosts/gm.js';
import { scanFormFields } from '../../src/core/fields/scanner.js';
import { fillFileInput } from '../../src/core/fields/fillers.js';
import { verifyField } from '../../src/core/fields/verify.js';
import { normalizeFieldsForAI } from '../../src/core/fields/normalize.js';

let dom;

function boot() {
  if (dom) dom.window.close();
  dom = new JSDOM(`<body>
    <label for="resume">Resume</label>
    <input id="resume" name="resume" type="file" accept=".pdf" required>
  </body>`, { url: 'https://example.com/apply', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'File', 'Event', 'Element']) {
    globalThis[key] = dom.window[key];
  }
  globalThis.CSS = { escape: (value) => value };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 200 });
  HTMLElement.prototype.scrollIntoView = () => {};
}

beforeEach(boot);
afterEach(() => {
  setPlatform(createGmHost());
  dom?.window.close();
});

test('scanner includes file inputs instead of skipping them', () => {
  const fields = scanFormFields();
  assert.equal(fields.length, 1);
  assert.equal(fields[0].type, 'file');
  assert.match(fields[0].label, /resume/i);
});

test('file fields are omitted from the AI payload', () => {
  const payload = normalizeFieldsForAI(scanFormFields());
  assert.equal(payload.length, 0);
});

test('fillFileInput attaches the stored resume and verify checks the filename', async () => {
  const host = createGmHost();
  host.capabilities = { ...host.capabilities, fileUpload: true };
  const bytes = new Uint8Array([37, 80, 68, 70]);
  await host.documentsPut({ name: 'Amro-Resume.pdf', type: 'application/pdf', buffer: bytes.buffer });
  setPlatform(host);

  if (typeof dom.window.DataTransfer !== 'function') {
    class FakeDataTransfer {
      constructor() { this.items = { add(file) { this._file = file; } }; }
      get files() { return this.items._file ? [this.items._file] : []; }
    }
    globalThis.DataTransfer = FakeDataTransfer;
    dom.window.DataTransfer = FakeDataTransfer;
  }

  const input = document.getElementById('resume');
  const ok = await fillFileInput(input);
  assert.equal(ok, true);
  assert.equal(input.files[0].name, 'Amro-Resume.pdf');
  const verified = await verifyField({ type: 'file', element: input }, 'Amro-Resume.pdf');
  assert.equal(verified.verified, true);
  assert.equal(verified.actualValue, 'Amro-Resume.pdf');
});
