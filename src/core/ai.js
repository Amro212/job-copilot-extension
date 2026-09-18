import { hasApiKey, getSettings, getProfile } from './storage.js';
import { logger } from './debug.js';
import { platform } from './platform.js';
import { findExactOption } from './fields/combobox.js';
import { profileForAI, fixedProfileAnswer } from './profile.js';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const AUTOFILL_TIMEOUT_MS = 120000;
const OPTION_FIELD_TYPES = new Set(['select', 'combobox', 'radio', 'checkbox']);

const NARRATIVE_VOICE_RULES = `NARRATIVE VOICE (all free-text and open-ended answers):
Write like a real candidate filling a form: first-person, specific, and natural. Professional enough for a hiring manager, never brochure or chatbot copy. Vary sentence length. Every sentence must add a fact, not emphasis.

Hard bans:
- Never use em dashes (\u2014), en dashes (\u2013), or spaced double hyphens as dashes. Use a period, comma, colon, or parentheses.
- Do not use not-X-but-Y contrasts ("It's not just X, it's Y"). State the point.
- No staged openers or closers ("Here's the thing", "At its core", "That's what I bring").
- No inflated or sales wording (pivotal, crucial, testament, landscape, delve, underscore, showcase, robust, meticulous, vibrant, groundbreaking, foster, leverage, boasts, serves as, stands as). Prefer is/have and concrete verbs.
- Do not pad ideas into forced groups of three.
- No bold, emoji, or chatbot wrappers.`;

function stripModelDashes(text) {
  if (typeof text !== 'string' || !text) return text;
  return text
    .replace(/\s*[\u2014\u2013]\s*/g, ', ')
    .replace(/\s+--\s+/g, ', ');
}

// The host attaches Authorization; core never holds the key.
const REQUEST_HEADERS = {
  'Content-Type': 'application/json',
  'HTTP-Referer': 'https://github.com/Amro212/autofill-extension',
  'X-Title': 'Job Copilot',
};

function sendAiRequest(options) {
  return platform.ai.request({ ...options, headers: { ...REQUEST_HEADERS, ...options.headers } });
}

function cleanJsonFence(text) {
  if (!text) return '';
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  }
  return cleaned;
}

export async function testConnection() {
  const settings = getSettings();
  const model = settings.model || 'google/gemini-2.0-flash';

  if (!hasApiKey()) {
    logger.warn('Test AI invoked without an API key configured.');
    return {
      ok: false,
      model,
      latencyMs: 0,
      error: 'No OpenRouter API key found. Please add your key in Settings.',
      status: 'NO_KEY',
    };
  }

  const startTime = Date.now();

  try {
    logger.info(`Testing OpenRouter connection using model: ${model}`);

    const payload = JSON.stringify({
      model,
      messages: [
        { role: 'user', content: "Ping test. Respond with the single word 'OK'." },
      ],
      max_tokens: 10,
    });

    const response = await sendAiRequest({
      method: 'POST',
      url: OPENROUTER_ENDPOINT,
      data: payload,
      timeout: 15000,
    });

    const latencyMs = Date.now() - startTime;
    const statusCode = response.status;

    if (statusCode === 200) {
      let reply = 'OK';
      try {
        const data = JSON.parse(response.responseText);
        reply = data.choices?.[0]?.message?.content?.trim() || 'OK';
      } catch {}

      logger.info(`OpenRouter connection test succeeded in ${latencyMs}ms. Response: "${reply}"`);
      return {
        ok: true,
        model,
        latencyMs,
        reply,
        status: 200,
      };
    }

    let errorDetail = `HTTP ${statusCode}`;
    try {
      const errorJson = JSON.parse(response.responseText);
      if (errorJson.error && errorJson.error.message) {
        errorDetail = errorJson.error.message;
      }
    } catch {
      if (response.responseText) {
        errorDetail = response.responseText.slice(0, 150);
      }
    }

    if (statusCode === 401) {
      errorDetail = 'Invalid API key or unauthorized (401). Please check your key in Settings.';
    } else if (statusCode === 402) {
      errorDetail = 'Insufficient OpenRouter credits / balance (402).';
    } else if (statusCode === 429) {
      errorDetail = 'Rate limit exceeded (429). Please try again shortly.';
    }

    logger.error(`OpenRouter connection test failed with status ${statusCode}: ${errorDetail}`);
    return {
      ok: false,
      model,
      latencyMs,
      error: errorDetail,
      status: statusCode,
    };
  } catch (err) {
    const latencyMs = Date.now() - startTime;
    const errorMsg = err?.message || 'Network error or connection timeout';
    logger.error(`OpenRouter request encountered network exception: ${errorMsg}`);
    return {
      ok: false,
      model,
      latencyMs,
      error: `Network Error: ${errorMsg}`,
      status: 'NETWORK_ERROR',
    };
  }
}

/**
 * Executes a single primary AI request to fill all detected form fields on the page
 */
export async function generateAutofillAnswers(normalizedFields, { allowSearch = true, jobContext = null, repairErrors = [] } = {}) {
  const settings = getSettings();
  const profile = getProfile();
  const model = settings.model || 'google/gemini-2.0-flash';

  if (!hasApiKey()) {
    throw new Error('No OpenRouter API key configured. Please set your key in Settings.');
  }

  const systemPrompt = `You are Job Copilot, filling an online job application for a candidate.

CRITICAL OPERATING RULES:
1. Ground all candidate claims strictly in the provided applicant profile, resume highlights, and applicant notes.
2. NEVER fabricate or invent unlisted jobs, employers, dates, metrics, degrees, tools, or certifications (Rule 11).
3. For structured questions (radio, select, checkbox, short text) where candidate preferences or standard defaults apply:
   - Explicit structured applicantProfile answers have priority over conflicting resume context, applicant notes, previous answers, and generic defaults. Preserve explicit No answers.
   - Work authorization and sponsorshipNow/sponsorshipFuture apply ONLY to applicantProfile.workCountry. Match the question's country, or the confirmed job work country when implicit. Do not transfer eligibility across countries or infer it from residence, nationality, or a phone number. Unknown country or unsupported eligibility: return an empty string. When structured eligibility is unset, only use unambiguous, country-specific facts from applicant context; never guess Yes or No.
   - For sponsorship "now OR in the future", answer Yes if either scoped answer is Yes; answer No only when BOTH scoped answers are No. Otherwise leave empty. Distinguish current from future sponsorship.
   - Years of experience dropdowns: infer the candidate's level (e.g. Senior, Mid, 5+ years) from their resume context and select the best matching option. Set "inferred": true.
   - Demographic surveys / EEOD / gender / pronouns / race or ethnicity / disability / veteran status: use ONLY the corresponding explicit structured profile answer. Not set means return an empty string, never a guessed identity or guessed No. Prefer not to answer means choose an actual decline option; if absent leave empty. Match meaning precisely: general veteran status does not establish protected veteran status, race does not establish Hispanic ethnicity, and gender does not establish sex assigned at birth. Use genderDescription only when gender is Self-describe. Do not mention demographics in unrelated narrative answers.
   - "How did you hear about us?" and equivalent job discovery/source questions: always LinkedIn. For option fields choose only an offered LinkedIn option; if unavailable return empty (combobox may search LinkedIn). Do not invent a referrer or replace a LinkedIn profile URL with this source answer.
   - Compensation must preserve expectedSalary, salaryCurrency and salaryPeriod together. Do not silently convert currency or annual/hourly pay. Total yearsExperience is not years with a particular tool. A preferred work arrangement does not imply willingness to accept all other arrangements. Past start dates require review, not a made-up new date.
   - Consent / Privacy / Background check agreement checkboxes: set value to true.
   - General, custom, or simulation text fields: provide a concise, relevant response based on the candidate's software background or profile. Follow NARRATIVE VOICE.
4. For narrative / open-ended questions (e.g. "Why do you want to work here?", "Describe your experience with X"):
   - Write a natural first-person answer using real facts from the resume context. Follow NARRATIVE VOICE.
   - Respect character limits if specified.
${NARRATIVE_VOICE_RULES}
5. For "select", "combobox", "radio", or "checkbox" fields:
   - Your "value" MUST be chosen strictly from the provided "options" list (matching either the option value or option label). Never leave a select on a placeholder like "-- Please Select --" or "Select...".
   - Options belong ONLY to their own fieldId. Never reuse a choice from another field.
   - For comboboxes, return the exact option label. If no options were discovered, or the candidate context does not support any available option, return an empty string. Never invent a label or choose the first/closest option just to fill the field.
   - Match the specific question against applicant context (phone dialing country, work location, nationality, degree and discipline are separate questions).
   - ${allowSearch ? 'Some comboboxes load only the first page of options. If the candidate\'s known answer is missing, leave value empty and include an optional "searchQuery" with a short search term grounded in the applicant context (e.g. the actual university name). A search query is NOT a selection. Omit it when the answer is unknown.' : 'These options are final search results. Do not request another search; leave value empty if there is no supported choice.'}
6. Return an answer object for EVERY field provided in "fieldsToFill".
7. Respond ONLY with a valid JSON object in this exact schema, without markdown code blocks:
{
  "answers": [
    {
      "fieldId": "string (must match fieldId from input)",
      "value": "string or boolean",
      "inferred": boolean${allowSearch ? ',\n      "searchQuery": "optional; only for an empty value requiring option discovery"' : ''}
    }
  ]
}`;

  const userContent = JSON.stringify({
    applicantProfile: profileForAI(profile),
    resumeContext: profile.resumeContext,
    applicantNotes: profile.applicantNotes,
    pageContext: {
      url: window.location.href,
      host: window.location.hostname,
    },
    jobContext,
    repairErrors,
    fieldsToFill: normalizedFields,
  });

  logger.info(`Sending unified autofill AI request for ${normalizedFields.length} fields using ${model}`);
  const startTime = Date.now();

  const payload = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });
  logger.info(`AI request: ${payload.length} characters, timeout ${AUTOFILL_TIMEOUT_MS / 1000}s`);

  const response = await sendAiRequest({
    method: 'POST',
    url: OPENROUTER_ENDPOINT,
    data: payload,
    timeout: AUTOFILL_TIMEOUT_MS,
  }).catch(err => {
    logger.warn(`AI request failed after ${Date.now() - startTime}ms using ${model}: ${err.message}`);
    throw err;
  });

  const latencyMs = Date.now() - startTime;

  if (response.status !== 200) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errJson = JSON.parse(response.responseText);
      if (errJson.error?.message) errorDetail = errJson.error.message;
    } catch {}
    throw new Error(`OpenRouter Error (${response.status}): ${errorDetail}`);
  }

  let rawContent = '';
  try {
    const data = JSON.parse(response.responseText);
    rawContent = data.choices?.[0]?.message?.content || '';
  } catch (err) {
    throw new Error(`Failed to parse OpenRouter response: ${err.message}`);
  }

  const cleaned = cleanJsonFence(rawContent);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    logger.error('Failed to parse AI answers JSON:', cleaned);
    throw new Error(`AI returned invalid JSON: ${err.message}`);
  }

  if (!parsed || !Array.isArray(parsed.answers)) {
    throw new Error('AI response missing "answers" array');
  }

  const fieldsById = new Map(normalizedFields.map((f) => [f.fieldId, f]));
  const seenIds = new Set();
  const fixedAnswers = new Map(normalizedFields.map(field => [field.fieldId, fixedProfileAnswer(field, profile, { allowSearch })]).filter(([, answer]) => answer));
  const candidateAnswers = [...parsed.answers.filter(ans => !fixedAnswers.has(ans?.fieldId)), ...fixedAnswers.values()];
  const validatedAnswers = candidateAnswers.filter((ans) => {
    if (!ans || !fieldsById.has(ans.fieldId) || seenIds.has(ans.fieldId)) {
      logger.warn('AI returned an unknown or duplicate field ID (omitted)');
      return false;
    }
    seenIds.add(ans.fieldId);
    const field = fieldsById.get(ans.fieldId);
    if (!allowSearch || field.type !== 'combobox' || ans.value !== '' ||
        typeof ans.searchQuery !== 'string' || !ans.searchQuery.trim() || ans.searchQuery.length > 200) {
      delete ans.searchQuery;
    } else {
      ans.searchQuery = ans.searchQuery.trim();
    }
    if (field.type === 'combobox' && ans.value !== '') {
      const option = findExactOption(field.options || [], ans.value);
      if (!option) {
        logger.warn(`AI[${ans.fieldId}]: rejected answer outside ${field.options?.length || 0} owned options`);
        return false;
      }
      ans.value = option.label;
    }
    if (!OPTION_FIELD_TYPES.has(field.type) && typeof ans.value === 'string') {
      ans.value = stripModelDashes(ans.value);
    }
    return true;
  });

  logger.info(`Received ${validatedAnswers.length} valid answers from AI in ${latencyMs}ms`);
  return {
    answers: validatedAnswers,
    latencyMs,
    model,
  };
}

/**
 * Rewrites an individual narrative field with optional user feedback instructions
 */
export async function rewriteNarrativeField({ fieldLabel, currentValue, feedback, constraints }) {
  const settings = getSettings();
  const profile = getProfile();
  const model = settings.model || 'google/gemini-2.0-flash';

  if (!hasApiKey()) {
    throw new Error('No OpenRouter API key configured.');
  }

  const systemPrompt = `You are Job Copilot. You are rewriting a single narrative response in a job application for the candidate.
Rules:
1. Stay strictly faithful to the candidate's actual experience from their resume highlights.
2. Incorporate the candidate's specific feedback and revision instructions.
3. Follow NARRATIVE VOICE. First-person. Stay concise.
4. Output ONLY the rewritten answer text with no surrounding quotes or commentary.
5. Explicit structured profile answers take precedence over conflicting notes. Eligibility applies only to workCountry. Do not guess unknown eligibility or demographics, expose demographics in unrelated answers, or convert compensation units. Job discovery source is always LinkedIn.
${NARRATIVE_VOICE_RULES}`;

  const userPrompt = `Question Label: ${fieldLabel}
Current Answer:
${currentValue}

Explicit Applicant Profile:
${JSON.stringify(profileForAI(profile))}

Candidate Resume Highlights:
${profile.resumeContext}

Applicant Notes / Rules:
${profile.applicantNotes}

User Revision Instructions:
${feedback || 'Make it clearer and more specific to this job.'}
${constraints?.maxLength ? `Maximum Length: ${constraints.maxLength} characters` : ''}`;

  logger.info(`Sending narrative rewrite request for "${fieldLabel}" using ${model}`);
  const startTime = Date.now();

  const payload = JSON.stringify({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.4,
  });

  const response = await sendAiRequest({
    method: 'POST',
    url: OPENROUTER_ENDPOINT,
    data: payload,
    timeout: 25000,
  });

  const latencyMs = Date.now() - startTime;

  if (response.status !== 200) {
    throw new Error(`Rewrite request failed (HTTP ${response.status})`);
  }

  const data = JSON.parse(response.responseText);
  const rewrittenText = data.choices?.[0]?.message?.content?.trim() || '';

  logger.info(`Narrative rewritten in ${latencyMs}ms (${rewrittenText.length} chars)`);
  return stripModelDashes(rewrittenText);
}
