import { getDebugLogs, saveDebugLogs, clearDebugLogs, getApiKey } from './storage.js';

const MAX_LOG_ENTRIES = 100;

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  let sanitized = str;

  // Mask current API key if present
  const currentKey = getApiKey();
  if (currentKey && currentKey.length > 5) {
    sanitized = sanitized.replaceAll(currentKey, '[REDACTED_API_KEY]');
  }

  // Redact OpenRouter key patterns (sk-or-v1-...)
  sanitized = sanitized.replace(/sk-or-v1-[a-zA-Z0-9]{20,}/g, '[REDACTED_OPENROUTER_KEY]');

  // Redact Bearer tokens
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9_\-\.]{15,}/gi, 'Bearer [REDACTED_TOKEN]');

  // Redact Authorization headers
  sanitized = sanitized.replace(/("Authorization"|Authorization):\s*"[^"]+"/gi, '$1: "[REDACTED]"');

  return sanitized;
}

function sanitizeMeta(meta) {
  if (!meta) return undefined;
  try {
    const stringified = JSON.stringify(meta);
    return JSON.parse(sanitizeString(stringified));
  } catch {
    return String(meta);
  }
}

class DebugLogger {
  constructor() {
    this.inMemoryLogs = [];
    this.loaded = false;
  }

  _load() {
    if (!this.loaded) {
      try {
        const stored = getDebugLogs();
        if (Array.isArray(stored)) {
          this.inMemoryLogs = stored;
        }
      } catch (err) {
        console.error('[Kareer:Logger] Error loading stored logs:', err);
      }
      this.loaded = true;
    }
  }

  _addEntry(level, message, meta) {
    this._load();

    const cleanMessage = sanitizeString(String(message));
    const cleanMeta = sanitizeMeta(meta);

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      level: level.toUpperCase(),
      message: cleanMessage,
      meta: cleanMeta,
    };

    this.inMemoryLogs.push(entry);

    if (this.inMemoryLogs.length > MAX_LOG_ENTRIES) {
      this.inMemoryLogs = this.inMemoryLogs.slice(-MAX_LOG_ENTRIES);
    }

    try {
      saveDebugLogs(this.inMemoryLogs);
    } catch (err) {
      console.error('[Kareer:Logger] Error saving logs:', err);
    }

    // Also output to console in development
    const consoleMsg = `[Kareer:${entry.level}] ${entry.message}`;
    if (level === 'error') {
      console.error(consoleMsg, cleanMeta || '');
    } else if (level === 'warn') {
      console.warn(consoleMsg, cleanMeta || '');
    } else {
      console.log(consoleMsg, cleanMeta || '');
    }

    return entry;
  }

  info(message, meta) {
    return this._addEntry('info', message, meta);
  }

  warn(message, meta) {
    return this._addEntry('warn', message, meta);
  }

  error(message, meta) {
    return this._addEntry('error', message, meta);
  }

  debug(message, meta) {
    return this._addEntry('debug', message, meta);
  }

  getLogs() {
    this._load();
    return [...this.inMemoryLogs];
  }

  clear() {
    this.inMemoryLogs = [];
    clearDebugLogs();
    this.info('Debug logs cleared.');
  }
}

export const logger = new DebugLogger();
