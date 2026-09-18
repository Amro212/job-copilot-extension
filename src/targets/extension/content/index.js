import { setPlatform, platform } from '../../../core/platform.js';
import { bootstrap } from '../../../core/main.js';
import { toggleUIVisibility, refreshRemoteFieldCount } from '../../../core/ui.js';
import { createExtensionHost } from './host.js';
import { startAgent } from './agent.js';
import { api } from '../shared/browser.js';
import { MSG } from '../shared/protocol.js';

setPlatform(createExtensionHost());

const isTopFrame = window.self === window.top;

async function start() {
  // Core reads storage synchronously, so the cache must be filled before the
  // panel or the agent touches it.
  await platform.storage.ready();

  if (isTopFrame) {
    api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === MSG.TOGGLE_PANEL) {
        toggleUIVisibility();
        sendResponse({ ok: true });
        return;
      }
      if (message?.type === MSG.FRAMES_CHANGED) {
        refreshRemoteFieldCount();
        sendResponse({ ok: true });
      }
    });
    bootstrap();
  }

  startAgent({ isTopFrame });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
