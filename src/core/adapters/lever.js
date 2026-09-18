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
