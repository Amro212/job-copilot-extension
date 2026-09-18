# Agent Instructions & Operating Rules

This repo is the single source of truth for Job Copilot. It builds two artifacts
from one core: the MV3 browser extension (Chrome + Firefox) and the Tampermonkey
userscript. The predecessor repo (`Autofill-Ext`) is frozen and read-only.

## 1. Findings log (mandatory)

Log every user-reported bug and every change made in a conversation turn in
[CONTEXT_AND_FINDINGS.md](./CONTEXT_AND_FINDINGS.md):

- **Bugs/findings**: date, target (extension or userscript), platform/ATS or
  fixture, symptoms, root-cause analysis, resolution or deferral.
- **Turn changes**: files modified or created, summary and rationale, current
  status and next steps.

## 2. Verification (mandatory)

- `npm test` must pass before any change is considered done.
- `npm run test:e2e` must pass for changes that touch scanning, filling,
  navigation, upload, or the panel. Real browser, real extension load.
- Every live ATS bug gets a captured fixture (`npm run capture` output) plus an
  E2E spec so it can never silently regress.

## 3. Architecture rules

1. **Host boundary**: core code never references `GM_*` or `chrome.*`. All host
   access goes through `src/core/platform.js`. New host capability means a new
   method on the platform contract plus an implementation in every host.
2. **Synchronous storage reads**: core reads storage synchronously. Hosts with
   async storage hydrate a cache during `platform.storage.ready()`.
3. **Key isolation**: the OpenRouter key lives in the extension background
   worker or GM storage only. It must never reach the page, the content script,
   `window`, logs, debug exports, prompts, or page storage. Hosts attach the
   `Authorization` header themselves.
4. **No page storage**: never use page `localStorage` or `sessionStorage` for
   core data.
5. **Single panel host**: one persistent Shadow DOM panel, top frame only.
   Subframes run field agents with no UI.
6. **Runtime boundary**: browser + page DOM + extension APIs + OpenRouter. No
   backend, no external browser controller. Playwright is for tests only.
7. **Actuator layer frozen**: `src/core/fields/fillers.js` and
   `src/core/fields/combobox.js` keep their current event strategy. No
   `chrome.debugger`, no typing animation, no randomized delays, no fingerprint
   spoofing, no stealth logic, no CAPTCHA solving.
8. **Field pipeline**: `observe -> locate -> scroll -> act -> verify -> repair`.
9. **One primary AI request per page**. Extra calls only for rewrite, repair, or
   late dynamic fields.
10. **Truthful grounding**: never invent jobs, projects, dates, tools,
    certifications, metrics, or years of experience. Mark inferred values.
11. **Safety boundaries**: pause for assessments, identity verification,
    recorded interviews, e-signatures, and legal attestations.
12. **Bounded retries**: never create an infinite fill or navigation loop.
13. **Preserve licenses** for directly reused MIT/BSD code.
14. **No unrequested files**: only add or modify files when instructed.
