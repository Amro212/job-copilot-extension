import { gmSet } from './storage.js';
import { STORAGE_KEYS } from './constants.js';
import { isVisible, visibleText } from './pageClassifier.js';

export function safeUrl(value, base = window.location.href) {
  try { const url = new URL(value, base); return /^https?:$/.test(url.protocol) ? url.href : ''; } catch { return ''; }
}

export function captureJob(doc = document) {
  let posting;
  const visit = value => {
    if (!value || typeof value !== 'object' || posting) return;
    if ([value['@type']].flat().includes('JobPosting')) { posting = value; return; }
    for (const child of Object.values(value)) if (typeof child === 'object') {
      if (Array.isArray(child)) child.forEach(visit); else visit(child);
    }
  };
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try { visit(JSON.parse(script.textContent)); } catch { /* Ignore unrelated malformed metadata. */ }
  }
  const plain = html => { const el = doc.createElement('div'); el.innerHTML = String(html || ''); return el.textContent.replace(/\s+/g, ' ').trim().slice(0, 30000); };
  const apply = Array.from(doc.querySelectorAll('a[href]')).find(el => isVisible(el) && /^(?:apply|apply now|apply for (?:this )?(?:job|position)|start application)$/i.test(visibleText(el)));
  const company = posting?.hiringOrganization?.name || doc.querySelector('[itemprop=hiringOrganization]')?.textContent?.trim() || '';
  const address = [posting?.jobLocation].flat()[0]?.address;
  const job = {
    title: plain(posting?.title || doc.querySelector('h1')?.textContent || doc.title),
    company: plain(company), companyUncertain: !company,
    location: plain(typeof address === 'string' ? address : [address?.addressLocality, address?.addressRegion, address?.addressCountry].filter(Boolean).join(', ')),
    jobId: plain(posting?.identifier?.value || (typeof posting?.identifier === 'string' ? posting.identifier : '')),
    description: plain(posting?.description || visibleText(doc.querySelector('[itemprop=description],.job-description,#job-description,article,main') || doc.body)),
    listingUrl: doc.location.href,
    applicationUrl: apply ? safeUrl(apply.getAttribute('href'), doc.location.href) : '',
    capturedAt: new Date().toISOString(),
  };
  gmSet(STORAGE_KEYS.JOB, job);
  return job;
}
