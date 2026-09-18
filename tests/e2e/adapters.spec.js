import { test, expect, WORKDAY_HOST, GREENHOUSE_HOST, LEVER_HOST, ASHBY_HOST } from './support/fixtures.js';

const PROFILE = {
  fullName: 'Test Applicant',
  email: 'test.applicant@example.com',
  phone: '+1 555 0100',
  location: 'Toronto, Ontario, Canada',
  linkedin: 'https://linkedin.com/in/test-applicant',
  workCountry: 'Canada',
  workAuthorization: 'Yes',
  resumeContext: 'Software engineer who has shipped production web applications end to end.',
};

test.describe('ATS adapters', () => {
  test('Workday fixture is detected and fills legal name plus the custom dropdown', async ({ jc }) => {
    await jc.seed({ profile: PROFILE });
    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('workday-application-fixture.html', WORKDAY_HOST));
    await jc.openPanel(page);
    await expect(page.locator('#jc-main-panel')).toContainText('Workday adapter');
    await page.locator('#jc-autofill-btn').click();
    await expect(page.locator('#jc-autofill-btn')).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('#legalName')).not.toHaveValue('');
    await expect(page.locator('#country')).toHaveValue('Canada');
  });

  test('Greenhouse Places location fills from .pac-item suggestions', async ({ jc }) => {
    await jc.seed({ profile: PROFILE });
    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('greenhouse-application-fixture.html', GREENHOUSE_HOST));
    await jc.openPanel(page);
    await expect(page.locator('#jc-main-panel')).toContainText('Greenhouse adapter');
    await page.locator('#jc-autofill-btn').click();
    await expect(page.locator('#jc-autofill-btn')).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('#first_name')).not.toHaveValue('');
    await expect(page.locator('#job_application_location')).toHaveValue(/Toronto/);
  });

  test('Lever uppercase section headers do not steal field labels', async ({ jc }) => {
    await jc.seed({ profile: PROFILE });
    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('lever-application-fixture.html', LEVER_HOST));
    await jc.openPanel(page);
    await expect(page.locator('#jc-main-panel')).toContainText('Lever adapter');
    await page.locator('#jc-autofill-btn').click();
    await expect(page.locator('#jc-autofill-btn')).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('#name')).not.toHaveValue('');
    await expect(page.locator('input.location-input')).toHaveValue(/Toronto/);
    const prompt = JSON.stringify(jc.openrouter.requests[0].body);
    expect(prompt).not.toMatch(/"label": "LOCATION"/);
    expect(prompt).not.toMatch(/"label": "PERSONAL INFORMATION"/);
  });

  test('Ashby custom select fills and a revealed field is still handled by the generic engine', async ({ jc }) => {
    await jc.seed({ profile: PROFILE });
    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('ashby-application-fixture.html', ASHBY_HOST));
    await jc.openPanel(page);
    await expect(page.locator('#jc-main-panel')).toContainText('Ashby adapter');
    await page.locator('#jc-autofill-btn').click();
    await expect(page.locator('#jc-autofill-btn')).toBeEnabled({ timeout: 60000 });
    await expect(page.locator('#fullName')).not.toHaveValue('');
    await expect(page.locator('.ashby-select-input')).toHaveValue('LinkedIn');
  });

  test('a site with no adapter still uses the generic engine', async ({ jc }) => {
    await jc.seed({ profile: PROFILE });
    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('phase2-form-fixture.html'));
    await jc.openPanel(page);
    await expect(page.locator('#jc-main-panel')).toContainText('generic fallback');
  });
});
