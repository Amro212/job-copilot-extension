import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import selfsigned from 'selfsigned';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '..', '..', '..', 'fixtures');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
};

/** Serves the fixtures directory. Tests reach it through mapped hostnames so a
 *  single server can act as several distinct origins. */
export function startFixtureServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(fixturesDir, rel);

    if (!file.startsWith(fixturesDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(fs.readFileSync(file));
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

/**
 * Stand-in for OpenRouter. Chromium is told to resolve openrouter.ai here, so the
 * extension's real request path is exercised without a live key or network call.
 */
export async function startOpenRouterMock() {
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'openrouter.ai' }], {
    days: 2,
    keySize: 2048,
    algorithm: 'sha256',
    altNames: [{ type: 2, value: 'openrouter.ai' }, { type: 2, value: 'localhost' }],
  });

  // Chrome no longer honours a blanket --ignore-certificate-errors for every
  // request, so the launcher pins this exact key instead.
  const spki = crypto
    .createHash('sha256')
    .update(new crypto.X509Certificate(pems.cert).publicKey.export({ type: 'spki', format: 'der' }))
    .digest('base64');

  const state = {
    requests: [],
    // Default reply: echo one answer per requested field.
    handler: (body) => {
      const user = JSON.parse(body.messages.at(-1).content);
      const answers = (user.fieldsToFill || []).map((field) => ({
        fieldId: field.fieldId,
        value: mockValueFor(field),
        inferred: false,
      }));
      return { choices: [{ message: { content: JSON.stringify({ answers }) } }] };
    },
    status: 200,
  };

  const server = https.createServer({ key: pems.private, cert: pems.cert }, (req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw); } catch {}
      state.requests.push({ url: req.url, authorization: req.headers.authorization, body });

      let payload;
      try {
        payload = state.handler(body, state.requests.length);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `mock handler threw: ${err.message}` } }));
        return;
      }

      res.writeHead(state.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port, state, spki });
    });
  });
}

function mockValueFor(field) {
  if (field.type === 'checkbox') return true;
  if (['select', 'radio', 'combobox'].includes(field.type)) {
    const real = (field.options || []).find((option) => option.label && !/^(--|select|choose|please)/i.test(option.label.trim()));
    return real ? real.label : '';
  }
  if (field.type === 'email') return 'test.applicant@example.com';
  if (field.type === 'tel') return '+1 555 0100';
  if (field.type === 'url') return 'https://example.com/profile';
  if (field.type === 'number') return '3';
  if (field.type === 'textarea') return 'I build and ship software, and I have shipped production features end to end.';
  return `Filled ${field.fieldId}`;
}
