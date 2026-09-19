# Context and Findings

Running log of changes, bugs, and platform findings for the dual-target
(extension + userscript) Job Copilot.

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
