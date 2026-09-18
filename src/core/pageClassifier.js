import { UI_IDS } from './constants.js';

export function isVisible(element) {
  if (!element || element.closest(`#${UI_IDS.CONTAINER}, #${UI_IDS.INLINE_REWRITE}, script, style, template`)) return false;
  for (let node = element; node && node.nodeType === 1; node = node.parentElement) {
    if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
    const style = node.ownerDocument.defaultView.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  }
  return true;
}

export function visibleText(root = document.body) {
  if (!root || !isVisible(root)) return '';
  return Array.from(root.childNodes).map(node => node.nodeType === 3 ? node.textContent : node.nodeType === 1 ? visibleText(node) : '').join(' ').replace(/\s+/g, ' ').trim();
}

export function classifyPage(doc = document) {
  const text = visibleText(doc.body);
  const headings = Array.from(doc.querySelectorAll('h1,h2,[role=heading]')).filter(isVisible).map(visibleText).join(' ');
  // A background anti-abuse widget is not an application-wide autofill boundary.
  // Its controls are excluded by the scanner; site validation still governs Continue.
  const boundary = /assessment|identity verification|verify your identity|(?:recorded|video) interview|e-signature|electronic signature/i.exec(headings)
    || /\bI (?:certify|attest|declare under penalty)|\b(?:sign electronically|provide your electronic signature|start (?:the |your )?(?:assessment|video interview)|verify your identity)\b/i.exec(text);
  if (boundary) return { type: 'boundary', reason: `Manual action required: ${boundary[0]}.` };
  if (/application (?:has been |was )?(?:submitted|received)|thank you for applying/i.test(text)) return { type: 'confirmation', reason: 'Application confirmation detected.' };
  const final = Array.from(doc.querySelectorAll('button,input[type=submit],[role=button]')).filter(isVisible).some(el => /\bsubmit (?:my |your |the )?application\b|\bfinal submit\b|^submit$|^apply now$/i.test(visibleText(el) || el.value || el.getAttribute('aria-label') || ''));
  if (/review (?:your )?application|final review|review and submit/i.test(headings) || final && doc.querySelector('form,input,textarea')) return { type: 'review', reason: 'Ready for review. Final submission is manual.' };
  const fields = Array.from(doc.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=search]),textarea,select,[role=combobox],[contenteditable=true]')).some(isVisible);
  if (fields) return { type: 'application', reason: 'Application fields detected.' };
  if (final) return { type: 'review', reason: 'Ready for review. Final submission is manual.' };
  if (doc.querySelector('script[type="application/ld+json"]') && /JobPosting/.test(doc.querySelector('script[type="application/ld+json"]')?.textContent || '') || /job description|about (?:the|this) (?:role|job)/i.test(text)) return { type: 'listing', reason: 'Job listing detected.' };
  return { type: 'unrelated', reason: 'No application step detected.' };
}
