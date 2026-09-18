import { api } from '../shared/browser.js';
import { MSG } from '../shared/protocol.js';
import { scanFormFields } from '../../../core/fields/scanner.js';

/**
 * Every frame runs an agent. Its job in Stage 2 is to announce whether this
 * frame holds form controls, so the top-frame panel can tell the difference
 * between "no fields on this page" and "the fields are in a cross-origin
 * iframe I cannot see".
 */
const ANNOUNCE_DEBOUNCE_MS = 800;

export function startAgent({ isTopFrame }) {
  let timer = null;

  function announce() {
    let fieldCount = 0;
    try {
      fieldCount = scanFormFields(document).length;
    } catch {
      fieldCount = 0;
    }
    api.runtime.sendMessage(
      { type: MSG.FRAME_ANNOUNCE, url: window.location.href, fieldCount, isTop: isTopFrame },
      () => void api.runtime.lastError,
    );
  }

  function scheduleAnnounce() {
    clearTimeout(timer);
    timer = setTimeout(announce, ANNOUNCE_DEBOUNCE_MS);
  }

  announce();

  const observer = new MutationObserver(scheduleAnnounce);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  return { announce, stop: () => { clearTimeout(timer); observer.disconnect(); } };
}
