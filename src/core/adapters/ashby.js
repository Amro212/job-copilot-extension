/**
 * Ashby: custom selects without always exposing ARIA, plus dynamic sections
 * that appear after a radio choice. Detection is hostname + distinctive markup.
 */
function hostnameOf(loc) {
  return String(loc?.hostname || '');
}

export const ashbyAdapter = {
  id: 'ashby',
  label: 'Ashby',
  detect(loc, doc) {
    const host = hostnameOf(loc);
    if (/(?:^|\.)ashbyhq\.com$/i.test(host)) return true;
    return Boolean(doc?.querySelector?.('#ashby_embed, [data-ashby-root], .ashby-application-form, .ashby-select-input'));
  },
  quirks: {
    waitForContinueEnabled: false,
    continueReadyTimeoutMs: 0,
    comboboxEscapeRollback: false,
    selectionInInput: true,
    placesLocation: false,
  },
  isSectionHeading() {
    return false;
  },
  isCombobox(element) {
    return Boolean(element?.matches?.('.ashby-select-input, [data-ashby-field]'));
  },
  continueControl() {
    return null;
  },
  stepMarker() {
    return '';
  },
  comboboxMenus(element) {
    if (!element) return null;
    const root = element.closest('.ashby-select') || element.parentElement;
    const menus = root ? Array.from(root.querySelectorAll('.ashby-select-menu, [role="listbox"]')) : [];
    return menus.length ? menus : null;
  },
  comboboxOptionSelector() {
    return '.ashby-select-option, [role="option"]';
  },
};
