import { TOKENS, VISUAL_NAME, installPanelFonts } from './theme.js';
import { APP_VERSION, APP_NAME, POPULAR_MODELS, UI_IDS, FILL_STATUS } from './constants.js';
import { PROFILE_SECTIONS, PROFILE_FIELDS } from './profile.js';
import {
  getSettings,
  saveSettings,
  getProfile,
  saveProfile,
  hasApiKey,
  saveApiKey,
  getSanitizedState,
} from './storage.js';
import { platform, getHostName } from './platform.js';
import { collectPortableData, exportPayload } from './migration.js';
import { logger } from './debug.js';
import { testConnection, generateAutofillAnswers } from './ai.js';
import { scanFormFields, harvestComboboxOptions, deduplicateFields, refreshField } from './fields/scanner.js';
import { resolveComboboxSearchAnswers } from './autofill.js';
import { extractOptionLabel } from './fields/labels.js';
import { normalizeFieldsForAI } from './fields/normalize.js';
import { fillField } from './fields/fillers.js';
import { uploadResumeAndWait, isResumeField } from './resume.js';
import { verifyField } from './fields/verify.js';
import {
  scrollToField,
  highlightActiveField,
  highlightVerifiedField,
  highlightFailedField,
  clearHighlights,
  initInlineRewriteBadge,
} from './fields/highlight.js';
import { startFormObserver, pauseFormObserver, resumeFormObserver, stopFormObserver } from './observer.js';
import { collectRemoteFields, applyRemoteAnswers, searchRemoteOptions, listRemoteFrames, captureRemoteFixtures, isRemoteFieldId, applyRemoteResumeUploads } from './remote.js';
import { captureFixture, fixtureFileName } from './capture.js';
import { createApplicationEngine } from './application.js';
import { classifyPage } from './pageClassifier.js';
import { detectAdapter } from './adapters/index.js';
import { rememberAnswer } from './memory.js';
import { saveSession } from './sessions.js';

let applicationEngine = null;
let applicationState = null;
let panelHostDisconnectObserver = null;

function resolveLiveElement(field) {
  return refreshField(field);
}

function resolveLiveFileElement(field, root = document) {
  if (field.element?.isConnected) return field.element;
  const fields = scanFormFields(root);
  deduplicateFields(fields);
  const fresh = fields.find(candidate => candidate.id === field.id && candidate.type === "file")
    || fields.find(candidate => candidate.type === "file");
  if (fresh) {
    field.element = fresh.element;
    return fresh.element;
  }
  return field.element;
}

let shadowRootRef = null;
let currentTab = 'home';
let panelVisible = false;
let isPebble = false;
let lastAiTestResult = null;
let isAiTesting = false;

// Autofill execution state
let isAutofilling = false;
let autofillProgress = { current: 0, total: 0, statusText: '' };
let detectedFieldsCache = [];
let remoteFieldCount = 0;
let remoteFrameCount = 0;
let fieldResultsCache = new Map(); // fieldId -> { status, value, error, inferred }

const ICONS = {
  brandMark: `<svg width="14" height="14" viewBox="0 0 100 100" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M41.1 12.3L29.7 12.2L28.8 12.5L9.8 31L9.2 32.1L9 36.8V81.8L9.3 83.6L10.1 85.2L11.4 86.6L13 87.5L14.2 87.8H40.6L41.2 87.6L41.8 86.9L41.9 13.2ZM36 16.1V28.5L35.9 31.7H14.7L14.5 31.5L30.6 16ZM68.6 31.8L42.6 58L69.5 87.4H90.2L64.9 57.8L91 31.8Z"/></svg>`,
  sparkle: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1v14M1 8h14M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg>`,
  zap: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="9 1 2 9 7 9 7 15 14 7 9 7 9 1"/></svg>`,
  play: `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><polygon points="4 2 13 8 4 14 4 2"/></svg>`,
  pause: `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/></svg>`,
  refresh: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 2.5v4h4M15 13.5v-4h-4"/><path d="M13.2 6A5.5 5.5 0 0 0 3.2 4.2L1 6.5m14 3l-2.2 2.3A5.5 5.5 0 0 1 2.8 10"/></svg>`,
  check: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 8.5 6.5 12 13 4.5"/></svg>`,
  x: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>`,
  shield: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5l6 2.5v4.5c0 4-3 7-6 7.5-3-.5-6-3.5-6-7.5V4l6-2.5z"/></svg>`,
  alert: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2l6.5 11.5H1.5L8 2zM8 6.5v3M8 11.5v.5"/></svg>`,
  eye: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5"/></svg>`,
  eyeOff: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l14 14M6.7 6.8a2.5 2.5 0 0 0 3.5 3.5M2.5 4.5C1.8 5.5 1 8 1 8s2.5 5 7 5c1.8 0 3.3-.6 4.5-1.5M5.5 2.2C6.3 2.1 7.1 2 8 2c4.5 0 7 5 7 5s-.8 1.6-2 3"/></svg>`,
  locate: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><line x1="8" y1="1" x2="8" y2="3"/><line x1="8" y1="13" x2="8" y2="15"/><line x1="1" y1="8" x2="3" y2="8"/><line x1="13" y1="8" x2="15" y2="8"/></svg>`,
  maximize: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="10 2 14 2 14 6"/><polyline points="6 14 2 14 2 10"/><line x1="14" y1="2" x2="9" y2="7"/><line x1="2" y1="14" x2="7" y2="9"/></svg>`,
  minimize: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="8" x2="13" y2="8"/></svg>`,
  chevronDown: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 6 8 10 12 6"/></svg>`,
  user: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M13 14v-1.5a3.5 3.5 0 0 0-3.5-3.5h-3A3.5 3.5 0 0 0 3 12.5V14"/><circle cx="8" cy="5" r="3"/></svg>`,
  settings: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="2.5"/><path d="M13.5 9.5l1.1-.6a1 1 0 0 0 .4-1.3l-1-1.7a1 1 0 0 0-1.2-.5l-1.2.5a5 5 0 0 0-1.1-.6L10.3 4a1 1 0 0 0-1-.8H7.3a1 1 0 0 0-1 .8L6.1 5.3a5 5 0 0 0-1.1.6l-1.2-.5a1 1 0 0 0-1.2.5l-1 1.7a1 1 0 0 0 .4 1.3l1.1.6a5 5 0 0 0 0 1.2l-1.1.6a1 1 0 0 0-.4 1.3l1 1.7a1 1 0 0 0 1.2.5l1.2-.5a5 5 0 0 0 1.1.6l.2 1.3a1 1 0 0 0 1 .8h2a1 1 0 0 0 1-.8l.2-1.3a5 5 0 0 0 1.1-.6l1.2.5a1 1 0 0 0 1.2-.5l1-1.7a1 1 0 0 0-.4-1.3l-1.1-.6a5 5 0 0 0 0-1.2z"/></svg>`,
  terminal: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 4 7 8 3 12"/><line x1="9" y1="12" x2="13" y2="12"/></svg>`,
  list: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="4" x2="14" y2="4"/><line x1="6" y1="8" x2="14" y2="8"/><line x1="6" y1="12" x2="14" y2="12"/><circle cx="3" cy="4" r=".8" fill="currentColor"/><circle cx="3" cy="8" r=".8" fill="currentColor"/><circle cx="3" cy="12" r=".8" fill="currentColor"/></svg>`,
  externalLink: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4"/><polyline points="10 2 14 2 14 6"/><line x1="7" y1="9" x2="14" y2="2"/></svg>`,
};

const STYLES = `
:host {
  all: initial;
  ${TOKENS}
  /* Aliased internal tokens */
  --jc-font: var(--kr-font);
  --jc-font-mono: var(--kr-font-mono);
  --jc-bg-base: var(--kr-bg-0);
  --jc-bg-surface: var(--kr-bg-1);
  --jc-bg-surface-glass: rgba(13, 17, 23, 0.97);
  --jc-bg-elevated: var(--kr-bg-2);
  --jc-bg-hover: var(--kr-bg-3);
  --jc-bg-subtle: rgba(255, 255, 255, 0.03);
  --jc-border-subtle: var(--kr-line);
  --jc-border-hover: var(--kr-line-strong);
  --jc-border-active: var(--kr-signal);
  --jc-text-primary: var(--kr-text-1);
  --jc-text-secondary: var(--kr-text-2);
  --jc-text-muted: var(--kr-text-3);
  --jc-accent: var(--kr-signal);
  --jc-accent-primary: var(--kr-signal);
  --jc-accent-primary-hover: var(--kr-signal-hover);
  --jc-success: var(--kr-success);
  --jc-success-bg: rgba(82, 217, 140, 0.12);
  --jc-warning: var(--kr-warning);
  --jc-warning-bg: rgba(242, 184, 75, 0.12);
  --jc-danger: var(--kr-danger);
  --jc-danger-bg: rgba(240, 106, 106, 0.12);
  --jc-shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.35);
  --jc-shadow-lg: 0 24px 60px rgba(0, 0, 0, 0.48), 0 0 0 1px rgba(255, 255, 255, 0.025);
  --jc-radius-sm: var(--kr-radius-sm);
  --jc-radius-md: var(--kr-radius-md);
  --jc-radius-lg: var(--kr-radius-lg);
  --jc-radius-pill: var(--kr-radius-round);

  font-family: var(--jc-font);
  font-size: 13px;
  line-height: 1.45;
  color: var(--jc-text-primary);
  box-sizing: border-box;
  -webkit-font-smoothing: antialiased;
}

*, *::before, *::after {
  box-sizing: border-box;
}

::selection {
  background: var(--kr-signal-dim);
  color: var(--kr-signal);
}

/* Container & Dock/HUD */
.jc-widget-container {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 2147483646;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  pointer-events: none;
}

/* Floating Pebble (ultra-compact minimize) */
.jc-pebble {
  pointer-events: auto;
  width: 40px;
  height: 40px;
  border-radius: var(--kr-radius-md);
  background: var(--kr-bg-1);
  border: 1px solid var(--kr-line);
  box-shadow: var(--jc-shadow-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--kr-signal);
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
}

.jc-pebble svg {
  width: 20px;
  height: 20px;
  display: block;
}

.jc-pebble:hover {
  transform: translateY(-1px);
  border-color: var(--kr-line-strong);
  background: var(--kr-bg-2);
}

.jc-pebble-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  border: 1px solid var(--kr-bg-0);
}

/* Compact HUD Bar */
.jc-hud-bar {
  pointer-events: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: var(--kr-bg-1);
  border: 1px solid var(--kr-line);
  border-radius: var(--kr-radius-md);
  padding: 5px 8px 5px 12px;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.03);
  transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
}

.jc-hud-bar:hover {
  border-color: var(--kr-line-strong);
}

.jc-hud-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding-right: 4px;
}

.jc-hud-title {
  font-weight: 650;
  font-size: 13px;
  letter-spacing: -0.01em;
  color: var(--kr-text-1);
  display: flex;
  align-items: center;
  gap: 6px;
}

.jc-hud-brand-mark {
  color: var(--kr-signal);
  display: flex;
  align-items: center;
}

.jc-hud-brand-mark svg {
  width: 14px;
  height: 14px;
  display: block;
}

.jc-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--kr-success);
  box-shadow: 0 0 6px rgba(82, 217, 140, 0.6);
  flex-shrink: 0;
}

.jc-status-dot.no-key {
  background: var(--kr-warning);
  box-shadow: 0 0 6px rgba(242, 184, 75, 0.6);
}

.jc-status-dot.error {
  background: var(--kr-danger);
  box-shadow: 0 0 6px rgba(240, 106, 106, 0.6);
}

.jc-status-dot.running {
  background: var(--kr-signal);
  box-shadow: 0 0 4px rgba(163, 230, 53, 0.4);
  animation: jc-pulse-dot 1.5s ease-in-out infinite;
}

@keyframes jc-pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

.jc-hud-badge {
  font-family: var(--jc-font-mono);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: var(--kr-radius-xs);
  font-variant-numeric: tabular-nums;
  background: var(--kr-bg-2);
  color: var(--kr-text-2);
  border: 1px solid var(--kr-line);
  display: flex;
  align-items: center;
  gap: 4px;
}

.jc-hud-badge-accent {
  background: var(--kr-bg-2);
  color: var(--kr-signal);
  border-color: rgba(163, 230, 53, 0.35);
}

.jc-hud-adapter {
  font-family: var(--jc-font-mono);
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: var(--kr-radius-xs);
  background: var(--kr-bg-2);
  color: var(--kr-text-2);
  border: 1px solid var(--kr-line);
}

.jc-hud-cta {
  background: var(--kr-signal);
  color: #0A0D10;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--kr-radius-sm);
  padding: 6px 13px;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  white-space: nowrap;
}

.jc-hud-cta:hover {
  background: var(--kr-signal-hover);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
  transform: translateY(-1px);
}

.jc-hud-cta:active {
  transform: translateY(0);
}

.jc-hud-cta:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.jc-hud-cta-running {
  background: var(--kr-bg-2);
  color: var(--kr-signal);
  border: 1px solid rgba(163, 230, 53, 0.4);
  box-shadow: none;
}

.jc-hud-cta-running:hover {
  background: var(--kr-bg-3);
  box-shadow: none;
}

.jc-hud-icon-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--kr-text-2);
  width: 28px;
  height: 28px;
  border-radius: var(--kr-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: all 0.15s ease;
}

.jc-hud-icon-btn:hover {
  background: var(--kr-bg-3);
  color: var(--kr-text-1);
  border-color: var(--kr-line);
}

/* Inspection Drawer / Panel */
.jc-panel {
  pointer-events: auto;
  width: 460px;
  max-width: calc(100vw - 40px);
  height: 620px;
  max-height: calc(100vh - 90px);
  background: rgba(13, 17, 23, 0.97);
  border: 1px solid var(--kr-line);
  border-radius: var(--kr-radius-lg);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.48), 0 0 0 1px rgba(255, 255, 255, 0.025);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: jc-slide-up 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes jc-slide-up {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.99);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Panel Header */
.jc-header {
  padding: 12px 16px;
  background: var(--kr-bg-1);
  border-bottom: 1px solid var(--kr-line);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.jc-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 650;
  font-size: 13px;
  letter-spacing: -0.01em;
  color: var(--kr-text-1);
}

.jc-brand-mark {
  color: var(--kr-signal);
  display: flex;
  align-items: center;
}

.jc-brand-mark svg {
  width: 15px;
  height: 15px;
  display: block;
}

.jc-version-tag {
  font-family: var(--jc-font-mono);
  background: var(--kr-bg-2);
  color: var(--kr-text-3);
  font-size: 10px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: var(--kr-radius-xs);
  border: 1px solid var(--kr-line);
}

.jc-model-chip {
  font-family: var(--jc-font-mono);
  font-size: 10px;
  color: var(--kr-text-2);
  background: var(--kr-bg-2);
  padding: 2px 7px;
  border-radius: var(--kr-radius-xs);
  border: 1px solid var(--kr-line);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jc-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.jc-close-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--kr-text-2);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--kr-radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.jc-close-btn:hover {
  background: var(--kr-bg-3);
  color: var(--kr-text-1);
  border-color: var(--kr-line);
}

/* Nav Tabs */
.jc-nav-tabs {
  display: flex;
  gap: 4px;
  background: var(--kr-bg-1);
  border-bottom: 1px solid var(--kr-line);
  padding: 6px 12px;
}

.jc-tab-btn {
  flex: 1;
  background: transparent;
  border: 1px solid transparent;
  color: var(--kr-text-2);
  font-size: 12px;
  font-weight: 500;
  padding: 6px 8px;
  border-radius: var(--kr-radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  user-select: none;
}

.jc-tab-btn:hover {
  color: var(--kr-text-1);
  background: var(--kr-bg-2);
}

.jc-tab-btn.active {
  color: var(--kr-signal);
  background: var(--kr-bg-2);
  border-color: rgba(163, 230, 53, 0.35);
  font-weight: 600;
}

/* Content Area */
.jc-content {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--kr-bg-0);
}

.jc-content::-webkit-scrollbar {
  width: 4px;
}
.jc-content::-webkit-scrollbar-track {
  background: transparent;
}
.jc-content::-webkit-scrollbar-thumb {
  background: var(--kr-line);
  border-radius: 2px;
}

/* Card Surface */
.jc-card {
  background: var(--kr-bg-2);
  border: 1px solid var(--kr-line);
  border-radius: var(--kr-radius-md);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: border-color 0.15s ease;
}

.jc-card:hover {
  border-color: var(--kr-line-strong);
}

.jc-card-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--kr-text-2);
  display: flex;
  align-items: center;
  gap: 6px;
}

.jc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.jc-label {
  font-size: 12px;
  color: var(--kr-text-2);
  font-weight: 500;
}

.jc-val {
  font-size: 12px;
  color: var(--kr-text-1);
  font-weight: 600;
  word-break: break-all;
}

/* Form Controls */
.jc-form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.jc-form-group label {
  font-size: 11px;
  font-weight: 600;
  color: var(--kr-text-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.jc-input, .jc-select, .jc-textarea {
  width: 100%;
  background: var(--kr-bg-1);
  border: 1px solid var(--kr-line);
  border-radius: var(--kr-radius-sm);
  color: var(--kr-text-1);
  padding: 7px 10px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  caret-color: var(--kr-signal);
}

.jc-input:focus, .jc-select:focus, .jc-textarea:focus {
  border-color: var(--kr-signal);
  box-shadow: 0 0 0 2px rgba(163, 230, 53, 0.2);
}

.jc-textarea {
  min-height: 70px;
  resize: vertical;
}

/* Buttons */
.jc-btn {
  background: var(--kr-signal);
  color: #0A0D10;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--kr-radius-sm);
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 650;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.jc-btn:hover {
  background: var(--kr-signal-hover);
  transform: translateY(-1px);
}

.jc-btn:active {
  transform: translateY(0);
}

.jc-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px rgba(163, 230, 53, 0.35);
}

.jc-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.jc-btn-large {
  padding: 9px 16px;
  font-size: 13px;
  background: var(--kr-signal);
  color: #0A0D10;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}

.jc-btn-large:hover {
  background: var(--kr-signal-hover);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
}

.jc-btn-secondary {
  background: var(--kr-bg-2);
  color: var(--kr-text-1);
  border: 1px solid var(--kr-line);
  font-weight: 500;
}

.jc-btn-secondary:hover {
  background: var(--kr-bg-3);
  border-color: var(--kr-line-strong);
  color: var(--kr-text-1);
}

.jc-btn-small {
  padding: 4px 8px;
  font-size: 11px;
  border-radius: var(--kr-radius-xs);
}

/* Toggles & Switches */
.jc-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--kr-line);
}

.jc-toggle-row:last-child {
  border-bottom: none;
}

.jc-switch {
  position: relative;
  display: inline-block;
  width: 34px;
  height: 18px;
  flex-shrink: 0;
}

.jc-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.jc-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: var(--kr-line-strong);
  transition: 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  border-radius: var(--kr-radius-round);
}

.jc-slider:before {
  position: absolute;
  content: "";
  height: 12px;
  width: 12px;
  left: 3px;
  bottom: 3px;
  background-color: var(--kr-text-1);
  transition: 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  border-radius: 50%;
}

input:checked + .jc-slider {
  background-color: var(--kr-signal);
}

input:checked + .jc-slider:before {
  transform: translateX(16px);
  background-color: #0A0D10;
}

/* Badges & Chips */
.jc-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: var(--kr-radius-xs);
  font-family: var(--jc-font-mono);
  font-size: 10px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.jc-badge-green {
  background: rgba(82, 217, 140, 0.12);
  color: var(--kr-success);
  border: 1px solid rgba(82, 217, 140, 0.3);
}

.jc-badge-amber {
  background: rgba(242, 184, 75, 0.12);
  color: var(--kr-warning);
  border: 1px solid rgba(242, 184, 75, 0.3);
}

.jc-badge-red {
  background: rgba(240, 106, 106, 0.12);
  color: var(--kr-danger);
  border: 1px solid rgba(240, 106, 106, 0.3);
}

.jc-badge-blue {
  background: rgba(98, 200, 255, 0.12);
  color: var(--kr-info);
  border: 1px solid rgba(98, 200, 255, 0.3);
}

/* Alerts & Banners */
.jc-alert {
  padding: 10px 12px;
  border-radius: var(--kr-radius-sm);
  font-size: 12px;
  line-height: 1.4;
}

.jc-alert-success {
  background: rgba(82, 217, 140, 0.1);
  border: 1px solid rgba(82, 217, 140, 0.3);
  color: #a7f3d0;
}

.jc-alert-error {
  background: rgba(240, 106, 106, 0.1);
  border: 1px solid rgba(240, 106, 106, 0.3);
  color: #fecaca;
}

/* Safety Boundary Card */
.jc-safety-banner {
  background: rgba(242, 184, 75, 0.08);
  border: 1px solid rgba(242, 184, 75, 0.3);
  border-radius: var(--kr-radius-md);
  padding: 12px 14px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.jc-safety-icon {
  color: var(--kr-warning);
  flex-shrink: 0;
  margin-top: 2px;
}

.jc-safety-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.jc-safety-title {
  font-size: 12px;
  font-weight: 650;
  color: var(--kr-warning);
}

.jc-safety-desc {
  font-size: 11px;
  color: var(--kr-text-2);
  line-height: 1.4;
}

/* Progress Bars */
.jc-progress-bar-container {
  width: 100%;
  height: 2px;
  background: var(--kr-line);
  border-radius: 1px;
  overflow: hidden;
}

.jc-progress-bar {
  width: 100%;
  height: 100%;
  background: var(--kr-signal);
  transform-origin: left center;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  border-radius: 1px;
}

/* Workflow Card */
.jc-workflow-card {
  background: var(--kr-bg-2);
  border: 1px solid var(--kr-line);
  border-radius: var(--kr-radius-md);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.15s ease;
}

.jc-workflow-card.wf-running {
  border-color: rgba(163, 230, 53, 0.35);
  background: var(--kr-bg-2);
}

.jc-workflow-card.wf-paused {
  border-color: rgba(242, 184, 75, 0.35);
  background: rgba(242, 184, 75, 0.03);
}

.jc-workflow-card.wf-done {
  border-color: rgba(82, 217, 140, 0.35);
  background: rgba(82, 217, 140, 0.03);
}

.jc-wf-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 7px;
  border-radius: var(--kr-radius-xs);
  font-family: var(--jc-font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

.jc-wf-badge-running {
  background: var(--kr-signal-dim);
  color: var(--kr-signal);
  border: 1px solid rgba(163, 230, 53, 0.35);
  animation: jc-pulse-badge 1.8s ease-in-out infinite;
}

.jc-wf-badge-paused {
  background: rgba(242, 184, 75, 0.12);
  color: var(--kr-warning);
  border: 1px solid rgba(242, 184, 75, 0.35);
}

.jc-wf-badge-done {
  background: rgba(82, 217, 140, 0.12);
  color: var(--kr-success);
  border: 1px solid rgba(82, 217, 140, 0.35);
}

.jc-wf-badge-idle {
  background: var(--kr-bg-3);
  color: var(--kr-text-3);
  border: 1px solid var(--kr-line);
}

@keyframes jc-pulse-badge {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.jc-wf-job-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--kr-text-1);
  line-height: 1.3;
}

.jc-wf-job-company {
  font-size: 12px;
  color: var(--kr-text-2);
  font-weight: 400;
}

.jc-wf-reason {
  font-size: 12px;
  color: var(--kr-text-2);
  line-height: 1.4;
  padding: 8px 10px;
  background: var(--kr-bg-1);
  border-radius: var(--kr-radius-sm);
  border: 1px solid var(--kr-line);
}

.jc-wf-reason.wf-error {
  border-color: rgba(242, 184, 75, 0.3);
  color: var(--kr-warning);
  background: rgba(242, 184, 75, 0.06);
}

.jc-wf-metrics {
  display: flex;
  gap: 16px;
  font-size: 11px;
  font-family: var(--jc-font-mono);
  font-variant-numeric: tabular-nums;
}

.jc-wf-metric {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--kr-text-2);
}

.jc-wf-metric strong {
  color: var(--kr-text-1);
  font-weight: 600;
}

.jc-wf-step-bar-container {
  width: 100%;
  height: 2px;
  background: var(--kr-line);
  border-radius: 1px;
  overflow: hidden;
}

.jc-wf-step-bar {
  width: 100%;
  height: 100%;
  background: var(--kr-signal);
  border-radius: 1px;
  transform-origin: left center;
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  min-width: 0;
}

.jc-wf-step-bar.wf-pulse {
  animation: jc-bar-pulse 1.5s ease-in-out infinite;
}

.jc-wf-step-bar.wf-done {
  background: var(--kr-success);
}

@keyframes jc-bar-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.jc-wf-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.jc-wf-actions .jc-btn {
  flex: 1;
  padding: 7px 12px;
  font-size: 12px;
}

.jc-wf-actions .jc-btn:first-child {
  flex: 0 0 auto;
}

.jc-btn-pause-active {
  background: rgba(242, 184, 75, 0.12) !important;
  color: var(--kr-warning) !important;
  border-color: rgba(242, 184, 75, 0.45) !important;
}

/* Review Tab Surface */
.jc-review-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.jc-review-item {
  background: var(--kr-bg-1);
  border: 1px solid var(--kr-line);
  border-radius: var(--kr-radius-sm);
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  transition: border-color 0.15s ease;
}

.jc-review-item:hover {
  border-color: var(--kr-line-strong);
  background: var(--kr-bg-2);
}

.jc-review-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.jc-review-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--kr-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.jc-review-value {
  font-size: 11px;
  color: var(--kr-text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--jc-font-mono);
}

.jc-review-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* Logs & Telemetry */
.jc-log-box {
  background: var(--kr-bg-0);
  border: 1px solid var(--kr-line);
  border-radius: var(--kr-radius-sm);
  padding: 8px;
  max-height: 180px;
  overflow-y: auto;
  font-family: var(--jc-font-mono);
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.jc-log-item {
  line-height: 1.35;
  word-break: break-all;
}

.jc-log-time {
  color: var(--kr-text-3);
  margin-right: 4px;
}

.jc-log-level-INFO { color: var(--kr-info); }
.jc-log-level-WARN { color: var(--kr-warning); }
.jc-log-level-ERROR { color: var(--kr-danger); }
.jc-log-level-DEBUG { color: var(--kr-text-3); }

.jc-save-feedback {
  font-size: 11px;
  color: var(--kr-success);
  display: none;
}

/* Shared typography and compact, keyboard-accessible instrument surfaces. */
button, input, select, textarea { font-family: var(--jc-font); }
button svg { flex-shrink: 0; }
:host { color-scheme: dark; }
:focus-visible { outline: 2px solid var(--kr-signal); outline-offset: 3px; }
.jc-hud-brand { border: 0; background: transparent; color: inherit; font: inherit; }
.jc-hud-expanded .jc-hud-cta { background: var(--kr-bg-2); color: var(--kr-text-1); border-color: var(--kr-line); }
.jc-hud-adapter { max-width: 110px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jc-panel { background: var(--kr-bg-1); }
.jc-header, .jc-header-actions, .jc-row > *, .jc-wf-actions > * { min-width: 0; }
.jc-val { text-align: right; overflow-wrap: anywhere; word-break: normal; }
.jc-label { flex-shrink: 0; }
.jc-content { scrollbar-color: var(--kr-line-strong) var(--kr-bg-0); scrollbar-width: thin; }
.jc-card-title { font-size: 12px; text-transform: none; letter-spacing: 0; color: var(--kr-text-1); }
.jc-form-group label { text-transform: none; letter-spacing: 0; font-size: 12px; }
.jc-review-value { font-family: var(--jc-font); }
.jc-review-item { background: transparent; border: 0; border-bottom: 1px solid var(--kr-line); border-radius: 0; padding: 10px 0; }
.jc-review-item:last-child { border-bottom: 0; }
.jc-tab-btn[data-tab="debug"] { flex: .8; margin-left: 8px; border-left-color: var(--kr-line); border-radius: 0; }
.jc-wf-actions { flex-wrap: wrap; }
.jc-wf-actions .jc-btn { flex: 1 1 auto; }
#jc-model-select, #jc-custom-model-input { font-family: var(--jc-font-mono); }
@media (max-width: 520px) {
  .jc-widget-container { right: 12px; bottom: 12px; }
  .jc-panel { max-width: calc(100vw - 24px); }
  .jc-hud-bar { gap: 4px; padding-left: 8px; max-width: calc(100vw - 24px); }
  .jc-hud-adapter { max-width: 64px; }
  .jc-hud-title { font-size: 12px; }
  .jc-content { padding: 10px; }
  .jc-card { padding: 10px; }
  .jc-btn { padding-left: 10px; padding-right: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
`;

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let ttPolicy = null;

function getTrustedHTML(htmlString) {
  if (typeof window !== 'undefined' && window.trustedTypes && typeof window.trustedTypes.createPolicy === 'function') {
    if (!ttPolicy) {
      try {
        ttPolicy = window.trustedTypes.createPolicy('job-copilot-ui', {
          createHTML: (s) => s,
        });
      } catch {
        ttPolicy = window.trustedTypes.defaultPolicy || { createHTML: (s) => s };
      }
    }
    try {
      return ttPolicy.createHTML ? ttPolicy.createHTML(htmlString) : htmlString;
    } catch {
      return htmlString;
    }
  }
  return htmlString;
}

function setSafeHTML(element, htmlString) {
  try {
    element.innerHTML = getTrustedHTML(htmlString);
  } catch (err) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');
      element.replaceChildren(...doc.body.childNodes);
    } catch (parseErr) {
      console.warn('[JobCopilot:UI] Fallback HTML assignment failed:', parseErr);
    }
  }
}

function getStatusInfo() {
  if (!hasApiKey()) {
    return {
      label: 'No API Key',
      dotClass: 'no-key',
      badgeClass: 'jc-badge-amber',
      text: 'Configure your OpenRouter API key in Settings.',
    };
  }
  if (lastAiTestResult && !lastAiTestResult.ok) {
    return {
      label: 'API Error',
      dotClass: 'error',
      badgeClass: 'jc-badge-red',
      text: lastAiTestResult.error || 'OpenRouter connection failed',
    };
  }
  return {
    label: 'Ready',
    dotClass: '',
    badgeClass: 'jc-badge-green',
    text: 'Connected and ready for action.',
  };
}

function refreshDetectedFields() {
  try {
    detectedFieldsCache = scanFormFields(document);
  } catch (err) {
    logger.error('Error scanning fields:', err);
  }
  refreshRemoteFieldCount();
}

/**
 * Embedded-frame counts arrive asynchronously. The host calls this again whenever
 * a frame announces, because an embed-only page produces almost no mutations in
 * this document to react to.
 */
export function refreshRemoteFieldCount() {
  if (!platform.capabilities.crossFrame) return;
  listRemoteFrames()
    .then((frames) => {
      const total = frames.reduce((sum, frame) => sum + frame.fieldCount, 0);
      if (total === remoteFieldCount && frames.length === remoteFrameCount) return;
      remoteFieldCount = total;
      remoteFrameCount = frames.length;
      updatePanelDOM();
    })
    .catch(() => {});
}

let autofillGeneration = 0;
let cancelAutofillDelay = null;

/**
 * Second AI pass for comboboxes inside embedded frames whose options only appear
 * after a search, mirroring resolveComboboxSearchAnswers for the local document.
 */
async function resolveRemoteSearchAnswers(response) {
  const pending = response.answers.filter((answer) => isRemoteFieldId(answer.fieldId) && answer.searchQuery);
  if (!pending.length) return response;

  const discovered = await searchRemoteOptions(null, pending);
  if (!discovered.length) return response;

  try {
    const resolved = await generateAutofillAnswers(discovered, { allowSearch: false });
    const byId = new Map(resolved.answers.map((answer) => [answer.fieldId, answer]));
    return { ...response, answers: response.answers.map((answer) => byId.get(answer.fieldId) || answer) };
  } catch (err) {
    logger.warn(`Embedded combobox search resolution failed: ${err.message}`);
    return response;
  }
}

function autofillSleep(ms) {
  return new Promise((resolve) => {
    let timer = null;
    cancelAutofillDelay = () => {
      clearTimeout(timer);
      cancelAutofillDelay = null;
      resolve();
    };
    timer = setTimeout(() => {
      cancelAutofillDelay = null;
      resolve();
    }, ms);
  });
}

function stopAutofillFlow(reason = 'Autofill paused by user. Progress and filled fields preserved.') {
  if (!isAutofilling) return;
  autofillGeneration++;
  cancelAutofillDelay?.();
  isAutofilling = false;
  autofillProgress.statusText = reason;
  logger.info(`Single-page autofill stopped: ${reason}`);
  resumeFormObserver();
  refreshDetectedFields();
  updatePanelDOM();
}

async function executeAutofillFlow() {
  if (isAutofilling || applicationEngine?.busy) return;
  applicationEngine?.pause();
  const token = ++autofillGeneration;
  const runUrl = window.location.href;
  const page = classifyPage();
  if (['captcha', 'boundary', 'confirmation'].includes(page.type)) {
    autofillProgress.statusText = page.reason;
    updatePanelDOM();
    return;
  }
  if (!hasApiKey()) {
    alert('Please configure your OpenRouter API Key in Settings first.');
    currentTab = 'settings';
    updatePanelDOM();
    return;
  }

  isAutofilling = true;
  autofillProgress = { current: 0, total: 0, statusText: 'Scanning page fields...' };
  updatePanelDOM();
  pauseFormObserver();

  try {
    refreshDetectedFields();
    deduplicateFields(detectedFieldsCache);
    const settings = getSettings();
    const overwrite = Boolean(settings.overwriteExisting);

    const shouldFill = (f) => {
      if (overwrite) return true;
      if (f.hasExistingValue) return false;
      const val = f.currentValue;
      return !val || val === 'false' || val === '0' || String(val).trim().length === 0;
    };
    const allFileFields = detectedFieldsCache.filter(f => f.type === 'file');
    const fileFields = allFileFields.filter(f => isResumeField(f, allFileFields) && shouldFill(f));
    let filledCount = 0;
    let failedCount = 0;
    for (const field of fileFields) {
      if (token !== autofillGeneration) return;
      field.element = resolveLiveFileElement(field);
      // An earlier parser may already have attached this upload control.
      if (!shouldFill(field)) continue;
      autofillProgress.statusText = `Attaching resume and waiting for processing: "${field.label}"`;
      updatePanelDOM();
      const didFill = await uploadResumeAndWait(field, { isCurrent: () => token === autofillGeneration });
      if (token !== autofillGeneration) return;
      field.element = resolveLiveFileElement(field);
      const verification = didFill ? await verifyField(field, '') : { verified: false, error: 'No stored resume' };
      if (verification.verified) {
        filledCount++;
        fieldResultsCache.set(field.id, { status: FILL_STATUS.VERIFIED, value: verification.actualValue || '' });
      } else {
        failedCount++;
        fieldResultsCache.set(field.id, { status: FILL_STATUS.FAILED, value: '', error: verification.error || 'Resume was not attached' });
      }
    }
    const remoteUploads = await applyRemoteResumeUploads({ overwriteExisting: overwrite });
    if (token !== autofillGeneration) return;
    for (const result of remoteUploads) {
      fieldResultsCache.set(result.fieldId, result);
      if (result.status === FILL_STATUS.VERIFIED) filledCount++;
      else if (result.status === FILL_STATUS.FAILED) failedCount++;
    }
    // Parsing can populate, clear, add, or replace controls. Choose targets only
    // after it settles, preserving parser/user values unless overwrite is on.
    refreshDetectedFields();
    deduplicateFields(detectedFieldsCache);
    const targetFields = detectedFieldsCache.filter(shouldFill);

    // An embedded application (a Greenhouse or Ashby iframe, for example) leaves
    // this document with zero fields while the real form sits one origin away.
    autofillProgress.statusText = 'Checking embedded frames...';
    updatePanelDOM();
    const remoteGroups = await collectRemoteFields({ overwriteExisting: overwrite });
    if (token !== autofillGeneration) return;
    const remoteFields = remoteGroups.flatMap((group) => group.fields);

    const aiTargetFields = targetFields.filter((f) => f.type !== 'file');

    if (aiTargetFields.length === 0 && remoteFields.length === 0 && fileFields.length === 0 && remoteUploads.length === 0) {
      autofillProgress.statusText = detectedFieldsCache.length === 0
        ? 'No form fields detected on this page.'
        : 'All fields are already filled. Enable "Overwrite Existing Values" in Settings to overwrite.';
      logger.info(autofillProgress.statusText);
      isAutofilling = false;
      updatePanelDOM();
      return;
    }

    if (token !== autofillGeneration) return;

    autofillProgress.total = aiTargetFields.length + remoteFields.length + fileFields.length;
    autofillProgress.statusText = 'Harvesting combobox options...';
    updatePanelDOM();

    // Read each field's unfiltered options before asking AI to choose an exact label.
    await harvestComboboxOptions(aiTargetFields);
    if (token !== autofillGeneration) return;

    const normalized = [
      ...normalizeFieldsForAI(aiTargetFields, { overwriteExisting: overwrite }),
      ...remoteFields,
    ];
    let aiResponse = { answers: [] };
    if (normalized.length) {
      autofillProgress.statusText = `Generating answers with AI (${settings.model})...`;
      updatePanelDOM();
      aiResponse = await generateAutofillAnswers(normalized);
    }
    if (token !== autofillGeneration) return;
    if (window.location.href !== runUrl) throw new Error('Page changed during autofill. Inspect the current step before retrying.');
    if (['captcha', 'boundary', 'confirmation'].includes(classifyPage().type)) throw new Error(classifyPage().reason);
    if (aiResponse.answers.some(answer => answer.searchQuery)) {
      autofillProgress.statusText = 'Searching for missing combobox options...';
      updatePanelDOM();
      aiResponse = await resolveComboboxSearchAnswers(aiTargetFields, aiResponse);
      if (token !== autofillGeneration) return;
      aiResponse = await resolveRemoteSearchAnswers(aiResponse);
      if (token !== autofillGeneration) return;
    }
    const answersMap = new Map(aiResponse.answers.map((a) => [a.fieldId, a]));

    logger.info(`Starting progressive fill of ${aiTargetFields.length} local, ${fileFields.length} upload and ${remoteFields.length} embedded fields...`);

    for (let i = 0; i < aiTargetFields.length; i++) {
      if (token !== autofillGeneration) break;
      if (window.location.href !== runUrl) throw new Error('Page changed during autofill. Inspect the current step before retrying.');
      if (['captcha', 'boundary', 'confirmation'].includes(classifyPage().type)) throw new Error(classifyPage().reason);
      const field = aiTargetFields[i];
      autofillProgress.current = i + 1;
      autofillProgress.statusText = `Filling ${i + 1} of ${aiTargetFields.length}: "${field.label}"`;
      updatePanelDOM();

      try {
        if (token !== autofillGeneration) break;
        // Resolve live element in case previous mutations/re-renders detached old nodes
        field.element = resolveLiveElement(field);

        const answer = answersMap.get(field.id);
        if (!answer || answer.value === '' || answer.value === null || answer.value === undefined) {
          if (field.required || field.element?.getAttribute('data-reject-fill') === 'true') {
            failedCount++;
            fieldResultsCache.set(field.id, {
              status: FILL_STATUS.FAILED,
              value: field.currentValue || '',
              error: 'Required field left empty by AI',
            });
            highlightFailedField(field.element);
          } else {
            fieldResultsCache.set(field.id, {
              status: FILL_STATUS.SKIPPED,
              value: field.currentValue,
            });
          }
          continue;
        }

        scrollToField(field.element);
        highlightActiveField(field.element);

        // Brief delay for visual animation (interruptible)
        await autofillSleep(100);
        if (token !== autofillGeneration) break;

        const didFill = await fillField(field, answer.value);
        if (token !== autofillGeneration) break;

        // Allow micro-delay for React/framework state settling (interruptible)
        const settleDelay = field.type === 'combobox' ? 250 : 80;
        await autofillSleep(settleDelay);
        if (token !== autofillGeneration) break;

        // Re-resolve element before verification if DOM was mutated
        field.element = resolveLiveElement(field);
        const verification = didFill
          ? await verifyField(field, answer.value)
          : { verified: false, actualValue: '', error: 'No exact option was selected or the field rejected the value' };

        if (token !== autofillGeneration) break;

        if (verification.verified) {
          highlightVerifiedField(field.element);
          filledCount++;
          fieldResultsCache.set(field.id, {
            status: answer.inferred ? FILL_STATUS.INFERRED : FILL_STATUS.VERIFIED,
            value: verification.actualValue || answer.value,
            inferred: answer.inferred,
          });
          // Preserve memory and session continuity without overwriting
          if (applicationEngine?.session) {
            rememberAnswer(applicationEngine.session, field, answer);
            saveSession(applicationEngine.session);
          } else {
            rememberAnswer(null, field, answer);
          }
        } else {
          highlightFailedField(field.element);
          failedCount++;
          fieldResultsCache.set(field.id, {
            status: FILL_STATUS.FAILED,
            value: verification.actualValue || '',
            error: verification.error || 'Value did not stick in DOM',
          });
          logger.warn(`Verification failed for "${field.label}": ${verification.error}`);
        }
      } catch (fieldErr) {
        if (token !== autofillGeneration) break;
        logger.error(`Error filling field "${field.label}":`, fieldErr);
        failedCount++;
        fieldResultsCache.set(field.id, {
          status: FILL_STATUS.FAILED,
          value: '',
          error: fieldErr?.message || 'Field execution failed',
        });
        try {
          highlightFailedField(field.element);
        } catch {}
      }
    }

    if (token !== autofillGeneration) return;

    if (remoteFields.length) {
      const remoteAnswers = aiResponse.answers.filter((answer) => isRemoteFieldId(answer.fieldId));
      autofillProgress.statusText = `Filling ${remoteAnswers.length} fields in embedded frames...`;
      updatePanelDOM();

      const remoteResults = await applyRemoteAnswers(remoteAnswers, (frameId, count) => {
        autofillProgress.statusText = `Filling ${count} fields in embedded frame ${frameId}...`;
        updatePanelDOM();
      });
      if (token !== autofillGeneration) return;

      for (const result of remoteResults) {
        fieldResultsCache.set(result.fieldId, {
          status: result.status,
          value: result.value || '',
          error: result.error,
          inferred: result.inferred,
          label: result.label,
          remote: true,
        });
        if (result.status === FILL_STATUS.VERIFIED || result.status === FILL_STATUS.INFERRED) filledCount++;
        else if (result.status === FILL_STATUS.FAILED) failedCount++;
      }
      autofillProgress.current = autofillProgress.total;
    }

    autofillProgress.statusText = `Autofill completed! (${filledCount} filled, ${failedCount} failed)`;
    logger.info(`Autofill finished: ${filledCount} verified, ${failedCount} failed out of ${aiTargetFields.length + fileFields.length + remoteFields.length} fields.`);
  } catch (err) {
    if (token !== autofillGeneration) return;
    logger.error('Autofill execution failed:', err);
    autofillProgress.statusText = `Error: ${err.message}`;
  } finally {
    if (token === autofillGeneration) {
      isAutofilling = false;
      resumeFormObserver();
      refreshDetectedFields();
      updatePanelDOM();
    }
  }
}

export function exportUserBackup() {
  const fileName = `job-copilot-backup-${new Date().toISOString().slice(0, 10)}.json`;
  downloadText(
    fileName,
    JSON.stringify(exportPayload(collectPortableData()), null, 2),
    'application/json',
  );
}

function downloadText(fileName, text, type = 'text/html') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Saves this page, plus each embedded frame, as sanitized fixture files. Frames
 * capture themselves because their documents are unreachable from here.
 */
async function saveFixtureSnapshot() {
  const feedback = shadowRootRef?.querySelector('#jc-capture-feedback');
  const report = (text) => { if (feedback) feedback.textContent = text; };

  try {
    report('Capturing...');
    const frameCaptures = await captureRemoteFixtures();
    const frameFiles = frameCaptures.map((capture, index) => fixtureFileName(capture.url || window.location.href, `frame${index + 1}`));

    const { html, meta } = captureFixture(document, { frameFiles });
    const mainFile = fixtureFileName(window.location.href);
    downloadText(mainFile, html);
    frameCaptures.forEach((capture, index) => downloadText(frameFiles[index], capture.html));

    const total = 1 + frameCaptures.length;
    report(`Saved ${total} file${total === 1 ? '' : 's'}: ${meta.fieldCount} fields here${frameCaptures.length ? `, ${frameCaptures.length} embedded frame${frameCaptures.length === 1 ? '' : 's'}` : ''}. Move them into fixtures/.`);
    logger.info(`Captured fixture for ${meta.host} (${meta.fieldCount} fields, ${frameCaptures.length} frames)`);
  } catch (err) {
    logger.error('Fixture capture failed:', err);
    report(`Capture failed: ${err.message}`);
  }
}


function renderHud() {
  const status = getStatusInfo();
  const fieldCount = detectedFieldsCache.length + remoteFieldCount;
  const adapter = detectAdapter();
  const session = applicationState?.session;
  const wfStatus = session?.status || '';
  const wfIsRunning = wfStatus === 'running' || wfStatus === 'submitting';
  const wfIsWaiting = ['captcha', 'boundary'].includes(wfStatus);

  if (isPebble) {
    const pebbleDotClass = isAutofilling || wfIsRunning ? 'running' : status.dotClass;
    return `
      <button type="button" class="jc-pebble" id="jc-pebble-toggle-btn" title="Expand Kareer">
        <div class="jc-status-dot ${pebbleDotClass} jc-pebble-dot"></div>
        ${ICONS.brandMark}
      </button>
    `;
  }

  const dotClass = isAutofilling || wfIsRunning ? 'running' : status.dotClass;
  const countBadge = fieldCount > 0
    ? `<span class="jc-hud-badge jc-hud-badge-accent">${fieldCount}</span>`
    : '';

  let ctaContent = '';
  if (isAutofilling) {
    ctaContent = `
      <button class="jc-hud-cta jc-hud-cta-running" id="jc-hud-autofill-btn" title="Autofill in progress">
        ${ICONS.play}
        <span>${autofillProgress.current}/${autofillProgress.total || fieldCount}</span>
      </button>
      <button class="jc-hud-icon-btn" id="jc-hud-pause-btn" title="Pause autofill">
        ${ICONS.pause}
      </button>
    `;
  } else if (wfIsRunning) {
    ctaContent = `
      <button class="jc-hud-cta jc-hud-cta-running" id="jc-hud-autofill-btn" title="Workflow running">
        ${ICONS.play}
        <span>Running...</span>
      </button>
      <button class="jc-hud-icon-btn" id="jc-hud-pause-btn" title="Pause workflow">
        ${ICONS.pause}
      </button>
    `;
  } else if (wfIsWaiting) {
    ctaContent = `
      <button class="jc-hud-cta" id="jc-hud-autofill-btn" style="background: rgba(242, 184, 75, 0.15); color: #F2B84B; border: 1px solid rgba(242, 184, 75, 0.4);" title="Action required on page">
        ${ICONS.shield}
        <span>Action Required</span>
      </button>
    `;
  } else {
    ctaContent = `
      <button class="jc-hud-cta" id="jc-hud-autofill-btn" ${fieldCount === 0 ? 'disabled' : ''} title="Autofill fields on this page">
        ${ICONS.play}
        <span>Autofill</span>
      </button>
    `;
  }

  return `
    <div class="jc-hud-bar ${panelVisible ? 'jc-hud-expanded' : ''}" id="jc-hud">
      <button type="button" class="jc-hud-brand" id="jc-toggle-btn" aria-expanded="${panelVisible}" title="${panelVisible ? 'Collapse panel' : 'Open Kareer Inspector'}">
        <div class="jc-status-dot ${dotClass}"></div>
        <div class="jc-hud-title">
          <span class="jc-hud-brand-mark">${ICONS.brandMark}</span>
          <span>${VISUAL_NAME}</span>
        </div>
        <span class="jc-hud-adapter">${escapeHtml(adapter.id === 'generic' ? 'Generic' : adapter.label)}</span>
        ${countBadge}
      </button>
      ${ctaContent}
      <button class="jc-hud-icon-btn" id="jc-hud-expand-btn" title="${panelVisible ? 'Collapse panel' : 'Open Inspector'}">
        ${panelVisible ? ICONS.minimize : ICONS.maximize}
      </button>
      <button class="jc-hud-icon-btn" id="jc-pebble-toggle-btn" title="Minimize to pebble">
        ${ICONS.x}
      </button>
    </div>
  `;
}

function renderFieldReviewSection() {
  const fields = detectedFieldsCache;
  const verifiedFields = [];
  const inferredFields = [];
  const failedFields = [];
  const untouchedFields = [];

  for (const f of fields) {
    const res = fieldResultsCache.get(f.id);
    if (res?.status === FILL_STATUS.VERIFIED) {
      verifiedFields.push({ field: f, result: res });
    } else if (res?.status === FILL_STATUS.INFERRED || res?.inferred) {
      inferredFields.push({ field: f, result: res });
    } else if (res?.status === FILL_STATUS.FAILED) {
      failedFields.push({ field: f, result: res });
    } else {
      untouchedFields.push({ field: f, result: res });
    }
  }

  const renderItem = (item, badgeClass, badgeLabel) => {
    const val = item.result?.value ?? item.field.currentValue ?? '';
    const displayVal = val !== '' ? String(val) : 'Empty';
    return `
      <div class="jc-review-item">
        <div class="jc-review-info">
          <div class="jc-review-label">${escapeHtml(item.field.label || item.field.id)}</div>
          <div class="jc-review-value" title="${escapeHtml(displayVal)}">${escapeHtml(displayVal)}</div>
        </div>
        <div class="jc-review-meta">
          <span class="jc-badge ${badgeClass}">${badgeLabel}</span>
          <button type="button" class="jc-btn jc-btn-secondary jc-btn-small jc-locate-field-btn" data-field-id="${escapeHtml(item.field.id)}" title="Scroll to and highlight field">
            ${ICONS.locate}
          </button>
        </div>
      </div>
    `;
  };

  return `
    <div class="jc-card">
      <div class="jc-row">
        <span class="jc-card-title">Field Verification & Review</span>
        <span class="jc-badge jc-badge-blue">${fields.length} FIELDS</span>
      </div>
      <div class="jc-row" style="gap: 6px; flex-wrap: wrap;">
        <span class="jc-badge jc-badge-green">${verifiedFields.length} VERIFIED</span>
        <span class="jc-badge jc-badge-amber">${inferredFields.length} INFERRED</span>
        <span class="jc-badge jc-badge-red">${failedFields.length} FAILED</span>
        <span class="jc-badge" style="background: var(--kr-bg-3); color: var(--kr-text-3);">${untouchedFields.length} UNTOUCHED</span>
      </div>
      <div class="jc-review-list" style="margin-top: 6px;">
        ${fields.length === 0 ? '<div style="font-size: 12px; color: var(--jc-text-muted); text-align: center; padding: 12px;">No form fields detected on this page.</div>' : ''}
        ${failedFields.map(i => renderItem(i, 'jc-badge-red', 'FAILED')).join('')}
        ${inferredFields.map(i => renderItem(i, 'jc-badge-amber', 'INFERRED')).join('')}
        ${verifiedFields.map(i => renderItem(i, 'jc-badge-green', 'VERIFIED')).join('')}
        ${untouchedFields.map(i => renderItem(i, '', 'UNTOUCHED')).join('')}
      </div>
    </div>
  `;
}

function renderHomeTab() {
  const status = getStatusInfo();
  const settings = getSettings();
  const currentHost = window.location.hostname;
  const fieldCount = detectedFieldsCache.length;
  const session = applicationState?.session;
  const job = session?.job;
  const page = classifyPage();

  // --- Workflow card: map session status to visual state ---
  const wfStatus = session?.status || '';
  const wfIsRunning = wfStatus === 'running' || wfStatus === 'submitting';
  const wfIsDone = ['review', 'confirmation'].includes(wfStatus);
  const wfIsPaused = wfStatus === 'paused';
  const wfIsWaiting = ['captcha', 'boundary'].includes(wfStatus) || ['captcha', 'boundary'].includes(page.type);
  const wfCardClass = wfIsRunning ? 'wf-running' : wfIsDone ? 'wf-done' : (wfIsPaused || wfIsWaiting) ? 'wf-paused' : '';

  let wfBadgeHtml;
  if (wfIsDone) {
    const doneLabel = wfStatus === 'confirmation' ? 'SUBMITTED' : 'READY FOR REVIEW';
    wfBadgeHtml = `<span class="jc-wf-badge jc-wf-badge-done">${ICONS.check} ${doneLabel}</span>`;
  } else if (wfIsRunning) {
    const runLabel = wfStatus === 'submitting' ? 'SUBMITTING' : 'RUNNING';
    wfBadgeHtml = `<span class="jc-wf-badge jc-wf-badge-running">${ICONS.play} ${runLabel}</span>`;
  } else if (wfIsWaiting) {
    const waitLabel = wfStatus === 'captcha' || page.type === 'captcha' ? 'CAPTCHA PAUSED' : 'MANUAL ACTION REQUIRED';
    wfBadgeHtml = `<span class="jc-wf-badge jc-wf-badge-paused">${ICONS.shield} ${waitLabel}</span>`;
  } else if (wfIsPaused) {
    wfBadgeHtml = `<span class="jc-wf-badge jc-wf-badge-paused">${ICONS.pause} PAUSED</span>`;
  } else {
    wfBadgeHtml = `<span class="jc-wf-badge jc-wf-badge-idle">NOT STARTED</span>`;
  }

  const stepsCompleted = session?.completedSteps || 0;
  const fieldsAnswered = session ? Object.keys(session.answers).length : 0;

  // Step progress bar: show proportional fill; pulse when running
  const stepBarPercent = stepsCompleted > 0 ? Math.min(stepsCompleted * 25, 100) : 0;
  const stepBarClass = wfIsDone ? 'wf-done' : wfIsRunning ? 'wf-pulse' : '';

  // Reason text (don't show the raw "status: reason" format)
  let wfReasonHtml = '';
  if (session && session.reason) {
    const isErr = wfIsPaused || wfIsWaiting;
    wfReasonHtml = `<div class="jc-wf-reason ${isErr ? 'wf-error' : ''}">${escapeHtml(session.reason)}</div>`;
  } else if (!session) {
    wfReasonHtml = `<div style="font-size:12px;color:var(--jc-text-secondary)">Capture a job listing, then start on its application page.</div>`;
  }

  // Job info (title + company + location, no URL)
  let wfJobHtml = '';
  if (job) {
    const companyText = (job.company || 'Company unknown') + (job.companyUncertain ? ' (uncertain)' : '');
    wfJobHtml = `<div>
      <div class="jc-wf-job-title">${escapeHtml(job.title)}</div>
      <div class="jc-wf-job-company">${escapeHtml(companyText)}${job.location ? ` · ${escapeHtml(job.location)}` : ''}</div>
    </div>`;
  }

  // Last error (only when there are errors and not already shown via reason)
  const lastError = session?.errors?.length ? session.errors.at(-1).message : '';
  const wfErrorHtml = lastError && !session.reason?.includes(lastError)
    ? `<div style="font-size:11px;color:var(--kr-warning);padding:6px 10px;background:rgba(242,184,75,0.08);border-radius:6px;border:1px solid rgba(242,184,75,0.25);">${ICONS.alert} ${escapeHtml(lastError)}</div>`
    : '';

  const workflowHtml = `<div class="jc-workflow-card ${wfCardClass}">
    <div class="jc-row">
      <span class="jc-card-title">Application Workflow</span>
      ${wfBadgeHtml}
    </div>
    ${wfJobHtml}
    ${session ? `<div class="jc-wf-step-bar-container"><div class="jc-wf-step-bar ${stepBarClass}" style="transform: scaleX(${stepBarPercent / 100});"></div></div>` : ''}
    ${session ? `<div class="jc-wf-metrics">
      <div class="jc-wf-metric"><strong>${stepsCompleted}</strong> step${stepsCompleted !== 1 ? 's' : ''} completed</div>
      <div class="jc-wf-metric"><strong>${fieldsAnswered}</strong> field${fieldsAnswered !== 1 ? 's' : ''} answered</div>
    </div>` : ''}
    ${wfReasonHtml}
    ${wfErrorHtml}
    <div class="jc-wf-actions">
      <button class="jc-btn jc-btn-secondary" id="jc-capture-job" ${isAutofilling || applicationEngine?.busy ? 'disabled' : ''}>Capture Job</button>
      <button class="jc-btn ${!session || wfIsRunning || wfIsDone || wfIsWaiting || isAutofilling ? 'jc-btn-secondary' : ''}" id="jc-start-application" ${isAutofilling || applicationEngine?.busy ? 'disabled' : ''}>${session ? 'Start / Resume' : 'Start Application'}</button>
      <button class="jc-btn jc-btn-secondary ${wfIsRunning ? 'jc-btn-pause-active' : ''}" id="jc-pause-application">Pause</button>
    </div>
  </div>`;

  let safetyBannerHtml = '';
  if (['captcha', 'boundary'].includes(page.type)) {
    safetyBannerHtml = `
      <div class="jc-safety-banner">
        <div class="jc-safety-icon">${ICONS.shield}</div>
        <div class="jc-safety-content">
          <div class="jc-safety-title">Safety Boundary Paused</div>
          <div class="jc-safety-desc">${escapeHtml(page.reason || 'Manual interaction or verification required on this page.')}</div>
        </div>
        <button class="jc-btn jc-btn-secondary jc-btn-small" id="jc-resume-boundary">Resume</button>
      </div>
    `;
  }

  let progressHtml = '';
  if (isAutofilling || autofillProgress.statusText) {
    const percent = autofillProgress.total > 0
      ? Math.round((autofillProgress.current / autofillProgress.total) * 100)
      : 0;

    progressHtml = `
      <div class="jc-card" style="border-color: rgba(163, 230, 53, 0.35);">
        <div class="jc-row">
          <span class="jc-card-title">Autofill Progress</span>
          <span style="font-family: var(--jc-font-mono); font-size: 11px; font-weight: 600; color: var(--kr-signal);">${autofillProgress.current} / ${autofillProgress.total}</span>
        </div>
        <div style="font-size: 12px; color: var(--jc-text-primary);">${escapeHtml(autofillProgress.statusText)}</div>
        <div class="jc-progress-bar-container">
          <div class="jc-progress-bar" style="transform: scaleX(${percent / 100});"></div>
        </div>
      </div>
    `;
  }

  let testResultHtml = '';
  if (lastAiTestResult) {
    if (lastAiTestResult.ok) {
      testResultHtml = `
        <div class="jc-alert jc-alert-success">
          <strong>${ICONS.check} AI Connected</strong> (${lastAiTestResult.latencyMs}ms)<br/>
          <span style="font-family: var(--jc-font-mono); font-size: 11px; color: var(--jc-text-secondary);">Model: ${lastAiTestResult.model}</span>
        </div>
      `;
    } else {
      testResultHtml = `
        <div class="jc-alert jc-alert-error">
          <strong>${ICONS.x} Connection Failed</strong> (${lastAiTestResult.latencyMs}ms)<br/>
          <span style="font-size: 11px;">${lastAiTestResult.error}</span>
        </div>
      `;
    }
  }

  const adapter = detectAdapter();
  return `
    ${safetyBannerHtml}
    ${session ? workflowHtml : ''}

    <div class="jc-card">
      <div class="jc-row">
        <span class="jc-card-title">Form Fields</span>
        <span class="jc-badge jc-badge-blue" style="text-transform: uppercase;">${fieldCount + remoteFieldCount} detected</span>
      </div>
      ${remoteFieldCount ? `
      <div style="font-size: 11px; color: var(--jc-text-secondary);">
        ${fieldCount} here, ${remoteFieldCount} in ${remoteFrameCount} embedded frame${remoteFrameCount === 1 ? '' : 's'}.
      </div>
      ` : ''}
      <div class="jc-row" style="margin-top: 4px; gap: 8px;">
        <button class="jc-btn jc-btn-large ${session ? 'jc-btn-secondary' : ''}" id="jc-autofill-btn" style="flex: 1;" ${isAutofilling ? 'disabled' : ''}>
          ${isAutofilling ? `${ICONS.play} Filling Fields...` : `${ICONS.play} Autofill This Page`}
        </button>
        <button class="jc-btn jc-btn-secondary ${isAutofilling ? 'jc-btn-pause-active' : ''}" id="jc-pause-autofill-btn" style="padding: 9px 14px; font-size: 12px;" ${!isAutofilling ? 'disabled' : ''} title="Pause / Stop autofill">
          ${isAutofilling ? `${ICONS.pause} Pause` : 'Pause'}
        </button>
        <button class="jc-btn jc-btn-secondary" id="jc-rescan-btn" title="Rescan page fields" style="padding: 9px 12px;">${ICONS.refresh}</button>
      </div>
    </div>

    ${!session ? workflowHtml : ''}
    ${progressHtml}
    ${renderFieldReviewSection()}

    <div class="jc-card">
      <div class="jc-row">
        <span class="jc-card-title">System Status</span>
        <span class="jc-badge ${status.badgeClass}">${status.label}</span>
      </div>
      <div style="font-size: 12px; color: var(--jc-text-secondary);">
        ${status.text}
      </div>
      <div class="jc-row" style="margin-top: 6px;">
        <span class="jc-label">Adapter</span>
        <span class="jc-val" style="font-family: var(--jc-font-mono); font-size: 11px;">${adapter.id === 'generic' ? 'generic fallback' : `${escapeHtml(adapter.label)} adapter`}</span>
      </div>
      <div class="jc-row">
        <span class="jc-label">Host</span>
        <span class="jc-val" style="font-family: var(--jc-font-mono); font-size: 11px;">${currentHost}</span>
      </div>
      <div class="jc-row">
        <span class="jc-label">Model</span>
        <span class="jc-val" style="font-family: var(--jc-font-mono); font-size: 11px;">${settings.model}</span>
      </div>
      <div class="jc-row" style="margin-top: 4px;">
        <button class="jc-btn jc-btn-secondary" id="jc-test-ai-btn" style="flex: 1;" ${isAiTesting ? 'disabled' : ''}>
          ${isAiTesting ? 'Testing...' : 'Test Connection'}
        </button>
      </div>
      ${testResultHtml}
    </div>
  `;
}


function renderProfileTab() {
  const profile = getProfile();
  const sections = PROFILE_SECTIONS.map((section, index) => `
    <details class="jc-profile-section" ${index === 0 ? 'open' : ''} style="border: 1px solid var(--jc-border-subtle); border-radius: var(--jc-radius-md); padding: 12px; background: rgba(255,255,255,0.02);">
      <summary style="cursor: pointer; font-weight: 600; color: var(--jc-text-primary); display: flex; align-items: center; justify-content: space-between;">
        <span>${escapeHtml(section.title)}</span>
        <span style="color: var(--jc-text-muted);">${ICONS.chevronDown}</span>
      </summary>
      <p style="font-size: 12px; color: var(--jc-text-secondary); margin: 8px 0 12px;">${escapeHtml(section.description)}</p>
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${section.fields.map(field => {
          const value = String(profile[field.name] || '');
          const id = `jc-profile-${field.name}`;
          const control = field.options
            ? `<select id="${id}" class="jc-input" name="${field.name}">
                <option value="">Not set</option>
                ${field.options.map(option => `<option value="${escapeHtml(option)}" ${option === value ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
              </select>`
            : `<input id="${id}" class="jc-input" type="${field.type || 'text'}" name="${field.name}" value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder || '')}" ${field.min !== undefined ? `min="${field.min}" step="${field.step}"` : ''} />`;
          return `<div class="jc-form-group"><label for="${id}">${escapeHtml(field.label)}</label>${control}</div>`;
        }).join('')}
      </div>
    </details>
  `).join('');

  return `
    <form id="jc-profile-form" style="display: flex; flex-direction: column; gap: 12px;">
      <div style="font-size: 12px; color: var(--jc-text-secondary);">Save common answers once. Explicit answers take priority over background notes.</div>
      <div class="jc-form-group">
        <label>Full Name</label>
        <input class="jc-input" type="text" name="fullName" value="${escapeHtml(profile.fullName)}" placeholder="e.g. Jane Doe" />
      </div>

      <div class="jc-row" style="gap: 10px;">
        <div class="jc-form-group" style="flex: 1;">
          <label>Email</label>
          <input class="jc-input" type="email" name="email" value="${escapeHtml(profile.email)}" placeholder="jane@example.com" />
        </div>
        <div class="jc-form-group" style="flex: 1;">
          <label>Phone</label>
          <input class="jc-input" type="tel" name="phone" value="${escapeHtml(profile.phone)}" placeholder="+1 555 123 4567" />
        </div>
      </div>

      <div class="jc-form-group">
        <label>Location</label>
        <input class="jc-input" type="text" name="location" value="${escapeHtml(profile.location)}" placeholder="e.g. San Francisco, CA" />
      </div>

      <div class="jc-form-group">
        <label>LinkedIn URL</label>
        <input class="jc-input" type="url" name="linkedin" value="${escapeHtml(profile.linkedin)}" placeholder="https://linkedin.com/in/..." />
      </div>

      <div class="jc-row" style="gap: 10px;">
        <div class="jc-form-group" style="flex: 1;">
          <label>GitHub URL</label>
          <input class="jc-input" type="url" name="github" value="${escapeHtml(profile.github)}" placeholder="https://github.com/..." />
        </div>
        <div class="jc-form-group" style="flex: 1;">
          <label>Portfolio URL</label>
          <input class="jc-input" type="url" name="portfolio" value="${escapeHtml(profile.portfolio)}" placeholder="https://..." />
        </div>
      </div>

      ${sections}

      <div style="padding: 10px 12px; border-radius: var(--jc-radius-sm); background: rgba(56,189,248,0.08); border: 1px solid rgba(56,189,248,0.2); font-size: 12px; color: var(--jc-text-secondary);">
        <strong style="color: var(--jc-text-primary);">Application source: LinkedIn</strong><br />Used for “How did you hear about us?” If LinkedIn is unavailable, the field is left for review.
      </div>

      <div class="jc-form-group">
        <label for="jc-profile-resumeContext">Resume / Background Summary</label>
        <textarea id="jc-profile-resumeContext" class="jc-textarea" name="resumeContext" rows="4" placeholder="Paste your core resume highlights, skills, and background summary...">${escapeHtml(profile.resumeContext)}</textarea>
      </div>

      <div class="jc-form-group">
        <label for="jc-profile-applicantNotes">Applicant Notes / Custom Rules</label>
        <textarea id="jc-profile-applicantNotes" class="jc-textarea" name="applicantNotes" rows="2" placeholder="Additional preferences, exceptions, and guidance for written answers...">${escapeHtml(profile.applicantNotes)}</textarea>
      </div>

      <div class="jc-row" style="margin-top: 4px;">
        <button class="jc-btn" type="submit" style="flex: 1;">Save Profile</button>
        <span class="jc-save-feedback" id="jc-profile-feedback">Saved ✓</span>
      </div>
    </form>
  `;
}

function renderApiKeyGroup() {
  const keySaved = hasApiKey();

  // Extension hosts keep the key in the background worker, so the panel never
  // collects it: the options page is a privileged context, the page is not.
  if (!platform.capabilities.writeSecretsInPage) {
    return `
      <div class="jc-form-group">
        <label>OpenRouter API Key</label>
        <div class="jc-row">
          <span class="jc-badge ${keySaved ? 'jc-badge-green' : 'jc-badge-amber'}">${keySaved ? 'Key saved' : 'No key'}</span>
          <button type="button" class="jc-btn jc-btn-secondary" id="jc-open-options" style="flex: 1;">Open extension options</button>
        </div>
        <span style="font-size: 11px; color: var(--jc-text-muted);">
          The key is stored by the extension and never enters this page.
        </span>
      </div>
    `;
  }

  return `
    <div class="jc-form-group">
      <label>OpenRouter API Key</label>
      <div class="jc-row">
        <input class="jc-input" id="jc-api-key-input" type="password" autocomplete="off" placeholder="${keySaved ? 'Key saved — enter replacement' : 'sk-or-v1-...'}" />
        <button type="button" class="jc-btn jc-btn-secondary" id="jc-toggle-key-btn" style="padding: 8px 10px;">${ICONS.eye}</button>
      </div>
      <span style="font-size: 11px; color: var(--jc-text-muted);">
        Saved key stays in userscript storage. Leave blank to keep it.
      </span>
    </div>
  `;
}

function renderSettingsTab() {
  const settings = getSettings();

  const modelOptions = POPULAR_MODELS.map((m) => {
    const selected = settings.model === m ? 'selected' : '';
    return `<option value="${m}" ${selected}>${m}</option>`;
  }).join('');

  return `
    <form id="jc-settings-form" style="display: flex; flex-direction: column; gap: 14px;">
      ${renderApiKeyGroup()}

      <div class="jc-form-group">
        <label>AI Model</label>
        <select class="jc-select" name="model" id="jc-model-select">
          ${modelOptions}
          <option value="custom" ${!POPULAR_MODELS.includes(settings.model) ? 'selected' : ''}>Custom Model...</option>
        </select>
        <input class="jc-input" id="jc-custom-model-input" type="text" placeholder="Enter custom model ID" value="${escapeHtml(settings.model)}" style="margin-top: 6px; display: ${!POPULAR_MODELS.includes(settings.model) ? 'block' : 'none'};" />
      </div>

      <div class="jc-card">
        <span class="jc-card-title">Behavior Controls</span>
        
        <div class="jc-toggle-row">
          <div>
            <div class="jc-label">AI Autofill</div>
            <div style="font-size: 11px; color: var(--jc-text-muted);">Enable AI form filling capabilities</div>
          </div>
          <label class="jc-switch">
            <input type="checkbox" name="autofillEnabled" ${settings.autofillEnabled ? 'checked' : ''} />
            <span class="jc-slider"></span>
          </label>
        </div>

        <div class="jc-toggle-row">
          <div>
            <div class="jc-label">Overwrite Existing Values</div>
            <div style="font-size: 11px; color: var(--jc-text-muted);">Overwrite non-empty fields on autofill</div>
          </div>
          <label class="jc-switch">
            <input type="checkbox" name="overwriteExisting" ${settings.overwriteExisting ? 'checked' : ''} />
            <span class="jc-slider"></span>
          </label>
        </div>

        <div class="jc-toggle-row">
          <div>
            <div class="jc-label">Auto Continue</div>
            <div style="font-size: 11px; color: var(--jc-text-muted);">Advance to next step on valid page</div>
          </div>
          <label class="jc-switch">
            <input type="checkbox" name="autoContinue" ${settings.autoContinue ? 'checked' : ''} />
            <span class="jc-slider"></span>
          </label>
        </div>

        <div class="jc-toggle-row">
          <div>
            <div class="jc-label">Auto Submit</div>
            <div style="font-size: 11px; color: var(--jc-text-muted);">Off by default. Submits only when every field is verified after a cancellable countdown.</div>
          </div>
          <label class="jc-switch">
            <input type="checkbox" name="autoSubmit" ${settings.autoSubmit ? 'checked' : ''} />
            <span class="jc-slider"></span>
          </label>
        </div>
      </div>

      <div class="jc-row" style="margin-top: 4px;">
        <button type="button" class="jc-btn jc-btn-secondary" id="jc-export-data" style="flex: 1;">Export backup JSON</button>
      </div>
      <p style="font-size: 11px; color: var(--jc-text-muted); margin: 0;">Profile, settings, memory, and job only. The API key is never included.</p>

      <div class="jc-row">
        <button class="jc-btn" type="submit" style="flex: 1;">Save Settings</button>
        <span class="jc-save-feedback" id="jc-settings-feedback">Saved ✓</span>
      </div>
    </form>
  `;
}

function renderDebugTab() {
  const state = getSanitizedState();
  const logs = logger.getLogs();
  const lastPageChange = applicationState?.session?.lastPageChange;

  const logsHtml = logs.length === 0
    ? '<span style="color: var(--jc-text-muted);">No debug logs recorded yet.</span>'
    : logs.slice().reverse().map((l) => {
        const time = l.timestamp.split('T')[1]?.slice(0, 8) || '';
        return `
          <div class="jc-log-item">
            <span class="jc-log-time">[${time}]</span>
            <span class="jc-log-level-${l.level}">[${l.level}]</span>
            <span>${escapeHtml(l.message)}</span>
          </div>
        `;
      }).join('');

  return `
    <div class="jc-card">
      <div class="jc-row">
        <span class="jc-card-title">System Information</span>
        <span class="jc-val" style="font-size: 11px;">v${state.version}</span>
      </div>
      <div class="jc-row">
        <span class="jc-label">API Key Stored</span>
        <span class="jc-badge ${state.hasApiKey ? 'jc-badge-green' : 'jc-badge-amber'}">
          ${state.hasApiKey ? 'Present (Isolated in Secrets)' : 'Not Configured'}
        </span>
      </div>
      <div class="jc-row">
        <span class="jc-label">Current Host</span>
        <span class="jc-val" style="font-size: 11px;">${state.host}</span>
      </div>
    </div>

    <div class="jc-card">
      <div class="jc-row">
        <span class="jc-card-title">Sanitized Settings</span>
      </div>
      <pre style="margin: 0; font-family: var(--jc-font-mono); font-size: 11px; color: var(--jc-text-secondary); background: rgba(11, 15, 25, 0.7); padding: 8px; border-radius: var(--jc-radius-sm); overflow-x: auto; border: 1px solid var(--jc-border-subtle);">${escapeHtml(JSON.stringify(state.settings, null, 2))}</pre>
    </div>

    <div class="jc-card">
      <div class="jc-row">
        <span class="jc-card-title">Regression Fixture</span>
        <button class="jc-btn jc-btn-secondary" id="jc-capture-fixture" style="padding: 4px 8px; font-size: 10px;">Save page fixture</button>
      </div>
      <div style="font-size: 11px; color: var(--jc-text-muted);">
        Downloads a sanitized copy of this page, including embedded frames, for the
        regression suite. Your answers, scripts, and inline handlers are removed.
      </div>
      <div style="font-size: 11px; color: var(--jc-text-secondary);" id="jc-capture-feedback"></div>
    </div>

    <div class="jc-card">
      ${lastPageChange ? `<div class="jc-row"><span class="jc-card-title">Last Workflow Change</span></div>
      <pre style="font-size: 11px; font-family: var(--jc-font-mono); white-space: pre-wrap; overflow-wrap: anywhere; color: var(--jc-text-secondary); background: rgba(11, 15, 25, 0.7); padding: 8px; border-radius: var(--jc-radius-sm); border: 1px solid var(--jc-border-subtle);">${escapeHtml(JSON.stringify(lastPageChange, null, 2))}</pre>` : ''}
      <div class="jc-row">
        <span class="jc-card-title">Recent Activity Logs (${logs.length})</span>
        <button class="jc-btn jc-btn-secondary" id="jc-clear-logs-btn" style="padding: 4px 8px; font-size: 10px;">Clear</button>
      </div>
      <div class="jc-log-box" id="jc-log-container">
        ${logsHtml}
      </div>
    </div>
  `;
}

function updatePanelDOM() {
  if (!shadowRootRef) return;

  const container = shadowRootRef.querySelector('.jc-widget-container');
  if (!container) return;

  const settings = getSettings();
  let panelHtml = '';

  if (panelVisible) {
    let tabContent = '';
    if (currentTab === 'home') tabContent = renderHomeTab();
    else if (currentTab === 'profile') tabContent = renderProfileTab();
    else if (currentTab === 'settings') tabContent = renderSettingsTab();
    else if (currentTab === 'debug') tabContent = renderDebugTab();

    panelHtml = `
      <div class="jc-panel" id="jc-main-panel">
        <div class="jc-header">
          <div class="jc-header-title">
            <span class="jc-brand-mark">${ICONS.brandMark}</span>
            <span>${VISUAL_NAME}</span>
            <span class="jc-version-tag">v${APP_VERSION}</span>
          </div>
          <div class="jc-header-actions">
            <span class="jc-model-chip" title="${escapeHtml(settings.model)}">${escapeHtml(settings.model)}</span>
            <button class="jc-close-btn" id="jc-close-panel-btn" title="Minimize panel">${ICONS.x}</button>
          </div>
        </div>

        <div class="jc-nav-tabs">
          <button class="jc-tab-btn ${currentTab === 'home' ? 'active' : ''}" data-tab="home">${ICONS.play} Run</button>
          <button class="jc-tab-btn ${currentTab === 'profile' ? 'active' : ''}" data-tab="profile">${ICONS.user} Profile</button>
          <button class="jc-tab-btn ${currentTab === 'settings' ? 'active' : ''}" data-tab="settings">${ICONS.settings} Settings</button>
          <button class="jc-tab-btn ${currentTab === 'debug' ? 'active' : ''}" data-tab="debug">${ICONS.terminal} Debug</button>
        </div>

        <div class="jc-content">
          ${tabContent}
        </div>
      </div>
    `;
  }

  setSafeHTML(container, `
    ${panelHtml}
    ${renderHud()}
  `);

  attachEventHandlers();
}

function attachEventHandlers() {
  if (!shadowRootRef) return;
  const capture = shadowRootRef.querySelector('#jc-capture-job');
  if (capture) capture.onclick = () => applicationEngine?.capture();
  const start = shadowRootRef.querySelector('#jc-start-application');
  if (start) start.onclick = () => void applicationEngine?.start();
  const pause = shadowRootRef.querySelector('#jc-pause-application');
  if (pause) {
    pause.onclick = () => {
      applicationEngine?.pause();
      if (isAutofilling) {
        stopAutofillFlow('Autofill paused by user. Progress and filled fields preserved.');
      }
    };
  }

  const resumeBoundary = shadowRootRef.querySelector('#jc-resume-boundary');
  if (resumeBoundary) {
    resumeBoundary.onclick = () => void applicationEngine?.start();
  }

  // Toggle button handlers
  const toggleBtn = shadowRootRef.querySelector('#jc-toggle-btn');
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      panelVisible = !panelVisible;
      if (panelVisible) refreshDetectedFields();
      updatePanelDOM();
    };
  }

  const expandBtn = shadowRootRef.querySelector('#jc-hud-expand-btn');
  if (expandBtn) {
    expandBtn.onclick = () => {
      panelVisible = !panelVisible;
      if (panelVisible) refreshDetectedFields();
      updatePanelDOM();
    };
  }

  // Pebble toggle
  const pebbleBtn = shadowRootRef.querySelector('#jc-pebble-toggle-btn');
  if (pebbleBtn) {
    pebbleBtn.onclick = () => {
      isPebble = !isPebble;
      if (isPebble) panelVisible = false;
      updatePanelDOM();
    };
  }

  // Close panel handler
  const closeBtn = shadowRootRef.querySelector('#jc-close-panel-btn');
  if (closeBtn) {
    closeBtn.onclick = () => {
      panelVisible = false;
      updatePanelDOM();
    };
  }

  // Tab navigation
  const tabBtns = shadowRootRef.querySelectorAll('.jc-tab-btn');
  tabBtns.forEach((btn) => {
    btn.onclick = () => {
      const targetTab = btn.getAttribute('data-tab');
      if (targetTab) {
        currentTab = targetTab;
        updatePanelDOM();
      }
    };
  });

  // Autofill button (in panel)
  const autofillBtn = shadowRootRef.querySelector('#jc-autofill-btn');
  if (autofillBtn) {
    autofillBtn.onclick = () => executeAutofillFlow();
  }

  // Autofill button (on compact HUD bar)
  const hudAutofillBtn = shadowRootRef.querySelector('#jc-hud-autofill-btn');
  if (hudAutofillBtn) {
    hudAutofillBtn.onclick = () => executeAutofillFlow();
  }

  // Autofill pause button (in panel)
  const pauseAutofillBtn = shadowRootRef.querySelector('#jc-pause-autofill-btn');
  if (pauseAutofillBtn) {
    pauseAutofillBtn.onclick = () => {
      stopAutofillFlow('Autofill paused by user. Progress and filled fields preserved.');
      applicationEngine?.pause();
    };
  }

  // Autofill pause button (on compact HUD bar)
  const hudPauseBtn = shadowRootRef.querySelector('#jc-hud-pause-btn');
  if (hudPauseBtn) {
    hudPauseBtn.onclick = () => {
      stopAutofillFlow('Autofill paused by user. Progress and filled fields preserved.');
      applicationEngine?.pause();
    };
  }

  // Locate field buttons on Review tab
  const locateBtns = shadowRootRef.querySelectorAll('.jc-locate-field-btn');
  locateBtns.forEach((btn) => {
    btn.onclick = () => {
      const fieldId = btn.getAttribute('data-field-id');
      const target = detectedFieldsCache.find((f) => f.id === fieldId);
      if (target?.element) {
        scrollToField(target.element);
        highlightActiveField(target.element);
      }
    };
  });

  // Rescan buttons
  const rescanBtn = shadowRootRef.querySelector('#jc-rescan-btn');
  if (rescanBtn) {
    rescanBtn.onclick = () => {
      refreshDetectedFields();
      logger.info(`Rescanned form: ${detectedFieldsCache.length} fields detected.`);
      updatePanelDOM();
    };
  }

  // Test AI button
  const testAiBtn = shadowRootRef.querySelector('#jc-test-ai-btn');
  if (testAiBtn) {
    testAiBtn.onclick = async () => {
      isAiTesting = true;
      updatePanelDOM();
      try {
        lastAiTestResult = await testConnection();
      } catch (err) {
        lastAiTestResult = { ok: false, error: err.message, latencyMs: 0 };
      } finally {
        isAiTesting = false;
        updatePanelDOM();
      }
    };
  }

  // Profile Form
  const profileForm = shadowRootRef.querySelector('#jc-profile-form');
  if (profileForm) {
    profileForm.onsubmit = (e) => {
      e.preventDefault();
      const formData = new FormData(profileForm);
      const newProfile = {
        ...getProfile(),
        ...Object.fromEntries(PROFILE_FIELDS.map(field => [field.name, String(formData.get(field.name) || '').trim()])),
        fullName: formData.get('fullName') || '',
        email: formData.get('email') || '',
        phone: formData.get('phone') || '',
        location: formData.get('location') || '',
        linkedin: formData.get('linkedin') || '',
        github: formData.get('github') || '',
        portfolio: formData.get('portfolio') || '',
        resumeContext: formData.get('resumeContext') || '',
        applicantNotes: formData.get('applicantNotes') || '',
      };
      saveProfile(newProfile);
      logger.info('Profile saved successfully.');

      const feedback = shadowRootRef.querySelector('#jc-profile-feedback');
      if (feedback) {
        feedback.style.display = 'inline';
        setTimeout(() => { feedback.style.display = 'none'; }, 2000);
      }
    };
  }

  // Settings Form
  const settingsForm = shadowRootRef.querySelector('#jc-settings-form');
  if (settingsForm) {
    const modelSelect = shadowRootRef.querySelector('#jc-model-select');
    const customInput = shadowRootRef.querySelector('#jc-custom-model-input');
    if (modelSelect && customInput) {
      modelSelect.onchange = () => {
        if (modelSelect.value === 'custom') {
          customInput.style.display = 'block';
        } else {
          customInput.style.display = 'none';
          customInput.value = modelSelect.value;
        }
      };
    }

    const openOptionsBtn = shadowRootRef.querySelector('#jc-open-options');
    if (openOptionsBtn) {
      openOptionsBtn.onclick = () => platform.openOptions();
    }

    const toggleKeyBtn = shadowRootRef.querySelector('#jc-toggle-key-btn');
    const apiKeyInput = shadowRootRef.querySelector('#jc-api-key-input');
    if (toggleKeyBtn && apiKeyInput) {
      toggleKeyBtn.onclick = () => {
        apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password';
        toggleKeyBtn.innerHTML = apiKeyInput.type === 'password' ? ICONS.eye : ICONS.eyeOff;
      };
    }

    const exportBtn = shadowRootRef.querySelector('#jc-export-data');
    if (exportBtn) exportBtn.onclick = () => exportUserBackup();

    settingsForm.onsubmit = (e) => {
      e.preventDefault();
      const formData = new FormData(settingsForm);

      let selectedModel = modelSelect?.value || 'google/gemini-2.0-flash';
      if (selectedModel === 'custom' && customInput) {
        selectedModel = customInput.value.trim() || 'google/gemini-2.0-flash';
      }

      const newSettings = {
        model: selectedModel,
        autofillEnabled: formData.get('autofillEnabled') === 'on',
        overwriteExisting: formData.get('overwriteExisting') === 'on',
        autoContinue: formData.get('autoContinue') === 'on',
        autoSubmit: formData.get('autoSubmit') === 'on',
      };

      saveSettings(newSettings);

      if (apiKeyInput?.value.trim()) {
        saveApiKey(apiKeyInput.value);
        apiKeyInput.value = '';
      }

      logger.info('Settings saved.');

      const feedback = shadowRootRef.querySelector('#jc-settings-feedback');
      if (feedback) {
        feedback.style.display = 'inline';
        setTimeout(() => { feedback.style.display = 'none'; }, 2000);
      }
    };
  }

  const captureFixtureBtn = shadowRootRef.querySelector('#jc-capture-fixture');
  if (captureFixtureBtn) {
    captureFixtureBtn.onclick = () => void saveFixtureSnapshot();
  }

  // Debug: Clear logs
  const clearLogsBtn = shadowRootRef.querySelector('#jc-clear-logs-btn');
  if (clearLogsBtn) {
    clearLogsBtn.onclick = () => {
      logger.clear();
      updatePanelDOM();
    };
  }
}

/**
 * Resolves who may mount `#job-copilot-root`. Extension wins over userscript.
 */
export function claimPanelHost(hostName) {
  let existing = document.getElementById(UI_IDS.CONTAINER);
  if (existing) {
    const owner = existing.getAttribute('data-jc-host') || '';
    if (owner === hostName) return { status: 'already-self', owner, root: existing };
    if (hostName === 'extension' && owner === 'userscript') {
      existing.remove();
      existing = null;
    } else {
      return { status: 'yield', owner, root: existing };
    }
  }

  const root = document.createElement('div');
  root.id = UI_IDS.CONTAINER;
  root.setAttribute('data-jc-host', hostName);
  root.style.position = 'absolute';
  root.style.top = '0';
  root.style.left = '0';
  root.style.zIndex = '2147483647';

  const target = document.body || document.documentElement;
  if (!target) return { status: 'yield', owner: null, root: null };

  target.appendChild(root);

  let winner = document.getElementById(UI_IDS.CONTAINER);
  if (winner !== root) {
    root.remove();
    const owner = winner?.getAttribute('data-jc-host') || '';
    if (hostName === 'extension' && owner === 'userscript') {
      winner.remove();
      target.appendChild(root);
      winner = document.getElementById(UI_IDS.CONTAINER);
    }
    if (winner !== root) {
      return { status: 'yield', owner: winner?.getAttribute('data-jc-host') || owner, root: winner };
    }
  }

  return { status: 'claimed', owner: hostName, root };
}

function watchPanelHostDisconnect(rootElement) {
  if (panelHostDisconnectObserver) {
    panelHostDisconnectObserver.disconnect();
    panelHostDisconnectObserver = null;
  }
  const parent = rootElement.parentNode;
  if (!parent) return;
  panelHostDisconnectObserver = new MutationObserver(() => {
    if (!rootElement.isConnected) {
      panelHostDisconnectObserver?.disconnect();
      panelHostDisconnectObserver = null;
      unmountUI();
    }
  });
  panelHostDisconnectObserver.observe(parent, { childList: true });
}

export function unmountUI() {
  if (panelHostDisconnectObserver) {
    panelHostDisconnectObserver.disconnect();
    panelHostDisconnectObserver = null;
  }
  applicationEngine?.destroy();
  applicationEngine = null;
  applicationState = null;
  stopFormObserver();
  shadowRootRef = null;
}

export function mountUI() {
  installPanelFonts();
  const hostName = getHostName();
  const claim = claimPanelHost(hostName);
  if (claim.status === 'yield') {
    logger.info(`Panel not mounted: "${claim.owner || 'unknown'}" host already owns this page.`);
    return;
  }
  if (claim.status === 'already-self') {
    if (claim.root?.shadowRoot && shadowRootRef) return;
  }

  const rootElement = claim.root;
  if (!rootElement) return;

  const shadow = rootElement.shadowRoot || rootElement.attachShadow({ mode: 'open' });
  shadowRootRef = shadow;

  if (!shadow.querySelector('style')) {
    const styleEl = document.createElement('style');
    styleEl.textContent = STYLES;
    shadow.appendChild(styleEl);
  }

  let container = shadow.querySelector('.jc-widget-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'jc-widget-container';
    shadow.appendChild(container);
  }

  watchPanelHostDisconnect(rootElement);

  const target = document.body || document.documentElement;
  if (target) {
    refreshDetectedFields();
    updatePanelDOM();
    initInlineRewriteBadge((targetInput) => {
      const field = detectedFieldsCache.find((f) => f.element === targetInput);
      if (field) {
        openRewriteModal(field);
      } else {
        openRewriteModal({
          id: targetInput.id || 'narrative_field',
          label: targetInput.getAttribute('aria-label') || targetInput.placeholder || 'Narrative Response',
          element: targetInput,
          currentValue: targetInput.value || '',
          isNarrative: true,
          constraints: {},
        });
      }
    });

    startFormObserver(() => {
      refreshDetectedFields();
      updatePanelDOM();
    });

    applicationEngine = createApplicationEngine({ onChange: state => {
      applicationState = state;
      for (const [id, result] of state.results) fieldResultsCache.set(id, result);
      refreshDetectedFields();
      updatePanelDOM();
    } });
    void applicationEngine.initialize();

    logger.info('Job Copilot Shadow DOM UI mounted successfully.');
  }
}

export function toggleUIVisibility() {
  panelVisible = !panelVisible;
  if (panelVisible) refreshDetectedFields();
  updatePanelDOM();
}
