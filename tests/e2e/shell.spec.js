import { test, expect } from './support/fixtures.js';

test.describe('extension shell', () => {
  test('panel mounts in the page and reports the hydrated key state', async ({ kr }) => {
    await kr.seed({ apiKey: 'sk-or-v1-e2e-test-key' });

    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('phase2-form-fixture.html'));
    await kr.openPanel(page);

    // Reads through the hydrated cache: the panel never sees the key itself.
    await expect(page.locator('#kr-main-panel')).toContainText('Ready');
    await expect(page.locator('#kr-autofill-btn')).toBeEnabled();
    await expect(page.locator('#kr-main-panel')).toContainText('detected');
  });

  test('a missing key surfaces as No API Key without exposing storage to the page', async ({ kr }) => {
    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('phase2-form-fixture.html'));
    await kr.openPanel(page);

    await expect(page.locator('#kr-main-panel')).toContainText('No API Key');

    // The panel offers the options page instead of collecting the key in-page.
    await page.locator('[data-tab=settings]').click();
    await expect(page.locator('#kr-open-options')).toBeVisible();
    await expect(page.locator('#kr-api-key-input')).toHaveCount(0);
  });

  test('the key stays out of the page even after it is saved', async ({ kr }) => {
    await kr.seed({ apiKey: 'sk-or-v1-super-secret-value' });

    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('phase2-form-fixture.html'));
    await kr.openPanel(page);
    await page.locator('[data-tab=settings]').click();
    await expect(page.locator('#kr-main-panel')).toContainText('Key saved');

    const leaked = await page.evaluate(() => {
      const root = document.querySelector('#kareer-root');
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

  test('options page persists the key, model, and profile', async ({ kr }) => {
    const page = await kr.context.newPage();
    await page.goto(kr.optionsUrl());

    await page.locator('#api-key').fill('sk-or-v1-from-options-page');
    await page.locator('#save-key').click();
    await expect(page.locator('#key-status')).toHaveText('Key saved');

    await page.locator('#model').selectOption('openai/gpt-4o-mini');
    await page.locator('#save-model').click();
    await expect(page.locator('#model-feedback')).toHaveText('Model saved.');

    await page.locator('#pf-fullName').fill('Test Applicant');
    await page.locator('#pf-workCountry').fill('Canada');
    await page.locator('#pf-workAuthorization').selectOption('Yes');
    await page.locator('#applicantNotes').fill('Ships production software.');
    await page.locator('#profile-form button[type=submit]').click();
    await expect(page.locator('#profile-feedback')).toHaveText('Profile saved.');

    expect(await kr.readStorage('kr:secrets')).toEqual({ apiKey: 'sk-or-v1-from-options-page' });
    expect((await kr.readStorage('kr:settings')).model).toBe('openai/gpt-4o-mini');

    const profile = await kr.readStorage('kr:profile');
    expect(profile.fullName).toBe('Test Applicant');
    expect(profile.workCountry).toBe('Canada');
    expect(profile.workAuthorization).toBe('Yes');
    expect(profile.applicantNotes).toBe('Ships production software.');
  });

  test('profile edits made in the options page reach an already-open page', async ({ kr }) => {
    await kr.seed({ apiKey: 'sk-or-v1-e2e-test-key' });

    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('phase2-form-fixture.html'));
    await kr.openPanel(page);

    const options = await kr.context.newPage();
    await options.goto(kr.optionsUrl());
    await options.locator('#pf-fullName').fill('Broadcast Applicant');
    await options.locator('#profile-form button[type=submit]').click();
    await expect(options.locator('#profile-feedback')).toHaveText('Profile saved.');

    await page.bringToFront();
    await page.locator('[data-tab=profile]').click();
    await expect(page.locator('#kareer-root [name=fullName]')).toHaveValue('Broadcast Applicant');
  });

  test('popup reports field and frame counts for the active tab', async ({ kr }) => {
    await kr.seed({ apiKey: 'sk-or-v1-e2e-test-key' });

    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('phase2-form-fixture.html'));
    await kr.openPanel(page);
    await page.bringToFront();

    const popup = await kr.context.newPage();
    await popup.goto(kr.popupUrl());
    await expect(popup.locator('#key-status')).toHaveText('Key saved');
    await expect(popup.locator('#frame-count')).not.toHaveText('-');
    expect(Number(await popup.locator('#field-count').textContent())).toBeGreaterThan(0);
  });
});
