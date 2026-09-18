import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getProfile, saveProfile, saveApiKey, gmSet } from '../../src/core/storage.js';
import { generateAutofillAnswers, rewriteNarrativeField } from '../../src/core/ai.js';

let payload;
function respond(answers) {
  globalThis.GM_xmlhttpRequest = options => {
    payload = JSON.parse(options.data);
    options.onload({ status: 200, responseText: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answers }) } }] }) });
  };
}
beforeEach(() => {
  globalThis.window = { location: { href: 'https://example.com/apply', hostname: 'example.com' } };
  saveProfile({});
  saveApiKey('fixture-key');
  respond([]);
});

test('legacy profiles gain unset fields without losing their context', () => {
  gmSet('jc:profile', { fullName: 'Sample Applicant', resumeContext: 'Detailed history', applicantNotes: 'Personal notes' });
  const profile = getProfile();
  assert.equal(profile.workAuthorization, '');
  assert.equal(profile.gender, '');
  assert.equal(profile.resumeContext, 'Detailed history');
  assert.equal(profile.applicantNotes, 'Personal notes');
});

test('residence grounding recognizes Canadian abbreviations without choosing another Toronto', async () => {
  saveProfile({ location: 'Toronto, Ontario' });
  const field = { fieldId: 'residence', label: 'Current location', type: 'combobox', options: [
    { label: 'Toronto, OH, USA' }, { label: 'Toronto, ON, CAN' }, { label: 'Toronto, Durham, England, GBR' },
  ] };
  const { answers } = await generateAutofillAnswers([field]);
  assert.equal(answers[0].value, 'Toronto, ON, CAN');
  saveProfile({ location: 'Toronto' });
  const ambiguous = await generateAutofillAnswers([field]);
  assert.equal(ambiguous.answers[0].value, '');
});

test('explicit current location uses full profile location and rejects other cities', async () => {
  saveProfile({ location: 'London, Ontario, Canada' });
  respond([{ fieldId: 'residence', value: 'London, UK' }]);
  const { answers } = await generateAutofillAnswers([{ fieldId: 'residence', label: 'Current location', type: 'combobox', options: [{ value: 'uk', label: 'London, UK' }] }]);
  assert.equal(answers[0].value, '');
  assert.equal(answers[0].searchQuery, 'London, Ontario, Canada');
});

test('location grounding chooses one complete match and leaves employer location to context', async () => {
  saveProfile({ location: 'London, Ontario, Canada' });
  respond([{ fieldId: 'employer', value: 'Ottawa' }]);
  const { answers } = await generateAutofillAnswers([
    { fieldId: 'residence', label: 'Current location', type: 'combobox', options: [{ value: 'ca', label: 'London, Ontario, Canada' }, { value: 'uk', label: 'London, UK' }] },
    { fieldId: 'employer', label: 'Employer location', type: 'text' },
  ]);
  assert.equal(answers.find(a => a.fieldId === 'residence')?.value, 'London, Ontario, Canada');
  assert.equal(answers.find(a => a.fieldId === 'employer')?.value, 'Ottawa');
});

test('location grounding leaves duplicate matches and exhausted searches unresolved', async () => {
  saveProfile({ location: 'London, Ontario, Canada' });
  respond([{ fieldId: 'residence', value: 'London, UK' }]);
  const field = { fieldId: 'residence', label: 'Current location', type: 'combobox' };
  const duplicate = { value: 'ca', label: 'London, Ontario, Canada' };
  const first = await generateAutofillAnswers([{ ...field, options: [duplicate, { ...duplicate, value: 'ca2' }] }]);
  assert.equal(first.answers[0].value, '');
  assert.equal(first.answers[0].searchQuery, undefined);
  const final = await generateAutofillAnswers([{ ...field, options: [{ value: 'uk', label: 'London, UK' }] }], { allowSearch: false });
  assert.equal(final.answers[0].value, '');
  assert.equal(final.answers[0].searchQuery, undefined);
});

test('primary and repair requests carry explicit country-scoped answers', async () => {
  saveProfile({ workCountry: 'Canada', workAuthorization: 'Yes', sponsorshipNow: 'No', sponsorshipFuture: 'Yes', gender: 'Woman', expectedSalary: '95000', salaryCurrency: 'CAD', applicantNotes: 'Older conflicting notes' });
  await generateAutofillAnswers([], { repairErrors: [{ message: 'Required answer' }] });
  const content = JSON.parse(payload.messages[1].content);
  assert.equal(content.applicantProfile.workCountry, 'Canada');
  assert.equal(content.applicantProfile.sponsorshipFuture, 'Yes');
  assert.equal(content.applicantProfile.gender, 'Woman');
  assert.equal(content.applicantProfile.salaryCurrency, 'CAD');
  assert.match(payload.messages[0].content, /explicit.*(?:priority|precedence)/i);
  assert.doesNotMatch(payload.messages[0].content, /standard is Yes|standard is No|select a standard valid option/);
});

test('LinkedIn source overrides model answers, including omissions, without altering referrals', async () => {
  respond([{ fieldId: 'source', value: 'Indeed' }, { fieldId: 'referral', value: 'Pat' }]);
  const { answers } = await generateAutofillAnswers([
    { fieldId: 'source', label: 'How did you hear about us?', type: 'text' },
    { fieldId: 'otherSource', label: 'Where did you find this job?', type: 'text' },
    { fieldId: 'referral', label: 'Employee referral name', type: 'text' },
  ]);
  assert.equal(answers.find(a => a.fieldId === 'source').value, 'LinkedIn');
  assert.equal(answers.find(a => a.fieldId === 'otherSource').value, 'LinkedIn');
  assert.equal(answers.find(a => a.fieldId === 'referral').value, 'Pat');
});

test('source dropdowns use only owned LinkedIn options; missing option stays empty', async () => {
  respond([{ fieldId: 'found', value: 'indeed' }, { fieldId: 'missing', value: 'Other' }]);
  const { answers } = await generateAutofillAnswers([
    { fieldId: 'found', label: 'How did you hear about this position?', type: 'select', options: [{ value: 'li', label: 'LinkedIn' }, { value: 'indeed', label: 'Indeed' }] },
    { fieldId: 'missing', label: 'How did you hear about us?', type: 'combobox', options: [{ value: 'other', label: 'Other' }] },
  ]);
  assert.equal(answers.find(a => a.fieldId === 'found').value, 'li');
  assert.equal(answers.find(a => a.fieldId === 'missing').value, '');
  assert.equal(answers.find(a => a.fieldId === 'missing').searchQuery, 'LinkedIn');
});

test('unset demographics reject model guesses while explicit decline maps to offered choice', async () => {
  saveProfile({ disabilityStatus: 'Prefer not to answer' });
  respond([{ fieldId: 'gender', value: 'Man' }, { fieldId: 'disability', value: 'No' }]);
  const { answers } = await generateAutofillAnswers([
    { fieldId: 'gender', label: 'Gender', type: 'text' },
    { fieldId: 'disability', label: 'Disability status', type: 'select', options: [{ value: 'no', label: 'No' }, { value: 'decline', label: 'I do not wish to answer' }] },
  ]);
  assert.equal(answers.find(a => a.fieldId === 'gender').value, '');
  assert.equal(answers.find(a => a.fieldId === 'disability').value, 'decline');
});

test('rewrite receives structured profile as well as both context sections', async () => {
  saveProfile({ workCountry: 'Canada', noticePeriod: 'Two weeks', resumeContext: 'Resume detail', applicantNotes: 'Extra notes' });
  await rewriteNarrativeField({ fieldLabel: 'When can you start?', currentValue: '' });
  assert.match(payload.messages[1].content, /Two weeks/);
  assert.match(payload.messages[1].content, /Canada/);
  assert.match(payload.messages[1].content, /Resume detail/);
  assert.match(payload.messages[1].content, /Extra notes/);
});

test('explicit demographics map common long labels without borrowing unrelated options', async () => {
  saveProfile({ gender: 'Woman', disabilityStatus: 'No', veteranStatus: 'Prefer not to answer' });
  const { answers } = await generateAutofillAnswers([
    { fieldId: 'gender', label: 'Gender', type: 'radio', options: [{ value: 'f', label: 'Female' }, { value: 'm', label: 'Male' }] },
    { fieldId: 'disability', label: 'Do you have a disability?', type: 'select', options: [{ value: 'yes', label: 'Yes, I have a disability, or have had one in the past' }, { value: 'no', label: 'No, I do not have a disability and have not had one in the past' }] },
    { fieldId: 'veteran', label: 'Veteran status', type: 'combobox', options: [{ value: 'decline', label: "I don't wish to answer" }] },
  ]);
  assert.equal(answers.find(a => a.fieldId === 'gender').value, 'f');
  assert.equal(answers.find(a => a.fieldId === 'disability').value, 'no');
  assert.equal(answers.find(a => a.fieldId === 'veteran').value, "I don't wish to answer");
});

test('identity overrides do not turn adjacent narrative or birth-sex questions into demographic answers', async () => {
  saveProfile({ gender: 'Woman', raceEthnicity: 'Asian' });
  respond([{ fieldId: 'birth', value: '' }, { fieldId: 'narrative', value: 'My project experience.' }]);
  const { answers } = await generateAutofillAnswers([
    { fieldId: 'birth', label: 'Gender assigned at birth', type: 'text' },
    { fieldId: 'narrative', label: 'Race and ethnicity research experience', type: 'textarea' },
  ]);
  assert.equal(answers.find(a => a.fieldId === 'birth').value, '');
  assert.equal(answers.find(a => a.fieldId === 'narrative').value, 'My project experience.');
});

test('final source search never invents options or requests another search', async () => {
  const { answers } = await generateAutofillAnswers([{ fieldId: 'source', label: 'How did you hear about us?', type: 'combobox', options: [{ value: 'other', label: 'Other' }] }], { allowSearch: false });
  assert.equal(answers[0].value, '');
  assert.equal(answers[0].searchQuery, undefined);
});

test('source recognizes LinkedIn Jobs and LinkedIn.com labels', async () => {
  const { answers } = await generateAutofillAnswers([
    { fieldId: 'jobs', label: 'How did you hear about us?', type: 'select', options: [{ value: 'li', label: 'LinkedIn Jobs' }] },
    { fieldId: 'domain', label: 'Where did you see this position?', type: 'radio', options: [{ value: 'web', label: 'LinkedIn.com' }] },
  ]);
  assert.equal(answers.find(a => a.fieldId === 'jobs').value, 'li');
  assert.equal(answers.find(a => a.fieldId === 'domain').value, 'web');
});

test('source does not overwrite unrelated questions that share a discovery prefix', async () => {
  respond([{ fieldId: 'experience', value: 'While working on a compiler project.' }]);
  const { answers } = await generateAutofillAnswers([{ fieldId: 'experience', label: 'Where did you find the most challenging technical problem in your previous role?', type: 'textarea' }]);
  assert.equal(answers[0].value, 'While working on a compiler project.');
});
