import { test, expect, LEVER_HOST, ASHBY_HOST } from './support/fixtures.js';
import { readFileSync } from 'node:fs';

const PROFILE = {
  fullName: 'Test Applicant',
  email: 'test.applicant@example.com',
  resumeContext: 'Software engineer.',
};

test.describe('resume upload', () => {
  test('attaches the stored resume and shows the filename on the page', async ({ kr }) => {
    await kr.seed({
      profile: PROFILE,
      resume: { name: 'Amro-Resume.pdf', type: 'application/pdf', contents: '%PDF-1.4 test resume' },
    });
    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('resume-upload-fixture.html'));
    await kr.openPanel(page);
    await page.locator('#kr-autofill-btn').click();
    await expect(page.locator('#kr-autofill-btn')).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('#fullName')).not.toHaveValue('');
    await expect(page.locator('#resume-filename')).toHaveText('Amro-Resume.pdf');
    const attached = await page.locator('#resume').evaluate((el) => el.files?.[0]?.name || '');
    expect(attached).toBe('Amro-Resume.pdf');
  });
});

for (const [ats, host] of [['ashby', ASHBY_HOST], ['lever', LEVER_HOST]]) {
  test(`${ats} waits for resume parsing before generating and filling answers`, async ({ kr }) => {
    await kr.seed({ profile: { ...PROFILE, linkedin: 'https://linkedin.com/in/test' },
      resume: { name: 'Resume.pdf', type: 'application/pdf', contents: '%PDF-1.4 test' } });
    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('ats-race-fixture.html', host, `?ats=${ats}`));
    let requestAt;
    kr.openrouter.handler = body => {
      requestAt = Date.now();
      const { fieldsToFill } = JSON.parse(body.messages.at(-1).content);
      return { choices: [{ message: { content: JSON.stringify({ answers: fieldsToFill.map(f => ({ fieldId: f.fieldId, value: /email/i.test(f.label) ? PROFILE.email : /linkedin/i.test(f.label) ? 'https://linkedin.com/in/test' : PROFILE.fullName })) }) } }] };
    };
    await kr.openPanel(page);
    await page.locator('#kr-autofill-btn').click();
    await expect(page.locator('#kr-autofill-btn')).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('body')).toHaveAttribute('data-parse', 'complete');
    expect(requestAt).toBeGreaterThanOrEqual(Number(await page.locator('body').getAttribute('data-parsed-at')));
    await expect(page.locator('#name')).toHaveValue('Parsed Applicant');
    await expect(page.locator('#email')).toHaveValue(PROFILE.email);
    await expect(page.locator('body')).toHaveAttribute('data-submissions', '0');
    expect(kr.openrouter.requests).toHaveLength(1);
  });
}

test('resume parsing honors overwrite and workflow target rescanning', async ({ kr }) => {
  await kr.seed({ profile: PROFILE, settings: { overwriteExisting: true, autoContinue: false },
    resume: { name: 'Resume.pdf', type: 'application/pdf', contents: '%PDF-1.4 test' } });
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('ats-race-fixture.html', ASHBY_HOST, '?ats=ashby&workflow'));
  await kr.openPanel(page);
  await page.locator('#kr-capture-job').click();
  await page.locator('#kr-start-application').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Page filled. Auto Continue is off.', { timeout: 60000 });
  await expect(page.locator('body')).toHaveAttribute('data-parse', 'complete');
  await expect(page.locator('#name')).toHaveValue('Filled name');
  await expect(page.locator('#email')).toHaveValue(PROFILE.email);
  expect(kr.openrouter.requests).toHaveLength(1);
});

test('pause during resume parsing prevents AI requests and later field fills', async ({ kr }) => {
  await kr.seed({ profile: PROFILE, resume: { name: 'Resume.pdf', type: 'application/pdf', contents: '%PDF-1.4 test' } });
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('ats-race-fixture.html', ASHBY_HOST, '?ats=ashby'));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('body')).toHaveAttribute('data-parse', 'pending');
  await page.locator('#kr-pause-autofill-btn').click();
  await expect(page.locator('body')).toHaveAttribute('data-parse', 'complete');
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled();
  expect(kr.openrouter.requests).toHaveLength(0);
  await expect(page.locator('#email')).toHaveValue('');
});

test('embedded Ashby parser completes before the parent asks for answers', async ({ kr }) => {
  await kr.seed({ profile: PROFILE, resume: { name: 'Resume.pdf', type: 'application/pdf', contents: '%PDF-1.4 test' } });
  const page = await kr.context.newPage();
  await page.route('**/embedded-application.html', route => route.fulfill({ contentType: 'text/html', body:
    readFileSync(new URL('../../fixtures/ats-race-fixture.html', import.meta.url), 'utf8').replace('<body>', '<body data-ashby-root>') }));
  await page.goto(kr.fixtureUrl('embedded-host.html'));
  await kr.openPanel(page);
  await expect(page.locator('#kr-main-panel')).toContainText('embedded frame');
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Autofill complete. Review field statuses below.', { timeout: 60000 });
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('body')).toHaveAttribute('data-parse', 'complete');
  await expect(frame.locator('#name')).toHaveValue('Parsed Applicant');
  await expect(frame.locator('#email')).toHaveValue(PROFILE.email);
  expect(kr.openrouter.requests).toHaveLength(1);
});

test('stuck parsing times out without filling fields or requesting AI', async ({ kr }) => {
  await kr.seed({ profile: PROFILE, resume: { name: 'Resume.pdf', type: 'application/pdf', contents: '%PDF-1.4 test' } });
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('ats-race-fixture.html', ASHBY_HOST, '?ats=ashby&stuck'));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-main-panel')).toContainText('Resume processing did not settle', { timeout: 25000 });
  await expect(page.locator('#email')).toHaveValue('');
  expect(kr.openrouter.requests).toHaveLength(0);
});
