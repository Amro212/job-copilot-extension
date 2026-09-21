/**
 * Message contract between content scripts, the panel, the options page, the
 * popup, and the background worker. Kept in one file so both ends cannot drift.
 */
export const MSG = {
  // Storage
  SNAPSHOT: 'kr:snapshot',
  STORAGE_SET: 'kr:storage-set',
  STORAGE_DELETE: 'kr:storage-delete',
  STORAGE_CHANGED: 'kr:storage-changed',

  // Secrets (background only)
  SECRET_WRITE: 'kr:secret-write',
  SECRET_CLEAR: 'kr:secret-clear',

  // AI proxy
  AI_REQUEST: 'kr:ai-request',

  // Tab-scoped session binding
  TAB_BIND: 'kr:tab-bind',
  TAB_BOUND_ID: 'kr:tab-bound-id',

  // UI
  OPEN_OPTIONS: 'kr:open-options',
  TOGGLE_PANEL: 'kr:toggle-panel',
  PANEL_STATUS: 'kr:panel-status',
  REQUEST_STATUS: 'kr:request-status',

  // Cross-frame field agents
  FRAME_ANNOUNCE: 'kr:frame-announce',
  FRAMES_CHANGED: 'kr:frames-changed',
  FRAME_LIST: 'kr:frame-list',
  FRAME_COMMAND: 'kr:frame-command',
  FRAME_RESULT: 'kr:frame-result',

  // Documents
  DOC_GET: 'kr:doc-get',
  DOC_PUT: 'kr:doc-put',
  DOC_META: 'kr:doc-meta',
  DOC_DELETE: 'kr:doc-delete',

  // Navigation lifecycle
  NAV_COMMITTED: 'kr:nav-committed',
  NAV_STATE: 'kr:nav-state',
};

/** Keys the background refuses to hand to any page context. */
export const SECRET_KEYS = ['kr:secrets'];

/**
 * Keys worth pushing to other contexts when they change. Sessions are tab-local
 * and debug logs are written on every log line, so broadcasting either one would
 * flood every open tab for no benefit.
 */
export const BROADCAST_KEYS = ['kr:settings', 'kr:profile', 'kr:memory', 'kr:documents'];

export const STORAGE_AREA = 'local';
