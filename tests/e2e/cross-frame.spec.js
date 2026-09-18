import { test, expect, EMBED_HOST } from './support/fixtures.js';

const PROFILE = {
  fullName: 'Test Applicant',
  email: 'test.applicant@example.com',
  phone: '+1 555 0100',
  location: 'Ottawa, Ontario, Canada',
  linkedin: 'https://linkedin.com/in/test-applicant',
  workCountry: 'Canada',
  workAuthorization: 'Yes',
  resumeContext: 'Software engineer with production web application experience.',
};

/** The application form lives on a different origin than the page hosting it. */
const embedFrame = (page) => page.frameLocator(`iframe[src*="${EMBED_HOST}"]`);

test.describe('cross-origin embedded application', () => {
  test('the panel counts fields the host document cannot see', async ({ jc }) => {
    await jc.seed({ profile: PROFILE });

    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('embedded-host.html'));
    await jc.openPanel(page);

    // The host page genuinely has no controls: this is the Greenhouse embed case.
    const localFields = await page.evaluate(() => document.querySelectorAll('input, select, textarea').length);
    expect(localFields).toBe(0);

    // The badge counts embedded fields, and the breakdown names where they live.
    await expect(page.locator('#jc-main-panel')).toContainText('0 here, 10 in 1 embedded frame', { timeout: 20000 });
    await expect(page.locator('#jc-main-panel .jc-badge-blue').first()).toHaveText('10 detected');
  });

  test('fills the embedded form end to end from the host page panel', async ({ jc }) => {
    await jc.seed({ profile: PROFILE });

    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('embedded-host.html'));
    await jc.openPanel(page);
    await expect(page.locator('#jc-main-panel')).toContainText('embedded frame', { timeout: 20000 });

    await page.locator('#jc-autofill-btn').click();
    await expect(page.locator('#jc-main-panel')).toContainText('Autofill completed!', { timeout: 60000 });

    const frame = embedFrame(page);
    await expect(frame.locator('#name')).not.toHaveValue('');
    await expect(frame.locator('#email')).toHaveValue('test.applicant@example.com');
    await expect(frame.locator('#phone')).toHaveValue('+1 555 0100');
    await expect(frame.locator('#why')).not.toHaveValue('');
    await expect(frame.locator('#experience')).not.toHaveValue('');
    await expect(frame.locator('#privacy')).toBeChecked();
    expect(await frame.locator('input[name=work_auth]:checked').count()).toBe(1);
  });

  test('embedded fields ride along in the single primary AI request', async ({ jc }) => {
    await jc.seed({ profile: PROFILE });

    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('embedded-host.html'));
    await jc.openPanel(page);
    await expect(page.locator('#jc-main-panel')).toContainText('embedded frame', { timeout: 20000 });

    await page.locator('#jc-autofill-btn').click();
    await expect(page.locator('#jc-main-panel')).toContainText('Autofill completed!', { timeout: 60000 });

    const primary = jc.openrouter.requests[0];
    const fields = JSON.parse(primary.body.messages.at(-1).content).fieldsToFill;

    // Frame-namespaced ids prove the embedded controls were part of this request.
    const remote = fields.filter((field) => /^jcf\d+::/.test(field.fieldId));
    expect(remote.length).toBeGreaterThanOrEqual(7);
    expect(fields.every((field) => typeof field.label === 'string' && field.label.length > 0)).toBe(true);
  });

  test('a residence combobox in the frame resolves without a second request', async ({ jc }) => {
    await jc.seed({ profile: PROFILE });

    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('embedded-host.html'));
    await jc.openPanel(page);
    await expect(page.locator('#jc-main-panel')).toContainText('embedded frame', { timeout: 20000 });

    await page.locator('#jc-autofill-btn').click();
    await expect(page.locator('#jc-main-panel')).toContainText('Autofill completed!', { timeout: 60000 });

    // Ottawa is outside the combobox's unsearched first page, but harvesting
    // pre-searches residence fields with the stored profile location, so this
    // resolves inside the single primary request.
    await expect(embedFrame(page).locator('#loc-display')).toHaveText('Ottawa, Ontario, Canada');
  });

  test('a paginated combobox in the frame resolves through a bounded search pass', async ({ jc }) => {
    await jc.seed({ profile: { ...PROFILE, resumeContext: 'Graduated from the University of Waterloo.' } });

    // The wanted school is not on the combobox's first page, so the model must ask
    // for a search that only the embedded frame can perform.
    jc.openrouter.handler = (body) => {
      const user = JSON.parse(body.messages.at(-1).content);
      const answers = user.fieldsToFill.map((field) => {
        if (/university or college/i.test(field.label)) {
          const match = (field.options || []).find((option) => option.label === 'University of Waterloo');
          return match
            ? { fieldId: field.fieldId, value: match.label, inferred: false }
            : { fieldId: field.fieldId, value: '', inferred: false, searchQuery: 'University of Waterloo' };
        }
        if (field.type === 'checkbox') return { fieldId: field.fieldId, value: true, inferred: false };
        if (['select', 'radio', 'combobox'].includes(field.type)) {
          const real = (field.options || []).find((option) => option.label && !/^(--|select|please)/i.test(option.label.trim()));
          return { fieldId: field.fieldId, value: real ? real.label : '', inferred: false };
        }
        return { fieldId: field.fieldId, value: 'Provided answer', inferred: false };
      });
      return { choices: [{ message: { content: JSON.stringify({ answers }) } }] };
    };

    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('embedded-host.html'));
    await jc.openPanel(page);
    await expect(page.locator('#jc-main-panel')).toContainText('embedded frame', { timeout: 20000 });

    await page.locator('#jc-autofill-btn').click();
    await expect(page.locator('#jc-main-panel')).toContainText('Autofill completed!', { timeout: 60000 });

    // Exactly one follow-up request, made by the panel on the frame's behalf.
    expect(jc.openrouter.requests.length).toBe(2);
    await expect(embedFrame(page).locator('#school-display')).toHaveText('University of Waterloo');
  });

  test('the embedded frame never mounts a second panel', async ({ jc }) => {
    await jc.seed({ profile: PROFILE });

    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('embedded-host.html'));
    await jc.openPanel(page);

    const hostPanels = await page.locator('#job-copilot-root').count();
    expect(hostPanels).toBe(1);
    expect(await embedFrame(page).locator('#job-copilot-root').count()).toBe(0);
  });
});
