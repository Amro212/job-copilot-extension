import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { detectAdapter } from '../../src/core/adapters/index.js';
import { extractLabel } from '../../src/core/fields/labels.js';
import { scanFormFields } from '../../src/core/fields/scanner.js';
import { fillCombobox, fillField } from '../../src/core/fields/fillers.js';
import { findContinue, observePage } from '../../src/core/navigation.js';
import { saveProfile } from '../../src/core/storage.js';

let dom;
function boot(html, url) {
  if (dom) dom.window.close();
  dom = new JSDOM(html, { url, runScripts: 'dangerously', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Event', 'KeyboardEvent', 'MouseEvent', 'MutationObserver']) {
    globalThis[key] = dom.window[key];
  }
  globalThis.CSS = { escape: (value) => value };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 200 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 20 });
  HTMLElement.prototype.scrollIntoView = () => {};
  const storage = new Map();
  globalThis.GM_getValue = (key, fallback) => storage.has(key) ? storage.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => storage.set(key, structuredClone(value));
  globalThis.GM_deleteValue = (key) => storage.delete(key);
  saveProfile({ fullName: 'Test Applicant', email: 'test@example.com', location: 'Toronto, Ontario, Canada' });
}

afterEach(() => dom?.window.close());

test('unknown hosts keep the generic fallback', () => {
  boot('<main><label for="n">Name</label><input id="n"></main>', 'https://example.com/apply');
  const adapter = detectAdapter();
  assert.equal(adapter.id, 'generic');
  assert.equal(adapter.fieldMetadata(document.querySelector('#n')), null);
  assert.deepEqual(adapter.choiceGroups(document), []);
  const fields = scanFormFields();
  assert.equal(fields[0].label, 'Name');
});

test('Workday, Greenhouse, Lever and Ashby hostnames are detected', () => {
  assert.equal(detectAdapter({ hostname: 'acme.myworkdayjobs.com' }, { querySelector: () => null }).id, 'workday');
  assert.equal(detectAdapter({ hostname: 'boards.greenhouse.io' }, { querySelector: () => null }).id, 'greenhouse');
  assert.equal(detectAdapter({ hostname: 'jobs.lever.co' }, { querySelector: () => null }).id, 'lever');
  assert.equal(detectAdapter({ hostname: 'jobs.ashbyhq.com' }, { querySelector: () => null }).id, 'ashby');
});

test('Workday step identity and Continue come from data-automation-id', async () => {
  const html = await readFile(new URL('../../fixtures/workday-application-fixture.html', import.meta.url), 'utf8');
  boot(html, 'https://acme.myworkdayjobs.com/en-US/job/apply');
  assert.equal(detectAdapter().id, 'workday');
  const fields = scanFormFields();
  const page = observePage(fields);
  assert.equal(page.marker, 'My Information');
  const control = findContinue();
  assert.equal(control.getAttribute('data-automation-id'), 'bottom-navigation-next-button');
  assert.equal(control.disabled, true);
});

test('Workday dropdown Escape rolls back, fillCombobox never sends Escape', async () => {
  const html = await readFile(new URL('../../fixtures/workday-application-fixture.html', import.meta.url), 'utf8');
  boot(html, 'https://acme.myworkdayjobs.com/en-US/job/apply');
  const input = document.getElementById('country');
  const canada = [...document.querySelectorAll('[data-automation-id="promptOption"]')].find((el) => el.textContent.includes('Canada'));
  canada.click();
  assert.equal(input.value, 'Canada');
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(input.value, '');

  const keys = [];
  document.addEventListener('keydown', (event) => keys.push(event.key));
  const field = scanFormFields().find((f) => f.id === 'country' || f.element === input);
  assert.ok(field);
  field.options = [{ value: 'Canada', label: 'Canada' }, { value: 'United States', label: 'United States' }];
  const ok = await fillCombobox(input, 'Canada', field.options);
  assert.equal(ok, true);
  assert.equal(input.value, 'Canada');
  assert.equal(keys.includes('Escape'), false);
});

test('Lever uppercase section headers are not used as field labels', async () => {
  const html = await readFile(new URL('../../fixtures/lever-application-fixture.html', import.meta.url), 'utf8');
  boot(html, 'https://jobs.lever.co/acme/abc');
  assert.equal(detectAdapter().id, 'lever');
  const location = document.querySelector('input.location-input');
  const label = extractLabel(location);
  assert.notEqual(label.toUpperCase(), 'LOCATION');
  assert.notEqual(label.toUpperCase(), 'PERSONAL INFORMATION');
  assert.notEqual(label, 'Full name');
  const fields = scanFormFields();
  const name = fields.find((f) => f.id === 'name' || f.element.id === 'name');
  assert.ok(name);
  assert.notEqual(name.label.toUpperCase(), 'PERSONAL INFORMATION');
  assert.match(name.label, /full name/i);
  const locField = fields.find((f) => f.element === location);
  assert.equal(locField.type, 'combobox');
});

test('Greenhouse Places location is a combobox whose .pac-item can be filled', async () => {
  const html = await readFile(new URL('../../fixtures/greenhouse-application-fixture.html', import.meta.url), 'utf8');
  boot(html, 'https://boards.greenhouse.io/acme/jobs/1');
  assert.equal(detectAdapter().id, 'greenhouse');
  const fields = scanFormFields();
  const location = fields.find((f) => f.element.id === 'job_application_location');
  assert.ok(location);
  assert.equal(location.type, 'combobox');
  location.options = location.options.length ? location.options : [
    { value: 'Toronto, ON, Canada', label: 'Toronto, ON, Canada' },
    { value: 'Toronto, OH, USA', label: 'Toronto, OH, USA' },
  ];
  const ok = await fillField(location, 'Toronto, ON, Canada');
  assert.equal(ok, true);
  assert.equal(location.element.value, 'Toronto, ON, Canada');
});

test('Ashby custom select is scanned and a revealed section is a new field', async () => {
  const html = await readFile(new URL('../../fixtures/ashby-application-fixture.html', import.meta.url), 'utf8');
  boot(html, 'https://jobs.ashbyhq.com/acme/role');
  assert.equal(detectAdapter().id, 'ashby');
  const before = scanFormFields();
  const source = before.find((f) => f.element.classList.contains('ashby-select-input'));
  assert.ok(source);
  assert.equal(source.type, 'combobox');
  source.options = [
    { value: 'LinkedIn', label: 'LinkedIn' },
    { value: 'Company website', label: 'Company website' },
  ];
  assert.equal(await fillField(source, 'LinkedIn'), true);
  assert.equal(source.element.value, 'LinkedIn');
  assert.equal(before.some((f) => f.id === 'referral'), false);
  document.querySelector('input[name="work_auth"][value="Yes"]').click();
  document.querySelector('input[name="work_auth"][value="Yes"]').dispatchEvent(new Event('change', { bubbles: true }));
  const after = scanFormFields();
  assert.ok(after.some((f) => f.id === 'referral'));
});
