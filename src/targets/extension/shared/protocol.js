/**
 * Message contract between content scripts, the panel, the options page, the
 * popup, and the background worker. Kept in one file so both ends cannot drift.
 */
export const MSG = {
  // Storage
  SNAPSHOT: 'jc:snapshot',
  STORAGE_SET: 'jc:storage-set',
  STORAGE_DELETE: 'jc:storage-delete',
  STORAGE_CHANGED: 'jc:storage-changed',

  // Secrets (background only)
  SECRET_WRITE: 'jc:secret-write',
  SECRET_CLEAR: 'jc:secret-clear',

  // AI proxy
  AI_REQUEST: 'jc:ai-request',

  // Tab-scoped session binding
  TAB_BIND: 'jc:tab-bind',
  TAB_BOUND_ID: 'jc:tab-bound-id',

  // UI
  OPEN_OPTIONS: 'jc:open-options',
  TOGGLE_PANEL: 'jc:toggle-panel',
  PANEL_STATUS: 'jc:panel-status',
  REQUEST_STATUS: 'jc:request-status',

  // Cross-frame field agents
  FRAME_ANNOUNCE: 'jc:frame-announce',
  FRAMES_CHANGED: 'jc:frames-changed',
  FRAME_LIST: 'jc:frame-list',
  FRAME_COMMAND: 'jc:frame-command',
  FRAME_RESULT: 'jc:frame-result',

  // Documents
  DOC_GET: 'jc:doc-get',
  DOC_PUT: 'jc:doc-put',
  DOC_META: 'jc:doc-meta',
  DOC_DELETE: 'jc:doc-delete',

  // Navigation lifecycle
  NAV_COMMITTED: 'jc:nav-committed',
  NAV_STATE: 'jc:nav-state',
};

/** Keys the background refuses to hand to any page context. */
export const SECRET_KEYS = ['jc:secrets'];

/**
 * Keys worth pushing to other contexts when they change. Sessions are tab-local
 * and debug logs are written on every log line, so broadcasting either one would
 * flood every open tab for no benefit.
 */
export const BROADCAST_KEYS = ['jc:settings', 'jc:profile', 'jc:memory', 'jc:documents'];

export const STORAGE_AREA = 'local';
