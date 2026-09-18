import { STORAGE_KEYS } from '../../../core/constants.js';

export const PAYLOAD_KIND = 'job-copilot-backup';

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

export function exportPayload(data) {
  const payload = { kind: PAYLOAD_KIND, exportedAt: new Date().toISOString(), data: {} };
  for (const key of PORTABLE_KEYS) {
    if (data[key] !== undefined) payload.data[key] = data[key];
  }
  return payload;
}

export function importPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('File is not a JSON object');
  if (payload.kind !== PAYLOAD_KIND) throw new Error('Not a Job Copilot backup file');
  if (!payload.data || typeof payload.data !== 'object') throw new Error('Backup has no data section');

  const entries = {};
  for (const key of PORTABLE_KEYS) {
    const value = payload.data[key];
    if (value !== undefined && value !== null) entries[key] = value;
  }
  if (!Object.keys(entries).length) throw new Error('Backup contained no importable records');
  return entries;
}
