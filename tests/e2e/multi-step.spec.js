import { test, expect } from './support/fixtures.js';

const PROFILE = {
  fullName: 'Test Applicant',
  email: 'test.applicant@example.com',
  phone: '+1 555 0100',
  location: 'Toronto, Ontario, Canada',
  workCountry: 'Canada',
  workAuthorization: 'Yes',
  resumeContext: 'Software engineer with production web application experience.',
};

test.describe('multi-step application workflow', () => {
  test('walks the fixture to review using real navigation events', async ({ kr }) => {
    await kr.seed({ profile: PROFILE, settings: { autoContinue: true, autoSubmit: false } });

    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('phase3-application-fixture.html', undefined, '?scenario=validation&step=1'));
    await kr.openPanel(page);

    await page.locator('#kr-capture-job').click();
    await page.locator('#kr-start-application').click();

    // The fixture advances by URL, so the engine must survive real navigations and
    // recover from the scenario's deliberate first-answer rejection.
    await expect(page.locator('#kr-main-panel')).toContainText('Ready for review', { timeout: 90000 });
    expect(page.url()).toContain('step=review');

    const ids = await kr.readStorage('kr:sessions');
    expect(Array.isArray(ids) && ids.length).toBeTruthy();

    const record = await kr.readStorage(`kr:sessions:${ids[0]}`);
    expect(record.completedSteps).toBeGreaterThanOrEqual(2);
    expect(record.history.length).toBeGreaterThanOrEqual(2);
    expect(record.status).toBe('review');
  });

  test('final submission is never clicked while Auto Submit is off', async ({ kr }) => {
    await kr.seed({ profile: PROFILE, settings: { autoContinue: true, autoSubmit: false } });

    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('phase3-application-fixture.html', undefined, '?scenario=validation&step=1'));
    await kr.openPanel(page);
    await page.locator('#kr-capture-job').click();
    await page.locator('#kr-start-application').click();

    await expect(page.locator('#kr-main-panel')).toContainText('Ready for review', { timeout: 90000 });
    await expect(page.locator('#kr-main-panel')).toContainText('Final submission is manual');
    await page.waitForTimeout(3000);

    // The fixture swaps main to a confirmation heading once Submit is clicked.
    // Read main rather than body: body text includes the fixture's inline script.
    const submitted = await page.evaluate(() => {
      const main = document.querySelector('main')?.textContent || '';
      return document.body.dataset.submitted === 'true' || /application submitted/i.test(main);
    });
    expect(submitted).toBe(false);
    await expect(page.locator('main')).toContainText('Submit application');
  });

  test('the session is bound to its tab and survives a reload', async ({ kr }) => {
    await kr.seed({ profile: PROFILE, settings: { autoContinue: false } });

    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('phase3-application-fixture.html', undefined, '?scenario=validation&step=1'));
    await kr.openPanel(page);
    await page.locator('#kr-capture-job').click();

    const ids = await kr.readStorage('kr:sessions');
    expect(ids.length).toBe(1);

    // Tab binding replaces GM_getTab/GM_saveTab and lives in session storage.
    const bindings = await kr.worker.evaluate(async () => {
      const all = await chrome.storage.session.get(null);
      return Object.entries(all).filter(([key]) => key.startsWith('kr:tab:'));
    });
    expect(bindings.length).toBe(1);
    expect(bindings[0][1]).toBe(ids[0]);

    await page.reload();
    await kr.openPanel(page);
    // The restored session shows its captured job summary rather than the
    // "capture a job listing first" prompt.
    await expect(page.locator('#kr-main-panel')).toContainText('steps completed', { timeout: 20000 });
    await expect(page.locator('#kr-main-panel')).not.toContainText('Capture a job listing, then start');
  });

  test('the background records navigations for the tab', async ({ kr }) => {
    await kr.seed({ profile: PROFILE });

    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('phase2-form-fixture.html'));
    await kr.openPanel(page);

    const before = await kr.worker.evaluate(async () => {
      const all = await chrome.storage.session.get(null);
      const entry = Object.entries(all).find(([key]) => key.startsWith('kr:nav:'));
      return entry ? entry[1] : null;
    });
    expect(before).not.toBe(null);
    expect(before.id).toBeGreaterThanOrEqual(1);

    await page.goto(kr.fixtureUrl('test-page.html'));
    await page.waitForTimeout(500);

    const after = await kr.worker.evaluate(async () => {
      const all = await chrome.storage.session.get(null);
      const entry = Object.entries(all).find(([key]) => key.startsWith('kr:nav:'));
      return entry ? entry[1] : null;
    });
    expect(after.id).toBeGreaterThan(before.id);
    expect(after.url).toContain('test-page.html');
  });
});
