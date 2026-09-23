import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { UI_IDS } from '../../src/core/constants.js';
import { initInlineRewriteBadge } from '../../src/core/fields/highlight.js';

let dom;

beforeEach(() => {
  dom = new JSDOM(`
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          /* Ashby production CSS regression condition */
          div { line-height: 0; }
        </style>
      </head>
      <body>
        <main>
          <textarea id="cover_letter" placeholder="Type cover letter..."></textarea>
        </main>
      </body>
    </html>
  `, { url: 'https://jobs.ashbyhq.com/example/application' });

  for (const key of ['window', 'document', 'HTMLElement', 'HTMLTextAreaElement', 'Element', 'requestAnimationFrame']) {
    globalThis[key] = dom.window[key];
  }
  globalThis.Node = dom.window.Node;
  if (!globalThis.requestAnimationFrame) {
    globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  }
});

afterEach(() => {
  const existing = dom.window.document.getElementById(UI_IDS.INLINE_REWRITE);
  existing?.remove();
  dom.window.close();
});

test('inline rewrite badge mounts with Shadow DOM and defends against host line-height: 0', () => {
  let rewriteClicked = false;
  let receivedStateSetter = null;

  initInlineRewriteBadge((field, setState) => {
    rewriteClicked = true;
    receivedStateSetter = setState;
  });

  const badgeHost = dom.window.document.getElementById(UI_IDS.INLINE_REWRITE);
  assert.ok(badgeHost, 'Badge host element is attached to body');

  // Verify Shadow DOM isolation
  assert.ok(badgeHost.shadowRoot, 'Badge uses Shadow DOM for style isolation');
  const btn = badgeHost.shadowRoot.querySelector('.kr-rewrite-btn');
  assert.ok(btn, 'Rewrite button rendered inside shadow root');
  assert.match(btn.textContent, /Rewrite with AI/);

  // Focus textarea triggers positioning
  const textarea = dom.window.document.getElementById('cover_letter');
  textarea.getBoundingClientRect = () => ({
    top: 200,
    bottom: 350,
    left: 100,
    right: 600,
    width: 500,
    height: 150,
  });

  textarea.dispatchEvent(new dom.window.FocusEvent('focusin', { bubbles: true }));

  // Simulate click on shadow button
  btn.click();
  assert.equal(rewriteClicked, true, 'Clicking badge triggers rewrite callback');
  assert.equal(typeof receivedStateSetter, 'function', 'Callback receives setBadgeState function');

  // Verify state transitions
  receivedStateSetter('loading', 'Rewriting response...');
  assert.equal(btn.getAttribute('data-state'), 'loading');
  assert.match(btn.textContent, /Rewriting response\.\.\./);

  receivedStateSetter('success', 'Done ✓');
  assert.equal(btn.getAttribute('data-state'), 'success');
  assert.match(btn.textContent, /Done ✓/);
});
