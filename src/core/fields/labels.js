/**
 * Resolves human-readable labels and descriptions for form controls
 */

export function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[*:]+$/, '')
    .trim();
}

export function nameToLabel(name) {
  if (!name) return '';
  return name
    .replace(/[-_]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function extractLabel(element) {
  if (!element || !(element instanceof Element)) return '';

  // 1. Check aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim()) {
    return cleanText(ariaLabel);
  }

  // 2. Check aria-labelledby
  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const ids = ariaLabelledBy.split(/\s+/);
    const textParts = ids
      .map((id) => document.getElementById(id))
      // Some button dropdowns reference both the question and themselves (or
      // their selected-value span). Selection text is not part of the question.
      .filter(el => el && el !== element && !element.contains(el))
      .map((el) => {
        const clone = el.cloneNode(true);
        clone.querySelectorAll('input,textarea,select,button,[role="combobox"],[role="listbox"]').forEach(control => control.remove());
        return clone.textContent || '';
      })
      .join(' ');
    if (textParts.trim()) {
      return cleanText(textParts);
    }
  }

  // 3. Check <label for="id">
  if (element.id) {
    try {
      const labelEl = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (labelEl && labelEl.textContent) {
        return cleanText(labelEl.textContent);
      }
    } catch {
      // ignore invalid selector escape
    }
  }

  // 4. Check wrapping <label>
  const parentLabel = element.closest('label');
  if (parentLabel && parentLabel.textContent) {
    const applicationLabel = parentLabel.querySelector('.application-label');
    if (applicationLabel) return cleanText(applicationLabel.textContent).replace(/[✱*]+\s*$/, '').trim();
    const clone = parentLabel.cloneNode(true);
    const inputs = clone.querySelectorAll('input, select, textarea');
    inputs.forEach((input) => input.remove());
    const text = cleanText(clone.textContent);
    if (text) return text;
  }

  // 5. Check <fieldset> <legend>
  const fieldset = element.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend && legend.textContent) {
      return cleanText(legend.textContent);
    }
  }

  // 6. Look for preceding label-like siblings or parent headers
  const parent = element.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children);
    const index = siblings.indexOf(element);
    if (index > 0) {
      for (let i = index - 1; i >= 0; i--) {
        const sib = siblings[i];
        if (sib.matches('label, .label, .form-label, .field-label, h3, h4, h5, p, span, strong')) {
          const text = cleanText(sib.textContent);
          if (text && text.length < 150) return text;
        }
      }
    }

    const grandParent = parent.parentElement;
    if (grandParent) {
      const heading = grandParent.querySelector('.label, .form-label, .field-label, label, legend');
      if (heading && heading.textContent) {
        const text = cleanText(heading.textContent);
        if (text && text.length < 150) return text;
      }
    }
  }

  // 7. Check placeholder
  const placeholder = element.getAttribute('placeholder');
  if (placeholder && placeholder.trim()) {
    return cleanText(placeholder);
  }

  // 8. Fallback to name or id attribute
  const name = element.getAttribute('name');
  if (name) return nameToLabel(name);

  if (element.id) return nameToLabel(element.id);

  return 'Unknown Field';
}

/**
 * Extracts the overall question label for a group of radio buttons or checkboxes
 */
export function extractGroupLabel(elements = [], groupName = '') {
  if (!elements || elements.length === 0) return nameToLabel(groupName);

  const firstEl = elements[0];

  // 1. Check <fieldset> <legend>
  const fieldset = firstEl.closest('fieldset');
  if (fieldset) {
    const legend = fieldset.querySelector('legend');
    if (legend && legend.textContent.trim()) {
      return cleanText(legend.textContent);
    }
  }

  // 2. Check closest form group / question container
  const container = firstEl.closest('.form-group, .field, [role="radiogroup"], [role="group"], .question, div');
  if (container) {
    // Check aria-label on container
    const ariaLabel = container.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return cleanText(ariaLabel);

    // Look for heading or label that is NOT wrapping one of the radio inputs
    const headings = Array.from(container.querySelectorAll('label, legend, .label, .form-label, .field-label, h3, h4, h5, p, strong, span'));
    for (const h of headings) {
      // Must not contain any of the radio elements
      const containsRadio = elements.some((el) => h.contains(el));
      if (!containsRadio) {
        const text = cleanText(h.textContent);
        if (text && text.length > 2 && text.length < 250) {
          return text;
        }
      }
    }

    // Try extracting text by cloning container and removing all input options
    try {
      const clone = container.cloneNode(true);
      clone.querySelectorAll('input, .radio-group, .checkbox-group, .radio-item, .checkbox-item, ul, li').forEach((el) => el.remove());
      const remainingText = cleanText(clone.textContent);
      if (remainingText && remainingText.length > 3 && remainingText.length < 250) {
        return remainingText;
      }
    } catch {}
  }

  // 3. Fallback to name attribute
  if (groupName) return nameToLabel(groupName);

  return extractLabel(firstEl);
}

/**
 * Extracts the option-specific label for a single radio button or checkbox
 */
export function extractOptionLabel(element) {
  if (!element) return '';

  // 1. Check wrapping label
  const parentLabel = element.closest('label');
  if (parentLabel) {
    const clone = parentLabel.cloneNode(true);
    clone.querySelectorAll('input').forEach((input) => input.remove());
    const text = cleanText(clone.textContent);
    if (text) return text;
  }

  // 2. Check label[for="id"]
  if (element.id) {
    try {
      const labelEl = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (labelEl && labelEl.textContent) {
        return cleanText(labelEl.textContent);
      }
    } catch {}
  }

  // 3. Check adjacent sibling text
  if (element.nextSibling && element.nextSibling.textContent) {
    const text = cleanText(element.nextSibling.textContent);
    if (text) return text;
  }

  // 4. Value attribute
  if (element.value && element.value !== 'on') {
    return cleanText(element.value);
  }

  return cleanText(element.id || 'Option');
}

export function extractDescription(element) {
  if (!element || !(element instanceof Element)) return '';

  const describedBy = element.getAttribute('aria-describedby');
  if (describedBy) {
    const ids = describedBy.split(/\s+/);
    const textParts = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map((el) => el.textContent || '')
      .join(' ');
    if (textParts.trim()) {
      return cleanText(textParts);
    }
  }

  const container = element.closest('.form-group, .field, .input-wrapper, fieldset, div');
  if (container) {
    const helpEl = container.querySelector('.help-text, .form-text, .description, .hint, small');
    if (helpEl && helpEl !== element && !helpEl.contains(element)) {
      return cleanText(helpEl.textContent);
    }
  }

  return '';
}
