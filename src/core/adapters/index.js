/**
 * ATS adapter registry. Adapters supply detection, selector overrides, and
 * quirk flags on top of the generic engine. They never replace the fallback:
 * an unrecognized page still runs the shared scanner, fillers, and navigation.
 */
import { genericAdapter } from './generic.js';
import { workdayAdapter } from './workday.js';
import { greenhouseAdapter } from './greenhouse.js';
import { leverAdapter } from './lever.js';
import { ashbyAdapter } from './ashby.js';

const SPECIFIC = [workdayAdapter, greenhouseAdapter, leverAdapter, ashbyAdapter];

function currentLocation() {
  try {
    return typeof location !== 'undefined' ? location : { hostname: '', href: '' };
  } catch {
    return { hostname: '', href: '' };
  }
}

function currentDocument() {
  try {
    return typeof document !== 'undefined' ? document : null;
  } catch {
    return null;
  }
}

export function detectAdapter(loc = currentLocation(), doc = currentDocument()) {
  return SPECIFIC.find((adapter) => {
    try {
      return adapter.detect(loc, doc);
    } catch {
      return false;
    }
  }) || genericAdapter;
}

export { genericAdapter, workdayAdapter, greenhouseAdapter, leverAdapter, ashbyAdapter };
