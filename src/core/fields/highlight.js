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
    element.style.outline = '2px solid #38bdf8';
    element.style.outlineOffset = '2px';
  } catch {}
}

export function highlightVerifiedField(element) {
  try {
    if (!element || !element.isConnected) return;
    element.style.outline = '2px solid #10b981';
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
    element.style.outline = '2px solid #ef4444';
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

/**
 * Attaches a floating "✨ Rewrite with AI" badge near focused narrative fields
 */
export function initInlineRewriteBadge(onRewriteClick) {
  if (document.getElementById(UI_IDS.INLINE_REWRITE)) {
    return;
  }

  inlineRewriteEl = document.createElement('div');
  inlineRewriteEl.id = UI_IDS.INLINE_REWRITE;
  inlineRewriteEl.innerHTML = '✨ Rewrite with AI';
  inlineRewriteEl.style.cssText = `
    position: absolute;
    display: none;
    z-index: 2147483645;
    background: linear-gradient(135deg, #2563eb, #1d4ed8);
    color: #ffffff;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    user-select: none;
    transition: opacity 0.15s ease, transform 0.15s ease;
    opacity: 0;
    transform: translateY(4px);
  `;

  inlineRewriteEl.addEventListener('mouseenter', () => {
    inlineRewriteEl.style.transform = 'translateY(0) scale(1.05)';
  });
  inlineRewriteEl.addEventListener('mouseleave', () => {
    inlineRewriteEl.style.transform = 'translateY(0) scale(1)';
  });

  inlineRewriteEl.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentFocusedNarrativeField && typeof onRewriteClick === 'function') {
      onRewriteClick(currentFocusedNarrativeField);
    }
  });

  document.body.appendChild(inlineRewriteEl);

  document.addEventListener('focusin', (e) => {
    const target = e.target;
    if (target instanceof HTMLTextAreaElement || target.getAttribute('contenteditable') === 'true') {
      currentFocusedNarrativeField = target;
      positionRewriteBadge(target);
    }
  });

  document.addEventListener('focusout', (e) => {
    setTimeout(() => {
      if (document.activeElement !== currentFocusedNarrativeField && !inlineRewriteEl?.matches(':hover')) {
        hideRewriteBadge();
      }
    }, 250);
  });
}

function positionRewriteBadge(target) {
  if (!inlineRewriteEl || !target) return;

  const rect = target.getBoundingClientRect();
  const top = window.scrollY + rect.top - 28;
  const left = window.scrollX + rect.right - 130;

  inlineRewriteEl.style.top = `${Math.max(10, top)}px`;
  inlineRewriteEl.style.left = `${Math.max(10, left)}px`;
  inlineRewriteEl.style.display = 'block';

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
    if (inlineRewriteEl.style.opacity === '0') {
      inlineRewriteEl.style.display = 'none';
    }
  }, 150);
}
