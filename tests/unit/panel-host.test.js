import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { UI_IDS } from '../../src/core/constants.js';
import { claimPanelHost, unmountUI } from '../../src/core/ui.js';

let dom;

beforeEach(() => {
  dom = new JSDOM('<body></body>', { url: 'https://example.com/apply' });
  for (const key of ['window', 'document', 'HTMLElement', 'Element', 'MutationObserver']) {
    globalThis[key] = dom.window[key];
  }
  globalThis.Node = dom.window.Node;
});

afterEach(() => {
  unmountUI();
  dom.window.close();
});

test('claimPanelHost claims an empty document for userscript', () => {
  const result = claimPanelHost('userscript');
  assert.equal(result.status, 'claimed');
  const root = dom.window.document.getElementById(UI_IDS.CONTAINER);
  assert.ok(root);
  assert.equal(root.getAttribute('data-kr-host'), 'userscript');
});

test('userscript yields when extension already owns the panel', () => {
  const existing = dom.window.document.createElement('div');
  existing.id = UI_IDS.CONTAINER;
  existing.setAttribute('data-kr-host', 'extension');
  dom.window.document.body.append(existing);

  const result = claimPanelHost('userscript');
  assert.equal(result.status, 'yield');
  assert.equal(dom.window.document.querySelectorAll(`#${UI_IDS.CONTAINER}`).length, 1);
  assert.equal(existing.getAttribute('data-kr-host'), 'extension');
});

test('extension replaces a userscript panel root', () => {
  const existing = dom.window.document.createElement('div');
  existing.id = UI_IDS.CONTAINER;
  existing.setAttribute('data-kr-host', 'userscript');
  dom.window.document.body.append(existing);

  const result = claimPanelHost('extension');
  assert.equal(result.status, 'claimed');
  assert.equal(dom.window.document.querySelectorAll(`#${UI_IDS.CONTAINER}`).length, 1);
  const root = dom.window.document.getElementById(UI_IDS.CONTAINER);
  assert.equal(root.getAttribute('data-kr-host'), 'extension');
  assert.notEqual(root, existing);
});

test('extension recognizes its own existing root', () => {
  const existing = dom.window.document.createElement('div');
  existing.id = UI_IDS.CONTAINER;
  existing.setAttribute('data-kr-host', 'extension');
  dom.window.document.body.append(existing);

  const result = claimPanelHost('extension');
  assert.equal(result.status, 'already-self');
  assert.equal(result.root, existing);
});
