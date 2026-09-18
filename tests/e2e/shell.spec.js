import { test, expect } from './support/fixtures.js';

test.describe('extension shell', () => {
  test('panel mounts in the page and reports the hydrated key state', async ({ jc }) => {
    await jc.seed({ apiKey: 'sk-or-v1-e2e-test-key' });

    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('phase2-form-fixture.html'));
    await jc.openPanel(page);

    // Reads through the hydrated cache: the panel never sees the key itself.
    await expect(page.locator('#jc-main-panel')).toContainText('Ready');
    await expect(page.locator('#jc-autofill-btn')).toBeEnabled();
    await expect(page.locator('#jc-main-panel')).toContainText('detected');
  });

  test('a missing key surfaces as No API Key without exposing storage to the page', async ({ jc }) => {
    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('phase2-form-fixture.html'));
    await jc.openPanel(page);

    await expect(page.locator('#jc-main-panel')).toContainText('No API Key');

    // The panel offers the options page instead of collecting the key in-page.
    await page.locator('[data-tab=settings]').click();
    await expect(page.locator('#jc-open-options')).toBeVisible();
    await expect(page.locator('#jc-api-key-input')).toHaveCount(0);
  });

  test('the key stays out of the page even after it is saved', async ({ jc }) => {
    await jc.seed({ apiKey: 'sk-or-v1-super-secret-value' });

    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('phase2-form-fixture.html'));
    await jc.openPanel(page);
    await page.locator('[data-tab=settings]').click();
    await expect(page.locator('#jc-main-panel')).toContainText('Key saved');

    const leaked = await page.evaluate(() => {
      const root = document.querySelector('#job-copilot-root');
      const haystack = [
        document.documentElement.outerHTML,
        root?.shadowRoot?.innerHTML || '',
        JSON.stringify(Object.keys(localStorage).map((k) => localStorage.getItem(k))),
        JSON.stringify(Object.keys(sessionStorage).map((k) => sessionStorage.getItem(k))),
      ].join('\n');
      return haystack.includes('super-secret-value');
    });
    expect(leaked).toBe(false);
  });

  test('options page persists the key, model, and profile', async ({ jc }) => {
    const page = await jc.context.newPage();
    await page.goto(jc.optionsUrl());

    await page.locator('#api-key').fill('sk-or-v1-from-options-page');
    await page.locator('#save-key').click();
    await expect(page.locator('#key-status')).toHaveText('Key saved');

    await page.locator('#model').selectOption('openai/gpt-4o-mini');
    await page.locator('#save-model').click();
    await expect(page.locator('#model-feedback')).toHaveText('Model saved.');

    await page.locator('#pf-fullName').fill('Test Applicant');
    await page.locator('#pf-workCountry').fill('Canada');
    await page.locator('#pf-workAuthorization').selectOption('Yes');
    await page.locator('#resumeContext').fill('Ships production software.');
    await page.locator('#profile-form button[type=submit]').click();
    await expect(page.locator('#profile-feedback')).toHaveText('Profile saved.');

    expect(await jc.readStorage('jc:secrets')).toEqual({ apiKey: 'sk-or-v1-from-options-page' });
    expect((await jc.readStorage('jc:settings')).model).toBe('openai/gpt-4o-mini');

    const profile = await jc.readStorage('jc:profile');
    expect(profile.fullName).toBe('Test Applicant');
    expect(profile.workCountry).toBe('Canada');
    expect(profile.workAuthorization).toBe('Yes');
    expect(profile.resumeContext).toBe('Ships production software.');
  });

  test('profile edits made in the options page reach an already-open page', async ({ jc }) => {
    await jc.seed({ apiKey: 'sk-or-v1-e2e-test-key' });

    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('phase2-form-fixture.html'));
    await jc.openPanel(page);

    const options = await jc.context.newPage();
    await options.goto(jc.optionsUrl());
    await options.locator('#pf-fullName').fill('Broadcast Applicant');
    await options.locator('#profile-form button[type=submit]').click();
    await expect(options.locator('#profile-feedback')).toHaveText('Profile saved.');

    await page.bringToFront();
    await page.locator('[data-tab=profile]').click();
    await expect(page.locator('#job-copilot-root [name=fullName]')).toHaveValue('Broadcast Applicant');
  });

  test('popup reports field and frame counts for the active tab', async ({ jc }) => {
    await jc.seed({ apiKey: 'sk-or-v1-e2e-test-key' });

    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('phase2-form-fixture.html'));
    await jc.openPanel(page);
    await page.bringToFront();

    const popup = await jc.context.newPage();
    await popup.goto(jc.popupUrl());
    await expect(popup.locator('#key-status')).toHaveText('Key saved');
    await expect(popup.locator('#frame-count')).not.toHaveText('-');
    expect(Number(await popup.locator('#field-count').textContent())).toBeGreaterThan(0);
  });
});
