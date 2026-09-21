import { STORAGE_KEYS } from './constants.js';
import { platform } from './platform.js';

export const PAYLOAD_KIND = 'kareer-backup';
const LEGACY_PAYLOAD_KIND = 'job-copilot-backup';

/**
 * Keys that may cross a backup boundary. Secrets are deliberately absent: the
 * API key is re-entered by hand after an import.
 */
const PORTABLE_KEYS = [
  STORAGE_KEYS.PROFILE,
  STORAGE_KEYS.SETTINGS,
  STORAGE_KEYS.MEMORY,
  STORAGE_KEYS.JOB,
];

const LEGACY_KEY_MAP = {
  'jc:profile': STORAGE_KEYS.PROFILE,
  'jc:settings': STORAGE_KEYS.SETTINGS,
  'jc:memory': STORAGE_KEYS.MEMORY,
  'jc:job': STORAGE_KEYS.JOB,
};

export function exportPayload(data) {
  const payload = { kind: PAYLOAD_KIND, exportedAt: new Date().toISOString(), data: {} };
  for (const key of PORTABLE_KEYS) {
    if (data[key] !== undefined) payload.data[key] = data[key];
  }
  return payload;
}

function scrubSettings(settings) {
  if (!settings || typeof settings !== 'object') return settings;
  const clean = { ...settings };
  delete clean.apiKey;
  delete clean.openRouterApiKey;
  return clean;
}

function normalizeImportData(data) {
  const normalized = { ...data };
  for (const [legacyKey, nextKey] of Object.entries(LEGACY_KEY_MAP)) {
    if (normalized[nextKey] === undefined && normalized[legacyKey] !== undefined) {
      normalized[nextKey] = normalized[legacyKey];
    }
    delete normalized[legacyKey];
  }
  return normalized;
}

export function importPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('File is not a JSON object');
  if (payload.kind !== PAYLOAD_KIND && payload.kind !== LEGACY_PAYLOAD_KIND) {
    throw new Error('Not a Kareer backup file');
  }
  if (!payload.data || typeof payload.data !== 'object') throw new Error('Backup has no data section');

  const data = normalizeImportData(payload.data);
  const entries = {};
  for (const key of PORTABLE_KEYS) {
    let value = data[key];
    if (value === undefined || value === null) continue;
    if (key === STORAGE_KEYS.SETTINGS) value = scrubSettings(value);
    entries[key] = value;
  }
  if (!Object.keys(entries).length) throw new Error('Backup contained no importable records');
  return entries;
}

export function collectPortableData() {
  const data = {};
  for (const key of PORTABLE_KEYS) {
    const value = platform.storage.get(key, undefined);
    if (value !== undefined && value !== null) data[key] = value;
  }
  return data;
}
