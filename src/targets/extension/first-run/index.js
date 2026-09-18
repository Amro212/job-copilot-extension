const api = typeof browser !== 'undefined' && browser.runtime ? browser : chrome;

const ORIGINS = ['<all_urls>', 'https://openrouter.ai/*'];

const status = document.getElementById('status');
const button = document.getElementById('grant');

async function alreadyGranted() {
  try {
    return await api.permissions.contains({ origins: ['<all_urls>'] });
  } catch {
    return false;
  }
}

alreadyGranted().then((granted) => {
  if (!granted) return;
  status.className = 'ok';
  status.textContent = 'Access is already granted. You can close this tab.';
  button.disabled = true;
});

button.addEventListener('click', async () => {
  status.textContent = '';
  try {
    const granted = await api.permissions.request({ origins: ORIGINS });
    if (granted) {
      status.className = 'ok';
      status.textContent = 'Access granted. Open a job application and use the panel.';
      button.disabled = true;
    } else {
      status.className = 'err';
      status.textContent = 'Access was not granted. The extension cannot scan pages until you allow it.';
    }
  } catch (err) {
    status.className = 'err';
    status.textContent = err.message || String(err);
  }
});
