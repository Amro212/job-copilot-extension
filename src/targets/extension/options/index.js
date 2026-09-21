import { api, sendMessage } from '../shared/browser.js';
import { MSG } from '../shared/protocol.js';
import { APP_VERSION, POPULAR_MODELS, DEFAULT_SETTINGS, DEFAULT_PROFILE, STORAGE_KEYS } from '../../../core/constants.js';
import { PROFILE_SECTIONS } from '../../../core/profile.js';
import { exportPayload, importPayload } from '../../../core/migration.js';

const IDENTITY_FIELDS = [
  { name: 'fullName', label: 'Full name', type: 'text' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone', type: 'tel' },
  { name: 'location', label: 'Current location', type: 'text', placeholder: 'City, Province/State, Country' },
  { name: 'linkedin', label: 'LinkedIn URL', type: 'url' },
  { name: 'github', label: 'GitHub URL', type: 'url' },
  { name: 'portfolio', label: 'Portfolio URL', type: 'url' },
];

const $ = (id) => document.getElementById(id);

function flash(el, message, isError = false) {
  el.textContent = message;
  el.classList.toggle('error', isError);
  if (!isError) setTimeout(() => { if (el.textContent === message) el.textContent = ''; }, 2500);
}

function group(field, value) {
  const wrap = document.createElement('div');
  wrap.className = 'group';
  const label = document.createElement('label');
  label.htmlFor = `pf-${field.name}`;
  label.textContent = field.label;
  wrap.append(label);

  let input;
  if (field.options) {
    input = document.createElement('select');
    for (const option of ['', ...field.options]) {
      const el = document.createElement('option');
      el.value = option;
      el.textContent = option || 'Not set';
      input.append(el);
    }
  } else {
    input = document.createElement('input');
    input.type = field.type || 'text';
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.min !== undefined) input.min = field.min;
    if (field.step !== undefined) input.step = field.step;
  }
  input.id = `pf-${field.name}`;
  input.name = field.name;
  input.value = value ?? '';
  wrap.append(input);
  return wrap;
}

async function readStore() {
  const snapshot = await sendMessage({ type: MSG.SNAPSHOT });
  if (!snapshot || snapshot.error) throw new Error(snapshot?.error || 'Could not read extension storage');
  return snapshot;
}

function renderProfile(profile) {
  const identity = $('identity-fields');
  identity.replaceChildren(...IDENTITY_FIELDS.map((field) => group(field, profile[field.name])));

  const sections = $('profile-sections');
  sections.replaceChildren(...PROFILE_SECTIONS.map((section) => {
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = section.title;
    fieldset.append(legend);
    if (section.description) {
      const hint = document.createElement('p');
      hint.className = 'hint';
      hint.textContent = section.description;
      fieldset.append(hint);
    }
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.append(...section.fields.map((field) => group(field, profile[field.name])));
    fieldset.append(grid);
    return fieldset;
  }));

  $('resumeContext').value = profile.resumeContext || '';
  $('applicantNotes').value = profile.applicantNotes || '';
}

function renderModel(settings) {
  const select = $('model');
  const custom = $('model-custom');
  const isKnown = POPULAR_MODELS.includes(settings.model);
  select.replaceChildren(
    ...POPULAR_MODELS.map((model) => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      option.selected = settings.model === model;
      return option;
    }),
  );
  const customOption = document.createElement('option');
  customOption.value = 'custom';
  customOption.textContent = 'Custom model...';
  customOption.selected = !isKnown;
  select.append(customOption);

  custom.hidden = isKnown;
  custom.value = settings.model || DEFAULT_SETTINGS.model;

  select.onchange = () => {
    custom.hidden = select.value !== 'custom';
    if (select.value !== 'custom') custom.value = select.value;
  };
}

function setKeyBadge(hasKey) {
  const badge = $('key-status');
  badge.textContent = hasKey ? 'Key saved' : 'No key';
  badge.className = `badge ${hasKey ? 'ok' : 'warn'}`;
}

async function init() {
  $('version').textContent = `v${APP_VERSION}`;

  const snapshot = await readStore();
  const settings = { ...DEFAULT_SETTINGS, ...(snapshot.data[STORAGE_KEYS.SETTINGS] || {}) };
  const profile = { ...DEFAULT_PROFILE, ...(snapshot.data[STORAGE_KEYS.PROFILE] || {}) };

  setKeyBadge(snapshot.hasApiKey);
  renderModel(settings);
  renderProfile(profile);

  async function refreshResume() {
    const res = await sendMessage({ type: MSG.DOC_META });
    const meta = res?.meta;
    $('resume-status').textContent = meta
      ? `Stored: ${meta.name} (${Math.round((meta.size || 0) / 1024)} KB)`
      : 'No resume stored.';
  }
  await refreshResume();

  $('save-resume').onclick = async () => {
    const file = $('resume-file').files?.[0];
    if (!file) {
      flash($('resume-feedback'), 'Choose a file first.', true);
      return;
    }
    const buffer = await file.arrayBuffer();
    await sendMessage({ type: MSG.DOC_PUT, name: file.name, mimeType: file.type, buffer });
    $('resume-file').value = '';
    await refreshResume();
    flash($('resume-feedback'), 'Resume stored.');
  };

  $('clear-resume').onclick = async () => {
    await sendMessage({ type: MSG.DOC_DELETE });
    await refreshResume();
    flash($('resume-feedback'), 'Resume removed.');
  };

  $('save-key').onclick = async () => {
    const value = $('api-key').value.trim();
    if (!value) {
      flash($('key-feedback'), 'Enter a key first.', true);
      return;
    }
    const res = await sendMessage({ type: MSG.SECRET_WRITE, apiKey: value });
    $('api-key').value = '';
    setKeyBadge(Boolean(res?.hasApiKey));
    flash($('key-feedback'), 'Key saved.');
  };

  $('clear-key').onclick = async () => {
    await sendMessage({ type: MSG.SECRET_CLEAR });
    setKeyBadge(false);
    flash($('key-feedback'), 'Key removed.');
  };

  $('test-key').onclick = async () => {
    const feedback = $('key-feedback');
    feedback.classList.remove('error');
    feedback.textContent = 'Testing...';
    const current = await readStore();
    const model = { ...DEFAULT_SETTINGS, ...(current.data[STORAGE_KEYS.SETTINGS] || {}) }.model;
    const result = await sendMessage({
      type: MSG.AI_REQUEST,
      options: {
        method: 'POST',
        url: 'https://openrouter.ai/api/v1/chat/completions',
        headers: { 'Content-Type': 'application/json', 'X-Title': 'Kareer' },
        data: JSON.stringify({
          model,
          messages: [{ role: 'user', content: "Ping test. Respond with the single word 'OK'." }],
          max_tokens: 10,
        }),
        timeout: 15000,
      },
    });
    if (result?.error) flash(feedback, result.error, true);
    else if (result.status === 200) flash(feedback, `Connected using ${model}.`);
    else flash(feedback, `OpenRouter returned HTTP ${result.status}.`, true);
  };

  $('save-model').onclick = async () => {
    const select = $('model');
    const model = (select.value === 'custom' ? $('model-custom').value.trim() : select.value) || DEFAULT_SETTINGS.model;
    const current = await readStore();
    const next = { ...DEFAULT_SETTINGS, ...(current.data[STORAGE_KEYS.SETTINGS] || {}), model };
    await sendMessage({ type: MSG.STORAGE_SET, key: STORAGE_KEYS.SETTINGS, value: next });
    flash($('model-feedback'), 'Model saved.');
  };

  $('profile-form').onsubmit = async (event) => {
    event.preventDefault();
    const current = await readStore();
    const stored = current.data[STORAGE_KEYS.PROFILE] || {};
    const next = { ...DEFAULT_PROFILE, ...stored };
    for (const input of $('profile-form').querySelectorAll('input, select, textarea')) {
      if (input.name) next[input.name] = input.value;
    }
    await sendMessage({ type: MSG.STORAGE_SET, key: STORAGE_KEYS.PROFILE, value: next });
    flash($('profile-feedback'), 'Profile saved.');
  };

  $('export-data').onclick = async () => {
    const current = await readStore();
    const blob = new Blob([JSON.stringify(exportPayload(current.data), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kareer-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    flash($('migration-feedback'), 'Exported.');
  };

  $('import-data').onclick = () => $('import-file').click();

  $('import-file').onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const entries = importPayload(JSON.parse(await file.text()));
      for (const [key, value] of Object.entries(entries)) {
        await sendMessage({ type: MSG.STORAGE_SET, key, value });
      }
      const refreshed = await readStore();
      renderProfile({ ...DEFAULT_PROFILE, ...(refreshed.data[STORAGE_KEYS.PROFILE] || {}) });
      renderModel({ ...DEFAULT_SETTINGS, ...(refreshed.data[STORAGE_KEYS.SETTINGS] || {}) });
      flash($('migration-feedback'), `Imported ${Object.keys(entries).length} records. Re-enter your API key above.`);
    } catch (err) {
      flash($('migration-feedback'), `Import failed: ${err.message}`, true);
    } finally {
      event.target.value = '';
    }
  };
}

api.runtime.onMessage.addListener((message) => {
  if (message?.type === MSG.STORAGE_CHANGED && message.secretChanged) {
    setKeyBadge(Boolean(message.hasApiKey));
  }
});

init().catch((err) => {
  document.body.prepend(Object.assign(document.createElement('p'), {
    textContent: `Failed to load options: ${err.message}`,
    style: 'color:#fca5a5',
  }));
});
