/**
 * Normalizes scanned field objects into a clean JSON structure for AI prompts
 */

export function normalizeFieldsForAI(detectedFields, options = {}) {
  const { overwriteExisting = false } = options;
  void overwriteExisting;

  return detectedFields.map((field) => {
    const isFilled = Boolean(
      field.currentValue &&
      field.currentValue !== 'false' &&
      field.currentValue !== '0' &&
      String(field.currentValue).trim().length > 0
    );

    const normalized = {
      fieldId: field.id,
      type: field.type,
      label: field.label,
      required: Boolean(field.required),
      currentValue: field.currentValue || '',
      isAlreadyFilled: isFilled,
    };

    if (field.description) {
      normalized.description = field.description;
    }

    if (field.options && field.options.length > 0) {
      normalized.options = field.options.map((opt) => ({
        value: opt.value,
        label: opt.label,
      }));
    }

    if (field.constraints && Object.keys(field.constraints).length > 0) {
      normalized.constraints = field.constraints;
    }

    return normalized;
  }).filter((field) => field.type !== 'file');
}
