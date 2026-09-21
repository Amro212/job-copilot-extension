import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { summarizeFieldResults } from '../../src/core/ui.js';

test('field report uses current detected fields as its single source of truth', () => {
  const fields = [
    { id: 'verified' },
    { id: 'inferred' },
    { id: 'skipped' },
    { id: 'late' },
  ];
  const results = new Map([
    ['verified', { status: 'verified' }],
    ['inferred', { status: 'inferred', inferred: true }],
    ['skipped', { status: 'skipped' }],
    ['no-longer-detected', { status: 'failed' }],
  ]);

  const report = summarizeFieldResults(fields, results);

  assert.equal(report.total, 4);
  assert.equal(report.filled, 2);
  assert.equal(report.failed.length, 0);
  assert.equal(report.untouched.length, 2);
});

test('workflow shows verified completion count and retained structural diagnostic', async () => {
  const bundle = await build({ entryPoints: ['src/targets/userscript/entry.js'], bundle: true, format: 'iife', write: false });
  const dom = new JSDOM('<body></body>', { url: 'https://example.com/apply', runScripts: 'dangerously' });
  const storage = new Map([
    ['jc:sessions', ['diagnostic']],
    ['jc:sessions:diagnostic', {
      id: 'diagnostic', identityVersion: 2, active: false, status: 'paused', reason: 'Paused',
      currentUrl: 'https://example.com/apply', job: { title: 'Example' }, steps: {}, answers: {},
      history: [{}, {}, {}], completedSteps: 1,
      lastPageChange: { stage: 'field action', fieldId: 'language', change: 'same', beforeFields: 18, afterFields: 19, added: ['reading'], navigationClick: false },
    }],
  ]);
  dom.window.GM_getValue = (key, fallback) => storage.get(key) ?? fallback;
  dom.window.GM_setValue = (key, value) => storage.set(key, value);
  dom.window.CSS = { escape: value => value };
  try {
    dom.window.eval(bundle.outputFiles[0].text);
    await new Promise(resolve => setTimeout(resolve, 30));
    const root = dom.window.document.querySelector('#job-copilot-root').shadowRoot;
    root.querySelector('#jc-toggle-btn').click();
    assert.match(root.textContent, /1\s+step completed/);
    assert.equal(root.querySelector('[data-tab=review]'), null);
    const tabs = Array.from(root.querySelectorAll('.jc-tab-btn')).map(btn => btn.getAttribute('data-tab'));
    assert.deepEqual(tabs, ['home', 'profile', 'settings', 'debug']);
    root.querySelector('[data-tab=debug]').click();
    assert.match(root.textContent, /Last Workflow Change/);
    assert.match(root.textContent, /"fieldId": "language"/);
    assert.match(root.textContent, /"navigationClick": false/);
  } finally { dom.window.close(); }
});

test('profile sections save and reload explicit answers while preserving legacy context', async () => {
  const bundle = await build({ entryPoints: ['src/targets/userscript/entry.js'], bundle: true, format: 'iife', write: false });
  const dom = new JSDOM('<body></body>', { url: 'https://example.com/apply', runScripts: 'dangerously' });
  const storage = new Map([['jc:profile', { fullName: 'Test Applicant', resumeContext: 'Existing detailed resume', applicantNotes: 'Existing custom notes', futureField: 'preserve' }]]);
  dom.window.GM_getValue = (key, fallback) => storage.get(key) ?? fallback;
  dom.window.GM_setValue = (key, value) => storage.set(key, value);
  dom.window.GM_getTab = callback => callback({});
  dom.window.GM_saveTab = () => {};
  dom.window.CSS = { escape: value => value };
  try {
    dom.window.eval(bundle.outputFiles[0].text);
    await new Promise(resolve => setTimeout(resolve, 30));
    const root = dom.window.document.querySelector('#job-copilot-root').shadowRoot;
    root.querySelector('#jc-toggle-btn').click();
    root.querySelector('[data-tab=profile]').click();
    const values = { workCountry: 'Canada', workAuthorization: 'Yes', sponsorshipNow: 'No', sponsorshipFuture: 'Yes', workArrangement: 'Remote', willingToRelocate: 'No', travelAvailability: 'Up to 25%', startDate: '2026-10-01', noticePeriod: 'Two weeks', expectedSalary: '95000', salaryCurrency: 'CAD', salaryPeriod: 'Annual', educationLevel: "Bachelor's degree", yearsExperience: '3', languages: 'English, French', gender: 'Woman', pronouns: 'she/her', raceEthnicity: 'Prefer not to answer', disabilityStatus: 'Prefer not to answer', veteranStatus: 'No' };
    for (const [name, value] of Object.entries(values)) {
      const input = root.querySelector(`[name=${name}]`);
      assert.ok(input, `${name} has a control`);
      assert.ok(input.labels.length, `${name} has an accessible label`);
      input.value = value;
    }
    root.querySelector('#jc-profile-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    for (const [name, value] of Object.entries(values)) assert.equal(storage.get('jc:profile')[name], value, name);
    assert.equal(storage.get('jc:profile').resumeContext, 'Existing detailed resume');
    assert.equal(storage.get('jc:profile').applicantNotes, 'Existing custom notes');
    assert.equal(storage.get('jc:profile').futureField, 'preserve');
    root.querySelector('[data-tab=settings]').click();
    root.querySelector('[data-tab=profile]').click();
    for (const [name, value] of Object.entries(values)) assert.equal(root.querySelector(`[name=${name}]`).value, value, name);
    assert.match(root.textContent, /LinkedIn/);
    assert.equal(dom.window.localStorage.length, 0);
  } finally { dom.window.close(); }
});

test('bundled panel mounts once and captures a job using GM storage', async () => {
  const bundle = await build({ entryPoints: ['src/targets/userscript/entry.js'], bundle: true, format: 'iife', write: false });
  const dom = new JSDOM('<body><main><h1>Software Engineer</h1><article>Job description: Build useful software.</article><a href="/apply/42">Apply now</a></main></body>', { url: 'https://example.com/jobs/42', runScripts: 'dangerously' });
  const storage = new Map();
  storage.set('jc:secrets', { apiKey: 'fixture-stored-secret' });
  dom.window.GM_getValue = (key, fallback) => storage.get(key) ?? fallback;
  dom.window.GM_setValue = (key, value) => storage.set(key, value);
  dom.window.GM_getTab = callback => callback({});
  dom.window.GM_saveTab = () => {};
  dom.window.CSS = { escape: value => value };
  try {
    dom.window.eval(bundle.outputFiles[0].text);
    await new Promise(resolve => setTimeout(resolve, 30));
    const root = dom.window.document.querySelector('#job-copilot-root');
    assert.ok(root?.shadowRoot, 'Persistent Shadow DOM panel mounts');
    root.shadowRoot.querySelector('#jc-toggle-btn').click();
    root.shadowRoot.querySelector('#jc-capture-job').click();
    assert.match(root.shadowRoot.textContent, /Software Engineer/);
    assert.match(root.shadowRoot.textContent, /Company unknown \(uncertain\)/);
    assert.equal(storage.get('jc:job').applicationUrl, 'https://example.com/apply/42');
    assert.equal(storage.get('jc:sessions').length, 1);
    assert.ok(root.shadowRoot.querySelector('#jc-pause-autofill-btn'), 'Pause autofill button is present');
    assert.ok(root.shadowRoot.querySelector('#jc-pause-application'), 'Pause application button is present');
    root.shadowRoot.querySelector('[data-tab=settings]').click();
    assert.equal(root.shadowRoot.querySelector('#jc-api-key-input').value, '');
    assert.equal(root.shadowRoot.innerHTML.includes('fixture-stored-secret'), false);
    root.shadowRoot.querySelector('#jc-settings-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    assert.equal(storage.get('jc:secrets').apiKey, 'fixture-stored-secret');
    assert.equal(root.shadowRoot.querySelector('[name=autoContinue]').checked, true);
    assert.equal(root.shadowRoot.querySelector('[name=autoSubmit]').disabled, false);
    assert.equal(root.shadowRoot.querySelector('[name=autoSubmit]').checked, false);
    assert.equal(dom.window.document.querySelectorAll('#job-copilot-root').length, 1);
  } finally { dom.window.close(); }
});

test('settings export downloads portable backup without the API key', async () => {
  const bundle = await build({ entryPoints: ['src/targets/userscript/entry.js'], bundle: true, format: 'iife', write: false });
  const dom = new JSDOM('<body></body>', { url: 'https://example.com/apply', runScripts: 'dangerously' });
  const storage = new Map();
  storage.set('jc:profile', { fullName: 'Export Me' });
  storage.set('jc:secrets', { apiKey: 'fixture-stored-secret' });
  dom.window.GM_getValue = (key, fallback) => storage.get(key) ?? fallback;
  dom.window.GM_setValue = (key, value) => storage.set(key, value);
  dom.window.GM_getTab = (callback) => callback({});
  dom.window.GM_saveTab = () => {};
  dom.window.CSS = { escape: (value) => value };
  let exportText = '';
  dom.window.Blob = class {
    constructor(parts) {
      exportText = parts.join('');
    }
  };
  dom.window.URL.createObjectURL = () => 'blob:fixture';
  dom.window.URL.revokeObjectURL = () => {};
  try {
    dom.window.eval(bundle.outputFiles[0].text);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const root = dom.window.document.querySelector('#job-copilot-root').shadowRoot;
    root.querySelector('#jc-toggle-btn').click();
    root.querySelector('[data-tab=settings]').click();
    assert.ok(root.querySelector('#jc-export-data'));
    root.querySelector('#jc-export-data').click();
    const parsed = JSON.parse(exportText);
    assert.equal(parsed.kind, 'job-copilot-backup');
    assert.equal(parsed.data['jc:profile'].fullName, 'Export Me');
    assert.equal(exportText.includes('fixture-stored-secret'), false);
    assert.equal(dom.window.document.querySelectorAll('#job-copilot-root').length, 1);
  } finally {
    dom.window.close();
  }
});

test('userscript yields when the extension panel root is already present', async () => {
  const bundle = await build({ entryPoints: ['src/targets/userscript/entry.js'], bundle: true, format: 'iife', write: false });
  const dom = new JSDOM(
    '<body><div id="job-copilot-root" data-jc-host="extension"></div></body>',
    { url: 'https://example.com/apply', runScripts: 'dangerously' },
  );
  const storage = new Map();
  dom.window.GM_getValue = (key, fallback) => storage.get(key) ?? fallback;
  dom.window.GM_setValue = (key, value) => storage.set(key, value);
  dom.window.GM_getTab = (callback) => callback({});
  dom.window.GM_saveTab = () => {};
  dom.window.CSS = { escape: (value) => value };
  try {
    dom.window.eval(bundle.outputFiles[0].text);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const root = dom.window.document.querySelector('#job-copilot-root');
    assert.equal(root.getAttribute('data-jc-host'), 'extension');
    assert.equal(root.shadowRoot, null);
    assert.equal(dom.window.document.querySelectorAll('#job-copilot-root').length, 1);
  } finally {
    dom.window.close();
  }
});
