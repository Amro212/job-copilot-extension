import { isResidenceLabel, locationMatches } from './location.js';

const yesNo = ['Yes', 'No'];
const disclosure = ['Yes', 'No', 'Prefer not to answer'];

export const PROFILE_SECTIONS = [
  { title: 'Work eligibility', description: 'Authorization and sponsorship answers apply only to this work country. Leave unknown answers unset.', fields: [
    { name: 'workCountry', label: 'Work country', placeholder: 'e.g. Canada' },
    { name: 'workAuthorization', label: 'Authorized to work in this country?', options: yesNo },
    { name: 'sponsorshipNow', label: 'Require sponsorship now?', options: yesNo },
    { name: 'sponsorshipFuture', label: 'Require sponsorship in the future?', options: yesNo },
  ] },
  { title: 'Work preferences', description: 'Save answers you want reused across applications.', fields: [
    { name: 'workArrangement', label: 'Preferred work arrangement', options: ['Remote', 'Hybrid', 'Onsite', 'Flexible'] },
    { name: 'willingToRelocate', label: 'Willing to relocate?', options: [...yesNo, 'Depends on the opportunity'] },
    { name: 'travelAvailability', label: 'Willingness to travel', placeholder: 'e.g. Up to 25%' },
    { name: 'startDate', label: 'Earliest start date', type: 'date' },
    { name: 'noticePeriod', label: 'Notice period', placeholder: 'e.g. Two weeks or available immediately' },
  ] },
  { title: 'Compensation', description: 'Include currency and pay period so your expectations are unambiguous.', fields: [
    { name: 'expectedSalary', label: 'Expected salary or range', placeholder: 'e.g. 90000–110000' },
    { name: 'salaryCurrency', label: 'Currency', placeholder: 'e.g. CAD, USD, GBP' },
    { name: 'salaryPeriod', label: 'Pay period', options: ['Annual', 'Monthly', 'Hourly'] },
  ] },
  { title: 'Background', description: 'Your context below still supplies detailed experience, projects and qualifications.', fields: [
    { name: 'educationLevel', label: 'Highest education level', options: ['High school', 'Associate degree', "Bachelor's degree", "Master's degree", 'Doctorate', 'Professional degree', 'Other'] },
    { name: 'yearsExperience', label: 'Total years of professional experience', type: 'number', placeholder: 'e.g. 3', min: '0', step: '0.5' },
    { name: 'languages', label: 'Languages and proficiency', placeholder: 'e.g. English (fluent), French (intermediate)' },
  ] },
  { title: 'Optional self-identification', description: 'Not set leaves the answer blank. Choose “Prefer not to answer” to decline disclosure. These answers are never guessed.', fields: [
    { name: 'gender', label: 'Gender', options: ['Woman', 'Man', 'Non-binary', 'Self-describe', 'Prefer not to answer'] },
    { name: 'genderDescription', label: 'Gender self-description (if selected)', placeholder: 'Your own description' },
    { name: 'pronouns', label: 'Pronouns', placeholder: 'e.g. she/her, he/him, they/them, Prefer not to answer' },
    { name: 'raceEthnicity', label: 'Race / ethnicity', placeholder: 'Your self-description or Prefer not to answer' },
    { name: 'disabilityStatus', label: 'Disability (current or past)', options: disclosure },
    { name: 'veteranStatus', label: 'Veteran status', options: disclosure },
  ] },
];

export const PROFILE_FIELDS = PROFILE_SECTIONS.flatMap(section => section.fields);
export const STRUCTURED_PROFILE_DEFAULTS = Object.fromEntries(PROFILE_FIELDS.map(field => [field.name, '']));

export function profileForAI(profile) {
  const keys = ['fullName', 'email', 'phone', 'location', 'linkedin', 'github', 'portfolio', ...PROFILE_FIELDS.map(field => field.name)];
  return Object.fromEntries(keys.map(key => [key, profile[key] || '']));
}

const normalize = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
const isDecline = value => /^(prefer not to (?:answer|say|disclose)|(?:i )?(?:do not|dont) (?:wish|want) to (?:answer|disclose)|decline(?: to (?:state|answer|identify|disclose))?)$/.test(normalize(value));

function matchesDemographicOption(key, value, label) {
  const option = normalize(label);
  if (key === 'gender') {
    return (value === 'Woman' && option === 'female') || (value === 'Man' && option === 'male');
  }
  if (key === 'disabilityStatus') {
    return (value === 'Yes' && /^yes i have a disability\b/.test(option)) ||
      (value === 'No' && /^no i (?:do not|dont) have a disability\b/.test(option));
  }
  return false;
}

// Restrict overrides to recognizable questions; narrative experience and referral
// questions remain grounded by the AI rather than being replaced by a short value.
export function fixedProfileAnswer(field, profile, { allowSearch = true } = {}) {
  const label = normalize(field.label);
  if (['text', 'textarea', 'url'].includes(field.type)) {
    const key = isResidenceLabel(field.label) ? 'location' : /^(?:your )?linkedin(?: (?:url|link|profile|profile url|profile link))?$/.test(label) ? 'linkedin' : null;
    if (key && profile[key]?.trim()) return { fieldId: field.fieldId, value: profile[key].trim(), inferred: false };
  }
  // Only explicit residence questions: bare "Location" can refer to an employer.
  if (field.type === 'combobox' && isResidenceLabel(field.label) && profile.location?.trim()) {
    const location = profile.location.trim();
    const matches = (field.options || []).filter(option => locationMatches(option.label, location));
    return { fieldId: field.fieldId, value: matches.length === 1 ? matches[0].label : '', inferred: false,
      ...(!matches.length && allowSearch ? { searchQuery: location } : {}) };
  }
  const source = /^(?:how (?:did|do) you (?:hear|learn) about\b|where did you (?:hear about|find|learn about|see) (?:us|this (?:job|role|position|opportunity|opening)|(?:the|our) (?:job|company|role|position|opportunity|opening))\b|(?:application|applicant|referral|recruitment|job) source$|source$)/.test(label);
  let key;
  if (/^(?:what (?:is|are) your |your |please (?:select|specify|indicate) your )?(?:gender(?: identity)?|pronouns|race(?: (?:and )?ethnicity)?|ethnicity|disability(?: status)?|veteran(?: status)?)(?: optional)?$/.test(label)) {
    if (/\bgender\b/.test(label)) key = 'gender';
    else if (/\bpronouns\b/.test(label)) key = 'pronouns';
    else if (/\b(?:race|ethnicity)\b/.test(label)) key = 'raceEthnicity';
    else if (/\bdisability\b/.test(label)) key = 'disabilityStatus';
    else if (/\bveteran\b/.test(label)) key = 'veteranStatus';
  }
  if (/^do you have (?:a |any )?disabilit(?:y|ies)$/.test(label)) key = 'disabilityStatus';
  if (!source && !key) return null;
  let value = source ? 'LinkedIn' : profile[key] || '';
  if (key === 'gender' && value === 'Self-describe') value = profile.genderDescription || '';
  const answer = { fieldId: field.fieldId, value, inferred: false };
  if (!value || !['select', 'combobox', 'radio', 'checkbox'].includes(field.type)) return answer;
  const options = field.options || [];
  const matches = options.filter(option => normalize(option.label) === normalize(value) || normalize(option.value) === normalize(value) ||
    (source && /^(?:linkedin jobs|linkedincom)$/.test(normalize(option.label))) ||
    (isDecline(value) && isDecline(option.label)) || matchesDemographicOption(key, value, option.label));
  // Ambiguous or absent options must remain unanswered. Combobox discovery can
  // search for LinkedIn, but a search string is never treated as a selection.
  const match = matches.length === 1 ? matches[0] : null;
  answer.value = match ? field.type === 'combobox' ? match.label : match.value : '';
  if (source && !match && field.type === 'combobox' && allowSearch) answer.searchQuery = 'LinkedIn';
  return answer;
}
