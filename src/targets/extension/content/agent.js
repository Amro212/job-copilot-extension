import { api } from '../shared/browser.js';
import { MSG } from '../shared/protocol.js';
import { scanFormFields } from '../../../core/fields/scanner.js';
import { createFieldAgent } from '../../../core/agent.js';

/**
 * Every frame runs an agent. It announces whether this frame holds form controls,
 * so the panel can tell "no fields on this page" apart from "the fields live in a
 * cross-origin iframe", and it executes scan/fill commands the panel routes here.
 */
const ANNOUNCE_DEBOUNCE_MS = 800;

export function startAgent({ isTopFrame }) {
  const fieldAgent = createFieldAgent();
  let timer = null;
  let lastCount = -1;

  function countFields() {
    try {
      return scanFormFields(document).length;
    } catch {
      return 0;
    }
  }

  function announce({ force = false } = {}) {
    const fieldCount = countFields();
    // Re-announce on an unchanged count only when the registry may have expired.
    if (!force && fieldCount === lastCount && fieldCount === 0) return;
    lastCount = fieldCount;
    api.runtime.sendMessage(
      { type: MSG.FRAME_ANNOUNCE, url: window.location.href, fieldCount, isTop: isTopFrame },
      () => void api.runtime.lastError,
    );
  }

  function scheduleAnnounce() {
    clearTimeout(timer);
    timer = setTimeout(() => announce(), ANNOUNCE_DEBOUNCE_MS);
  }

  api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MSG.FRAME_COMMAND) return;
    // Re-announce alongside work so a long-lived frame never goes stale.
    announce({ force: true });
    Promise.resolve(fieldAgent.handle(message.command))
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err?.message || String(err) }));
    return true;
  });

  announce({ force: true });

  const observer = new MutationObserver(scheduleAnnounce);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // The registry expires entries after a minute of silence.
  const heartbeat = setInterval(() => announce({ force: true }), 30000);

  return {
    announce,
    stop: () => {
      clearTimeout(timer);
      clearInterval(heartbeat);
      observer.disconnect();
    },
  };
}
