/**
 * Greenhouse: classic job-board embeds (often cross-origin) with Places `.pac-container`
 * location inputs, and job-boards.greenhouse.io React-select fields inside `.select-shell`
 * (including async Location (City) typeaheads and multi-select chips).
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
    if (next?.classList?.contains('pac-container')) return [next];
    const shell = element.closest('.select-shell, .select__container');
    const menus = shell ? Array.from(shell.querySelectorAll('.select__menu, :scope [role="listbox"]')) : [];
    return menus.length ? menus : null;
  },
  comboboxOptionSelector(element) {
    // Places locations and ordinary React-select fields coexist on Greenhouse.
    return this.isCombobox(element) ? '.pac-item' : '';
  },
};
