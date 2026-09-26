import { api, sendMessage } from '../shared/browser.js';
import { MSG } from '../shared/protocol.js';
import { APP_VERSION, POPULAR_MODELS, DEFAULT_SETTINGS, DEFAULT_PROFILE, STORAGE_KEYS } from '../../../core/constants.js';
import { PROFILE_SECTIONS, createWorkExperience, createEducation, createProject } from '../../../core/profile.js';
import { exportPayload, importPayload } from '../../../core/migration.js';

let currentWork = [];
let currentEducation = [];
let currentProjects = [];
let currentSkills = [];

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const MONTH_OPTIONS = [
  { val: '01', label: 'January' },
  { val: '02', label: 'February' },
  { val: '03', label: 'March' },
  { val: '04', label: 'April' },
  { val: '05', label: 'May' },
  { val: '06', label: 'June' },
  { val: '07', label: 'July' },
  { val: '08', label: 'August' },
  { val: '09', label: 'September' },
  { val: '10', label: 'October' },
  { val: '11', label: 'November' },
  { val: '12', label: 'December' },
];

function generateMonthOptions(selected) {
  let html = '<option value="">Month</option>';
  for (const m of MONTH_OPTIONS) {
    html += `<option value="${m.val}" ${m.val === selected ? 'selected' : ''}>${m.label}</option>`;
  }
  return html;
}

function generateYearOptions(selected, minYear = 1960, maxYear = new Date().getFullYear() + 8) {
  let html = '<option value="">Year</option>';
  for (let y = maxYear; y >= minYear; y--) {
    const s = String(y);
    html += `<option value="${s}" ${s === String(selected) ? 'selected' : ''}>${s}</option>`;
  }
  return html;
}

function parseYearMonth(val) {
  if (!val) return { year: '', month: '' };
  const str = String(val).trim();
  if (str.startsWith('--')) {
    return { year: '', month: str.slice(2).padStart(2, '0') };
  }
  const parts = str.split('-');
  if (parts.length >= 2) {
    return { year: parts[0], month: parts[1].padStart(2, '0') };
  }
  if (parts.length === 1 && /^\d{4}$/.test(parts[0])) {
    return { year: parts[0], month: '' };
  }
  return { year: '', month: '' };
}

function buildYearMonth(year, month) {
  if (!year && !month) return '';
  if (year && month) return `${year}-${month.padStart(2, '0')}`;
  if (year) return year;
  if (month) return `--${month.padStart(2, '0')}`;
  return '';
}

function formatMonthYear(val) {
  if (!val) return '';
  const { year, month } = parseYearMonth(val);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mName = month ? monthNames[parseInt(month, 10) - 1] || month : '';
  if (year && mName) return `${mName} ${year}`;
  if (year) return year;
  if (mName) return mName;
  return '';
}

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

function updateSubnavBadges() {
  const setBadge = (id, count) => {
    const el = $(id);
    if (el) {
      el.textContent = count > 0 ? String(count) : '';
      el.style.display = count > 0 ? 'inline-block' : 'none';
    }
  };
  setBadge('subnav-work-count', currentWork.length);
  setBadge('subnav-edu-count', currentEducation.length);
  setBadge('subnav-proj-count', currentProjects.length);
  setBadge('subnav-skills-count', currentSkills.length);
}

function renderSkillsChips() {
  const container = $('skills-chip-list');
  if (!container) return;
  container.innerHTML = '';
  if (currentSkills.length === 0) {
    const hint = document.createElement('span');
    hint.className = 'skills-empty-hint';
    hint.textContent = 'No skills added yet. Type a skill name below and press Enter or comma.';
    container.append(hint);
    updateSubnavBadges();
    return;
  }

  currentSkills.forEach((skill, index) => {
    const chip = document.createElement('span');
    chip.className = 'skill-chip';
    chip.innerHTML = `<span>${escapeHtml(skill)}</span><button type="button" class="remove-chip" aria-label="Remove ${escapeHtml(skill)}">✕</button>`;
    chip.querySelector('.remove-chip').addEventListener('click', (e) => {
      e.stopPropagation();
      currentSkills.splice(index, 1);
      renderSkillsChips();
    });
    container.append(chip);
  });
  updateSubnavBadges();
}

function addSkillFromInput() {
  const input = $('skill-input');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) return;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (!currentSkills.some((s) => s.toLowerCase() === part.toLowerCase())) {
      currentSkills.push(part);
    }
  }
  input.value = '';
  renderSkillsChips();
}

function renderWorkExperiencesList() {
  const container = $('work-experience-list');
  if (!container) return;
  container.innerHTML = '';
  if (currentWork.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.style.margin = '8px 0';
    p.textContent = 'No work experience added yet. Click "+ Add experience" to add your first role.';
    container.append(p);
    updateSubnavBadges();
    return;
  }

  currentWork.forEach((item, index) => {
    if (item._collapsed === undefined) item._collapsed = true;
    const card = document.createElement('div');
    card.className = `repeatable-card ${item._collapsed ? 'is-collapsed' : ''} ${item.enabled === false ? 'is-disabled' : ''}`;

    const dateRange = [
      formatMonthYear(item.startDate),
      item.current ? 'Present' : formatMonthYear(item.endDate),
    ].filter(Boolean).join(' – ');

    const { year: startY, month: startM } = parseYearMonth(item.startDate);
    const { year: endY, month: endM } = parseYearMonth(item.endDate);

    card.innerHTML = `
      <div class="card-header" role="button" tabindex="0">
        <div class="card-title-group">
          <div class="card-summary-title">${escapeHtml(item.title || 'Untitled Role')} ${item.company ? 'at ' + escapeHtml(item.company) : ''}</div>
          <div class="card-summary-date">${escapeHtml(dateRange || 'Dates not set')}</div>
        </div>
        <div class="card-controls">
          <label class="checkbox-row" style="margin: 0; margin-right: 6px;" title="Include in autofill">
            <input type="checkbox" class="work-enabled-toggle" ${item.enabled !== false ? 'checked' : ''} />
            <span style="font-size: 11px;">Active</span>
          </label>
          <button type="button" class="icon-btn secondary work-move-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="icon-btn secondary work-move-down" title="Move Down" ${index === currentWork.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="icon-btn secondary danger work-delete" title="Remove role">✕</button>
          <span class="chevron-indicator">▼</span>
        </div>
      </div>
      <div class="card-body">
        <div class="grid">
          <div class="group">
            <label>Job title</label>
            <input type="text" class="work-title" placeholder="e.g. Senior Software Engineer" value="${escapeHtml(item.title)}" />
            <span class="field-guide">Your official title or primary functional role.</span>
          </div>
          <div class="group">
            <label>Company / Employer</label>
            <input type="text" class="work-company" placeholder="e.g. Stripe, Acme Corp" value="${escapeHtml(item.company)}" />
            <span class="field-guide">Employer name or client.</span>
          </div>
          <div class="group full-width">
            <label>Location</label>
            <input type="text" class="work-location" placeholder="e.g. San Francisco, CA or Remote" value="${escapeHtml(item.location)}" />
            <span class="field-guide">City and state/country, or Remote.</span>
          </div>
          <div class="group">
            <label>Start date</label>
            <div class="date-picker-row">
              <select class="work-start-month" aria-label="Start month">
                ${generateMonthOptions(startM)}
              </select>
              <select class="work-start-year" aria-label="Start year">
                ${generateYearOptions(startY)}
              </select>
            </div>
            <span class="field-guide">Month and year you began this role.</span>
          </div>
          <div class="group">
            <div class="label-with-action">
              <label>End date</label>
              <label class="checkbox-row inline-date-toggle">
                <input type="checkbox" class="work-current-toggle" ${item.current ? 'checked' : ''} />
                <span>I currently work here</span>
              </label>
            </div>
            <div class="date-picker-row">
              <select class="work-end-month" aria-label="End month" ${item.current ? 'disabled' : ''}>
                ${generateMonthOptions(endM)}
              </select>
              <select class="work-end-year" aria-label="End year" ${item.current ? 'disabled' : ''}>
                ${generateYearOptions(endY)}
              </select>
            </div>
            <span class="field-guide work-end-guide">${item.current ? 'Currently active role' : 'Month and year you finished this role.'}</span>
          </div>
        </div>
        <div class="group">
          <label>Responsibilities &amp; achievements</label>
          <textarea class="work-description" rows="3" placeholder="• Architected event-driven microservices processing 50M daily events&#10;• Reduced latency by 35% with Redis caching and query indexing&#10;• Mentored 4 engineers and led sprint planning">${escapeHtml(item.description)}</textarea>
          <span class="field-guide">Use action verbs, concrete metrics, and quantifiable impact.</span>
        </div>
      </div>
    `;

    const header = card.querySelector('.card-header');
    const toggleCollapse = () => {
      item._collapsed = !item._collapsed;
      card.classList.toggle('is-collapsed', item._collapsed);
    };
    header.addEventListener('click', (e) => {
      if (e.target.closest('.card-controls')) return;
      toggleCollapse();
    });
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('.card-controls')) return;
        e.preventDefault();
        toggleCollapse();
      }
    });

    const enabledToggle = card.querySelector('.work-enabled-toggle');
    enabledToggle.addEventListener('change', () => {
      item.enabled = enabledToggle.checked;
      card.classList.toggle('is-disabled', !item.enabled);
    });

    const moveUp = card.querySelector('.work-move-up');
    moveUp.addEventListener('click', (e) => {
      e.stopPropagation();
      if (index > 0) {
        const temp = currentWork[index];
        currentWork[index] = currentWork[index - 1];
        currentWork[index - 1] = temp;
        renderWorkExperiencesList();
      }
    });

    const moveDown = card.querySelector('.work-move-down');
    moveDown.addEventListener('click', (e) => {
      e.stopPropagation();
      if (index < currentWork.length - 1) {
        const temp = currentWork[index];
        currentWork[index] = currentWork[index + 1];
        currentWork[index + 1] = temp;
        renderWorkExperiencesList();
      }
    });

    const delBtn = card.querySelector('.work-delete');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentWork.splice(index, 1);
      renderWorkExperiencesList();
    });

    const titleInput = card.querySelector('.work-title');
    const companyInput = card.querySelector('.work-company');
    function updateWorkTitle() {
      card.querySelector('.card-summary-title').textContent = `${item.title || 'Untitled Role'} ${item.company ? 'at ' + item.company : ''}`;
    }
    titleInput.addEventListener('input', () => { item.title = titleInput.value; updateWorkTitle(); });
    companyInput.addEventListener('input', () => { item.company = companyInput.value; updateWorkTitle(); });
    card.querySelector('.work-location').addEventListener('input', (e) => { item.location = e.target.value; });

    const startMonthSelect = card.querySelector('.work-start-month');
    const startYearSelect = card.querySelector('.work-start-year');
    const endMonthSelect = card.querySelector('.work-end-month');
    const endYearSelect = card.querySelector('.work-end-year');
    const currentToggle = card.querySelector('.work-current-toggle');
    const endGuide = card.querySelector('.work-end-guide');

    function updateWorkDates() {
      const dates = [
        formatMonthYear(item.startDate),
        item.current ? 'Present' : formatMonthYear(item.endDate),
      ].filter(Boolean).join(' – ');
      card.querySelector('.card-summary-date').textContent = dates || 'Dates not set';
    }

    function onStartChange() {
      item.startDate = buildYearMonth(startYearSelect.value, startMonthSelect.value);
      updateWorkDates();
    }
    startMonthSelect.addEventListener('change', onStartChange);
    startYearSelect.addEventListener('change', onStartChange);

    function onEndChange() {
      item.endDate = buildYearMonth(endYearSelect.value, endMonthSelect.value);
      updateWorkDates();
    }
    endMonthSelect.addEventListener('change', onEndChange);
    endYearSelect.addEventListener('change', onEndChange);

    currentToggle.addEventListener('change', () => {
      item.current = currentToggle.checked;
      endMonthSelect.disabled = item.current;
      endYearSelect.disabled = item.current;
      if (endGuide) {
        endGuide.textContent = item.current ? 'Currently active role' : 'Month and year you finished this role.';
      }
      updateWorkDates();
    });

    card.querySelector('.work-description').addEventListener('input', (e) => { item.description = e.target.value; });

    container.append(card);
  });
  updateSubnavBadges();
}

function renderEducationList() {
  const container = $('education-list');
  if (!container) return;
  container.innerHTML = '';
  if (currentEducation.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.style.margin = '8px 0';
    p.textContent = 'No education entries added yet. Click "+ Add education" to add your school or degree.';
    container.append(p);
    updateSubnavBadges();
    return;
  }

  currentEducation.forEach((item, index) => {
    if (item._collapsed === undefined) item._collapsed = true;
    const card = document.createElement('div');
    card.className = `repeatable-card ${item._collapsed ? 'is-collapsed' : ''} ${item.enabled === false ? 'is-disabled' : ''}`;

    const dateRange = [
      formatMonthYear(item.startDate),
      item.current ? 'Present (Expected)' : formatMonthYear(item.endDate),
    ].filter(Boolean).join(' – ');

    const { year: startY, month: startM } = parseYearMonth(item.startDate);
    const { year: endY, month: endM } = parseYearMonth(item.endDate);

    card.innerHTML = `
      <div class="card-header" role="button" tabindex="0">
        <div class="card-title-group">
          <div class="card-summary-title">${escapeHtml(item.degree || 'Degree')} ${item.fieldOfStudy ? 'in ' + escapeHtml(item.fieldOfStudy) : ''} ${item.institution ? '– ' + escapeHtml(item.institution) : ''}</div>
          <div class="card-summary-date">${escapeHtml(dateRange || 'Dates not set')}</div>
        </div>
        <div class="card-controls">
          <label class="checkbox-row" style="margin: 0; margin-right: 6px;" title="Include in autofill">
            <input type="checkbox" class="edu-enabled-toggle" ${item.enabled !== false ? 'checked' : ''} />
            <span style="font-size: 11px;">Active</span>
          </label>
          <button type="button" class="icon-btn secondary edu-move-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="icon-btn secondary edu-move-down" title="Move Down" ${index === currentEducation.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="icon-btn secondary danger edu-delete" title="Remove education">✕</button>
          <span class="chevron-indicator">▼</span>
        </div>
      </div>
      <div class="card-body">
        <div class="grid">
          <div class="group">
            <label>Institution / University</label>
            <input type="text" class="edu-institution" placeholder="e.g. Stanford University" value="${escapeHtml(item.institution)}" />
            <span class="field-guide">Official name of the university, college, or school.</span>
          </div>
          <div class="group">
            <label>Degree</label>
            <input type="text" class="edu-degree" placeholder="e.g. Bachelor of Science, Master of Science" value="${escapeHtml(item.degree)}" />
            <span class="field-guide">Degree level (e.g. Bachelor's, Master's, PhD).</span>
          </div>
          <div class="group">
            <label>Field of study / Major</label>
            <input type="text" class="edu-field" placeholder="e.g. Computer Science, Electrical Engineering" value="${escapeHtml(item.fieldOfStudy)}" />
            <span class="field-guide">Your primary discipline or concentration.</span>
          </div>
          <div class="group">
            <label>GPA (optional)</label>
            <input type="text" class="edu-gpa" placeholder="e.g. 3.8 / 4.0" value="${escapeHtml(item.gpa)}" />
            <span class="field-guide">Cumulative GPA or academic honors.</span>
          </div>
          <div class="group">
            <label>Start date</label>
            <div class="date-picker-row">
              <select class="edu-start-month" aria-label="Start month">
                ${generateMonthOptions(startM)}
              </select>
              <select class="edu-start-year" aria-label="Start year">
                ${generateYearOptions(startY)}
              </select>
            </div>
            <span class="field-guide">Month and year you started.</span>
          </div>
          <div class="group">
            <div class="label-with-action">
              <label>End date (or expected)</label>
              <label class="checkbox-row inline-date-toggle">
                <input type="checkbox" class="edu-current-toggle" ${item.current ? 'checked' : ''} />
                <span>Currently enrolled</span>
              </label>
            </div>
            <div class="date-picker-row">
              <select class="edu-end-month" aria-label="End month" ${item.current ? 'disabled' : ''}>
                ${generateMonthOptions(endM)}
              </select>
              <select class="edu-end-year" aria-label="End year" ${item.current ? 'disabled' : ''}>
                ${generateYearOptions(endY)}
              </select>
            </div>
            <span class="field-guide edu-end-guide">${item.current ? 'Currently enrolled (expected completion)' : 'Month and year completed.'}</span>
          </div>
        </div>
        <div class="group">
          <label>Honors, activities &amp; coursework</label>
          <textarea class="edu-description" rows="2" placeholder="e.g. Dean's Honor List, Relevant coursework: Distributed Systems, Algorithms, Machine Learning">${escapeHtml(item.description)}</textarea>
          <span class="field-guide">Notable achievements, thesis, or relevant coursework.</span>
        </div>
      </div>
    `;

    const header = card.querySelector('.card-header');
    const toggleCollapse = () => {
      item._collapsed = !item._collapsed;
      card.classList.toggle('is-collapsed', item._collapsed);
    };
    header.addEventListener('click', (e) => {
      if (e.target.closest('.card-controls')) return;
      toggleCollapse();
    });
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('.card-controls')) return;
        e.preventDefault();
        toggleCollapse();
      }
    });

    const enabledToggle = card.querySelector('.edu-enabled-toggle');
    enabledToggle.addEventListener('change', () => {
      item.enabled = enabledToggle.checked;
      card.classList.toggle('is-disabled', !item.enabled);
    });

    const moveUp = card.querySelector('.edu-move-up');
    moveUp.addEventListener('click', (e) => {
      e.stopPropagation();
      if (index > 0) {
        const temp = currentEducation[index];
        currentEducation[index] = currentEducation[index - 1];
        currentEducation[index - 1] = temp;
        renderEducationList();
      }
    });

    const moveDown = card.querySelector('.edu-move-down');
    moveDown.addEventListener('click', (e) => {
      e.stopPropagation();
      if (index < currentEducation.length - 1) {
        const temp = currentEducation[index];
        currentEducation[index] = currentEducation[index + 1];
        currentEducation[index + 1] = temp;
        renderEducationList();
      }
    });

    const delBtn = card.querySelector('.edu-delete');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentEducation.splice(index, 1);
      renderEducationList();
    });

    function updateEduTitle() {
      card.querySelector('.card-summary-title').textContent = `${item.degree || 'Degree'} ${item.fieldOfStudy ? 'in ' + item.fieldOfStudy : ''} ${item.institution ? '– ' + item.institution : ''}`;
    }

    card.querySelector('.edu-institution').addEventListener('input', (e) => { item.institution = e.target.value; updateEduTitle(); });
    card.querySelector('.edu-degree').addEventListener('input', (e) => { item.degree = e.target.value; updateEduTitle(); });
    card.querySelector('.edu-field').addEventListener('input', (e) => { item.fieldOfStudy = e.target.value; updateEduTitle(); });
    card.querySelector('.edu-gpa').addEventListener('input', (e) => { item.gpa = e.target.value; });

    const startMonthSelect = card.querySelector('.edu-start-month');
    const startYearSelect = card.querySelector('.edu-start-year');
    const endMonthSelect = card.querySelector('.edu-end-month');
    const endYearSelect = card.querySelector('.edu-end-year');
    const currentToggle = card.querySelector('.edu-current-toggle');
    const endGuide = card.querySelector('.edu-end-guide');

    function updateEduDates() {
      const dates = [
        formatMonthYear(item.startDate),
        item.current ? 'Present (Expected)' : formatMonthYear(item.endDate),
      ].filter(Boolean).join(' – ');
      card.querySelector('.card-summary-date').textContent = dates || 'Dates not set';
    }

    function onStartChange() {
      item.startDate = buildYearMonth(startYearSelect.value, startMonthSelect.value);
      updateEduDates();
    }
    startMonthSelect.addEventListener('change', onStartChange);
    startYearSelect.addEventListener('change', onStartChange);

    function onEndChange() {
      item.endDate = buildYearMonth(endYearSelect.value, endMonthSelect.value);
      updateEduDates();
    }
    endMonthSelect.addEventListener('change', onEndChange);
    endYearSelect.addEventListener('change', onEndChange);

    currentToggle.addEventListener('change', () => {
      item.current = currentToggle.checked;
      endMonthSelect.disabled = item.current;
      endYearSelect.disabled = item.current;
      if (endGuide) {
        endGuide.textContent = item.current ? 'Currently enrolled (expected completion)' : 'Month and year completed.';
      }
      updateEduDates();
    });

    card.querySelector('.edu-description').addEventListener('input', (e) => { item.description = e.target.value; });

    container.append(card);
  });
  updateSubnavBadges();
}

function renderProjectsList() {
  const container = $('projects-list');
  if (!container) return;
  container.innerHTML = '';
  if (currentProjects.length === 0) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.style.margin = '8px 0';
    p.textContent = 'No projects added yet. Click "+ Add project" to highlight a personal, academic, or open-source project.';
    container.append(p);
    updateSubnavBadges();
    return;
  }

  currentProjects.forEach((item, index) => {
    if (item._collapsed === undefined) item._collapsed = true;
    const card = document.createElement('div');
    card.className = `repeatable-card ${item._collapsed ? 'is-collapsed' : ''} ${item.enabled === false ? 'is-disabled' : ''}`;

    const dateRange = [
      formatMonthYear(item.startDate),
      item.current ? 'Ongoing' : formatMonthYear(item.endDate),
    ].filter(Boolean).join(' – ');

    const { year: startY, month: startM } = parseYearMonth(item.startDate);
    const { year: endY, month: endM } = parseYearMonth(item.endDate);

    card.innerHTML = `
      <div class="card-header" role="button" tabindex="0">
        <div class="card-title-group">
          <div class="card-summary-title">${escapeHtml(item.name || 'Untitled Project')} ${item.role ? '(' + escapeHtml(item.role) + ')' : ''}</div>
          <div class="card-summary-date">${escapeHtml(dateRange || 'Dates not set')}</div>
        </div>
        <div class="card-controls">
          <label class="checkbox-row" style="margin: 0; margin-right: 6px;" title="Include in autofill">
            <input type="checkbox" class="proj-enabled-toggle" ${item.enabled !== false ? 'checked' : ''} />
            <span style="font-size: 11px;">Active</span>
          </label>
          <button type="button" class="icon-btn secondary proj-move-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" class="icon-btn secondary proj-move-down" title="Move Down" ${index === currentProjects.length - 1 ? 'disabled' : ''}>↓</button>
          <button type="button" class="icon-btn secondary danger proj-delete" title="Remove project">✕</button>
          <span class="chevron-indicator">▼</span>
        </div>
      </div>
      <div class="card-body">
        <div class="grid">
          <div class="group">
            <label>Project name</label>
            <input type="text" class="proj-name" placeholder="e.g. Distributed Task Orchestrator" value="${escapeHtml(item.name)}" />
            <span class="field-guide">Title of the product, tool, or repository.</span>
          </div>
          <div class="group">
            <label>Your role</label>
            <input type="text" class="proj-role" placeholder="e.g. Creator, Lead Developer, Contributor" value="${escapeHtml(item.role)}" />
            <span class="field-guide">Your specific contribution or role.</span>
          </div>
          <div class="group full-width">
            <label>Project URL / Repository</label>
            <input type="url" class="proj-url" placeholder="https://github.com/..." value="${escapeHtml(item.url)}" />
            <span class="field-guide">Public demo link, live app, or GitHub repository.</span>
          </div>
          <div class="group">
            <label>Start date</label>
            <div class="date-picker-row">
              <select class="proj-start-month" aria-label="Start month">
                ${generateMonthOptions(startM)}
              </select>
              <select class="proj-start-year" aria-label="Start year">
                ${generateYearOptions(startY)}
              </select>
            </div>
            <span class="field-guide">Month and year started.</span>
          </div>
          <div class="group">
            <div class="label-with-action">
              <label>End date</label>
              <label class="checkbox-row inline-date-toggle">
                <input type="checkbox" class="proj-current-toggle" ${item.current ? 'checked' : ''} />
                <span>Ongoing project</span>
              </label>
            </div>
            <div class="date-picker-row">
              <select class="proj-end-month" aria-label="End month" ${item.current ? 'disabled' : ''}>
                ${generateMonthOptions(endM)}
              </select>
              <select class="proj-end-year" aria-label="End year" ${item.current ? 'disabled' : ''}>
                ${generateYearOptions(endY)}
              </select>
            </div>
            <span class="field-guide proj-end-guide">${item.current ? 'Currently ongoing project' : 'Month and year completed.'}</span>
          </div>
        </div>
        <div class="group">
          <label>Description &amp; tech stack</label>
          <textarea class="proj-description" rows="3" placeholder="• Built using TypeScript, Next.js, Redis, and TailwindCSS&#10;• Designed high-throughput queue handling 10k req/sec&#10;• Deployed on AWS with automated CI/CD pipeline">${escapeHtml(item.description)}</textarea>
          <span class="field-guide">Technologies used, architecture, key features, and outcomes.</span>
        </div>
      </div>
    `;

    const header = card.querySelector('.card-header');
    const toggleCollapse = () => {
      item._collapsed = !item._collapsed;
      card.classList.toggle('is-collapsed', item._collapsed);
    };
    header.addEventListener('click', (e) => {
      if (e.target.closest('.card-controls')) return;
      toggleCollapse();
    });
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('.card-controls')) return;
        e.preventDefault();
        toggleCollapse();
      }
    });

    const enabledToggle = card.querySelector('.proj-enabled-toggle');
    enabledToggle.addEventListener('change', () => {
      item.enabled = enabledToggle.checked;
      card.classList.toggle('is-disabled', !item.enabled);
    });

    const moveUp = card.querySelector('.proj-move-up');
    moveUp.addEventListener('click', (e) => {
      e.stopPropagation();
      if (index > 0) {
        const temp = currentProjects[index];
        currentProjects[index] = currentProjects[index - 1];
        currentProjects[index - 1] = temp;
        renderProjectsList();
      }
    });

    const moveDown = card.querySelector('.proj-move-down');
    moveDown.addEventListener('click', (e) => {
      e.stopPropagation();
      if (index < currentProjects.length - 1) {
        const temp = currentProjects[index];
        currentProjects[index] = currentProjects[index + 1];
        currentProjects[index + 1] = temp;
        renderProjectsList();
      }
    });

    const delBtn = card.querySelector('.proj-delete');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentProjects.splice(index, 1);
      renderProjectsList();
    });

    function updateProjTitle() {
      card.querySelector('.card-summary-title').textContent = `${item.name || 'Untitled Project'} ${item.role ? '(' + item.role + ')' : ''}`;
    }

    card.querySelector('.proj-name').addEventListener('input', (e) => { item.name = e.target.value; updateProjTitle(); });
    card.querySelector('.proj-role').addEventListener('input', (e) => { item.role = e.target.value; updateProjTitle(); });
    card.querySelector('.proj-url').addEventListener('input', (e) => { item.url = e.target.value; });

    const startMonthSelect = card.querySelector('.proj-start-month');
    const startYearSelect = card.querySelector('.proj-start-year');
    const endMonthSelect = card.querySelector('.proj-end-month');
    const endYearSelect = card.querySelector('.proj-end-year');
    const currentToggle = card.querySelector('.proj-current-toggle');
    const endGuide = card.querySelector('.proj-end-guide');

    function updateProjDates() {
      const dates = [
        formatMonthYear(item.startDate),
        item.current ? 'Ongoing' : formatMonthYear(item.endDate),
      ].filter(Boolean).join(' – ');
      card.querySelector('.card-summary-date').textContent = dates || 'Dates not set';
    }

    function onStartChange() {
      item.startDate = buildYearMonth(startYearSelect.value, startMonthSelect.value);
      updateProjDates();
    }
    startMonthSelect.addEventListener('change', onStartChange);
    startYearSelect.addEventListener('change', onStartChange);

    function onEndChange() {
      item.endDate = buildYearMonth(endYearSelect.value, endMonthSelect.value);
      updateProjDates();
    }
    endMonthSelect.addEventListener('change', onEndChange);
    endYearSelect.addEventListener('change', onEndChange);

    currentToggle.addEventListener('change', () => {
      item.current = currentToggle.checked;
      endMonthSelect.disabled = item.current;
      endYearSelect.disabled = item.current;
      if (endGuide) {
        endGuide.textContent = item.current ? 'Currently ongoing project' : 'Month and year completed.';
      }
      updateProjDates();
    });

    card.querySelector('.proj-description').addEventListener('input', (e) => { item.description = e.target.value; });

    container.append(card);
  });
  updateSubnavBadges();
}

function renderProfile(profile) {
  const identity = $('identity-fields');
  identity.replaceChildren(...IDENTITY_FIELDS.map((field) => group(field, profile[field.name])));

  currentWork = (profile.workExperiences || []).map((w) => createWorkExperience({ ...w, _collapsed: true }));
  currentEducation = (profile.education || []).map((e) => createEducation({ ...e, _collapsed: true }));
  currentProjects = (profile.projects || []).map((p) => createProject({ ...p, _collapsed: true }));
  currentSkills = Array.isArray(profile.skills) ? [...profile.skills] : [];

  renderWorkExperiencesList();
  renderEducationList();
  renderProjectsList();
  renderSkillsChips();
  updateSubnavBadges();

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

  $('add-work-btn').onclick = () => {
    currentWork.push(createWorkExperience({ _collapsed: false }));
    renderWorkExperiencesList();
  };

  $('add-education-btn').onclick = () => {
    currentEducation.push(createEducation({ _collapsed: false }));
    renderEducationList();
  };

  $('add-project-btn').onclick = () => {
    currentProjects.push(createProject({ _collapsed: false }));
    renderProjectsList();
  };

  $('add-skill-btn').onclick = () => {
    addSkillFromInput();
  };

  $('skill-input').onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSkillFromInput();
    }
  };

  $('profile-form').onsubmit = async (event) => {
    event.preventDefault();
    const current = await readStore();
    const stored = current.data[STORAGE_KEYS.PROFILE] || {};
    const next = { ...DEFAULT_PROFILE, ...stored };
    for (const input of $('profile-form').querySelectorAll('input, select, textarea')) {
      if (input.name && !input.closest('.repeatable-card') && !input.closest('.skill-input-row')) {
        next[input.name] = input.value;
      }
    }
    next.workExperiences = currentWork.map(({ _collapsed, ...rest }) => rest);
    next.education = currentEducation.map(({ _collapsed, ...rest }) => rest);
    next.projects = currentProjects.map(({ _collapsed, ...rest }) => rest);
    next.skills = [...currentSkills];

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

  setupNavigation();
  updateSubnavBadges();
  handleInitialHash();
}

function setupNavigation() {
  const toggleBtn = $('profile-subnav-toggle');
  const navGroup = $('profile-nav-group');
  const profileParentLink = $('profile-nav-link');

  if (toggleBtn && navGroup) {
    toggleBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      navGroup.classList.toggle('is-collapsed');
    };
  }

  if (profileParentLink && navGroup) {
    profileParentLink.addEventListener('click', (e) => {
      navGroup.classList.remove('is-collapsed');
      const target = $('profile');
      if (target) {
        e.preventDefault();
        history.pushState(null, '', '#profile');
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        updateActiveNav('#profile');
      }
    });
  }

  // Smooth scroll and pulse on subsection click
  const subnavLinks = document.querySelectorAll('.subnav-item');
  subnavLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        const targetId = href.slice(1);
        const target = document.getElementById(targetId);
        if (target) {
          e.preventDefault();
          history.pushState(null, '', href);
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          target.classList.remove('highlight-pulse');
          void target.offsetWidth;
          target.classList.add('highlight-pulse');
          setTimeout(() => target.classList.remove('highlight-pulse'), 1600);
          updateActiveNav(href);
        }
      }
    });
  });

  // Top level links smooth scroll
  const topLinks = document.querySelectorAll('.settings-nav > nav > a');
  topLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href && href.startsWith('#')) {
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          history.pushState(null, '', href);
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          updateActiveNav(href);
        }
      }
    });
  });

  // Scroll spy
  window.addEventListener('scroll', throttle(onWindowScroll, 50), { passive: true });
}

function updateActiveNav(activeHash) {
  document.querySelectorAll('.settings-nav a').forEach((a) => {
    const href = a.getAttribute('href');
    a.classList.toggle('active', href === activeHash);
  });
}

function onWindowScroll() {
  const sections = [
    { id: 'connection', el: $('connection') },
    { id: 'models', el: $('models') },
    { id: 'section-identity', el: $('section-identity') },
    { id: 'section-work', el: $('section-work') },
    { id: 'section-education', el: $('section-education') },
    { id: 'section-projects', el: $('section-projects') },
    { id: 'section-skills', el: $('section-skills') },
    { id: 'section-preferences', el: $('section-preferences') },
    { id: 'section-rules', el: $('section-rules') },
    { id: 'resume', el: $('resume') },
    { id: 'advanced', el: $('advanced') },
  ];

  const scrollY = window.scrollY;
  const threshold = scrollY + 140;

  let currentId = null;
  for (const s of sections) {
    if (s.el) {
      if (s.el.offsetTop <= threshold) {
        currentId = s.id;
      }
    }
  }

  if (!currentId && sections[0].el) {
    currentId = sections[0].id;
  }

  const profileSubIds = [
    'section-identity',
    'section-work',
    'section-education',
    'section-projects',
    'section-skills',
    'section-preferences',
    'section-rules',
  ];
  const isProfileSub = profileSubIds.includes(currentId);

  document.querySelectorAll('.settings-nav a').forEach((a) => {
    const href = a.getAttribute('href');
    if (href === '#' + currentId) {
      a.classList.add('active');
    } else if (href === '#profile' && isProfileSub) {
      a.classList.add('active');
    } else {
      a.classList.remove('active');
    }
  });
}

function throttle(fn, wait) {
  let inThrottle = false;
  return function (...args) {
    if (!inThrottle) {
      fn.apply(this, args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, wait);
    }
  };
}

function handleInitialHash() {
  const hash = window.location.hash;
  if (!hash) {
    updateActiveNav('#connection');
    return;
  }
  const target = document.querySelector(hash);
  if (target) {
    const group = $('profile-nav-group');
    if (group) group.classList.remove('is-collapsed');

    setTimeout(() => {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.classList.remove('highlight-pulse');
      void target.offsetWidth;
      target.classList.add('highlight-pulse');
      setTimeout(() => target.classList.remove('highlight-pulse'), 1600);
      updateActiveNav(hash);
    }, 150);
  }
}
window.addEventListener('hashchange', handleInitialHash);

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
