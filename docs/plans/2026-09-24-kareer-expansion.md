# Explore Simplify parity features

> Current kareer project is, let's say, 80-90% working fine, but I still want to go that extra mile and mimic almost the exact same mechanics as Simplify. Simplify has a unique mechanic, unique applications like Workday, for example. Our Workday applications are fairly simple at the moment. It detects any field on the screen that is currently visible, and it auto-fills them, which is good for the most part.
>
> What Simplify does differently is that it is able to recognize experience sections, education sections, project sections, etc., and click Add on those sections, then dynamically place the user's experiences in a neat and seamless manner, almost like an actual agent that's doing the work. Ours is currently a very generic auto-filler, but I really want to go that extra mile and explore the possibilities of implementing this feature into our system. Not just for Workday, but for any other vacation or ATS that has these special mechanics in the applications. grill me[$grill-me](C:/Users/amrom//.agents/skills/grill-me/SKILL.md)so we get this right. [$superpowers:brainstorming](C:/Users/amrom//.codex/superpowers/skills/brainstorming/SKILL.md)&#x20;
> it's not just the only feature that I want. I want to explore what Simplify has in its toolbox and suggest changes and features to implement to replicate Simplify one-to-one, or perhaps even go a level higher (because ours already has special features that Simplify doesn't have). We want to combine both and just come out with a superior version.

<details><summary>59 previous messages</summary>

> I’ll inspect Kareer’s current application flow and feature set, then research Simplify’s current behavior. I’ll use your grill-me and brainstorming skills to narrow the opportunities into a concrete implementation plan.
>
> <details><summary>Ran 7 commands, searched the web</summary>
>
> - Ran `Get-Content 'C:\Users\amrom\.codex\superpowers\.codex\INSTALL.md'; Get-Content 'C:\Users\amrom\.codex\RTK.md'; Get-Content 'C:\Users\amrom\.agents\skills\grill-me\SKILL.md'; Get-Content 'C:\Users\amrom\.codex\superpowers\skills\brainstorming\SKILL.md'`
>
> - Ran `rtk git status --short; rtk git log -5 --oneline; rtk rg --files -g 'README*' -g 'package.json' -g 'AGENTS.md' -g 'src/**' -g 'tests/**' -g 'fixtures/**' -g 'docs/**'`
>
> Searched the web for `site:simplify.jobs autofill Workday experience education projects add entries Simplify Copilot ...`
>
> - Ran `rtk rg -n "Workday|experience|education|project|Add|dynamic|Simplify|roadmap|feature" README.md CONTEXT_AND_FINDINGS.md src/core/adapters src/core/autofill.js src/core/agent.js src/core/application.js src/core/profile.js src/core/fields tests/e2e/adapters.spec.js tests/e2e/autofill.spec.js`
>
> - Ran `rtk proxy powershell -NoProfile -Command "Get-Content package.json; Get-Content src/core/adapters/workday.js; Get-Content src/core/adapters/index.js"`
>
> Searched the web for `https://help.simplify.jobs/articles/2415391-using-copilot-to-autofill-applications`
>
> - Ran `rtk proxy powershell -NoProfile -Command "Get-Content fixtures/workday-application-fixture.html | Select-Object -First 170; Get-Content tests/e2e/adapters.spec.js | Select-Object -First 75; Get-Content src/core/ai.js | Select-Object -First 125"`
>
> - Ran `rtk rg -n "export |async function|function |class |late|repeat|section|click|autofill|profile|resume" src/core/agent.js src/core/application.js src/core/autofill.js src/core/navigation.js src/core/observer.js src/core/fields/scanner.js src/core/memory.js src/core/jobs.js src/core/ui.js`
>
> - Ran `rtk proxy powershell -NoProfile -Command "Get-Content README.md | Select-Object -Skip 55 -First 47; Get-Content README.md | Select-Object -Skip 185 -First 50; Get-Content src/core/profile.js | Select-Object -First 130"`
>
> </details>
>
> The main gap is clear in Kareer’s current code: its Workday adapter handles step navigation and dropdown quirks, but the saved profile has no structured list of jobs, schools, or projects for an “Add another” flow to draw from. The Workday test fixture covers a name field and a dropdown, not repeating sections. Simplify publicly describes a wider workflow around autofill, resume tailoring, saved answers, and application tracking, and claims support for over 100 portals. ([Simplify Copilot](https://simplify.jobs/copilot), [autofill guide](https://help.simplify.jobs/articles/2415391-using-copilot-to-autofill-applications))
>
> I’ll use the brainstorming skill for the design and grill-me for the interview, one consequential choice at a time. First, I want to settle the product boundary.
>
> User input response
>
> - How broad should the “superior to Simplify” plan be?
>   - Phased full roadmap (Recommended)
>
> <details><summary>Ran 2 commands</summary>
>
> - Ran `rtk rg -n "PROFILE_DEFAULTS|resumeContext|resume|autoSubmit|autoAdvance|applicationMode|autofillEnabled|navigation|auto" src/core/storage.js src/core/ui.js src/core/application.js src/core/agent.js src/core/main.js src/core/sessions.js src/core/platform.js`
> - Ran `rtk proxy powershell -NoProfile -Command "Get-Content src/core/application.js | Select-Object -First 130; Get-Content src/core/application.js | Select-Object -Skip 330 -First 185; Get-Content src/core/storage.js | Select-Object -First 160"`
>
> </details>
>
> User input response
>
> - When Kareer recognizes an “Add experience/education/project” section, how should it act?
>   - Fill all entries (Recommended)
>
> User input response
>
> - Where should Kareer get the individual experiences, schools, and projects it adds to ATS forms?
>   - Manual profile entries
>
> That sets a useful direction: Kareer can create every relevant row from user-entered, structured records after one Autofill click. It can use the existing Continue and Submit settings for later steps. Manual entry also makes the source of each employer, degree, date, and project explicit, which fits Kareer’s truthful-grounding rule. I’m checking the rest of Simplify’s published workflow before we rank what belongs in the first release.
>
> <details><summary>Searched the web</summary>
>
> Searched the web for `site:help.simplify.jobs/articles/ "Manage Autofill Settings" "Simplify" ...`
>
> </details>
>
> User input response
>
> - Which repeatable records must the first milestone handle?
>   - All repeatable sections
>
> User input response
>
> - For repeatable sections Kareer has never seen before, what should “all” mean?
>   - Templates plus custom lists (Recommended)
>
> The first milestone is now broader than Workday: it needs common record templates plus a way for users to save custom lists, with confident matching before Kareer creates rows. I found another product distinction to settle: Simplify’s job matches and tracker rely on a connected platform, while Kareer’s repository currently defines a browser-only runtime with no backend. That choice affects how far the later roadmap can go. ([Simplify job matches](https://help.simplify.jobs/articles/2166608-using-your-job-matches), [job tracker](https://help.simplify.jobs/en/articles/2140179-using-the-job-tracker))
>
> User input response
>
> - Should the roadmap preserve Kareer’s browser-only, local-first architecture, or may later milestones introduce a backend?
>   - Stay browser-only (Recommended)
>
> User input response
>
> - When an ATS allows several entries but the user has many saved records, which ones should Kareer add?
>   - All eligible records (Recommended)
>
> <details><summary>Ran 2 commands</summary>
>
> - Ran `rtk rg -n "function .*|export .*|fieldId|id:|data-automation-id|closest|section|visible|label" src/core/fields/scanner.js src/core/fields/labels.js src/core/navigation.js | Select-Object -First 170`
> - Ran `rtk proxy powershell -NoProfile -Command "Get-Content src/core/constants.js | Select-Object -First 130; Get-Content src/core/memory.js; Get-Content src/core/jobs.js; Get-Content src/core/sessions.js | Select-Object -First 100"`
>
> </details>
>
> User input response
>
> - After repeatable-section autofill, which gap should Kareer tackle first?
>   - More ATS coverage (Recommended)
>
> User input response
>
> - How should we choose ATS platforms after Workday?
>   - Named competitor set
>
> User input response
>
> - If an ATS already created rows from an uploaded resume, how should Kareer handle them?
>   - Match and complete (Recommended)
>
> The rollout order is taking shape: Workday first, then iCIMS, Taleo, Avature, and SmartRecruiters. On resume-imported rows, Kareer should match and complete what is there, then add only missing records. That requires row identity checks so a retry does not duplicate entries. Before I sketch approaches, one boundary matters for “all repeatable sections”: some lists contain another person’s contact details.
>
> User input response
>
> - Should Kareer automatically enter saved references and other third-party contact details when an ATS requests them?
>   - Fill if enabled
>
> User input response
>
> - Once repeatable sections and the named ATS coverage are reliable, what should come next?
>   - Resume tools (Recommended)
>
> User input response
>
> - What matters most when judging whether Kareer has surpassed Simplify?
>   - Accurate completion (Recommended)
>
> User input response
>
> - Who should the first milestone work well for?
>   - Broad job seekers (Recommended)
>
> Kareer’s flat field scanner is a good base for filling an existing row, but its workflow treats major DOM changes during filling as a reason to pause. Adding rows deliberately needs a new, bounded step that identifies a section, creates or matches rows, fills each row, and verifies the result before navigation.
>
> I see three implementation approaches: a shared section planner with small ATS adapters; separate row scripts for each ATS; or an AI agent that chooses every DOM click. I recommend the shared planner. It gives us reusable behavior for custom lists while keeping site-specific selectors narrow and testable. Separate scripts can be precise but costly to maintain; an AI click agent is more flexible but weaker on your accuracy goal.
>
> User input response
>
> - Which approach should the design use for creating and filling repeatable ATS rows?
>   - whatever we currently have is working fine. having ATS specific scripts will definitely help and i think we should add them. also shared planner is good, ATS specific detection hooks (which i believe we have already to an extent; the ats adapters). we still want the AI to craft the open ended questions and fill all required fields that our normal non-AI system wouldnt be able to. we want to build on what we have right now, not scrap it.
>
> Agreed. I’ll treat the existing scanner, fillers, AI answer path, navigation engine, and ATS adapters as the foundation. The shared planner will coordinate rows; each ATS can supply a specific section recipe where its DOM requires one. AI will keep handling open-ended questions and ambiguous field meaning, grounded in saved data. That avoids replacing the working field pipeline.
>
> User input response
>
> - If a required field in a repeatable row has no verified value in the saved record, what should Kareer do?
>   - Pause and ask (Recommended)
>
> User input response
>
> - If an ATS caps a section below the number of enabled saved records, how should Kareer proceed?
>   - Ask before filling
>
> User input response
>
> - Where should users manage the new repeatable records and custom lists?
>   - Dedicated profile page (Recommended)
>
> User input response
>
> - Must the first repeatable-section release work in both the extension and Tampermonkey userscript?
>   - Extension first
>
> One tradeoff to preserve: “all repeatable sections” cannot mean guessing every future ATS control. The design can cover a broad set of built-in record types and let users define custom lists, then stop when a section cannot be matched confidently. Your choices also set two clear exceptions to the automatic flow: ask for missing required facts, and ask which records to use when an ATS imposes a row limit.
>
> User input response
>
> - Can we use a recording or screenshots of Simplify filling a real repeatable Workday section to check the mechanics?
>   - Use public sources
>
> User input response
>
> - How much structure should a user-defined list require?
>   - wtf is a user defined list??? nigga we just want the profile page to fucking have the profile config, all the experiences, work, projects, etc. if by list you mean those exact fields like "name, email, phone" then yes these can be easily created filled with no AI help. be clear with what youre asking.
>
> You’re right—I used “custom list” without explaining it. I meant a rare ATS section outside normal profile categories, such as professional memberships. Your core requirement is straightforward: a normal profile page where someone saves multiple jobs, schools, projects, and other background entries, alongside name, email, and phone. I’ll use that model.
>
> One narrow choice remains about unusual sections:
>
> User input response
>
> - If an application has a rare repeating section, such as professional memberships, how should the profile page handle it?
>   - Add new category
>
> <details><summary>Ran a command</summary>
>
> - Ran `rtk proxy powershell -NoProfile -Command "Get-Content src/targets/extension/options/index.html | Select-Object -First 120; Get-Content src/targets/extension/options/index.js | Select-Object -First 130; Get-Content src/core/platform.js | Select-Object -First 125"`
>
> </details>
>
> User input response
>
> - Should the first milestone support one saved background or multiple selectable backgrounds for different career paths?
>   - One base profile (Recommended)
>
> User input response
>
> - After ATS coverage and resume tools, which browser-only feature should come first?
>   - Stop at applications
>
> That narrows the roadmap to the application workflow and the materials used in it. I’ll still compare Kareer against Simplify’s tracker and discovery tools so the opportunities are visible, but I won’t put those products in the implementation sequence. The sequence is repeatable sections, wider ATS coverage, then application materials.
>
> User input response
>
> - For the application-materials milestone, which package do you want?
>   - Resume plus cover letter (Recommended)
>
> User input response
>
> - Should Kareer remember a user-edited answer to a job-specific question for future applications?
>   - No answer memory
>
> User input response
>
> - When Kareer drafts a tailored resume or cover letter, when may it attach that document to an application?
>   - Auto-attach then review
>
> User input response
>
> - How should tailored resume versions be produced from the current uploaded resume?
>   - Profile-built resume (Recommended)
>
> <details><summary>Ran a command</summary>
>
> - Ran `rtk proxy powershell -NoProfile -Command "Get-Content src/core/ui.js | Select-Object -Skip 1900 -First 85; Get-Content src/core/ui.js | Select-Object -Skip 2300 -First 110; Get-Content src/core/ui.js | Select-Object -Skip 1305 -First 80"`
>
> </details>
>
> Here’s the proposed profile design. Extend the existing extension Options page with repeatable cards for work history, education, projects, credentials, languages, volunteering, awards, publications, and references. Each card can hold multiple named entries, an enabled switch, and a user-set order. A user can add a new profile category when an uncommon application section calls for one. Existing name, contact, preferences, resume file, and background notes stay available. Old profiles open with empty new sections; Kareer does not turn freeform notes into unapproved records. The in-page panel shows a compact summary and opens the full editor when needed. Chrome and Firefox get this editor first; the userscript keeps its current autofill until the later parity pass.
>
> User input response
>
> - Does this profile design match the information you want Kareer to use for repeatable sections?
>   - Yes, use this design (Recommended)
>
> For the ATS flow, the same Autofill action would first let any resume upload settle, then inspect the page for repeatable sections. Kareer would match saved records to rows already present, fill missing values there, and create rows only for unmatched enabled records. The shared coordinator would handle ordering, retries, and verification; Workday and later ATS adapters would provide their specific section and Add controls. Normal fields and open-ended answers would continue through Kareer’s existing AI and filler paths.
>
> A run would stop with a clear reason if a required fact is missing, a row match is uncertain, or an Add action does not produce the expected row. It would ask which records to use before filling a known capped section. Repeating Autofill should complete unfinished work without creating duplicate rows.
>
> User input response
>
> - Is this the right behavior for the existing Autofill and multi-step workflow buttons?
>   - sounds good except we still want all required fields to be filled, even if some info is missing, the AI should infer the best possible choice to choose from user's profile, and it can be flagged as uncertain/inferred/yellow zone. the idea is to keep it going. no abrupt pauses, we want the experience to be 90% autonomous and convenient asf for the user
>
> That changes the behavior in a useful way. I’ll remove the proposed pause for every missing field. Kareer should use AI to choose an answer when the saved profile supports a reasonable inference, mark it yellow for review, and keep working through the rest of the page. A name, employer, degree, date, or credential with no supporting information still cannot be made up under Kareer’s truthful-grounding rule. I want to settle what the run should do in that last case.
>
> User input response
>
> - If a required fact has no support anywhere in the saved profile, what should Kareer do?
>   - Use a plausible guess
>
> User input response
>
> - Does “plausible guess” include factual credentials—for example, inventing a graduation date or employer when the profile has no evidence?
>   - Enter factual guesses
>
> Understood. That is a deliberate change to Kareer’s current rule against inventing jobs, dates, and credentials. I can reflect it in the plan as a yellow, explicitly guessed value, but it cannot count as verified information. It also changes the meaning of “accurate completion,” so the submission gate matters.
>
> User input response
>
> - May Kareer submit an application while it contains yellow, unsupported factual guesses?
>   - Submit if enabled
>
> User input response
>
> - Which answers should Kareer always leave for direct user input, even with aggressive guessing enabled?
>   - No extra exclusions
>
> <details><summary>Ran 2 commands</summary>
>
> - Ran `rtk rg -n "copy|clipboard|cover letter|resume score|keyword|profile tab|save.*answer|answer.*save|field.*toggle|field.*disable" src/core src/targets/extension/options README.md`
> - Ran `rtk proxy powershell -NoProfile -Command "Get-Content src/targets/extension/background/documents.js | Select-Object -First 180; Get-Content src/core/resume.js | Select-Object -First 120; Get-Content src/core/migration.js | Select-Object -First 130"`
>
> </details>
>
> User input response
>
> - Should unsupported-fact guessing be enabled by default for every Kareer user?
>   - on by default. now stop fucking asking so many questions about this. everything is clear.
>
> <details><summary>Ran 3 commands</summary>
>
> - Ran `rtk rg -n "inferred|generateAutofillAnswers|prompt|JSON|no.*invent|unknown|skip|answers" src/core/ai.js src/core/autofill.js src/core/agent.js | Select-Object -First 180`
> - Ran `rtk proxy powershell -NoProfile -Command "Get-Content src/core/ai.js | Select-Object -Skip 145 -First 50; Get-Content src/core/ai.js | Select-Object -Skip 535 -First 43; Get-Content src/core/ui.js | Select-Object -Skip 1850 -First 55"`
> - Ran `rtk proxy powershell -NoProfile -Command "Get-Content playwright.config.js | Select-Object -First 120; Get-Content src/targets/extension/manifest.base.json | Select-Object -First 100"`
>
> </details>
>
> Plan
>
> # Kareer application workflow upgrade
>
> ## Summary
>
> Build on Kareer’s existing scanner, fillers, AI path, navigation engine, and ATS adapters. The first priority is creating and filling repeating application sections; the second is coverage on more complex ATS platforms; the third is resume and cover letter tools.
>
> Simplify publicly offers per-field autofill controls, support for over 100 portals, resume tailoring, cover letters, and tracking. Kareer’s browser-only roadmap will focus on the **application workflow**; job discovery and tracking are outside the implementation sequence you chose. Public sources describe Simplify’s capabilities but do not establish its exact Workday click sequence. ([Copilot](https://simplify.jobs/copilot), [autofill settings](https://help.simplify.jobs/articles/8686025-manage-autofill-settings-in-the-simplify-extension), [autofill guide](https://help.simplify.jobs/articles/2415391-using-copilot-to-autofill-applications))
>
> ## Implementation
>
> 1. **Structured profile.** Extend the existing extension Options page with multiple entries for work, education, projects, credentials, skills, languages, volunteering, awards, publications, and references. Users can add a named category for an uncommon section. Each record has a stable ID, explicit fields, an enabled switch, and user-set order. Preserve existing profile data; leave new sections empty until entered manually. Ship the editor in Chrome and Firefox first, with userscript parity later.
>
> 2. **Repeatable-section coordinator.** Add a shared workflow—discover section → match existing rows → create missing rows → scan row fields → fill → verify—that runs from both *Autofill This Page* and *Start Application*. ATS adapters supply specific section, row, and Add-control logic; the existing field actuators remain in place. Workday is first. Resume-parsed rows are matched and completed, never cleared wholesale. Store row progress in the application session so retries and navigation do not create duplicates. Ask the user to select records before filling a section with a known row cap.
>
> 3. **AI and review behavior.** Give AI the relevant saved record and row context for ambiguous fields and open-ended questions, using the existing page answer path rather than a request per row. Mark unsupported factual guesses yellow and keep filling other fields. Per your choice, guessing is on by default and existing **Auto Submit** may submit yellow answers; the panel must distinguish saved, inferred, guessed, verified, and unresolved values. Preserve Kareer’s existing hard stops for assessments, identity verification, recorded interviews, e-signatures, and legal attestations. This guessing policy explicitly replaces the repository’s current “never invent facts” rule and must be reflected in its instructions and user-facing documentation.
>
> 4. **Coverage and application tools.** After Workday, add fixture-backed section recipes for iCIMS, Taleo, Avature, then SmartRecruiters. Keep the generic fallback and current adapters working. Add per-field autofill switches, quick copying of profile details on unsupported pages, and document selection. Do not add cross-application memory for edited essay answers.
>
> 5. **Application materials.** Compare a saved resume with the job description, then generate role-specific resume PDFs from the approved profile records and draft a cover letter from the same data. Keep the uploaded original unchanged and store generated versions locally. Attach a generated version when selected, show its changes for review, and require document review before final submission.
>
> ## Verification and release gates
>
> - Add unit tests for section detection, row matching, record ordering, provenance, limits, and retry bounds. Add real-extension E2E fixtures for each claimed ATS, starting with Workday rows that are empty, resume-populated, capped, conditional, and partially filled.
> - Verify rerunning Autofill creates no duplicate records, fills the correct row, preserves existing values according to the current overwrite setting, and reports unresolved controls. Test yellow guesses with Auto Submit and every existing hard-stop page.
> - Run `npm test` and `npm run test:e2e` for each milestone. Log findings and changes in `CONTEXT_AND_FINDINGS.md`; capture a live fixture and E2E regression for every live ATS bug.
>
> ## Assumptions
>
> One base profile powers all applications. The product remains browser-only, local-first, and BYOK. Accuracy reporting counts verified answers separately from guesses: a yellow guess may be convenient, but it is not evidence that the entered fact is correct.
>
> Plan implementation
>
> Status: running
> # Kareer application workflow upgrade
>
> ## Summary
>
> Build on Kareer’s existing scanner, fillers, AI path, navigation engine, and ATS adapters. The first priority is creating and filling repeating application sections; the second is coverage on more complex ATS platforms; the third is resume and cover letter tools.
>
> Simplify publicly offers per-field autofill controls, support for over 100 portals, resume tailoring, cover letters, and tracking. Kareer’s browser-only roadmap will focus on the **application workflow**; job discovery and tracking are outside the implementation sequence you chose. Public sources describe Simplify’s capabilities but do not establish its exact Workday click sequence. ([Copilot](https://simplify.jobs/copilot), [autofill settings](https://help.simplify.jobs/articles/8686025-manage-autofill-settings-in-the-simplify-extension), [autofill guide](https://help.simplify.jobs/articles/2415391-using-copilot-to-autofill-applications))
>
> ## Implementation
>
> 1. **Structured profile.** Extend the existing extension Options page with multiple entries for work, education, projects, credentials, skills, languages, volunteering, awards, publications, and references. Users can add a named category for an uncommon section. Each record has a stable ID, explicit fields, an enabled switch, and user-set order. Preserve existing profile data; leave new sections empty until entered manually. Ship the editor in Chrome and Firefox first, with userscript parity later.
>
> 2. **Repeatable-section coordinator.** Add a shared workflow—discover section → match existing rows → create missing rows → scan row fields → fill → verify—that runs from both *Autofill This Page* and *Start Application*. ATS adapters supply specific section, row, and Add-control logic; the existing field actuators remain in place. Workday is first. Resume-parsed rows are matched and completed, never cleared wholesale. Store row progress in the application session so retries and navigation do not create duplicates. Ask the user to select records before filling a section with a known row cap.
>
> 3. **AI and review behavior.** Give AI the relevant saved record and row context for ambiguous fields and open-ended questions, using the existing page answer path rather than a request per row. Mark unsupported factual guesses yellow and keep filling other fields. Per your choice, guessing is on by default and existing **Auto Submit** may submit yellow answers; the panel must distinguish saved, inferred, guessed, verified, and unresolved values. Preserve Kareer’s existing hard stops for assessments, identity verification, recorded interviews, e-signatures, and legal attestations. This guessing policy explicitly replaces the repository’s current “never invent facts” rule and must be reflected in its instructions and user-facing documentation.
>
> 4. **Coverage and application tools.** After Workday, add fixture-backed section recipes for iCIMS, Taleo, Avature, then SmartRecruiters. Keep the generic fallback and current adapters working. Add per-field autofill switches, quick copying of profile details on unsupported pages, and document selection. Do not add cross-application memory for edited essay answers.
>
> 5. **Application materials.** Compare a saved resume with the job description, then generate role-specific resume PDFs from the approved profile records and draft a cover letter from the same data. Keep the uploaded original unchanged and store generated versions locally. Attach a generated version when selected, show its changes for review, and require document review before final submission.
>
> ## Verification and release gates
>
> - Add unit tests for section detection, row matching, record ordering, provenance, limits, and retry bounds. Add real-extension E2E fixtures for each claimed ATS, starting with Workday rows that are empty, resume-populated, capped, conditional, and partially filled.
> - Verify rerunning Autofill creates no duplicate records, fills the correct row, preserves existing values according to the current overwrite setting, and reports unresolved controls. Test yellow guesses with Auto Submit and every existing hard-stop page.
> - Run `npm test` and `npm run test:e2e` for each milestone. Log findings and changes in `CONTEXT_AND_FINDINGS.md`; capture a live fixture and E2E regression for every live ATS bug.
>
> ## Assumptions
>
> One base profile powers all applications. The product remains browser-only, local-first, and BYOK. Accuracy reporting counts verified answers separately from guesses: a yellow guess may be convenient, but it is not evidence that the entered fact is correct.
</details>
