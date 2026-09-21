import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from './support/fixtures.js';

const PROFILE = {
  fullName: 'Amrit Kaur Singh',
  email: 'amrit.singh@example.com',
  phone: '+1 416 555 0134',
  location: 'Toronto, Ontario, Canada',
  resumeContext: 'Shipped payments systems at scale.',
};

/** Collects every file the page downloads during `action`. */
async function collectDownloads(page, action) {
  const files = [];
  const pending = [];
  page.on('download', (download) => {
    pending.push((async () => {
      const target = path.join(fs.mkdtempSync(path.join(process.env.TEMP || '/tmp', 'kr-dl-')), download.suggestedFilename());
      await download.saveAs(target);
      files.push({ name: download.suggestedFilename(), body: fs.readFileSync(target, 'utf8') });
    })());
  });
  await action();
  await page.waitForTimeout(2500);
  await Promise.all(pending);
  return files;
}

test.describe('fixture capture', () => {
  test('captures a page and its cross-origin frame as separate sanitized files', async ({ kr }) => {
    await kr.seed({ profile: PROFILE });

    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('embedded-host.html'));
    await kr.openPanel(page);
    await expect(page.locator('#kr-main-panel')).toContainText('embedded frame', { timeout: 20000 });

    // Put real-looking applicant data into the embedded form first, so the
    // capture has something it must strip.
    const frame = page.frameLocator('iframe[src*="embed.kareer.test"]');
    await frame.locator('#name').fill('Amrit Kaur Singh');
    await frame.locator('#email').fill('amrit.singh@example.com');
    await frame.locator('#why').fill('Shipped payments systems at scale.');

    await page.locator('[data-tab=debug]').click();

    const files = await collectDownloads(page, async () => {
      await page.locator('#kr-capture-fixture').click();
    });

    expect(files.length).toBe(2);
    await expect(page.locator('#kr-capture-feedback')).toContainText('Saved 2 files');

    const host = files.find((file) => !file.name.includes('frame1'));
    const embed = files.find((file) => file.name.includes('frame1'));
    expect(host).toBeTruthy();
    expect(embed).toBeTruthy();

    // The embedded frame captured its own document, which the host cannot read.
    expect(embed.body).toContain('id="name"');
    expect(embed.body).toContain('Current location');
    expect(embed.body).toContain('University or college');

    for (const file of files) {
      for (const secret of ['Amrit Kaur Singh', 'amrit.singh@example.com', 'Shipped payments systems']) {
        expect(file.body, `${secret} leaked into ${file.name}`).not.toContain(secret);
      }
      expect(file.body).not.toContain('kareer-root');
      expect(file.body).toContain('Kareer captured fixture');
    }

    // The host file points at the frame file rather than the live origin.
    expect(host.body).toContain(embed.name);
    expect(host.body).toContain('data-kr-original-host="embed.kareer.test"');
  });

  test('a captured fixture replays through the field engine', async ({ kr }) => {
    await kr.seed({ profile: PROFILE });

    const page = await kr.context.newPage();
    await page.goto(kr.fixtureUrl('phase2-form-fixture.html'));
    await kr.openPanel(page);
    await page.locator('[data-tab=debug]').click();

    const files = await collectDownloads(page, async () => {
      await page.locator('#kr-capture-fixture').click();
    });
    expect(files.length).toBe(1);

    // Serve the capture back and confirm the scanner still sees the same fields.
    const replayName = 'replay-capture.html';
    const replayPath = path.join(process.cwd(), 'fixtures', replayName);
    fs.writeFileSync(replayPath, files[0].body, 'utf8');

    try {
      const replay = await kr.context.newPage();
      await replay.goto(kr.fixtureUrl(replayName));
      await kr.openPanel(replay);
      // The original page reports 18 detected fields; a lossless capture matches.
      await expect(replay.locator('#kr-main-panel .kr-badge-blue').first()).toHaveText('18 detected', { timeout: 20000 });
    } finally {
      fs.rmSync(replayPath, { force: true });
    }
  });
});
