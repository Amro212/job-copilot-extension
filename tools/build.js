import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { zipDirectory } from './zip.js';
import { TOKENS, FONT_FILES, fontFaceCSS, VISUAL_NAME } from '../src/core/theme.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');
const pkgPath = path.join(rootDir, 'package.json');
const cachePath = path.join(distDir, '.build-cache.json');

const BROWSERS = ['chrome', 'firefox'];

function readPackage() {
  return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
}

function computeSourceHash() {
  const hash = crypto.createHash('sha256');

  function scan(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile() && /\.(js|css|html|json|woff2|txt)$/.test(entry.name)) {
        hash.update(path.relative(rootDir, fullPath).replace(/\\/g, '/'));
        hash.update(fs.readFileSync(fullPath));
      }
    }
  }

  scan(srcDir);
  return hash.digest('hex');
}

function incrementVersion(version, type = 'patch') {
  let [major = 0, minor = 0, patch = 0] = version.split('.').map((p) => parseInt(p, 10));
  if (type === 'major') { major += 1; minor = 0; patch = 0; }
  else if (type === 'minor') { minor += 1; patch = 0; }
  else { patch += 1; }
  return `${major}.${minor}.${patch}`;
}

function getBuildCache() {
  try {
    if (fs.existsSync(cachePath)) return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  } catch {}
  return null;
}

function saveBuildCache(hash, version) {
  try {
    fs.mkdirSync(distDir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ hash, version, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
  } catch {}
}

function syncSiteAndUpdates(version) {
  const siteVersionPath = path.join(rootDir, 'site', 'version.json');
  if (fs.existsSync(siteVersionPath)) {
    try {
      fs.writeFileSync(siteVersionPath, JSON.stringify({ version }, null, 2) + '\n', 'utf8');
    } catch {}
  }

  for (const p of [path.join(rootDir, 'site', 'firefox-updates.json'), path.join(rootDir, 'firefox-updates.json')]) {
    if (fs.existsSync(p)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (manifest?.addons?.['kareer@amro212']) {
          manifest.addons['kareer@amro212'].updates = [{
            version,
            update_link: 'https://amro212.github.io/kareer/downloads/kareer-firefox.xpi',
          }];
          fs.writeFileSync(p, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
        }
      } catch {}
    }
  }

  const siteIndexPath = path.join(rootDir, 'site', 'index.html');
  if (fs.existsSync(siteIndexPath)) {
    try {
      let html = fs.readFileSync(siteIndexPath, 'utf8');
      html = html.replace(/data-version-badge>[^<]+</, `data-version-badge>v${version}<`);
      html = html.replace(/src="script\.js(\?v=[^"']*)?"/g, `src="script.js?v=${version}"`);
      fs.writeFileSync(siteIndexPath, html, 'utf8');
    } catch {}
  }
}

function prepareVersion() {
  const pkg = readPackage();
  const currentHash = computeSourceHash();
  const cache = getBuildCache();

  const bumpArg = process.argv.find((arg) => arg.startsWith('--bump='));
  const explicitBump = bumpArg ? bumpArg.split('=')[1] : null;

  if (explicitBump && ['major', 'minor', 'patch'].includes(explicitBump)) {
    const oldVersion = pkg.version;
    pkg.version = incrementVersion(oldVersion, explicitBump);
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    saveBuildCache(currentHash, pkg.version);
    syncSiteAndUpdates(pkg.version);
    console.log(`[build] Explicit version bump (${explicitBump}): ${oldVersion} -> ${pkg.version}`);
    return pkg;
  }

  const userscriptFile = path.join(distDir, 'kareer.user.js');
  if (cache && cache.hash !== currentHash) {
    const oldVersion = pkg.version;
    pkg.version = incrementVersion(oldVersion, 'patch');
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    saveBuildCache(currentHash, pkg.version);
    syncSiteAndUpdates(pkg.version);
    console.log(`[build] Source changes detected. Version incremented: ${oldVersion} -> ${pkg.version}`);
    return pkg;
  }

  syncSiteAndUpdates(pkg.version);

  if (!cache || !fs.existsSync(userscriptFile)) {
    saveBuildCache(currentHash, pkg.version);
    console.log(`[build] Build cache initialized at version ${pkg.version}`);
    return pkg;
  }

  console.log(`[build] No source changes detected. Current version: ${pkg.version}`);
  return pkg;
}

function userscriptBanner(pkg) {
  return `// ==UserScript==
// @name         Kareer
// @namespace    https://github.com/Amro212/kareer
// @version      ${pkg.version}
// @description  ${pkg.description}
// @author       ${pkg.author}
// @updateURL    https://raw.githubusercontent.com/Amro212/kareer/main/dist/kareer.user.js
// @downloadURL  https://raw.githubusercontent.com/Amro212/kareer/main/dist/kareer.user.js
// @match        *://*/*
// @connect      openrouter.ai
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_getTab
// @grant        GM_saveTab
// @run-at       document-idle
// ==/UserScript==
`;
}

const shared = (pkg) => ({
  bundle: true,
  sourcemap: false,
  minify: false,
  target: ['chrome110', 'firefox115'],
  legalComments: 'inline',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __UI_FONTS__: JSON.stringify(Object.fromEntries(FONT_FILES.map(([, file]) => [
      file, fs.readFileSync(path.join(srcDir, 'assets', 'fonts', file)).toString('base64'),
    ]))),
  },
});

function userscriptOptions(pkg) {
  return {
    ...shared(pkg),
    entryPoints: [path.join(srcDir, 'targets', 'userscript', 'entry.js')],
    outfile: path.join(distDir, 'kareer.user.js'),
    format: 'iife',
    banner: { js: userscriptBanner(pkg) },
  };
}

function extensionOptions(pkg, browser) {
  const extDir = path.join(srcDir, 'targets', 'extension');
  return {
    ...shared(pkg),
    entryPoints: {
      'content/index': path.join(extDir, 'content', 'index.js'),
      'background/index': path.join(extDir, 'background', 'index.js'),
      'options/index': path.join(extDir, 'options', 'index.js'),
      'popup/index': path.join(extDir, 'popup', 'index.js'),
    },
    outdir: path.join(distDir, browser),
    format: 'iife',
    define: {
      ...shared(pkg).define,
      __TARGET_BROWSER__: JSON.stringify(browser),
    },
  };
}

/** Manifest, HTML, and icons are copied rather than bundled. */
function writeExtensionStaticFiles(pkg, browser) {
  const extDir = path.join(srcDir, 'targets', 'extension');
  const outDir = path.join(distDir, browser);

  const base = JSON.parse(fs.readFileSync(path.join(extDir, 'manifest.base.json'), 'utf8'));
  const overlay = JSON.parse(fs.readFileSync(path.join(extDir, `manifest.${browser}.json`), 'utf8'));
  const manifest = { ...base, ...overlay, version: pkg.version };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  fs.cpSync(path.join(srcDir, 'assets', 'fonts'), path.join(outDir, 'assets', 'fonts'), { recursive: true });
  const pageStyles = fs.readFileSync(path.join(extDir, 'shared', 'pages.css'), 'utf8');
  fs.writeFileSync(path.join(outDir, 'assets', 'theme.css'),
    fontFaceCSS(file => `fonts/${file}`) + `\n:root {${TOKENS}}\n` + pageStyles);

  for (const page of ['options', 'popup', 'first-run']) {
    const html = path.join(extDir, page, 'index.html');
    if (fs.existsSync(html)) {
      fs.mkdirSync(path.join(outDir, page), { recursive: true });
      fs.writeFileSync(path.join(outDir, page, 'index.html'),
        fs.readFileSync(html, 'utf8').replaceAll('{{VISUAL_NAME}}', VISUAL_NAME));
    }
    const js = path.join(extDir, page, 'index.js');
    // first-run is a tiny page script, not an esbuild entry.
    if (page === 'first-run' && fs.existsSync(js)) {
      fs.mkdirSync(path.join(outDir, page), { recursive: true });
      fs.copyFileSync(js, path.join(outDir, page, 'index.js'));
    }
  }

  const icons = path.join(extDir, 'icons');
  if (fs.existsSync(icons)) {
    fs.mkdirSync(path.join(outDir, 'icons'), { recursive: true });
    for (const file of fs.readdirSync(icons)) {
      fs.copyFileSync(path.join(icons, file), path.join(outDir, 'icons', file));
    }
  }
}

async function run() {
  const pkg = prepareVersion();
  const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
  const target = targetArg ? targetArg.split('=')[1] : 'all';
  const isWatch = process.argv.includes('--watch');

  const jobs = [];
  if (target === 'all' || target === 'userscript') {
    jobs.push({ label: 'userscript', options: userscriptOptions(pkg), after: null });
  }
  if (target === 'all' || target === 'extension') {
    for (const browser of BROWSERS) {
      jobs.push({
        label: `extension:${browser}`,
        options: extensionOptions(pkg, browser),
        after: () => writeExtensionStaticFiles(pkg, browser),
      });
    }
  }

  for (const job of jobs) {
    if (isWatch) {
      const ctx = await esbuild.context(job.options);
      await ctx.watch();
      job.after?.();
      console.log(`[build:watch] ${job.label} watching at v${pkg.version}`);
    } else {
      await esbuild.build(job.options);
      job.after?.();
      if (job.label.startsWith('extension:')) {
        const browser = job.label.split(':')[1];
        const outDir = path.join(distDir, browser);
        const zipName = browser === 'firefox' ? 'kareer-firefox.xpi' : 'kareer-chrome.zip';
        zipDirectory(outDir, path.join(distDir, zipName));
        console.log(`[build] packed ${zipName}`);
      }
      console.log(`[build] ${job.label} built at v${pkg.version}`);
    }
  }
}

run().catch((err) => {
  console.error('[build] Build failed:', err);
  process.exit(1);
});
