import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setPlatform } from '../../src/core/platform.js';
import { createGmHost } from '../../src/core/hosts/gm.js';
import {
  PAYLOAD_KIND,
  exportPayload,
  importPayload,
  collectPortableData,
} from '../../src/core/migration.js';
import { STORAGE_KEYS } from '../../src/core/constants.js';

beforeEach(() => {
  const storage = new Map();
  globalThis.GM_getValue = (key, fallback) => (storage.has(key) ? structuredClone(storage.get(key)) : fallback);
  globalThis.GM_setValue = (key, value) => storage.set(key, structuredClone(value));
  globalThis.GM_deleteValue = (key) => storage.delete(key);
  setPlatform(createGmHost());
});

test('exportPayload copies only portable keys and sets kind', () => {
  const data = {
    [STORAGE_KEYS.PROFILE]: { fullName: 'Ada' },
    [STORAGE_KEYS.SETTINGS]: { model: 'openai/gpt-4o' },
    [STORAGE_KEYS.SECRETS]: { apiKey: 'sk-or-v1-leak' },
    [STORAGE_KEYS.DEBUG]: [{ message: 'log' }],
    [STORAGE_KEYS.SESSIONS]: ['s1'],
    [STORAGE_KEYS.VERSION]: '0.4.0',
    [STORAGE_KEYS.MEMORY]: { q1: 'a1' },
    [STORAGE_KEYS.JOB]: { title: 'Engineer' },
  };
  const payload = exportPayload(data);
  assert.equal(payload.kind, PAYLOAD_KIND);
  assert.ok(payload.exportedAt);
  assert.deepEqual(Object.keys(payload.data).sort(), [
    STORAGE_KEYS.JOB,
    STORAGE_KEYS.MEMORY,
    STORAGE_KEYS.PROFILE,
    STORAGE_KEYS.SETTINGS,
  ]);
  assert.equal(payload.data[STORAGE_KEYS.PROFILE].fullName, 'Ada');
  assert.equal(payload.data[STORAGE_KEYS.SECRETS], undefined);
});

test('importPayload rejects invalid input and returns portable keys only', () => {
  assert.throws(() => importPayload(null), /not a JSON object/i);
  assert.throws(() => importPayload({ kind: 'other' }), /Not a Kareer backup/i);
  assert.throws(() => importPayload({ kind: PAYLOAD_KIND }), /no data section/i);
  assert.throws(
    () => importPayload({ kind: PAYLOAD_KIND, data: { [STORAGE_KEYS.DEBUG]: [] } }),
    /no importable records/i,
  );

  const entries = importPayload({
    kind: PAYLOAD_KIND,
    data: {
      [STORAGE_KEYS.PROFILE]: { fullName: 'Bob' },
      [STORAGE_KEYS.SECRETS]: { apiKey: 'never' },
      extra: true,
    },
  });
  assert.equal(entries[STORAGE_KEYS.PROFILE].fullName, 'Bob');
  assert.equal(entries[STORAGE_KEYS.SECRETS], undefined);
  assert.equal(entries.extra, undefined);
});

test('importPayload accepts legacy job-copilot-backup and remaps jc keys', () => {
  const entries = importPayload({
    kind: 'job-copilot-backup',
    data: {
      'jc:profile': { fullName: 'Legacy' },
      'jc:settings': { model: 'openai/gpt-4o', apiKey: 'sk-old' },
    },
  });
  assert.equal(entries[STORAGE_KEYS.PROFILE].fullName, 'Legacy');
  assert.equal(entries[STORAGE_KEYS.SETTINGS].model, 'openai/gpt-4o');
  assert.equal(entries[STORAGE_KEYS.SETTINGS].apiKey, undefined);
  assert.equal(entries['jc:profile'], undefined);
});

test('importPayload strips apiKey fields from settings', () => {
  const entries = importPayload({
    kind: PAYLOAD_KIND,
    data: {
      [STORAGE_KEYS.SETTINGS]: {
        model: 'openai/gpt-4o-mini',
        apiKey: 'sk-old',
        openRouterApiKey: 'sk-old-2',
      },
    },
  });
  const settings = entries[STORAGE_KEYS.SETTINGS];
  assert.equal(settings.model, 'openai/gpt-4o-mini');
  assert.equal(settings.apiKey, undefined);
  assert.equal(settings.openRouterApiKey, undefined);
});

test('collectPortableData reads from platform storage without secrets', () => {
  globalThis.GM_setValue(STORAGE_KEYS.PROFILE, { fullName: 'Carol' });
  globalThis.GM_setValue(STORAGE_KEYS.SECRETS, { apiKey: 'sk-secret' });
  globalThis.GM_setValue(STORAGE_KEYS.SETTINGS, { model: 'x' });

  const data = collectPortableData();
  assert.equal(data[STORAGE_KEYS.PROFILE].fullName, 'Carol');
  assert.equal(data[STORAGE_KEYS.SETTINGS].model, 'x');
  assert.equal(data[STORAGE_KEYS.SECRETS], undefined);
  assert.equal(JSON.stringify(data).includes('sk-secret'), false);
});

test('exportPayload and importPayload roundtrip complete profile including structured collections', () => {
  const fullProfile = {
    fullName: 'Jane Doe',
    email: 'jane@example.com',
    location: 'San Francisco, CA',
    workExperiences: [
      { id: 'w1', enabled: true, title: 'Lead Engineer', company: 'Stripe', startDate: '2022-03', endDate: '', current: true },
    ],
    education: [
      { id: 'e1', enabled: true, institution: 'MIT', degree: 'BS', fieldOfStudy: 'CS', gpa: '3.9' },
    ],
    projects: [
      { id: 'p1', enabled: true, name: 'Kareer', role: 'Creator', url: 'https://github.com' },
    ],
    skills: ['TypeScript', 'Rust', 'Docker'],
    resumeContext: 'Detailed resume notes...',
    applicantNotes: 'Target remote roles...',
  };

  const exported = exportPayload({
    [STORAGE_KEYS.PROFILE]: fullProfile,
    [STORAGE_KEYS.SETTINGS]: { model: 'google/gemini-2.0-flash' },
  });

  assert.equal(exported.kind, PAYLOAD_KIND);
  assert.deepEqual(exported.data[STORAGE_KEYS.PROFILE], fullProfile);

  const imported = importPayload(exported);
  const profile = imported[STORAGE_KEYS.PROFILE];
  assert.equal(profile.fullName, 'Jane Doe');
  assert.equal(profile.workExperiences.length, 1);
  assert.equal(profile.workExperiences[0].company, 'Stripe');
  assert.equal(profile.education.length, 1);
  assert.equal(profile.education[0].institution, 'MIT');
  assert.equal(profile.projects.length, 1);
  assert.equal(profile.projects[0].name, 'Kareer');
  assert.deepEqual(profile.skills, ['TypeScript', 'Rust', 'Docker']);
  assert.equal(profile.resumeContext, 'Detailed resume notes...');
  assert.equal(profile.applicantNotes, 'Target remote roles...');
});

