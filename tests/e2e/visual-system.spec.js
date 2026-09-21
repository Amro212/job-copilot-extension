import { test, expect } from './support/fixtures.js';

async function fonts(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].filter(face => face.family.includes('Kareer')).map(face => ({ family: face.family, status: face.status }));
  });
}

test('local typography, internal options navigation, and responsive console', async ({ kr }, info) => {
  await kr.seed({ settings: { model: 'provider/' + 'long-model-name-'.repeat(12) } });
  const popup = await kr.context.newPage();
  await popup.goto(kr.popupUrl());
  const opened = kr.context.waitForEvent('page');
  await popup.locator('#open-options').click();
  const page = await opened;
  await page.waitForURL(kr.optionsUrl());
  await expect(page.locator('#pf-fullName')).toBeVisible();
  const loaded = await fonts(page);
  expect(loaded).toHaveLength(2);
  expect(loaded.every(face => face.status === 'loaded')).toBe(true);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').filter(r => /woff2/.test(r.name)).every(r => r.name.startsWith(location.origin)))).toBe(true);
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`options-${width}.png`), fullPage: true });
  }
  await page.locator('#advanced').scrollIntoViewIfNeeded();
  await expect(page.locator('#export-data')).toBeVisible();
});

test('HUD and every panel tab use Geist without overflow', async ({ kr }, info) => {
  await kr.seed({ settings: { model: 'provider/' + 'long-model-name-'.repeat(12) } });
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('phase2-form-fixture.html'));
  await page.locator('#kr-hud').waitFor();
  const loaded = await fonts(page);
  expect(loaded).toHaveLength(2);
  expect(loaded.every(face => face.status === 'loaded')).toBe(true);
  await page.locator('#kr-hud').screenshot({ path: info.outputPath('hud.png') });
  await kr.openPanel(page);
  for (const tab of ['home', 'profile', 'settings', 'debug']) {
    await page.locator(`[data-tab=${tab}]`).click();
    expect(await page.locator('.kr-content').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.locator('#kr-main-panel').screenshot({ path: info.outputPath(`panel-${tab}.png`) });
  }
  await page.locator('[data-tab=home]').click();
  await page.locator('#kr-capture-job').click();
  await expect(page.locator('#kr-start-application')).not.toHaveClass(/kr-btn-secondary/);
  await expect(page.locator('#kr-autofill-btn')).toHaveClass(/kr-btn-secondary/);
  await page.locator('#kr-main-panel').screenshot({ path: info.outputPath('panel-paused.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator('.kr-content').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.locator('#kr-main-panel').screenshot({ path: info.outputPath('panel-narrow.png') });
});

test('workflow state presentation and error feedback remain inspectable', async ({ kr }, info) => {
  await kr.seed();
  const page = await kr.context.newPage();
  const url = kr.fixtureUrl('phase2-form-fixture.html');
  // Deterministic presentation fixtures; inactive sessions cannot run or submit.
  for (const status of ['running', 'paused', 'review', 'boundary']) {
    await kr.worker.evaluate(async ({ status, url }) => {
      await chrome.storage.local.set({
        'kr:sessions': ['visual-state'],
        'kr:sessions:visual-state': {
          id: 'visual-state', identityVersion: 2, active: false, status,
          currentUrl: url, job: { title: 'Software Engineer', company: 'Fixture employer' },
          reason: status === 'boundary' ? 'Review and complete the legal attestation manually.' : `Fixture ${status} state`,
          steps: {}, history: [], answers: {}, errors: [], completedSteps: 2,
        },
      });
    }, { status, url });
    await page.goto(url);
    await kr.openPanel(page);
    await expect(page.locator('.kr-wf-reason')).toContainText(status === 'boundary' ? 'legal attestation' : status);
    await page.locator('#kr-main-panel').screenshot({ path: info.outputPath(`state-${status}.png`) });
  }
  kr.openrouter.status = 401;
  await page.locator('#kr-test-ai-btn').click();
  await expect(page.locator('.kr-alert-error')).toContainText('Connection Failed');
  await page.locator('.kr-alert-error').scrollIntoViewIfNeeded();
  await page.locator('#kr-main-panel').screenshot({ path: info.outputPath('state-error.png') });
});
