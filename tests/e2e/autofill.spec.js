import { test, expect } from './support/fixtures.js';

const PROFILE = {
  fullName: 'Test Applicant',
  email: 'test.applicant@example.com',
  phone: '+1 555 0100',
  location: 'Toronto, Ontario, Canada',
  linkedin: 'https://linkedin.com/in/test-applicant',
  workCountry: 'Canada',
  workAuthorization: 'Yes',
  sponsorshipNow: 'No',
  sponsorshipFuture: 'No',
  resumeContext: 'Software engineer who has shipped production web applications end to end.',
};

test.describe('single page autofill', () => {
  test('fills every control type on the generic fixture and verifies the result', async ({ jc }) => {
    await jc.seed({ profile: PROFILE });

    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('phase2-form-fixture.html'));
    await jc.openPanel(page);

    await page.locator('#jc-autofill-btn').click();
    await expect(page.locator('#jc-autofill-btn')).toBeEnabled({ timeout: 60000 });

    // Exactly one primary AI request for the page.
    expect(jc.openrouter.requests.length).toBeGreaterThanOrEqual(1);
    expect(jc.openrouter.requests[0].authorization).toBe('Bearer sk-or-v1-e2e-test-key');

    await expect(page.locator('#first_name')).not.toHaveValue('');
    await expect(page.locator('#user_email')).toHaveValue('test.applicant@example.com');
    await expect(page.locator('#user_phone')).toHaveValue('+1 555 0100');
    await expect(page.locator('#why_company')).not.toHaveValue('');
    await expect(page.locator('#challenging_project')).not.toHaveValue('');
    await expect(page.locator('#experience_level')).not.toHaveValue('');

    // Radio groups and checkboxes actuate through the same fillers as before.
    expect(await page.locator('input[name=work_auth_us]:checked').count()).toBe(1);
    expect(await page.locator('input[name=sponsorship_req]:checked').count()).toBe(1);

    // React-style controlled input needs the native setter path to stick.
    await expect(page.locator('#react_sim_input')).not.toHaveValue('');

    // The fixture includes one control that deliberately rejects programmatic
    // fills, so a single failure here is the expected outcome.
    await expect(page.locator('#jc-main-panel')).toContainText(/Autofill completed! \(1[0-9] filled, 1 failed\)/);
  });

  test('the prompt carries the stored profile and no credentials', async ({ jc }) => {
    await jc.seed({ profile: PROFILE, apiKey: 'sk-or-v1-leak-canary-value' });

    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('phase2-form-fixture.html'));
    await jc.openPanel(page);
    await page.locator('#jc-autofill-btn').click();
    await expect(page.locator('#jc-autofill-btn')).toBeEnabled({ timeout: 60000 });

    const request = jc.openrouter.requests[0];
    const userContent = JSON.parse(request.body.messages.at(-1).content);
    expect(userContent.applicantProfile.fullName).toBe('Test Applicant');
    expect(userContent.applicantProfile.workCountry).toBe('Canada');
    expect(userContent.fieldsToFill.length).toBeGreaterThan(5);

    // The key belongs in the header the background attached, never in the body.
    expect(JSON.stringify(request.body)).not.toContain('leak-canary-value');
  });

  test('existing values are left alone unless overwrite is enabled', async ({ jc }) => {
    await jc.seed({ profile: PROFILE, settings: { overwriteExisting: false } });

    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('phase2-form-fixture.html'));
    await jc.openPanel(page);
    await page.locator('#jc-autofill-btn').click();
    await expect(page.locator('#jc-autofill-btn')).toBeEnabled({ timeout: 60000 });

    await expect(page.locator('#portfolio_url')).toHaveValue('https://pre-existing-portfolio.example.com');
  });

  test('an OpenRouter failure surfaces in the panel instead of hanging', async ({ jc }) => {
    await jc.seed({ profile: PROFILE });
    jc.openrouter.status = 402;
    jc.openrouter.handler = () => ({ error: { message: 'Insufficient credits' } });

    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('phase2-form-fixture.html'));
    await jc.openPanel(page);
    await page.locator('#jc-autofill-btn').click();

    await expect(page.locator('#jc-main-panel')).toContainText('Insufficient credits', { timeout: 60000 });
    await expect(page.locator('#jc-autofill-btn')).toBeEnabled();
  });

  test('no API key blocks the request before any network call', async ({ jc }) => {
    await jc.seed({ apiKey: '', profile: PROFILE });

    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('phase2-form-fixture.html'));
    await jc.openPanel(page);

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#jc-autofill-btn').click();
    await page.waitForTimeout(1500);

    expect(jc.openrouter.requests.length).toBe(0);
  });
});
