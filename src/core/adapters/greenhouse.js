/**
 * Greenhouse: job-board embeds (often cross-origin) and Places-style location
 * inputs with no combobox ARIA, whose suggestions live in `.pac-container`.
 */
function hostnameOf(loc) {
  return String(loc?.hostname || '');
}

export const greenhouseAdapter = {
  id: 'greenhouse',
  label: 'Greenhouse',
  detect(loc, doc) {
    const host = hostnameOf(loc);
    if (/(?:^|\.)greenhouse\.io$|(?:^|\.)greenhouse\.com$/i.test(host)) return true;
    return Boolean(doc?.querySelector?.('#grnhse_app, form#application_form, #job_application_location'));
  },
  quirks: {
    waitForContinueEnabled: false,
    continueReadyTimeoutMs: 0,
    comboboxEscapeRollback: false,
    placesLocation: true,
  },
  isSectionHeading() {
    return false;
  },
  isCombobox(element) {
    if (!element?.matches?.('input:not([type="hidden"])')) return false;
    const parent = element.parentElement;
    if (!parent) return false;
    if (parent.querySelector(':scope > .pac-container')) return true;
    return Boolean(element.nextElementSibling?.classList?.contains('pac-container'));
  },
  continueControl() {
    return null;
  },
  stepMarker() {
    return '';
  },
  comboboxMenus(element) {
    if (!element) return null;
    const parent = element.parentElement;
    const local = parent ? Array.from(parent.querySelectorAll(':scope > .pac-container')) : [];
    if (local.length) return local;
    const next = element.nextElementSibling;
    return next?.classList?.contains('pac-container') ? [next] : null;
  },
  comboboxOptionSelector() {
    return '.pac-item';
  },
};
