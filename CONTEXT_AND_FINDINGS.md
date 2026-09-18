# Context and Findings

Running log of changes, bugs, and platform findings for the dual-target
(extension + userscript) Job Copilot.

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
