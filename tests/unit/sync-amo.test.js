import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateAmoJwt, updateSiteFiles, syncAmo, fetchLatestApprovedAmoVersion } from '../../tools/sync-amo.js';

let tempDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kareer-sync-test-'));
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('generateAmoJwt creates valid JWT token format with 3 segments', () => {
  const token = generateAmoJwt('my-issuer', 'my-secret');
  assert.ok(token.startsWith('JWT '));
  const parts = token.slice(4).split('.');
  assert.equal(parts.length, 3);

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

  assert.equal(header.alg, 'HS256');
  assert.equal(header.typ, 'JWT');
  assert.equal(payload.iss, 'my-issuer');
  assert.ok(payload.exp > payload.iat);
});

test('updateSiteFiles stamps canonical baseVersion on site badge and version.json', () => {
  const siteDir = path.join(tempDir, 'site');
  fs.mkdirSync(siteDir, { recursive: true });
  fs.writeFileSync(path.join(siteDir, 'index.html'), `
    <span data-version-badge>v0.1.0</span>
    <script src="script.js?v=0.1.0"></script>
  `);

  updateSiteFiles({
    root: tempDir,
    baseVersion: '0.4.38',
    xpiVersion: '0.4.38.15',
    addonId: 'test-addon@id',
  });

  const versionJson = JSON.parse(fs.readFileSync(path.join(siteDir, 'version.json'), 'utf8'));
  assert.equal(versionJson.version, '0.4.38');

  const updatesJson = JSON.parse(fs.readFileSync(path.join(siteDir, 'firefox-updates.json'), 'utf8'));
  assert.equal(updatesJson.addons['test-addon@id'].updates[0].version, '0.4.38.15');

  const html = fs.readFileSync(path.join(siteDir, 'index.html'), 'utf8');
  assert.match(html, /data-version-badge>v0\.4\.38<\/span>/);
  assert.match(html, /src="script\.js\?v=0\.4\.38"/);
});

test('syncAmo uses local signed XPI when present', async () => {
  fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ version: '0.4.38' }));
  const signedDir = path.join(tempDir, 'dist', 'signed');
  fs.mkdirSync(signedDir, { recursive: true });
  fs.writeFileSync(path.join(signedDir, 'kareer-0.4.38.1.xpi'), 'mock-xpi-content');

  const result = await syncAmo({
    root: tempDir,
    envVersion: '0.4.38.1',
    envBaseVersion: '0.4.38',
  });

  assert.equal(result.success, true);
  assert.equal(result.source, 'local');
  assert.equal(result.version, '0.4.38.1');

  const destFile = path.join(tempDir, 'site', 'downloads', 'kareer-firefox.xpi');
  assert.ok(fs.existsSync(destFile));
  assert.equal(fs.readFileSync(destFile, 'utf8'), 'mock-xpi-content');
});

test('syncAmo falls back to remote AMO API when local XPI is missing', async () => {
  fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ version: '0.4.38' }));

  const mockFetch = async (url) => {
    if (url.includes('/versions/')) {
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              id: 999,
              version: '0.4.37.4',
              file: {
                status: 'public',
                url: 'https://addons.mozilla.org/download/mock.xpi',
              },
            },
          ],
        }),
      };
    }
    if (url.includes('/download/mock.xpi')) {
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from('remote-downloaded-xpi'),
      };
    }
    throw new Error(`Unexpected url: ${url}`);
  };

  const result = await syncAmo({
    root: tempDir,
    apiKey: 'mock-key',
    apiSecret: 'mock-secret',
    envBaseVersion: '0.4.38',
    fetchFn: mockFetch,
  });

  assert.equal(result.success, true);
  assert.equal(result.source, 'amo');
  assert.equal(result.version, '0.4.37.4');

  const destFile = path.join(tempDir, 'site', 'downloads', 'kareer-firefox.xpi');
  assert.ok(fs.existsSync(destFile));
  assert.equal(fs.readFileSync(destFile, 'utf8'), 'remote-downloaded-xpi');

  // Verify site badge still displays the canonical baseVersion, not the old remote XPI 4-digit version
  const versionJson = JSON.parse(fs.readFileSync(path.join(tempDir, 'site', 'version.json'), 'utf8'));
  assert.equal(versionJson.version, '0.4.38');
});
