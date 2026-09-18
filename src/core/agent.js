import { scanFormFields, harvestComboboxOptions } from './fields/scanner.js';
import { normalizeFieldsForAI } from './fields/normalize.js';
import { fillField } from './fields/fillers.js';
import { verifyField } from './fields/verify.js';
import { scrollToField, highlightActiveField, highlightVerifiedField, highlightFailedField } from './fields/highlight.js';
import { inspectValidation } from './validation.js';
import { classifyPage } from './pageClassifier.js';
import { FILL_STATUS } from './constants.js';
import { logger } from './debug.js';

/**
 * Field agent for a document the panel cannot reach through the DOM, i.e. a
 * cross-origin iframe. It performs the same observe -> locate -> scroll -> act ->
 * verify steps as the panel, but decides nothing: the top frame owns the AI
 * request and sends answers back.
 */
export function createFieldAgent() {
  let cache = new Map();

  function unfilled(field) {
    const value = field.currentValue;
    return !value || value === 'false' || value === '0' || String(value).trim().length === 0;
  }

  function resolveLive(field) {
    const element = field.element;
    if (element?.isConnected) return element;
    const fresh = scanFormFields(document).find((candidate) => candidate.id === field.id);
    if (fresh) {
      cache.set(fresh.id, fresh);
      return fresh.element;
    }
    return element;
  }

  async function scan({ overwriteExisting = false } = {}) {
    const page = classifyPage();
    const scanned = scanFormFields(document);
    cache = new Map(scanned.map((field) => [field.id, field]));

    const targets = scanned.filter((field) => overwriteExisting || unfilled(field));
    if (!targets.length) return { fields: [], pageType: page.type };

    await harvestComboboxOptions(targets);
    return {
      fields: normalizeFieldsForAI(targets, { overwriteExisting }),
      pageType: page.type,
    };
  }

  async function searchOptions({ queries = [] } = {}) {
    const wanted = new Map(queries.map((query) => [query.fieldId, query.searchQuery]));
    const fields = [...cache.values()].filter((field) => field.type === 'combobox' && wanted.has(field.id));
    if (!fields.length) return { fields: [] };

    await harvestComboboxOptions(fields, wanted);
    const discovered = fields.filter((field) => field.options.length);
    return { fields: normalizeFieldsForAI(discovered) };
  }

  async function fill({ answers = [] } = {}) {
    const results = [];

    for (const answer of answers) {
      const field = cache.get(answer.fieldId);
      if (!field) {
        results.push({ fieldId: answer.fieldId, status: FILL_STATUS.FAILED, error: 'Field no longer present in frame' });
        continue;
      }

      if (answer.value === '' || answer.value === null || answer.value === undefined) {
        results.push({
          fieldId: answer.fieldId,
          status: field.required ? FILL_STATUS.FAILED : FILL_STATUS.SKIPPED,
          value: field.currentValue || '',
          ...(field.required ? { error: 'Required field left empty by AI' } : {}),
        });
        continue;
      }

      try {
        field.element = resolveLive(field);
        scrollToField(field.element);
        highlightActiveField(field.element);

        const didFill = await fillField(field, answer.value);
        await new Promise((resolve) => setTimeout(resolve, field.type === 'combobox' ? 250 : 80));

        field.element = resolveLive(field);
        const verification = didFill
          ? await verifyField(field, answer.value)
          : { verified: false, actualValue: '', error: 'No exact option was selected or the field rejected the value' };

        if (verification.verified) {
          highlightVerifiedField(field.element);
          results.push({
            fieldId: answer.fieldId,
            status: answer.inferred ? FILL_STATUS.INFERRED : FILL_STATUS.VERIFIED,
            value: verification.actualValue || answer.value,
            inferred: Boolean(answer.inferred),
            label: field.label,
          });
        } else {
          highlightFailedField(field.element);
          results.push({
            fieldId: answer.fieldId,
            status: FILL_STATUS.FAILED,
            value: verification.actualValue || '',
            error: verification.error || 'Value did not stick in DOM',
            label: field.label,
          });
        }
      } catch (err) {
        logger.error(`Frame agent failed on "${field.label}":`, err);
        results.push({ fieldId: answer.fieldId, status: FILL_STATUS.FAILED, error: err?.message || 'Fill failed', label: field.label });
      }
    }

    return { results };
  }

  function validation() {
    const fields = cache.size ? [...cache.values()] : scanFormFields(document);
    return {
      errors: inspectValidation(fields).map((error) => ({ ...error, frameUrl: window.location.href })),
    };
  }

  async function handle(command) {
    switch (command?.action) {
      case 'scan': return scan(command);
      case 'searchOptions': return searchOptions(command);
      case 'fill': return fill(command);
      case 'validation': return validation();
      case 'ping': return { ok: true, url: window.location.href, fieldCount: scanFormFields(document).length };
      default: return { error: `Unknown agent action "${command?.action}"` };
    }
  }

  return { handle, get fieldCount() { return cache.size; } };
}
