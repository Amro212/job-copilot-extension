import { test, expect } from './support/fixtures.js';

const PROFILE = {
  fullName: 'Test Applicant',
  email: 'test.applicant@example.com',
  resumeContext: 'Software engineer.',
};

test.describe('resume upload', () => {
  test('attaches the stored resume and shows the filename on the page', async ({ jc }) => {
    await jc.seed({
      profile: PROFILE,
      resume: { name: 'Amro-Resume.pdf', type: 'application/pdf', contents: '%PDF-1.4 test resume' },
    });
    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('resume-upload-fixture.html'));
    await jc.openPanel(page);
    await page.locator('#jc-autofill-btn').click();
    await expect(page.locator('#jc-autofill-btn')).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('#fullName')).not.toHaveValue('');
    await expect(page.locator('#resume-filename')).toHaveText('Amro-Resume.pdf');
    const attached = await page.locator('#resume').evaluate((el) => el.files?.[0]?.name || '');
    expect(attached).toBe('Amro-Resume.pdf');
  });
});
