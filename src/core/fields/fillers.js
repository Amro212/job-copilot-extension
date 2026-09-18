import { FIELD_TYPES } from '../constants.js';
import { extractOptionLabel, extractLabel } from './labels.js';
import { isResidenceLabel } from '../location.js';
import { logger } from '../debug.js';
import { isLeverLocation, recordLocationActivation } from './combobox.js';
import { optionKey, findExactOption, optionData, resolveComboboxParts, readComboboxSelection, discoverComboboxOptions, openCombobox, closeCombobox, setComboboxSearch, waitForComboboxOptions, waitForComboboxSelection, clickFieldControl } from './combobox.js';

function setNativeInputValue(element, value) {
  try {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }
  } catch {
    try {
      element.value = value;
    } catch {}
  }
}

function setNativeChecked(element, checked) {
  try {
    const checkedSetter = Object.getOwnPropertyDescriptor(element, 'checked')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeCheckedSetter = Object.getOwnPropertyDescriptor(prototype, 'checked')?.set;

    if (prototypeCheckedSetter && checkedSetter !== prototypeCheckedSetter) {
      prototypeCheckedSetter.call(element, checked);
    } else if (checkedSetter) {
      checkedSetter.call(element, checked);
    } else {
      element.checked = checked;
    }
  } catch {
    try {
      element.checked = checked;
    } catch {}
  }
}

function dispatchEventSequence(element, eventTypes = ['input', 'change']) {
  try {
    element.dispatchEvent(new Event('focus', { bubbles: true }));
  } catch {}

  for (const type of eventTypes) {
    try {
      const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
      element.dispatchEvent(event);
    } catch {}
  }

  try {
    element.dispatchEvent(new Event('blur', { bubbles: true }));
  } catch {}
}

export function fillTextInput(element, value) {
  if (!element) return false;
  const strVal = value !== null && value !== undefined ? String(value) : '';
  
  try {
    element.focus();
  } catch {}
  setNativeInputValue(element, strVal);
  dispatchEventSequence(element, ['input', 'change']);
  return true;
}

export function fillTextarea(element, value) {
  if (!element) return false;
  const strVal = value !== null && value !== undefined ? String(value) : '';

  try {
    element.focus();
  } catch {}
  setNativeInputValue(element, strVal);
  dispatchEventSequence(element, ['input', 'change']);
  return true;
}

export function fillSelect(element, targetValue) {
  if (!element || !(element instanceof HTMLSelectElement)) return false;
  const targetStr = String(targetValue).trim().toLowerCase();
  if (!targetStr) return false;

  const validOptions = Array.from(element.options).filter((opt) => {
    const isPlaceholder = opt.value === '' || /--|select|choose/i.test(opt.text);
    return !isPlaceholder;
  });

  let matchedOption = null;

  // 1. Match exact value
  for (const opt of validOptions) {
    if (opt.value.trim().toLowerCase() === targetStr) {
      matchedOption = opt;
      break;
    }
  }

  // 2. Match exact label text
  if (!matchedOption) {
    for (const opt of validOptions) {
      if (opt.text.trim().toLowerCase() === targetStr) {
        matchedOption = opt;
        break;
      }
    }
  }

  // 3. Match prefix / contains
  if (!matchedOption) {
    for (const opt of validOptions) {
      const optText = opt.text.trim().toLowerCase();
      if (optText.startsWith(targetStr) || targetStr.startsWith(optText)) {
        matchedOption = opt;
        break;
      }
    }
  }

  // 4. Match substring tokens (e.g. "senior", "mid", "entry", "lead", "yes", "no")
  if (!matchedOption) {
    for (const opt of validOptions) {
      const optText = opt.text.trim().toLowerCase();
      const optVal = opt.value.trim().toLowerCase();
      if (optText.includes(targetStr) || optVal.includes(targetStr) || targetStr.includes(optVal)) {
        matchedOption = opt;
        break;
      }
    }
  }

  if (matchedOption) {
    try {
      element.focus();
    } catch {}
    matchedOption.selected = true;
    element.selectedIndex = matchedOption.index;
    setNativeInputValue(element, matchedOption.value);
    dispatchEventSequence(element, ['input', 'change']);
    return true;
  }

  return false;
}

export function fillRadioGroup(elements, targetValue) {
  if (!Array.isArray(elements) || elements.length === 0) return false;
  const targetStr = String(targetValue).trim().toLowerCase();
  if (!targetStr) return false;

  let matchedRadio = null;

  // 1. Exact value match
  for (const r of elements) {
    if (r.value.trim().toLowerCase() === targetStr) {
      matchedRadio = r;
      break;
    }
  }

  // 2. Exact label match
  if (!matchedRadio) {
    for (const r of elements) {
      const optLabel = extractOptionLabel(r).toLowerCase();
      if (optLabel === targetStr) {
        matchedRadio = r;
        break;
      }
    }
  }

  // 3. Boolean semantic match (Yes vs No)
  if (!matchedRadio) {
    const isYes = ['yes', 'true', '1', 'authorized', 'eligible', 'agree'].includes(targetStr);
    const isNo = ['no', 'false', '0', 'declined', 'disagree', 'not'].includes(targetStr);

    for (const r of elements) {
      const optVal = r.value.trim().toLowerCase();
      const optLabel = extractOptionLabel(r).toLowerCase();

      if (isYes) {
        if (optVal === 'yes' || optVal === 'true' || optVal === '1' || optLabel.startsWith('yes') || optLabel.startsWith('true') || optLabel.startsWith('i am authorized')) {
          matchedRadio = r;
          break;
        }
      } else if (isNo) {
        if (optVal === 'no' || optVal === 'false' || optVal === '0' || optLabel.startsWith('no') || optLabel.startsWith('false') || optLabel.startsWith('i am not')) {
          matchedRadio = r;
          break;
        }
      }
    }
  }

  // 4. Substring label match
  if (!matchedRadio) {
    for (const r of elements) {
      const optLabel = extractOptionLabel(r).toLowerCase();
      if (optLabel.includes(targetStr) || targetStr.includes(optLabel)) {
        matchedRadio = r;
        break;
      }
    }
  }

  if (matchedRadio) {
    try {
      matchedRadio.focus();
    } catch {}
    setNativeChecked(matchedRadio, true);
    dispatchEventSequence(matchedRadio, ['click', 'input', 'change']);
    return true;
  }

  return false;
}

export function fillCheckbox(element, targetValue) {
  if (!element) return false;
  const targetStr = String(targetValue).trim().toLowerCase();
  const shouldBeChecked = targetValue === true || ['true', 'yes', '1', 'checked', 'agree'].includes(targetStr);

  try {
    element.focus();
  } catch {}
  setNativeChecked(element, shouldBeChecked);
  dispatchEventSequence(element, ['click', 'input', 'change']);
  return true;
}

export async function fillCombobox(element, targetValue, knownOptions) {
  if (!element || !optionKey(targetValue)) return false;
  const known = knownOptions ? findExactOption(knownOptions, targetValue) : null;
  if (knownOptions && !known) {
    logger.warn(`Fill[${element.id}]: rejected answer outside this field's options`);
    return false;
  }
  const target = known?.label || String(targetValue);
  const { input } = resolveComboboxParts(element);
  let ownsSearch;
  try {
    if (readComboboxSelection(element).some(value => optionKey(value) === optionKey(target))) {
      closeCombobox(element);
      return await waitForComboboxSelection(element, target);
    }
    await openCombobox(element);
    const location = isLeverLocation(element) || known && isResidenceLabel(extractLabel(element));
    ownsSearch = setComboboxSearch(input, location ? target.split(',')[0].trim() : '');
    let options = await waitForComboboxOptions(element, undefined, location ? target : undefined);
    if (!ownsSearch()) return false;
    let match = findExactOption(options.map(option => ({ ...optionData(option), element: option })), target);
    // Search only for an option already harvested from this field (async/virtual menus).
    if (!match && known && input) {
      ownsSearch = setComboboxSearch(input, known.label);
      options = await waitForComboboxOptions(element);
      if (!ownsSearch()) return false;
      match = findExactOption(options.map(option => ({ ...optionData(option), element: option })), target);
    }
    // Resolve the option again after waiting; async menus can replace nodes.
    if (match) match = findExactOption(discoverComboboxOptions(element).map(option => ({ ...optionData(option), element: option })), target);
    if (!match || !element.isConnected) {
      logger.warn(`Fill[${element.id}]: no exact owned option for "${target}"`);
      return false;
    }
    logger.info(`Fill[${element.id}]: selecting exact option "${match.label}"`);
    match.element.scrollIntoView?.({ block: 'nearest' });
    match.element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    match.element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    clickFieldControl(match.element);
    recordLocationActivation(element, match.label);
    if (!await waitForComboboxSelection(element, target)) return false;
    closeCombobox(element);
    // The site's blur handler can reject or clear an apparent selection.
    return await waitForComboboxSelection(element, target);
  } catch (err) {
    logger.warn(`Fill[${element.id}]: ${err.message}`);
    return false;
  } finally {
    // Some controls display their committed location in the search input itself.
    // Clearing that value fires a new search and may erase the saved selection.
    const selected = readComboboxSelection(element).length > 0;
    // A prior chip does not authorize cleanup of a newer search. Successful
    // commits are already blurred and checked above before returning.
    if (!ownsSearch || ownsSearch()) {
      if (!selected && element.isConnected && ownsSearch?.()) setComboboxSearch(input, '');
      closeCombobox(element);
    }
  }
}

export function fillContentEditable(element, value) {
  if (!element) return false;
  const strVal = value !== null && value !== undefined ? String(value) : '';
  
  try {
    element.focus();
  } catch {}
  element.textContent = strVal;
  dispatchEventSequence(element, ['input', 'change']);
  return true;
}

export async function fillField(field, targetValue) {
  if (!field || !field.element) return false;
  logger.info(`Field action: id=${field.id || '(none)'}, type=${field.type}, tag=${field.element.tagName}, path=${window.location.pathname}`);

  switch (field.type) {
    case FIELD_TYPES.TEXTAREA:
      return fillTextarea(field.element, targetValue);

    case FIELD_TYPES.SELECT:
      return fillSelect(field.element, targetValue);

    case FIELD_TYPES.RADIO:
      return fillRadioGroup(field.elements || [field.element], targetValue);

    case FIELD_TYPES.CHECKBOX:
      return fillCheckbox(field.element, targetValue);

    case FIELD_TYPES.COMBOBOX:
      return await fillCombobox(field.element, targetValue, field.options || []);

    case FIELD_TYPES.CONTENTEDITABLE:
      return fillContentEditable(field.element, targetValue);

    case FIELD_TYPES.TEXT:
    case FIELD_TYPES.EMAIL:
    case FIELD_TYPES.TEL:
    case FIELD_TYPES.URL:
    case FIELD_TYPES.NUMBER:
    default:
      return fillTextInput(field.element, targetValue);
  }
}

