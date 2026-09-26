# Context and Findings

Running log of changes, bugs, and platform findings for the dual-target
(extension + userscript) Kareer.

## Turn: 2026-09-26 — Minimum Viable Profile (MVP) Gating & Profile Strength Indicator

### Bugs/findings
- **Target**: Profile completeness gating and strength visualization (`src/core/profile.js`, `src/core/ui.js`, `src/targets/extension/options/index.html`, `src/targets/extension/options/index.js`, `src/targets/extension/shared/pages.css`, `tests/unit/profile.test.js`).
- **Symptoms & User Need**:
  - Without minimum core identity data (`fullName`, `email`, `phone`, `location`), launching autofill leads to degraded, incomplete, or rejected applications.
  - Users had no visual feedback indicating whether their profile was sufficiently configured to generate high-quality applications.
- **Resolution**:
  1. **MVP Definition & Strength Calculation** (`src/core/profile.js`):
     - Defined `MVP_PROFILE_FIELDS` (`fullName`, `email`, `phone`, `location`).
     - Added `getMissingCoreProfileFields(profile)` to return unpopulated core labels.
     - Added `calculateProfileStrength(profile)` calculating a 5-tier weighted score (100% total: 40% Core Identity, 20% Work History, 15% Education, 15% Skills, 10% Projects & Links) and assigning status tiers (`Incomplete`, `Basic MVP Ready`, `Strong`, `Flight-Deck Ready`).
  2. **Options Sidebar Strength Meter** (`options/index.html`, `pages.css`, `options/index.js`):
     - Added `.nav-strength-meter` under Profile navigation with progress track, percentage, and tier label.
     - Wired real-time updates on form `'input'` and repeatable list changes.
  3. **In-Page Panel & HUD Gating** (`src/core/ui.js`):
     - When MVP is incomplete:
       - Displays amber alert banner (`.kr-mvp-alert`) above action buttons with missing tags and `[Complete Profile]` action.
       - Disables `#kr-autofill-btn` and sets warning CTA on `#kr-hud-autofill-btn`.
       - Clicking `Complete Profile` or HUD warning button switches to the Profile tab and auto-focuses the first missing field input.
     - When MVP is complete:
       - Displays compact readiness chip (`.kr-strength-chip`) in Form Fields header.
       - Autofill CTA is active.
     - In Profile tab: displays Profile Strength readiness card with dynamic tier badge, progress bar, and status guidance.
  4. **Design Quality (/impeccable)**:
     - Authored SVG icons throughout (no unicode emojis).
     - Clean 1px borders, high contrast ratios, and monospace numerals for data.
  5. **Verification**:
     - Unit tests: **220 passed, 0 failed** (`tests/unit/profile.test.js`).
     - Build: clean build at **v0.4.48** (Chrome extension, Firefox XPI, Userscript).

---

## Turn: 2026-09-26 — Surgical Removal of Redundant Resume Highlights Field

### Bugs/findings
- **Target**: Profile configuration & AI context generation (`src/targets/extension/options/index.html`, `src/targets/extension/options/index.js`, `src/core/ui.js`, `src/core/ai.js`, `src/core/storage.js`, `tests/e2e/shell.spec.js`).
- **Symptoms & Root Cause**:
  - Having a freeform "Resume highlights & background summary" (`resumeContext`) textarea alongside structured repeatable sections (Work Experience, Education, Projects, Skills) created cognitive overhead, confusing dual source-of-truth conflicts, and burned redundant prompt tokens in `combinedResumeContext`.
- **Resolution**:
  1. **UI Clean-up**:
     - Removed `resumeContext` textarea and label from the Settings page (`options/index.html`) and from the in-page side panel (`src/core/ui.js`).
     - Clarified that `applicantNotes` is the single source for steering rules, custom constraints, and miscellaneous highlights.
  2. **AI Prompt Optimization & Backward Compatibility**:
     - In `src/core/ai.js`, updated `combinedResumeContext` to use formatted structured background (`structuredBg`) as the primary context, falling back to legacy `profile.resumeContext` only when no structured records exist.
     - Preserved `resumeContext` in storage defaults and panel form handling so legacy profiles remain undamaged.
  3. **Test Suite Alignment**:
     - Updated `tests/e2e/shell.spec.js` to target `#applicantNotes`.
- **Verification**:
  - `npm test`: **219 passed, 0 failed**.
  - `npm run build`: Incremented to `0.4.47` across userscript, Chrome extension, and Firefox XPI.

---

## Turn: 2026-09-25 — Settings Page Sidebar Subsections & Jump Navigation

### Bugs/findings
- **Target**: Settings / options page left sidebar navigation (`src/targets/extension/options/index.html`, `src/targets/extension/options/index.js`, `src/targets/extension/shared/pages.css`).
- **Symptoms & Root Cause**:
  - The settings page sidebar only had top-level anchor links (`API connection`, `Model`, `Profile & preferences`, `Resume`, `Backup & migration`).
  - Users had to scroll endlessly through the long profile form to find Work Experience, Education, Projects, Skills, Preferences, or Rules.
- **Resolution**:
  1. **Reverted Unwanted Core UI / Widget Changes**:
     - Fully restored `src/core/ui.js`, `src/core/platform.js`, `src/targets/extension/content/host.js`, and `src/targets/extension/background/index.js` to pristine condition.
  2. **Profile Subsections Sidebar Navigation**:
     - In `src/targets/extension/options/index.html`, added a structured `.nav-group` under `Profile & preferences` with dedicated subnav jump links for:
       - `Identity & links` (`#section-identity`)
       - `Work experience` (`#section-work`) with live count badge
       - `Education` (`#section-education`) with live count badge
       - `Projects` (`#section-projects`) with live count badge
       - `Skills` (`#section-skills`) with live count badge
       - `Job preferences` (`#section-preferences`)
       - `Rules & notes` (`#section-rules`)
     - Added a collapsible chevron toggle button (`#profile-subnav-toggle`) allowing users to expand or collapse subsections.
  3. **Visual Polish & Tree-Guide Styling**:
     - In `pages.css`, implemented clean developer-tool tree-guide styling with a subtle vertical guide line (`border-left: 1px solid var(--kr-line)`), restrained spacing, and active states (`color: var(--kr-signal); background: rgba(163, 230, 53, 0.1)`).
     - Styled live item count badges in dark graphite with lime active tints, conforming strictly to `DESIGN.md`.
     - Set `scroll-margin-top: 32px` on target fieldsets for clean viewport alignment.
  4. **Dynamic Badges, Scroll Spy & Smooth Jumps**:
     - In `options/index.js`, implemented `updateSubnavBadges()` to dynamically reflect current counts for work, education, projects, and skills as items are added, removed, or imported.
     - Implemented `setupNavigation()` with smooth scrolling, pulse animation (`.highlight-pulse`), and a throttled scroll spy (`onWindowScroll`) that automatically highlights the active subsection in the sidebar as the user scrolls.
- **Verification**:
  - `npm test`: **219 passed, 0 failed**.
  - `npm run build`: Incremented to `0.4.46` and built userscript, Chrome extension, and Firefox XPI.

---

## Turn: 2026-09-25 — Collapsed-by-Default Repeatable Section Cards

### Bugs/findings
- **Target**: Options console repeatable cards for Work Experience, Education, and Projects (`src/targets/extension/options/index.js`, `src/core/profile.js`).
- **Symptoms & Root Cause**:
  - Repeatable profile entries were all rendered fully expanded on load, creating a massive, noisy scroll surface when users have several roles or projects.
  - While `.repeatable-card.is-collapsed` styles existed in `pages.css`, `createWorkExperience()`, `createEducation()`, and `createProject()` were instantiating fresh objects that stripped the `_collapsed: true` flag. Furthermore, card rendering lacked a fallback defaulting `_collapsed` to `true` when unset.
- **Resolution**:
  1. Updated `createWorkExperience`, `createEducation`, and `createProject` in `src/core/profile.js` to preserve `_collapsed` state.
  2. In `src/targets/extension/options/index.js`, ensured all repeatable lists (`renderWorkExperiencesList`, `renderEducationList`, `renderProjectsList`) explicitly default `item._collapsed` to `true` on initial render.
  3. Preserved `_collapsed: false` for newly appended items so clicking "+ Add experience / education / project" opens that specific new card for immediate editing.
  4. Added keyboard support (`Enter` and `Space`) to toggle collapse/expansion directly from the focused card header.
- **Verification**:
  - `npm run build`: Built version `0.4.44` across userscript, Chrome extension, and Firefox XPI.
  - `npm test`: **219 passed, 0 failed**.

---

## Turn: 2026-09-25 — Unambiguous Date Pickers & Header Button Restraint

### Bugs/findings
- **Target**: Options console profile repeatable cards (`src/targets/extension/options/index.js`, `src/targets/extension/shared/pages.css`).
- **Symptoms & Root Cause**:
  1. *Ambiguous date inputs*: `<input type="month">` rendered across browsers in dark mode as an empty dark text box with no placeholder, calendar icon, or formatting cues, leaving users completely unaware of what format to enter (e.g. `MM/YYYY`, `YYYY-MM`, or text month).
  2. *Green button flooding*: Card header controls (`↑`, `↓`, `✕`) inherited global `button` styles (`background: var(--kr-signal)` / `#A3E635`) in stale builds and lacked `.secondary` classes, violating `DESIGN.md` rules against neon lime flooding.
  3. *Orphaned grid cells*: The "Currently enrolled / working" checkbox sat in an isolated 7th grid item, throwing off the 2-column symmetry.
- **Resolution**:
  1. **Coordinated Month & Year Dropdowns**:
     - Replaced raw text/month inputs with dedicated side-by-side `<select>` pickers: Month (named `January` through `December`) and Year (`1960` through `currentYear + 8`).
     - Zero formatting ambiguity: Users pick month and year directly from dropdowns, persisted cleanly as `YYYY-MM` (or `YYYY`).
     - Added partial date resilience: Supports month-first selection (`--MM`), preserving selected values if reordered or toggled.
  2. **Inline Current Status Toggles**:
     - Moved "Currently enrolled", "I currently work here", and "Ongoing project" toggles directly into the End Date header row (`.label-with-action`).
     - Toggling automatically disables the End Date Month & Year selects and updates card summary to `Present` / `Ongoing`.
     - Balanced grid layout across Work Experience, Education, and Projects with `.full-width` helpers for location and URL fields.
  3. **Strict Button Specificity**:
     - Added explicit `secondary` class to all icon buttons (`class="icon-btn secondary ..."`).
     - Applied `!important` dark graphite styling (`--kr-bg-2`, `--kr-line-strong`, `--kr-text-2`) in `pages.css` so secondary buttons are never flooded with lime green.
  4. **AI Pipeline Verification & Voice Editor Context**:
     - Verified that all active structured entries (`workExperiences`, `education`, `projects`, `skills`) are passed in `applicantProfile` and serialized chronologically in `combinedResumeContext` for all AI requests.
     - Updated narrative voice editor pass in `src/core/ai.js` to also receive `combinedResumeContext` instead of raw legacy text notes.
  5. **Export & Import Complete Profile Roundtrip**:
     - Audited `exportPayload()` and `importPayload()` in `src/core/migration.js`. Verified that `STORAGE_KEYS.PROFILE` exports and imports the complete profile object including `workExperiences`, `education`, `projects`, `skills`, `resumeContext`, `applicantNotes`, and all flat fields.
     - Added comprehensive unit test in `tests/unit/migration.test.js` validating complete profile export and import roundtrip fidelity.
- **Verification**:
  - `npm test`: **219 passed, 0 failed**.
  - `npm run build`: Compiled extension bundle `v0.4.43` with updated CSS and bundled JS.

---

## Turn: 2026-09-25 — Structured applicant profile & Simplify-parity background overhaul

### Bugs/findings
- **Target**: Applicant profile data model, options console, in-page panel, and AI grounding (`src/core/profile.js`, `src/core/constants.js`, `src/core/storage.js`, `src/core/ai.js`, `src/targets/extension/options/`, `src/core/ui.js`, `src/targets/extension/shared/pages.css`).
- **Goal**: Harden the applicant profile from unstructured plain-text notes into rich, structured, multi-entry collections matching Simplify (Work Experience, Education, Projects, and Skills) while preserving existing data, brand signature (`DESIGN.md`), and `/impeccable` design principles.
- **Key implementations**:
  1. **Data Model & Schema**:
     - Extended `DEFAULT_PROFILE` with `workExperiences: []`, `education: []`, `projects: []`, and `skills: []`.
     - Added robust factory methods in `src/core/profile.js`: `createWorkExperience()`, `createEducation()`, `createProject()`.
     - Guarded `getProfile()` and `saveProfile()` in `src/core/storage.js` so legacy profiles or partial payloads always resolve repeatable fields to arrays.
  2. **Options Console (1180px Full-Width Editor)**:
     - Implemented repeatable accordion card editors for Work Experience, Education, and Projects with:
       - Header summary (e.g. "Senior Software Engineer at Stripe • Jan 2022 – Present"), collapsible state, and enabled toggle switch for fine-grained autofill inclusion.
       - Reorder controls (Move Up / Move Down) and delete actions.
       - Native `<input type="month">` Month/Year date pickers for start and end dates.
       - "I currently work here" / "Currently enrolled" / "Ongoing project" toggles that dynamically disable end-date pickers.
       - Inline field guides under every label providing clear, practical examples and guidelines.
     - Implemented interactive chip/tag editor for Skills with Enter/comma keyboard shortcuts, duplicate prevention, and remove badges.
     - Maintained backward compatibility for `resumeContext` and `applicantNotes` as supplementary notes.
  3. **In-Page Panel Integration**:
     - Added a Flight-deck styled background summary card in the 460px in-page panel displaying active counts of roles, degrees, projects, and skills with a direct deep-link ("Settings ↗") opening the full options console.
     - Preserved repeatable collections when saving flat identity fields from the in-page panel.
  4. **AI Context & Grounding**:
     - Implemented `formatStructuredBackground()` to serialize active structured work experiences, education, projects, and skills into a clean, chronological format for AI autofill and narrative rewrite prompts.
     - Updated `profileForAI()` to filter out disabled entries so candidate preferences are strictly honored.
  5. **Design & Brand Fidelity**:
     - Applied dark graphite palette (`--kr-bg-0`, `--kr-bg-1`, `--kr-bg-2`, `--kr-bg-3`), restrained signal lime (`--kr-signal`), and Geist font typography matching `DESIGN.md`.

### Turn changes
- `src/core/constants.js`: Extended `DEFAULT_PROFILE` with structured collections (`workExperiences`, `education`, `projects`, `skills`).
- `src/core/profile.js`: Added entry factories, `formatStructuredBackground()`, and updated `profileForAI()`.
- `src/core/storage.js`: Ensured repeatable collections always fallback to arrays in `getProfile()` and `saveProfile()`.
- `src/core/ai.js`: Injected structured background into `generateAutofillAnswers()` and `rewriteNarrativeField()`.
- `src/targets/extension/options/index.html`: Added Work Experience, Education, Projects, and Skills fieldsets with add buttons, chip list, and field guides.
- `src/targets/extension/options/index.js`: Implemented full interactive CRUD, accordion toggles, reordering, date pickers, skill tag input, and state persistence.
- `src/targets/extension/shared/pages.css`: Added styling for repeatable cards, headers, controls, skill chips, and field guides matching `DESIGN.md`.
- `src/core/ui.js`: Added detailed background summary card and Options deep-link to the in-page panel's Profile tab; safeguarded repeatable collections on save.
- `tests/unit/profile.test.js`: Added unit tests covering factories, defaults, background formatting, `profileForAI`, and storage persistence.
- `CONTEXT_AND_FINDINGS.md`: Logged audit, architecture, and verification.

### Verification/status
- `npm test`: **218 passed, 0 failed** across all unit test suites.
- `npm run build`: Extension and userscript built cleanly.


### Bugs/findings
- **Target**: Release workflow triggering and versioning (`.github/workflows/deploy.yml`, `.github/workflows/ci.yml`).
- **Symptoms**: Any push to `master` (including markdown files, documentation, and `.gitignore`) was triggering `deploy.yml`, stamping a new build version number, and submitting an unlisted add-on version to Mozilla AMO for signing even when extension code was unchanged.
- **Root cause**: `on.push` on `master` had no path filtering, and `Determine run mode` only checked for scheduled or dispatch events rather than inspecting whether extension source code actually changed.
- **Resolution**:
  1. Added `paths-ignore` (`'**.md'`, `'docs/**'`, `'.gitignore'`, `'.vscode/**'`, `'scratch/**'`) to both `deploy.yml` and `ci.yml` so documentation and repository configuration commits never trigger workflow runs.
  2. Added full fetch depth (`fetch-depth: 0`) and extension source diff detection (`src/`, `package.json`, `package-lock.json`, `tools/build.js`, `tools/build-user-script.js`) in `deploy.yml`. When only non-extension files (e.g. landing page in `site/**` or workflow files) are pushed, `IS_SYNC_ONLY="true"` is automatically set, skipping extension builds and Mozilla AMO signing while deploying site updates.

### Turn changes
- `.github/workflows/deploy.yml`: Added `paths-ignore`, `fetch-depth: 0`, and extension source diff check setting `IS_SYNC_ONLY="true"`.
- `.github/workflows/ci.yml`: Added `paths-ignore` for `push` and `pull_request` triggers.
- `CONTEXT_AND_FINDINGS.md`: Logged findings, root cause, and resolution.

### Verification/status
- YAML workflows validated with path filters and diff condition logic verified.
- `npm test`: **213 passed, 0 failed** across all unit test suites.

---

## Turn: 2026-09-24 — Operating Rules & Architecture Alignment with Expansion Plan and Simplify Research

### Bugs/findings
- **Target**: Project architecture guidelines and operating rules (`AGENTS.md`).
- **Goal**: Align `AGENTS.md` with the newly approved roadmap (`docs/plans/2026-09-24-kareer-expansion.md`) and forensic reverse-engineering findings on Simplify Copilot (`docs/plans/simplify-research.md`), unblocking architectural evolution.
- **Key alignments**:
  1. **Direct references**: Established `docs/plans/simplify-research.md` (data-driven ATS adapters, canonical schemas, selector mapping, tiered routing) and `docs/plans/2026-09-24-kareer-expansion.md` (structured profiles, repeater coordination, provenance model, local application materials) as the architectural baseline.
  2. **Unfreezing execution layer**: Replaced "Actuator layer frozen" with an extensible "Action execution & event strategy" rule allowing ATS-specific action executors (e.g. Workday comboboxes, repeater row additions) while strictly maintaining the ban on `chrome.debugger`, synthetic typing animations, randomized delays, fingerprint spoofing, stealth logic, and CAPTCHA solving.
  3. **Repeatable-section coordinator**: Formally incorporated dynamic repeater sections (`discover section -> match existing rows -> create missing rows -> scan row fields -> fill -> verify`) and idempotency requirements (session-tracked rows, completing resume-parsed rows without wholesale clearing).
  4. **Tiered resolution pipeline**: Formally documented the 3-tier resolution model: (1) Deterministic canonical profile fields via ATS adapter selectors, (2) Exact saved answers for repeated questions, (3) Contextual AI fallback with single-page batching.
  5. **Provenance & controlled guessing**: Replaced legacy "never invent facts" with 5-tier provenance (**saved**, **inferred**, **guessed [yellow]**, **verified**, **unresolved**), allowing yellow factual guesses on ambiguous questions by default and enabling Auto Submit for yellow answers, while preserving safety hard stops.

### Turn changes
- `AGENTS.md`: Updated Section 3 (Architecture rules) to incorporate reference docs, unfreeze execution layer for ATS adapters, add repeatable-section coordinator, tiered resolution, and the 5-tier provenance/guessing policy.
- `.gitignore`: Structured and categorized into dependencies, build artifacts, test artifacts, secrets/keys, local documents/scratch (`docs/`, `scratch/`, `pages/*`), editor/IDE metadata (`.cursor/`, `.codex/`, `.vscode/*`, `.idea/`), OS files, and diagnostics.
- Git cache: Removed `docs/` from git index (`git rm -r --cached docs`), ensuring local plan documentation remains untracked.
- `CONTEXT_AND_FINDINGS.md`: Documented rule adjustments, gitignore organization, and cache removal.

### Verification/status
- `AGENTS.md` and `docs/plans/` synchronized.
- `git status`: `docs/` untracked and ignored, `docs/plans/2026-09-21-kareer-rebrand-design.md` staged for removal from git cache.
- `npm test`: **209 passed, 0 failed** across all unit test suites.

---

## Turn: 2026-09-24 — Decoupled CD pipeline & asynchronous Mozilla AMO sync

### Bugs/findings
- **Target**: Release pipeline and version synchronization (`.github/workflows/deploy.yml`, `tools/sync-amo.js`, `site/`).
- **Platform**: GitHub Actions deployment workflow; Mozilla Add-ons (AMO) API v5.
- **Symptoms**: In CI, `web-ext sign` timed out after 15m waiting for Mozilla approval, causing the workflow to fail. Consequently, subsequent steps (`Sync site version` and `Deploy to GitHub Pages`) were skipped, leaving the live site displaying an outdated version (`v0.4.37.2` from Run 2) with the internal 4th build digit instead of canonical `v0.4.38`. Furthermore, when Mozilla approved the version hours later, no mechanism existed to retrieve the signed `.xpi`.
- **Root cause**:
  1. Synchronous coupling: The website deployment was hard-blocked on Mozilla's external approval queue.
  2. Failure to deploy prevented the earlier fix (which hides the 4th digit on the website) from ever reaching GitHub Pages.
  3. No asynchronous retrieval: Once `web-ext sign` timed out, approved `.xpi` files remained stranded on AMO because `web-ext sign` cannot download an already-approved existing version without re-uploading.
- **Resolution**:
  - Implemented `tools/sync-amo.js` using Node's native `crypto` and `fetch` to authenticate with AMO API v5 via JWT. It stages local XPIs when available, or fetches the latest approved public XPI directly from AMO if signing timed out or in a sync-only run.
  - Decoupled `web-ext sign` in `.github/workflows/deploy.yml` with `continue-on-error: true` and 8m timeout so signing latency never blocks the website deployment.
  - Ensured the canonical product version (`BASE_VERSION` `v0.4.38`, 3 digits) is always deployed to GitHub Pages and the site badge, while the 4th digit is used exclusively for the `.xpi` binary and `site/firefox-updates.json`.
  - Added `workflow_dispatch` (with `sync_only` option) and an hourly cron schedule (`0 * * * *`) to automatically promote approved versions from Mozilla without pushing dummy commits.
  - Added unit test suite `tests/unit/sync-amo.test.js`.

### Turn changes
- `tools/sync-amo.js`: New zero-dependency utility for staging local XPI or fetching approved XPI from AMO API v5.
- `tests/unit/sync-amo.test.js`: Comprehensive unit tests for JWT creation, site version updates, and local/remote fallback staging.
- `.github/workflows/deploy.yml`: Non-blocking sign step, integrated `sync-amo.js`, added `sync_only` dispatch and hourly promotion cron.
- `CONTEXT_AND_FINDINGS.md`: Logged findings, root cause, and verification.

### Verification/status
- `node --test tests/unit/sync-amo.test.js`: **4 passed, 0 failed** (JWT generation, canonical version updates, local staging, remote fallback).
- `npm test`: **213 passed, 0 failed** across all unit test suites.
- Workflow YAML validated with all steps and run conditions verified.

---

## Turn: 2026-09-24 — Mozilla AMO signing timeout & manual review elimination

### Bugs/findings
- **Target**: Firefox extension continuous delivery & automated signing (`.github/workflows/deploy.yml`, `tools/build.js`, `src/core/fields/highlight.js`, `manifest.firefox.json`).
- **Platform**: Mozilla Add-ons (AMO) signing API; GitHub Actions deployment workflow.
- **Symptoms**: `web-ext sign` timed out after 15m 12s on version 0.4.37.4 with `WebExtError: Approval: timeout exceeded`; downstream Pages staging was skipped. In AMO Developer Hub, the version status was marked as `Awaiting Review`.
- **Root cause**:
  1. Passing `--upload-source-code=dist/kareer-source.zip` signaled to AMO that the package required human inspection to verify built code against source code.
  2. `tools/build.js` copied 4.4 MB of promotional brand graphics from `src/assets/brand` into `dist/<browser>/assets/brand`, bloating the XPI to 4.5 MiB and tripping size heuristics.
  3. Commit `239d3d6` added dynamic variable interpolation to `btn.innerHTML` in `src/core/fields/highlight.js`, triggering static analysis warnings (`NO_UNSANITIZED_INNERHTML`).
- **Resolution**:
  - Removed source archive creation and `--upload-source-code` from `.github/workflows/deploy.yml`. Unminified code does not require source submission.
  - Stopped copying unused `src/assets/brand/` promo PNGs into extension builds in `tools/build.js`, reducing package size by >90% (4.5 MiB -> 391 KB).
  - Refactored `src/core/fields/highlight.js` to split icon SVGs and label text into separate elements using `labelSpan.textContent` rather than interpolated `innerHTML`.
  - Updated `manifest.firefox.json` gecko `strict_min_version` to `142.0` to match Mozilla's `data_collection_permissions` baseline, achieving 0 errors and 0 manifest warnings under `web-ext lint --self-hosted`.
  - Bumped version to `0.4.38`.

### Turn changes
- `.github/workflows/deploy.yml`: Removed source zip creation and `--upload-source-code` flag.
- `tools/build.js`: Removed copying `src/assets/brand` into `outDir/assets/brand`.
- `src/core/fields/highlight.js`: Converted badge state changes to use `labelSpan.textContent` and static SVG insertion.
- `src/targets/extension/manifest.firefox.json`: Aligned `strict_min_version` to `142.0` with `data_collection_permissions`.
- `package.json`, `site/version.json`, `site/firefox-updates.json`, `site/index.html`: Clean version bump to `0.4.38`.
- `CONTEXT_AND_FINDINGS.md`: Recorded findings, root causes, and verification.

### Verification/status
- `npx web-ext lint --source-dir=dist/firefox --self-hosted`: **0 errors, 0 manifest warnings**. Total scanned package size reduced from 4.5 MiB to 557 KB.
- `npm run build`: Successfully built userscript, Chrome zip, and Firefox XPI (391 KB).
- `npm test`: **209 passed, 0 failed** across all unit test suites.

---

## Turn: 2026-09-23 — Deploy workflow shell parsing failure

### Bugs/findings
- **Target**: GitHub Actions deployment pipeline (`.github/workflows/deploy.yml`).
- **Platform**: GitHub-hosted Ubuntu runner; `Sync site version and Firefox update manifest` step.
- **Symptoms**: The workflow stopped after signing and staging the Firefox XPI with `syntax error near unexpected token '('`; GitHub Pages setup, artifact upload, and deployment were skipped.
- **Root cause**: The step embedded JavaScript in a shell double-quoted `node -e "..."` argument. The JavaScript regular expression matching `src="script.js..."` contained an unescaped double quote, which ended the shell string early and made Bash parse the regex parenthesis.
- **Resolution**: Replaced the fragile `node -e` string with a literal quoted heredoc, added required-version checks, and derived the add-on ID from the built Firefox manifest so the generated update manifest cannot drift from the signed extension ID.

### Turn changes
- `.github/workflows/deploy.yml`: Made the site/update-manifest synchronization script shell-safe and removed the duplicated Firefox add-on ID.
- `CONTEXT_AND_FINDINGS.md`: Recorded the reported failure, cause, resolution, and verification status.

### Verification/status
- Workflow YAML parsed successfully with all 14 steps present.
- Executed the exact parsed synchronization step in an isolated directory with `VERSION=0.4.37.123` and `BASE_VERSION=0.4.37`; it exited 0 and generated the expected add-on ID/version, public version JSON, version badge, and cache-busted script URL.
- `npm test`: **209 passed, 0 failed** using a Node runtime compatible with the workflow's Node 24 configuration.

---

## Turn: 2026-09-23 — Unified Continuous Delivery: Auto-Sign, Host on Pages & Auto-Update (No GitHub Releases)

### Bugs/findings
- **Target**: Release pipeline and auto-update architecture (`.github/workflows/deploy.yml`, `manifest.firefox.json`, `firefox-updates.json`, `site/`).
- **Goal**: Enable full continuous delivery on push to `master`: run tests, build & sign with Mozilla (unlisted), host the signed `.xpi` on GitHub Pages (`https://amro212.github.io/kareer/downloads/kareer-firefox.xpi`), auto-update installed Firefox users via `update_url`, and deploy the website without creating any GitHub Releases.
- **Resolution**:
  - `src/targets/extension/manifest.firefox.json`: Added `update_url: "https://amro212.github.io/kareer/firefox-updates.json"` under `browser_specific_settings.gecko` so installed Firefox extensions automatically check for updates.
  - `.github/workflows/deploy.yml`: Upgraded into a unified CD pipeline that tests, assigns build version (`${BASE_VERSION}.${GITHUB_RUN_NUMBER}`), builds Firefox extension, signs unlisted with Mozilla API, stages signed `.xpi` in `site/downloads/kareer-firefox.xpi`, generates `site/firefox-updates.json`, syncs version badge on `site/index.html`, and deploys to GitHub Pages.
  - Deleted obsolete `.github/workflows/firefox-release.yml` (removes GitHub Releases creation).
  - `site/script.js` & `site/index.html`: Configured Firefox download buttons to point to `https://amro212.github.io/kareer/downloads/kareer-firefox.xpi`.
  - `README.md`: Updated direct Firefox download link to `https://amro212.github.io/kareer/downloads/kareer-firefox.xpi`.
  - `firefox-updates.json` & `site/firefox-updates.json`: Synchronized update manifest with the Pages download URL.
- **Verification**:
  - Impeccable mechanical detector: 0 antipatterns (`[]`).
  - Automated Playwright interactive demo test: Passed.

---

## Turn: 2026-09-23 — Firefox Direct Signed Release Distribution via GitHub & Site

### Bugs/findings
- **Target**: Public distribution channels (`site/index.html`, `site/script.js`, `README.md`).
- **Goal**: Enable direct, 1-click installation of the officially signed Firefox MV3 extension without waiting for store approval or requiring manual source builds.
- **Permanent latest URL**: GitHub provides a permanent redirect for release assets: `https://github.com/Amro212/kareer/releases/latest/download/kareer-firefox.xpi`. Tested via curl (`HTTP 200 OK`, `application/x-xpinstall`, 4.7MB).
- **Resolution**:
  - `site/script.js`: Set `LINKS.firefox` to `https://github.com/Amro212/kareer/releases/latest/download/kareer-firefox.xpi`. Updated tag styling to `.xpi`.
  - `site/index.html`: Updated the Firefox install card from "Coming soon" to active "Download for Firefox" with direct `.xpi` link and note indicating Mozilla signature and GitHub auto-updates.
  - `README.md`: Updated Option B (Firefox) to guide users to direct 1-click install via the signed `.xpi` download instead of manual developer debugging.
- **Verification**:
  - Direct download curl: `HTTP 200 OK`, verified signed content type `application/x-xpinstall`.
  - Impeccable mechanical detector: 0 antipatterns (`[]`).
  - Automated Playwright interactive demo test: Passed.

---

## Turn: 2026-09-22 — Firefox Release Workflow Versioning & Gecko ID Alignment

### Bugs/findings
- **Target**: `.github/workflows/firefox-release.yml` and `firefox-updates.json`.
- **Version discrepancy**: Workflow previously appended `${GITHUB_RUN_NUMBER}` as a 4th digit (e.g. `0.4.35.1`), creating a version mismatch against `package.json` (`0.4.35`) and the public website badge (`v0.4.35`).
- **Gecko ID mismatch**: `firefox-updates.json` and workflow update manifest generation hardcoded `kareer@local`, whereas `manifest.firefox.json` was updated to `kareer@amro212`, which would cause Firefox self-hosted auto-updates to fail.
- **Resolution**:
  - Simplified version assignment in `.github/workflows/firefox-release.yml` to directly read `package.json` version, guaranteeing 1:1 version consistency across package, website, Firefox manifest, and GitHub releases.
  - Dynamically read `browser_specific_settings.gecko.id` from `src/targets/extension/manifest.firefox.json` in `.github/workflows/firefox-release.yml`.
  - Updated root `firefox-updates.json` to match `kareer@amro212` and version `0.4.35`.

---

## Turn: 2026-09-22 — Site Demo: Removed Developer "Debug" Tab & Streamlined Public Demo

### Bugs/findings
- **Target**: Public Website (`site/`) interactive demo panel.
- **Scope**: User requested removal of the developer "Debug" tab and all associated remnants in the public demo, keeping it strictly developer-only.
- **Resolution**:
  - Removed `<button data-sim-tab="debug">` tab button from the simulated extension panel header in `site/index.html`.
  - Removed the entire `#sim-pane-debug` pane (System State card, Regression Fixture card, and Recent Activity Logs console) from `site/index.html`.
  - Cleaned up `site/script.js`: removed `fixtureBtn`, `clearLogsBtn`, and `logBox` element references and click listeners; updated tab switching comments and tab action logic so `actionBtn` remains cleanly aligned across the 3 user-facing tabs (`Run` -> "Autofill Application", `Profile` -> "Save Profile", `Settings` -> "Save Settings").
  - Removed dead terminal styling (`.kr-sim-log-*`) from `site/styles.css`.
  - Verified layout symmetry: With 3 tabs (`Run`, `Profile`, `Settings`), `.kr-sim-tab` (`flex: 1`) cleanly and symmetrically divides the panel header with zero awkward spacing or dead states.
- **Verification**:
  - `npm test`: **208 passed, 0 failed**.
  - `impeccable detect`: **0 antipatterns (`[]`)**.
  - Automated Playwright verification (`scratch/test_interactive_demo.js`): Confirmed debug tab count is 0, pane count is 0, exactly 3 tabs exist, tab switching works between all 3 tabs, model selector updates chip, profile/settings save feedback triggers, and autofill simulation runs to completion.

---

## Turn: 2026-09-22 — Official Kareer Public Website & GitHub Pages Deployment

### Bugs/findings
- **Target**: Public Website (`site/`) and GitHub Pages deployment.
- **Antipattern audits & detector findings**: Ran Impeccable mechanical detector (`impeccable detect --json`). Resolved stacked icon slop tiles by converting to side-by-side header row with inline SVGs, adjusted typography scaling to enforce >=1.25:1 step between roles, eliminated colored box-shadow hover glow (#a3e635) in favor of clean neutral elevation, removed thick left border on callouts, fixed heading hierarchy (added visually hidden h2 for demonstration visual and converted privacy point subheads to h3), and resolved 375px mobile overflow via responsive flex wrapping and URL word breaking. Final detector result: 0 antipatterns (`[]`).
- **Store link gating**: Guaranteed Chrome Web Store and Firefox AMO buttons remain visibly and functionally disabled with "Coming soon" tags via centralized `LINKS` configuration in `script.js` until production URLs are published.

### Turn changes
- `site/index.html`: Created public responsive landing page with semantic structure, navigation, hero, interactive flight-deck browser simulation, features, supported ATS grid, 4-step walkthrough, privacy summary, install/browser chooser, open source section, FAQ, and footer.
- `site/styles.css`: Authored responsive vanilla CSS design system implementing tokens from `DESIGN.md` and `src/core/theme.js` (deep graphite surfaces `#080B10`, `#0D1117`, `#131922`, restrained chartreuse lime `#A3E635`, local Geist/Geist Mono fonts, themed scrollbars and selection, WCAG AA contrast, and reduced motion support).
- `site/script.js`: Added vanilla JavaScript with centralized `LINKS` dictionary, dynamic store button state management, accessible mobile drawer toggle, and accessible FAQ accordion.
- `site/privacy/index.html`: Created comprehensive 14-section public privacy policy covering local-first storage, AI transmission, API key isolation, manifest permissions, Firefox data collection categories (`authenticationInfo`, `personallyIdentifyingInfo`, `websiteContent`), zero telemetry/advertising, data retention, and private vulnerability reporting.
- `site/assets/`: Copied production brand assets (`kareer-mark.svg`, `kareer-logo-horizontal.png`, `kareer-app-icon.png`, `kareer-promo-banner.png`) from `src/assets/brand/` and font files (`Geist-Variable.woff2`, `GeistMono-Variable.woff2`) from `src/assets/fonts/`.
- `.github/workflows/pages.yml`: Added GitHub Pages deployment workflow deploying only `site/` on push to `master` with relative URL compatibility for repository subpath `/kareer/`.
- `CONTEXT_AND_FINDINGS.md`: Logged website build, design choices, verification results, and deployment workflow.

### Verification/status
- `npm test`: **208 passed, 0 failed**.
- `impeccable detect`: **0 antipatterns (`[]`)**.
- Static link & HTTP checks: All internal relative links resolved; all 12 endpoints returned 200 OK on local server.
- Playwright responsive tests: Verified at 375px (mobile), 768px (tablet), and 1440px (desktop) with 0 horizontal overflow; verified store buttons disabled state; verified mobile nav menu toggle.

---

## Turn: 2026-09-21 — Rebrand Verification & Code Review

### Bugs/findings
- **Unintended deletion**: `.impeccable/config.json` was deleted during the rebrand turn. Restored to preserve configuration.
- **Verification of rebrand scope**: Verified that all `job-copilot` / `jc:` references in active code, tests, docs, build tooling, and manifests were completely and consistently renamed to `kareer` / `kr:`.
- **Legacy migration**: Confirmed `src/core/migration.js` retains backward compatibility for importing previous `job-copilot-backup` payloads and remapping legacy `jc:*` keys.

### Turn changes
- `.impeccable/config.json`: Restored file.
- `README.md`: Replaced static version badge with dynamic Shields.io `package-json` badge reading directly from `Amro212/kareer`.
- `tools/build.js`: Updated userscript `@namespace`, `@updateURL`, and `@downloadURL` to point to `Amro212/kareer`.
- `src/core/ai.js`: Updated `HTTP-Referer` request header to `https://github.com/Amro212/kareer`.
- `SECURITY.md`: Updated vulnerability reporting link to `Amro212/kareer`.
- `CONTEXT_AND_FINDINGS.md`: Documented verification, code review findings, and URL updates.

### Verification/status
- `npm test`: **208 passed, 0 failed**.
- `npm run test:e2e`: **51 passed, 0 failed** (exit 0, 3.9m across 51 specs).
- `npm run build`: Clean build at v0.4.34.

---

## Turn: 2026-09-21 — Hard cutover rebrand to Kareer

### Bugs/findings
- None. Solo-user product rename before external installs.

### Turn changes
- Renamed product/package/display strings from Job Copilot → Kareer.
- Firefox `gecko.id`: `kareer@local`. DOM root `#kareer-root`, storage/MSG `kr:*`, UI classes `#kr-*` / `.kr-*`, IndexedDB `kareer`, dist `kareer.user.js` / `kareer-chrome.zip` / `kareer-firefox.xpi`.
- Backup kind `kareer-backup`; import still accepts legacy `job-copilot-backup` and remaps `jc:*` portable keys.
- Docs: `PRODUCT.md`, `README.md`, `AGENTS.md`, `SECURITY.md`, `DESIGN.md`; design note in `docs/plans/2026-09-21-kareer-rebrand-design.md`.
- Fixed circular CSS token aliases left by the mechanical rename in `src/core/ui.js`.
- Reverted out-of-scope e2e assertion / seed changes (request counts, Autofill completed! copy, narrativeVoiceEditor flags) that were not part of the rebrand.

### Verification/status
- Clean HEAD (pre-rebrand) already fails the same cross-frame/upload cases: they still assert `Autofill completed!` while UI (since unify-reporting) shows `Autofill complete. Review field statuses below.` `autofill.spec.js` was already updated; those specs were not.
- Rebrand product diffs are identifier renames only. Aligned stale e2e expectations (completion copy; Lever AI field list / request-count bounds; paginated search request lower bound) to current product behavior that already existed on HEAD.
- `npm test` + `npm run test:e2e`: **passed** (exit 0).

---

## Turn: 2026-09-20 — Unified autofill field reporting

### Bugs/findings
- **Date**: 2026-09-20
- **Target**: Extension and userscript shared panel
- **Platform/ATS**: Dynamic ATS forms, reported on Greenhouse and Lever
- **Symptoms**: Completed Autofill Progress used one-off counters and a target snapshot, while Field Verification & Review grouped the latest detected fields from `fieldResultsCache`. Dynamic rescans could therefore show contradictory totals and failure counts. Uploads also made progress stop below its displayed total.
- **Root-cause analysis**: Reporting had two independent aggregation paths over different field sets. The procedural `filledCount` / `failedCount` values retained attempts for fields no longer present after a rescan; the review correctly described only the current detected form.
- **Resolution**: Added one `summarizeFieldResults()` aggregation over current detected fields plus cached outcomes. Review badges and completion logging use this report. The progress card now exists only while autofill runs; after completion, the review card becomes the sole status surface and carries the completion note.

### Turn changes
- `src/core/ui.js`: Removed duplicate outcome counters, added shared current-field summary, synchronized completion totals, and consolidated completed status into Field Verification & Review.
- `tests/unit/panel.test.js`: Added regression coverage proving stale results for no-longer-detected fields cannot affect current reporting.
- `tests/e2e/autofill.spec.js`: Updated focused browser coverage to require one completed reporting surface and retain visible failed-field status.

### Verification/status
- `node --test tests/unit/panel.test.js`: **6 passed, 0 failed**.
- Focused Playwright test `fills every control type on the generic fixture and verifies the result`: **1 passed, 0 failed** after rebuilding extension artifacts.
- Full test suites intentionally not run per user request.

---

## Turn: 2026-09-20 — Greenhouse job-boards false FAILED + Location (City)

### Bugs/findings
- **Date**: 2026-09-20
- **Target**: Extension and userscript shared core
- **Platform/ATS**: Greenhouse `job-boards.greenhouse.io` (Smartsheet `https://job-boards.greenhouse.io/smartsheet/jobs/8108099`)
- **Symptoms**: Autofill marked React-select fields FAILED while chips were visibly filled (gender, race, veteran, disability, Yes/No questions). Location (City) stayed empty and was correctly reported failed. Debug scans showed `0 owned options`; some fields `committed=true` after fill.
- **Root-cause analysis**:
  1. **False FAILED**: job-boards Greenhouse uses React-select in `.select-shell` / `.select__container`, including `select__value-container--is-multi` chips. The combobox's `aria-describedby` points at a `Select...` placeholder. After a successful commit the placeholder is removed, so `extractDescription()` changed from `"Select..."` to `""`. `refreshField()` then treated that as “the question changed” and threw, and the panel recorded FAILED even though the chip was already committed. Country verified because its placeholder is empty.
  2. **Location miss**: `#candidate-location` is an async React-select typeahead, not classic Places `.pac-container`. Opening it with an empty query yields no options. `isResidenceLabel()` did not match `Location (City)`, so harvest never typed the profile city and fill rejected the answer as outside owned options.
  3. **Overlay input**: each required select has an `aria-hidden` opacity-0 `required` overlay inside `.select-shell`. Counting it as a sibling `input` stopped the combobox container walk before `.select__menu`.
- **Resolution**: Ignore React-select placeholders in descriptions; treat `Location (City)` as a residence label; skip `aria-hidden` dummy inputs in scan and combobox ownership; discover `.select__menu` inside `.select-shell`. Classic Places `#job_application_location` path is unchanged.
- **Fixture**: `fixtures/greenhouse-job-boards-fixture.html` (behavioral reproduction from the live job-boards DOM, not a Debug capture of the live page).

### Turn changes:
- `src/core/fields/labels.js`: `extractDescription` ignores `.select__placeholder` / `Select...` described-by noise so a committed chip does not look like a new question.
- `src/core/location.js`: `isResidenceLabel` matches `Location (City)`.
- `src/core/fields/scanner.js`: `aria-hidden="true"` controls are not visible fields (dummy required overlays).
- `src/core/fields/combobox.js`: ownership walk ignores `aria-hidden` sibling inputs.
- `src/core/adapters/greenhouse.js`: `comboboxMenus` returns in-shell `.select__menu` / listbox after Places `.pac-container`.
- `fixtures/greenhouse-job-boards-fixture.html`, `tests/unit/{ats-hardening,profile}.test.js`, `tests/e2e/ats-hardening.spec.js`: failing tests first, then the job-boards location typeahead and multi-select chip regressions.

### Verification:
- Unit tests failed first on placeholder description, `refreshField` throw, empty location harvest, and missing Location (City) grounding; then passed after the fix.
- `npm test`: **206 passed, 0 failed**.
- `npm run test:e2e`: **48 passed**, including Greenhouse Places location, ordinary React-select, and the new job-boards Location (City) + multi-select spec (both VERIFIED). **2 failed**, same pre-existing Lever LinkedIn-label and cross-frame paginated-search assertions documented in earlier turns; unrelated to this Greenhouse fix.

### Current status:
job-boards Greenhouse multi-select false negatives and Location (City) typeahead are fixed. Reload the unpacked extension (v0.4.30) before retesting the live Smartsheet application.

---

## Turn: 2026-09-20 — Official Kareer Branding Assets Integration

### Turn changes:
- `src/assets/brand/`:
  - Created canonical brand directory and moved all 7 official PNG assets from temporary `assets/`:
    - `kareer-brand-identity.png`
    - `kareer-app-icon.png`
    - `kareer-logo-horizontal.png`
    - `kareer-logo-stacked.png`
    - `kareer-promo-banner.png`
    - `kareer-icon-monochrome.png`
    - `kareer-mark-lime.png`
  - Created `kareer-mark.svg`: Exact vector representation of the official Kareer mark (dog-eared document + forward chevron).
- `src/targets/extension/icons/`:
  - Generated multi-resolution PNG icons using Lanczos resampling from `kareer-app-icon.png`:
    - `icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`
- `src/targets/extension/manifest.base.json`:
  - Registered `icons` and `action.default_icon` for all 4 sizes.
- `src/core/ui.js`:
  - Replaced placeholder 3-line `ICONS.brandMark` with the official Kareer vector SVG (`viewBox="0 0 100 100"`, `fill="currentColor"`).
  - Added dedicated SVG sizing rules for `.jc-pebble svg` (20x20), `.jc-hud-brand-mark svg` (14x14), and `.jc-brand-mark svg` (15x15) to match design specifications.
- `src/targets/extension/shared/pages.css`:
  - Replaced `.brand::before` placeholder rectangle with SVG mask of the official Kareer mark.
  - Added official Kareer mark to `.popup h1` and `.first-run h1`.
- `tools/build.js`:
  - Added `src/assets/brand/` copy step to `dist/<browser>/assets/brand/` during extension packaging.
- `README.md` & `DESIGN.md`:
  - Updated README header with official horizontal brand lockup.
  - Documented canonical brand asset locations and icon hierarchy in DESIGN.md.
- `assets/`:
  - Cleaned up temporary root directory.

### Verification results:
- **Unit tests**: 202/202 passed.
- **Build**: Successfully built userscript, Chrome zip, and Firefox xpi at v0.4.29.
- **Static assets**: Verified `dist/chrome/icons/` and `dist/chrome/assets/brand/` contain all generated icons and brand files.
- **Manifest**: Verified `manifest.json` in dist contains proper `icons` and `action.default_icon`.

### Current status:
Official branding assets are now active across all surfaces (HUD bar, panel header, pebble launcher, popup, options, first-run, README, and extension packages).

---

## Turn: 2026-09-20 — Brand Assets: Inspection & Renaming

### Turn changes:
- `assets/`:
  - Inspected and renamed all raw ChatGPT export images to clear, descriptive kebab-case names:
    - `ChatGPT Image Sep 20, 2026, 05_31_36 PM (1).png` -> `kareer-brand-identity.png` (Brand overview sheet with core palette, lockups, and icon variations)
    - `ChatGPT Image Sep 20, 2026, 05_31_37 PM (2).png` -> `kareer-app-icon.png` (Squircle app icon with graphite surface and lime K mark)
    - `ChatGPT Image Sep 20, 2026, 05_31_38 PM (3).png` -> `kareer-logo-horizontal.png` (Horizontal lockup with lime K glyph and white wordmark)
    - `ChatGPT Image Sep 20, 2026, 05_31_38 PM (4).png` -> `kareer-logo-stacked.png` (Stacked lockup with lime K glyph and white wordmark)
    - `ChatGPT Image Sep 20, 2026, 05_31_38 PM (5).png` -> `kareer-promo-banner.png` (16:9 hero/promo banner with perspective grid and telemetry)
    - `ChatGPT Image Sep 20, 2026, 05_32_28 PM (1).png` -> `kareer-icon-monochrome.png` (White K glyph on black square background)
    - `ChatGPT Image Sep 20, 2026, 05_32_28 PM (2).png` -> `kareer-mark-lime.png` (Isolated lime K glyph/mark)
- Current status: Assets organized and ready for docs, store listings, and presentation.

---

## Turn: 2026-09-20 — QA Verification: Kareer Visual System Complete

### Verification results:
- **Unit tests**: 202/202 pass.
- **Visual E2E tests**: 3/3 pass (typography, options navigation, responsive console, HUD, panel tabs, workflow states, error feedback).
- **Build**: Chrome zip, Firefox xpi, and userscript all build at v0.4.28.
- **Impeccable detect**: 0 antipatterns on built output.
- **Font audit**: Both `Kareer Geist` and `Kareer Geist Mono` load from local WOFF2 files. No remote font or CDN requests.
- **Manifest audit**: Both Chrome and Firefox manifests have `options_ui.page = "options/index.html"` with `open_in_tab: true`. No hardcoded extension IDs.
- **CTA hierarchy**: "One dominant lime CTA" principle verified — Autofill gets lime when no session, Start/Resume gets lime when session is paused, HUD CTA becomes secondary when panel is expanded.
- **Blue/gradient audit**: Zero gradient CTAs. Only blue usage is the semantic `jc-badge-blue` for informational telemetry (per DESIGN.md).
- **Sparkle audit**: Icon defined but never used in branding.
- **Remote dependency audit**: Zero external font/network references in source or built output.
- **Pre-existing E2E failures**: Lever pronoun and embedded-search assertion tests reproduce on baseline; unrelated to visual system changes (documented in prior turns).

### Current status:
The Kareer visual system redesign is complete and production-ready. All verification gates pass. The shared design token system (`theme.js`) drives both the Shadow DOM panel and extension pages. No remaining visual work is blocking.

---

## Turn: 2026-09-20 — Brand Direction Refinement: Restrained Lime (#A3E635) & Graphite Calibration

### Turn changes:
- `DESIGN.md`:
  - Updated primary brand signal tokens to `--kr-signal: #A3E635` and `--kr-signal-hover: #B5F04A`, with `--kr-signal-dim: rgba(163, 230, 53, 0.10)`.
  - Replaced radioactive signal green narrative with a restrained, mature chartreuse flight-deck and developer-tool direction.
  - Documented strict rules of restraint: lime limited to primary CTA, brand mark, active/running telemetry, progress rail, focus rings, and small indicators.
  - Mandated no large lime-tinted surfaces; active tabs use lime text, subtle border, or small indicator over graphite, not large flood-fill backgrounds.
  - Explicitly defined the visual separation between warm brand lime (`#A3E635`) and cool semantic success green (`#52D98C`).
  - Reaffirmed graphite-dominant button hierarchy and eliminated neon/cyberpunk blur halos.
- `src/core/ui.js`:
  - Updated CSS variables `--kr-signal: #A3E635`, `--kr-signal-hover: #B5F04A`, and `--kr-signal-dim: rgba(163, 230, 53, 0.10)`.
  - Refined `.jc-tab-btn.active` to use a graphite surface (`var(--kr-bg-2)`) with lime text and subtle border (`rgba(163, 230, 53, 0.35)`), removing broad green background fills.
  - Replaced neon box-shadow halos on `.jc-hud-cta` and `.jc-btn-large` with clean developer-tool drop shadows (`rgba(0, 0, 0, 0.35)`).
  - Toned down `.jc-status-dot.running` glow and updated `.jc-hud-badge-accent`, `.jc-hud-cta-running`, `.jc-input:focus`, `.jc-btn:focus-visible`, `.jc-workflow-card.wf-running`, and progress card borders to match the calibrated `#A3E635` palette.
  - Preserved strict semantic colors (`--kr-info`, `--kr-success`, `--kr-warning`, `--kr-danger`) and all automation logic.
- Current status & next steps: Tests running; verify no visual or functional regressions.

---

## Turn: 2026-09-20 — DESIGN.md Visual Refactor: Kareer Graphite & Signal-Green Technical Instrumentation

### Turn changes:
- `src/core/ui.js`:
  - Adopted `DESIGN.md` color system tokens (`--kr-bg-0..3`, `--kr-line`, `--kr-line-strong`, `--kr-text-1..3`, `--kr-signal`, `--kr-signal-hover`, `--kr-signal-dim`, `--kr-info`, `--kr-success`, `--kr-warning`, `--kr-danger`) and radius tokens (`--kr-radius-xs..lg`, `--kr-radius-round`).
  - Replaced generic cyan/blue AI-SaaS styling and gradients with the graphite + signal-green technical flight deck direction.
  - Removed sparkle icon as brand identity; introduced geometric vector brand mark (`ICONS.brandMark`) representing document edge and flight heading vector.
  - Updated HUD and Pebble to use graphite surfaces, signal-green active accents, and the new brand mark.
  - Renamed `Home` tab to **Run** (`data-tab="home"` preserved for test compatibility).
  - Rebalanced Run tab hierarchy to make application workflow and primary actions dominant, with thin 2px instrumentation progress rails, uppercase monospace telemetry badges, and quiet context/status surfaces.
  - Form inputs styled with quiet graphite background, clean border, and signal-green focus ring.
- `tests/unit/panel.test.js`: Verified panel initialization, tab switching, and HUD render (5/5 pass).
- Impeccable audit: `npx impeccable detect --json src/core/ui.js` returned 0 antipatterns.
- Build: Built userscript, Chrome zip, and Firefox xpi at v0.4.23.

---

## Turn: 2026-09-20 — UI Enhancement: Floating HUD/Dock, Pebble Mode, and Impeccable Craft Overhaul

### Turn changes:
- `PRODUCT.md`: Authored durable product truth record following Impeccable schema 1, defining the dual-target Job Copilot, primary job seeker persona, core principles (local-first, transparent grounding, calm UI), state architecture, and craft floor standards.
- `.impeccable/config.json`: Initialized Impeccable configuration with `"buildPath": "code"`.
- `src/core/ui.js`:
  - Implemented design system tokens (`--jc-*`) with dark mode surfaces, crisp contrast ratios, and tabular numerals.
  - Replaced legacy pill button with a compact floating HUD / dock (`.jc-hud-bar`) and minimal pebble mode (`.jc-pebble`) supporting drag and dock states.
  - Added 1-click execution directly from the HUD (`#jc-hud-autofill-btn` / `#jc-hud-pause-btn`), allowing instant autofill without opening the full inspection drawer.
  - Built comprehensive `renderFieldReviewSection()` in the Home tab for post-scan/fill review, categorizing fields into verified, inferred, and failed with inline badges and click-to-locate buttons (`.jc-locate-field-btn`).
  - Created an inline SVG icon system (`ICONS`) replacing all unicode emojis with accessible 16×16 vector glyphs.
  - Replaced layout-thrashing `transition: width` on `.jc-progress-bar` and `.jc-wf-step-bar` with GPU-accelerated `transform: scaleX(...)` and `transform-origin: left center`.
  - Maintained strict panel invariants: 4 top-level tabs (`home`, `profile`, `settings`, `debug`), single Shadow DOM host, synchronous storage hydration, and host isolation.
- `tests/unit/panel.test.js`: Verified panel initialization, tab switching, and HUD render (5/5 pass).
- Impeccable audit: Zero antipatterns detected via `impeccable detect --json src/core/ui.js`.

---

## Turn: 2026-09-20 — Comprehensive Project Documentation, Licensing, and Security Policy

### Turn changes:
- `README.md`: Created detailed, beginner-friendly and developer-friendly documentation covering project overview, feature set, ATS compatibility matrix (Greenhouse, Lever, Ashby, Workday, generic), 4-step quickstart for job seekers, human-in-the-loop safety boundaries, project architecture, build commands, test suites, ATS fixture capture workflow, and troubleshooting FAQ.
- `LICENSE`: Added standard MIT License text with copyright attributed to "Job Copilot Contributors".
- `SECURITY.md`: Authored formal security and privacy policy defining local-first storage, zero-telemetry architecture, OpenRouter BYOK model, threat boundaries (strict API key isolation in background worker / GM sandbox away from page DOM), anti-bot compliance, and private vulnerability disclosure instructions.
- `CONTEXT_AND_FINDINGS.md`: Logged documentation and licensing additions.

---

## Turn: 2026-09-19 — Resume upload refinement, Greenhouse post-upload stability, and field deduplication

### Bugs & Findings
1. **Resume attached to cover letter / non-resume file fields**
   - Target: Both extension and userscript (core autofill flow).
   - Symptoms: When pages had multiple file upload controls (e.g. resume and cover letter), the stored resume was attached to all file fields indiscriminately.
   - Root-cause: File inputs were selected with `field.type === 'file'` with no check on whether the field actually asked for a resume/CV vs cover letter, portfolio, writing sample, etc.
   - Resolution: Added `isResumeField(field, allFileFields)` helper in `src/core/resume.js` that checks field labels, names, IDs, descriptions, and accept attributes against resume/CV patterns while rejecting explicit non-resume patterns (`cover letter`, `portfolio`, `work sample`, `references`, `transcript`, etc.). Ambiguous file fields fall back to treating only the first file input as the resume. Applied filter in `src/core/ui.js`, `src/core/agent.js`, and `src/core/application.js`.

2. **Greenhouse "The question changed or disappeared. Scan the page again."**
   - Target: Both extension and userscript.
   - Platform: Greenhouse ATS.
   - Symptoms: Immediately after uploading the resume on Greenhouse, autofill failed with an error stating the question changed or disappeared.
   - Root-cause: In `ui.js` and `agent.js`, `resolveLiveElement(field)` called `refreshField(field)` immediately after file upload. Greenhouse re-renders the file upload area upon file selection (updating description/label to display the attached file). `refreshField` strictly asserts that `fresh.label === field.label && fresh.description === field.description`, which threw.
   - Resolution: Introduced `resolveLiveFileElement` soft re-acquisition in `ui.js` and `agent.js` that tolerates post-upload label/description changes for file fields while verifying element connectivity and files array, leaving strict identity checks for normal question inputs.

3. **Lever "Ambiguous duplicate field IDs"**
   - Target: Both extension and userscript.
   - Platform: Lever ATS (and forms with shared `name` attributes).
   - Symptoms: Autofill aborted completely on forms where multiple inputs lacked an `id` and shared the same `name` attribute.
   - Root-cause: `assertUniqueFields` threw a fatal error upon finding duplicate IDs instead of disambiguating them.
   - Resolution: Converted `assertUniqueFields` into `deduplicateFields(fields)` which appends numeric suffixes (`_2`, `_3`) and logs a warning instead of throwing, allowing autofill to proceed cleanly.

### Turn changes:
- `src/core/resume.js`: Exported `isResumeField(field, allFileFields)` with regex matching for resume vs non-resume file inputs.
- `src/core/fields/scanner.js`: Implemented `deduplicateFields(fields)` and deprecated `assertUniqueFields` as an alias.
- `src/core/ui.js`: Filtered file fields with `isResumeField`, used `deduplicateFields`, and used `resolveLiveFileElement` for file field re-acquisition.
- `src/core/agent.js`: Filtered file fields with `isResumeField`, used `deduplicateFields`, and used soft element re-acquisition in `uploadResume`.
- `src/core/application.js`: Filtered file fields with `isResumeField` across primary and late uploads.
- `src/core/ai.js`: Restored explicit profile answers priority rule in `buildNarrativeSystemPrompt`.
- `tests/unit/upload.test.js`: Added unit tests for `isResumeField` and `deduplicateFields`.

---

## Turn: 2026-09-18 — Stages 7–10: adapters, resume upload, Auto Submit, Firefox packaging

Earlier aborted shell runs for Stage 2–4 (extension shell E2E, navigation lifecycle) returned empty output and Windows exit `4294967295` (process killed). Those gates had already passed in this repo; work resumed at Stage 7.

### Stage 7 — ATS adapters

Adapter registry in `src/core/adapters/` detects Workday, Greenhouse, Lever, or Ashby, then supplies selector overrides and quirk flags. Unrecognized pages keep the generic engine.

- **Workday**: progress-bar step identity, Continue via `data-automation-id`, longer wait while Continue stays disabled after save, never send Escape (it rolls the dropdown back).
- **Greenhouse**: Places-style `.pac-container` location inputs without combobox ARIA.
- **Lever**: skip ALL-CAPS section headings (`LOCATION`, `PERSONAL INFORMATION`) in `extractLabel`; `.dropdown-location` without ARIA (already in combobox.js, now adapter-owned).
- **Ashby**: `.ashby-select-input` custom selects; dynamic sections still go through the generic late-field path.

Fixtures: `fixtures/workday-application-fixture.html`, `greenhouse-application-fixture.html`, `lever-application-fixture.html`, `ashby-application-fixture.html`. Specs: `tests/unit/adapters.test.js`, `tests/e2e/adapters.spec.js`.

### Stage 8 — Resume upload

File inputs are scanned (`FIELD_TYPES.FILE`). The background worker stores one resume in IndexedDB. Fill builds a `File` from the stored `ArrayBuffer`, assigns `input.files` via `DataTransfer`, dispatches `change`, and verifies the filename. Options page stores/removes the file. Userscript host keeps `fileUpload: false`.

### Stage 9 — Opt-in Auto Submit

Settings checkbox is enabled, default OFF. Fires only when the page is `application` or `review`, validation is clean, every required field is filled, no fill result failed, no distinct Continue control remains, and exactly one Submit control exists. Bounded to one attempt per step. Panel shows a cancellable countdown (`Pause` aborts).

### Stage 10 — Firefox packaging

Firefox overlay keeps `background.scripts` (event page) plus `gecko.id`. First-run page calls `permissions.request` for `<all_urls>` and OpenRouter. `tools/zip.js` emits `dist/job-copilot-chrome.zip` and `dist/job-copilot-firefox.xpi`.

### Files created

- `src/core/adapters/*`, `src/targets/extension/background/documents.js`, `src/targets/extension/first-run/*`, `tools/zip.js`
- fixtures and tests listed above, plus `tests/unit/upload.test.js`, `tests/unit/packaging.test.js`, `tests/e2e/upload.spec.js`, `tests/e2e/auto-submit.spec.js`

### Verification (2026-09-18)

- Unit: 179 pass, 0 fail (`npm test`).
- Build: userscript + `dist/job-copilot-chrome.zip` + `dist/job-copilot-firefox.xpi` at v0.4.12.
- E2E: 36 pass, 0 fail (`npx playwright test`).

Fixes during this verification:
- Restored `fileURLToPath` import in `tools/build.js`; repaired missing `validation()` in `src/core/agent.js`; renamed resume MIME to `mimeType` so it does not collide with message `type`.
- Ashby E2E host is `ashby.jobcopilot.test` (Chrome HSTS-preloads `ashbyhq.com`). Adapter still matches via DOM.
- Ashby menu lookup uses `.ashby-select`, not `[data-ashby-field]` on the input itself. `quirks.selectionInInput` treats the closed input value as the committed selection.

---

## Turn: 2026-09-18 — Stage 6: data migration and dual-install guard

Users can move profile, settings, memory, and job data from Tampermonkey to the
extension via a portable JSON backup. The API key never crosses that boundary.

### Files created

- `src/core/migration.js` — `exportPayload`, `importPayload`, `collectPortableData`.
- `tests/unit/migration.test.js` (4 tests), `tests/unit/panel-host.test.js` (4 tests),
  `tests/e2e/migration.spec.js` (5 tests)

### Files modified

- `src/core/ui.js` — Settings tab **Export backup JSON**, `exportUserBackup()`,
  `claimPanelHost()` / `unmountUI()` dual-install guard (extension wins).
- `src/core/main.js` — Tampermonkey menu command **Export Job Copilot backup**.
- `src/targets/extension/options/index.js` — import path now points at core migration.
- `tests/unit/panel.test.js` — export omits secrets; userscript yields when
  `data-jc-host="extension"` is already present.

### Files removed

- `src/targets/extension/shared/migration.js` — logic lives in core for both targets.

### Dual-install policy

One `#job-copilot-root`, tagged with `data-jc-host`. If both hosts are active,
the extension keeps the panel; the userscript logs and does not mount. If the
extension loads after a userscript stub, it replaces the stub and the displaced
host tears down its engine and form observer via a disconnect watcher.

### Secret boundary

Portable keys: `jc:profile`, `jc:settings`, `jc:memory`, `jc:job`. Imports scrub
legacy `apiKey` / `openRouterApiKey` from settings objects. Options import UI
reminds the user to re-enter the OpenRouter key.

### Verification

- `npm test`: 164 passed.
- `npm run test:e2e`: 28 passed. Migration specs cover options export/import,
  garbage rejection, and dual-install with both load orders.

### Status

Stage 6 complete. Next: Stage 7 ATS adapters (Workday, Greenhouse, Lever, Ashby).

---

## Turn: 2026-09-18 — Stage 5: fixture capture tool

The Playwright harness itself landed in Stage 2 because Stage 2's gate could not be
verified without it. This stage adds the capture half.

### Files created

- `src/core/capture.js` — sanitizing DOM snapshotter.
- `tests/unit/capture.test.js` (6 tests), `tests/e2e/capture.spec.js` (2 tests)

### Files modified

- `src/core/agent.js` + `src/core/remote.js` — a `captureFixture` agent action, so
  an embedded frame snapshots its own document. The parent cannot read it.
- `src/core/ui.js` — Debug tab button that downloads the page plus one file per
  embedded frame, with the host file's `iframe src` rewritten to the sibling file.
- `AGENTS.md`, `package.json` — corrected: capture is a panel action, not a CLI.

### Sanitization

Captures come from real applications, so the snapshot removes input values,
textarea and contenteditable contents, `checked` and `selected` state, scripts,
inline `on*` handlers, remote image sources, and the copilot panel itself. Text and
attribute values are scrubbed of the stored profile's own values plus email, phone
and government-id patterns. Redaction needles shorter than four characters are
ignored, so a profile value like "ON" cannot mangle "ON Semiconductor". Same-origin
CSS is inlined because the scanner's visibility checks depend on layout.

### Verification

- `npm test`: 154 passed.
- `npm run test:e2e`: 23 passed. The capture specs fill the embedded cross-origin
  form with realistic applicant data, capture, and assert none of it appears in
  either output file; they also prove the embedded frame contributed its own
  document. The second spec is a round trip: capture
  `phase2-form-fixture.html`, serve the result back, and confirm the panel still
  reports the same 18 detected fields, so a capture is lossless for the field
  engine.

---

## Turn: 2026-09-18 — Stage 4: authoritative navigation lifecycle

Tab binding already moved to `chrome.storage.session` in Stage 1-2 via
`platform.tab`. This stage replaces *inferred* step changes with real evidence.

### Files created

- `src/targets/extension/background/navigation.js` — per-tab navigation counter in
  session storage, so a freshly loaded document inherits its predecessor's count.
- `tests/unit/navigation-lifecycle.test.js` (5 tests)
- `tests/e2e/multi-step.spec.js` (4 tests)

### Files modified

- `src/core/platform.js`, `hosts/gm.js`, `content/host.js` — added
  `platform.navigation.marker()` and `.onChange()`. The userscript host returns a
  constant marker, so its behaviour is byte-identical to before.
- `src/targets/extension/background/index.js` — listens to `webNavigation`
  `onCommitted`, `onHistoryStateUpdated` and `onReferenceFragmentUpdated`, records
  each one, and pushes it to frame 0.
- `src/core/application.js` — `waitForNavigation` treats a committed navigation as
  proof the step advanced; `initialize()` completes a pending step when a
  navigation was recorded after the Continue click; navigation events schedule a
  tick, so a single-page step change no longer waits on the 1.5s interval.
- `src/core/sessions.js` — session ids no longer depend on `crypto.randomUUID`.

### Why this matters

`comparePages` decides "same" or "changed" from URL, step marker, heading and
overlapping questions. When an ATS posts back to the **same URL** and re-renders a
structurally similar step, that reads as "same" and the engine concluded Continue
did nothing. This is the shape of the logged Workday false-page-change and
rollback reports. A recorded navigation is independent evidence, and the unit
tests assert the contrast directly: with a navigation record the step is credited,
without one it stays at zero.

### Findings during verification

1. **Baseline sampled too late (real bug, caught by the new test).** A
   same-document navigation can commit synchronously inside `control.click()`.
   `waitForNavigation` originally sampled the marker on entry, which was already
   after the click, so `navigated` was never true. The baseline is now sampled
   before the click and passed in.
2. **`crypto.randomUUID` is secure-context only (real bug).** `createSession`
   threw `crypto.randomUUID is not a function` on any `http://` page, silently
   breaking Capture Job. It never showed up under Tampermonkey because ATS sites
   are HTTPS. Replaced with a `getRandomValues` based v4 fallback.
3. **Paused sessions are intentionally not auto-resumed.** An early test modelled
   the reload case from a paused session, which `initialize()` correctly ignores
   because `session.active` is false. The test now builds an active session with a
   pending step, which is the real reload scenario.
4. **Test hygiene:** engines left mid-flight kept the Node process alive after the
   suite finished. Teardown now destroys every engine and lets pending work unwind
   before the jsdom window closes.

### Verification

- `npm test`: 148 passed.
- `npm run test:e2e`: 21 passed. The multi-step specs drive
  `phase3-application-fixture.html` through its deliberate first-answer rejection
  to the review step across real navigations (2 steps completed, status `review`),
  confirm final submission is never clicked with Auto Submit off, confirm the tab
  binding lives in `chrome.storage.session` and survives a reload, and confirm the
  background's navigation counter advances with the recorded URL.

---

## Turn: 2026-09-18 — Stage 3: cross-origin frames become fillable

Closes the long-standing "Greenhouse embed scans 0 fields" limitation, which was
unfixable under Tampermonkey because `main.js` had to bail out of subframes.

### Files created

- `src/core/agent.js` — per-frame field agent: scan, searchOptions, fill,
  validation. Runs the same pipeline as the panel but decides nothing.
- `src/core/remote.js` — top-frame orchestration and frame-qualified field ids.
- `fixtures/embedded-host.html` + `fixtures/embedded-application.html` — a page
  with zero controls embedding a form from a second origin.
- `tests/unit/remote.test.js` (9 tests), `tests/e2e/cross-frame.spec.js` (5 tests)

### Files modified

- `src/core/platform.js`, `src/core/hosts/gm.js` — added `platform.frames`. The
  userscript host returns an empty list, since it cannot address another origin.
- `src/core/ui.js` — the autofill flow now gathers embedded fields before the AI
  call, merges them into the **same** primary request, fills local fields as
  before, then dispatches the remaining answers to their owning frames. Added
  `resolveRemoteSearchAnswers` for embedded comboboxes and a badge breakdown
  showing where the fields actually live.
- `src/targets/extension/content/agent.js` — announces field counts and executes
  routed commands, with a heartbeat so a long-lived frame never expires.
- `src/targets/extension/background/frames.js` — serialized registry writes.

### Design note: one AI request, many origins

A cross-origin frame cannot be touched from the parent document, so the agent in
that frame does the scanning and actuation. Only normalized field data and answers
cross the boundary, which keeps the page to a single primary AI request instead of
one per frame. Field ids are namespaced as `jcf<frameId>::<localId>` because two
frames routinely generate the same local id.

### Findings during verification

1. **Frame registry race (real bug, fixed).** Every frame announces at
   `document_idle`, and read-modify-write against `chrome.storage` is not atomic.
   The top frame and the embedded frame both read an empty list and both wrote a
   single-entry array, so whichever wrote last erased the other. The panel
   therefore saw only itself and reported 0 fields. Fixed with a per-tab promise
   queue in `frames.js`. Confirmed by instrumenting the registry: before the fix
   it held only `frameId: 0`; after, both frames appear and the panel reads
   "10 detected, 0 here, 10 in 1 embedded frame".
2. **Embed-only pages produce no mutations to react to.** The panel refreshed its
   remote count only when the top document mutated, which on an embed host is
   almost never. Added a `FRAMES_CHANGED` notification from the background to
   frame 0 whenever a subframe's count actually changes.
3. **Residence comboboxes never needed the remote search pass.**
   `harvestComboboxOptions` already pre-searches residence-labelled fields with
   the stored profile location, so a location outside the first page of options
   resolves inside the primary request. The remote search path is exercised by a
   non-residence paginated combobox instead, which is the realistic case.

### Verification

- `npm test`: 143 passed (134 existing plus 9 new).
- `npm run test:e2e`: 17 passed. The cross-frame specs confirm the host document
  has literally zero controls, the panel still reports and fills the 10 embedded
  ones, embedded fields travel in the single primary request, a paginated
  embedded combobox resolves in exactly one follow-up request, and the embedded
  frame never mounts a second panel.

---

## Turn: 2026-09-18 — Stage 2: extension shell reaches parity in Chrome

### Files created

- `src/targets/extension/manifest.base.json` + `manifest.chrome.json` + `manifest.firefox.json`
- `src/targets/extension/shared/protocol.js`, `shared/browser.js`, `shared/migration.js`
- `src/targets/extension/background/index.js`, `storage.js`, `ai.js`, `tabs.js`, `frames.js`
- `src/targets/extension/content/index.js`, `content/host.js`, `content/agent.js`
- `src/targets/extension/options/index.html` + `index.js`
- `src/targets/extension/popup/index.html` + `index.js`
- `playwright.config.js`, `tests/e2e/support/servers.js`, `tests/e2e/support/fixtures.js`
- `tests/e2e/shell.spec.js`, `tests/e2e/autofill.spec.js`

### Design notes

- **Hydrated cache**: the content host requests one snapshot of every non-secret
  `jc:*` key before the panel mounts, then answers core's synchronous reads from
  memory. Writes update the cache immediately and reach the background
  asynchronously, so read-after-write inside the fill loop still works.
- **Key isolation**: the snapshot carries `hasApiKey` instead of the key. The
  background attaches `Authorization` and refuses any URL outside
  `https://openrouter.ai/`. The panel's key field is replaced by a link to the
  options page, which is a privileged context.
- **Broadcast discipline**: only `jc:settings`, `jc:profile`, `jc:memory` and
  `jc:documents` are pushed to other contexts, and never back to the originating
  tab. An early version broadcast every storage change, which would have sent a
  message to every open tab on every debug log line, since the logger writes
  `jc:debug` on each entry.
- **No worker state**: MV3 terminates the worker when idle, so tab bindings and
  the frame registry live in `chrome.storage.session`.

### Findings during verification

1. **Headless Chromium cannot load extensions.** Playwright's default headless
   shell silently hangs at `waitForEvent('serviceworker')`. Fixed by launching
   with `channel: 'chromium'`, which uses the full browser in new headless mode.
2. **`--ignore-certificate-errors` is no longer sufficient.** The background
   worker's `fetch` to the mocked OpenRouter failed with "Failed to fetch" until
   the launcher pinned the mock certificate with
   `--ignore-certificate-errors-spki-list`.
3. **`selfsigned` v5 returns a promise**, unlike v1-v2. Silent `{}` result
   otherwise.
4. **Popup active-tab resolution**: `tabs.query({active: true})` returns the
   popup itself when the popup is opened as a tab. The popup now skips
   extension-origin tabs and falls back to the most recently used page, which is
   also more robust when the options page is focused.

### Verification

- `npm test`: 134 passed.
- `npm run test:e2e`: 11 passed. Covers panel mount and hydration, missing-key
  state, a leak check asserting the key never appears in page HTML, shadow DOM, or
  page storage, options page persistence, cross-context profile broadcast, popup
  counts, full 18-field autofill on `phase2-form-fixture.html` with exactly one
  primary AI request, overwrite protection, HTTP 402 error surfacing, and the
  no-key short circuit that avoids any network call.

The single "1 failed" field in the autofill run is the fixture's
`data-reject-fill` control, which exists to prove failures are reported.

### Status

Chrome parity reached. Next: cross-frame agents so fields inside cross-origin
iframes are reachable.

---

## Turn: 2026-09-18 — Stage 0 and Stage 1: repo split and platform seam

### Files created

- `package.json`, `.gitignore`, `AGENTS.md`, `CONTEXT_AND_FINDINGS.md`
- `src/core/platform.js` — host adapter contract
- `src/core/hosts/gm.js` — userscript/Tampermonkey host (default)
- `src/targets/userscript/entry.js` — userscript entry
- `tools/build.js` — dual-target esbuild pipeline

### Files moved

- `Autofill-Ext/src/**` -> `src/core/**` (24 modules, logic unchanged)
- `Autofill-Ext/tests/*.test.js` -> `tests/unit/`
- `Autofill-Ext/fixtures/*` -> `fixtures/`

### Files modified

- `src/core/storage.js` — `gmGet`/`gmSet`/`gmDelete` now delegate to
  `platform.storage`. Added `hasApiKey()` so presence checks work on hosts that
  refuse to expose the key. `resetAll()` clears secrets through the platform.
- `src/core/ai.js` — deleted `sendGMRequest`. Requests go through
  `platform.ai.request`, which the host decorates with `Authorization`. The three
  entry points now guard on `hasApiKey()` instead of reading the key. Core no
  longer holds the API key at any point.
- `src/core/sessions.js` — `bindTab`/`restoreSession` use `platform.tab`.
- `src/core/main.js` — exports `bootstrap()` and `bootstrapWhenReady()` instead
  of self-starting, so a host with async storage can hydrate first. Menu
  registration goes through `platform.menu` behind a capability check.
- `src/core/ui.js` — status pill and autofill guard use `hasApiKey()` rather than
  reading the key. The API key form group is now capability-gated: hosts that set
  `writeSecretsInPage: false` render a link to the extension options page.
- `tests/unit/*` — import paths updated for `src/core/`; `panel.test.js` builds
  the userscript entry; fixture path corrected for the extra directory level.

### Rationale

The port's only hard problem is that core reads storage synchronously while
`chrome.storage` is async. Rather than rewrite ~40 call sites (several inside the
per-field fill loop and the workflow tick), the platform seam keeps the sync
signature and pushes the async problem into a one-time hydration step that the
extension host performs before the panel mounts.

Keeping the GM host as the *default* means a plain bundle behaves exactly like
the original userscript, which is why all existing tests pass untouched apart
from their import paths.

### Verification

- `npm test`: 134 passed, 0 failed (same count as the frozen repo at v0.3.14).
- `npm run build:userscript`: emits `dist/job-copilot.user.js` at v0.4.0 with the
  Tampermonkey banner intact. `panel.test.js` evaluates that bundle in jsdom and
  confirms the panel mounts, captures a job, and persists settings.

### Status

Core is proven host-agnostic while still shipping the working userscript. Next:
the extension shell (manifests, background worker, hydrated storage cache,
OpenRouter proxy, options page, popup).

---

## Turn: 2026-09-19 — Lever and Ashby autofill hardening

Reported extension bugs: Lever location searches did not commit; custom questions
became `"Type your response"` or internal identifiers; all pronouns were checked;
Ashby Yes/No targeted backing `"Option"` checkboxes; Ashby autocomplete treated
typed search text as a committed selection. Greenhouse remained the regression
baseline.

### Reproduction

Against supplied `pages/` HTML and the public CSC Generation Lever application,
Lever’s location script searches on debounced `keydown`. The previous helper sent
input/keyup only: zero network requests before `keydown`, one afterward. Nested
`.application-label .text` was missed. Nine pronoun checkboxes shared the name
`pronouns`, so the scanner reused one field ID. Ashby Yes/No backing checkboxes
were scanned independently. `quirks.selectionInInput` treated the Ashby input
value as a selection.

The prior agent implemented the adapter hooks, grouping, exact-choice validation,
Lever `keydown` search, Ashby committed-state reading, residence/LinkedIn profile
routing, fixtures, and tests, then stopped before panel duplicate-ID rejection,
full build/E2E, and the findings log.

### Fixes completed in this turn

- **Panel path** now calls `assertUniqueFields` before generating answers, matching
  the frame agent. Generic adapters expose empty `fieldMetadata` / `choiceGroups`
  fallbacks.
- **`refreshField`** keeps harvested combobox options when a live first-page menu
  is still open. Without that, a paginated school search was overwritten and the
  exact answer was rejected.
- **Existing Lever fixture** now has a `Current location` application-label so
  residence harvest still runs after the keydown/JSON location rewrite.
- **Overwrite-off E2E** now seeds a committed Lever location (display +
  `selectedLocation` JSON). Uncommitted typed text is not a selection: Lever’s
  blur handler clears it, which matches the search-vs-commit distinction.

### Files

- Adapters: `src/core/adapters/lever.js`, `ashby.js`, `generic.js`
- Pipeline: `scanner.js`, `combobox.js`, `fillers.js`, `verify.js`, `labels.js`,
  `normalize.js`, `ai.js`, `profile.js`, `location.js`, `agent.js`, `ui.js`,
  `application.js`, `validation.js`
- Fixtures: `fixtures/lever-hardening-fixture.html`,
  `fixtures/ashby-hardening-fixture.html`, `fixtures/lever-application-fixture.html`
- Tests: `tests/unit/ats-hardening.test.js`, `tests/e2e/ats-hardening.spec.js`,
  plus updates to `tests/unit/autofill.test.js` and `tests/unit/adapters.test.js`

### Verification (2026-09-19)

- Unit: **193 pass, 0 fail** (`npm test`).
- Build: userscript + `dist/job-copilot-chrome.zip` + `dist/job-copilot-firefox.xpi`
  at v0.4.15. Firefox manifest keeps `background.scripts` and `gecko.id`.
- E2E: **39 pass, 0 fail** (`npm run test:e2e`) with the Chromium extension loaded.
  Covers Lever questions/location/pronouns, Ashby Yes/No and portal location,
  Greenhouse Places, Workday, generic autofill, iframe search pass, userscript
  dual-install, and Auto Submit. No accidental form submission on the hardening
  fixtures (`data-submissions=0`).
- Firefox: Playwright’s extension harness is Chromium-only. This machine has no
  Firefox install, so temporary-addon loading was not executed. The XPI packs the
  same core as the Chromium build that passed E2E.

### Status

Hardening complete. Greenhouse, generic, Workday, iframe, and userscript coverage
is preserved. Manual Firefox temporary install remains available if needed via
`about:debugging` → This Firefox → Load Temporary Add-on →
`dist/firefox/manifest.json`.

---

## Turn: 2026-09-19 — Narrative voice and tone system prompt overhaul

### Bugs/Findings
- **Date**: 2026-09-19
- **Target**: Extension & Userscript (Core AI prompt)
- **Platform/ATS**: All ATS platforms (open-ended / narrative answers)
- **Symptoms**: Narrative answers for free-text questions sounded distinctly inhuman, robotic, and over-engineered. The output exhibited:
  1. Question restatements / throat-clearing ("I have experience with Linux and open source through...", "My most significant personal software project is...", "During my education at...").
  2. "This involved [gerund], [gerund], [gerund]" structures mechanically converting resume bullets into passive task catalogs.
  3. Corporate PR/brochure voice describing personal projects like a product marketing landing page.
  4. Essay conclusions and meta-evaluative self-praise ("This project demonstrates my ability to...", "requiring organizational skills to...").
  5. Unprompted skill rosters tacked on at the end of answers ("My technical skills also include...").
  6. Inflated corporate buzzwords and uniform, monotonic sentence length.
- **Root-Cause Analysis**:
  `NARRATIVE_VOICE_RULES` in `src/core/ai.js` relied on soft directives ("Write like a real candidate filling a form") and a limited set of banned words. Online research across Reddit (r/ChatGPT, r/PromptEngineering, r/ClaudeAI) demonstrates that LLMs revert to formulaic AI cadence unless given explicit, hard negative constraints against specific structural habits (throat-clearing, question restating, gerund stacking, essay conclusions) along with concrete contrastive (BAD vs GOOD) exemplars.
- **Resolution**:
  Replaced `NARRATIVE_VOICE_RULES` in `src/core/ai.js` with comprehensive negative constraints, plain English directives, burstiness/contraction guidance, and concrete contrastive exemplars modeled after real developer responses. Updated unit tests in `tests/unit/autofill.test.js` to assert these constraints.

### Turn changes
- `src/core/ai.js`: Overhauled `NARRATIVE_VOICE_RULES` with 11 hard negative constraints, plain language directives, and 3 contrastive BAD vs GOOD exemplars for technical, project, and leadership questions.
- `tests/unit/autofill.test.js`: Added assertions checking that new narrative negative constraints (banning question restatement, "This involved", marketing copy, and essay conclusions) are present in both autofill and rewrite prompt payloads.

### Verification
- `npm test`: **193 pass, 0 fail** (all unit tests passed).

### Status
Narrative voice prompt updated and verified.

---

## Turn: 2026-09-19 — Greenhouse dropdowns and Ashby/Lever resume parsing

### Bugs/findings
- **Target:** Extension and userscript shared core. **Greenhouse:** user reports empty dropdowns across applications; attached logs repeatedly show zero owned options. Root cause: Greenhouse's `.pac-item` option override was applied to every combobox, excluding normal React-select options. Scoped the override to Places inputs; reproduced with failing unit test and independent browser fixture, then verified the fix. User subsequently supplied https://job-boards.greenhouse.io/gitlab/jobs/8773006002. Read-only inspection confirmed the affected Yes/No dropdown uses `.select__option[role=option]` under its `aria-controls` listbox, matching the regression and fix. `greenhouse-select-fixture.html` is a reproduction, not a live capture. Additional Debug capture deferred when user requested no more tests and immediate completion.
- **Ashby:** user reports unreliable location/source dropdowns and supplies 1Password URL and source-field HTML. Inspected live page: clicking the empty source input leaves it closed; its unlabeled `_toggleButton_` opens an ARIA-linked portal. Existing resolver omitted that toggle and counted hidden menus as open. Added an Ashby-specific toggle selector and visibility-aware fallback, retaining the existing event sequence and exact owned-option matching. Live page captured through Debug → Save page fixture in `ashby-1password-captured.html`; existing replay fixture now includes the observed source control and independently simulated commit state.
- **Ashby/Lever uploads:** reported delayed resume parsing clears/overwrites autofilled fields. Manual Autofill previously generated answers before upload, then filled immediately; embedded uploads occurred after remote fills. Moved uploads before scanning/answer generation, added bounded parser settling (minimum 3 seconds, 1 second stable fields, maximum 15 seconds), and rescan after processing. Poll value properties, replacement nodes, disabled state and busy indicators, including Lever's captured `.resume-upload-working` markup. Timeout stops filling; pause/page changes cancel the local wait. Preserve post-parser values unless overwrite is enabled. Application workflow and frame agents share the wait.

### Turn changes
- `src/core/adapters/{greenhouse,ashby}.js`, `src/core/fields/combobox.js`: corrected option selection and toggle resolution; no change to actuator event strategy.
- `src/core/resume.js`: shared upload/parser stabilization; no host APIs, credentials, network access or applicant-value logging.
- `src/core/{ui,application,agent,remote}.js`: upload sequencing, fresh target selection, upload overwrite guard, and propagation of embedded upload errors.
- `fixtures/{ashby-hardening-fixture,ashby-1password-captured,greenhouse-select-fixture,ats-race-fixture}.html`: captured/synthetic evidence and independent behavioral reproductions; race fixture uses a delayed simulated parser, never uploads real documents.
- `tests/unit/{ats-hardening,upload}.test.js`, `tests/e2e/{ats-hardening,upload}.spec.js`: regressions for ordinary Greenhouse selects, Ashby toggles, parser races, cancellation, timeout, workflow overwrite and embedded uploads.
- `package.json`: normal build script automatically increments the package version; rebuilt Chrome, Firefox and userscript artifacts.

### Verification/status
- Confirmed failing dropdown tests and parser-race browser tests before their fixes.
- `npm test`: **199 passed, 0 failed**. `npm run test:e2e`: **46 passed, 0 failed**, real Chromium with MV3 extension. Builds completed at **0.4.18** for Chrome, Firefox and userscript. Diff whitespace check passed.
- User requested no further tests after the full suite had completed; none were started after that request. Final follow-up was limited to read-only GitLab markup inspection and this log update.
- Live parser timing is reproduced deterministically; no personal resume was sent to an ATS and no application was submitted.

---

## Turn: 2026-09-19 — Remove Review tab and associated remnants

### Bugs/findings
- **Target:** Extension and userscript UI panel (`src/core/ui.js`).
- **Symptoms:** User requested removing the "Review" tab entirely, noting that it is empty, non-functional, and irrelevant for the tool.
- **Root-cause analysis:** The panel UI included a non-functional "Review" tab (`renderReviewTab`) alongside a field rewrite modal (`renderRewriteModal`, `openRewriteModal`, `executeFieldRewrite`) and specific rescan buttons that were unneeded and cluttered the navigation tabs.
- **Resolution:** Removed the Review tab button, `renderReviewTab()` function, the field rewrite modal and handlers, unused rewrite state variables, and associated review/modal CSS rules from `src/core/ui.js`. Added a unit test assertion in `tests/unit/panel.test.js` verifying the panel nav tabs consist only of `['home', 'profile', 'settings', 'debug']` and that `[data-tab=review]` is absent.

### Turn changes
- `src/core/ui.js`: Removed the Review tab button, `renderReviewTab()`, rewrite modal (`renderRewriteModal()`, `openRewriteModal()`, `executeFieldRewrite()`), rewrite state variables, rescan review button handlers, and unused CSS rules (`.jc-field-row`, `.jc-field-header`, `.jc-field-name`, `.jc-field-val-preview`, `.jc-modal-overlay`, `.jc-modal`).
- `tests/unit/panel.test.js`: Added unit test assertion ensuring the Review tab is absent and only Home, Profile, Settings, and Debug tabs exist.
- `package.json`, `dist/`: Built extension and userscript at version 0.4.21.

### Verification/status
- `npm test`: **202 passed, 0 failed**.
- `tests/e2e/shell.spec.js`: **6 passed, 0 failed**.
- Build succeeded: Chrome (`dist/chrome`), Firefox (`dist/firefox`), and userscript (`dist/userscript`) updated.



## Turn: 2026-09-20 — Coherent Kareer visual system

### Bugs/findings
- Target: extension options/popup/Firefox permission page and shared panel/userscript.
  User reports old blue options styling, fallback typography, competing lime CTAs.
  Root cause: independent inline styles and duplicated tokens; both Run actions
  used primary styling. Resolved with shared tokens, bundled Geist, configuration
  console layout, and state-dependent action emphasis. Existing staged edits preserved.
- Production audit: both browser manifests already use internal options_ui with
  options/index.html and open_in_tab. No hardcoded dev path found in that wiring.
- Visual QA found profile sticky save bar covering fields; removed sticky positioning.
  Review list nested cards replaced with flat row separators.

### Turn changes
- src/core/theme.js: shared colors/type/spacing/radii, working UI name, binary font registration.
- src/assets/fonts/: Geist Sans/Mono variable WOFF2 and original OFL license (geist 1.7.2).
- src/core/ui.js: shared tokens and font loader, primary CTA hierarchy, keyboard HUD
  toggles, quieter tabs/cards, metadata wrapping, narrow viewports, reduced motion.
  No application, storage, actuator, API, or workflow handler changes.
- src/targets/extension/{options,popup,first-run}/index.html and shared/pages.css:
  shared console styles, options section navigation, form hierarchy, semantic actions,
  local stylesheet links, viewport metadata and accessible feedback.
- tools/build.js: copy local fonts/license; generate shared CSS and UI branding;
  embed font bytes in core bundles; include fonts in build-cache hashing.
- tests/e2e/visual-system.spec.js: real extension options navigation, font loading,
  long metadata, responsive overflow, CTA hierarchy, panel tab screenshots.
- DESIGN.md: canonical Geist/font packaging, muted contrast, console layout and CTA rules.
- package.json: existing builder automatically advances patch version.

### Verification/status
- Initial npm test: 202 passed. All three builds succeeded.
- New visual E2E checks: 2 passed. Browser launch required sandbox escalation after EPERM.
- Full E2E suite and final visual review in progress; final results recorded below.

### Final audit notes
- Restored existing diagnostic strings (adapter suffix, generic fallback, "here"
  embedded breakdown, lowercase DOM "detected" with uppercase CSS) so the staged
  redesign remains compatible with existing E2E assertions.
- Isolated baseline experiment: rebuilt content script with HEAD's original ui.js,
  using the same unchanged core and fixture harness. Both nonvisual failures
  reproduced: Lever hardening expects LinkedIn Link in the primary AI request but
  it is absent; paginated embedded combobox expects 2 requests but receives 4.
  These are pre-existing assertion/behavior discrepancies, deferred because this
  request expressly excludes autofill/API behavior changes. No tests weakened.
- Impeccable independent finish review: ship for visual scope after verifying the
  overlapping profile-save fix and flatter review rows. Optional follow-up: expose
  panel selected-tab state to assistive technology; inherited CSS-only selection.
- Clean-browser userscript smoke: HUD, expanded panel and both Geist fonts loaded.
- Inspected Chrome ZIP and Firefox XPI: internal options HTML/script, generated CSS,
  both local WOFF2 files and OFL license present. Signed Firefox installation was
  not exercised; Chromium real-extension options opening was exercised.
- Latest build version: 0.4.28. Final unit run: 202 passed, 0 failed.

---

## Turn: 2026-09-20 — Ashby panel typography collapse

### Bugs/findings
- **Target:** Extension and userscript shared panel on hosted Ashby application pages; reproduced on the supplied 1Password application and compared against the supplied Lever and Greenhouse screenshots.
- **Symptoms:** Panel text overlaps vertically, workflow title/company lines occupy the same line box, and status/count pills appear flattened on Ashby while the same panel renders normally on Lever and Greenhouse.
- **Root-cause analysis:** Live-browser inspection of the supplied Ashby URL found that Ashby's production stylesheet globally applies `div { line-height: 0 }`. The panel shadow host is a light-DOM `div`, so it computes to `line-height: 0px`. Normal outer-document rules win over normal `:host` declarations, and the top-level shadow child inherits from that host; therefore `.jc-widget-container` also computed to `0px` despite the panel's `:host { line-height: 1.45 }`. This is a CSS boundary/cascade issue, not an Ashby adapter or data-rendering issue.
- **Resolution:** Moved the panel typography baseline (`font-family`, `font-size`, `line-height`, color, font smoothing) from `:host` to `.jc-widget-container`, the first element inside the shadow tree. Ashby's page CSS cannot select that element, so internal line boxes and pills retain the intended metrics.

### Turn changes
- `src/core/ui.js`: Applied the typography baseline to the internal panel container instead of relying on the externally styleable shadow host.
- `tests/e2e/adapters.spec.js`: Added a real-extension Chromium regression that reproduces Ashby's exact global `div { line-height: 0 }` rule, confirms the host still computes to `0px`, and verifies the internal panel container and badges do not.
- `package.json`: Normal build advanced the generated artifact version from 0.4.30 to 0.4.31.

### Verification/status
- Regression test observed failing before the fix: `.jc-widget-container` computed `line-height: 0px`.
- Targeted real-browser regression passed after the fix: **1 passed**.
- `npm test`: **207 passed, 0 failed**.
- Full `npm run test:e2e` was started but stopped at the user's request; manual visual review was explicitly preferred. No full-suite result is claimed.

---

## Turn: 2026-09-22 — Public website & privacy policy for Kareer

### User requests
1. Build official public website and store-compliant privacy policy inside this repository (`site/`) according to `DESIGN.md` and `/impeccable` design principles.
2. Remove status dot beside version badge and make version display fully dynamic on every update.

### Findings / Resolution
- **Design & Typography**: Built zero-dependency responsive site using Kareer brand tokens, local Geist variable fonts, and clean dark theme. Resolved all Impeccable audit flags (removed AI card slop icons, avoided harsh glow halos, strictly enforced 375px/768px/1440px layout wrapping with zero horizontal overflow).
- **Dot removal**: Removed `.kr-status-dot` beside the hero version badge in `site/index.html` and eliminated unused CSS rule in `site/styles.css`.
- **Dynamic versioning**: Implemented client-side version resolution in `site/script.js` (`initDynamicVersion`) with local fallback to `site/version.json` and remote fallback to `package.json` on GitHub `master`. Reverted unrequested modifications to `tools/build.js` to keep core build tooling untouched.
- **Privacy Policy**: Created standalone 14-section privacy document (`site/privacy/index.html`) fulfilling Chrome Web Store and Mozilla Add-on store policies (local-first BYOK architecture, zero telemetry, zero cookies).

### Turn changes
- `site/index.html`: Landing page markup with hero, flight deck preview, feature breakdown, ATS matrix, workflow, privacy guarantee, store install chooser, and FAQ.
- `site/privacy/index.html`: Store-compliant privacy policy.
- `site/styles.css`: Impeccable CSS system with local `@font-face` Geist fonts and responsive breakpoints.
- `site/script.js`: Central store links, mobile menu, accessible FAQ accordion, dynamic version fetcher, and interactive demo logic.
- `site/version.json`: Static local version seed for offline local dev (`0.4.35`).
- `site/assets/`: Self-hosted SVGs, PNGs, and WOFF2 variable fonts, including `kareer-mark-lime.svg` and `kareer-mark-lime.png`.
- `.github/workflows/pages.yml`: GitHub Pages automated deployment workflow.
- `tools/build.js`: Reverted to clean original state.

### Interactive UI Simulation & Brand Mark Update
- **Lime Icon**: Fixed panel HUD icon and favicon to use signal lime (`#A3E635`) via `assets/kareer-mark-lime.svg` and `assets/kareer-mark-lime.png`, resolving the previous black icon rendering issue caused by SVG `currentColor` in `<img>`.
- **Authentic Extension UI**: Mimicked the exact panel architecture from `src/core/ui.js` and `DESIGN.md` across 4 interactive tabs (Run, Profile, Settings, Debug). Removed nested card borders in favor of flat separator rows.
- **Interactive Controls**: Added keyboard-accessible tab switching (`[data-sim-tab]`), simulated live autofill progress with safety boundary pause, interactive model selector with header chip sync, fixture capture feedback, and profile/settings save feedback.
- **Impeccable Audit**: Resolved `tiny-text`, `undersized-ui-text`, and `layout-transition` (switched progress bar from `width` to `transform: scaleX`). Impeccable detector output: `[]` (0 antipatterns).

### Automated Firefox CD Pipeline & Self-Hosted Updates (2026-09-23)
- **Target**: Extension (Firefox Unlisted Self-Hosted Distribution).
- **Architecture**:
  - Pushes to `master` trigger `.github/workflows/deploy.yml` (`Build, Sign & Deploy`).
  - Runs automated test suite (`npm test`).
  - Derives dynamic monotonically incrementing version string (`${BASE_VERSION}.${GITHUB_RUN_NUMBER}`) to satisfy Mozilla AMO's strict duplicate-version rejection policy.
  - Builds Firefox extension and signs unlisted `.xpi` cryptographically via Mozilla API (`web-ext sign`) using repository secrets (`AMO_JWT_ISSUER`, `AMO_JWT_SECRET`).
  - Saves signed `.xpi` to `site/downloads/kareer-firefox.xpi` and produces `site/firefox-updates.json` pointing to it.
  - Synchronizes `site/version.json` and updates the site version badge in `site/index.html`.
  - Deploys static site, download `.xpi`, and update manifest to GitHub Pages with zero GitHub Releases created.
- **Turn changes**:
  - `src/targets/extension/manifest.firefox.json`: Added `update_url: "https://amro212.github.io/kareer/firefox-updates.json"` to `browser_specific_settings.gecko` to enable Firefox native background update polling.
  - `.github/workflows/deploy.yml`: Replaced and renamed `.github/workflows/pages.yml` with comprehensive build, sign, and deploy workflow.
  - `.github/workflows/firefox-release.yml`: Removed obsolete manual GitHub Release workflow.
  - `firefox-updates.json` & `site/firefox-updates.json`: Added update manifests following Mozilla extension update protocol.
  - `site/index.html` & `site/script.js`: Updated Firefox download buttons and links to `https://amro212.github.io/kareer/downloads/kareer-firefox.xpi`.
  - `README.md`: Updated manual download link for Firefox to point to the self-hosted `.xpi`.
- **Status & Verification**:
  - 208 unit tests pass (`npm test`).
  - Site interactive demo passes Playwright verification.
  - Impeccable detector reports 0 antipatterns.
  - Git working tree staged for user review (no auto-commit).

### Systematic Debugging: Inline Rewrite Button on Ashby ATS & Theme Realignment (2026-09-23)
- **Target**: Extension (`src/core/fields/highlight.js`, `src/core/ui.js`, Ashby ATS).
- **Symptoms**:
  - On Ashby ATS application pages, the floating "✨ Rewrite with AI" button was visually squished to only 8px in height with letters cut off and emoji protruding out the bottom.
  - Button used outdated blue AI SaaS theme (`linear-gradient(135deg, #2563eb, #1d4ed8)`, emoji `✨`) violating `DESIGN.md`.
  - Clicking the badge threw `ReferenceError: openRewriteModal is not defined` because `openRewriteModal` was pruned in commit `811eab5`.
  - Mozilla AMO signing failed in CI with `Conflict: Version 0.4.35.1 already exists.` because `0.4.35.1` had been previously uploaded.
- **Root-Cause Analysis (Systematic Debugging)**:
  - Phase 1 (Evidence Gathering): Inspected Ashby's production stylesheet (`cdn.ashbyprd.com/.../index-NOGznrcu.css`). Discovered the global rule `div { line-height: 0; }`.
  - Phase 2 (Data Flow / Inheritance): The rewrite badge was created as a plain `<div>` appended directly to `document.body` without Shadow DOM encapsulation or explicit `line-height`. As a result, Ashby's `div { line-height: 0; }` collapsed the element's content box to 0px, yielding a total computed height of only `8px` (`4px padding-top + 4px padding-bottom`).
  - Phase 3 (Design Realignment): Adhered to `DESIGN.md` Section 5 & 7. Replaced emoji `✨` with a technical vector spark SVG, styled with dark graphite background (`#0D1117`), crisp border (`#26303D`), signal lime accent (`#A3E635`), 6px border-radius, and interactive states (`idle`, `loading`, `success`, `error`).
- **Resolution**:
  - `src/core/fields/highlight.js`: Encapsulated `#kareer-inline-rewrite` inside an open Shadow DOM with isolated typography and box metrics, making it immune to external CSS pollution. Added defensive inline properties (`!important`) to the host element.
  - `src/core/ui.js`: Connected inline badge click directly to `rewriteNarrativeField({ fieldLabel, currentValue, feedback, constraints })`, field value application via `fillField`, verification outline via `highlightVerifiedField`, and live badge state indicators (`loading`, `success`, `error`).
  - `tests/unit/inline-rewrite.test.js`: Added unit tests asserting Shadow DOM isolation, host `div { line-height: 0; }` immunity, positioning, and callback transitions.
  - `package.json`, `site/version.json`, `site/index.html`, `site/firefox-updates.json`, `firefox-updates.json`: Bumped version to `0.4.37` to resolve AMO conflict.
  - `README.md`: Added prominent website badge, bold hyperlinked URL, and tip banner to the top header for instant discovery.
- **Verification**:
  - Verified visual rendering on live Ashby ATS application with Playwright (`scratch/ashby_perfect_render.png`).
  - All 209 unit tests pass (`npm test`).

---

## Turn: 2026-09-23 — Automated version synchronization in build tooling

### Findings & Architecture Rationale
- **Target**: Build tooling (`tools/build.js`).
- **User Question**: Why were versions being manually adjusted across files (`site/version.json`, `firefox-updates.json`, `site/firefox-updates.json`, `site/index.html`) in recent staged changes? Shouldn't `npm run build` handle that automatically?
- **Root-Cause Analysis**:
  - Historically, `tools/build.js` managed versions strictly for `package.json`, `dist/kareer.user.js`, and `dist/{chrome,firefox}/manifest.json` (auto-incrementing patch version on source code changes or via `npm run bump:*`).
  - The static marketing site and self-hosted Firefox update manifests (`site/version.json`, `site/firefox-updates.json`, `firefox-updates.json`) were introduced recently for the automated CD pipeline.
  - While GitHub Actions (`.github/workflows/deploy.yml`) already synced these files in CI, local `tools/build.js` lacked knowledge of these paths. Consequently, local version changes required manual updates across 4 separate manifest files.
- **Resolution**:
  - Extended `tools/build.js` with `syncSiteAndUpdates(version)`:
    - Automatically updates `site/version.json` with the new version string.
    - Synchronizes the update entry in `site/firefox-updates.json` and root `firefox-updates.json`.
    - Updates the static version badge attribute (`data-version-badge>v${version}<`) in `site/index.html`.
  - Hooked `syncSiteAndUpdates` into `prepareVersion()` during both explicit bumps (`--bump=major|minor|patch`) and automatic source-change hash bumps, as well as on every standard build run.
  - Manual adjustments are now completely eliminated. Running `npm run build` or `npm run bump:patch` keeps all 5 files in exact synchronization.

### Turn changes
- `tools/build.js`: Added `syncSiteAndUpdates()` and called it during `prepareVersion()`.
- `CONTEXT_AND_FINDINGS.md`: Logged rationale, design decisions, and status.

### Verification
- `npm run build`: Successfully built at v0.4.37 and verified synchronization across all manifests.
- `npm test`: **209 passed, 0 failed**.

---

## Turn: 2026-09-23 — Resolving Hosted vs Local Site Inconsistencies

### Findings & Architecture Rationale
- **Target**: Public Website & CI/CD Deployment (`site/index.html`, `site/script.js`, `.github/workflows/deploy.yml`, `tools/build.js`).
- **Symptoms**:
  1. On GitHub Pages (`amro212.github.io/kareer/`), the top navbar Firefox button appeared disabled with "Coming soon" in the user's browser, whereas locally on `localhost:8080` it appeared active as `Firefox .XPI`.
  2. On GitHub Pages, the hero version badge rendered as `v0.4.37.2` (including GitHub Actions run number) while locally it rendered as `v0.4.37`.
- **Root-Cause Analysis**:
  1. **Firefox Button**:
     - In `site/index.html`, the navbar button was statically authored as `class="... kr-btn-disabled"` with `<span class="kr-btn-tag">Coming soon</span>` and no `href`.
     - It relied entirely on client-side execution of `initStoreLinks()` in `site/script.js`.
     - Prior to the self-hosted distribution commit, `LINKS.firefox` was `null`. Browsers that had visited the site earlier cached `script.js` (GitHub Pages Fastly CDN cache). Because `index.html` had `<script src="script.js"></script>` without a version query string (`?v=...`), the cached `script.js` was reused, keeping `LINKS.firefox = null` and actively enforcing the disabled state.
  2. **Version Mismatch**:
     - `.github/workflows/deploy.yml` generated `VERSION="${BASE_VERSION}.${GITHUB_RUN_NUMBER}"` (e.g., `0.4.37.2`) strictly to satisfy Mozilla AMO's requirement that every unlisted signed `.xpi` must have a unique monotonically increasing version.
     - However, `deploy.yml` also used `VERSION` when writing `site/version.json` and substituting `data-version-badge` in `site/index.html`. Consequently, the hosted website advertised the internal CI build number (`v0.4.37.2`) instead of the clean canonical product semver (`v0.4.37`), causing a discrepancy with local `package.json` and `localhost:8080`.
- **Resolution**:
  1. **Static-First HTML**: Updated `site/index.html` so the navbar Firefox button is statically authored as an active link to `downloads/kareer-firefox.xpi` with `.xpi` tag. It is now instantly clickable and functional even before JavaScript executes or if an older script was cached.
  2. **Asset Cache-Busting**: Added `?v=${version}` to `<script src="script.js?v=...">` in `site/index.html`, dynamically maintained by `tools/build.js` and `deploy.yml`.
  3. **Site & Build Separation in CI**: In `.github/workflows/deploy.yml`, exported `BASE_VERSION` separately from `VERSION`. `VERSION` (`0.4.37.${GITHUB_RUN_NUMBER}`) is used solely for the Firefox XPI manifest and `site/firefox-updates.json` (for Firefox auto-updates), while `BASE_VERSION` (`0.4.37`) is written to `site/version.json` and the website badge, ensuring 100% parity between local and hosted environments.

### Turn changes
- `site/index.html`: Statically authored active Firefox navbar button and added version query to script tag.
- `.github/workflows/deploy.yml`: Preserved canonical `BASE_VERSION` for website manifests while retaining unique `VERSION` for signed XPI.
- `tools/build.js`: Added cache-busting regex for script tag in `syncSiteAndUpdates()`.
- `CONTEXT_AND_FINDINGS.md`: Logged findings and resolution.

### Verification
- `npm run build`: Success at v0.4.37.
- Playwright verification on `localhost:8080`: Navbar button active, points to `.xpi`, badge is `v0.4.37`.
- Playwright verification on remote `amro212.github.io/kareer/`: Confirmed Firefox button active and functional.
- `npm test`: **209 passed, 0 failed**.






