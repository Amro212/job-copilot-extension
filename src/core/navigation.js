import { isVisible, visibleText } from './pageClassifier.js';
import { cleanText } from './fields/labels.js';

// Workflow-only identity: a selected value in aria-label is not the question.
// Leave the shared single-page scanner's label policy unchanged.
export function workflowLabel(field) {
  if (['radio', 'checkbox'].includes(field.type)) return field.label;
  const el = field.element;
  const label = el.id && el.ownerDocument.querySelector(`label[for="${CSS.escape(el.id)}"]`);
  if (label) return cleanText(visibleText(label));
  const references = (el.getAttribute('aria-labelledby') || '').split(/\s+/)
    .map(id => el.ownerDocument.getElementById(id))
    .filter(node => node && node !== el && !el.contains(node));
  const text = references.map(node => {
    const clone = node.cloneNode(true);
    clone.querySelectorAll('input,textarea,select,button,[role=combobox],[role=listbox],[role=alert]').forEach(child => child.remove());
    return cleanText(clone.textContent);
  }).filter(Boolean).join(' ');
  return text || field.label;
}

export function questionIdentity(field) {
  return JSON.stringify([field.label, field.type,
    ['select', 'radio'].includes(field.type) ? field.options.map(o => [o.value, o.label]) : null]);
}

export function observePage(fields, doc = document) {
  const markers = Array.from(doc.querySelectorAll('[aria-current=step]')).filter(isVisible);
  const scope = fields[0]?.element.closest('main,[role=main]') || doc.querySelector('main,[role=main]') || doc.body;
  const headings = Array.from(scope.querySelectorAll('h1,h2,h3,[role=heading]')).filter(node =>
    isVisible(node) && !node.closest('header,nav,footer,[role=alert],[role=dialog],[role=listbox],.field-error,.validation-error') &&
    !/^(?:errors?\b|validation\b)/i.test(visibleText(node)));
  // A step heading precedes its questions; section headings below them are mutable.
  const leading = headings.filter(node => !fields[0] || Boolean(node.compareDocumentPosition(fields[0].element) & 4));
  const heading = leading.find(node => node.tagName !== 'H1') || leading[0];
  return {
    url: doc.location.href,
    marker: markers.length === 1 ? visibleText(markers[0]) : '',
    heading: heading ? visibleText(heading) : '',
    fields: fields.map(f => ({ id: f.id, question: questionIdentity(f), disabled: Boolean(f.element.disabled) })),
  };
}

export function comparePages(before, after, afterClick = false) {
  if (before.url !== after.url) return 'changed';
  if (before.marker && after.marker && before.marker !== after.marker) return 'changed';
  if (before.fields.length && !after.fields.length) return 'ambiguous';
  if (before.marker && after.marker) return 'same';
  if (before.heading && after.heading && before.heading !== after.heading) return 'changed';
  const overlap = before.fields.some(a => after.fields.some(b => a.id === b.id || a.question === b.question));
  if (overlap) return 'same';
  // Complete replacement without a step marker is evidence only after our click.
  if (afterClick && !before.marker && !after.marker && before.fields.length && after.fields.length) return 'changed';
  return 'ambiguous';
}

export function findContinue(doc = document) {
  return inspectContinue(doc).control;
}

export function inspectContinue(doc = document) {
  const matches = Array.from(doc.querySelectorAll('button,input[type=submit],input[type=button],a[href],[role=button]')).filter(isVisible).filter(el => {
    const label = visibleText(el) || el.value || el.getAttribute('aria-label') || '';
    return /^(?:next(?: step)?|continue|save (?:and|&) continue|review(?: application)?|proceed)$/i.test(label.trim());
  });
  const candidates = matches.filter(el => {
    // Step destinations are not forward actions. Phenom exposes these as a
    // toolbar with stepnum markers; ordinary action toolbars remain eligible.
    return !el.closest('[role=tablist]') &&
      !el.closest('[role=toolbar]')?.querySelector('[stepnum],[aria-current=step]');
  });
  const control = candidates.length === 1 ? candidates[0] : null;
  let reason = '';
  if (!candidates.length) reason = `No Next or Continue button found.${matches.length ? ' Application progress controls were excluded.' : ''} Continue manually.`;
  else if (candidates.length > 1) {
    const labels = candidates.slice(0, 5).map(el => (visibleText(el) || el.value || el.getAttribute('aria-label')).trim());
    reason = `Multiple forward buttons found: ${labels.join(', ')}${candidates.length > 5 ? ', …' : ''}. Continue manually.`;
  } else if (isDisabled(control)) reason = 'The page’s Continue button is disabled. Wait for the page or check required fields.';
  return { control, reason };
}
export function pageSignature(fields, doc = document) {
  const page = observePage(fields, doc);
  return JSON.stringify([page.url, page.marker || page.heading || page.fields.map(f => [f.id, f.question]).sort()]);
}
export function isDisabled(control) {
  return Boolean(control?.disabled || control?.getAttribute('aria-disabled') === 'true');
}
