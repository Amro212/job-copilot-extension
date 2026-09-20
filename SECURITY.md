# Security & Privacy Policy

Job Copilot is designed from the ground up with a **local-first, zero-telemetry, and privacy-preserving** architecture. Because job applications involve sensitive personal data (resumes, work history, contact details) and AI API keys, this document outlines our security model, threat boundaries, and vulnerability reporting procedures.

---

## 1. Core Security Principles

1. **Local-First Storage**: Your personal profile, resume data, notes, and application records remain in your browser's private extension storage. We do not operate a backend server, database, or telemetry pipeline.
2. **Bring Your Own Key (BYOK)**: You supply your own AI provider API key (e.g., via OpenRouter). There are no intermediary proxy servers.
3. **Strict Key Isolation**: Your API keys are never exposed to the web pages you visit, page scripts, DOM elements, or web logs.
4. **Truthful Grounding**: The AI model is strictly instructed never to fabricate jobs, dates, skills, metrics, or certifications.
5. **Human-in-the-Loop Safety Boundaries**: The system automatically halts execution before legal attestations, background check authorizations, electronic signatures, and interactive assessments.

---

## 2. Threat Model & Key Isolation

Job Copilot operates on third-party websites (such as ATS portals and employer job boards). To defend against malicious or compromised web pages attempting to steal your credentials:

### Extension Target (Chrome & Firefox)
- **Background Worker Dispatch**: All AI API network requests are performed exclusively within the extension's background service worker (`src/targets/extension/background/index.js`).
- **No In-Page Key Storage**: The API key is stored in `chrome.storage.local` and accessed only by the background worker.
- **Isolated Messaging**: In-page content scripts communicate with the background worker using structured extension messaging (`chrome.runtime.sendMessage`). The content script transmits only the extracted form field labels and user profile context. The background worker attaches the `Authorization: Bearer <KEY>` header directly to outgoing HTTPS requests to `openrouter.ai`.
- **Zero Page Leakage**: The key is never exposed to `window`, `document`, page `localStorage`, `sessionStorage`, or debug bundles.

### Userscript Target (Tampermonkey / Violentmonkey)
- **Privileged Storage**: The API key is stored using `GM_setValue` in Tampermonkey's sandboxed storage, which is inaccessible to page scripts.
- **Isolated HTTP Requests**: API calls are routed via `GM_xmlhttpRequest`, running in the privileged userscript sandbox rather than the page's `fetch` or `XMLHttpRequest` context.

---

## 3. Data Privacy & AI Network Payloads

### What Leaves Your Machine
When you click **Autofill** or trigger an inline field rewrite, a single HTTPS request is sent directly to OpenRouter (`https://openrouter.ai/api/v1/chat/completions`).

The payload contains:
- The extracted labels, placeholders, and field types of the current form.
- The relevant fields from your saved profile and resume context needed to answer the questions.
- A system prompt constraining the model to output valid JSON grounded strictly in your supplied profile.

### What Never Leaves Your Machine
- Passwords or payment information.
- Browser history, cookies, or session tokens.
- Telemetry, analytics, or behavioral usage tracking.

---

## 4. Safety Boundaries & Anti-Bot Compliance

Job Copilot operates as a browser-side productivity assistant, not an automated web scraper or stealth bot.

- **No CAPTCHA Bypassing**: The extension does not attempt to solve or bypass CAPTCHAs, Cloudflare turnstiles, or bot detection mechanisms.
- **No Stealth / Spoofing Logic**: We do not use `chrome.debugger`, CDP, or fingerprint spoofing.
- **Protected Actions**: The autofill engine explicitly refuses to automatically sign legal documents, consent to background checks, or complete interactive tests. These fields are flagged in the panel for manual candidate review.

---

## 5. Reporting a Vulnerability

We take the security of Job Copilot seriously. If you discover a security vulnerability or credential leak risk:

1. **Do not disclose publicly**: Please avoid opening public GitHub issues for sensitive security vulnerabilities.
2. **Submit a Private Report**: Use [GitHub's Private Vulnerability Reporting](https://github.com/Amro212/autofill-extension/security/advisories/new) on the repository.
3. **Include Details**:
   - Description of the vulnerability.
   - Steps to reproduce or proof-of-concept.
   - Potential impact.
   - Any suggested remediations.

We will review reports promptly and publish patches alongside responsible disclosure advisories.
