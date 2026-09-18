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
import { platform } from './platform.js';
import { logger } from './debug.js';
import { testConnection, generateAutofillAnswers, rewriteNarrativeField } from './ai.js';
import { scanFormFields, harvestComboboxOptions } from './fields/scanner.js';
import { resolveComboboxSearchAnswers } from './autofill.js';
import { extractOptionLabel } from './fields/labels.js';
import { normalizeFieldsForAI } from './fields/normalize.js';
import { fillField } from './fields/fillers.js';
import { verifyField } from './fields/verify.js';
import {
  scrollToField,
  highlightActiveField,
  highlightVerifiedField,
  highlightFailedField,
  clearHighlights,
  initInlineRewriteBadge,
} from './fields/highlight.js';
import { startFormObserver, pauseFormObserver, resumeFormObserver } from './observer.js';
import { collectRemoteFields, applyRemoteAnswers, searchRemoteOptions, listRemoteFrames, isRemoteFieldId } from './remote.js';
import { createApplicationEngine } from './application.js';
import { classifyPage } from './pageClassifier.js';
import { rememberAnswer } from './memory.js';
import { saveSession } from './sessions.js';

let applicationEngine = null;
let applicationState = null;

function resolveLiveElement(field) {
  if (!field) return null;

  try {
    if (field.element && field.element.isConnected) {
      return field.element;
    }
  } catch {}

  if (field.id) {
    try {
      const byId = document.getElementById(field.id);
      if (byId && byId.isConnected) {
        field.element = byId;
        return byId;
      }
    } catch {}
  }

  if (field.selector) {
    try {
      const bySelector = document.querySelector(field.selector);
      if (bySelector && bySelector.isConnected) {
        field.element = bySelector;
        return bySelector;
      }
    } catch {}
  }

  if (field.name) {
    try {
      const byName = document.querySelector(`[name="${CSS.escape(field.name)}"]`);
      if (byName && byName.isConnected) {
        field.element = byName;
        return byName;
      }
    } catch {}
  }

  return field.element;
}

let shadowRootRef = null;
let currentTab = 'home';
let panelVisible = false;
let lastAiTestResult = null;
let isAiTesting = false;

// Autofill execution state
let isAutofilling = false;
let autofillProgress = { current: 0, total: 0, statusText: '' };
let detectedFieldsCache = [];
let remoteFieldCount = 0;
let remoteFrameCount = 0;
let fieldResultsCache = new Map(); // fieldId -> { status, value, error, inferred }

// Rewrite modal state
let activeRewriteField = null;
let isRewriting = false;
let rewriteFeedbackInput = '';

const STYLES = `
:host {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: #e2e8f0;
  box-sizing: border-box;
}

*, *::before, *::after {
  box-sizing: border-box;
}

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

.jc-pill-btn {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  color: #f8fafc;
  border: 1px solid #334155;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
  border-radius: 9999px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.jc-pill-btn:hover {
  transform: translateY(-2px);
  background: linear-gradient(135deg, #334155 0%, #1e293b 100%);
  border-color: #475569;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
}

.jc-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
}

.jc-status-dot.no-key {
  background: #f59e0b;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.6);
}

.jc-status-dot.error {
  background: #ef4444;
  box-shadow: 0 0 8px rgba(239, 68, 68, 0.6);
}

.jc-panel {
  pointer-events: auto;
  width: 450px;
  max-width: calc(100vw - 40px);
  height: 600px;
  max-height: calc(100vh - 80px);
  background: #0f172a;
  background-image: radial-gradient(at 0% 0%, rgba(30, 41, 59, 0.7) 0px, transparent 50%),
                    radial-gradient(at 100% 100%, rgba(15, 23, 42, 0.9) 0px, transparent 50%);
  border: 1px solid #334155;
  border-radius: 16px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: jc-slide-up 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes jc-slide-up {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.jc-header {
  padding: 14px 18px;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid #1e293b;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.jc-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 14px;
  color: #f8fafc;
}

.jc-version-tag {
  background: #1e293b;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #334155;
}

.jc-close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.jc-close-btn:hover {
  background: #1e293b;
  color: #f8fafc;
}

.jc-nav-tabs {
  display: flex;
  background: #090d16;
  border-bottom: 1px solid #1e293b;
  padding: 0 8px;
}

.jc-tab-btn {
  flex: 1;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
  padding: 10px 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: center;
}

.jc-tab-btn:hover {
  color: #f1f5f9;
}

.jc-tab-btn.active {
  color: #38bdf8;
  border-bottom-color: #38bdf8;
}

.jc-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.jc-content::-webkit-scrollbar {
  width: 6px;
}
.jc-content::-webkit-scrollbar-track {
  background: transparent;
}
.jc-content::-webkit-scrollbar-thumb {
  background: #334155;
  border-radius: 3px;
}

.jc-card {
  background: rgba(30, 41, 59, 0.4);
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.jc-card-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
}

.jc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.jc-label {
  font-size: 12px;
  color: #cbd5e1;
  font-weight: 500;
}

.jc-val {
  font-size: 12px;
  color: #f8fafc;
  font-weight: 600;
  word-break: break-all;
}

.jc-form-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.jc-form-group label {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.jc-input, .jc-select, .jc-textarea {
  width: 100%;
  background: #090d16;
  border: 1px solid #334155;
  border-radius: 8px;
  color: #f8fafc;
  padding: 8px 10px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.jc-input:focus, .jc-select:focus, .jc-textarea:focus {
  border-color: #38bdf8;
  box-shadow: 0 0 0 1px #38bdf8;
}

.jc-textarea {
  min-height: 70px;
  resize: vertical;
}

.jc-btn {
  background: #2563eb;
  color: #ffffff;
  border: none;
  border-radius: 8px;
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.15s ease;
}

.jc-btn:hover {
  background: #1d4ed8;
}

.jc-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.jc-btn-large {
  padding: 12px 18px;
  font-size: 13px;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
}

.jc-btn-large:hover {
  background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
  box-shadow: 0 6px 18px rgba(37, 99, 235, 0.5);
}

.jc-btn-secondary {
  background: #1e293b;
  color: #cbd5e1;
  border: 1px solid #334155;
}

.jc-btn-secondary:hover {
  background: #334155;
  color: #f8fafc;
}

.jc-btn-small {
  padding: 4px 8px;
  font-size: 11px;
  border-radius: 6px;
}

.jc-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid rgba(51, 65, 85, 0.3);
}

.jc-toggle-row:last-child {
  border-bottom: none;
}

.jc-switch {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
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
  background-color: #334155;
  transition: 0.2s;
  border-radius: 20px;
}

.jc-slider:before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: 0.2s;
  border-radius: 50%;
}

input:checked + .jc-slider {
  background-color: #2563eb;
}

input:checked + .jc-slider:before {
  transform: translateX(16px);
}

.jc-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}

.jc-badge-green {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.jc-badge-amber {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.jc-badge-red {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.jc-badge-blue {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.jc-alert {
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.4;
}

.jc-alert-success {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #a7f3d0;
}

.jc-alert-error {
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fecaca;
}

.jc-log-box {
  background: #090d16;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 8px;
  max-height: 180px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.jc-log-item {
  line-height: 1.3;
  word-break: break-all;
}

.jc-log-time {
  color: #64748b;
  margin-right: 4px;
}

.jc-log-level-INFO { color: #38bdf8; }
.jc-log-level-WARN { color: #fbbf24; }
.jc-log-level-ERROR { color: #f87171; }
.jc-log-level-DEBUG { color: #94a3b8; }

.jc-save-feedback {
  font-size: 11px;
  color: #34d399;
  display: none;
}

.jc-progress-bar-container {
  width: 100%;
  height: 6px;
  background: #1e293b;
  border-radius: 3px;
  overflow: hidden;
  margin-top: 4px;
}

.jc-progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #2563eb);
  transition: width 0.2s ease;
}

.jc-field-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  background: #090d16;
  border: 1px solid #1e293b;
  border-radius: 8px;
}

.jc-field-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.jc-field-name {
  font-weight: 600;
  font-size: 12px;
  color: #f1f5f9;
}

.jc-field-val-preview {
  font-size: 11px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.jc-modal-overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(4px);
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.jc-modal {
  width: 100%;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.jc-workflow-card {
  background: rgba(30, 41, 59, 0.4);
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 14px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-left: 3px solid #475569;
  transition: border-color 0.3s ease;
}

.jc-workflow-card.wf-running {
  border-left-color: #38bdf8;
}

.jc-workflow-card.wf-paused {
  border-left-color: #f59e0b;
}

.jc-workflow-card.wf-done {
  border-left-color: #10b981;
}

.jc-wf-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.jc-wf-badge-running {
  background: rgba(56, 189, 248, 0.15);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.35);
  animation: jc-pulse-badge 1.8s ease-in-out infinite;
}

.jc-wf-badge-paused {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.35);
}

.jc-wf-badge-done {
  background: rgba(16, 185, 129, 0.18);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.4);
  font-size: 12px;
  padding: 4px 12px;
  box-shadow: 0 0 12px rgba(16, 185, 129, 0.15);
}

.jc-wf-badge-idle {
  background: rgba(100, 116, 139, 0.15);
  color: #94a3b8;
  border: 1px solid rgba(100, 116, 139, 0.3);
}

@keyframes jc-pulse-badge {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.jc-wf-job-title {
  font-size: 13px;
  font-weight: 600;
  color: #f1f5f9;
  line-height: 1.3;
}

.jc-wf-job-company {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}

.jc-wf-reason {
  font-size: 12px;
  color: #cbd5e1;
  line-height: 1.4;
  padding: 6px 8px;
  background: rgba(15, 23, 42, 0.6);
  border-radius: 6px;
  border-left: 2px solid #475569;
}

.jc-wf-reason.wf-error {
  border-left-color: #f59e0b;
  color: #fde68a;
}

.jc-wf-metrics {
  display: flex;
  gap: 16px;
  font-size: 12px;
}

.jc-wf-metric {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #94a3b8;
}

.jc-wf-metric strong {
  color: #e2e8f0;
  font-weight: 700;
}

.jc-wf-step-bar-container {
  width: 100%;
  height: 4px;
  background: #1e293b;
  border-radius: 2px;
  overflow: hidden;
}

.jc-wf-step-bar {
  height: 100%;
  background: linear-gradient(90deg, #38bdf8, #2563eb);
  border-radius: 2px;
  transition: width 0.4s ease;
  min-width: 0;
}

.jc-wf-step-bar.wf-pulse {
  animation: jc-bar-pulse 1.5s ease-in-out infinite;
}

.jc-wf-step-bar.wf-done {
  background: linear-gradient(90deg, #34d399, #10b981);
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
  padding: 10px 14px;
  font-size: 12px;
}

.jc-wf-actions .jc-btn:first-child {
  flex: 0 0 auto;
}

.jc-btn-pause-active {
  background: rgba(245, 158, 11, 0.18) !important;
  color: #fbbf24 !important;
  border-color: rgba(245, 158, 11, 0.45) !important;
  animation: jc-pulse-badge 1.8s ease-in-out infinite;
}

.jc-btn-pause-active:hover {
  background: rgba(245, 158, 11, 0.3) !important;
  color: #fef3c7 !important;
  border-color: rgba(245, 158, 11, 0.6) !important;
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
    const settings = getSettings();
    const overwrite = Boolean(settings.overwriteExisting);

    const targetFields = detectedFieldsCache.filter((f) => {
      if (overwrite) return true;
      const val = f.currentValue;
      return !val || val === 'false' || val === '0' || String(val).trim().length === 0;
    });

    // An embedded application (a Greenhouse or Ashby iframe, for example) leaves
    // this document with zero fields while the real form sits one origin away.
    autofillProgress.statusText = 'Checking embedded frames...';
    updatePanelDOM();
    const remoteGroups = await collectRemoteFields({ overwriteExisting: overwrite });
    if (token !== autofillGeneration) return;
    const remoteFields = remoteGroups.flatMap((group) => group.fields);

    if (targetFields.length === 0 && remoteFields.length === 0) {
      autofillProgress.statusText = detectedFieldsCache.length === 0
        ? 'No form fields detected on this page.'
        : 'All fields are already filled. Enable "Overwrite Existing Values" in Settings to overwrite.';
      logger.info(autofillProgress.statusText);
      isAutofilling = false;
      updatePanelDOM();
      return;
    }

    if (token !== autofillGeneration) return;

    autofillProgress.total = targetFields.length + remoteFields.length;
    autofillProgress.statusText = 'Harvesting combobox options...';
    updatePanelDOM();

    // Read each field's unfiltered options before asking AI to choose an exact label.
    await harvestComboboxOptions(targetFields);
    if (token !== autofillGeneration) return;

    autofillProgress.statusText = `Generating answers with AI (${settings.model})...`;
    updatePanelDOM();

    // Embedded frames contribute to the same request, so a page split across
    // origins still costs one primary AI call.
    const normalized = [
      ...normalizeFieldsForAI(targetFields, { overwriteExisting: overwrite }),
      ...remoteFields,
    ];
    let aiResponse = await generateAutofillAnswers(normalized);
    if (token !== autofillGeneration) return;
    if (window.location.href !== runUrl) throw new Error('Page changed during autofill. Inspect the current step before retrying.');
    if (['captcha', 'boundary', 'confirmation'].includes(classifyPage().type)) throw new Error(classifyPage().reason);
    if (aiResponse.answers.some(answer => answer.searchQuery)) {
      autofillProgress.statusText = 'Searching for missing combobox options...';
      updatePanelDOM();
      aiResponse = await resolveComboboxSearchAnswers(targetFields, aiResponse);
      if (token !== autofillGeneration) return;
      aiResponse = await resolveRemoteSearchAnswers(aiResponse);
      if (token !== autofillGeneration) return;
    }
    const answersMap = new Map(aiResponse.answers.map((a) => [a.fieldId, a]));

    logger.info(`Starting progressive fill of ${targetFields.length} local and ${remoteFields.length} embedded fields...`);

    let filledCount = 0;
    let failedCount = 0;

    for (let i = 0; i < targetFields.length; i++) {
      if (token !== autofillGeneration) break;
      if (window.location.href !== runUrl) throw new Error('Page changed during autofill. Inspect the current step before retrying.');
      if (['captcha', 'boundary', 'confirmation'].includes(classifyPage().type)) throw new Error(classifyPage().reason);
      const field = targetFields[i];
      autofillProgress.current = i + 1;
      autofillProgress.statusText = `Filling ${i + 1} of ${targetFields.length}: "${field.label}"`;
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
    logger.info(`Autofill finished: ${filledCount} verified, ${failedCount} failed out of ${targetFields.length + remoteFields.length} fields.`);
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

function openRewriteModal(field) {
  activeRewriteField = field;
  rewriteFeedbackInput = '';
  panelVisible = true;
  updatePanelDOM();
}

async function executeFieldRewrite(feedback) {
  if (!activeRewriteField) return;

  isRewriting = true;
  updatePanelDOM();

  try {
    const field = activeRewriteField;
    field.element = resolveLiveElement(field);
    const currentVal = field.element?.value || field.currentValue || '';

    const rewritten = await rewriteNarrativeField({
      fieldLabel: field.label,
      currentValue: currentVal,
      feedback,
      constraints: field.constraints,
    });

    if (rewritten) {
      scrollToField(field.element);
      await fillField(field, rewritten);
      highlightVerifiedField(field.element);

      fieldResultsCache.set(field.id, {
        status: FILL_STATUS.VERIFIED,
        value: rewritten,
      });

      logger.info(`Rewrote and updated field "${field.label}"`);
    }

    activeRewriteField = null;
  } catch (err) {
    logger.error('Rewrite failed:', err);
    alert(`Rewrite Error: ${err.message}`);
  } finally {
    isRewriting = false;
    refreshDetectedFields();
    updatePanelDOM();
  }
}

function renderPill() {
  const status = getStatusInfo();
  const fieldCount = detectedFieldsCache.length;
  const countBadge = fieldCount > 0 ? `<span class="jc-badge jc-badge-blue" style="padding: 1px 5px; font-size: 10px;">${fieldCount}</span>` : '';

  return `
    <div class="jc-pill-btn" id="jc-toggle-btn" title="Toggle Job Copilot Panel">
      <div class="jc-status-dot ${status.dotClass}"></div>
      <span>Job Copilot</span>
      ${countBadge}
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
  // --- Workflow card: map session status to visual state ---
  const wfStatus = session?.status || '';
  const wfIsRunning = wfStatus === 'running';
  const wfIsDone = ['review', 'confirmation'].includes(wfStatus);
  const wfIsPaused = wfStatus === 'paused';
  const wfIsWaiting = ['captcha', 'boundary'].includes(wfStatus);
  const wfCardClass = wfIsRunning ? 'wf-running' : wfIsDone ? 'wf-done' : (wfIsPaused || wfIsWaiting) ? 'wf-paused' : '';

  let wfBadgeHtml;
  if (wfIsDone) {
    const doneLabel = wfStatus === 'confirmation' ? '✓ Submitted' : '✓ Done — Ready for Review';
    wfBadgeHtml = `<span class="jc-wf-badge jc-wf-badge-done">${doneLabel}</span>`;
  } else if (wfIsRunning) {
    wfBadgeHtml = `<span class="jc-wf-badge jc-wf-badge-running">● Running</span>`;
  } else if (wfIsWaiting) {
    const waitLabel = wfStatus === 'captcha' ? '⏸ CAPTCHA' : '⏸ Manual Step Required';
    wfBadgeHtml = `<span class="jc-wf-badge jc-wf-badge-paused">${waitLabel}</span>`;
  } else if (wfIsPaused) {
    wfBadgeHtml = `<span class="jc-wf-badge jc-wf-badge-paused">⏸ Paused</span>`;
  } else {
    wfBadgeHtml = `<span class="jc-wf-badge jc-wf-badge-idle">Not Started</span>`;
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
    wfReasonHtml = `<div style="font-size:12px;color:#94a3b8">Capture a job listing, then start on its application page.</div>`;
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
    ? `<div style="font-size:11px;color:#fbbf24;padding:4px 8px;background:rgba(245,158,11,0.08);border-radius:6px">⚠ ${escapeHtml(lastError)}</div>`
    : '';

  const workflowHtml = `<div class="jc-workflow-card ${wfCardClass}">
    <div class="jc-row">
      <span class="jc-card-title">Multi-Step Application</span>
      ${wfBadgeHtml}
    </div>
    ${wfJobHtml}
    ${session ? `<div class="jc-wf-step-bar-container"><div class="jc-wf-step-bar ${stepBarClass}" style="width:${stepBarPercent}%"></div></div>` : ''}
    ${session ? `<div class="jc-wf-metrics">
      <div class="jc-wf-metric">📋 <strong>${stepsCompleted}</strong> step${stepsCompleted !== 1 ? 's' : ''} completed</div>
      <div class="jc-wf-metric">✏️ <strong>${fieldsAnswered}</strong> field${fieldsAnswered !== 1 ? 's' : ''} answered</div>
    </div>` : ''}
    ${wfReasonHtml}
    ${wfErrorHtml}
    <div class="jc-wf-actions">
      <button class="jc-btn jc-btn-secondary" id="jc-capture-job" ${isAutofilling || applicationEngine?.busy ? 'disabled' : ''}>Capture Job</button>
      <button class="jc-btn" id="jc-start-application" ${isAutofilling || applicationEngine?.busy ? 'disabled' : ''}>${session ? 'Start / Resume' : 'Start Application'}</button>
      <button class="jc-btn jc-btn-secondary ${wfIsRunning ? 'jc-btn-pause-active' : ''}" id="jc-pause-application">Pause</button>
    </div>
  </div>`;

  let progressHtml = '';
  if (isAutofilling || autofillProgress.statusText) {
    const percent = autofillProgress.total > 0
      ? Math.round((autofillProgress.current / autofillProgress.total) * 100)
      : 0;

    progressHtml = `
      <div class="jc-card" style="border-color: #2563eb;">
        <div class="jc-row">
          <span class="jc-card-title">Autofill Progress</span>
          <span style="font-size: 11px; font-weight: 600; color: #38bdf8;">${autofillProgress.current} / ${autofillProgress.total}</span>
        </div>
        <div style="font-size: 12px; color: #f8fafc;">${escapeHtml(autofillProgress.statusText)}</div>
        <div class="jc-progress-bar-container">
          <div class="jc-progress-bar" style="width: ${percent}%;"></div>
        </div>
      </div>
    `;
  }

  let testResultHtml = '';
  if (lastAiTestResult) {
    if (lastAiTestResult.ok) {
      testResultHtml = `
        <div class="jc-alert jc-alert-success">
          <strong>✓ AI Connected</strong> (${lastAiTestResult.latencyMs}ms)<br/>
          <span style="font-size: 11px; color: #cbd5e1;">Model: ${lastAiTestResult.model}</span>
        </div>
      `;
    } else {
      testResultHtml = `
        <div class="jc-alert jc-alert-error">
          <strong>✗ Connection Failed</strong> (${lastAiTestResult.latencyMs}ms)<br/>
          <span style="font-size: 11px;">${lastAiTestResult.error}</span>
        </div>
      `;
    }
  }

  return `
    <div class="jc-card">
      <div class="jc-row">
        <span class="jc-card-title">Status</span>
        <span class="jc-badge ${status.badgeClass}">${status.label}</span>
      </div>
      <div style="font-size: 12px; color: #94a3b8;">
        ${status.text}
      </div>
    </div>

    <div class="jc-card">
      <div class="jc-row">
        <span class="jc-card-title">Page Form Fields</span>
        <span class="jc-badge jc-badge-blue">${fieldCount + remoteFieldCount} detected</span>
      </div>
      ${remoteFieldCount ? `
      <div style="font-size: 11px; color: #94a3b8;">
        ${fieldCount} here, ${remoteFieldCount} in ${remoteFrameCount} embedded frame${remoteFrameCount === 1 ? '' : 's'}.
      </div>
      ` : ''}
      <div class="jc-row" style="margin-top: 4px; gap: 8px;">
        <button class="jc-btn jc-btn-large" id="jc-autofill-btn" style="flex: 1;" ${isAutofilling ? 'disabled' : ''}>
          ${isAutofilling ? '⚡ Filling Fields...' : '⚡ Autofill This Page'}
        </button>
        <button class="jc-btn jc-btn-secondary ${isAutofilling ? 'jc-btn-pause-active' : ''}" id="jc-pause-autofill-btn" style="padding: 10px 14px; font-size: 12px;" ${!isAutofilling ? 'disabled' : ''} title="Pause / Stop autofill">
          ${isAutofilling ? '⏸ Pause' : 'Pause'}
        </button>
        <button class="jc-btn jc-btn-secondary" id="jc-rescan-btn" title="Rescan page fields" style="padding: 10px 12px;">🔄</button>
      </div>
    </div>

    ${workflowHtml}
    ${progressHtml}

    <div class="jc-card">
      <span class="jc-card-title">Context & Connectivity</span>
      <div class="jc-row">
        <span class="jc-label">Host</span>
        <span class="jc-val">${currentHost}</span>
      </div>
      <div class="jc-row">
        <span class="jc-label">Model</span>
        <span class="jc-val" style="font-family: monospace; font-size: 11px;">${settings.model}</span>
      </div>
      <div class="jc-row" style="margin-top: 4px;">
        <button class="jc-btn jc-btn-secondary" id="jc-test-ai-btn" style="flex: 1;" ${isAiTesting ? 'disabled' : ''}>
          ${isAiTesting ? 'Testing...' : 'Test AI Connection'}
        </button>
      </div>
      ${testResultHtml}
    </div>
  `;
}

function renderReviewTab() {
  if (detectedFieldsCache.length === 0) {
    return `
      <div class="jc-card">
        <div style="text-align: center; color: #94a3b8; padding: 20px 0;">
          No form fields detected on this page.<br/>
          <button class="jc-btn jc-btn-secondary" id="jc-rescan-review-btn" style="margin: 12px auto 0;">🔄 Rescan Form</button>
        </div>
      </div>
    `;
  }

  const fieldRows = detectedFieldsCache.map((field) => {
    const result = fieldResultsCache.get(field.id);
    let statusBadge = '<span class="jc-badge" style="background: #1e293b; color: #94a3b8;">Pending</span>';

    if (result) {
      if (result.status === FILL_STATUS.VERIFIED) {
        statusBadge = '<span class="jc-badge jc-badge-green">Verified ✓</span>';
      } else if (result.status === FILL_STATUS.INFERRED) {
        statusBadge = '<span class="jc-badge jc-badge-amber">Review ⚠️</span>';
      } else if (result.status === FILL_STATUS.FAILED) {
        statusBadge = '<span class="jc-badge jc-badge-red">Failed ✗</span>';
      } else if (result.status === FILL_STATUS.SKIPPED) {
        statusBadge = '<span class="jc-badge" style="background: #334155; color: #94a3b8;">Skipped</span>';
      }
    }

    let currentVal = '';
    if (field.type === FIELD_TYPES.RADIO) {
      const radios = field.elements || [field.element];
      const checkedRadio = radios.find((r) => r.checked);
      currentVal = checkedRadio ? (extractOptionLabel(checkedRadio) || checkedRadio.value) : '';
    } else if (field.type === FIELD_TYPES.CHECKBOX) {
      currentVal = field.element?.checked ? 'Checked ✓' : 'Unchecked';
    } else if (field.type === FIELD_TYPES.SELECT) {
      const sel = field.element;
      const opt = sel?.options?.[sel?.selectedIndex];
      currentVal = opt && opt.value !== '' ? (opt.text.trim() || opt.value) : '';
    } else {
      currentVal = field.element?.value || field.element?.textContent || field.currentValue || '';
    }

    const rewriteBtn = field.isNarrative
      ? `<button class="jc-btn jc-btn-secondary jc-btn-small jc-field-rewrite-btn" data-field-id="${field.id}">✨ Rewrite</button>`
      : '';

    return `
      <div class="jc-field-row">
        <div class="jc-field-header">
          <span class="jc-field-name">${escapeHtml(field.label || field.id)}</span>
          <div style="display: flex; align-items: center; gap: 6px;">
            ${statusBadge}
            ${rewriteBtn}
          </div>
        </div>
        <div class="jc-field-val-preview">${escapeHtml(currentVal || '(empty)')}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="jc-row" style="margin-bottom: 4px;">
      <span class="jc-card-title">Form Fields (${detectedFieldsCache.length})</span>
      <button class="jc-btn jc-btn-secondary jc-btn-small" id="jc-rescan-review-btn">🔄 Rescan</button>
    </div>
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${fieldRows}
    </div>
  `;
}

function renderProfileTab() {
  const profile = getProfile();
  const sections = PROFILE_SECTIONS.map((section, index) => `
    <details class="jc-profile-section" ${index === 0 ? 'open' : ''} style="border: 1px solid #334155; border-radius: 10px; padding: 12px;">
      <summary style="cursor: pointer; font-weight: 600;">${escapeHtml(section.title)}</summary>
      <p style="font-size: 12px; color: #94a3b8; margin: 8px 0 12px;">${escapeHtml(section.description)}</p>
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
      <div style="font-size: 12px; color: #94a3b8;">Save common answers once. Explicit answers take priority over background notes.</div>
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

      <div style="padding: 10px 12px; border-radius: 8px; background: rgba(59,130,246,0.1); font-size: 12px;">
        <strong>Application source: LinkedIn</strong><br />Used for “How did you hear about us?” If LinkedIn is unavailable, the field is left for review.
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
        <span style="font-size: 11px; color: #64748b;">
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
        <button type="button" class="jc-btn jc-btn-secondary" id="jc-toggle-key-btn" style="padding: 8px 10px;">👁</button>
      </div>
      <span style="font-size: 11px; color: #64748b;">
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
            <div style="font-size: 11px; color: #64748b;">Enable AI form filling capabilities</div>
          </div>
          <label class="jc-switch">
            <input type="checkbox" name="autofillEnabled" ${settings.autofillEnabled ? 'checked' : ''} />
            <span class="jc-slider"></span>
          </label>
        </div>

        <div class="jc-toggle-row">
          <div>
            <div class="jc-label">Overwrite Existing Values</div>
            <div style="font-size: 11px; color: #64748b;">Overwrite non-empty fields on autofill</div>
          </div>
          <label class="jc-switch">
            <input type="checkbox" name="overwriteExisting" ${settings.overwriteExisting ? 'checked' : ''} />
            <span class="jc-slider"></span>
          </label>
        </div>

        <div class="jc-toggle-row">
          <div>
            <div class="jc-label">Auto Continue</div>
            <div style="font-size: 11px; color: #64748b;">Advance to next step on valid page (Phase 3)</div>
          </div>
          <label class="jc-switch">
            <input type="checkbox" name="autoContinue" ${settings.autoContinue ? 'checked' : ''} />
            <span class="jc-slider"></span>
          </label>
        </div>

        <div class="jc-toggle-row">
          <div>
            <div class="jc-label">Auto Submit</div>
            <div style="font-size: 11px; color: #64748b;">Final submission stays manual in Phase 3</div>
          </div>
          <label class="jc-switch">
            <input type="checkbox" name="autoSubmit" disabled />
            <span class="jc-slider"></span>
          </label>
        </div>
      </div>

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
    ? '<span style="color: #64748b;">No debug logs recorded yet.</span>'
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
      <pre style="margin: 0; font-family: monospace; font-size: 11px; color: #94a3b8; background: #090d16; padding: 8px; border-radius: 6px; overflow-x: auto;">${escapeHtml(JSON.stringify(state.settings, null, 2))}</pre>
    </div>

    <div class="jc-card">
      ${lastPageChange ? `<div class="jc-row"><span class="jc-card-title">Last Workflow Change</span></div>
      <pre style="font-size: 11px; white-space: pre-wrap; overflow-wrap: anywhere;">${escapeHtml(JSON.stringify(lastPageChange, null, 2))}</pre>` : ''}
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

function renderRewriteModal() {
  if (!activeRewriteField) return '';

  const currentVal = activeRewriteField.element?.value || activeRewriteField.currentValue || '';

  return `
    <div class="jc-modal-overlay" id="jc-rewrite-modal-overlay">
      <div class="jc-modal">
        <div class="jc-row">
          <strong style="font-size: 13px; color: #f8fafc;">✨ Rewrite Response</strong>
          <button class="jc-close-btn" id="jc-cancel-rewrite-btn">✕</button>
        </div>
        <div style="font-size: 11px; color: #94a3b8;">
          <strong>Field:</strong> ${escapeHtml(activeRewriteField.label)}
        </div>
        <div class="jc-form-group">
          <label>Current Text</label>
          <div style="max-height: 80px; overflow-y: auto; background: #090d16; padding: 6px 8px; border-radius: 6px; font-size: 11px; color: #cbd5e1;">
            ${escapeHtml(currentVal || '(empty)')}
          </div>
        </div>
        <div class="jc-form-group">
          <label>Revision Feedback / Custom Instructions</label>
          <input class="jc-input" id="jc-rewrite-feedback-input" type="text" placeholder="e.g. Make it more concise, emphasize cloud leadership" />
        </div>
        <div class="jc-row" style="margin-top: 6px;">
          <button class="jc-btn jc-btn-secondary" id="jc-cancel-rewrite-btn-2" style="flex: 1;">Cancel</button>
          <button class="jc-btn" id="jc-submit-rewrite-btn" style="flex: 1;" ${isRewriting ? 'disabled' : ''}>
            ${isRewriting ? 'Generating...' : '✨ Rewrite & Replace'}
          </button>
        </div>
      </div>
    </div>
  `;
}

function updatePanelDOM() {
  if (!shadowRootRef) return;

  const container = shadowRootRef.querySelector('.jc-widget-container');
  if (!container) return;

  let panelHtml = '';
  if (panelVisible) {
    let tabContent = '';
    if (currentTab === 'home') tabContent = renderHomeTab();
    else if (currentTab === 'review') tabContent = renderReviewTab();
    else if (currentTab === 'profile') tabContent = renderProfileTab();
    else if (currentTab === 'settings') tabContent = renderSettingsTab();
    else if (currentTab === 'debug') tabContent = renderDebugTab();

    panelHtml = `
      <div class="jc-panel" id="jc-main-panel">
        <div class="jc-header">
          <div class="jc-header-title">
            <span>✨</span>
            <span>${APP_NAME}</span>
            <span class="jc-version-tag">v${APP_VERSION}</span>
          </div>
          <button class="jc-close-btn" id="jc-close-panel-btn" title="Minimize panel">✕</button>
        </div>

        <div class="jc-nav-tabs">
          <button class="jc-tab-btn ${currentTab === 'home' ? 'active' : ''}" data-tab="home">Home</button>
          <button class="jc-tab-btn ${currentTab === 'review' ? 'active' : ''}" data-tab="review">Review</button>
          <button class="jc-tab-btn ${currentTab === 'profile' ? 'active' : ''}" data-tab="profile">Profile</button>
          <button class="jc-tab-btn ${currentTab === 'settings' ? 'active' : ''}" data-tab="settings">Settings</button>
          <button class="jc-tab-btn ${currentTab === 'debug' ? 'active' : ''}" data-tab="debug">Debug</button>
        </div>

        <div class="jc-content">
          ${tabContent}
        </div>

        ${renderRewriteModal()}
      </div>
    `;
  }

  setSafeHTML(container, `
    ${panelHtml}
    ${renderPill()}
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

  // Toggle button handler
  const toggleBtn = shadowRootRef.querySelector('#jc-toggle-btn');
  if (toggleBtn) {
    toggleBtn.onclick = () => {
      panelVisible = !panelVisible;
      if (panelVisible) refreshDetectedFields();
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
        if (targetTab === 'review') refreshDetectedFields();
        updatePanelDOM();
      }
    };
  });

  // Autofill button
  const autofillBtn = shadowRootRef.querySelector('#jc-autofill-btn');
  if (autofillBtn) {
    autofillBtn.onclick = () => {
      executeAutofillFlow();
    };
  }

  // Autofill pause button
  const pauseAutofillBtn = shadowRootRef.querySelector('#jc-pause-autofill-btn');
  if (pauseAutofillBtn) {
    pauseAutofillBtn.onclick = () => {
      stopAutofillFlow('Autofill paused by user. Progress and filled fields preserved.');
      applicationEngine?.pause();
    };
  }

  // Rescan buttons
  const rescanBtn = shadowRootRef.querySelector('#jc-rescan-btn');
  if (rescanBtn) {
    rescanBtn.onclick = () => {
      refreshDetectedFields();
      logger.info(`Rescanned form: ${detectedFieldsCache.length} fields detected.`);
      updatePanelDOM();
    };
  }

  const rescanReviewBtn = shadowRootRef.querySelector('#jc-rescan-review-btn');
  if (rescanReviewBtn) {
    rescanReviewBtn.onclick = () => {
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

  // Review Tab: Rewrite buttons for specific fields
  const rewriteBtns = shadowRootRef.querySelectorAll('.jc-field-rewrite-btn');
  rewriteBtns.forEach((btn) => {
    btn.onclick = () => {
      const fieldId = btn.getAttribute('data-field-id');
      const target = detectedFieldsCache.find((f) => f.id === fieldId);
      if (target) {
        openRewriteModal(target);
      }
    };
  });

  // Rewrite Modal handlers
  const cancelRewriteBtn = shadowRootRef.querySelector('#jc-cancel-rewrite-btn');
  const cancelRewriteBtn2 = shadowRootRef.querySelector('#jc-cancel-rewrite-btn-2');
  if (cancelRewriteBtn) cancelRewriteBtn.onclick = () => { activeRewriteField = null; updatePanelDOM(); };
  if (cancelRewriteBtn2) cancelRewriteBtn2.onclick = () => { activeRewriteField = null; updatePanelDOM(); };

  const submitRewriteBtn = shadowRootRef.querySelector('#jc-submit-rewrite-btn');
  if (submitRewriteBtn) {
    submitRewriteBtn.onclick = () => {
      const feedbackInput = shadowRootRef.querySelector('#jc-rewrite-feedback-input');
      const feedback = feedbackInput ? feedbackInput.value.trim() : '';
      executeFieldRewrite(feedback);
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
        toggleKeyBtn.textContent = apiKeyInput.type === 'password' ? '👁' : '🔒';
      };
    }

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

  // Debug: Clear logs
  const clearLogsBtn = shadowRootRef.querySelector('#jc-clear-logs-btn');
  if (clearLogsBtn) {
    clearLogsBtn.onclick = () => {
      logger.clear();
      updatePanelDOM();
    };
  }
}

export function mountUI() {
  if (document.getElementById(UI_IDS.CONTAINER)) {
    return;
  }

  const rootElement = document.createElement('div');
  rootElement.id = UI_IDS.CONTAINER;
  rootElement.style.position = 'absolute';
  rootElement.style.top = '0';
  rootElement.style.left = '0';
  rootElement.style.zIndex = '2147483647';

  const shadow = rootElement.attachShadow({ mode: 'open' });
  shadowRootRef = shadow;

  const styleEl = document.createElement('style');
  styleEl.textContent = STYLES;
  shadow.appendChild(styleEl);

  const container = document.createElement('div');
  container.className = 'jc-widget-container';
  shadow.appendChild(container);

  const target = document.body || document.documentElement;
  if (target) {
    target.appendChild(rootElement);
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
