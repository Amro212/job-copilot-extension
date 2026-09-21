import { test, expect, LEVER_HOST, ASHBY_HOST, GREENHOUSE_HOST } from './support/fixtures.js';

const profile = {
  fullName: 'Test Applicant', email: 'test@example.com', location: 'Toronto, Ontario, Canada',
  linkedin: 'https://linkedin.com/in/example', pronouns: 'He/him', resumeContext: 'Software engineer.',
};

function answerQuestions(kr) {
  kr.openrouter.handler = body => {
    const { fieldsToFill } = JSON.parse(body.messages.at(-1).content);
    const answers = fieldsToFill.map(field => ({ fieldId: field.fieldId, inferred: false,
      value: field.type === 'combobox' ? field.options?.[0]?.label || '' : field.type === 'radio' ? 'No' :
        /compensation/.test(field.label) ? 'CAD 90000–110000 annually' : 'Irrelevant narrative that must not replace structured profile values.',
    }));
    return { choices: [{ message: { content: JSON.stringify({ answers }) } }] };
  };
}

test('Lever uses real questions, commits location JSON, and selects one pronoun', async ({ kr }) => {
  await kr.seed({ profile });
  answerQuestions(kr);
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('lever-hardening-fixture.html', LEVER_HOST));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled({ timeout: 60000 });
  await expect(page.locator('.location-input')).toHaveValue('Toronto, ON, CAN');
  await expect(page.locator('body')).toHaveAttribute('data-accepted-location', 'Toronto, ON, CAN');
  expect(JSON.parse(await page.locator('[name=selectedLocation]').inputValue()).id).toBe('ca-toronto');
  await expect(page.locator('#candidatePronounsCheckboxes input:checked')).toHaveCount(1);
  await expect(page.locator('[value="He/him"]')).toBeChecked();
  await expect(page.locator('[name="cards[residence][field0]"]')).toHaveValue(profile.location);
  await expect(page.locator('[name="cards[linkedin][field0]"]')).toHaveValue(profile.linkedin);
  await expect(page.locator('[name="cards[salary][field0]"]')).toHaveValue(/CAD 90000/);
  const fields = JSON.parse(kr.openrouter.requests[0].body.messages.at(-1).content).fieldsToFill;
  // LinkedIn is filled from the structured profile and is not sent to the model.
  expect(fields.map(f => f.label)).toEqual(expect.arrayContaining(['Pronouns', 'Where do you live? (City and State/Province)', 'What is your desired total compensation range for this role?']));
  expect(new Set(fields.map(f => f.fieldId)).size).toBe(fields.length);
  expect(kr.openrouter.requests.length).toBeGreaterThanOrEqual(1);
  await expect(page.locator('body')).toHaveAttribute('data-submissions', '0');
});

test('Lever overwrite repairs multiple pronouns; another run preserves existing values', async ({ kr }) => {
  await kr.seed({ profile, settings: { overwriteExisting: true } });
  answerQuestions(kr);
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('lever-hardening-fixture.html', LEVER_HOST));
  await page.locator('[value="She/her"]').check();
  await page.locator('[value="They/them"]').check();
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled({ timeout: 60000 });
  await expect(page.locator('#candidatePronounsCheckboxes input:checked')).toHaveCount(1);
  await expect(page.locator('[value="He/him"]')).toBeChecked();
  await kr.seed({ profile, settings: { overwriteExisting: false } });
  await page.reload();
  await kr.openPanel(page);
  await page.locator('[name="cards[residence][field0]"]').fill('User supplied residence');
  await page.evaluate(() => {
    const input = document.querySelector('.location-input');
    const hidden = document.querySelector('[name=selectedLocation]');
    const menu = document.querySelector('.dropdown-container');
    input.value = 'User supplied location';
    hidden.value = JSON.stringify({ name: 'User supplied location' });
    menu.style.display = 'none';
  });
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled();
  await expect(page.locator('[name="cards[residence][field0]"]')).toHaveValue('User supplied residence');
  await expect(page.locator('.location-input')).toHaveValue('User supplied location');
});

test('Ashby commits its portal location and visible No button without submission', async ({ kr }) => {
  await kr.seed({ profile });
  answerQuestions(kr);
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('ashby-hardening-fixture.html', ASHBY_HOST));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled({ timeout: 60000 });
  await expect(page.locator('body')).toHaveAttribute('data-accepted-location', 'Toronto, ON, CAN');
  await expect(page.locator('body')).toHaveAttribute('data-accepted-authorization', 'no');
  await expect(page.locator('body')).toHaveAttribute('data-accepted-source', 'Other');
  await expect(page.locator('[data-option=no]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-option=yes]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#kr-main-panel')).not.toContainText('Required field left empty');
  const fields = JSON.parse(kr.openrouter.requests[0].body.messages.at(-1).content).fieldsToFill;
  expect(fields.find(f => f.fieldId === 'authorization')).toMatchObject({ type: 'radio', required: true, options: [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }] });
  expect(fields.some(f => f.label === 'Option')).toBe(false);
  expect(kr.openrouter.requests).toHaveLength(1);
  await expect(page.locator('body')).toHaveAttribute('data-submissions', '0');
});

test('Greenhouse harvests job-boards Location (City) and multi-select chips', async ({ kr }) => {
  await kr.seed({ profile });
  answerQuestions(kr);
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('greenhouse-job-boards-fixture.html', GREENHOUSE_HOST));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled({ timeout: 60000 });
  await expect(page.locator('body')).toHaveAttribute('data-candidate-location', 'Toronto, Ontario, Canada');
  await expect(page.locator('body')).toHaveAttribute('data-326', 'Male');
  await expect(page.locator('#kr-main-panel')).toContainText('2 VERIFIED');
  await expect(page.locator('#kr-main-panel')).toContainText('0 FAILED');
  expect(kr.openrouter.requests).toHaveLength(1);
  await expect(page.locator('body')).toHaveAttribute('data-submissions', '0');
});

test('Greenhouse harvests and commits ordinary React-select dropdowns', async ({ kr }) => {
  await kr.seed({ profile });
  answerQuestions(kr);
  const page = await kr.context.newPage();
  await page.goto(kr.fixtureUrl('greenhouse-select-fixture.html', GREENHOUSE_HOST));
  await kr.openPanel(page);
  await page.locator('#kr-autofill-btn').click();
  await expect(page.locator('#kr-autofill-btn')).toBeEnabled({ timeout: 60000 });
  await expect(page.locator('body')).toHaveAttribute('data-country', 'Canada');
  await expect(page.locator('body')).toHaveAttribute('data-question_68696271', 'Yes');
  expect(kr.openrouter.requests).toHaveLength(1);
  await expect(page.locator('body')).toHaveAttribute('data-submissions', '0');
});
