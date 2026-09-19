import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { scanFormFields, harvestComboboxOptions } from '../../src/core/fields/scanner.js';
import { normalizeFieldsForAI } from '../../src/core/fields/normalize.js';
import { fillField } from '../../src/core/fields/fillers.js';
import { verifyField } from '../../src/core/fields/verify.js';
import { readComboboxSelection, setComboboxSearch, waitForComboboxOptions } from '../../src/core/fields/combobox.js';
import { saveProfile, saveApiKey } from '../../src/core/storage.js';
import { generateAutofillAnswers } from '../../src/core/ai.js';
import { createFieldAgent } from '../../src/core/agent.js';
import { inspectValidation } from '../../src/core/validation.js';

let dom;
function boot(ats) {
  dom = new JSDOM(readFileSync(new URL(`../../fixtures/${ats}-hardening-fixture.html`, import.meta.url), 'utf8'), {
    url: `https://jobs.${ats === 'lever' ? 'lever.co' : 'ashbyhq.com'}/example/apply`, runScripts: 'dangerously', pretendToBeVisual: true,
  });
  for (const key of ['window', 'document', 'location', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Event', 'KeyboardEvent', 'MouseEvent', 'MutationObserver']) globalThis[key] = dom.window[key];
  globalThis.CSS = { escape: value => value };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 200 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 20 });
  HTMLElement.prototype.scrollIntoView = () => {};
  const values = new Map();
  globalThis.GM_getValue = (key, fallback) => values.has(key) ? values.get(key) : fallback;
  globalThis.GM_setValue = (key, value) => values.set(key, structuredClone(value));
  saveProfile({ location: 'Toronto, Ontario, Canada', linkedin: 'https://linkedin.com/in/example', pronouns: 'He/him' });
  saveApiKey('test-key');
}
afterEach(() => dom?.window.close());

test('Lever custom questions retain their real labels and pronouns have one identity', () => {
  boot('lever');
  const fields = scanFormFields();
  for (const label of ['Where do you live? (City and State/Province)', 'What is your desired total compensation range for this role?', 'LinkedIn Link', 'Pronouns']) assert.ok(fields.some(f => f.label === label), label);
  assert.equal(new Set(fields.map(f => f.id)).size, fields.length);
  const pronouns = fields.filter(f => f.label === 'Pronouns');
  assert.equal(pronouns.length, 1);
  assert.equal(pronouns[0].type, 'radio');
  assert.equal(pronouns[0].options.length, 11);
});

test('Lever location searches on keydown and commits the real backing location', async () => {
  boot('lever');
  const field = scanFormFields().find(f => f.type === 'combobox');
  await harvestComboboxOptions([field]);
  assert.deepEqual(field.options.map(o => o.label), ['Toronto, ON, CAN']);
  assert.equal(await fillField(field, 'Toronto, ON, CAN'), true);
  assert.equal(JSON.parse(document.querySelector('[name=selectedLocation]').value).name, 'Toronto, ON, CAN');
  assert.equal((await verifyField(field, 'Toronto, ON, CAN')).verified, true);
  document.querySelector('[name=selectedLocation]').value = '';
  assert.deepEqual(readComboboxSelection(field.element), []);
});

test('Lever pronouns clear siblings and custom mode reflects explicit profile only', async () => {
  boot('lever');
  const field = scanFormFields().find(f => f.label === 'Pronouns');
  assert.ok(field);
  document.querySelectorAll('.standardPronounsOption').forEach(el => { el.checked = true; });
  assert.equal(await fillField(field, 'He/him'), true);
  assert.equal(document.querySelectorAll('#candidatePronounsCheckboxes input:checked').length, 1);
  assert.equal((await verifyField(field, 'She/her')).verified, false);
  saveProfile({ pronouns: 'ze/zir' });
  const custom = scanFormFields().find(f => f.label === 'Pronouns');
  assert.ok(custom.options.some(o => o.label === 'ze/zir'));
  assert.equal(await fillField(custom, 'ze/zir'), true);
  assert.equal(document.querySelector('#customPronounsTextField').value, 'ze/zir');
  assert.equal((await verifyField(custom, 'ze/zir')).verified, true);
});

test('Ashby yes/no is a required single choice with unanswered distinct from No', async () => {
  boot('ashby');
  let fields = scanFormFields();
  const field = fields.find(f => f.id === 'authorization');
  assert.ok(field);
  assert.equal(field.type, 'radio');
  assert.equal(field.required, true);
  assert.match(field.label, /legally authorized/);
  assert.equal(field.currentValue, '');
  assert.equal(fields.some(f => f.label === 'Option'), false);
  assert.equal(await fillField(field, 'No'), true);
  assert.equal((await verifyField(field, 'No')).verified, true);
  assert.equal((await verifyField(field, 'Yes')).verified, false);
  fields = scanFormFields();
  assert.equal(fields.find(f => f.id === 'authorization').currentValue, 'No');
  assert.equal(document.body.dataset.submissions, '0');
});

test('Ashby search text is not committed and IDs come from the owning field', async () => {
  boot('ashby');
  const fields = scanFormFields();
  const field = fields.find(f => f.id === '_systemfield_location');
  assert.ok(field);
  assert.equal(field.required, true);
  setComboboxSearch(field.element, 'Toronto');
  assert.deepEqual(readComboboxSelection(field.element), []);
  await harvestComboboxOptions([field]);
  assert.equal(field.element.value, '');
  assert.equal(await fillField(field, 'Toronto, ON, CAN'), true);
  assert.equal(document.body.dataset.acceptedLocation, 'Toronto, ON, CAN');
  assert.equal((await verifyField(field, 'Toronto, ON, CAN')).verified, true);
});

test('correct questions reach AI and explicit short profile answers replace irrelevant prose', async () => {
  boot('lever');
  let sent;
  globalThis.GM_xmlhttpRequest = options => {
    sent = JSON.parse(JSON.parse(options.data).messages.at(-1).content).fieldsToFill;
    options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: sent.map(f => ({ fieldId: f.fieldId, value: 'An unrelated paragraph about my experience.' })) }) } }] }) });
  };
  const fields = normalizeFieldsForAI(scanFormFields().filter(f => f.type !== 'combobox'));
  const { answers } = await generateAutofillAnswers(fields);
  for (const [label, expected] of [['Where do you live? (City and State/Province)', 'Toronto, Ontario, Canada'], ['LinkedIn Link', 'https://linkedin.com/in/example'], ['Pronouns', 'He/him']]) {
    const field = sent.find(f => f.label === label);
    assert.ok(field, label);
    assert.equal(answers.find(a => a.fieldId === field.fieldId)?.value, expected);
  }
});

test('frame agent rejects duplicate IDs before requesting answers', async () => {
  boot('lever');
  document.querySelector('main').innerHTML = '<label>First<input id="duplicate"></label><label>Second<input id="duplicate"></label>';
  await assert.rejects(createFieldAgent().handle({ action: 'scan' }), /duplicate field/i);
});

test('native choices reject partial matches and verification checks the requested option', async () => {
  boot('lever');
  document.querySelector('main').innerHTML = '<label>Choice<select id="choice"><option value="">Choose</option><option value="a">Alpha</option><option value="b">Alphabet</option></select></label>';
  const [field] = scanFormFields();
  assert.equal(await fillField(field, 'Alph'), false);
  assert.equal(await fillField(field, 'Alpha'), true);
  assert.equal((await verifyField(field, 'Alphabet')).verified, false);
});

test('Ashby committed No passes required validation and ordinary checkbox IDs stay distinct', async () => {
  boot('ashby');
  const field = scanFormFields().find(f => f.id === 'authorization');
  await fillField(field, 'No');
  assert.equal(inspectValidation(scanFormFields()).filter(e => e.fieldId === 'authorization').length, 0);
  document.querySelector('main').insertAdjacentHTML('beforeend', '<div class="ashby-application-form-field-entry" data-field-path="interests"><label class="ashby-application-form-question-title">Interests</label><label><input type="checkbox" id="interest-a">A</label><label><input type="checkbox" id="interest-b">B</label></div>');
  const fields = scanFormFields().filter(f => f.type === 'checkbox');
  assert.deepEqual(fields.map(f => f.id), ['interest-a', 'interest-b']);
  assert.deepEqual(fields.map(f => f.label), ['A', 'B']);
});

test('existing Ashby input is preserved without falsely verifying it as committed', async () => {
  boot('ashby');
  const input = document.querySelector('[role=combobox]');
  input.value = 'Ottawa, Ontario, Canada';
  const result = await createFieldAgent().handle({ action: 'scan' });
  assert.equal(result.fields.some(f => f.fieldId === '_systemfield_location'), false);
  assert.equal(input.value, 'Ottawa, Ontario, Canada');
  assert.deepEqual(readComboboxSelection(input), []);
});

test('frame rerender replaces group option nodes and changed questions reject stale answers', async () => {
  boot('ashby');
  document.querySelector('[role=combobox]').closest('.ashby-application-form-field-entry').remove();
  const agent = createFieldAgent();
  await agent.handle({ action: 'scan' });
  const original = document.querySelector('.ashby-application-form-input-yesno');
  const replacement = original.cloneNode(true);
  original.replaceWith(replacement);
  replacement.querySelectorAll('button').forEach(button => button.addEventListener('click', () => replacement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed',String(b === button)))));
  const { results } = await agent.handle({ action: 'fill', answers: [{ fieldId: 'authorization', value: 'No' }] });
  assert.equal(results[0].status, 'verified');
  replacement.parentElement.querySelector('label').textContent = 'Different question';
  const changed = await agent.handle({ action: 'fill', answers: [{ fieldId: 'authorization', value: 'Yes' }] });
  assert.equal(changed.results[0].status, 'failed');
  assert.equal(replacement.querySelector('[data-option=no]').getAttribute('aria-pressed'), 'true');
});

test('Lever does not accept old suggestions before its debounced result refresh', async () => {
  boot('lever');
  const input = document.querySelector('.location-input');
  document.querySelector('.dropdown-container').style.display = 'block';
  document.querySelector('.dropdown-results').innerHTML = '<div class="dropdown-location">Toronto, ON, CAN</div>';
  setComboboxSearch(input, 'Toronto');
  assert.deepEqual(await waitForComboboxOptions(input, 350), []);
  input.value = 'Ottawa';
  assert.deepEqual(await waitForComboboxOptions(input, 100), []);
  assert.equal(input.value, 'Ottawa');
});

test('unset pronouns override model guesses and partial native options are rejected at AI boundary', async () => {
  boot('lever');
  saveProfile({ pronouns: '' });
  globalThis.GM_xmlhttpRequest = options => options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers: [{ fieldId: 'candidatePronounsCheckboxes', value: 'He/him' }, { fieldId: 'select', value: 'Alph' }] }) } }] }) });
  const pronouns = normalizeFieldsForAI(scanFormFields().filter(f => f.label === 'Pronouns'));
  const { answers } = await generateAutofillAnswers([...pronouns, { fieldId: 'select', type: 'select', label: 'Choice', options: [{ value: 'alpha', label: 'Alpha' }] }]);
  assert.equal(answers.find(a => a.fieldId === 'candidatePronounsCheckboxes').value, '');
  assert.equal(answers.some(a => a.fieldId === 'select'), false);
});
