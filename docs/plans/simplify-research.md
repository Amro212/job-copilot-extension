Yes. The public evidence is much stronger than I initially realized. There is enough to reconstruct a pretty convincing picture of Simplify's architecture without guessing.

## 1. The key finding: Simplify uses ATS-specific adapters

A 2026 forensic analysis of Simplify Copilot v2.4.5 extracted its shipped extension and runtime configuration. It found that Simplify downloaded a roughly **2.3 MB remote configuration** from `sabre.simplify.jobs` containing mappings for **49 ATS/platforms and 137 canonical field types**. ([GitHub][1])

The ATS list in that captured configuration included:

```text
ADP
ADP2
Amazon
AmazonUniversity
Apple
AshbyHQ
Avature
BambooHR
BrassRing
BreezyHR
ByteDance
Comeet
DayforceHCM
Eightfold
FreshTeam
Google
Greenhouse
Homerun
ICIMS
IBM
Indeed
JazzHR
JobScore
Jobvite
Lever
LinkedIn
Meta
Netflix
Okta
OracleCloud
Paylocity
PhenomPeople
PinpointHQ
Polymer
Recruitee
Rippling
Roblox
SmartRecruiters
SuccessFactors
Taleo
TalNet
Teamtailor
Tesla
TriNetHire
Uber
Ultipro
Waymo
Workable
Workday
```

([GitHub][1])

So it is **not** primarily doing:

```text
DOM
→ send entire thing to LLM
→ LLM decides everything
→ click around
```

Instead, evidence shows something much closer to:

```text
URL
↓
identify ATS
↓
load ATS-specific config
↓
known selectors → canonical fields
↓
resolve canonical fields from profile
↓
handle unknown questions separately
```

---

# 2. What an ATS "adapter" looks like

The captured config has a structure roughly like:

```json
{
  "urls": [
    "*://recruiting.adp.com/srccar/public/*",
    "*://myjobs.adp.com/*/cx/*"
  ],
  "inputSelectors": [
    ["email", [".//input[starts-with(@name, \"emailAddress\")]"]],
    ["first_name", [".//input[starts-with(@name, \"firstName\")]"]],
    ["ethnicity", ["..."]],
    ["gender", ["..."]],
    ["disability_v2", ["..."]],
    ["veteran_v2", ["..."]]
  ]
}
```

([GitHub][1])

That is extremely important.

Conceptually, the abstraction is:

```ts
ATSAdapter {
    urlPatterns: string[]

    inputSelectors: {
        canonicalField: XPath[] | CSSSelector[]
    }
}
```

So Workday might know:

```text
this weird Workday input
          ↓
canonical key: phone
```

while Greenhouse knows:

```text
this completely different Greenhouse element
          ↓
canonical key: phone
```

Everything above that layer can just deal with:

```text
phone
email
first_name
last_name
work_auth
sponsorship
education
resume
...
```

rather than knowing how every website represents them.

The forensic analysis explicitly says the content script first matches the current URL against the ATS URL patterns, then uses that ATS's selectors to identify the fields. ([GitHub][1])

---

# 3. Deterministic fields appear to be the core of the system

The captured schema contains canonical fields including:

```text
first_name
email
phone
address
birthday
resume
work_auth
sponsorship
salary_requirements
gender
ethnicity
veteran_v2
disability_v2
...
```

There were **137 distinct field keys** in that version. ([GitHub][2])

Simplify's own documentation separately says Copilot's profile contains things such as:

* contact information
* education
* work experience
* skills
* resumes
* links/profile information

and that Copilot uses the profile as the source for autofill. ([Simplify Jobs][3])

So the most strongly supported deterministic flow is:

```text
Workday DOM
    ↓
ATS adapter recognizes element
    ↓
canonical field = "phone"
    ↓
candidate profile["phone"]
    ↓
"+1 647 ..."
    ↓
DOM action executor
```

There is no reason to involve an LLM in that process.

And Simplify's settings expose individual deterministic categories such as Phone, Location, Education, Work Authorization, LinkedIn URL, Disability and Salary. ([Simplify Jobs][4])

That reinforces the idea of a predefined canonical field schema.

---

# 4. Their own engineering interview basically describes this architecture

Simplify publicly maintains an extension engineering take-home.

It specifically asks candidates to:

* build a TypeScript/React browser extension
* locate elements using **XPath**
* execute actions sequentially
* maintain `unfilled → filling → filled` state
* wait for navigation before declaring an action complete
* optionally make the autofill engine **JSON-configurable**

Their example configuration is basically:

```json
{
    "path": "...XPath...",
    "actions": [
        {
            "method": "default",
            "value": "foo"
        },
        {
            "path": "...another XPath...",
            "method": "click"
        }
    ]
}
```

([GitHub][5])

That alone wouldn't prove production does the same thing.

But the independent analysis subsequently found **production Simplify literally downloading XPath/CSS-based ATS mappings**.

Those two pieces of evidence line up extremely well. ([GitHub][5])

So I'd describe their engine to your agent as **data-driven ATS adapters + an action executor**, rather than hundreds of separately coded autofill scripts.

---

# 5. Then there is a second class: "unique questions"

Simplify officially distinguishes:

### Common Questions

Things such as:

```text
contact information
education
employment
work authorization
demographics
links
```

### Unique Questions

Things such as:

```text
Why do you want to work here?

Describe a project you're proud of.

Why are you interested in this role?
```

([Simplify Jobs][6])

This distinction is probably the central design idea.

You can conceptualize the router as:

```ts
if (fieldMatchesKnownCanonicalField) {
    return deterministicProfileValue;
}

if (savedAnswerExists(questionText)) {
    return savedAnswer;
}

if (aiAutofillEnabled) {
    return generateAIAnswer(questionContext);
}

return UNRESOLVED;
```

The exact source code for that router isn't public, so that pseudocode is an architectural synthesis, but **every branch is directly supported by Simplify's documented behavior**.

---

# 6. Saved answers come BEFORE needing fresh AI

This part is particularly interesting.

Simplify says that when you manually answer a unique question, it remembers that response.

If the **exact same wording** occurs again, it can reuse the previous answer automatically rather than generating another one. ([Simplify Jobs][7])

They explicitly distinguish:

```text
"Where do you see yourself in 5 years?"
```

from:

```text
"Where do you see yourself in the future?"
```

as different questions. ([Simplify Jobs][7])

That strongly suggests a lookup layer conceptually similar to:

```ts
savedAnswers[questionText]
```

possibly after basic normalization.

This gives them another deterministic route:

```text
unknown ATS field
↓
extract label/question
↓
"Why do you want to work here?"
↓
saved-answer lookup
↓
existing answer found
↓
fill without LLM generation
```

Their privacy policy also says the extension stores **recent answers locally on the device**, along with a copy of the profile and resume. ([Simplify][8])

---

# 7. AI is the fallback/customization layer

When standard autofill cannot resolve a question, Simplify says it appears as an **Application AI Question**.

For AI generation, Simplify says the context includes:

```text
question
+
current job description
+
company
+
role
+
Simplify profile
+
resume
```

([Simplify Jobs][7])

So logically:

```text
DOM
  ↓
label = "Why do you want to work at Stripe?"
  ↓
not known canonical profile field
  ↓
no exact saved response
  ↓
AI enabled
  ↓
{
    question,
    jobDescription,
    company,
    role,
    candidateProfile,
    resume
}
  ↓
LLM/backend
  ↓
generated answer
  ↓
normal DOM executor fills textarea
```

The **AI isn't necessarily responsible for manipulating the page**.

The normal autofill engine can still perform the actual insertion.

AI only resolves:

> "What value should this field contain?"

while the ATS engine solves:

> "Which DOM node is this field, and how do I make this ATS accept the value?"

That's a very important architectural separation.

---

# 8. Form recognition itself appears mostly deterministic

Their current documentation says:

> "Copilot detects the form automatically and starts matching fields using your Simplify profile."

and explicitly names Workday, Lever, Greenhouse, Ashby, iCIMS and Taleo. ([Simplify Jobs][3])

The reverse-engineered configuration explains how that detection works at least in v2.4.5:

```text
current URL
↓
iterate known ATS configurations
↓
URL pattern match
↓
ATSKey = Workday
↓
Workday selector map
```

([GitHub][1])

So a likely structure is:

```ts
const adapter = adapters.find(adapter =>
    adapter.urls.some(pattern => matches(location.href, pattern))
);
```

rather than AI trying to infer "this looks like Workday."

---

# 9. Why this works far better than a generic Tampermonkey autofiller

This directly explains the issues you've been running into.

Your generic script sees:

```html
<input role="combobox">
```

and has to somehow determine:

```text
what is this?
what values does it allow?
how do I trigger it?
does it require a click?
where is its popup?
is Enter sufficient?
does React need a native setter?
```

Simplify already knows:

```text
ATS = Workday

this XPath = country
this XPath = phone
this XPath = education
this XPath = work authorization
...
```

And potentially ATS-specific interaction behavior can be attached to those fields.

So the difficult problem becomes a maintenance problem instead of an AI problem.

---

# 10. It's remotely configurable

This is probably one of Simplify's biggest engineering advantages.

The captured v2.4.5 extension fetched the ATS configuration remotely from:

```text
sabre.simplify.jobs
```

instead of shipping every mapping permanently in the extension bundle. ([GitHub][1])

That means if Workday changes:

```text
old DOM structure
↓
Simplify's selectors break
↓
Simplify updates server config
↓
extension downloads new mappings
```

They may not need to release a new Chrome extension every time an ATS changes.

The captured configuration even had its own version:

```text
2026-04-20_17-58-36
```

([GitHub][2])

That's a very good architecture for what they're doing.

---

# 11. Content script + background/service worker split

The analyzed v2.4.5 extension was Manifest V3 and had roughly:

```text
contentScript.bundle.js     ~1.7 MB
background.bundle.js        ~2.5 MB
```

The content script was configured for:

```json
{
  "matches": ["*://*/*"],
  "run_at": "document_end",
  "all_frames": true
}
```

([GitHub][1])

The current September 2026 extension is version **3.1.6**, and third-party Chrome metadata still reports permissions including:

```text
storage
tabs
webNavigation
webRequest
unlimitedStorage
cookies
alarms
offscreen
```

plus:

```text
*://*/*
```

host access. ([Extension Auditor][9])

Simplify itself explains that it requests access to all websites because it needs to inspect a page to determine whether it is an application. ([Simplify Jobs][10])

So the architecture is almost certainly still something broadly like:

```text
             Chrome extension
                    │
         ┌──────────┴───────────┐
         │                      │
 Content script           Service worker
         │                      │
 inspect DOM              navigation
 locate fields            API/network
 manipulate form          config
 observe UI               persistence
         │                      │
         └──────────┬───────────┘
                    │
                  backend
```

---

# 12. Multi-page applications have explicit orchestration

Simplify can optionally:

> continuously autofill multipage forms

Once started, it will move through pages automatically until submission. ([Simplify Jobs][4])

The v2.4.5 analysis found actual background listeners using:

```text
webNavigation.onCommitted
webRequest.onCompleted
```

with **ATS-specific submission detection**.

For Amazon, for example, the extension watched a specific successful summary URL. Similar custom handling existed for BambooHR, Comeet, FreshTeam, Greenhouse, iCIMS, JazzHR and others. ([GitHub][1])

So their adapters extend beyond field selectors.

There are apparently ATS-specific concepts for:

```text
page recognition
field recognition
navigation
submission detection
```

That makes sense.

---

# 13. Simplify does NOT appear to rely on a magical generic AI fallback for every website

This is important.

Simplify explicitly documents an **"Autofill Not Supported"** state. On unsupported pages, users are given their Simplify profile and can manually copy values into the application. ([Simplify Jobs][11])

So they haven't solved:

```text
arbitrary webpage
→ AI understands absolutely everything
→ reliable autonomous completion
```

Instead they've achieved wide coverage by building and maintaining a massive compatibility layer.

That is a much more realistic explanation for why Simplify feels unusually reliable on Workday/Greenhouse/etc.

---

# 14. The architecture I'd give your agent

Not as instructions, just as the best evidence-backed model of Simplify:

```text
                        JOB APPLICATION
                               │
                               ▼
                        Content Script
                               │
                     inspect URL + page
                               │
                               ▼
                    ATS Recognition Layer
                               │
              URL pattern → Workday/Lever/etc
                               │
                               ▼
                   Remote ATS Configuration
                               │
              XPath/CSS selector mappings
                               │
                               ▼
                      FIELD DISCOVERY
                               │
                DOM node → canonical key
                               │
              ┌────────────────┴───────────────┐
              │                                │
        KNOWN FIELD                      UNIQUE FIELD
              │                                │
   canonical profile schema             extract question
              │                                │
              ▼                                ▼
     local profile/cache             saved exact answer?
              │                       │            │
              │                      yes           no
              │                       │            │
              │                       ▼            ▼
              │                   reuse       AI enabled?
              │                                    │
              │                                    ▼
              │                              AI/backend
              │                                    │
              │                   profile + resume +
              │                    JD + company + role
              │                                    │
              └─────────────────┬──────────────────┘
                                │
                                ▼
                         resolved value
                                │
                                ▼
                         ACTION EXECUTOR
                                │
                   XPath/CSS → element action
                                │
                 input / select / click / upload
                                │
                                ▼
                     state/verification layer
                                │
                                ▼
                         navigation/page 2
                                │
                                ▼
                      repeat using same ATS
```

## Confidence level

**Directly verified:** ATS-specific URL mappings, 49 ATS configurations, 137 canonical field keys, XPath/CSS selectors, all-frame content script, remote configuration, browser navigation/submission listeners, local profile/resume/recent-answer storage. ([GitHub][1])

**Officially documented:** deterministic "common questions", unique questions, exact-question saved-answer reuse, AI generation using profile/resume/JD/company/role, continuous multi-page autofill. ([Simplify Jobs][7])

**Strong inference:** the exact routing order and separation into `detect → classify → resolve → execute → verify`. That's not published source, but it fits all the evidence.

One caveat: the detailed forensic teardown analyzed **v2.4.5**. The current Chrome extension is **v3.1.6 as of September 12, 2026**, so individual implementation details may have changed. The current permissions and Simplify's current product behavior indicate the overall architecture is still compatible with this model. ([Extension Auditor][9])

### Primary material

[Simplify's extension engineering take-home](https://github.com/SimplifyJobs/extension-take-home?utm_source=chatgpt.com)
[Independent v2.4.5 extension teardown and captured architecture](https://github.com/detrin/extensions_report/blob/main/confirmed/pbanhockgagggenencehbnadejlgchfc/README.md?utm_source=chatgpt.com)
[Simplify's current explanation of Copilot autofill](https://help.simplify.jobs/articles/2415391-using-copilot-to-autofill-applications?utm_source=chatgpt.com)
[Simplify's unique-question/AI documentation](https://help.simplify.jobs/en/articles/7306766-answering-essay-questions-with-copilot?utm_source=chatgpt.com)

**The next useful research target is narrower:** figuring out their **action executor**, specifically what Simplify actually does to a Workday React combobox after the adapter has already identified it. That's the part the public sources don't fully expose, and that's where the recorder would actually be valuable.

[1]: https://github.com/detrin/extensions_report/blob/main/confirmed/pbanhockgagggenencehbnadejlgchfc/README.md "extensions_report/confirmed/pbanhockgagggenencehbnadejlgchfc/README.md at main · detrin/extensions_report · GitHub"
[2]: https://github.com/detrin/extensions_report/blob/main/confirmed/pbanhockgagggenencehbnadejlgchfc/evidence/CLAIMS.md "extensions_report/confirmed/pbanhockgagggenencehbnadejlgchfc/evidence/CLAIMS.md at main · detrin/extensions_report · GitHub"
[3]: https://help.simplify.jobs/en/help/articles/1749022-installing-and-setting-up-copilot?utm_source=chatgpt.com "Installing and Setting up Copilot - Simplify"
[4]: https://help.simplify.jobs/articles/8686025-manage-autofill-settings-in-the-simplify-extension?utm_source=chatgpt.com "Manage Autofill Settings in the Simplify Extension - Simplify"
[5]: https://github.com/SimplifyJobs/extension-take-home "GitHub - SimplifyJobs/extension-take-home · GitHub"
[6]: https://help.simplify.jobs/articles/2415391-using-copilot-to-autofill-applications?utm_source=chatgpt.com "Using Copilot to Autofill Applications - Simplify"
[7]: https://help.simplify.jobs/en/articles/7306766-answering-essay-questions-with-copilot?utm_source=chatgpt.com "Answering Essay Questions with Copilot - Simplify"
[8]: https://simplify.jobs/privacy?utm_source=chatgpt.com "Simplify Jobs | Privacy Policy"
[9]: https://extensionauditor.com/scan/simplify-copilot-autofill-job-applications-job-tra-pbanhockgagggenencehbnadejlgchfc?utm_source=chatgpt.com "Simplify Copilot - Autofill job… - Low Risk Chrome Extension"
[10]: https://help.simplify.jobs/articles/8759839-turning-on-copilot-in-safari?utm_source=chatgpt.com "Turning on Copilot in Safari - Simplify"
[11]: https://help.simplify.jobs/articles/8717287-autofill-not-supported?utm_source=chatgpt.com "Autofill Not Supported? - Simplify"
