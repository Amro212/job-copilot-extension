import { STRUCTURED_PROFILE_DEFAULTS } from './profile.js';

// Dynamically injected at build time, fallback to package.json version
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.3.0';
export const APP_NAME = 'Job Copilot';

export const STORAGE_KEYS = {
  SETTINGS: 'jc:settings',
  PROFILE: 'jc:profile',
  SECRETS: 'jc:secrets',
  DEBUG: 'jc:debug',
  VERSION: 'jc:version',
  JOB: 'jc:job',
  SESSIONS: 'jc:sessions',
  MEMORY: 'jc:memory',
};

export const DEFAULT_SETTINGS = {
  model: 'google/gemini-2.0-flash',
  autofillEnabled: true,
  overwriteExisting: false,
  autoContinue: true,
  autoSubmit: false,
  autopilot: false,
  narrativeVoiceEditor: true,
};

export const DEFAULT_PROFILE = {
  ...STRUCTURED_PROFILE_DEFAULTS,
  fullName: '',
  email: '',
  phone: '',
  location: '',
  linkedin: '',
  github: '',
  portfolio: '',
  resumeContext: '',
  applicantNotes: '',
};

export const POPULAR_MODELS = [
  'google/gemini-2.0-flash',
  'anthropic/claude-3.5-sonnet',
  'openai/gpt-4o',
  'openai/gpt-4o-mini',
  'meta-llama/llama-3.3-70b-instruct',
  'deepseek/deepseek-chat',
];

export const UI_IDS = {
  CONTAINER: 'job-copilot-root',
  INLINE_REWRITE: 'job-copilot-inline-rewrite',
};

export const FIELD_TYPES = {
  TEXT: 'text',
  TEXTAREA: 'textarea',
  EMAIL: 'email',
  TEL: 'tel',
  URL: 'url',
  NUMBER: 'number',
  SELECT: 'select',
  RADIO: 'radio',
  CHECKBOX: 'checkbox',
  COMBOBOX: 'combobox',
  CONTENTEDITABLE: 'contenteditable',
  FILE: 'file',
};

export const FILL_STATUS = {
  IDLE: 'idle',
  DETECTED: 'detected',
  FILLING: 'filling',
  VERIFIED: 'verified',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  INFERRED: 'inferred',
};
