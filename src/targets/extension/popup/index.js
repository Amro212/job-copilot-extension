import { api, sendMessage } from '../shared/browser.js';
import { MSG } from '../shared/protocol.js';
import { APP_VERSION, DEFAULT_SETTINGS, STORAGE_KEYS } from '../../../core/constants.js';

const $ = (id) => document.getElementById(id);

const isPageTab = (tab) => /^https?:/.test(tab?.url || '');

/**
 * Normally the active tab is the page under the popup. When the popup is opened
 * as a tab itself, or the active tab is an extension page, fall back to the most
 * recently used real page in the window.
 */
function activeTab() {
  return new Promise((resolve) => {
    api.tabs.query({ currentWindow: true }, (tabs) => {
      const list = tabs || [];
      const active = list.find((tab) => tab.active);
      if (isPageTab(active)) {
        resolve(active);
        return;
      }
      const recent = list
        .filter(isPageTab)
        .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
      resolve(recent[0] || active || null);
    });
  });
}

function askFrames(tabId) {
  return sendMessage({ type: MSG.FRAME_LIST, tabId }).catch(() => null);
}

async function init() {
  $('version').textContent = `v${APP_VERSION}`;

  const snapshot = await sendMessage({ type: MSG.SNAPSHOT }).catch(() => null);
  const settings = { ...DEFAULT_SETTINGS, ...(snapshot?.data?.[STORAGE_KEYS.SETTINGS] || {}) };
  $('model').textContent = settings.model;

  const badge = $('key-status');
  badge.textContent = snapshot?.hasApiKey ? 'Key saved' : 'No key';
  badge.className = `badge ${snapshot?.hasApiKey ? 'ok' : 'warn'}`;

  const tab = await activeTab();
  if (tab?.id !== undefined) {
    const response = await askFrames(tab.id);
    const frames = response?.frames || [];
    if (frames.length) {
      const withFields = frames.filter((f) => f.fieldCount > 0);
      const top = frames.find((f) => f.isTop);
      $('field-count').textContent = String(frames.reduce((sum, f) => sum + f.fieldCount, 0));
      $('frame-count').textContent = String(withFields.length);
      if (withFields.length && !top?.fieldCount) {
        $('note').textContent = 'Fields are inside an embedded frame. The panel fills them through the frame agents.';
      }
    } else {
      $('field-count').textContent = '0';
      $('frame-count').textContent = '0';
      $('note').textContent = 'No frame reported in yet. Reload the page if the panel is missing.';
    }
  }

  $('toggle-panel').onclick = async () => {
    const current = await activeTab();
    if (current?.id === undefined) return;
    api.tabs.sendMessage(current.id, { type: MSG.TOGGLE_PANEL }, { frameId: 0 }, () => void api.runtime.lastError);
    window.close();
  };

  $('open-options').onclick = () => {
    api.runtime.openOptionsPage();
    window.close();
  };
}

init().catch((err) => {
  $('note').textContent = `Error: ${err.message}`;
});
