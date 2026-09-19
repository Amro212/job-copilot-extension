import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { setPlatform } from '../../src/core/platform.js';
import { createGmHost } from '../../src/core/hosts/gm.js';
import { scanFormFields, deduplicateFields } from '../../src/core/fields/scanner.js';
import { fillFileInput } from '../../src/core/fields/fillers.js';
import { verifyField } from '../../src/core/fields/verify.js';
import { normalizeFieldsForAI } from '../../src/core/fields/normalize.js';
import { waitForResumeParsing, isResumeField } from '../../src/core/resume.js';

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

test('parser wait observes value properties and replacement nodes before settling', async () => {
  document.body.setAttribute('data-ashby-root', '');
  document.body.insertAdjacentHTML('beforeend', '<input id="name"><div role="status">Processing resume</div>');
  const original = document.querySelector('#name');
  const pending = waitForResumeParsing({ minimumMs: 0, quietMs: 40, timeoutMs: 500, pollMs: 10 });
  setTimeout(() => {
    const replacement = original.cloneNode(true);
    replacement.value = 'Parsed Applicant';
    original.replaceWith(replacement);
    document.querySelector('[role=status]').textContent = 'Done';
  }, 60);
  await pending;
  assert.equal(document.querySelector('#name').value, 'Parsed Applicant');
  assert.equal(original.isConnected, false);
});

test('a stuck parser stops the run instead of authorizing fills', async () => {
  document.body.setAttribute('data-ashby-root', '');
  document.body.insertAdjacentHTML('beforeend', '<div aria-busy="true">Parsing</div>');
  await assert.rejects(waitForResumeParsing({ minimumMs: 0, quietMs: 0, timeoutMs: 60, pollMs: 10 }), /did not settle/);
});

test('Lever analyzing-resume indicator blocks fills until it disappears', async () => {
  document.body.setAttribute('data-ashby-root', '');
  // Captured Lever markup has no ARIA loading signal.
  document.body.insertAdjacentHTML('beforeend', '<span class="resume-upload-working"><div class="loading-indicator"></div><div class="resume-upload-label">Analyzing resume...</div></span>');
  const indicator = document.querySelector('.resume-upload-working');
  setTimeout(() => { indicator.style.display = 'none'; }, 60);
  await waitForResumeParsing({ minimumMs: 0, quietMs: 0, timeoutMs: 500, pollMs: 10 });
  assert.equal(indicator.style.display, 'none');
});

test('parser wait honors cancellation and does not delay other ATS hosts', async () => {
  await waitForResumeParsing({ isCurrent: () => false });
  document.body.setAttribute('data-ashby-root', '');
  await assert.rejects(waitForResumeParsing({ isCurrent: () => false }), /cancelled/);
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

test('isResumeField identifies resume inputs and excludes cover letters and portfolios', () => {
  const resume = { type: 'file', label: 'Resume / CV', id: 'resume_file' };
  const cv = { type: 'file', label: 'Upload Curriculum Vitae', id: 'cv' };
  const coverLetter = { type: 'file', label: 'Cover Letter (Optional)', id: 'cover_letter' };
  const portfolio = { type: 'file', label: 'Portfolio or Work Sample', id: 'portfolio' };
  const ambiguous1 = { type: 'file', label: 'Attach document', id: 'doc1' };
  const ambiguous2 = { type: 'file', label: 'Attach document', id: 'doc2' };
  const allFiles = [ambiguous1, ambiguous2];

  assert.equal(isResumeField(resume), true);
  assert.equal(isResumeField(cv), true);
  assert.equal(isResumeField(coverLetter), false);
  assert.equal(isResumeField(portfolio), false);
  assert.equal(isResumeField(ambiguous1, allFiles), true);
  assert.equal(isResumeField(ambiguous2, allFiles), false);
  assert.equal(isResumeField({ type: 'text', label: 'Resume URL' }), false);
});

test('deduplicateFields renames duplicate IDs instead of throwing', () => {
  const fields = [
    { id: 'first_name', label: 'First Name' },
    { id: 'first_name', label: 'First Name Confirm' },
    { id: 'first_name', label: 'First Name Alt' },
    { id: 'last_name', label: 'Last Name' },
  ];
  deduplicateFields(fields);
  assert.equal(fields[0].id, 'first_name');
  assert.equal(fields[1].id, 'first_name_2');
  assert.equal(fields[2].id, 'first_name_3');
  assert.equal(fields[3].id, 'last_name');
});

