# DESIGN.md

## Product

**Working name:** Kareer  
**Status:** Working codename only. Do not finalize public branding around the name until naming/trademark/domain review is complete.

Kareer is a browser-native job application tool that scans application forms, understands the applicant's profile, fills fields intelligently, handles major ATS platforms, and keeps the user in control of review and submission.

The product should feel like a **technical flight deck for job applications**, not a generic career coach and not a cute AI assistant.

---

## 1. Brand Thesis

### Core idea

**Job applications, operated like a system.**

Kareer should feel like a tool built by a developer who got tired of repetitive application workflows and engineered a better control surface.

The visual language combines:

- developer tooling
- flight / navigation instrumentation
- modern SaaS polish
- high-confidence automation
- visible system state

It should **not** look like:

- a traditional HR platform
- a résumé template website
- a motivational career coach
- a generic purple/blue AI startup
- a cyberpunk hacking tool
- an airplane-themed novelty product

### Internal brand shorthand

> **Raycast × flight instrumentation × job applications**

Another useful phrase:

> **The application flight deck.**

These are design references, not public taglines.

---

## 2. Audience

Primary:

- computer science students
- engineering students
- new graduates
- technical applicants
- power users applying to many roles

Secondary:

- any job seeker who wants faster, more reliable applications

The interface may lean technical, but it must remain understandable to a non-technical user.

---

## 3. Personality

Kareer should feel:

- technical
- fast
- precise
- calm
- capable
- slightly hacker-ish
- independent
- transparent

It should not feel:

- playful
- bubbly
- cute
- corporate-HR
- overly futuristic
- mysterious
- autonomous in a way that removes user control

The product earns trust by **showing what it is doing**.

---

## 4. Visual Direction

### Theme

**Dark instrumentation UI with restrained SaaS polish.**

The current dark interface is the correct general direction, but it currently leans too far toward familiar dark-blue SaaS styling.

The next iteration should move from:

> generic dark AI dashboard

toward:

> compact technical control system

### Visual hierarchy

1. Current application state
2. Primary action
3. Detected / completed / failed field state
4. Job and ATS context
5. Secondary controls
6. Debug and configuration

The UI should communicate state before decoration.

---

## 5. Color System

### Core palette

```css
--kr-bg-0: #080B10;       /* page / deepest background */
--kr-bg-1: #0D1117;       /* main panel */
--kr-bg-2: #131922;       /* cards / controls */
--kr-bg-3: #1A222D;       /* elevated / hover */

--kr-line: #26303D;
--kr-line-strong: #344152;

--kr-text-1: #F2F5F7;
--kr-text-2: #A8B2BF;
--kr-text-3: #8995A5;

--kr-signal: #A3E635;     /* brand / primary system signal (restrained lime) */
--kr-signal-hover: #B5F04A;
--kr-signal-dim: rgba(163, 230, 53, 0.10);

--kr-info: #62C8FF;
--kr-success: #52D98C;
--kr-warning: #F2B84B;
--kr-danger: #F06A6A;
```

### Why restrained signal lime

The brand identity pairs **graphite** near-black surfaces with a calibrated, restrained **signal lime**:

- **#A3E635** replaces overly saturated/radioactive greens with a mature, high-legibility chartreuse.
- Creates an immediate, memorable technical brand cue without visual fatigue.
- Reads crisply against deep graphite surfaces (`#080B10`, `#0D1117`, `#131922`).
- Preserves the serious developer-tool / flight-instrumentation / polished-SaaS direction.
- Separates Kareer visually from generic blue AI tools and neon "Matrix/cyberpunk" aesthetics.

### Strict rules of restraint

Do not flood the interface with lime. It must be used deliberately and sparingly:

1. **Permitted uses**:
   - Primary CTA button (single dominant action per surface)
   - Brand mark
   - Active/running state indicators
   - Thin progress rails
   - Focused inputs
   - Selected controls / small active indicators
2. **Surface restraint**:
   - Do **not** use large lime-tinted surfaces unnecessarily.
   - Active tabs must use lime text, border, or a small indicator rather than a large lime background.
   - Cards and containers remain graphite surfaces (`var(--kr-bg-2)`); running state is communicated via border or indicator, not card flood fills.
3. **Button hierarchy**:
   - Keep buttons mostly graphite (`var(--kr-bg-2)`) except for the single dominant action.
4. **No neon / cyberpunk styling**:
   - Avoid glowing neon loops, excessive blur box-shadow halos, or Matrix-style aesthetics.
   - Depth is achieved via crisp borders (`var(--kr-line)`) and subtle elevation shadows (`rgba(0, 0, 0, 0.35)`).
5. **Separation from semantic colors**:
   - Brand lime and semantic success green must remain visually distinct:
     - **Lime (`#A3E635`)**: Warm chartreuse (hue ~83°), reserved for brand, primary action, running state, and focus.
     - **Green (`#52D98C`)**: Cool emerald/mint (hue ~145°), reserved exclusively for verified/complete states, checkmarks, and success feedback.
     - **Blue (`#62C8FF`)**: Informational telemetry, model badges, and external links.
     - **Amber (`#F2B84B`)**: Inferred data, manual review needed, paused states, and warnings.
     - **Red (`#F06A6A`)**: Verification failures, errors, and blocked states.

---

## 6. Surfaces

Avoid excessive glassmorphism.

The extension lives on top of arbitrary websites. It should feel like a distinct instrument panel rather than blurred website content.

### Main panel

Use:

```css
background: rgba(13, 17, 23, 0.97);
border: 1px solid #26303D;
box-shadow:
  0 24px 60px rgba(0,0,0,.48),
  0 0 0 1px rgba(255,255,255,.025);
```

Backdrop blur may remain subtle, but should not define the aesthetic.

### Cards

Cards should be flatter and denser than the current version.

Use hierarchy through:

- border
- spacing
- label weight
- subtle surface difference

Avoid making every section look like a floating rounded rectangle.

---

## 7. Shape Language

Current UI radii are too soft for the intended personality.

Use:

```css
--kr-radius-xs: 4px;
--kr-radius-sm: 6px;
--kr-radius-md: 8px;
--kr-radius-lg: 10px;
--kr-radius-round: 999px;
```

### Rules

- controls: 6px
- cards: 8px
- main panel: 10px
- badges: 4px to 6px
- true status indicators may be circular
- pills are reserved for compact statuses and tags

Do not make every button or badge a pill.

---

## 8. Typography

### Bundled typography

Use **Geist Sans** for interface copy and **Geist Mono** selectively for model IDs,
ATS identifiers, field counts, latency, logs, versions, and technical metadata.
Answer previews and ordinary labels remain sans serif.

```css
--kr-font: 'Kareer Geist', sans-serif;
--kr-font-mono: 'Kareer Geist Mono', monospace;
```

Variable WOFF2 fonts (weights 100–900) ship in `src/assets/fonts/`, from the
official Geist 1.7.2 package with its SIL Open Font License. No remote font
requests and no installed-font dependency. Extension pages use local
`@font-face` rules in generated `assets/theme.css`. The panel registers the
same bundled bytes as binary FontFace objects on document.fonts, making them
available inside Shadow DOM without depending on a website's font-src policy.
The userscript embeds these bytes too. Build artifacts, not raw source HTML,
are the runnable extension pages.

### Weight

Prefer:

- 400 body
- 500 secondary controls
- 600 labels / actions
- 650-700 only for major headings

Avoid excessive bold text.

### Brand Assets

Official brand assets ship in `src/assets/brand/`:
- `kareer-brand-identity.png`: Master identity sheet with palette, lockups, and icon variations.
- `kareer-app-icon.png`: Master 1254x1254 squircle application icon.
- `kareer-logo-horizontal.png`: Primary horizontal brand lockup.
- `kareer-logo-stacked.png`: Vertical stacked lockup.
- `kareer-promo-banner.png`: 16:9 hero/promo banner with perspective grid.
- `kareer-icon-monochrome.png`: Monochrome mark for high-contrast/print contexts.
- `kareer-mark-lime.png` / `kareer-mark.svg`: Official isolated vector mark (dog-eared document stem + forward chevron).

Extension icons ship in `src/targets/extension/icons/`:
- `icon-16.png`, `icon-32.png`, `icon-48.png`, `icon-128.png`

---

## 9. Layout

The current floating HUD + expandable inspection panel is a strong product pattern and should remain.

### Compact HUD

The HUD is the product's always-present control strip.

It should contain:

1. brand mark
2. system status
3. ATS identifier
4. detected field count
5. primary action
6. expand / collapse

It should feel like a compact command bar, not a miniature marketing navbar.

### Expanded panel

Target width:

```text
440-480px
```

The current approximate 460px width is appropriate.

The panel should use four logical areas:

- **Run**
- **Review**
- **Profile**
- **Settings**

Debug tools may remain available but should feel clearly secondary.

Consider renaming the current `Home` tab to **Run**.

---

## 10. Information Architecture

Recommended primary tabs:

### Run

Shows:

- current job
- detected ATS
- page state
- detected field count
- workflow status
- primary autofill action
- progress
- blockers

### Review

Shows:

- verified answers
- inferred answers
- failed answers
- untouched fields
- jump-to-field controls

The review surface is important to the brand. Kareer should visually prove that it is not blindly filling forms.

### Profile

Stores:

- identity
- links
- work authorization
- education
- experience context
- application preferences
- resume context

### Settings

Stores:

- model
- API key state
- automation behavior
- import/export
- advanced preferences

### Debug

Keep it accessible to power users, but visually separate it from the normal workflow.

Possible treatment:

```text
Settings → Advanced → Debug
```

---

## 11. Component Direction

### Primary button

Primary buttons should look decisive, not glossy or glowing.

```css
background: var(--kr-signal);
color: #0A0D10;
border: 1px solid rgba(255,255,255,.08);
box-shadow: 0 1px 3px rgba(0,0,0,.35);
font-weight: 650;
```

No blue gradient, no neon glow halo.

Hover may slightly brighten (`var(--kr-signal-hover)`) and raise by 1px with clean drop shadow.

### Secondary button

Dark graphite surface (`var(--kr-bg-2)`) with defined border (`var(--kr-line)`). All buttons except the single dominant CTA per surface must use this style to maintain strict visual hierarchy.

### Active tabs

Active tabs must be restrained: use lime text (`var(--kr-signal)`), graphite surface (`var(--kr-bg-2)`), and a subtle border or small bottom indicator rather than a large lime background.

### Status badges

Compact, rectangular, technical.

Examples:

```text
READY
GREENHOUSE
12 FIELDS
REVIEW
BLOCKED
```

Uppercase is appropriate for very small system labels.

### Progress

Prefer a thin 2-3px instrumentation-style rail (`var(--kr-signal)`).

No oversized loading animations or glowing pulses.

### Inputs

Inputs should be visually quiet until focused.

Focus:

```css
border-color: var(--kr-signal);
box-shadow: 0 0 0 2px rgba(163,230,53,.2);
```

---

## 12. Iconography

Use a consistent 1.5-1.75px outline icon system.

Icons should be:

- geometric
- compact
- functional
- visually balanced at 14-16px

Avoid:

- sparkles as the primary brand symbol
- robot heads
- magic wands
- briefcases
- generic résumé sheets with checkmarks
- literal airplane illustrations

The existing sparkle motif should be removed from core branding.

AI is an implementation detail, not the identity.

---

## 13. Brand Mark Direction

Do not design the logo yet, but constrain the concept now.

The mark should combine:

- application / document
- navigation / flight
- forward movement

without literally drawing an airplane.

### Best concept territory

**A geometric K / flight-path mark.**

Potential construction:

- the vertical stem suggests a document edge
- the upper diagonal suggests a swept wing / heading vector
- the lower diagonal suggests a form line / route
- negative space can imply a cursor or forward arrow

Alternative:

**Document corner → navigation vector**

A rectangular document shape whose folded corner transforms into a heading arrow.

### Requirements

The mark must work at:

- 16×16 favicon
- 24×24 browser toolbar
- 32×32 extension UI
- 128×128 store icon
- monochrome
- one-color signal green
- light and dark backgrounds

No detail should depend on gradients.

---

## 14. Motion

Motion should communicate state, not decoration.

### Timing

```text
hover:       100-140ms
panel open:  180-220ms
state change: 160-220ms
progress:    continuous only while work is active
```

### Easing

Use:

```css
cubic-bezier(0.16, 1, 0.3, 1)
```

### Allowed

- small scale or translate on button hover
- thin progress movement
- subtle active status pulse
- panel entrance
- state transitions

### Avoid

- glowing neon loops
- constant floating animation
- bouncing
- excessive blur animation
- decorative AI shimmer

---

## 15. Interaction Principles

### 1. Show the system state

At any point the user should know:

- what Kareer detected
- what Kareer is doing
- what succeeded
- what failed
- what requires them

### 2. Automation must remain inspectable

Autofill should never feel invisible.

Use:

- field progress
- review states
- highlight states
- explicit blockers
- clear pause controls

### 3. One obvious primary action

On an application page, the interface should usually have one dominant action:

```text
AUTOFILL
```

or while a workflow exists:

```text
CONTINUE
```

Do not place multiple equally loud CTAs next to each other.

### 4. Technical detail is progressive

Normal users see useful states.

Technical users can expand into:

- adapter
- model
- frame information
- logs
- fixture capture
- raw state

---

## 16. Voice

Kareer should speak like a tool, not a career coach.

### Good

```text
12 fields detected
9 verified
2 need review
1 blocked

Greenhouse detected

Waiting for resume upload to finish

No matching option found

Application ready for review
```

### Bad

```text
Great news! 🎉
Kareer is working its magic!
Let's supercharge your job search!
Your AI copilot is ready to help!
```

Keep copy:

- short
- specific
- factual
- calm

---

## 17. Naming in the UI

Until the final name is selected:

- use **Kareer** as the internal working name
- do not build visual concepts that depend on spelling the name
- keep the logo symbol independent from the wordmark
- isolate the product name through a single application constant so rebranding is cheap

Do not rename every internal `jc-*` class solely for branding.

Internal technical prefixes are implementation details and can remain until a larger cleanup is justified.

---

## 18. What to Keep From the Current UI

Keep:

- dark base
- floating HUD
- expandable panel
- compact system status
- ATS badge
- field-count badge
- progress visibility
- review / verification states
- monospace technical metadata
- clear success / warning / failure semantics
- Shadow DOM isolation
- compact panel dimensions

These are aligned with the product.

---

## 19. What to Change From the Current UI

Change:

1. Replace cyan/royal-blue brand emphasis with signal green.
2. Remove blue gradient primary buttons.
3. Reduce glassmorphism.
4. Reduce border radius.
5. Reduce excessive pill shapes.
6. Remove sparkle as the product identity.
7. Tighten spacing slightly.
8. Make typography more technical through hierarchy, not through full monospace.
9. Flatten cards and reduce unnecessary surface nesting.
10. Make `Run` / application state visually dominant.
11. Separate normal workflow from debug tooling.
12. Make the interface feel like an instrument panel instead of an AI dashboard.

---

## 20. Design Test

Any future component should pass this question:

> Would this look at home inside a serious developer tool or a modern flight instrumentation interface without confusing a normal job seeker?

If yes, it is probably on-brand.

If it looks like a generic AI SaaS dashboard, HR portal, or cyberpunk terminal, reject it.

---

## 21. Immediate Implementation Order

1. Centralize new design tokens.
2. Replace primary blue identity color with signal green.
3. Remove gradient CTAs.
4. Tighten radii and surface styling.
5. Rework HUD branding and remove sparkle.
6. Rename Home → Run.
7. Rebalance Run page hierarchy.
8. Move Debug toward an advanced surface.
9. Run visual QA on Greenhouse, Ashby, Lever, and Workday fixtures.
10. Only after the interface feels correct, design the logo and wordmark.

---

## 22. Logo Work Starts After UI Direction Is Approved

The logo should be designed against the finished visual language, not the other way around.

Once this design system is accepted, generate 3-5 black-and-white mark concepts first.

Do not start with color.

The winning mark can then inherit:

- signal green
- dark graphite
- technical typography
- compact browser-extension proportions


## 23. Shared implementation and configuration console

- `src/core/theme.js` owns visual tokens, font filenames, and the working UI name.
  The panel interpolates tokens; the build emits the same tokens for all extension
  pages. Product manifests and protocol identifiers retain Job Copilot naming.
- Muted text is #8995A5 for readable small metadata on graphite surfaces.
- Options is a 1180px maximum-width console: 210px sticky section navigation,
  56px gutter, flat sections separated by rules, two-column profile fields.
  At 800px navigation becomes a wrapping row; at 520px fields become one column.
- Keep one lime save action per independently saved options section. Remove,
  test, import, and export controls remain secondary; destructive text is red.
  Profile save stays in document flow so it cannot obscure inputs.
- Run emphasizes Autofill when no session exists. With a resumable session,
  Start / Resume gets lime and Autofill becomes secondary. Running, review,
  and safety-boundary workflow controls remain quiet. Expanded HUD Autofill is
  secondary so it does not compete with the panel. This is presentation only;
  action handlers and safety behavior remain unchanged.
- Retain Run, Profile, Settings, Debug tabs and inline field review. Debug uses
  a dividing rule. Field review rows use separators rather than nested cards.
- Use visible keyboard focus, native buttons for HUD toggles, reduced-motion
  support, wrapping metadata, and selective ellipsis with title text.
- Both manifests inherit options_ui.page = options/index.html and open_in_tab.
  No external hosting or hardcoded extension ID. Packaged CSS/fonts stay internal;
  no web-accessible-resource permission is needed for embedded panel fonts.
