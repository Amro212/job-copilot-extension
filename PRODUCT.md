# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Job seekers applying to multiple positions across major Applicant Tracking Systems (Workday, Greenhouse, Lever, Ashby, and generic web forms) who want to apply quickly, accurately, and privately without repetitive manual copy-pasting.

## Product Purpose
Kareer is an open-source, local-first browser assistant (Chrome/Firefox extension and Tampermonkey userscript) that scans job application forms, matches questions to a user's verified profile data, and fills out complex web forms (inputs, comboboxes, dropdowns, radios, checkboxes, file uploads). It speeds up applications from 15+ minutes to seconds while guaranteeing zero data leakage and strictly avoiding AI hallucinations.

## Positioning
Private, local-first Bring-Your-Own-Key (BYOK) architecture with zero telemetry, running entirely in the user's browser without external backends or subscriptions, with strict truthful grounding that refuses to fabricate credentials or answers.

## Operating Context
Operates directly within candidate-facing application pages across Ashby, Greenhouse, Lever, Workday, and generic job boards. The user interacts with the tool while viewing the job application form itself in real-time.

## Capabilities and Constraints
- In-browser field detection, classification, and multi-page application navigation.
- Actuator layer with synthetic events for custom comboboxes and multi-selects.
- Sandboxed API key handling in background workers/GM storage (isolated from page scripts).
- Single persistent Shadow DOM host in top frame only, avoiding host page style collisions.
- Frozen actuator layer (no chrome.debugger, no stealth scripts, no CAPTCHA solving).
- Safety boundaries: pauses for assessments, identity verification, recorded interviews, e-signatures, and legal attestations.

## Brand Commitments
- Name: Kareer
- Voice: Precise, trustworthy, unobtrusive, transparent, professional.
- Design Language: Operates within the page without hijacking focus; dark, focused HUD with high-contrast semantics and restrained accents.

## Evidence on Hand
- Full browser extension codebase (Chrome MV3 + Firefox) and Tampermonkey userscript.
- Dedicated adapters for Workday, Greenhouse, Lever, Ashby, and Generic forms.
- Full profile and settings storage schemas.

## Product Principles
- **Unobtrusive presence**: The assistant serves the task; it never obscures critical form fields or submit buttons.
- **Truthful grounding**: Never invent credentials, dates, tools, or metrics. Highlight missing data for the user.
- **Safety first**: Pause for legal, financial, signature, or assessment gates.
- **Instant scanability**: Status, progress, and reviewable items must be readable in milliseconds.

## Accessibility & Inclusion
- High contrast (≥4.5:1 for body/labels, ≥3:1 for large text).
- Full keyboard navigability (Escape to collapse, Tab indexing).
- Clear screen-reader semantics and aria-labels for all interactive states.
