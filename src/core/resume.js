import { detectAdapter } from './adapters/index.js';
import { fillField } from './fields/fillers.js';
import { UI_IDS } from './constants.js';
import { logger } from './debug.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const RESUME_PATTERN = /\b(?:resume|r[eé]sum[eé]|cv|curriculum[\s-]*vitae)\b/i;
const NON_RESUME_PATTERN = /\b(?:cover[\s-]*letter|portfolio|work[\s-]*sample|writing[\s-]*sample|references?|transcript|certification|supplement|additional[\s-]*document)\b/i;

/**
 * Returns true when a file field looks like a resume/CV upload rather than a
 * cover letter, portfolio, or other attachment type.  When the label is
 * ambiguous (e.g. just "Upload" with no further context) the field is treated
 * as a resume if it is the FIRST file field on the page — most ATS pages put
 * the resume upload first.
 */
export function isResumeField(field, allFileFields) {
  if (!field || field.type !== 'file') return false;
  const text = [field.label, field.name, field.id, field.description,
    field.constraints?.accept].filter(Boolean).join(' ');
  // Explicit non-resume label — never attach the resume.
  if (NON_RESUME_PATTERN.test(text)) return false;
  // Explicit resume label — always attach.
  if (RESUME_PATTERN.test(text)) return true;
  // Ambiguous label (e.g. "Attach file"): only treat the first file field on
  // the page as a resume upload; later ones are likely cover letter or other.
  if (allFileFields) return allFileFields[0] === field;
  return true;
}
const parserHosts = new Set(['ashby', 'lever']);
const BUSY = '[aria-busy="true"], [role="progressbar"], .resume-upload-working, ' +
  '.ashby-application-form-autofill-input-root:is([data-state="loading"], [data-state="uploading"], [data-state="parsing"], [data-state="processing"])';

function visible(element) {
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;
  for (let node = element; node; node = node.parentElement) {
    const style = node.ownerDocument.defaultView.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

function parserBusy(doc) {
  return Array.from(doc.querySelectorAll(`${BUSY}, [role="status"]`))
    .some(el => !el.closest(`#${UI_IDS.CONTAINER}`) && visible(el) &&
      (el.matches(BUSY) || /\b(parsing|processing|uploading|analyzing)\b/i.test(el.textContent)));
}

// Poll properties as well as DOM structure: React and server parsers can replace
// controls or set .value without a mutation event. Never log applicant values.
function formState(doc) {
  return Array.from(doc.querySelectorAll('input:not([type="file"]), textarea, select, button[aria-pressed]'))
    .filter(el => !el.closest(`#${UI_IDS.CONTAINER}`))
    .map(el => [el, JSON.stringify([el.value, el.checked, el.disabled, el.getAttribute('aria-pressed')])]);
}

export async function waitForResumeParsing({ doc = document, isCurrent = () => true,
  minimumMs = 3000, quietMs = 1000, timeoutMs = 15000, pollMs = 100 } = {}) {
  if (!parserHosts.has(detectAdapter().id)) return;
  const started = Date.now();
  const url = doc.location.href;
  let previous = formState(doc), stableSince = started;
  logger.info('Waiting for resume parsing and stable application fields.');
  while (Date.now() - started < timeoutMs) {
    if (!isCurrent() || doc.location.href !== url) throw new Error('Resume processing wait cancelled because the run or page changed.');
    const next = formState(doc);
    const changed = next.length !== previous.length || next.some(([el, value], i) => el !== previous[i]?.[0] || value !== previous[i]?.[1]);
    const busy = parserBusy(doc);
    if (changed || busy) stableSince = Date.now();
    previous = next;
    if (!busy && Date.now() - started >= minimumMs && Date.now() - stableSince >= quietMs) {
      logger.info('Resume processing settled; rescanning application fields.');
      return;
    }
    await delay(pollMs);
  }
  throw new Error('Resume processing did not settle. Wait for the board to finish parsing, then retry Autofill.');
}

export async function uploadResumeAndWait(field, options) {
  const filled = await fillField(field, '');
  if (filled) await waitForResumeParsing(options);
  return filled;
}
