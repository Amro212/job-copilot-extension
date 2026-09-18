import { captureJob, safeUrl } from './jobs.js';
import { createSession, restoreSession, saveSession, bindTab } from './sessions.js';
import { classifyPage, isVisible } from './pageClassifier.js';
import { inspectValidation } from './validation.js';
import { findContinue, inspectContinue, pageSignature, isDisabled, observePage, comparePages, workflowLabel, questionIdentity } from './navigation.js';
import { rememberAnswer, recallAnswer } from './memory.js';
import { getSettings } from './storage.js';
import { scanFormFields as scanAllFields, harvestComboboxOptions } from './fields/scanner.js';
import { normalizeFieldsForAI } from './fields/normalize.js';
import { fillField } from './fields/fillers.js';
import { verifyField } from './fields/verify.js';
import { generateAutofillAnswers } from './ai.js';
import { resolveComboboxSearchAnswers } from './autofill.js';
import { logger } from './debug.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const scanPageFields = () => scanAllFields().filter(f => isVisible(f.element) && f.element.type !== 'file' && !f.element.closest('[role=listbox],.select__menu')).map(f => ({ ...f, label: workflowLabel(f) }));
const scanFormFields = () => scanPageFields().filter(f => !f.element.disabled && !f.element.readOnly);
const empty = field => field.type === 'checkbox' ? !field.element.checked : !String(field.currentValue ?? '').trim();
const runnable = new Set(['running', 'captcha', 'waiting']);

export function createApplicationEngine({ answer = generateAutofillAnswers, onChange = () => {}, settleMs = 180, transitionMs = 1200, navigationTimeoutMs = transitionMs === 0 ? 0 : 10000 } = {}) {
  let session = null, busy = false, generation = 0, timer = null, observer = null, interval = null, cancelDelay = null;
  const delay = ms => new Promise(resolve => {
    let t = null;
    cancelDelay = () => { clearTimeout(t); cancelDelay = null; resolve(); };
    t = setTimeout(() => { cancelDelay = null; resolve(); }, ms);
  });
  const results = new Map();
  let lastEmission = '';
  let lastObservationLog = '';
  function compatibleSession() {
    if (session.identityVersion === 2) return true;
    status('paused', 'Step tracking was updated. Click Capture Job once to start a compatible session.');
    return false;
  }
  function completeStep() {
    const step = session.steps[session.currentStep];
    if (step && !step.completed) {
      step.completed = true;
      session.completedSteps++;
      session.pendingStep = '';
      session.pendingUrl = '';
      saveSession(session);
    }
  }
  function checkPage(snapshot, token, stage, fieldId) {
    if (!guard(token)) return false;
    const current = observePage(scanPageFields());
    const change = comparePages(snapshot, current);
    const detail = {
      stage, fieldId, change, urlChanged: snapshot.url !== current.url,
      markerChanged: snapshot.marker !== current.marker, headingChanged: snapshot.heading !== current.heading,
      beforeFields: snapshot.fields.length, afterFields: current.fields.length,
      added: current.fields.filter(f => !snapshot.fields.some(old => old.id === f.id)).map(f => f.id),
      removed: snapshot.fields.filter(f => !current.fields.some(next => next.id === f.id)).map(f => f.id),
      questionsChanged: current.fields.filter(f => snapshot.fields.some(old => old.id === f.id && old.question !== f.question)).map(f => f.id),
      navigationClick: false,
    };
    const observationKey = JSON.stringify([snapshot, current]);
    if (JSON.stringify(snapshot) !== JSON.stringify(current) && observationKey !== lastObservationLog) {
      lastObservationLog = observationKey;
      session.lastPageChange = detail;
      logger[change === 'same' ? 'info' : 'warn'](`Workflow page observation changed: ${JSON.stringify(detail)}`);
    }
    if (change === 'same') return true;
    status('paused', stage === 'field action' && change === 'changed'
      ? 'Page changed while filling a field. Inspect the current step before resuming.'
      : `Page changed or became ambiguous during ${stage}. Inspect the current step before resuming.`);
    return false;
  }
  async function settleFields(snapshot, token, stage = 'form settling', fieldId) {
    const deadline = Date.now() + navigationTimeoutMs;
    let previous = '', stableSince = Date.now();
    do {
      if (!guard(token)) return false;
      const fields = scanPageFields();
      if (new Set(fields.map(f => f.id)).size !== fields.length) {
        status('paused', 'Ambiguous duplicate field IDs. Fill this page manually.');
        return false;
      }
      const change = comparePages(snapshot, observePage(fields));
      if (change === 'changed') return checkPage(snapshot, token, stage, fieldId);
      const state = JSON.stringify(fields.map(f => [f.id, questionIdentity(f), f.element.disabled, f.element.readOnly]));
      if (state !== previous) { previous = state; stableSince = Date.now(); }
      const loading = Array.from(document.querySelectorAll('[aria-busy="true"]')).some(isVisible);
      const questions = session.steps[session.currentStep]?.questions || {};
      if (fields.some(f => Object.hasOwn(questions, f.id) && questions[f.id] !== questionIdentity(f))) {
        checkPage(snapshot, token, stage, fieldId);
        if (!guard(token)) return false;
        status('paused', 'A question or its options changed. Inspect the page before resuming.');
        return false;
      }
      const disabled = fields.some(f => f.element.disabled &&
        (!snapshot.fields.find(old => old.id === f.id)?.disabled || Object.hasOwn(questions, f.id) && empty(f)));
      if (change === 'same' && !loading && !disabled && Date.now() - stableSince >= Math.min(settleMs, 200)) return checkPage(snapshot, token, stage, fieldId);
      if (Date.now() >= deadline) break;
      await delay(Math.min(50, Math.max(1, deadline - Date.now())));
    } while (true);
    if (checkPage(snapshot, token, stage, fieldId)) status('paused', 'Form fields are still changing or disabled. Inspect the page before resuming.');
    return false;
  }
  function validation(fields = scanFormFields(), control = null) {
    const errors = inspectValidation(fields, control);
    for (const field of fields) {
      const result = results.get(field.id);
      if (result?.status === 'failed' && String(result.value) === String(field.currentValue) && !errors.some(e => e.fieldId === field.id)) {
        errors.push({ fieldId: field.id, message: result.error, kind: 'persistence' });
      }
    }
    return errors;
  }
  function emit() {
    const state = JSON.stringify([session, busy, [...results]]);
    if (state === lastEmission) return;
    lastEmission = state;
    onChange({ session, busy, results, classification: classifyPage() });
  }
  function status(value, reason) {
    if (session.status === value && session.reason === reason) return;
    session.status = value;
    session.reason = reason;
    if (!runnable.has(value)) session.active = false;
    saveSession(session);
    emit();
  }
  function guard(token) {
    if (token !== generation || !session?.active) return false;
    const page = classifyPage();
    if (['captcha', 'boundary', 'review', 'confirmation'].includes(page.type)) {
      status(page.type, page.reason);
      return false;
    }
    return true;
  }
  async function waitForNavigation(signature, token, afterClick) {
    const deadline = Date.now() + navigationTimeoutMs;
    let lastSignature = '', stableSince = Date.now();
    const stableMs = Math.min(transitionMs, 200);
    status('running', afterClick ? 'Waiting for the next page to finish loading.' : 'Waiting for the page Continue button to become ready.');
    logger.info(`Navigation wait: ${afterClick ? 'after click' : 'button readiness'}, timeout=${navigationTimeoutMs}ms`);
    do {
      if (!guard(token)) {
        if (afterClick && token === generation && ['review', 'confirmation'].includes(session.status)) completeStep();
        return 'stopped';
      }
      const fields = scanFormFields();
      const current = observePage(scanPageFields());
      const state = JSON.stringify(current);
      if (state !== lastSignature) { lastSignature = state; stableSince = Date.now(); }
      const change = comparePages(signature, current, afterClick);
      const busy = Array.from(document.querySelectorAll('[aria-busy="true"]')).some(isVisible);
      const control = findContinue();
      if (!busy && Date.now() - stableSince >= stableMs) {
        if (change === 'changed' && fields.length) {
          logger.info(`Navigation wait: next step ready, ${fields.length} fields`);
          if (afterClick) completeStep();
          session.currentStep = '';
          return 'changed';
        }
        if (change === 'same') {
          if (inspectValidation(fields).length) return 'validation';
          if (!afterClick && control && !isDisabled(control)) return 'ready';
        }
      }
      if (Date.now() >= deadline) break;
      await delay(Math.min(100, Math.max(1, deadline - Date.now())));
    } while (true);
    logger.warn(`Navigation wait timed out: buttonDisabled=${isDisabled(findContinue())}, path=${window.location.pathname}`);
    return 'timeout';
  }
  function pauseDisabledButton() {
    status('paused', `The page's Continue button stayed disabled after waiting ${navigationTimeoutMs / 1000}s. Auto Continue is still on; inspect the page before resuming.`);
  }
  async function applyAnswers(fields, answers, token, signature) {
    const byId = new Map(answers.map(a => [a.fieldId, a]));
    for (const original of fields) {
      if (!await settleFields(signature, token, 'before field action', original.id)) return false;
      const field = scanFormFields().find(f => f.id === original.id && f.label === original.label && f.type === original.type);
      const entry = byId.get(original.id);
      if (!entry || entry.value === '' || entry.value == null) continue;
      const replacement = scanFormFields().find(f => f.id === original.id);
      const question = session.steps[session.currentStep]?.questions[original.id];
      if (replacement && (!field || question && question !== questionIdentity(replacement))) {
        status('paused', 'A question or its options changed. Inspect the page before resuming.');
        return false;
      }
      if (!field) continue; // A conditional question can disappear on this step.
      field.options = original.options;
      field.element.scrollIntoView?.({ block: 'center', behavior: 'instant' });
      const filled = await fillField(field, entry.value);
      await delay(settleMs);
      if (!await settleFields(signature, token, 'field action', field.id)) return false;
      const live = scanFormFields().find(f => f.id === field.id && f.label === field.label);
      const verified = filled && live ? await verifyField(live, entry.value) : { verified: false };
      // Phase 2's generic verifier only checks non-empty values. Workflow requires exact persistence.
      let exact = !['text', 'textarea', 'email', 'tel', 'url', 'number', 'contenteditable'].includes(field.type) || String(verified.actualValue ?? '').trim() === String(entry.value).trim();
      if (['select', 'radio'].includes(field.type)) exact = field.options.some(o => (String(o.value) === String(entry.value) || o.label === String(entry.value)) && String(o.value) === String(verified.actualValue));
      const valid = verified.verified && exact && !inspectValidation([live]).some(error => error.fieldId === live.id);
      results.set(field.id, { status: valid ? entry.inferred ? 'inferred' : 'verified' : 'failed', value: verified.actualValue ?? '', inferred: Boolean(entry.inferred), error: valid ? '' : 'Value rejected or failed verification.' });
      if (valid) rememberAnswer(session, field, entry);
      saveSession(session);
      emit();
    }
    return true;
  }
  async function request(fields, context, token, signature) {
    if (!guard(token)) return [];
    await harvestComboboxOptions(fields);
    if (!await settleFields(signature, token, 'option harvesting')) return [];
    let response = await answer(normalizeFieldsForAI(fields), { jobContext: session.job, ...context });
    if (!await settleFields(signature, token, 'AI response')) return [];
    if (response.answers.some(a => a.searchQuery)) response = await resolveComboboxSearchAnswers(fields, response);
    if (!await settleFields(signature, token, 'option search')) return [];
    return response.answers;
  }
  async function repair(errors, step, token, signature) {
    if (step.repairs >= 2) { status('paused', 'Repair limit reached (2/2). Review errors and resume manually.'); return false; }
    step.repairs++;
    session.errors.push(...errors.map(error => ({ ...error, attempt: step.repairs, url: window.location.href, at: new Date().toISOString() })));
    session.errors = session.errors.slice(-100);
    status('running', `Repair ${step.repairs}/2: ${errors.map(e => e.message).join(' ').slice(0, 250)}`);
    const targets = scanFormFields().filter(f => errors.some(e => e.fieldId === f.id));
    if (!targets.length) { status('paused', 'Validation needs manual input: ' + errors.map(e => e.message).join(' ').slice(0, 250)); return false; }
    const previous = targets.map(f => ({ fieldId: f.id, ...(step.answers[f.id] || recallAnswer(session, f) || {}) })).filter(a => a.value != null);
    if (!await applyAnswers(targets, previous, token, signature)) return false;
    let remaining = validation();
    if (remaining.some(e => e.fieldId)) {
      const rejected = scanFormFields().filter(f => remaining.some(e => e.fieldId === f.id));
      const repaired = await request(rejected, { repairErrors: remaining, allowSearch: false }, token, signature);
      for (const entry of repaired) step.answers[entry.fieldId] = entry;
      if (!await applyAnswers(rejected, repaired, token, signature)) return false;
      remaining = validation();
    } else if (errors.some(e => e.kind === 'semantic')) {
      // A server error can disappear on input even though the old semantic answer is still rejected.
      const repaired = await request(targets, { repairErrors: errors, allowSearch: false }, token, signature);
      for (const entry of repaired) step.answers[entry.fieldId] = entry;
      if (!await applyAnswers(targets, repaired, token, signature)) return false;
    }
    return guard(token);
  }
  async function tick() {
    if (busy || !session?.active || !runnable.has(session.status)) return;
    if (!compatibleSession()) return;
    busy = true;
    const token = generation;
    try {
      for (let pass = 0; pass < 40; pass++) {
        if (!guard(token)) return;
        if (!getSettings().autofillEnabled) { status('paused', 'AI Autofill is disabled in Settings.'); return; }
        const page = classifyPage();
        if (page.type !== 'application') { status('paused', page.reason); return; }
        const fields = scanFormFields();
        const signature = observePage(scanPageFields());
        if (new Set(fields.map(f => f.id)).size !== fields.length) { status('paused', 'Ambiguous duplicate field IDs. Fill this page manually.'); return; }
        session.currentUrl = window.location.href;
        session.pendingUrl = '';
        let step = session.steps[session.currentStep];
        if (!step || comparePages(step.observation, signature) !== 'same') {
          session.currentStep = pageSignature(scanPageFields());
          step = session.steps[session.currentStep];
          // A shared page heading must not reuse answers or retry state from another form.
          if (step && comparePages(step.observation, signature) !== 'same') {
            session.currentStep += JSON.stringify(signature.fields.map(f => [f.id, f.question]));
            step = session.steps[session.currentStep];
          }
        }
        if (!step) {
          results.clear();
          step = session.steps[session.currentStep] = { primary: false, answers: {}, questions: {}, lateRequests: 0, repairs: 0, clicks: 0, observation: signature };
          session.history.push({ url: window.location.href, signature: session.currentStep, at: new Date().toISOString() });
        }
        step.observation = signature;
        status('running', `Application step ${session.history.length}. Repair attempts ${step.repairs}/2.`);
        if (!step.primary) {
          for (const field of fields) {
            const question = questionIdentity(field);
            if (step.questions[field.id] && step.questions[field.id] !== question) delete step.answers[field.id];
            step.questions[field.id] = question;
          }
          const targets = fields.filter(f => getSettings().overwriteExisting || empty(f));
          const missing = [];
          for (const field of targets) {
            const cached = recallAnswer(session, field);
            if (cached) step.answers[field.id] = { fieldId: field.id, ...cached }; else missing.push(field);
          }
          if (missing.length) {
            if ((step.requests || 0) >= 2) { status('paused', 'Primary request limit reached (2/2). Fill this page manually.'); return; }
            step.requests = (step.requests || 0) + 1;
            saveSession(session);
            status('running', `Generating answers for ${missing.length} fields.`);
            const answers = await request(missing, {}, token, signature);
            if (!checkPage(signature, token, 'primary response')) return;
            if (!answers.length) throw new Error('AI returned no usable answers. Resume to retry.');
            for (const entry of answers) step.answers[entry.fieldId] = entry;
          }
          step.primary = true;
          saveSession(session);
          if (!await applyAnswers(targets, Object.values(step.answers), token, signature)) return;
        } else {
          // Recover persisted answers after a full document reload without another primary request.
          const missing = fields.filter(empty);
          if (missing.length && !await applyAnswers(missing, Object.values(step.answers), token, signature)) return;
        }
        if (!checkPage(signature, token, 'fill completion')) return;
        if (!await settleFields(signature, token)) return;
        const late = scanFormFields().filter(f => !Object.hasOwn(step.questions, f.id));
        if (late.length) {
          if (step.lateRequests >= 2) { status('paused', 'Dynamic field limit reached (2/2). Inspect the page before resuming.'); return; }
          step.lateRequests++;
          saveSession(session);
          const targets = late.filter(f => getSettings().overwriteExisting || empty(f));
          if (targets.length) {
            const answers = await request(targets, { allowSearch: false }, token, signature);
            if (!guard(token)) return;
            if (!answers.length) throw new Error('AI returned no usable late-field answers. Resume to retry.');
            for (const entry of answers) step.answers[entry.fieldId] = entry;
            for (const field of late) step.questions[field.id] = questionIdentity(field);
            saveSession(session);
            if (!await applyAnswers(targets, answers, token, signature)) return;
          }
          for (const field of late) step.questions[field.id] = questionIdentity(field);
          saveSession(session);
          continue;
        }
        let control = findContinue();
        const errors = validation(scanFormFields());
        if (errors.length) {
          if (await repair(errors, step, token, signature)) continue;
          return;
        }
        if (!getSettings().autoContinue) { status('paused', 'Page filled. Auto Continue is off.'); return; }
        control = findContinue();
        if (control && isDisabled(control)) {
          const readiness = await waitForNavigation(signature, token, false);
          if (readiness === 'stopped') return;
          if (readiness === 'changed' || readiness === 'validation') continue;
          if (readiness === 'timeout') { pauseDisabledButton(); return; }
          control = findContinue();
        }
        if (!control || isDisabled(control)) { status('paused', inspectContinue().reason); return; }
        if (!await settleFields(signature, token, 'before navigation')) return;
        control = findContinue();
        if (!control || isDisabled(control)) { status('paused', `Continue changed while preparing navigation. ${inspectContinue().reason}`); return; }
        if (step.clicks >= 3 || session.transitions >= 30) { status('paused', 'Navigation limit reached. Continue manually.'); return; }
        if (!guard(token)) return;
        step.clicks++;
        session.transitions++;
        session.pendingUrl = control.tagName === 'A' ? safeUrl(control.getAttribute('href')) : safeUrl(control.getAttribute('formaction') || control.form?.getAttribute('action') || window.location.href);
        session.pendingAt = Date.now();
        session.pendingStep = session.currentStep;
        status('running', 'Continuing; waiting for the next step.');
        bindTab(session);
        logger.info(`Navigation action: ${control.textContent?.trim() || control.value || 'Continue'}, path=${window.location.pathname}`);
        control.click();
        const transition = await waitForNavigation(signature, token, true);
        if (transition === 'stopped') return;
        if (transition === 'changed') continue;
        session.pendingStep = '';
        session.pendingUrl = '';
        const rejected = inspectValidation(scanFormFields());
        if (rejected.length && await repair(rejected, step, token, signature)) continue;
        if (!session.active) return;
        if (isDisabled(findContinue())) { pauseDisabledButton(); return; }
        if (session.active) status('paused', 'Continue did not change the step. Check the page, then resume.');
        return;
      }
      status('paused', 'Workflow limit reached. Continue manually.');
    } catch (error) {
      if (token === generation && session) status('paused', `Workflow stopped: ${error.message}`);
    } finally { busy = false; emit(); }
  }
  return {
    get session() { return session; },
    get busy() { return busy; },
    async initialize() {
      session = await restoreSession();
      if (session) bindTab(session);
      if (session && compatibleSession() && session.active && session.pendingStep === session.currentStep && Date.now() - session.pendingAt < 120000) {
        const previous = session.steps[session.currentStep];
        const page = classifyPage();
        if (previous && (['review', 'confirmation'].includes(page.type) || comparePages(previous.observation, observePage(scanPageFields()), true) === 'changed')) {
          completeStep();
          if (page.type === 'application') session.currentStep = '';
        }
      }
      emit();
      const schedule = () => { clearTimeout(timer); timer = setTimeout(() => void tick(), 300); };
      observer = new MutationObserver(mutations => {
        if (mutations.some(m => !m.target.closest?.('#job-copilot-root,#job-copilot-inline-rewrite'))) schedule();
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      interval = setInterval(() => void tick(), 1500);
      await tick();
    },
    capture() {
      if (busy) return;
      generation++;
      session = createSession(captureJob());
      emit();
    },
    async start(job) {
      if (busy) return;
      generation++;
      if (job || !session) session = createSession(job || captureJob());
      if (!compatibleSession()) return;
      session.active = true;
      status('running', 'Starting application workflow.');
      await tick();
    },
    pause() {
      generation++;
      clearTimeout(timer);
      cancelDelay?.();
      busy = false;
      if (session) status('paused', 'Paused by user.');
    },
    tick,
    destroy() { generation++; clearTimeout(timer); cancelDelay?.(); clearInterval(interval); observer?.disconnect(); },
  };
}
