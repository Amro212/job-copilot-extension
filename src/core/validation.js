import { isVisible, visibleText } from './pageClassifier.js';
import { isDisabled } from './navigation.js';
import { detectAdapter } from './adapters/index.js';

// ARIA alerts announce success and progress as well as errors.
function isErrorMessage(node) {
  if (node.matches('.error,.field-error,.validation-error,.error-message,[data-error]')) return true;
  if (!node.matches('[role=alert]')) return false;
  const text = visibleText(node);
  if (/\b(?:error|invalid|failed|failure|rejected|required|missing|must|cannot|unable)\b/i.test(text)) return true;
  return !/\b(?:successfully (?:uploaded|saved)|(?:upload|save) (?:complete|successful)|uploading|saving)\b/i.test(text);
}

export function inspectValidation(fields, control = null, doc = document) {
  const errors = [];
  const owned = new Set();
  for (const field of fields) {
    const el = field.element;
    if (!isVisible(el) || el.disabled) continue;
    const ids = `${el.getAttribute('aria-errormessage') || ''} ${el.getAttribute('aria-describedby') || ''}`.trim().split(/\s+/);
    const nodes = ids.map(id => doc.getElementById(id)).filter(node => node && isVisible(node));
    const invalid = el.getAttribute('aria-invalid') === 'true' || el.validity?.valid === false;
    const missing = field.required && (field.widget ? detectAdapter().readChoice?.(field)?.length !== 1 : field.type === 'checkbox' ? !el.checked : field.type === 'radio' ? !(field.elements || [el]).some(r => r.checked) : !String(field.currentValue ?? '').trim());
    const messages = nodes.filter(node => invalid || isErrorMessage(node));
    messages.forEach(node => owned.add(node));
    if (invalid || missing || messages.some(node => visibleText(node))) errors.push({ fieldId: field.id, label: field.label, kind: el.getAttribute('aria-invalid') === 'true' || messages.length ? 'semantic' : 'native', message: messages.map(visibleText).filter(Boolean).join(' ') || el.validationMessage || 'Required value missing or rejected.' });
  }
  for (const el of doc.querySelectorAll('[role=alert],.field-error,.validation-error,.error-message,[data-error]')) {
    if (!isVisible(el) || owned.has(el) || !visibleText(el) || !isErrorMessage(el)) continue;
    const container = el.closest('.form-group,.field,.form-field,fieldset,[data-field]');
    const candidates = container ? fields.filter(field => container.contains(field.element)) : [];
    const field = candidates.length === 1 ? candidates[0] : null;
    const existing = field && errors.find(error => error.fieldId === field.id);
    if (existing) { existing.message = visibleText(el).slice(0, 500); existing.kind = 'semantic'; }
    else errors.push({ fieldId: field?.id || null, kind: 'semantic', message: visibleText(el).slice(0, 500) });
  }
  // Required uploads and unsupported native controls must still prevent navigation.
  for (const el of doc.querySelectorAll('input,select,textarea')) {
    if (isVisible(el) && !el.disabled && el.validity?.valid === false && !fields.some(f => f.element === el || f.elements?.includes(el))) errors.push({ fieldId: null, message: el.validationMessage || 'A required control needs manual input.' });
  }
  if (control && isDisabled(control)) errors.push({ fieldId: null, message: 'Continue is disabled.' });
  return errors;
}
