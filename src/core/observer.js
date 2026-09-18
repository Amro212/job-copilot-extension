import { UI_IDS } from './constants.js';

let mutationObserver = null;
let debounceTimeout = null;
let onFormChangeCallback = null;

function isInsideCopilot(node) {
  if (!node || !(node instanceof Element)) return false;
  return Boolean(node.closest(`#${UI_IDS.CONTAINER}`) || node.closest(`#${UI_IDS.INLINE_REWRITE}`));
}

let isPaused = false;

export function pauseFormObserver() {
  isPaused = true;
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
    debounceTimeout = null;
  }
}

export function resumeFormObserver() {
  isPaused = false;
}

export function startFormObserver(callback) {
  onFormChangeCallback = callback;

  if (mutationObserver) {
    mutationObserver.disconnect();
  }

  mutationObserver = new MutationObserver((mutations) => {
    if (isPaused) return;

    let hasRelevantMutation = false;

    for (const m of mutations) {
      if (isInsideCopilot(m.target)) continue;

      if (m.type === 'childList') {
        for (const node of m.addedNodes) {
          if (node instanceof Element && !isInsideCopilot(node)) {
            if (node.matches('input, textarea, select, form') || node.querySelector('input, textarea, select, form')) {
              hasRelevantMutation = true;
              break;
            }
          }
        }
      }
      if (hasRelevantMutation) break;
    }

    if (hasRelevantMutation) {
      if (debounceTimeout) clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        if (typeof onFormChangeCallback === 'function') {
          onFormChangeCallback();
        }
      }, 600);
    }
  });

  mutationObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
}

export function stopFormObserver() {
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
    debounceTimeout = null;
  }
}

