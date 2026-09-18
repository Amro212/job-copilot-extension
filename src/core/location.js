// Geographic aliases are component-scoped; never fuzzy-match cities or expand
// short tokens in ordinary dropdowns (e.g. "ON" outside a location).
const key = value => String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
const regions = new Map(Object.entries({
  ab: 'alberta', bc: 'british columbia', mb: 'manitoba', nb: 'new brunswick',
  nl: 'newfoundland and labrador', ns: 'nova scotia', nt: 'northwest territories',
  nu: 'nunavut', on: 'ontario', pe: 'prince edward island', qc: 'quebec',
  sk: 'saskatchewan', yt: 'yukon',
}));
const countries = new Map(Object.entries({ ca: 'canada', can: 'canada', us: 'united states', usa: 'united states', uk: 'united kingdom', gb: 'united kingdom', gbr: 'united kingdom' }));

export function isResidenceLabel(label) {
  return /^(?:current location|your current location|where are you (?:currently )?(?:located|based)|location of residence)$/.test(key(label).replace(/[✱*:?]+$/g, '').trim());
}

export function locationMatches(candidate, requested) {
  const plain = value => key(value).replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ');
  if (plain(requested) && plain(candidate) === plain(requested)) return true;
  const parts = value => key(value).split(',').map(part => part.trim()).filter(Boolean)
    .map((part, index, all) => index === 0 ? part : index === all.length - 1 && countries.has(part)
      ? countries.get(part) : regions.get(part) || part);
  const actual = parts(candidate), expected = parts(requested);
  // A more specific suggestion may add country, but must preserve every supplied
  // component in order. Multiple matches remain unresolved by the caller.
  return expected.length > 0 && actual.length >= expected.length && expected.every((part, index) => actual[index] === part);
}
