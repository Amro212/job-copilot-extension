<div align="center">

# 🚀 Job Copilot

**AI-powered job application autofill for Chrome, Firefox, and Tampermonkey.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-0.4.21-green.svg)](./package.json)
[![Platform: Extension & Userscript](https://img.shields.io/badge/platform-Chrome%20%7C%20Firefox%20%7C%20Tampermonkey-orange.svg)](#installation)
[![Security: BYOK & Isolated](https://img.shields.io/badge/security-BYOK%20%7C%20Zero%20Telemetry-purple.svg)](./SECURITY.md)

*Apply to jobs in seconds without copy-pasting your resume 50 times a day. Private, local-first, and powered by the LLM of your choice.*

</div>

---

## 📖 Table of Contents

- [What is Job Copilot?](#what-is-job-copilot)
- [Key Features](#key-features)
- [Supported ATS Matrix](#supported-ats-matrix)
- [Quick Start for Job Seekers](#quick-start-for-job-seekers)
  - [Step 1: Get an OpenRouter API Key](#step-1-get-an-openrouter-api-key)
  - [Step 2: Install the Extension or Userscript](#step-2-install-the-extension-or-userscript)
  - [Step 3: Configure Your Profile & Resume](#step-3-configure-your-profile--resume)
  - [Step 4: Autofill Your First Job Application](#step-4-autofill-your-first-job-application)
- [Safety & Privacy Guarantees](#safety--privacy-guarantees)
- [Developer & Contributor Guide](#developer--contributor-guide)
  - [Prerequisites](#prerequisites)
  - [Project Architecture](#project-architecture)
  - [Build Commands](#build-commands)
  - [Testing & ATS Fixture Capture](#testing--ats-fixture-capture)
- [Troubleshooting & FAQ](#troubleshooting--faq)
- [License & Security](#license--security)

---

## What is Job Copilot?

Job Copilot is an open-source browser assistant that scans job application forms, matches questions to your resume and experience, and accurately fills out inputs, comboboxes, dropdowns, radio buttons, and textareas.

Unlike proprietary autofill extensions that store your sensitive resume data on third-party servers or charge monthly subscriptions, Job Copilot:
- **Runs entirely in your browser** with **zero telemetry** and no external backend.
- Uses **Bring Your Own Key (BYOK)** with OpenRouter, allowing you to use fast, cost-effective models (such as `google/gemini-2.0-flash` or `anthropic/claude-3.5-sonnet`) for fractions of a cent per application.
- Uses a **non-intrusive Shadow DOM floating panel** that never conflicts with website stylesheets.

---

## Key Features

- 🎯 **High-Accuracy Field Detection**: Handles standard inputs, custom searchable comboboxes, multi-select dropdowns, date pickers, radios, and checkboxes.
- 🤖 **Truthful Grounding**: Built-in prompts strictly forbid the AI from inventing credentials, dates, tools, or past jobs. If information is missing from your profile, the field is highlighted for manual input rather than hallucinated.
- 🛡️ **Safety Boundaries**: Automatically pauses and alerts you when encountering e-signatures, background check consents, diversity disclosures, or interactive assessments.
- ⚡ **Multi-Page Navigation**: Detects "Next" and "Continue" buttons across multi-step applications while remembering previously entered data.
- ✍️ **Inline Narrative Rewrite**: Easily tweak open-ended essay questions ("Why do you want to work here?") with an inline AI rewrite tool to tailor answers to specific company values.
- 🔒 **Ironclad Key Isolation**: Your OpenRouter API key is stored in sandboxed extension storage and used only by background workers. It is never exposed to page scripts or web DOM.

---

## Supported ATS Matrix

Job Copilot includes dedicated adapters for major Applicant Tracking Systems (ATS) as well as an intelligent generic fallback:

| ATS / Platform | Adapter | Searchable Comboboxes | Multi-Page Steps | File Uploads |
| :--- | :---: | :---: | :---: | :---: |
| **Ashby** | ✅ Dedicated | ✅ Supported | ✅ Supported | ✅ Supported |
| **Greenhouse** | ✅ Dedicated | ✅ Supported | ✅ Supported | ✅ Supported |
| **Lever** | ✅ Dedicated | ✅ Supported | ✅ Supported | ✅ Supported |
| **Workday** | ✅ Dedicated | ✅ Supported | ✅ Supported | ✅ Supported |
| **Generic Forms** | ✅ Fallback | ✅ Standard HTML | ✅ Standard Forms | ✅ Standard Inputs |

---

## Quick Start for Job Seekers

Follow this simple 4-step guide to get up and running in less than 5 minutes.

### Step 1: Get an OpenRouter API Key

Job Copilot connects to AI models via [OpenRouter](https://openrouter.ai/), an API aggregator providing access to dozens of leading LLMs.

1. Create a free account at [openrouter.ai](https://openrouter.ai/).
2. Navigate to **Keys** and click **Create Key**.
3. Add a small credit balance (e.g., $3–$5 is typically enough for hundreds of applications).
   > [!TIP]
   > We recommend the default model: **`google/gemini-2.0-flash`**. It is extremely fast, accurate at structured JSON output, and costs fractions of a cent per application.

---

### Step 2: Install the Extension or Userscript

Choose whichever method fits your browser:

#### Option A: Chrome, Brave, Edge, or Chromium Browsers
1. Download or clone this repository to your computer.
2. Build the project (or use the pre-built `dist/chrome` directory):
   ```bash
   npm install
   npm run build:extension
   ```
3. Open your browser and navigate to the Extensions page:
   - **Chrome**: `chrome://extensions`
   - **Brave**: `brave://extensions`
   - **Edge**: `edge://extensions`
4. Toggle on **Developer mode** (usually a switch in the top-right corner).
5. Click **Load unpacked** and select the `dist/chrome` folder inside this project.

#### Option B: Firefox
1. Build the extension:
   ```bash
   npm install
   npm run build:extension
   ```
2. In Firefox, navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...** and select `dist/firefox/manifest.json` (or the packed `.xpi` file in `dist/`).

#### Option C: Tampermonkey Userscript (Any Browser)
If you prefer userscripts:
1. Install the [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/) browser extension.
2. Build the userscript:
   ```bash
   npm run build:userscript
   ```
3. Open `dist/job-copilot.user.js` in your browser or import it into your Tampermonkey dashboard.

---

### Step 3: Configure Your Profile & Resume

1. Click the **Job Copilot** icon in your browser toolbar (or open the floating side panel).
2. Go to the **Settings** tab:
   - Paste your **OpenRouter API Key**.
   - Select your preferred model (e.g. `google/gemini-2.0-flash`).
3. Go to the **Profile** tab:
   - Fill in your basic information (Full Name, Email, Phone, LinkedIn, GitHub, Portfolio).
   - Paste your **Resume text / context**.
   - Add any **Applicant Notes** (e.g. salary expectations, notice period, sponsorship requirements, preferred pronouns).
4. Click **Save Profile**. Your data is saved locally in your browser.

---

### Step 4: Autofill Your First Job Application

1. Navigate to any supported job application page (e.g., Greenhouse, Lever, Ashby, or Workday).
2. The **Job Copilot** floating panel will appear on the right side of the screen.
3. Click **Scan Fields** to inspect the form, or click **Autofill Application** to fill the form in one step.
4. Review the filled values:
   - **Green highlights**: Field verified and filled.
   - **Yellow highlights**: Inferred or requires review.
5. Review the final answers, upload your resume file if prompted, and submit when satisfied!

---

## Safety & Privacy Guarantees

Job Copilot is designed with strict boundaries to protect both your privacy and the integrity of your job search:

> [!IMPORTANT]
> **Human-in-the-Loop Safeguards**
> - **No Hallucinations**: Prompt constraints enforce truthful grounding. The model will never invent job titles, employment dates, or certifications.
> - **Auto-Pause for Legal & Signature Fields**: Job Copilot intentionally pauses before e-signatures, background check authorizations, diversity surveys, and assessment tests.
> - **No Stealth or Anti-Bot Bypass**: No `chrome.debugger` or CDP hacks. Job Copilot respects website security policies.
> - **Complete Key Isolation**: Your API keys are kept in isolated background workers or userscript storage and are never exposed to the page DOM.

For full details, please review our [SECURITY.md](./SECURITY.md).

---

## Developer & Contributor Guide

Contributions, issue reports, and ATS adapters are welcome!

### Prerequisites
- [Node.js](https://nodejs.org/) v18.0.0 or higher
- npm v9 or higher

### Project Architecture

Job Copilot is structured as a unified monorepo building multiple distribution targets from a single core:

```
job-copilot-extension/
├── src/
│   ├── core/                    # Host-agnostic core logic
│   │   ├── adapters/            # ATS-specific logic (Greenhouse, Lever, Ashby, Workday)
│   │   ├── fields/              # Field actuators (fillers, comboboxes, observers)
│   │   ├── ai.js                # Prompt construction & OpenRouter API client
│   │   ├── application.js       # High-level autofill coordinator
│   │   ├── platform.js          # Platform abstraction (Extension vs. Userscript)
│   │   └── ui.js                # Shadow DOM floating panel & review UI
│   └── targets/                 # Platform-specific entrypoints & manifests
│       ├── extension/           # Chrome / Firefox MV3 extension
│       └── userscript/          # Tampermonkey userscript entrypoint
├── tools/
│   ├── build.js                 # Esbuild-powered multi-target builder
│   └── zip.js                   # Extension packager
├── fixtures/                    # Captured ATS HTML fixtures for regression tests
└── tests/                       # Unit & Playwright E2E test suites
```

### Build Commands

```bash
# Install dependencies
npm install

# Build all targets (Chrome extension, Firefox extension, and Userscript)
npm run build

# Watch mode for rapid development
npm run dev

# Build only the browser extensions
npm run build:extension

# Build only the Tampermonkey userscript
npm run build:userscript

# Increment version numbers
npm run bump:patch
npm run bump:minor
npm run bump:major
```

### Testing & ATS Fixture Capture

Job Copilot requires tests to pass on every code change to avoid regressions:

```bash
# Run unit tests
npm test

# Run Playwright E2E tests (real browser loading the extension)
npm run test:e2e
```

#### Capturing an ATS Bug Fixture
If you encounter a form or ATS edge case that doesn't fill correctly:
1. Open the floating panel on the application page.
2. Go to the **Debug** tab and click **Save page fixture**.
3. Move the downloaded `.html` and metadata files into the `fixtures/` directory.
4. Add a Playwright test under `tests/` verifying the fix.

---

## Troubleshooting & FAQ

<details>
<summary><b>Q: My API key returns an error or "Unauthorized"</b></summary>

- Verify that your OpenRouter API key starts with `sk-or-v1-`.
- Check that your OpenRouter account has an active credit balance at [openrouter.ai/credits](https://openrouter.ai/credits).
- Ensure your browser or network does not block requests to `openrouter.ai`.
</details>

<details>
<summary><b>Q: The floating panel is not appearing on a job page</b></summary>

- Check if the extension icon is active in your browser toolbar.
- Click the extension icon in the toolbar and click **Toggle Panel**.
- Refresh the application page. If the page is inside an `iframe`, Job Copilot will mount the panel in the top frame while scanning subframes in the background.
</details>

<details>
<summary><b>Q: Why wasn't a specific field filled?</b></summary>

- If a question cannot be answered from your saved profile or resume, Job Copilot skips it rather than guessing. Add the relevant detail (e.g., specific work authorization or salary expectations) to the **Applicant Notes** field in your profile.
</details>

---

## License & Security

- **License**: Released under the [MIT License](./LICENSE).
- **Security & Privacy**: Read our complete [Security Policy](./SECURITY.md) for details on key isolation and data protection.
