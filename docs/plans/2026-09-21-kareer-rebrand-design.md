# Kareer Hard Cutover Rebrand

**Goal:** Rename Job Copilot → Kareer across product, package, hosts, and internals. Solo user; no dual-storage migration.

**Approach:** Hard rename. Existing Options Export/Import covers profile/settings/memory/job. API key re-entered. Import accepts legacy `job-copilot-backup` and remaps `jc:*` → `kr:*` so a pre-rename export still loads.

## Identifier map

| Old | New |
|-----|-----|
| Job Copilot / JobCopilot | Kareer |
| job-copilot / jobcopilot | kareer |
| `job-copilot@local` | `kareer@local` |
| `#job-copilot-root` | `#kareer-root` |
| `jc:*` storage / MSG | `kr:*` |
| `.jc-*` / `#jc-*` UI | `.kr-*` / `#kr-*` |
| `job-copilot-backup` | `kareer-backup` |
| IndexedDB `job-copilot` | `kareer` |
| dist `job-copilot.*` | `kareer.*` |

Out of scope: renaming the local workspace folder / GitHub repo (manual).

## Verification

`npm test` and `npm run test:e2e` must pass.
