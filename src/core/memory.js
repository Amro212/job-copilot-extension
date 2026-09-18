import { gmGet, gmSet, getProfile } from './storage.js';
import { STORAGE_KEYS } from './constants.js';

export const normalizeQuestion = label => String(label || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
const questionKey = field => JSON.stringify([normalizeQuestion(field.label), field.type, field.description || '']);
const profileKey = () => JSON.stringify(getProfile());
const common = field => /^(full name|first name|last name|email|email address|phone|phone number|linkedin|linkedin url|github|github url|portfolio|portfolio url)$/.test(normalizeQuestion(field.label));
const compatible = (field, answer) => answer && (!field.options?.length || field.type === 'checkbox' || field.options.some(o => String(o.value) === String(answer.value) || String(o.label) === String(answer.value)));
export function rememberAnswer(session, field, answer) {
  const entry = { value: answer.value, inferred: Boolean(answer.inferred), profileKey: profileKey(), label: field.label, updatedAt: new Date().toISOString() };
  if (session?.answers) session.answers[questionKey(field)] = entry;
  if (common(field) && !entry.inferred) {
    const memory = gmGet(STORAGE_KEYS.MEMORY, {});
    memory[questionKey(field)] = entry;
    gmSet(STORAGE_KEYS.MEMORY, memory);
  }
}
export function recallAnswer(session, field) {
  const entry = session.answers[questionKey(field)] || (common(field) ? gmGet(STORAGE_KEYS.MEMORY, {})[questionKey(field)] : null);
  return entry?.profileKey === profileKey() && compatible(field, entry) ? { value: entry.value, inferred: entry.inferred } : null;
}
