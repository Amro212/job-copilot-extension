import { test as base, chromium, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFixtureServer, startOpenRouterMock } from './servers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..', '..');
const extensionPath = path.join(repoRoot, 'dist', 'chrome');

/** Distinct origins that all resolve to the one fixture server, so cross-origin
 *  iframe behaviour can be tested without real domains. */
export const ATS_HOST = 'ats.jobcopilot.test';
export const EMBED_HOST = 'embed.jobcopilot.test';

export const test = base.extend({
  jc: async ({}, use, testInfo) => {
    if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
      throw new Error('dist/chrome is missing. Run `npm run build` first.');
    }

    const fixtures = await startFixtureServer();
    const openrouter = await startOpenRouterMock();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jc-e2e-'));

    const context = await chromium.launchPersistentContext(userDataDir, {
      // The headless shell cannot load extensions; `channel: chromium` selects the
      // full browser, which supports them under the new headless mode.
      channel: 'chromium',
      headless: process.env.JC_HEADED !== '1',
      ignoreHTTPSErrors: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        `--host-resolver-rules=MAP ${ATS_HOST} 127.0.0.1:${fixtures.port},MAP ${EMBED_HOST} 127.0.0.1:${fixtures.port},MAP openrouter.ai 127.0.0.1:${openrouter.port}`,
        `--ignore-certificate-errors-spki-list=${openrouter.spki}`,
        '--no-first-run',
      ],
    });

    const worker = context.serviceWorkers()[0]
      || (await context.waitForEvent('serviceworker', { timeout: 20000 }).catch(() => {
        throw new Error('Extension background worker never started. Is dist/chrome a valid MV3 build?');
      }));
    const extensionId = new URL(worker.url()).host;

    const helpers = {
      context,
      worker,
      extensionId,
      openrouter: openrouter.state,
      fixtureUrl: (file, host = ATS_HOST, query = '') => `http://${host}/${file}${query}`,
      optionsUrl: () => `chrome-extension://${extensionId}/options/index.html`,
      popupUrl: () => `chrome-extension://${extensionId}/popup/index.html`,

      /** Writes directly through the background worker, bypassing the UI. */
      async seed({ apiKey = 'sk-or-v1-e2e-test-key', settings, profile } = {}) {
        await worker.evaluate(async ({ apiKey, settings, profile }) => {
          if (apiKey) await chrome.storage.local.set({ 'jc:secrets': { apiKey } });
          if (settings) {
            const cur = (await chrome.storage.local.get('jc:settings'))['jc:settings'] || {};
            await chrome.storage.local.set({ 'jc:settings': { ...cur, ...settings } });
          }
          if (profile) {
            const cur = (await chrome.storage.local.get('jc:profile'))['jc:profile'] || {};
            await chrome.storage.local.set({ 'jc:profile': { ...cur, ...profile } });
          }
        }, { apiKey, settings, profile });
      },

      async readStorage(key) {
        return worker.evaluate((k) => chrome.storage.local.get(k).then((r) => r[k]), key);
      },

      /** Playwright's CSS engine pierces the panel's open shadow root. */
      async openPanel(page) {
        const toggle = page.locator('#jc-toggle-btn');
        await toggle.waitFor({ timeout: 20000 });
        if (!(await page.locator('#jc-main-panel').count())) await toggle.click();
        await page.locator('#jc-main-panel').waitFor({ timeout: 10000 });
      },
    };

    await use(helpers);

    if (testInfo.status !== testInfo.expectedStatus) {
      const logPath = testInfo.outputPath('console.txt');
      fs.writeFileSync(logPath, helpers._consoleLog || '', 'utf8');
    }

    await context.close();
    fixtures.server.close();
    openrouter.server.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  },
});

export { expect };
