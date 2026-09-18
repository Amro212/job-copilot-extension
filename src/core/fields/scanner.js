import { FIELD_TYPES, UI_IDS } from '../constants.js';
import { extractLabel, extractGroupLabel, extractOptionLabel, extractDescription } from './labels.js';
import { logger } from '../debug.js';
import { getProfile } from '../storage.js';
import { isResidenceLabel, locationMatches } from '../location.js';
import { isLeverLocation, isCustomCombobox } from './combobox.js';
import { COMBO, discoverComboboxOptions, optionData, readComboboxSelection, resolveComboboxParts, openCombobox, closeCombobox, setComboboxSearch, waitForComboboxOptions } from './combobox.js';

let fieldCounter = 0;

function isVisible(el) {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.hidden || el.closest('[hidden]')) return false;
  if (el.offsetWidth === 0 && el.offsetHeight === 0 && el.getClientRects().length === 0) {
    if (el.tagName === 'SELECT' || el.type === 'radio' || el.type === 'checkbox') {
      return true;
    }
    return false;
  }
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' &&
    (parseFloat(style.opacity) > 0 || el.matches(COMBO));
}

function isInsideCopilot(el) {
  return Boolean(el.closest(`#${UI_IDS.CONTAINER}`) || el.closest(`#${UI_IDS.INLINE_REWRITE}`));
}

function isRequired(el, labelText) {
  if (el.hasAttribute('required') || el.required) return true;
  if (el.getAttribute('aria-required') === 'true') return true;
  if (el.getAttribute('data-required') === 'true') return true;
  if (labelText && /\*\s*$/.test(labelText)) return true;
  return false;
}

function extractConstraints(el) {
  const constraints = {};
  if (el.maxLength > 0 && el.maxLength < 100000) constraints.maxLength = el.maxLength;
  if (el.minLength > 0) constraints.minLength = el.minLength;
  if (el.pattern) constraints.pattern = el.pattern;
  if (el.min) constraints.min = el.min;
  if (el.max) constraints.max = el.max;
  return constraints;
}

function buildFieldSelector(el) {
  try {
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.name) return `[name="${CSS.escape(el.name)}"]`;
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return `[aria-label="${CSS.escape(ariaLabel)}"]`;
  } catch {}
  return '';
}

function extractComboboxOptionsAndValue(el) {
  const options = discoverComboboxOptions(el).map(optionData);
  const currentValue = readComboboxSelection(el).join(', ');
  logger.info(`Scan[${el.id || '(combobox)'}]: ${options.length} owned options, committed=${Boolean(currentValue)}`);
  return { options, currentValue };
}

export function scanFormFields(root = document) {
  fieldCounter = 0;
  const detectedFields = [];
  const processedElements = new Set();
  const processedRadioGroups = new Set();

  const candidates = Array.from(root.querySelectorAll(`
    input,
    textarea,
    select,
    [contenteditable="true"],
    [role="combobox"],
    button[aria-haspopup="listbox"]
  `)).filter((el) => !isInsideCopilot(el) && !el.closest('header,nav,footer,[role="banner"],[role="navigation"],[role="contentinfo"],.g-recaptcha,.h-captcha,[data-captcha]') && !/^(g-recaptcha-response|h-captcha-response|cf-turnstile-response)(?:$|-)/i.test(el.name || el.id || ''));

  for (const el of candidates) {
    if (processedElements.has(el)) continue;

    const tagName = el.tagName.toLowerCase();
    const typeAttr = (el.getAttribute('type') || '').toLowerCase();

    // Skip non-fillable inputs
    const isCombobox = el.matches(COMBO) || isCustomCombobox(el);
    if (typeAttr === 'hidden' || typeAttr === 'submit' || (typeAttr === 'button' && !isCombobox) || typeAttr === 'reset' || typeAttr === 'image' || typeAttr === 'password') {
      continue;
    }

    // Resume upload is a first-class field. Attach the stored file later.
    if (typeAttr === 'file') {
      processedElements.add(el);
      const label = extractLabel(el);
      const description = extractDescription(el);
      const currentName = el.files?.[0]?.name || '';
      detectedFields.push({
        id: el.id || el.name || `jc_field_${++fieldCounter}`,
        name: el.name || '',
        selector: buildFieldSelector(el),
        type: FIELD_TYPES.FILE,
        element: el,
        label,
        description,
        required: isRequired(el, label),
        currentValue: currentName,
        options: [],
        constraints: { accept: el.getAttribute('accept') || '' },
        isNarrative: false,
      });
      continue;
    }

    if (!isVisible(el) && !['select', 'radio', 'checkbox'].includes(typeAttr)) {
      continue;
    }

    // 1. Radio button groups
    if (typeAttr === 'radio') {
      const groupName = el.getAttribute('name');
      if (groupName && processedRadioGroups.has(groupName)) {
        continue;
      }
      if (groupName) processedRadioGroups.add(groupName);

      const radioEls = groupName
        ? Array.from(root.querySelectorAll(`input[type="radio"][name="${CSS.escape(groupName)}"]`)).filter((r) => !isInsideCopilot(r))
        : [el];

      radioEls.forEach((r) => processedElements.add(r));

      const groupLabel = extractGroupLabel(radioEls, groupName);
      const description = extractDescription(el);
      const options = radioEls.map((r) => {
        const optionLabel = extractOptionLabel(r);
        return {
          value: r.value || optionLabel,
          label: optionLabel || r.value,
          checked: r.checked,
        };
      });

      const checkedRadio = radioEls.find((r) => r.checked);
      const currentValue = checkedRadio ? (checkedRadio.value || extractOptionLabel(checkedRadio)) : '';

      detectedFields.push({
        id: el.name || el.id || `jc_field_${++fieldCounter}`,
        name: el.name || '',
        selector: buildFieldSelector(el),
        type: FIELD_TYPES.RADIO,
        element: el,
        elements: radioEls,
        label: groupLabel,
        description,
        required: radioEls.some((r) => isRequired(r, groupLabel)),
        currentValue,
        options,
        constraints: {},
        isNarrative: false,
      });
      continue;
    }

    // 2. Checkboxes
    if (typeAttr === 'checkbox') {
      processedElements.add(el);
      const label = extractOptionLabel(el) || extractLabel(el);
      const description = extractDescription(el);

      detectedFields.push({
        id: el.id || el.name || `jc_field_${++fieldCounter}`,
        name: el.name || '',
        selector: buildFieldSelector(el),
        type: FIELD_TYPES.CHECKBOX,
        element: el,
        label,
        description,
        required: isRequired(el, label),
        currentValue: el.checked ? 'true' : 'false',
        checked: el.checked,
        options: [
          { value: 'true', label: 'Yes / Checked' },
          { value: 'false', label: 'No / Unchecked' },
        ],
        constraints: {},
        isNarrative: false,
      });
      continue;
    }

    // 3. Native Select
    if (tagName === 'select') {
      processedElements.add(el);
      const label = extractLabel(el);
      const description = extractDescription(el);
      const options = Array.from(el.options).map((opt) => ({
        value: opt.value,
        label: opt.text.trim(),
        selected: opt.selected,
      })).filter((opt) => opt.value || opt.label);

      const selectedOption = el.options[el.selectedIndex];
      const isPlaceholder = !selectedOption || selectedOption.value === '' || /--|select|choose/i.test(selectedOption.text);
      const currentValue = !isPlaceholder && selectedOption ? (selectedOption.value || selectedOption.text.trim()) : '';

      detectedFields.push({
        id: el.id || el.name || `jc_field_${++fieldCounter}`,
        name: el.name || '',
        selector: buildFieldSelector(el),
        type: FIELD_TYPES.SELECT,
        element: el,
        label,
        description,
        required: isRequired(el, label),
        currentValue,
        options,
        constraints: {},
        isNarrative: false,
      });
      continue;
    }

    // 4. Textarea
    if (tagName === 'textarea') {
      processedElements.add(el);
      const label = extractLabel(el);
      const description = extractDescription(el);

      detectedFields.push({
        id: el.id || el.name || `jc_field_${++fieldCounter}`,
        name: el.name || '',
        selector: buildFieldSelector(el),
        type: FIELD_TYPES.TEXTAREA,
        element: el,
        label,
        description,
        required: isRequired(el, label),
        currentValue: el.value || '',
        options: [],
        constraints: extractConstraints(el),
        isNarrative: true,
      });
      continue;
    }

    // 5. Contenteditable
    if (el.getAttribute('contenteditable') === 'true') {
      processedElements.add(el);
      const label = extractLabel(el);
      const description = extractDescription(el);

      detectedFields.push({
        id: el.id || `jc_field_${++fieldCounter}`,
        name: '',
        selector: buildFieldSelector(el),
        type: FIELD_TYPES.CONTENTEDITABLE,
        element: el,
        label,
        description,
        required: isRequired(el, label),
        currentValue: el.textContent || '',
        options: [],
        constraints: {},
        isNarrative: true,
      });
      continue;
    }

    // 6. Custom Combobox [role="combobox"] or aria-haspopup="listbox"
    if (isCombobox || el.getAttribute('aria-haspopup') === 'listbox') {
      processedElements.add(el);
      const label = extractLabel(el);
      const description = extractDescription(el);
      const { options, currentValue } = extractComboboxOptionsAndValue(el);

      detectedFields.push({
        id: el.id || el.getAttribute('name') || `jc_field_${++fieldCounter}`,
        name: el.getAttribute('name') || '',
        selector: buildFieldSelector(el),
        type: FIELD_TYPES.COMBOBOX,
        element: el,
        label,
        description,
        required: isRequired(el, label),
        currentValue,
        options,
        constraints: {},
        isNarrative: false,
      });
      continue;
    }

    // 7. Standard text-like inputs
    processedElements.add(el);
    const label = extractLabel(el);
    const description = extractDescription(el);
    
    let fieldType = FIELD_TYPES.TEXT;
    if (typeAttr === 'email') fieldType = FIELD_TYPES.EMAIL;
    else if (typeAttr === 'tel') fieldType = FIELD_TYPES.TEL;
    else if (typeAttr === 'url') fieldType = FIELD_TYPES.URL;
    else if (typeAttr === 'number') fieldType = FIELD_TYPES.NUMBER;

    const isNarrative = label.length > 50 || /describe|explain|why|tell us about|cover letter/i.test(label);

    detectedFields.push({
      id: el.id || el.name || `jc_field_${++fieldCounter}`,
      name: el.name || '',
      selector: buildFieldSelector(el),
      type: fieldType,
      element: el,
      label,
      description,
      required: isRequired(el, label),
      currentValue: el.value || '',
      options: [],
      constraints: extractConstraints(el),
      isNarrative,
    });
  }

  return detectedFields;
}

/**
 * Reads options from each field's own menu, optionally using grounded search queries
 * for remote results. Search queries are cleared without committing a selection.
 */
export async function harvestComboboxOptions(fields, searchQueries = new Map()) {
  const profileLocation = getProfile().location?.trim();
  // Re-harvest even previously discovered options: an open menu may be filtered.
  for (const field of fields.filter(field => field.type === FIELD_TYPES.COMBOBOX)) {
    const element = field.element;
    if (!element) continue;
    const { input } = resolveComboboxParts(element);
    let ownsSearch;
    try {
      await openCombobox(element);
      const query = searchQueries.get(field.id) || (isResidenceLabel(field.label) ? profileLocation : '') || '';
      // Search by city so provider formatting/abbreviations do not suppress
      // suggestions; retain every supplied region/country for final matching.
      const locationField = isLeverLocation(element) || isCustomCombobox(element) && isResidenceLabel(field.label) || isResidenceLabel(field.label);
      const search = locationField ? query.split(',')[0].trim() : query;
      ownsSearch = setComboboxSearch(input, search);
      field.options = (await waitForComboboxOptions(element, undefined, isResidenceLabel(field.label) ? query : undefined)).map(optionData);
      if (query && isResidenceLabel(field.label)) field.options = field.options.filter(option => locationMatches(option.label, query));
      logger.info(`Harvest[${field.id}]: ${field.options.length} owned options`);
    } catch (err) {
      field.options = [];
      logger.warn(`Harvest[${field.id}]: ${err.message}`);
    } finally {
      if (ownsSearch?.()) {
        if (!readComboboxSelection(element).length) setComboboxSearch(input, '');
        closeCombobox(element);
      }
    }
  }
  return fields;
}
