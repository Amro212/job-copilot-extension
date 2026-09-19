/**
 * Fallback adapter. Always matches, never overrides the generic engine.
 * Specific ATS adapters sit in front of this one in the registry.
 */
export const genericAdapter = {
  id: 'generic',
  label: 'Generic',
  detect() {
    return true;
  },
  quirks: {
    waitForContinueEnabled: false,
    continueReadyTimeoutMs: 0,
    comboboxEscapeRollback: false,
    placesLocation: false,
  },
  fieldMetadata() {
    return null;
  },
  choiceGroups() {
    return [];
  },
  isSectionHeading() {
    return false;
  },
  isCombobox() {
    return false;
  },
  continueControl() {
    return null;
  },
  stepMarker() {
    return '';
  },
  comboboxMenus() {
    return null;
  },
  comboboxOptionSelector() {
    return '';
  },
};
