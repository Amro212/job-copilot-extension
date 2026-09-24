import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

export function generateAmoJwt(apiKey, apiSecret) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    iss: apiKey,
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + 300,
  })).toString('base64url');
  const signature = crypto.createHmac('sha256', apiSecret).update(`${header}.${payload}`).digest('base64url');
  return `JWT ${header}.${payload}.${signature}`;
}

export function updateSiteFiles({ root = rootDir, baseVersion, xpiVersion, addonId = 'kareer@amro212' }) {
  const siteDir = path.join(root, 'site');
  const siteVersionPath = path.join(siteDir, 'version.json');
  const siteUpdatesPath = path.join(siteDir, 'firefox-updates.json');
  const siteIndexPath = path.join(siteDir, 'index.html');

  if (xpiVersion) {
    const updates = {
      addons: {
        [addonId]: {
          updates: [{
            version: xpiVersion,
            update_link: 'https://amro212.github.io/kareer/downloads/kareer-firefox.xpi',
          }],
        },
      },
    };
    fs.mkdirSync(siteDir, { recursive: true });
    fs.writeFileSync(siteUpdatesPath, JSON.stringify(updates, null, 2) + '\n', 'utf8');

    const rootUpdatesPath = path.join(root, 'firefox-updates.json');
    if (fs.existsSync(rootUpdatesPath)) {
      fs.writeFileSync(rootUpdatesPath, JSON.stringify(updates, null, 2) + '\n', 'utf8');
    }
  }

  if (baseVersion) {
    fs.mkdirSync(siteDir, { recursive: true });
    fs.writeFileSync(siteVersionPath, JSON.stringify({ version: baseVersion }, null, 2) + '\n', 'utf8');

    if (fs.existsSync(siteIndexPath)) {
      let html = fs.readFileSync(siteIndexPath, 'utf8');
      html = html.replace(/(data-version-badge>)[^<]*(<\/span>)/g, `$1v${baseVersion}$2`);
      html = html.replace(/src="script\.js(\?v=[^"']*)?"/g, `src="script.js?v=${baseVersion}"`);
      fs.writeFileSync(siteIndexPath, html, 'utf8');
    }
  }
}

export async function fetchLatestApprovedAmoVersion({ addonId, apiKey, apiSecret, fetchFn = globalThis.fetch }) {
  const url = `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(addonId)}/versions/?filter=all_with_unlisted`;
  const token = generateAmoJwt(apiKey, apiSecret);
  const res = await fetchFn(url, {
    headers: {
      Authorization: token,
      Accept: 'application/json',
      'User-Agent': 'kareer-cd/1.0',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`AMO API returned HTTP ${res.status}: ${text}`);
  }

  const data = await res.json();
  const versions = data.results || [];
  const approved = versions.find((v) => v.file && v.file.status === 'public');
  return approved || null;
}

export async function downloadAmoFile({ fileUrl, destPath, apiKey, apiSecret, fetchFn = globalThis.fetch }) {
  const token = generateAmoJwt(apiKey, apiSecret);
  let res = await fetchFn(fileUrl, {
    headers: {
      Authorization: token,
      'User-Agent': 'kareer-cd/1.0',
    },
    redirect: 'manual',
  });

  if (res.status === 301 || res.status === 302 || res.status === 307 || res.status === 308) {
    const redirectUrl = res.headers.get('location');
    if (!redirectUrl) {
      throw new Error(`AMO redirect received status ${res.status} with no Location header`);
    }
    // Cross-origin redirects (e.g. S3 pre-signed URLs) should not carry the AMO JWT
    res = await fetchFn(redirectUrl);
  }

  if (!res.ok) {
    throw new Error(`Failed to download XPI file: HTTP ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
}

export async function syncAmo({
  root = rootDir,
  apiKey = process.env.AMO_JWT_ISSUER,
  apiSecret = process.env.AMO_JWT_SECRET,
  envVersion = process.env.VERSION,
  envBaseVersion = process.env.BASE_VERSION,
  fetchFn = globalThis.fetch,
} = {}) {
  const pkgPath = path.join(root, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const baseVersion = envBaseVersion || pkg.version;

  let addonId = 'kareer@amro212';
  const manifestPath = path.join(root, 'dist', 'firefox', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.browser_specific_settings?.gecko?.id) {
        addonId = manifest.browser_specific_settings.gecko.id;
      }
    } catch {}
  }

  const siteDir = path.join(root, 'site');
  const downloadsDir = path.join(siteDir, 'downloads');
  const destXpiPath = path.join(downloadsDir, 'kareer-firefox.xpi');
  const siteUpdatesPath = path.join(siteDir, 'firefox-updates.json');
  let currentUpdatesVersion = null;
  if (fs.existsSync(siteUpdatesPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(siteUpdatesPath, 'utf8'));
      currentUpdatesVersion = data.addons?.[addonId]?.updates?.[0]?.version;
    } catch {}
  }

  // Case 1: Check for locally signed XPI from web-ext sign
  const signedDir = path.join(root, 'dist', 'signed');
  let localXpi = null;
  if (fs.existsSync(signedDir)) {
    const files = fs.readdirSync(signedDir).filter((f) => f.endsWith('.xpi'));
    if (files.length > 0) {
      localXpi = path.join(signedDir, files[0]);
    }
  }

  if (localXpi) {
    fs.mkdirSync(downloadsDir, { recursive: true });
    fs.copyFileSync(localXpi, destXpiPath);
    const xpiVersion = envVersion || baseVersion;
    updateSiteFiles({ root, baseVersion, xpiVersion, addonId });
    console.log(`[sync-amo] Staged freshly signed local XPI: v${xpiVersion} -> ${destXpiPath}`);
    return { success: true, source: 'local', version: xpiVersion, deployNeeded: true };
  }

  // Case 2: No local signed file (e.g. web-ext timed out or standalone sync). Fetch latest approved from AMO API
  if (!apiKey || !apiSecret) {
    console.warn('[sync-amo] No local signed XPI and no AMO credentials provided. Updating site version only.');
    updateSiteFiles({ root, baseVersion, xpiVersion: null, addonId });
    return { success: true, source: 'none', version: null, deployNeeded: true };
  }

  console.log(`[sync-amo] Querying Mozilla AMO API for latest approved version of ${addonId}...`);
  try {
    const approved = await fetchLatestApprovedAmoVersion({ addonId, apiKey, apiSecret, fetchFn });
    if (!approved) {
      console.warn(`[sync-amo] No approved public version found on AMO yet. Updating site version to v${baseVersion}.`);
      updateSiteFiles({ root, baseVersion, xpiVersion: null, addonId });
      return { success: true, source: 'pending', version: null, deployNeeded: true };
    }

    console.log(`[sync-amo] Found approved version on AMO: v${approved.version} (id: ${approved.id})`);
    if (approved.file?.url) {
      const hasExistingXpi = fs.existsSync(destXpiPath);
      const isNewVersion = approved.version !== currentUpdatesVersion;

      if (!hasExistingXpi || isNewVersion) {
        await downloadAmoFile({
          fileUrl: approved.file.url,
          destPath: destXpiPath,
          apiKey,
          apiSecret,
          fetchFn,
        });
        console.log(`[sync-amo] Downloaded and staged signed XPI to ${destXpiPath}`);
        updateSiteFiles({ root, baseVersion, xpiVersion: approved.version, addonId });
        return { success: true, source: 'amo', version: approved.version, deployNeeded: true };
      }

      console.log(`[sync-amo] Remote approved version v${approved.version} matches existing site version.`);
      updateSiteFiles({ root, baseVersion, xpiVersion: approved.version, addonId });
      const isCron = process.env.GITHUB_EVENT_NAME === 'schedule';
      return { success: true, source: 'amo', version: approved.version, deployNeeded: !isCron };
    }
  } catch (err) {
    console.error(`[sync-amo] Error fetching from AMO: ${err.message}`);
    updateSiteFiles({ root, baseVersion, xpiVersion: null, addonId });
    return { success: false, error: err.message, deployNeeded: true };
  }

  updateSiteFiles({ root, baseVersion, xpiVersion: null, addonId });
  return { success: true, source: 'none', version: null, deployNeeded: true };
}

// When run directly as a script
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  syncAmo()
    .then((result) => {
      console.log(`[sync-amo] Complete: ${JSON.stringify(result)}`);
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `has_xpi=${result.version ? 'true' : 'false'}\n`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `xpi_version=${result.version || ''}\n`);
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `deploy_needed=${result.deployNeeded !== false ? 'true' : 'false'}\n`);
      }
    })
    .catch((err) => {
      console.error(`[sync-amo] Fatal error: ${err.message}`);
      process.exit(1);
    });
}
