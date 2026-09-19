/**
 * Lever: uppercase section headers (LOCATION, PERSONAL INFORMATION) sit in the
 * DOM above the real question and used to win extractLabel. Location uses
 * `.dropdown-location` options with no ARIA.
 */
function hostnameOf(loc) {
  return String(loc?.hostname || '');
}

function lettersOnly(text) {
  return String(text || '').replace(/[^A-Za-z]/g, '');
}

export function isAllCapsHeading(text) {
  const trimmed = String(text || '').replace(/\s+/g, ' ').trim();
  if (trimmed.length < 4 || trimmed.length > 80) return false;
  const letters = lettersOnly(trimmed);
  if (letters.length < 4) return false;
  return letters === letters.toUpperCase();
}

export const leverAdapter = {
  id: 'lever',
  label: 'Lever',
  detect(loc, doc) {
    const host = hostnameOf(loc);
    if (/(?:^|\.)lever\.co$/i.test(host)) return true;
    const input = doc?.querySelector?.('input.location-input[name="location"]');
    return Boolean(input?.parentElement?.querySelector('input[type="hidden"][name="selectedLocation"]'));
  },
  quirks: {
    waitForContinueEnabled: false,
    continueReadyTimeoutMs: 0,
    comboboxEscapeRollback: false,
    placesLocation: false,
  },
  fieldMetadata(element) {
    const container = element?.closest?.('.application-question');
    const title = container?.querySelector('.application-label');
    if (!title) return null;
    return {
      label: title.textContent.replace(/[✱*:]+\s*$/, '').trim(),
      description: container.querySelector('.description')?.textContent.trim() || '',
      required: Boolean(element.required || container.querySelector('.required, .required-field')),
    };
  },
  choiceGroups(root, profile) {
    return Array.from(root.querySelectorAll('#candidatePronounsCheckboxes')).map(container => {
      const elements = Array.from(container.querySelectorAll('input[type="checkbox"]'));
      const customInput = container.querySelector('#customPronounsTextField');
      const explicit = profile.pronouns?.trim() || '';
      const standard = elements.filter(el => el.id !== 'customPronounsOption');
      const customValue = explicit && !standard.some(el => el.value.toLowerCase() === explicit.toLowerCase()) &&
        !/prefer not|decline|[,;]/i.test(explicit) && explicit.length <= (customInput?.maxLength || 40) ? explicit : '';
      const field = {
        id: container.id, name: 'pronouns', type: 'radio', widget: 'lever-pronouns',
        element: container, elements, customInput, customValue,
        label: 'Pronouns', description: container.querySelector('.description')?.textContent.trim() || '',
        required: false, constraints: {}, isNarrative: false,
        options: elements.map(el => ({ value: el.id === 'customPronounsOption' && customValue ? customValue : el.value,
          label: el.id === 'customPronounsOption' && customValue ? customValue : el.value })),
      };
      field.currentValue = this.readChoice(field).join(', ');
      return field;
    });
  },
  readChoice(field) {
    if (field.widget !== 'lever-pronouns') return null;
    return field.elements.filter(el => el.checked).map(el => el.id === 'customPronounsOption'
      ? field.customInput?.value.trim() || 'Custom' : el.value);
  },
  fillChoice(field, value, { checkbox, text }) {
    if (field.widget !== 'lever-pronouns') return null;
    const target = field.elements.find(el => (el.id === 'customPronounsOption' ? field.customValue : el.value) === value);
    if (!target) return false;
    for (const el of field.elements) if (el !== target && el.checked) checkbox(el, false);
    if (!target.checked) checkbox(target, true);
    if (target.id === 'customPronounsOption') text(field.customInput, value);
    return true;
  },
  afterComboboxSearch(input, value) {
    if (!this.isCombobox(input)) return;
    input.dispatchEvent(new input.ownerDocument.defaultView.KeyboardEvent('keydown', {
      key: value ? value.slice(-1) : 'Backspace', bubbles: true, composed: true,
    }));
  },
  isSectionHeading(text, node) {
    if (!isAllCapsHeading(text)) return false;
    if (!node) return true;
    const tag = node.tagName || '';
    if (/^H[1-6]$/.test(tag)) return true;
    return /(section|heading|header|category)/i.test(node.className || '');
  },
  isCombobox(element) {
    return Boolean(
      element?.matches?.('input.location-input[name="location"]') &&
      element.parentElement?.querySelector('input[type="hidden"][name="selectedLocation"]'),
    );
  },
  continueControl() {
    return null;
  },
  stepMarker() {
    return '';
  },
  comboboxMenus(element) {
    if (!element?.parentElement) return null;
    const menus = Array.from(element.parentElement.querySelectorAll('.dropdown-container'));
    return menus.length ? menus : null;
  },
  comboboxOptionSelector() {
    return '.dropdown-results > .dropdown-location';
  },
};
