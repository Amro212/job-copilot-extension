import { extractLabel } from './labels.js';
import { isResidenceLabel, locationMatches } from '../location.js';
import { detectAdapter } from '../adapters/index.js';

// Shared ownership and committed-state rules for scanning, harvesting and filling.
export const COMBO = '[role="combobox"], button[aria-haspopup="listbox"], input[aria-autocomplete="list"], input[aria-autocomplete="both"]';
const MENU = '[role="listbox"], .select__menu, [class*="menu-list"]';
const OPTION = '[role="option"], .select__option';
const VALUE = '.select__single-value, [class*="singleValue"], [class*="single-value"], .select__multi-value__label, [class*="multiValueLabel"], [class*="multi-value__label"]';
const countryLabelsByInput = new WeakMap();
const searchesByInput = new WeakMap();
const activatedLocations = new WeakMap();

export function isLeverLocation(element) {
  return element.matches('input.location-input[name="location"]') &&
    Boolean(element.parentElement?.querySelector('input[type="hidden"][name="selectedLocation"]')) &&
    Boolean(element.parentElement?.querySelector('.dropdown-container .dropdown-results'));
}

/** Greenhouse Places-style location: a plain input whose suggestions live in `.pac-container`. */
export function isPlacesLocation(element) {
  if (!element?.matches?.('input:not([type="hidden"])')) return false;
  const parent = element.parentElement;
  if (!parent) return false;
  if (parent.querySelector(':scope > .pac-container')) return true;
  return Boolean(element.nextElementSibling?.classList?.contains('pac-container'));
}

export function isCustomCombobox(element) {
  if (!element) return false;
  if (isLeverLocation(element) || isPlacesLocation(element)) return true;
  try {
    return Boolean(detectAdapter().isCombobox(element));
  } catch {
    return false;
  }
}

export function recordLocationActivation(element, label) {
  if (isLeverLocation(element) || detectAdapter().id === 'ashby') {
    activatedLocations.set(element, label);
    element.addEventListener('input', () => activatedLocations.delete(element), { once: true });
  }
}

function countryDisplayKey(node) {
  const flag = node.querySelector('.iti__flag');
  const countryClass = flag && Array.from(flag.classList).find(name => /^iti__[a-z]{2}$/.test(name));
  const dialCode = node.textContent.trim().match(/\+\d[\d -]*$/)?.[0];
  return countryClass && dialCode ? `${countryClass}:${dialCode.replace(/\s/g, '')}` : null;
}

export const optionKey = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function resolveComboboxParts(element) {
  if (isLeverLocation(element) || isPlacesLocation(element)) {
    return { container: element.parentElement, input: element, controlBox: element, toggleBtn: null };
  }
  let container = element;
  // Walk past an input carrying role=combobox, but never cross into another field.
  for (let parent = element.parentElement; parent && !parent.matches('body, html, form, main'); parent = parent.parentElement) {
    const others = Array.from(parent.querySelectorAll(`${COMBO}, input:not([type="hidden"]), textarea`))
      .filter(node => node !== element && !element.contains(node) && !node.contains(element)
        && node.getAttribute('aria-hidden') !== 'true');
    if (others.length) break;
    container = parent;
    if (parent.matches('.field, .form-group, [class*="select-shell"], .select__container')) break;
  }
  const input = element.matches('input') ? element : container.querySelector('input:not([type="hidden"])');
  const controlBox = container.querySelector('.select__control, [class*="-control"], [class*="combobox-input"]') || element;
  const toggleBtn = detectAdapter().comboboxToggle?.(element) || container.querySelector('button[aria-label*="toggle" i], button[aria-label*="open" i], [class*="dropdown-indicator"], [class*="indicatorContainer"], [class*="dropdown-arrow"]');
  return { container, input, controlBox, toggleBtn };
}

export function getComboboxMenus(element) {
  if (isLeverLocation(element)) return Array.from(element.parentElement.querySelectorAll('.dropdown-container'));
  if (isPlacesLocation(element)) {
    const parent = element.parentElement;
    const local = parent ? Array.from(parent.querySelectorAll(':scope > .pac-container')) : [];
    if (local.length) return local;
    return element.nextElementSibling?.classList?.contains('pac-container') ? [element.nextElementSibling] : [];
  }
  const { container, input } = resolveComboboxParts(element);
  const ids = new Set([element, input].filter(Boolean).flatMap(node =>
    `${node.getAttribute('aria-controls') || ''} ${node.getAttribute('aria-owns') || ''}`.trim().split(/\s+/).filter(Boolean)));
  const root = element.getRootNode();
  // An explicit but absent/empty menu is authoritative. Never borrow another menu.
  if (ids.size) return [...ids].map(id => root.getElementById?.(id) || element.ownerDocument.getElementById(id)).filter(Boolean);
  const adapterMenus = detectAdapter().comboboxMenus(element);
  if (adapterMenus) return adapterMenus;
  return Array.from(container.querySelectorAll(MENU));
}

export function discoverComboboxOptions(element) {
  const options = [...new Set(getComboboxMenus(element).flatMap(menu => {
    if (menu.hidden || menu.getAttribute('aria-hidden') === 'true' || menu.style.display === 'none') return [];
    const optionSelector = detectAdapter().comboboxOptionSelector(element)
      || (isLeverLocation(element) ? '.dropdown-results > .dropdown-location' : isPlacesLocation(element) ? '.pac-item' : OPTION);
    return Array.from(menu.querySelectorAll(optionSelector)).filter(option =>
      option.textContent?.trim() && !option.hidden && option.style.display !== 'none' &&
      option.ownerDocument.defaultView.getComputedStyle(option).visibility !== 'hidden' &&
      !option.hasAttribute('disabled') && option.getAttribute('aria-disabled') !== 'true');
  }))];
  const input = resolveComboboxParts(element).input || element;
  const labels = countryLabelsByInput.get(input) || new Map();
  for (const option of options) {
    const key = countryDisplayKey(option);
    if (key) labels.set(key, option.textContent.trim());
  }
  countryLabelsByInput.set(input, labels);
  return options;
}

export function optionData(option) {
  const label = option.textContent.trim();
  return { value: option.getAttribute('data-value') || option.getAttribute('value') || label, label };
}

export function findExactOption(options, target) {
  const key = optionKey(target);
  if (!key) return null;
  const matches = options.filter(option => optionKey(option.label) === key || optionKey(option.value) === key);
  return matches.length === 1 ? matches[0] : null;
}

export function readComboboxSelection(element) {
  if (!element?.isConnected) return [];
  if (isPlacesLocation(element)) {
    const value = String(element.value || '').trim();
    return value ? [value] : [];
  }
  if (detectAdapter().quirks.selectionInInput || detectAdapter().quirks.comboboxEscapeRollback) {
    const { input } = resolveComboboxParts(element);
    const value = String((input || element).value || '').trim();
    if (value) return [value];
  }
  if (isLeverLocation(element)) {
    // The real site commits structured data on mousedown. Display text alone
    // (including a click we attempted) is not proof that the site accepted it.
    let selected;
    try { selected = JSON.parse(element.parentElement.querySelector('[name="selectedLocation"]').value); } catch {}
    return selected?.name && element.value === selected.name && menusClosed(element) ? [selected.name] : [];
  }
  if (detectAdapter().id === 'ashby') {
    const activated = activatedLocations.get(element);
    return activated && element.value === activated && menusClosed(element) ? [activated] : [];
  }
  const { container, input } = resolveComboboxParts(element);
  const labels = countryLabelsByInput.get(input || element);
  // Greenhouse renders the selected phone country as a flag plus dial code only.
  // Resolve that exact pair using labels observed in this field's own menu.
  const values = Array.from(container.querySelectorAll(VALUE))
    .map(node => labels?.get(countryDisplayKey(node)) || node.textContent.trim()).filter(Boolean);
  if (values.length) return values;
  const ariaValue = element.getAttribute('aria-valuetext');
  if (ariaValue?.trim()) return [ariaValue.trim()];
  const backingSelect = container.querySelector('select');
  if (backingSelect) return Array.from(backingSelect.selectedOptions).filter(option => option.value).map(option => option.text.trim() || option.value);
  if (element.matches('button[aria-haspopup="listbox"],button[role="combobox"]')) {
    const label = element.textContent.trim();
    if (label && !/^(?:select(?: one| an? option)?|choose(?: one| an? option)?|--.*--)\s*$/i.test(label)) return [label];
  }
  return discoverComboboxOptions(element).filter(option => option.getAttribute('aria-selected') === 'true').map(option => optionData(option).label);
  // A searchable input's value is query text, never evidence of a selection.
}

function menusClosed(element) {
  return element.getAttribute('aria-expanded') !== 'true' && getComboboxMenus(element).every(menu =>
    menu.hidden || menu.getAttribute('aria-hidden') === 'true' || element.ownerDocument.defaultView.getComputedStyle(menu).display === 'none');
}

export function setComboboxSearch(input, value) {
  if (!input) return () => true;
  // Identity, not just text: a newer search may reuse the same query later.
  const search = { query: value, started: Date.now(), priorOptions: new Set(discoverComboboxOptions(input)) };
  searchesByInput.set(input, search);
  const ownsSearch = () => input.isConnected && searchesByInput.get(input) === search && input.value === value;
  if (input.value === value && !isLeverLocation(input)) return ownsSearch;
  activatedLocations.delete(input);
  const setter = Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView.HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  input.dispatchEvent(new KeyboardEvent('keyup', { key: value ? value.slice(-1) : 'Backspace', bubbles: true, composed: true }));
  detectAdapter().afterComboboxSearch?.(input, value);
  return ownsSearch;
}

export function closeCombobox(element) {
  const { input } = resolveComboboxParts(element);
  const target = input || element;
  target.blur?.();
  // Workday listboxes treat Escape as "cancel the pick". Never send it.
  if (detectAdapter().quirks.comboboxEscapeRollback) {
    try {
      element.ownerDocument.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    } catch {}
  }
}

export function clickFieldControl(element) {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, button: 0 });
  // Dropdown buttons/options may omit type=button inside a form. Preserve their
  // click listeners without allowing the browser's implicit submit default.
  if (element.closest('button')?.type === 'submit' || element.closest('a[href]')) event.preventDefault();
  element.dispatchEvent(event);
}

export async function openCombobox(element) {
  if (element.getAttribute('aria-expanded') === 'true' && getComboboxMenus(element).length) return;
  const active = element.ownerDocument.activeElement;
  if (active && active !== element && active !== element.ownerDocument.body) {
    active.blur?.();
  }
  const { input, controlBox, toggleBtn } = resolveComboboxParts(element);
  const target = input || controlBox;
  target.focus?.();
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
  clickFieldControl(target);
  await delay(80);
  if (menusClosed(element) && toggleBtn) clickFieldControl(toggleBtn);
}

export async function waitForComboboxOptions(element, timeoutMs, locationQuery) {
  const { input } = resolveComboboxParts(element);
  const search = input && searchesByInput.get(input);
  const query = input?.value || '';
  const words = optionKey(query).match(/[\p{L}\p{N}]+/gu) || [];
  const deadline = Date.now() + (timeoutMs ?? (query ? 8000 : 3000));
  let previous = '', stableSince = Date.now();
  do {
    if (!element.isConnected || input && (!input.isConnected || input.value !== query || searchesByInput.get(input) !== search)) return [];
    const menus = getComboboxMenus(element);
    const loading = element.getAttribute('aria-busy') === 'true' || menus.some(menu => {
      if (menu.getAttribute('aria-busy') === 'true') return true;
      if (isLeverLocation(element)) {
        const indicator = menu.querySelector('.dropdown-loading-results');
        return indicator && !indicator.hidden && indicator.ownerDocument.defaultView.getComputedStyle(indicator).display !== 'none';
      }
      return /\bloading\b/i.test(menu.textContent);
    });
    // A pre-existing list may belong to a previous request. Require relevance
    // to every query term; never accept the first nonempty list blindly.
    const location = isLeverLocation(element) || isPlacesLocation(element) || isResidenceLabel(extractLabel(element));
    const options = discoverComboboxOptions(element).filter(option => {
      if (isLeverLocation(element) && search && (Date.now() - search.started < 500 || search.priorOptions.has(option))) return false;
      const text = optionKey(option.textContent);
      return location && query ? locationMatches(text, locationQuery || query) : words.every(word => text.includes(word));
    });
    const signature = JSON.stringify(options.map(optionData));
    if (loading || signature !== previous) { stableSince = Date.now(); previous = signature; }
    if (!loading && options.length && Date.now() - stableSince >= 200) return options;
    // Async menus can briefly display "No options" before the debounce starts.
    await delay(100);
  } while (Date.now() < deadline);
  return [];
}

export async function waitForComboboxSelection(element, target, timeoutMs = 2500) {
  const deadline = Date.now() + timeoutMs;
  let stableSince = null;
  do {
    if (!element?.isConnected) return false;
    const valid = element.getAttribute('aria-invalid') !== 'true' && element.validity?.valid !== false;
    const matches = valid && readComboboxSelection(element).some(value => optionKey(value) === optionKey(target));
    if (!matches) stableSince = null;
    else if (stableSince === null) stableSince = Date.now();
    else if (Date.now() - stableSince >= 200) return true;
    await delay(50);
  } while (Date.now() < deadline);
  return false;
}
