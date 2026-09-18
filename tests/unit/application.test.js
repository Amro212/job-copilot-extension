import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFile } from 'node:fs/promises';
import { captureJob } from '../../src/core/jobs.js';
import { createSession, restoreSession, saveSession } from '../../src/core/sessions.js';
import { rememberAnswer, recallAnswer } from '../../src/core/memory.js';
import { classifyPage } from '../../src/core/pageClassifier.js';
import { inspectValidation } from '../../src/core/validation.js';
import { findContinue } from '../../src/core/navigation.js';
import { pageSignature } from '../../src/core/navigation.js';
import { createApplicationEngine } from '../../src/core/application.js';
import { scanFormFields } from '../../src/core/fields/scanner.js';
import { saveProfile, saveSettings } from '../../src/core/storage.js';

let dom;
beforeEach(() => {
  dom = new JSDOM('<body><main></main></body>', { url: 'https://example.com/jobs/42/apply' });
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Event', 'KeyboardEvent', 'MouseEvent', 'MutationObserver']) globalThis[key] = dom.window[key];
  globalThis.CSS = { escape: value => value };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { get: () => 200 });
  HTMLElement.prototype.scrollIntoView = () => {};
  const storage = new Map();
  globalThis.GM_getValue = (key, fallback) => structuredClone(storage.has(key) ? storage.get(key) : fallback);
  globalThis.GM_setValue = (key, value) => storage.set(key, structuredClone(value));
  globalThis.GM_deleteValue = key => storage.delete(key);
  globalThis.GM_getTab = undefined;
  saveSettings({ autoContinue: true });
  saveProfile({ fullName: 'Test Applicant', email: 'test@example.com' });
});
afterEach(() => dom.window.close());
const render = html => { document.querySelector('main').innerHTML = html; };
const input = (id = 'name', label = 'Full name') => `<label for="${id}">${label}</label><input id="${id}" required>`;
const job = () => ({ title: 'Engineer', company: 'Example', listingUrl: 'https://example.com/jobs/42', applicationUrl: window.location.href });

const workflowAnswers = async fields => ({ answers: fields.map(f => ({ fieldId: f.fieldId, value: 'Applicant' })) });

// Structure observed on RBC's Phenom Apply frontend, without applicant data.
const phenomProgress = '<div role="toolbar"><li role="button" atm-id="applicationReview"><a tabindex="-1"><span stepnum="applicationReview"></span><span>Review</span></a></li></div>';

test('Phenom progress Review does not compete with the form Next button', () => {
  render(`${phenomProgress}<div class="navigation"><button id="next" type="submit">Next</button></div>`);
  assert.equal(findContinue(), document.querySelector('#next'));
});

test('progress-only Review is never used as a forward action', () => {
  render(phenomProgress);
  assert.equal(findContinue(), null);
  render('<div role="tablist"><button role="tab">Review</button></div>');
  assert.equal(findContinue(), null);
});

test('real Review actions and ordinary action toolbars remain supported', () => {
  for (const label of ['Review', 'Review Application', 'Next', 'Save and Continue', 'Continue']) {
    render(`<div role="toolbar"><button id="forward">${label}</button></div>`);
    assert.equal(findContinue(), document.querySelector('#forward'));
  }
});

test('Phenom navigation preserves disabled state, hidden filtering and real ambiguity', () => {
  render(`${phenomProgress}<button id="next" disabled>Next</button><button hidden>Next</button>`);
  assert.equal(findContinue(), document.querySelector('#next'));
  assert.equal(findContinue().disabled, true);
  document.querySelector('main').insertAdjacentHTML('beforeend', '<button>Continue</button>');
  assert.equal(findContinue(), null);
});

test('Phenom workflow clicks Next, never progress Review, then stops before submission', async () => {
  render(`<h2>My experience</h2>${phenomProgress}${input()}<button id="next" type="button">Next</button>`);
  let nextClicks = 0, progressClicks = 0, submissions = 0;
  document.querySelector('[atm-id]').onclick = () => progressClicks++;
  document.querySelector('#next').onclick = () => {
    nextClicks++;
    assert.equal(document.querySelector('#name').value, 'Applicant');
    render('<h1>Review application</h1><button>Submit application</button>');
    document.querySelector('button').onclick = () => submissions++;
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(nextClicks, 1);
    assert.equal(progressClicks, 0);
    assert.equal(submissions, 0);
    assert.equal(engine.session.completedSteps, 1);
  } finally { engine.destroy(); }
});

test('navigation pause distinguishes competing forward actions from missing controls', async () => {
  for (const [controls, expected] of [
    ['<button>Next</button><button>Continue</button>', /Multiple forward buttons found: Next, Continue/],
    [phenomProgress, /No Next or Continue button found.*progress/i],
  ]) {
    render(`${input()}${controls}`);
    const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
    try {
      await engine.start(job());
      assert.equal(engine.session.status, 'paused');
      assert.match(engine.session.reason, expected);
    } finally { engine.destroy(); }
  }
});

test('same-step validation headings and changing accessible labels finish remaining fields', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}${input('postal', 'Postal Code')}<button>Save and Continue</button>`);
  let clicks = 0, requests = 0;
  document.querySelector('#city').oninput = event => {
    document.querySelector('main').insertAdjacentHTML('afterbegin', '<h3>Errors Found</h3>');
    event.target.setAttribute('aria-label', 'City Applicant');
  };
  document.querySelector('button').onclick = () => {
    clicks++;
    assert.equal(document.querySelector('#postal').value, 'Applicant');
    render('<h1>Review application</h1>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { requests++; return workflowAnswers(fields); } });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(clicks, 1);
    assert.equal(requests, 1);
    assert.equal(engine.session.completedSteps, 1);
  } finally { engine.destroy(); }
});

test('conditional optional fields get a bounded late request within the original step', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}<button>Continue</button>`);
  document.querySelector('#city').oninput = () => {
    if (!document.querySelector('#region')) document.querySelector('button').insertAdjacentHTML('beforebegin', '<label for="region">Region</label><input id="region">');
  };
  const batches = [];
  document.querySelector('button').onclick = () => {
    assert.equal(document.querySelector('#region').value, 'Applicant');
    render('<h1>Review application</h1>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { batches.push(fields.map(f => f.fieldId)); return workflowAnswers(fields); } });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.deepEqual(batches, [['city'], ['region']]);
    assert.equal(engine.session.history.length, 1);
    assert.equal(Object.values(engine.session.steps)[0].requests, 1);
  } finally { engine.destroy(); }
});

test('temporarily disabled dependent field is filled before Continue', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}${input('postal', 'Postal Code')}<button>Continue</button>`);
  let enable, clicks = 0;
  document.querySelector('#city').oninput = () => {
    document.querySelector('#postal').disabled = true;
    enable = setTimeout(() => { document.querySelector('#postal').disabled = false; }, 40);
  };
  document.querySelector('button').onclick = () => {
    clicks++;
    assert.equal(document.querySelector('#postal').value, 'Applicant');
    render('<h1>Review application</h1>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 10, navigationTimeoutMs: 500, answer: workflowAnswers });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(clicks, 1);
    assert.equal(engine.session.history.length, 1);
  } finally { clearTimeout(enable); engine.destroy(); }
});

test('heading-only post-click change does not create a step or an extra click', async () => {
  render(`<h2>My Information</h2>${input()}<button>Continue</button>`);
  let clicks = 0;
  document.querySelector('button').onclick = () => {
    clicks++;
    document.querySelector('main').insertAdjacentHTML('afterbegin', '<h3>Errors Found</h3>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  try {
    await engine.start(job());
    assert.equal(clicks, 1);
    assert.equal(engine.session.history.length, 1);
    assert.equal(engine.session.completedSteps, 0);
    assert.match(engine.session.reason, /Continue did not change/);
  } finally { engine.destroy(); }
});

test('Resume after same-step mutation reuses primary answers and completion stays zero', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}${input('postal', 'Postal Code')}<button>Continue</button>`);
  saveSettings({ autoContinue: false });
  let requests = 0;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { requests++; return workflowAnswers(fields); } });
  document.querySelector('#city').oninput = () => engine.pause();
  try {
    await engine.start(job());
    document.querySelector('#city').oninput = null;
    document.querySelector('main').insertAdjacentHTML('afterbegin', '<h3>Errors Found</h3>');
    await engine.start();
    assert.equal(document.querySelector('#postal').value, 'Applicant');
    assert.equal(requests, 1);
    assert.equal(engine.session.history.length, 1);
    assert.equal(engine.session.completedSteps, 0);
  } finally { engine.destroy(); }
});

test('question changed during AI response never receives the old answer', async () => {
  render(`<h2>My Information</h2>${input('answer', 'City')}${input('postal', 'Postal Code')}<button>Continue</button>`);
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => {
    document.querySelector('label[for=answer]').textContent = 'Salary';
    return workflowAnswers(fields);
  } });
  try {
    await engine.start(job());
    assert.equal(document.querySelector('#answer').value, '');
    assert.equal(engine.session.status, 'paused');
    assert.match(engine.session.reason, /question.*changed|changed.*question/i);
  } finally { engine.destroy(); }
});

test('markerless conditional fields stay on one step', async () => {
  render(`${input('city', 'City')}<button>Continue</button>`);
  document.querySelector('#city').oninput = () => {
    if (!document.querySelector('#postal')) document.querySelector('button').insertAdjacentHTML('beforebegin', input('postal', 'Postal Code'));
  };
  document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(engine.session.history.length, 1);
  } finally { engine.destroy(); }
});

test('legacy workflow sessions require recapture without replaying uncertain answers', async () => {
  render(`${input()}<button>Continue</button>`);
  const legacy = createSession(job());
  delete legacy.identityVersion;
  legacy.active = true;
  legacy.status = 'running';
  legacy.history = [{ signature: 'old', url: window.location.href }];
  saveSession(legacy);
  let requests = 0;
  const engine = createApplicationEngine({ answer: async fields => { requests++; return workflowAnswers(fields); } });
  try {
    await engine.initialize();
    await engine.start();
    assert.equal(requests, 0);
    assert.equal(engine.session.status, 'paused');
    assert.match(engine.session.reason, /capture job/i);
  } finally { engine.destroy(); }
});

test('same-step asynchronous rerender settles before continuing saved answers', async () => {
  render(`<h2>My Information</h2><section id="fields">${input('city', 'City')}${input('postal', 'Postal Code')}</section><button>Continue</button>`);
  let restore;
  document.querySelector('#city').oninput = () => {
    document.querySelector('#fields').innerHTML = '';
    restore = setTimeout(() => {
      document.querySelector('#fields').innerHTML = `${input('city', 'City')}${input('postal', 'Postal Code')}`;
      document.querySelector('#city').value = 'Applicant';
    }, 40);
  };
  document.querySelector('button').onclick = () => {
    assert.equal(document.querySelector('#postal').value, 'Applicant');
    render('<h1>Review application</h1>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 10, navigationTimeoutMs: 300, answer: workflowAnswers });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(engine.session.history.length, 1);
  } finally { clearTimeout(restore); engine.destroy(); }
});

test('active step marker cannot make an empty rerender look ready', async () => {
  render(`<span aria-current="step">My Information</span><section id="fields">${input('city', 'City')}${input('postal', 'Postal Code')}</section><button>Continue</button>`);
  let restore, postalAtClick;
  document.querySelector('#city').oninput = () => {
    document.querySelector('#fields').innerHTML = '';
    restore = setTimeout(() => {
      document.querySelector('#fields').innerHTML = `${input('city', 'City')}${input('postal', 'Postal Code')}`;
      document.querySelector('#city').value = 'Applicant';
    }, 40);
  };
  document.querySelector('button').onclick = () => {
    postalAtClick = document.querySelector('#postal')?.value;
    render('<h1>Review application</h1>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 10, navigationTimeoutMs: 300, answer: workflowAnswers });
  try {
    await engine.start(job());
    assert.equal(postalAtClick, 'Applicant');
    assert.equal(engine.session.status, 'review');
  } finally { clearTimeout(restore); engine.destroy(); }
});

test('late request failure can resume without forgetting optional pending fields', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}<button>Continue</button>`);
  let lateCalls = 0;
  document.querySelector('#city').oninput = () => document.querySelector('button').insertAdjacentHTML('beforebegin', '<label for="region">Region</label><input id="region">');
  document.querySelector('button').onclick = () => {
    assert.equal(document.querySelector('#region').value, 'Applicant');
    render('<h1>Review application</h1>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => {
    if (fields.some(f => f.fieldId === 'region') && ++lateCalls === 1) throw new Error('Temporary late-field request failure');
    return workflowAnswers(fields);
  } });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'paused');
    await engine.start();
    assert.equal(lateCalls, 2);
    assert.equal(engine.session.status, 'review');
    assert.equal(engine.session.history.length, 1);
  } finally { engine.destroy(); }
});

test('dynamic field budget survives Resume and never advances unresolved additions', async () => {
  render(`<h2>My Information</h2>${input('field0', 'Question 0')}<button>Continue</button>`);
  let clicks = 0, requests = 0;
  document.querySelector('button').onclick = () => clicks++;
  document.querySelector('main').addEventListener('input', event => {
    const n = Number(event.target.id.replace('field', '')) + 1;
    if (!document.getElementById(`field${n}`)) document.querySelector('button').insertAdjacentHTML('beforebegin', input(`field${n}`, `Question ${n}`));
  });
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { requests++; return workflowAnswers(fields); } });
  try {
    await engine.start(job());
    assert.match(engine.session.reason, /Dynamic field limit/);
    await engine.start();
    assert.match(engine.session.reason, /Dynamic field limit/);
    assert.equal(requests, 3);
    assert.equal(clicks, 0);
    assert.equal(engine.session.history.length, 1);
  } finally { engine.destroy(); }
});

test('same-URL real transition during AI response discards stale answers explicitly', async () => {
  render(`<h2>My Information</h2>${input('answer', 'City')}<button>Continue</button>`);
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => {
    render(`<h2>My Experience</h2>${input('answer', 'City')}<button>Continue</button>`);
    return workflowAnswers(fields);
  } });
  try {
    await engine.start(job());
    assert.equal(document.querySelector('#answer').value, '');
    assert.equal(engine.session.status, 'paused');
    assert.match(engine.session.reason, /Page changed/);
  } finally { engine.destroy(); }
});

test('baseline disabled controls do not prevent filling actionable questions', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}<label for="country">Country</label><input id="country" disabled value="Canada"><button>Continue</button>`);
  document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
  let requests = 0;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { requests++; return workflowAnswers(fields); } });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(requests, 1);
  } finally { engine.destroy(); }
});

test('duplicate field IDs revealed during filling prevent further writes and Continue', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}${input('postal', 'Postal Code')}<button>Continue</button>`);
  document.querySelector('#city').oninput = () => document.querySelector('button').insertAdjacentHTML('beforebegin', '<input id="postal">');
  let clicks = 0;
  document.querySelector('button').onclick = () => clicks++;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  try {
    await engine.start(job());
    assert.match(engine.session.reason, /duplicate field IDs/);
    assert.equal(document.querySelector('#postal').value, '');
    assert.equal(clicks, 0);
  } finally { engine.destroy(); }
});

test('full reload after Continue counts verified advancement exactly once', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}<button>Continue</button>`);
  const first = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  document.querySelector('button').onclick = () => first.destroy(); // document unload cancels the old run
  await first.start(job());
  render('<h1>Review application</h1>');
  const restored = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  try {
    await restored.initialize();
    assert.equal(restored.session.status, 'review');
    assert.equal(restored.session.completedSteps, 1);
    await restored.start();
    assert.equal(restored.session.completedSteps, 1);
  } finally { restored.destroy(); }
});

test('conditional hiding before a section heading does not change the step', async () => {
  render(`<h3>My Information</h3>${input('city', 'City')}<h2>Address</h2>${input('postal', 'Postal Code')}<button>Continue</button>`);
  document.querySelector('#city').oninput = event => { event.target.hidden = true; };
  document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(engine.session.history.length, 1);
  } finally { engine.destroy(); }
});

test('failed primary retry cannot bless a cached answer for a changed question', async () => {
  render(`<h2>My Information</h2>${input('answer', 'Full name')}${input('other', 'Postal Code')}<button>Continue</button>`);
  rememberAnswer(createSession(job()), { label: 'Full name', type: 'text', options: [] }, { value: 'Applicant' });
  let calls = 0;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async () => {
    if (++calls === 1) throw new Error('Temporary failure');
    return { answers: [{ fieldId: 'other', value: '12345' }] };
  } });
  try {
    await engine.start(job());
    document.querySelector('label[for=answer]').textContent = 'Salary';
    await engine.start();
    assert.equal(document.querySelector('#answer').value, '');
    assert.equal(Object.values(engine.session.steps)[0].answers.answer, undefined);
  } finally { engine.destroy(); }
});

test('Resume accepts markerless replacement and fills the current page', async () => {
  render(`${input('city', 'City')}<button>Continue</button>`);
  saveSettings({ autoContinue: false });
  let calls = 0;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { calls++; return workflowAnswers(fields); } });
  try {
    await engine.start(job());
    render(`${input('new', 'Unrelated question')}<button>Continue</button>`);
    await engine.start();
    assert.equal(calls, 2);
    assert.equal(engine.session.history.length, 2);
    assert.equal(document.querySelector('#new').value, 'Applicant');
  } finally { engine.destroy(); }
});

test('Workday language selection with dynamic aria-label fills proficiency and continues', async () => {
  render('<h2>My Experience</h2><label for="language">Language</label><button id="language" type="button" aria-label="Language Select One" aria-haspopup="listbox" aria-controls="options">Select One</button>' + input('reading', 'Reading') + '<button id="next" type="button">Save and Continue</button>');
  const button = document.querySelector('#language');
  button.onclick = () => {
    document.querySelector('#options')?.remove();
    document.querySelector('main').insertAdjacentHTML('beforeend', '<div id="options" role="listbox"><div role="option">English</div></div>');
    document.querySelector('[role=option]').onclick = () => {
      button.textContent = 'English';
      button.setAttribute('aria-label', 'Language English');
      document.querySelector('#options').remove();
    };
  };
  let reading;
  document.querySelector('#next').onclick = () => {
    reading = document.querySelector('#reading').value;
    render('<h1>Review application</h1>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => ({ answers: fields.map(f => ({ fieldId: f.fieldId, value: f.fieldId === 'language' ? 'English' : 'Fluent' })) }) });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(reading, 'Fluent');
    assert.equal(engine.session.history.length, 1);
  } finally { engine.destroy(); }
});

test('transient listbox search controls do not become late applicant questions', async () => {
  render(`<h2>My Information</h2>${input('city', 'City')}<button>Continue</button>`);
  document.querySelector('#city').oninput = () => document.querySelector('main').insertAdjacentHTML('beforeend', '<div role="listbox"><label for="search">Search options</label><input id="search"></div>');
  document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
  const batches = [];
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { batches.push(fields.map(f => f.fieldId)); return workflowAnswers(fields); } });
  try {
    await engine.start(job());
    assert.deepEqual(batches, [['city']]);
    assert.equal(engine.session.status, 'review');
  } finally { engine.destroy(); }
});

for (const changedBy of ['self', 'later field']) {
  test(`question changed by ${changedBy} during filling pauses before Continue`, async () => {
    render(`<h2>My Information</h2>${input('city', 'City')}${input('postal', 'Postal Code')}<button>Continue</button>`);
    let clicks = 0;
    document.querySelector(changedBy === 'self' ? '#city' : '#postal').oninput = () => {
      document.querySelector('label[for=city]').textContent = 'Salary';
    };
    document.querySelector('button').onclick = () => clicks++;
    const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
    try {
      await engine.start(job());
      assert.equal(clicks, 0);
      assert.match(engine.session.reason, /question.*changed/i);
    } finally { engine.destroy(); }
  });
}

test('captures JSON-LD JobPosting and an explicit application link', () => {
  render('<h1>Engineer</h1><a href="/apply/42">Apply now</a><script type="application/ld+json">{"@type":"JobPosting","title":"Engineer","hiringOrganization":{"name":"Example"},"description":"<p>Build useful software.</p>","identifier":{"value":"42"}}</script>');
  const captured = captureJob();
  assert.equal(captured.company, 'Example');
  assert.equal(captured.description, 'Build useful software.');
  assert.equal(captured.applicationUrl, 'https://example.com/apply/42');
});
test('session restores exact known URLs, not unrelated applications on the same host', async () => {
  const session = createSession(job());
  session.answers.example = { value: 'kept' };
  session.pendingUrl = 'https://example.com/jobs/42/step2';
  saveSession(session);
  assert.equal((await restoreSession(session.pendingUrl)).id, session.id);
  assert.equal((await restoreSession(window.location.href)).answers.example.value, 'kept');
  assert.equal(await restoreSession('https://example.com/jobs/99/apply'), null);
});
test('common memory reuses verified profile answers while narratives stay application-specific', () => {
  const a = createSession(job());
  const b = createSession({ ...job(), listingUrl: 'https://example.com/jobs/99' });
  const common = { label: 'Full name', type: 'text', options: [] };
  const narrative = { label: 'Why this company?', type: 'textarea', options: [] };
  rememberAnswer(a, common, { value: 'Test Applicant', inferred: false });
  rememberAnswer(a, narrative, { value: 'Company-specific reason', inferred: false });
  assert.equal(recallAnswer(b, common).value, 'Test Applicant');
  assert.equal(recallAnswer(b, narrative), null);
  saveProfile({ fullName: 'Different Person' });
  assert.equal(recallAnswer(b, common), null);
});
test('required, native and ARIA errors map to their owning field', () => {
  render('<label for="email">Email</label><input id="email" type="email" required value="invalid" aria-invalid="true" aria-describedby="error"><p id="error" role="alert">Use a company email.</p>');
  const errors = inspectValidation(scanFormFields());
  assert.equal(errors[0].fieldId, 'email');
  assert.match(errors[0].message, /company email/);
});
test('final submit cannot become a Continue candidate', () => {
  render('<h1>Review application</h1><button>Submit application</button>');
  assert.equal(classifyPage().type, 'review');
  assert.equal(findContinue(), null);
});
test('hidden boundaries do not pause, visible legal attestations do', () => {
  render(`${input()}<div hidden>Assessment</div><button>Continue</button>`);
  assert.equal(classifyPage().type, 'application');
  render(`${input()}<label><input type="checkbox">I certify that all information is accurate</label><button>Continue</button>`);
  assert.equal(classifyPage().type, 'boundary');
});
test('engine repairs server rejection, advances two steps and stops before submit', async () => {
  render(`${input('answer', 'Describe your skills')}<p id="error" hidden role="alert"></p><button type="button">Continue</button>`);
  let clicks = 0, submitted = false, primary = 0, repairs = 0;
  document.querySelector('button').onclick = () => {
    clicks++;
    if (document.querySelector('input').value !== 'Accepted answer') {
      document.querySelector('input').setAttribute('aria-invalid', 'true');
      document.querySelector('input').setAttribute('aria-describedby', 'error');
      document.querySelector('#error').hidden = false;
      document.querySelector('#error').textContent = 'Answer needs more detail';
    } else {
      render(`${input('email', 'Email')}<button type="button">Review</button>`);
      document.querySelector('button').onclick = () => {
        render('<h1>Review application</h1><button>Submit application</button>');
        document.querySelector('button').onclick = () => { submitted = true; };
      };
    }
  };
  document.querySelector('input').oninput = () => {
    document.querySelector('input').removeAttribute('aria-invalid');
    document.querySelector('#error').hidden = true;
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async (fields, context) => {
    if (context.repairErrors?.length) repairs++; else primary++;
    return { answers: fields.map(f => ({ fieldId: f.fieldId, value: context.repairErrors?.length ? 'Accepted answer' : f.fieldId === 'email' ? 'test@example.com' : 'Short', inferred: false })) };
  }});
  await engine.start(job());
  assert.equal(engine.session.status, 'review');
  assert.equal(submitted, false);
  assert.equal(primary, 2);
  assert.equal(repairs, 1);
  assert.equal(clicks, 2);
  assert.ok(engine.session.errors.some(e => e.fieldId === 'answer'));
  engine.destroy();
});
test('background CAPTCHA does not block filling; assessment still pauses', async () => {
  render(`<iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe>${input()}<button>Continue</button>`);
  let calls = 0;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { calls++; return { answers: fields.map(f => ({ fieldId: f.fieldId, value: 'Test Applicant' })) }; } });
  document.querySelector('button').onclick = () => render('<h1>Skills assessment</h1><label>Answer<input required></label><button>Continue</button>');
  await engine.start(job());
  assert.equal(engine.session.status, 'boundary');
  assert.equal(document.querySelector('input').value, '');
  assert.equal(calls, 1);
  engine.destroy();
});

test('CAPTCHA response controls are never offered as applicant fields', () => {
  render(`${input()}<textarea name="g-recaptcha-response"></textarea><div class="h-captcha"><input name="challenge-answer"></div>`);
  assert.deepEqual(scanFormFields().map(f => f.id), ['name']);
});
test('unchanged pages have bounded navigation attempts and no repeat primary request', async () => {
  render(`${input()}<button type="button">Continue</button>`);
  let calls = 0, clicks = 0;
  document.querySelector('button').onclick = () => clicks++;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { calls++; return { answers: fields.map(f => ({ fieldId: f.fieldId, value: 'Name' })) }; } });
  await engine.start(job());
  await engine.tick();
  assert.equal(calls, 1);
  assert.equal(clicks, 1);
  assert.equal(engine.session.status, 'paused');
  engine.destroy();
});

test('failed persistence never advances even when rejected text remains nonempty', async () => {
  render(`${input()}<button type="button">Continue</button>`);
  let clicks = 0;
  document.querySelector('input').oninput = e => { e.target.value = 'Wrong value'; };
  document.querySelector('button').onclick = () => clicks++;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => ({ answers: fields.map(f => ({ fieldId: f.fieldId, value: 'Expected value' })) }) });
  await engine.start(job());
  assert.equal(clicks, 0);
  assert.equal(engine.session.status, 'paused');
  assert.match(engine.session.reason, /limit/);
  engine.destroy();
});
test('hidden required controls are never filled', async () => {
  render(`${input()}<section hidden><label for="secret">Private hidden field</label><input id="secret" required></section><button type="button">Continue</button>`);
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => ({ answers: fields.map(f => ({ fieldId: f.fieldId, value: 'Expected value' })) }) });
  await engine.start(job());
  assert.equal(document.querySelector('#secret').value, '');
  engine.destroy();
});
test('pause during AI request prevents delayed writes and navigation', async () => {
  render(`${input()}<button>Continue</button>`);
  let release;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: () => new Promise(resolve => { release = resolve; }) });
  const pending = engine.start(job());
  while (!release) await new Promise(resolve => setTimeout(resolve, 1));
  engine.pause();
  release({ answers: [{ fieldId: 'name', value: 'Late answer' }] });
  await pending;
  assert.equal(document.querySelector('input').value, '');
  assert.equal(engine.session.status, 'paused');
  engine.destroy();
});
test('review stays manual when Auto Submit is off', async () => {
  saveSettings({ autoContinue: true, autoSubmit: false });
  render('<h1>Review application</h1><button>Submit application</button>');
  let clicks = 0;
  document.querySelector('button').onclick = () => clicks++;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, submitCountdownMs: 0 });
  await engine.start(job());
  assert.equal(engine.session.status, 'review');
  assert.equal(clicks, 0);
  engine.destroy();
});

test('Auto Submit clicks a single unambiguous submit after a zero countdown', async () => {
  saveSettings({ autoContinue: true, autoSubmit: true });
  render('<h1>Review application</h1><button id="submit">Submit application</button>');
  let clicks = 0;
  document.querySelector('#submit').onclick = () => {
    clicks++;
    render('<h1>Application submitted</h1><p>Thank you for applying.</p>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, submitCountdownMs: 0 });
  await engine.start(job());
  assert.equal(clicks, 1);
  assert.equal(engine.session.status, 'confirmation');
  engine.destroy();
});

test('Auto Submit is cancelled by Pause during the countdown', async () => {
  saveSettings({ autoContinue: true, autoSubmit: true });
  render('<h1>Review application</h1><button id="submit">Submit application</button>');
  let clicks = 0;
  document.querySelector('#submit').onclick = () => clicks++;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, submitCountdownMs: 2000 });
  const pending = engine.start(job());
  await new Promise(resolve => setTimeout(resolve, 50));
  engine.pause();
  await pending;
  assert.equal(clicks, 0);
  engine.destroy();
});

test('Auto Submit does not fire when two submit controls exist', async () => {
  saveSettings({ autoContinue: true, autoSubmit: true });
  render('<h1>Review application</h1><button>Submit application</button><button>Submit</button>');
  let clicks = 0;
  document.querySelectorAll('button').forEach(el => { el.onclick = () => clicks++; });
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, submitCountdownMs: 0 });
  await engine.start(job());
  assert.equal(clicks, 0);
  engine.destroy();
});

test('Auto Continue off fills without clicking', async () => {
  saveSettings({ autoContinue: false });
  render(`${input()}<button type="button">Continue</button>`);
  let clicks = 0;
  document.querySelector('button').onclick = () => clicks++;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async () => ({ answers: [{ fieldId: 'name', value: 'Test Applicant' }] }) });
  await engine.start(job());
  assert.equal(document.querySelector('input').value, 'Test Applicant');
  assert.equal(clicks, 0);
  engine.destroy();
});
test('required upload and disabled Continue prevent navigation', () => {
  render('<input type="file" required><button disabled>Continue</button>');
  const errors = inspectValidation([], findContinue());
  assert.equal(errors.length, 2);
  assert.ok(errors.every(e => e.fieldId === null));
});
test('ambiguous navigation controls require manual action', () => {
  render('<button>Next</button><button>Continue</button>');
  assert.equal(findContinue(), null);
});
test('boundary appearing during AI request prevents filling', async () => {
  render(input());
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async () => {
    document.querySelector('main').insertAdjacentHTML('afterbegin', '<h1>Identity verification</h1>');
    return { answers: [{ fieldId: 'name', value: 'Test Applicant' }] };
  } });
  await engine.start(job());
  assert.equal(document.querySelector('input').value, '');
  assert.equal(engine.session.status, 'boundary');
  engine.destroy();
});
test('full document reload restores active session and saved answers without a primary request', async () => {
  render(`${input()}<button>Continue</button>`);
  let requests = 0;
  const options = { settleMs: 0, transitionMs: 0, answer: async () => { requests++; return { answers: [{ fieldId: 'name', value: 'Test Applicant' }] }; } };
  const first = createApplicationEngine(options);
  await first.start(job());
  const id = first.session.id;
  first.session.active = true;
  first.session.status = 'running';
  saveSession(first.session);
  first.destroy();
  render(`${input()}<button>Continue</button>`);
  document.querySelector('button').onclick = () => render('<h1>Review application</h1><button>Submit application</button>');
  const restored = createApplicationEngine(options);
  await restored.initialize();
  assert.equal(restored.session.id, id);
  assert.equal(restored.session.status, 'review');
  assert.equal(requests, 1);
  restored.destroy();
});
test('real multi-step fixture reaches review after a semantic rejection', async () => {
  const fixture = await readFile(new URL('../../fixtures/phase3-application-fixture.html', import.meta.url), 'utf8');
  const fixtureDom = new JSDOM(fixture, { url: 'https://example.com/fixture?scenario=validation&step=1', runScripts: 'dangerously' });
  dom.window.close(); dom = fixtureDom;
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Event', 'KeyboardEvent', 'MouseEvent', 'MutationObserver']) globalThis[key] = dom.window[key];
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { get: () => 200 });
  let repairs = 0;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async (fields, context) => {
    if (context.repairErrors?.length) repairs++;
    return { answers: fields.map(f => ({ fieldId: f.fieldId, value: f.fieldId === 'email' ? 'test@example.com' : f.fieldId === 'fullName' ? 'Test Applicant' : 'I have built accessible web applications using my documented software skills.' })) };
  } });
  await engine.start(job());
  assert.equal(engine.session.status, 'review');
  assert.equal(repairs, 1);
  assert.equal(new URL(window.location.href).searchParams.get('step'), 'review');
  engine.destroy();
});

test('visible inline errors map to a unique field container without ARIA linkage', () => {
  render('<div class="form-group"><label for="name">Full name</label><input id="name" value="Name"><span class="error-message">Enter your full legal name</span></div>');
  const errors = inspectValidation(scanFormFields());
  assert.equal(errors.length, 1);
  assert.equal(errors[0].fieldId, 'name');
});
test('captured jobs with unknown company mark uncertainty explicitly', () => {
  render('<h1>Engineer</h1><article>Job description: Build useful software.</article>');
  const captured = captureJob();
  assert.equal(captured.companyUncertain, true);
  assert.equal(captured.company, '');
});
test('inferred and incompatible answers never become global memory', () => {
  const a = createSession(job()), b = createSession({ ...job(), listingUrl: 'https://example.com/jobs/99' });
  const field = { label: 'Full name', type: 'text', options: [] };
  rememberAnswer(a, field, { value: 'Guess', inferred: true });
  assert.equal(recallAnswer(b, field), null);
  const choice = { label: 'Availability', type: 'select', options: [{ value: 'now', label: 'Now' }] };
  rememberAnswer(a, choice, { value: 'now' });
  assert.equal(recallAnswer(a, { ...choice, options: [{ value: 'later', label: 'Later' }] }), null);
});

test('Resume retries a failed primary instead of advancing unanswered optional fields', async () => {
  render('<label for="essay">Describe your experience</label><textarea id="essay"></textarea><button type="button">Continue</button>');
  let requests = 0;
  document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async () => {
    if (++requests === 1) throw new Error('Temporary network failure');
    return { answers: [{ fieldId: 'essay', value: 'Grounded answer' }] };
  } });
  await engine.start(job());
  assert.equal(engine.session.status, 'paused');
  await engine.start();
  assert.equal(requests, 2);
  assert.equal(engine.session.status, 'review');
  assert.ok(Object.values(engine.session.answers).some(a => a.value === 'Grounded answer'));
  engine.destroy();
});
test('tab-bound recent navigation recovers a same-application POST redirect only', async () => {
  const session = createSession({ ...job(), applicationUrl: 'https://example.com/apply/42/step1' });
  session.active = true;
  session.pendingUrl = 'https://example.com/apply/42/step1';
  session.pendingAt = Date.now();
  saveSession(session);
  globalThis.GM_getTab = callback => callback({ jobCopilotSession: session.id });
  assert.equal((await restoreSession('https://example.com/apply/42/step2'))?.id, session.id);
  assert.equal(await restoreSession('https://example.com/apply/99/step2'), null);
  assert.equal(await restoreSession('https://other.example/apply/42/step2'), null);
  session.pendingAt = Date.now() - 180000;
  saveSession(session);
  assert.equal(await restoreSession('https://example.com/apply/42/step2'), null);
});

test('unexpected step change during a field action pauses instead of filling the previous step', async () => {
  render(`${input()}<button>Continue</button>`);
  document.querySelector('input').oninput = () => {
    window.history.replaceState({}, '', '/apply/autofillWithResume');
    render('<h1>Autofill with Resume</h1><input id="resume" type="file">');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async () => ({ answers: [{ fieldId: 'name', value: 'Applicant' }] }) });
  await engine.start(job());
  assert.equal(engine.session.status, 'paused');
  assert.match(engine.session.reason, /Page changed while filling/);
  engine.destroy();
});

test('button selection text in aria-labelledby does not change the question or step', () => {
  render('<h3>Application Questions</h3><label id="question" for="answer">Are you authorized?</label><button id="answer" type="button" aria-haspopup="listbox" aria-labelledby="question answer">Select One</button>');
  const before = scanFormFields();
  assert.equal(before[0].label, 'Are you authorized?');
  document.querySelector('button').textContent = 'Yes';
  const after = scanFormFields();
  assert.equal(after[0].label, before[0].label);
  assert.equal(pageSignature(after), pageSignature(before));
});

test('header language/settings controls stay outside applicant fields', () => {
  document.body.insertAdjacentHTML('afterbegin', '<header><button id="language" aria-haspopup="listbox">English</button></header>');
  render(input());
  assert.deepEqual(scanFormFields().map(f => f.id), ['name']);
});

test('same-URL steps with reused fields are distinguished by h3 heading', () => {
  render(`<h3>My Information</h3>${input()}`);
  const before = pageSignature(scanFormFields());
  document.querySelector('h3').textContent = 'My Experience';
  assert.notEqual(pageSignature(scanFormFields()), before);
});

test('Workday-style self-labelled button fills remaining fields and auto-continues to next same-URL step', async () => {
  render('<h3>Application Questions</h3><label id="question" for="answer">Are you authorized?</label><button id="answer" type="button" aria-haspopup="listbox" aria-controls="options" aria-labelledby="question answer">Select One</button>' + input('detail', 'Relevant experience') + '<button id="next" type="button">Save and Continue</button>');
  const button = document.querySelector('#answer');
  button.onclick = () => {
    document.querySelector('#options')?.remove();
    const menu = document.createElement('div'); menu.id = 'options'; menu.setAttribute('role', 'listbox');
    menu.innerHTML = '<div role="option">Yes</div><div role="option">No</div>';
    document.querySelector('main').append(menu);
    menu.querySelectorAll('[role=option]').forEach(option => option.onclick = () => { button.textContent = option.textContent; menu.remove(); });
  };
  document.querySelector('#next').onclick = () => {
    assert.equal(document.querySelector('#detail').value, 'Grounded response');
    render(`<h3>Next step</h3>${input('email', 'Email')}<button type="button">Review</button>`);
    document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
  };
  let calls = 0;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => {
    calls++;
    return { answers: fields.map(f => ({ fieldId: f.fieldId, value: f.fieldId === 'answer' ? 'Yes' : f.fieldId === 'email' ? 'test@example.com' : 'Grounded response' })) };
  } });
  await engine.start(job());
  assert.equal(engine.session.status, 'review');
  assert.equal(calls, 2);
  engine.destroy();
});

test('slow save disables Continue temporarily, then next step fills automatically', async () => {
  render(`${input()}<button type="button">Save and Continue</button>`);
  let clicks = 0, requests = 0, load;
  document.querySelector('button').onclick = e => {
    clicks++; e.target.disabled = true;
    // Reproduce a save taking longer than the previous fixed post-click delay.
    load = setTimeout(() => {
      render(`<h3>Next step</h3>${input('email', 'Email')}<button type="button">Review</button>`);
      document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
    }, 100);
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 10, navigationTimeoutMs: 1000, answer: async fields => {
    requests++; return { answers: fields.map(f => ({ fieldId: f.fieldId, value: 'Applicant' })) };
  } });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(requests, 2);
    assert.equal(clicks, 1);
    assert.equal(engine.session.errors.length, 0);
  } finally { clearTimeout(load); engine.destroy(); }
});

test('Continue enabling after field validation is awaited without AI repair', async () => {
  render(`${input()}<button type="button" disabled>Continue</button>`);
  let enable, requests = 0;
  document.querySelector('input').oninput = () => { enable = setTimeout(() => { document.querySelector('button').disabled = false; }, 100); };
  document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 10, navigationTimeoutMs: 1000, answer: async () => { requests++; return { answers: [{ fieldId: 'name', value: 'Applicant' }] }; } });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(requests, 1);
    assert.equal(engine.session.errors.length, 0);
  } finally { clearTimeout(enable); engine.destroy(); }
});

test('permanently disabled Continue times out without clicks or repair budget consumption', async () => {
  render(`${input()}<button disabled>Continue</button>`);
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 10, navigationTimeoutMs: 80, answer: async () => ({ answers: [{ fieldId: 'name', value: 'Applicant' }] }) });
  await engine.start(job());
  assert.equal(engine.session.status, 'paused');
  assert.match(engine.session.reason, /page.*button.*disabled/i);
  assert.equal(Object.values(engine.session.steps)[0].repairs, 0);
  assert.equal(Object.values(engine.session.steps)[0].clicks, 0);
  engine.destroy();
});

test('Pause interrupts navigation waiting without another click or AI call', async () => {
  render(`${input()}<button>Continue</button>`);
  let clicks = 0, requests = 0, stop;
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 10, navigationTimeoutMs: 1000, answer: async () => { requests++; return { answers: [{ fieldId: 'name', value: 'Applicant' }] }; } });
  document.querySelector('button').onclick = e => {
    clicks++; e.target.disabled = true;
    stop = setTimeout(() => engine.pause(), 20);
  };
  try {
    await engine.start(job());
    assert.equal(engine.session.reason, 'Paused by user.');
    assert.equal(clicks, 1);
    assert.equal(requests, 1);
  } finally { clearTimeout(stop); engine.destroy(); }
});

test('next page fields wait for aria-busy rendering to finish', async () => {
  render(`${input()}<button>Continue</button>`);
  let finish, calls = 0;
  document.querySelector('button').onclick = () => {
    render('<section aria-busy="true"><h3>Next step</h3><span>Loading</span></section>');
    finish = setTimeout(() => {
      render(`<h3>Next step</h3>${input('email', 'Email')}<button>Review</button>`);
      document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
    }, 150);
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 10, navigationTimeoutMs: 1000, answer: async fields => { calls++; return { answers: fields.map(f => ({ fieldId: f.fieldId, value: 'Applicant' })) }; } });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(calls, 2);
    assert.equal(engine.session.history.length, 2);
  } finally { clearTimeout(finish); engine.destroy(); }
});

test('Pause acts as a hard quit without tampering with filled fields or forgetting memory', async () => {
  render(`${input('name', 'Full name')}${input('phone', 'Phone')}<button>Continue</button>`);
  let requests = 0;
  const engine = createApplicationEngine({
    settleMs: 50,
    answer: async () => {
      requests++;
      return {
        answers: [
          { fieldId: 'name', value: 'Jane Doe' },
          { fieldId: 'phone', value: '555-123-4567' },
        ],
      };
    },
  });

  const startPromise = engine.start(job());
  let checks = 0;
  while ((!document.querySelector('#name').value || Object.keys(engine.session.answers).length === 0) && checks < 50) {
    await new Promise(r => setTimeout(r, 10));
    checks++;
  }
  assert.equal(document.querySelector('#name').value, 'Jane Doe');

  engine.pause();
  await startPromise;

  assert.equal(engine.session.status, 'paused');
  assert.equal(engine.session.reason, 'Paused by user.');
  assert.equal(document.querySelector('#name').value, 'Jane Doe');
  const rememberedKeys = Object.keys(engine.session.answers);
  assert.ok(rememberedKeys.length > 0, 'Remembered answer exists in session');
  assert.ok(rememberedKeys.some(k => engine.session.answers[k].value === 'Jane Doe'));
  const step = Object.values(engine.session.steps)[0];
  assert.ok(step.answers.name, 'Step answers include name');
  assert.equal(step.answers.name.value, 'Jane Doe');

  engine.destroy();
});


test('same-heading replacement after Continue advances and ignores upload success alert', async () => {
  render(`<h1>Engineer application</h1>${input('city', 'City')}<button>Continue</button>`);
  let calls = 0;
  document.querySelector('button').onclick = () => {
    render(`<h1>Engineer application</h1><div role="alert">Resume.pdf successfully uploaded</div>${input('education', 'Education')}<button>Continue</button>`);
    document.querySelector('button').onclick = () => render('<h1>Review application</h1>');
  };
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: async fields => { calls++; return workflowAnswers(fields); } });
  try {
    await engine.start(job());
    assert.equal(engine.session.status, 'review');
    assert.equal(calls, 2);
    assert.equal(engine.session.completedSteps, 2);
  } finally { engine.destroy(); }
});

test('upload success alerts are informational but error alerts still block', () => {
  render('<div role="alert">Resume.pdf successfully uploaded</div>');
  assert.deepEqual(inspectValidation([]), []);
  render('<div role="alert">That email is already registered.</div>');
  assert.equal(inspectValidation([]).length, 1);
  render('<div role="alert">Upload failed. Please try again.</div>');
  assert.equal(inspectValidation([]).length, 1);
});

test('described required-field guidance is not a validation error for a filled field', () => {
  render('<label for="name">Name</label><input id="name" required value="Applicant" aria-describedby="help"><div id="help">Required. Please enter your full name.</div>');
  assert.deepEqual(inspectValidation(scanFormFields()), []);
});

test('Resume with a shared heading fills a replacement form without recapture', async () => {
  render(`<h1>Engineer application</h1>${input('city', 'City')}<button>Continue</button>`);
  saveSettings({ autoContinue: false });
  const engine = createApplicationEngine({ settleMs: 0, transitionMs: 0, answer: workflowAnswers });
  try {
    await engine.start(job());
    render(`<h1>Engineer application</h1>${input('education', 'Education')}<button>Continue</button>`);
    await engine.start();
    assert.equal(document.querySelector('#education').value, 'Applicant');
    assert.equal(engine.session.history.length, 2);
    assert.equal(engine.session.completedSteps, 0);
  } finally { engine.destroy(); }
});
