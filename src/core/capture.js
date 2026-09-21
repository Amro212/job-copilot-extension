import { UI_IDS } from './constants.js';
import { getProfile } from './storage.js';
import { scanFormFields } from './fields/scanner.js';

/**
 * Turns a live ATS page into a self-contained, sanitized HTML fixture.
 *
 * Captures come from real applications, so the applicant's data must not survive
 * the trip. Everything the field engine relies on is kept: labels, ARIA wiring,
 * ids, classes, option lists, required flags, and same-origin CSS. Everything that
 * identifies a person or phones home is removed.
 */
const REDACTED = '[REDACTED]';

const PII_PATTERNS = [
  // Email
  /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  // North American and international phone shapes
  /(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
  // Government id shapes (SIN/SSN)
  /\b\d{3}[\s-]\d{2,3}[\s-]\d{3,4}\b/g,
];

const STRIP_SELECTORS = [
  'script',
  'noscript',
  'template',
  `#${UI_IDS.CONTAINER}`,
  `#${UI_IDS.INLINE_REWRITE}`,
];

/** Attributes that commonly carry the applicant's own data on ATS pages. */
const VALUE_ATTRIBUTES = ['value', 'placeholder', 'title', 'alt', 'aria-valuetext', 'data-value', 'data-email', 'data-name'];

function profileSecrets(profile) {
  const values = [
    profile.fullName, profile.email, profile.phone, profile.location,
    profile.linkedin, profile.github, profile.portfolio,
    profile.expectedSalary, profile.genderDescription,
  ];
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => value.length >= 4)
    .sort((a, b) => b.length - a.length);
}

function redactText(text, secrets) {
  if (!text) return text;
  let output = text;
  for (const secret of secrets) {
    if (!secret) continue;
    output = output.split(secret).join(REDACTED);
  }
  for (const pattern of PII_PATTERNS) {
    output = output.replace(pattern, REDACTED);
  }
  return output;
}

/** Same-origin rules are readable; cross-origin sheets throw and are dropped. */
function collectStyles(doc) {
  const blocks = [];
  for (const sheet of Array.from(doc.styleSheets || [])) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      const text = Array.from(rules).map((rule) => rule.cssText).join('\n');
      if (text.trim()) blocks.push(text);
    } catch {
      // Cross-origin stylesheet: unreadable by design.
    }
  }
  return blocks.join('\n\n');
}

function clearFormState(root) {
  for (const input of root.querySelectorAll('input')) {
    const type = (input.getAttribute('type') || 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      input.removeAttribute('checked');
    } else if (type !== 'submit' && type !== 'button' && type !== 'reset') {
      input.removeAttribute('value');
    }
  }
  for (const textarea of root.querySelectorAll('textarea')) {
    textarea.textContent = '';
  }
  for (const option of root.querySelectorAll('option')) {
    option.removeAttribute('selected');
  }
  for (const editable of root.querySelectorAll('[contenteditable="true"]')) {
    editable.textContent = '';
  }
}

function stripDangerousAttributes(root) {
  for (const element of root.querySelectorAll('*')) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      // Inline handlers would run on replay; external fetches would 404 or leak.
      if (name.startsWith('on')) element.removeAttribute(attribute.name);
      if (name === 'integrity' || name === 'nonce' || name === 'crossorigin') element.removeAttribute(attribute.name);
      if ((name === 'src' || name === 'srcset') && element.tagName === 'IMG') element.setAttribute(name, '');
    }
  }
}

function redactAttributes(root, secrets) {
  for (const element of root.querySelectorAll('*')) {
    for (const name of VALUE_ATTRIBUTES) {
      if (!element.hasAttribute(name)) continue;
      const current = element.getAttribute(name);
      const cleaned = redactText(current, secrets);
      if (cleaned !== current) element.setAttribute(name, cleaned);
    }
  }
}

function redactTextNodes(root, doc, secrets) {
  const walker = doc.createTreeWalker(root, 0x4 /* NodeFilter.SHOW_TEXT */);
  const nodes = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push(node);
    node = walker.nextNode();
  }
  for (const text of nodes) {
    const cleaned = redactText(text.nodeValue, secrets);
    if (cleaned !== text.nodeValue) text.nodeValue = cleaned;
  }
}

/** Embedded frames are captured separately, so the src points at a sibling file. */
function rewriteFrames(root, frameFiles) {
  const frames = Array.from(root.querySelectorAll('iframe'));
  frames.forEach((frame, index) => {
    const file = frameFiles[index];
    frame.setAttribute('data-kr-original-host', safeHost(frame.getAttribute('src')));
    frame.setAttribute('src', file || 'about:blank');
  });
  return frames.length;
}

function safeHost(src) {
  try {
    return new URL(src, 'https://placeholder.invalid').host;
  } catch {
    return '';
  }
}

export function fixtureFileName(url, suffix = '') {
  let host = 'capture';
  try {
    host = new URL(url).host.replace(/^www\./, '');
  } catch {}
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const slug = `${host}${suffix ? `-${suffix}` : ''}`.replace(/[^a-z0-9.-]+/gi, '-').toLowerCase();
  return `${slug}-${stamp}.html`;
}

/**
 * @returns {{ html: string, meta: object }}
 */
export function captureFixture(doc = document, { frameFiles = [], label = '' } = {}) {
  const secrets = profileSecrets(getProfile());
  const fieldCount = (() => {
    try {
      return scanFormFields(doc).length;
    } catch {
      return 0;
    }
  })();

  const clone = doc.documentElement.cloneNode(true);

  for (const selector of STRIP_SELECTORS) {
    for (const element of clone.querySelectorAll(selector)) element.remove();
  }
  // External stylesheets are replaced by the inlined rules below.
  for (const link of clone.querySelectorAll('link[rel~="stylesheet" i]')) link.remove();

  clearFormState(clone);
  stripDangerousAttributes(clone);
  redactAttributes(clone, secrets);
  redactTextNodes(clone, doc, secrets);
  const frameCount = rewriteFrames(clone, frameFiles);

  const css = collectStyles(doc);
  const head = clone.querySelector('head') || clone.insertBefore(doc.createElement('head'), clone.firstChild);
  if (css) {
    const style = doc.createElement('style');
    style.setAttribute('data-kr-inlined', 'true');
    style.textContent = css;
    head.append(style);
  }

  const meta = {
    capturedAt: new Date().toISOString(),
    url: doc.location?.href || '',
    host: doc.location?.host || '',
    title: doc.title || '',
    label,
    fieldCount,
    frameCount,
  };

  const banner = [
    '<!DOCTYPE html>',
    `<!-- Kareer captured fixture`,
    `     ${JSON.stringify(meta)}`,
    '     Applicant values, scripts, and inline handlers were removed. -->',
  ].join('\n');

  return { html: `${banner}\n${clone.outerHTML}\n`, meta };
}
