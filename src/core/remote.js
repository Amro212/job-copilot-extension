import { platform } from './platform.js';
import { logger } from './debug.js';

/**
 * Top-frame side of cross-frame filling.
 *
 * Fields inside a cross-origin iframe are unreachable from this document, so the
 * agent in that frame does the scanning and the actuation. This module only moves
 * normalized field data and answers across, which keeps a single AI request for
 * the whole page instead of one per frame.
 */
const PREFIX = 'jcf';

export const remoteFieldId = (frameId, fieldId) => `${PREFIX}${frameId}::${fieldId}`;

export function parseRemoteFieldId(id) {
  const match = /^jcf(\d+)::(.*)$/.exec(String(id));
  return match ? { frameId: Number(match[1]), fieldId: match[2] } : null;
}

export const isRemoteFieldId = (id) => parseRemoteFieldId(id) !== null;

function ok(result) {
  return result && !result.error;
}

/** Frames other than the top one that reported form controls. */
export async function listRemoteFrames() {
  if (!platform.capabilities.crossFrame) return [];
  try {
    const frames = await platform.frames.list();
    return frames.filter((frame) => !frame.isTop && frame.fieldCount > 0);
  } catch (err) {
    logger.warn(`Could not list frames: ${err.message}`);
    return [];
  }
}

/**
 * Asks every embedded frame to scan and harvest, returning normalized fields
 * already namespaced by frame so ids cannot collide with the top document.
 */
export async function collectRemoteFields({ overwriteExisting = false } = {}) {
  const frames = await listRemoteFrames();
  if (!frames.length) return [];

  const collected = [];
  for (const frame of frames) {
    const result = await platform.frames.command(frame.frameId, { action: 'scan', overwriteExisting });
    if (!ok(result)) {
      logger.warn(`Frame ${frame.frameId} scan failed: ${result?.error || 'no response'}`);
      continue;
    }
    if (result.fields?.length) {
      logger.info(`Frame ${frame.frameId} contributed ${result.fields.length} fields from ${frame.url}`);
      collected.push({
        frameId: frame.frameId,
        url: frame.url,
        fields: result.fields.map((field) => ({ ...field, fieldId: remoteFieldId(frame.frameId, field.fieldId) })),
      });
    }
  }
  return collected;
}

/**
 * One bounded option-discovery pass inside the embedded frames, mirroring the
 * local combobox search. The follow-up AI call still happens in the top frame.
 */
export async function searchRemoteOptions(remoteGroups, answers) {
  const byFrame = new Map();
  for (const answer of answers) {
    const parsed = parseRemoteFieldId(answer.fieldId);
    if (!parsed || !answer.searchQuery) continue;
    if (!byFrame.has(parsed.frameId)) byFrame.set(parsed.frameId, []);
    byFrame.get(parsed.frameId).push({ fieldId: parsed.fieldId, searchQuery: answer.searchQuery });
  }
  if (!byFrame.size) return [];

  const refreshed = [];
  for (const [frameId, queries] of byFrame) {
    const result = await platform.frames.command(frameId, { action: 'searchOptions', queries });
    if (!ok(result) || !result.fields?.length) continue;
    refreshed.push(...result.fields.map((field) => ({ ...field, fieldId: remoteFieldId(frameId, field.fieldId) })));
  }
  return refreshed;
}

/** Dispatches answers to the frame that owns them and returns fill results. */
export async function applyRemoteAnswers(answers, onProgress) {
  const byFrame = new Map();
  for (const answer of answers) {
    const parsed = parseRemoteFieldId(answer.fieldId);
    if (!parsed) continue;
    if (!byFrame.has(parsed.frameId)) byFrame.set(parsed.frameId, []);
    byFrame.get(parsed.frameId).push({ ...answer, fieldId: parsed.fieldId });
  }

  const results = [];
  for (const [frameId, frameAnswers] of byFrame) {
    onProgress?.(frameId, frameAnswers.length);
    const result = await platform.frames.command(frameId, { action: 'fill', answers: frameAnswers });
    if (!ok(result)) {
      logger.warn(`Frame ${frameId} fill failed: ${result?.error || 'no response'}`);
      for (const answer of frameAnswers) {
        results.push({ fieldId: remoteFieldId(frameId, answer.fieldId), status: 'failed', error: result?.error || 'Frame did not respond' });
      }
      continue;
    }
    for (const entry of result.results || []) {
      results.push({ ...entry, fieldId: remoteFieldId(frameId, entry.fieldId) });
    }
  }
  return results;
}

/** Sanitized fixture snapshots from each embedded frame, for the capture tool. */
export async function captureRemoteFixtures(label = '') {
  const frames = await listRemoteFrames();
  const captures = [];
  for (const frame of frames) {
    const result = await platform.frames.command(frame.frameId, { action: 'captureFixture', label });
    if (ok(result) && result.html) {
      captures.push({ frameId: frame.frameId, url: frame.url, html: result.html, meta: result.meta });
    }
  }
  return captures;
}

/** Aggregated validation errors from embedded frames, for workflow repair. */
export async function collectRemoteValidation() {
  const frames = await listRemoteFrames();
  const errors = [];
  for (const frame of frames) {
    const result = await platform.frames.command(frame.frameId, { action: 'validation' });
    if (ok(result) && result.errors?.length) errors.push(...result.errors);
  }
  return errors;
}

export async function applyRemoteResumeUploads({ overwriteExisting = false } = {}) {
  const frames = await listRemoteFrames();
  const results = [];
  for (const frame of frames) {
    const result = await platform.frames.command(frame.frameId, { action: 'uploadResume', overwriteExisting });
    if (!ok(result)) throw new Error(result?.error || 'Embedded resume upload did not finish.');
    for (const entry of result.results || []) {
      results.push({ ...entry, fieldId: remoteFieldId(frame.frameId, entry.fieldId) });
    }
  }
  return results;
}

export async function locateRemoteField(remoteId) {
  const parsed = parseRemoteFieldId(remoteId);
  if (!parsed) return false;
  const result = await platform.frames.command(parsed.frameId, { action: 'locate', fieldId: parsed.fieldId });
  return Boolean(result && !result.error);
}

/** Lightweight field discovery across embedded frames without option harvesting. */
export async function inspectRemoteFields() {
  const frames = await listRemoteFrames();
  if (!frames.length) return [];

  const collected = [];
  for (const frame of frames) {
    const result = await platform.frames.command(frame.frameId, { action: 'inspect' });
    if (ok(result) && result.fields?.length) {
      collected.push(...result.fields.map((field) => ({
        ...field,
        id: remoteFieldId(frame.frameId, field.fieldId),
        fieldId: remoteFieldId(frame.frameId, field.fieldId),
        frameId: frame.frameId,
        frameUrl: frame.url,
      })));
    }
  }
  return collected;
}


