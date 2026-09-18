import { test, expect } from './support/fixtures.js';

const PROFILE = {
  fullName: 'Test Applicant',
  email: 'test.applicant@example.com',
  location: 'Toronto, Ontario, Canada',
  workCountry: 'Canada',
  workAuthorization: 'Yes',
  resumeContext: 'Software engineer with production web application experience.',
};

test.describe('opt-in Auto Submit', () => {
  test('submits after the countdown when every guard passes', async ({ jc }) => {
    await jc.seed({ profile: PROFILE, settings: { autoContinue: true, autoSubmit: true } });
    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('phase3-application-fixture.html', undefined, '?scenario=validation&step=review'));
    await jc.openPanel(page);
    await page.locator('#jc-capture-job').click();
    await page.locator('#jc-start-application').click();
    await expect(page.locator('#jc-main-panel')).toContainText(/Submitting in \d+s/, { timeout: 20000 });
    await expect(page.locator('main')).toContainText(/application submitted/i, { timeout: 20000 });
  });

  test('Pause during the countdown prevents submission', async ({ jc }) => {
    await jc.seed({ profile: PROFILE, settings: { autoContinue: true, autoSubmit: true } });
    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('phase3-application-fixture.html', undefined, '?scenario=validation&step=review'));
    await jc.openPanel(page);
    await page.locator('#jc-capture-job').click();
    await page.locator('#jc-start-application').click();
    await expect(page.locator('#jc-main-panel')).toContainText(/Submitting in \d+s/, { timeout: 20000 });
    await page.locator('#jc-pause-application').click();
    await page.waitForTimeout(6000);
    const submitted = await page.evaluate(() => {
      const main = document.querySelector('main')?.textContent || '';
      return document.body.dataset.submitted === 'true' || /application submitted/i.test(main);
    });
    expect(submitted).toBe(false);
  });
});
