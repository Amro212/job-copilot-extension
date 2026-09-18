import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test, expect } from './support/fixtures.js';
import { PAYLOAD_KIND } from '../../src/core/migration.js';
import { STORAGE_KEYS } from '../../src/core/constants.js';

test.describe('data migration', () => {
  test('options export omits the API key', async ({ jc }) => {
    await jc.seed({
      apiKey: 'sk-or-v1-super-secret-value',
      profile: { fullName: 'Ada Lovelace' },
    });

    const page = await jc.context.newPage();
    await page.goto(jc.optionsUrl());

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-data').click();
    const download = await downloadPromise;
    const filePath = path.join(os.tmpdir(), `jc-export-${Date.now()}.json`);
    await download.saveAs(filePath);
    const text = fs.readFileSync(filePath, 'utf8');
    fs.unlinkSync(filePath);

    const payload = JSON.parse(text);
    expect(payload.kind).toBe(PAYLOAD_KIND);
    expect(payload.data[STORAGE_KEYS.PROFILE].fullName).toBe('Ada Lovelace');
    expect(text.includes('sk-or-v1-super-secret-value')).toBe(false);
    expect(text.includes('jc:secrets')).toBe(false);
  });

  test('options import restores portable records and keeps secrets separate', async ({ jc }) => {
    await jc.seed({ apiKey: 'sk-or-v1-existing-key' });

    const backup = {
      kind: PAYLOAD_KIND,
      exportedAt: new Date().toISOString(),
      data: {
        [STORAGE_KEYS.PROFILE]: { fullName: 'Imported Applicant', email: 'import@example.com' },
        [STORAGE_KEYS.SETTINGS]: { model: 'openai/gpt-4o-mini', autofillEnabled: true },
      },
    };
    const filePath = path.join(os.tmpdir(), `jc-import-${Date.now()}.json`);
    fs.writeFileSync(filePath, JSON.stringify(backup), 'utf8');

    const page = await jc.context.newPage();
    await page.goto(jc.optionsUrl());
    await page.locator('#import-file').setInputFiles(filePath);
    fs.unlinkSync(filePath);

    await expect(page.locator('#migration-feedback')).toContainText('Imported 2 records');
    await expect(page.locator('#migration-feedback')).toContainText('Re-enter your API key');

    const profile = await jc.readStorage(STORAGE_KEYS.PROFILE);
    expect(profile.fullName).toBe('Imported Applicant');
    expect((await jc.readStorage(STORAGE_KEYS.SETTINGS)).model).toBe('openai/gpt-4o-mini');
    expect((await jc.readStorage('jc:secrets')).apiKey).toBe('sk-or-v1-existing-key');
  });

  test('options import rejects non-backup JSON', async ({ jc }) => {
    await jc.seed({ profile: { fullName: 'Before Import' } });
    const filePath = path.join(os.tmpdir(), `jc-bad-${Date.now()}.json`);
    fs.writeFileSync(filePath, JSON.stringify({ hello: 'world' }), 'utf8');

    const page = await jc.context.newPage();
    await page.goto(jc.optionsUrl());
    await page.locator('#import-file').setInputFiles(filePath);
    fs.unlinkSync(filePath);

    await expect(page.locator('#migration-feedback')).toContainText('Import failed');
    expect((await jc.readStorage(STORAGE_KEYS.PROFILE)).fullName).toBe('Before Import');
  });

  test('dual install keeps a single extension-owned panel when userscript loads after', async ({ jc }) => {
    await jc.seed({ apiKey: 'sk-or-v1-e2e-test-key' });
    const page = await jc.context.newPage();
    await page.goto(jc.fixtureUrl('phase2-form-fixture.html'));
    await jc.openPanel(page);
    await expect(page.locator('#job-copilot-root')).toHaveAttribute('data-jc-host', 'extension');

    await page.addScriptTag({ path: path.join(process.cwd(), 'dist', 'job-copilot.user.js') });
    await page.waitForTimeout(500);

    expect(await page.locator('#job-copilot-root').count()).toBe(1);
    await expect(page.locator('#job-copilot-root')).toHaveAttribute('data-jc-host', 'extension');
    await expect(page.locator('#jc-main-panel')).toBeVisible();
  });

  test('dual install replaces a userscript stub with the extension panel', async ({ jc }) => {
    await jc.seed({ apiKey: 'sk-or-v1-e2e-test-key' });
    const page = await jc.context.newPage();
    await page.addInitScript(() => {
      const stub = document.createElement('div');
      stub.id = 'job-copilot-root';
      stub.setAttribute('data-jc-host', 'userscript');
      document.documentElement.appendChild(stub);
    });
    await page.goto(jc.fixtureUrl('phase2-form-fixture.html'));
    await jc.openPanel(page);

    expect(await page.locator('#job-copilot-root').count()).toBe(1);
    await expect(page.locator('#job-copilot-root')).toHaveAttribute('data-jc-host', 'extension');
    await expect(page.locator('#jc-main-panel')).toBeVisible();
  });
});
