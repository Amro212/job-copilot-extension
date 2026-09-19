import { FIELD_TYPES } from '../constants.js';
import { readComboboxSelection, optionKey, waitForComboboxSelection, findExactOption } from './combobox.js';
import { detectAdapter } from '../adapters/index.js';

export async function verifyField(field, expectedValue) {
  if (!field || !field.element) {
    return { verified: false, actualValue: '', error: 'Element missing' };
  }

  // Artificial rejection check for test fixtures / validation gates
  if (field.element.getAttribute('data-reject-fill') === 'true') {
    return {
      verified: false,
      actualValue: field.element.value || '',
      error: 'Form field rejected programmatic input (Gate 4)',
    };
  }

  const expectedStr = String(expectedValue || '').trim().toLowerCase();
  if (field.widget) {
    const actual = detectAdapter().readChoice?.(field) || [];
    const option = findExactOption(field.options || [], expectedValue);
    const verified = Boolean(option && actual.length === 1 && optionKey(actual[0]) === optionKey(option.value));
    return { verified, actualValue: actual.join(', '), error: verified ? undefined : 'The expected single choice was not accepted' };
  }

  switch (field.type) {
    case FIELD_TYPES.RADIO: {
      const radios = field.elements || [field.element];
      const checkedRadio = radios.find((r) => r.checked);
      if (!checkedRadio) {
        return { verified: false, actualValue: '', error: 'No option selected' };
      }
      const actualVal = checkedRadio.value || checkedRadio.closest('label')?.textContent?.trim() || '';
      const option = findExactOption(field.options || [], expectedValue);
      const verified = Boolean(option && radios.filter(r => r.checked).length === 1 && optionKey(actualVal) === optionKey(option.value));
      return { verified, actualValue: actualVal, error: verified ? undefined : 'Selected radio does not match the expected option' };
    }

    case FIELD_TYPES.CHECKBOX: {
      const isChecked = field.element.checked;
      const expectedChecked = expectedValue === true || ['true', 'yes', '1', 'checked'].includes(expectedStr);
      const matches = isChecked === expectedChecked;
      return {
        verified: matches,
        actualValue: String(isChecked),
        error: matches ? undefined : `Expected checked=${expectedChecked}, found ${isChecked}`,
      };
    }

    case FIELD_TYPES.SELECT: {
      const select = field.element;
      const selectedOption = select.options[select.selectedIndex];
      if (!selectedOption) {
        return { verified: false, actualValue: '', error: 'No option selected' };
      }

      const isPlaceholder = selectedOption.value === '' || /--|select|choose/i.test(selectedOption.text);
      const actualVal = selectedOption.value || selectedOption.text.trim();

      if (isPlaceholder) {
        return {
          verified: false,
          actualValue: selectedOption.text.trim(),
          error: 'Dropdown remained on placeholder',
        };
      }

      const option = findExactOption(field.options || [], expectedValue);
      const verified = Boolean(option && optionKey(actualVal) === optionKey(option.value));
      return {
        verified,
        actualValue: actualVal,
        error: verified ? undefined : 'Selected option does not match the expected option',
      };
    }

    case FIELD_TYPES.CONTENTEDITABLE: {
      const actualVal = (field.element.textContent || '').trim();
      const verified = actualVal.length > 0;
      return {
        verified,
        actualValue: actualVal,
        error: verified ? undefined : 'Contenteditable text remained empty',
      };
    }

    case FIELD_TYPES.COMBOBOX: {
      return await verifyCombobox(field.element, expectedValue);
    }

    case FIELD_TYPES.FILE: {
      const actualVal = field.element.files?.[0]?.name || '';
      const expectedName = String(expectedValue || '').trim();
      const verified = Boolean(actualVal) && (!expectedName || actualVal.toLowerCase() === expectedName.toLowerCase());
      return {
        verified,
        actualValue: actualVal,
        error: verified ? undefined : actualVal ? `Attached "${actualVal}" did not match "${expectedValue}"` : 'No file attached',
      };
    }

    case FIELD_TYPES.TEXT:
    case FIELD_TYPES.TEXTAREA:
    case FIELD_TYPES.EMAIL:
    case FIELD_TYPES.TEL:
    case FIELD_TYPES.URL:
    case FIELD_TYPES.NUMBER:
    default: {
      const actualVal = (field.element.value || field.element.textContent || '').trim();
      if (!expectedStr) {
        return { verified: true, actualValue: actualVal };
      }
      const verified = actualVal.length > 0;
      return {
        verified,
        actualValue: actualVal,
        error: verified ? undefined : 'Value did not persist in DOM',
      };
    }
  }
}

export async function verifyCombobox(element, expectedValue) {
  if (!element) {
    return { verified: false, actualValue: '', error: 'Element missing' };
  }

  const verified = await waitForComboboxSelection(element, expectedValue);
  const result = _checkComboboxState(element, expectedValue);
  return { ...result, verified, error: verified ? undefined : result.error || 'Combobox selection did not remain valid and stable' };
}

function _checkComboboxState(element, expectedValue) {
  const values = readComboboxSelection(element);
  const expected = optionKey(expectedValue);
  const verified = values.some(value => optionKey(value) === expected);
  return {
    verified,
    actualValue: values.join(', '),
    error: verified ? undefined : values.length
      ? `Selected option "${values.join(', ')}" does not match expected "${expectedValue}"`
      : 'Combobox has no committed selection',
  };
}
