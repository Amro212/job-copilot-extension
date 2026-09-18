import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { setPlatform } from '../../src/core/platform.js';
import { createGmHost } from '../../src/core/hosts/gm.js';
import {
  remoteFieldId,
  parseRemoteFieldId,
  isRemoteFieldId,
  listRemoteFrames,
  collectRemoteFields,
  searchRemoteOptions,
  applyRemoteAnswers,
  collectRemoteValidation,
} from '../../src/core/remote.js';

/** Installs a host that pretends to be the extension, recording every command. */
function stubFrames({ frames = [], respond = () => ({}) } = {}) {
  const sent = [];
  const base = createGmHost();
  setPlatform({
    ...base,
    name: 'test-extension',
    capabilities: { ...base.capabilities, crossFrame: true },
    framesList: async () => frames,
    frameCommand: async (frameId, command) => {
      sent.push({ frameId, command });
      return respond(frameId, command);
    },
  });
  return sent;
}

beforeEach(() => {
  const dom = new JSDOM('<body></body>', { url: 'https://example.com/apply' });
  for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Event']) globalThis[key] = dom.window[key];
  setPlatform(createGmHost());
});

test('frame-qualified ids round trip and stay distinguishable from local ids', () => {
  assert.equal(remoteFieldId(7, 'field-3'), 'jcf7::field-3');
  assert.deepEqual(parseRemoteFieldId('jcf7::field-3'), { frameId: 7, fieldId: 'field-3' });
  assert.equal(isRemoteFieldId('jcf7::field-3'), true);
  assert.equal(isRemoteFieldId('field-3'), false);
  assert.equal(parseRemoteFieldId('field-3'), null);
  // Ids containing the separator must survive the round trip intact.
  assert.deepEqual(parseRemoteFieldId(remoteFieldId(2, 'a::b')), { frameId: 2, fieldId: 'a::b' });
});

test('a host without cross-frame support reports no frames and refuses commands', async () => {
  setPlatform(createGmHost());
  assert.deepEqual(await listRemoteFrames(), []);
});

test('only embedded frames that hold fields are considered', async () => {
  stubFrames({
    frames: [
      { frameId: 0, isTop: true, fieldCount: 12, url: 'https://example.com/apply' },
      { frameId: 4, isTop: false, fieldCount: 0, url: 'https://tracker.example.com/pixel' },
      { frameId: 5, isTop: false, fieldCount: 9, url: 'https://embed.example.com/form' },
    ],
  });
  const frames = await listRemoteFrames();
  assert.deepEqual(frames.map((frame) => frame.frameId), [5]);
});

test('collected fields are namespaced by frame so ids cannot collide', async () => {
  stubFrames({
    frames: [
      { frameId: 5, isTop: false, fieldCount: 2, url: 'https://embed.example.com/form' },
      { frameId: 6, isTop: false, fieldCount: 1, url: 'https://other.example.com/form' },
    ],
    respond: (frameId) => ({
      // Both frames use the same local id, which is exactly the collision risk.
      fields: frameId === 5
        ? [{ fieldId: 'field-1', type: 'text', label: 'Name' }, { fieldId: 'field-2', type: 'email', label: 'Email' }]
        : [{ fieldId: 'field-1', type: 'text', label: 'Referral' }],
    }),
  });

  const groups = await collectRemoteFields({ overwriteExisting: false });
  const ids = groups.flatMap((group) => group.fields.map((field) => field.fieldId));
  assert.deepEqual(ids, ['jcf5::field-1', 'jcf5::field-2', 'jcf6::field-1']);
  assert.equal(new Set(ids).size, ids.length);
});

test('a frame that fails to scan does not abort the other frames', async () => {
  stubFrames({
    frames: [
      { frameId: 5, isTop: false, fieldCount: 2, url: 'https://embed.example.com/form' },
      { frameId: 6, isTop: false, fieldCount: 1, url: 'https://other.example.com/form' },
    ],
    respond: (frameId) => (frameId === 5
      ? { error: 'Frame did not respond' }
      : { fields: [{ fieldId: 'field-1', type: 'text', label: 'Referral' }] }),
  });

  const groups = await collectRemoteFields();
  assert.deepEqual(groups.map((group) => group.frameId), [6]);
});

test('answers are dispatched to their owning frame with local ids restored', async () => {
  const sent = stubFrames({
    frames: [{ frameId: 5, isTop: false, fieldCount: 2, url: 'https://embed.example.com/form' }],
    respond: (frameId, command) => ({
      results: command.answers.map((answer) => ({ fieldId: answer.fieldId, status: 'verified', value: answer.value })),
    }),
  });

  const results = await applyRemoteAnswers([
    { fieldId: 'jcf5::field-1', value: 'Ada' },
    { fieldId: 'jcf5::field-2', value: 'ada@example.com' },
    { fieldId: 'jcf6::field-9', value: 'other frame' },
    { fieldId: 'local-field', value: 'ignored' },
  ]);

  const fillCommands = sent.filter((entry) => entry.command.action === 'fill');
  assert.deepEqual(fillCommands.map((entry) => entry.frameId), [5, 6]);
  // The frame receives its own ids, not the namespaced ones.
  assert.deepEqual(fillCommands[0].command.answers.map((answer) => answer.fieldId), ['field-1', 'field-2']);
  // Results come back namespaced so the panel can match them to its cache.
  assert.deepEqual(results.map((result) => result.fieldId).sort(), ['jcf5::field-1', 'jcf5::field-2', 'jcf6::field-9']);
  // Local ids are never routed to a frame.
  assert.equal(sent.some((entry) => entry.command.answers?.some((answer) => answer.fieldId === 'local-field')), false);
});

test('an unreachable frame reports every one of its answers as failed', async () => {
  stubFrames({
    frames: [{ frameId: 5, isTop: false, fieldCount: 2, url: 'https://embed.example.com/form' }],
    respond: () => ({ error: 'Receiving end does not exist' }),
  });

  const results = await applyRemoteAnswers([
    { fieldId: 'jcf5::field-1', value: 'Ada' },
    { fieldId: 'jcf5::field-2', value: 'ada@example.com' },
  ]);

  assert.equal(results.length, 2);
  assert.ok(results.every((result) => result.status === 'failed'));
  assert.ok(results.every((result) => result.error === 'Receiving end does not exist'));
});

test('search queries reach the owning frame and returned options stay namespaced', async () => {
  const sent = stubFrames({
    frames: [{ frameId: 5, isTop: false, fieldCount: 1, url: 'https://embed.example.com/form' }],
    respond: (frameId, command) => ({
      fields: command.queries.map((query) => ({
        fieldId: query.fieldId,
        type: 'combobox',
        label: 'School',
        options: [{ value: 'uw', label: 'University of Waterloo' }],
      })),
    }),
  });

  const fields = await searchRemoteOptions(null, [
    { fieldId: 'jcf5::field-1', value: '', searchQuery: 'Waterloo' },
    { fieldId: 'jcf5::field-2', value: 'already answered' },
    { fieldId: 'local-field', value: '', searchQuery: 'ignored' },
  ]);

  const searches = sent.filter((entry) => entry.command.action === 'searchOptions');
  assert.equal(searches.length, 1);
  assert.deepEqual(searches[0].command.queries, [{ fieldId: 'field-1', searchQuery: 'Waterloo' }]);
  assert.deepEqual(fields.map((field) => field.fieldId), ['jcf5::field-1']);
});

test('validation errors from embedded frames are aggregated for repair', async () => {
  stubFrames({
    frames: [
      { frameId: 5, isTop: false, fieldCount: 2, url: 'https://embed.example.com/form' },
      { frameId: 6, isTop: false, fieldCount: 1, url: 'https://other.example.com/form' },
    ],
    respond: (frameId) => (frameId === 5
      ? { errors: [{ fieldId: 'field-1', message: 'Required' }] }
      : { errors: [] }),
  });

  const errors = await collectRemoteValidation();
  assert.deepEqual(errors, [{ fieldId: 'field-1', message: 'Required' }]);
});
