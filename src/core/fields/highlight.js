import { UI_IDS } from '../constants.js';

let inlineRewriteEl = null;
let currentFocusedNarrativeField = null;

export function scrollToField(element) {
  try {
    if (!element || !element.isConnected) return;
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });
  } catch {
    try {
      element?.scrollIntoView?.(true);
    } catch {}
  }
}

export function highlightActiveField(element) {
  try {
    if (!element || !element.isConnected) return;
    element.style.transition = 'box-shadow 0.2s ease, outline 0.2s ease';
    element.style.outline = '2px solid #62C8FF';
    element.style.outlineOffset = '2px';
  } catch {}
}

export function highlightVerifiedField(element) {
  try {
    if (!element || !element.isConnected) return;
    element.style.outline = '2px solid #52D98C';
    element.style.outlineOffset = '2px';

    setTimeout(() => {
      try {
        if (element && element.isConnected) {
          element.style.outline = '';
          element.style.outlineOffset = '';
        }
      } catch {}
    }, 2000);
  } catch {}
}

export function highlightFailedField(element) {
  try {
    if (!element || !element.isConnected) return;
    element.style.outline = '2px solid #F06A6A';
    element.style.outlineOffset = '2px';
  } catch {}
}

export function clearHighlights(elements = []) {
  for (const el of elements) {
    try {
      if (el && el.isConnected) {
        el.style.outline = '';
        el.style.outlineOffset = '';
      }
    } catch {}
  }
}

const BADGE_ICONS = {
  spark: `<svg class="kr-rewrite-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
    <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
  </svg>`,
  spin: `<svg class="kr-rewrite-icon kr-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>`,
  check: `<svg class="kr-rewrite-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>`,
  error: `<svg class="kr-rewrite-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>`,
};

/**
 * Attaches a floating "Rewrite with AI" badge near focused narrative fields.
 * Uses Shadow DOM and explicit CSS properties to prevent host page styles
 * (e.g. Ashby's global `div { line-height: 0 }` rule) from collapsing the badge.
 */
export function initInlineRewriteBadge(onRewriteClick) {
  if (document.getElementById(UI_IDS.INLINE_REWRITE)) {
    return;
  }

  inlineRewriteEl = document.createElement('div');
  inlineRewriteEl.id = UI_IDS.INLINE_REWRITE;
  inlineRewriteEl.style.cssText = `
    position: absolute !important;
    display: none !important;
    z-index: 2147483645 !important;
    line-height: normal !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    box-sizing: border-box !important;
    opacity: 0;
    transform: translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease;
    pointer-events: auto !important;
  `;

  const shadow = inlineRewriteEl.attachShadow
    ? inlineRewriteEl.attachShadow({ mode: 'open' })
    : inlineRewriteEl;

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    @keyframes kr-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .kr-rewrite-btn {
      all: initial;
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      height: 26px !important;
      box-sizing: border-box !important;
      padding: 0 10px !important;
      background: #0D1117 !important;
      color: #F2F5F7 !important;
      border: 1px solid #26303D !important;
      border-radius: 6px !important;
      font-family: 'Kareer Geist', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
      font-size: 11px !important;
      font-weight: 500 !important;
      line-height: 1 !important;
      cursor: pointer !important;
      user-select: none !important;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45) !important;
      white-space: nowrap !important;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
    }
    .kr-rewrite-btn:hover {
      background: #1A222D !important;
      border-color: #A3E635 !important;
      color: #FFFFFF !important;
      transform: translateY(-1px);
    }
    .kr-rewrite-btn:active {
      transform: translateY(0) scale(0.98);
    }
    .kr-rewrite-icon {
      width: 12px !important;
      height: 12px !important;
      color: #A3E635 !important;
      flex-shrink: 0 !important;
      display: block !important;
    }
    .kr-spin {
      animation: kr-spin 0.8s linear infinite !important;
    }
    .kr-rewrite-btn[data-state="loading"] {
      pointer-events: none !important;
      border-color: #344152 !important;
      color: #A8B2BF !important;
      cursor: wait !important;
    }
    .kr-rewrite-btn[data-state="success"] {
      border-color: #52D98C !important;
      color: #52D98C !important;
    }
    .kr-rewrite-btn[data-state="success"] .kr-rewrite-icon {
      color: #52D98C !important;
    }
    .kr-rewrite-btn[data-state="error"] {
      border-color: #F06A6A !important;
      color: #F06A6A !important;
    }
    .kr-rewrite-btn[data-state="error"] .kr-rewrite-icon {
      color: #F06A6A !important;
    }
  `;
  shadow.appendChild(styleEl);

  const btn = document.createElement('button');
  btn.className = 'kr-rewrite-btn';
  btn.type = 'button';
  btn.setAttribute('data-state', 'idle');
  btn.innerHTML = `${BADGE_ICONS.spark}<span>Rewrite with AI</span>`;
  shadow.appendChild(btn);

  function setBadgeState(state, customLabel) {
    if (!btn) return;
    btn.setAttribute('data-state', state);
    if (state === 'loading') {
      btn.innerHTML = `${BADGE_ICONS.spin}<span>${customLabel || 'Rewriting...'}</span>`;
    } else if (state === 'success') {
      btn.innerHTML = `${BADGE_ICONS.check}<span>${customLabel || 'Rewritten ✓'}</span>`;
    } else if (state === 'error') {
      btn.innerHTML = `${BADGE_ICONS.error}<span>${customLabel || 'Rewrite failed'}</span>`;
    } else {
      btn.innerHTML = `${BADGE_ICONS.spark}<span>${customLabel || 'Rewrite with AI'}</span>`;
    }
  }

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentFocusedNarrativeField && typeof onRewriteClick === 'function') {
      onRewriteClick(currentFocusedNarrativeField, setBadgeState);
    }
  });

  document.body.appendChild(inlineRewriteEl);

  document.addEventListener('focusin', (e) => {
    const target = e.target;
    if (!target || typeof target.getAttribute !== 'function') return;
    if (target.tagName === 'TEXTAREA' || target.getAttribute('contenteditable') === 'true') {
      currentFocusedNarrativeField = target;
      positionRewriteBadge(target);
    }
  });

  document.addEventListener('focusout', (e) => {
    setTimeout(() => {
      const isHovered = inlineRewriteEl?.matches(':hover') || btn?.matches(':hover');
      if (document.activeElement !== currentFocusedNarrativeField && !isHovered) {
        hideRewriteBadge();
      }
    }, 250);
  });
}

function positionRewriteBadge(target) {
  if (!inlineRewriteEl || !target) return;

  const rect = target.getBoundingClientRect();
  const top = window.scrollY + rect.top - 32;
  const left = window.scrollX + rect.right - 135;

  inlineRewriteEl.style.setProperty('top', `${Math.max(10, top)}px`, 'important');
  inlineRewriteEl.style.setProperty('left', `${Math.max(10, left)}px`, 'important');
  inlineRewriteEl.style.setProperty('display', 'block', 'important');

  requestAnimationFrame(() => {
    inlineRewriteEl.style.opacity = '1';
    inlineRewriteEl.style.transform = 'translateY(0)';
  });
}

function hideRewriteBadge() {
  if (!inlineRewriteEl) return;
  inlineRewriteEl.style.opacity = '0';
  inlineRewriteEl.style.transform = 'translateY(4px)';
  setTimeout(() => {
    if (inlineRewriteEl && inlineRewriteEl.style.opacity === '0') {
      inlineRewriteEl.style.setProperty('display', 'none', 'important');
    }
  }, 150);
}

