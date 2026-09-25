import { STORAGE_KEYS, DEFAULT_SETTINGS, DEFAULT_PROFILE, APP_VERSION } from './constants.js';
import { platform } from './platform.js';

export function gmGet(key, defaultValue = null) {
  return platform.storage.get(key, defaultValue);
}

export function gmSet(key, value) {
  platform.storage.set(key, value);
}

export function gmDelete(key) {
  platform.storage.delete(key);
}

export function getSettings() {
  const stored = gmGet(STORAGE_KEYS.SETTINGS, {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function saveSettings(settings) {
  // Ensure we do not accidentally persist secrets in general settings
  const cleanSettings = { ...settings };
  delete cleanSettings.apiKey;
  delete cleanSettings.openRouterApiKey;
  gmSet(STORAGE_KEYS.SETTINGS, cleanSettings);
  return getSettings();
}

export function getProfile() {
  const stored = gmGet(STORAGE_KEYS.PROFILE, {});
  return {
    ...DEFAULT_PROFILE,
    ...stored,
    workExperiences: Array.isArray(stored?.workExperiences) ? stored.workExperiences : [],
    education: Array.isArray(stored?.education) ? stored.education : [],
    projects: Array.isArray(stored?.projects) ? stored.projects : [],
    skills: Array.isArray(stored?.skills) ? stored.skills : [],
  };
}

export function saveProfile(profile) {
  const cleanProfile = {
    ...DEFAULT_PROFILE,
    ...profile,
    workExperiences: Array.isArray(profile?.workExperiences) ? profile.workExperiences : [],
    education: Array.isArray(profile?.education) ? profile.education : [],
    projects: Array.isArray(profile?.projects) ? profile.projects : [],
    skills: Array.isArray(profile?.skills) ? profile.skills : [],
  };
  gmSet(STORAGE_KEYS.PROFILE, cleanProfile);
  return getProfile();
}

/**
 * Returns '' on hosts that keep the key out of this context (extension content
 * scripts). Use hasApiKey() for presence checks so those hosts still work.
 */
export function getApiKey() {
  return platform.secrets.read();
}

export function hasApiKey() {
  return platform.secrets.has();
}

export function saveApiKey(apiKey) {
  platform.secrets.write(apiKey);
}

export function clearApiKey() {
  platform.secrets.clear();
}

export function getDebugLogs() {
  return gmGet(STORAGE_KEYS.DEBUG, []);
}

export function saveDebugLogs(logs) {
  gmSet(STORAGE_KEYS.DEBUG, logs);
}

export function clearDebugLogs() {
  gmSet(STORAGE_KEYS.DEBUG, []);
}

export function initializeStorage() {
  const currentVer = gmGet(STORAGE_KEYS.VERSION);
  if (!currentVer) {
    gmSet(STORAGE_KEYS.VERSION, APP_VERSION);
  }
}

export function getSanitizedState() {
  const settings = getSettings();
  const profile = getProfile();

  return {
    version: APP_VERSION,
    hasApiKey: hasApiKey(),
    settings,
    profileSummary: {
      hasFullName: Boolean(profile.fullName),
      hasEmail: Boolean(profile.email),
      hasResumeContext: Boolean(profile.resumeContext),
    },
    url: window.location.href,
    host: window.location.hostname,
    timestamp: new Date().toISOString(),
  };
}

export function resetAll() {
  for (const id of gmGet(STORAGE_KEYS.SESSIONS, [])) gmDelete(`${STORAGE_KEYS.SESSIONS}:${id}`);
  gmDelete(STORAGE_KEYS.SESSIONS);
  gmDelete(STORAGE_KEYS.JOB);
  gmDelete(STORAGE_KEYS.MEMORY);
  gmDelete(STORAGE_KEYS.SETTINGS);
  gmDelete(STORAGE_KEYS.PROFILE);
  clearApiKey();
  gmDelete(STORAGE_KEYS.DEBUG);
  gmSet(STORAGE_KEYS.VERSION, APP_VERSION);
}
