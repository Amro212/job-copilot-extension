import { APP_NAME, APP_VERSION } from './constants.js';
import { initializeStorage, resetAll } from './storage.js';
import { platform } from './platform.js';
import { logger } from './debug.js';
import { mountUI, toggleUIVisibility } from './ui.js';

function registerMenuCommands() {
  if (!platform.capabilities.menuCommands) return;

  platform.menu.register(`Toggle ${APP_NAME} Panel`, () => {
    toggleUIVisibility();
  });

  platform.menu.register(`Reset ${APP_NAME} Storage`, () => {
    if (confirm(`Reset all ${APP_NAME} profile data, settings, and secrets?`)) {
      resetAll();
      logger.warn('All storage reset to defaults via menu command.');
      window.location.reload();
    }
  });
}

/**
 * Mounts the panel. Callers must await platform.storage.ready() first: core
 * reads storage synchronously, so a host with async storage has to be hydrated.
 */
export function bootstrap() {
  // Only mount the main floating UI in the top-level window (not hidden sub-iframes)
  if (window.self !== window.top) {
    return;
  }

  try {
    initializeStorage();
    registerMenuCommands();
    mountUI();
    logger.info(`${APP_NAME} v${APP_VERSION} initialized on ${window.location.hostname}`);
  } catch (err) {
    console.error(`[${APP_NAME}] Initialization error:`, err);
  }
}

export function bootstrapWhenReady() {
  const start = () => platform.storage.ready().then(bootstrap);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}
