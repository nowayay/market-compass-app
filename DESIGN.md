---
name: MarketCompass
description: A prepared expansion briefing rendered as software — verified facts, one green signal, always the same shape.
colors:
  compass-green: "#16A34A"
  compass-green-deep: "#15803D"
  compass-green-deepest: "#166534"
  compass-green-tint: "#DCFCE7"
  compass-green-wash: "#F0FDF4"
  compass-green-veil: "#16A34A14"
  meridian-navy: "#13294F"
  tier-high-fill: "#16A34A"
  tier-high-ink: "#15803D"
  tier-high-tint: "#DCFCE7"
  tier-medium-fill: "#D97706"
  tier-medium-ink: "#B45309"
  tier-medium-tint: "#FEF3C7"
  tier-low-fill: "#EF4444"
  tier-low-ink: "#B91C1C"
  tier-low-tint: "#FEE2E2"
  swot-violet: "#7C3AED"
  danger: "#DC2626"
  danger-ink: "#B91C1C"
  danger-wash: "#FEF2F2"
  danger-stroke: "#FECACA"
  link: "#2563EB"
  link-hover: "#1D4ED8"
  link-tint: "#DBEAFE"
  ink: "#111827"
  ink-strong: "#1F2937"
  ink-muted: "#374151"
  ink-quiet: "#4B5563"
  ink-soft: "#6B7280"
  ink-faint: "#9CA3AF"
  surface: "#FFFFFF"
  ground: "#FAFBFC"
  seam: "#EDEFF2"
  rule: "#F5F6F8"
  hairline: "#F1F3F5"
  stroke: "#E5E7EB"
  fill-inert: "#F3F4F6"
  unranked: "#D1D5DB"
  legacy-cream: "#FAF8F4"
  legacy-sand: "#E8E2D8"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "normal"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  detail:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  action:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "0.03em"
  micro:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  xs: "2px"
  sm: "9px"
  md: "10px"
  lg: "12px"
  xl: "14px"
  2xl: "16px"
  3xl: "18px"
  pill: "999px"
  circle: "50%"
spacing:
  tight: "8px"
  snug: "10px"
  base: "14px"
  card-gap: "18px"
  card-pad-y: "20px"
  card-pad-x: "22px"
  section: "26px"
  shell-x: "34px"
components:
  button-primary:
    backgroundColor: "{colors.compass-green-deep}"
    textColor: "{colors.surface}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.compass-green-deepest}"
  button-primary-block:
    backgroundColor: "{colors.compass-green-deep}"
    textColor: "{colors.surface}"
    typography: "{typography.action}"
    rounded: "{rounded.lg}"
    padding: "16px 0"
    width: "100%"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-outline-accent:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.compass-green-deep}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "10px 0"
    width: "100%"
  button-quiet-accent:
    backgroundColor: "{colors.compass-green-wash}"
    textColor: "{colors.compass-green-deep}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "11px 0"
    width: "100%"
  button-quiet-accent-hover:
    backgroundColor: "{colors.compass-green-tint}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.surface}"
    typography: "{typography.action}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-icon:
    backgroundColor: "{colors.fill-inert}"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.sm}"
    height: "32px"
    width: "32px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.2xl}"
    padding: "20px 22px"
  card-entity:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "18px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  chip-status:
    backgroundColor: "{colors.compass-green-tint}"
    textColor: "{colors.compass-green-deep}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  alert-error:
    backgroundColor: "{colors.danger-wash}"
    textColor: "{colors.danger-ink}"
    typography: "{typography.detail}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  chat-bubble-user:
    backgroundColor: "{colors.compass-green-deep}"
    textColor: "{colors.surface}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "11px 14px"
  chat-bubble-assistant:
    backgroundColor: "{colors.fill-inert}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.xl}"
    padding: "11px 14px"
  sidebar:
    backgroundColor: "{colors.surface}"
    width: "264px"
  drawer-chat:
    backgroundColor: "{colors.surface}"
    width: "440px"
  drawer-country:
    backgroundColor: "{colors.ground}"
    width: "480px"
---

# Design System: MarketCompass

## Overview

**Creative North Star: "The Expansion Briefing"**

MarketCompass looks like a briefing a consultant prepared overnight and left on
your desk: structured, scannable, confident, and — critically — always the same
shape. Two different companies produce two documents you can lay side by side,
because the sections, the ranking, the score scale and the SWOT never rearrange
themselves to suit the data. The interface's job is to make an AI-generated
analysis feel *prepared* rather than *improvised*.

That ambition sets the density. This is not a spacious marketing surface and
not a dense analyst console. Cards sit on a near-white ground separated by
hairline seams, headings are heavy (800) and small, body text runs 12.5–13px,
and nothing carries a gradient, a glow or an illustration. The one saturated
color in the system is Compass Green, and it earns its loudness by being rare:
it marks what is confirmed, what is best, and what you can act on. Everything
else is graphite and paper.

The system is deliberately unshowy because the product's whole claim is
verification. A screen that looks generated undermines a product whose
differentiator is that its inputs are not. Three worlds are rejected outright:
the generic AI-product landing (purple-to-blue gradients, glassmorphism,
floating orbs, sparkle icons), playful consumer SaaS (mascots, pastel blobs,
emoji-led empty states), and the crypto/fintech dark dashboard (dark ground,
neon accents, animated tickers). Any of the three would cost the product the
credibility it spends its whole pipeline earning.

**Key Characteristics:**

- Near-white ground, white cards, hairline seams — paper, not chrome
- One saturated accent (Compass Green) doing signal duty, never decoration
- Heavy small headings (800 weight at 15–26px) against light 12.5–13px body
- A three-step traffic-light tier system that colors the ranking, the map and the score ring identically
- Structural elevation: page → card → popover → drawer → modal, each with its own shadow step
- Zero illustration, zero gradient, zero rounded-blob geometry

## Colors

A graphite-and-paper neutral field carrying exactly one saturated voice, plus a
three-step evaluative scale that the entire analysis reads from.

### Primary

- **Compass Green** (`#16A34A`): the identity green, and the system's only loud
  color. It survives wherever green is a *region or a signal* rather than a
  glyph: the top tier's fill on the world map and its legend swatch, the focus
  ring and the focus border on every input, the bullet mark on confirmed
  business facts, and the second half of the wordmark.
- **Compass Green Deep** (`#15803D`): the same green at reading weight, and the
  one that carries text. Primary buttons, the outline and quiet-accent button
  labels, the user's chat bubble, the status chip, the top tier's ink, and the
  "S" in SWOT. Bright `#16A34A` reaches only 3.30:1 against white — enough for a
  region, not for a 13px label — so anything a reader parses as letters takes
  this value instead. Its hover goes one step deeper still (`#166534`).
- **Compass Green, quiet forms**: `#DCFCE7` for status chips and quiet-CTA
  hover, `#F0FDF4` for the top-expansion CTA at rest, `#16A34A14` (8% alpha) for
  the AI-assistant icon tile.

### Secondary

- **Meridian Navy** (`#13294F`): identity only, never interface. It is the
  "Market" half of the wordmark and the dark needle and cardinal points of the
  compass mark. It appears nowhere else — not as a heading color, not as a
  button, not as a border. Its scarcity is what makes the logo read as a mark
  rather than as UI.

### Tertiary

The evaluative scale. These are read as *measurements*, never as decoration, and
they always mean rank position — places 1–5, 6–10, 11–15 of the fifteen.

Every tier carries **two weights**, and choosing between them is a contrast
decision rather than a taste one. The `fill` is bright and belongs to large
areas the eye reads as regions — the map's country shapes and the legend
swatches that sample them, which need only 3:1. The `ink` is the same hue
darkened, and belongs to anything read as a glyph: score numbers, tier labels,
the SWOT letter discs, and the thin arc of the score ring, all of which need
4.5:1. `tierOf(rank)` in [derive.ts](src/lib/derive.ts) returns both.

- **High potential**, places 1–5 — fill `#16A34A`, ink `#15803D`, tint `#DCFCE7`.
- **Medium potential**, places 6–10 — fill `#D97706`, ink `#B45309`, tint
  `#FEF3C7`. The fill is deliberately not `#F59E0B`: at 2.15:1 that amber failed
  even the 3:1 floor for a graphical object, so the map could not legibly draw
  its own middle band.
- **Low potential**, places 11–15 — fill `#EF4444`, ink `#B91C1C`, tint
  `#FEE2E2`. The ink also serves SWOT threats.
- **Analyst Violet** (`#7C3AED`): a single-purpose color, used only for the "O"
  (Szanse / opportunities) quadrant of the SWOT so all four quadrants stay
  distinguishable. It exists nowhere else and must not be generalized.

**Known limitation.** The three fills separate by hue but sit at nearly the same
lightness, so they are hard to tell apart with red-green color blindness. The
map is deliberately never the only path to that data — the ranking list beside
it carries rank number, country name and score — and that redundancy, not the
fills, is what makes the tier readable for everyone.

Destructive and diagnostic colors sit apart from the scale: **Alert Red**
(`#DC2626`) for destructive buttons and stop-generation, with `#B91C1C` text on
`#FEF2F2` inside a `#FECACA` border for every error block; **Link Blue**
(`#2563EB`, hover `#1D4ED8`) for real hyperlinks and the "first steps" numbering.

### Neutral

- **Ink** (`#111827`): headings, company names, country names, assistant chat text.
- **Ink Strong** (`#1F2937`): body prose inside detail panels and modals.
- **Ink Muted** (`#374151`): secondary labels, SWOT bullets, secondary button text.
- **Ink Quiet** (`#4B5563`): secondary text sitting on a tinted fill rather than
  on white — the privacy notice on `fill-inert`, the confidence rationale. It
  exists because Ink Soft drops to 4.39:1 on `#F3F4F6`; on white, use Ink Soft.
- **Ink Soft** (`#6B7280`): supporting copy, summaries, subtitles, meta rows, and
  every tertiary label that used to be Ink Faint.
- **Ink Faint** (`#9CA3AF`): **disabled controls and aria-hidden decoration only.**
  It reaches 2.54:1 on white, so it cannot legally carry text, and no gray light
  enough to feel "faint" clears 4.5:1 — the lightest that does is barely
  distinguishable from Ink Soft. Everything it used to label (table headers,
  rank numbers, "/100" suffixes, disclaimers, placeholders, the truncation note)
  now uses Ink Soft, and the tertiary step is carried by size and weight instead,
  which is the lever The Heavy-and-Small Rule already prefers.
- **Surface** (`#FFFFFF`): every card, the sidebar, drawers, modals, and the map's country strokes.
- **Ground** (`#FAFBFC`): the application background behind all cards.
- **Seam** (`#EDEFF2`): the 1px border on every card, sidebar and drawer divider. The system's structural line.
- **Rule** (`#F5F6F8`) and **Hairline** (`#F1F3F5`): row separators inside lists and the header underline in tables.
- **Stroke** (`#E5E7EB`): input borders at rest, secondary button borders, spinner tracks.
- **Fill Inert** (`#F3F4F6`): the map's backing plate, assistant chat bubbles, icon-button and cancel-button fills.
- **Unranked** (`#D1D5DB`): countries on the map with no ranking data. The absence of a score is itself a legible state.

### Named Rules

**The One Signal Rule.** Compass Green is the only saturated color permitted for
interface intent. If a screen needs a second "look here", the answer is weight,
size or position — never a second accent hue. Audit test: on any screen, green
should be traceable to *action*, *confirmed fact*, or *rank 1–5*. If it is on
anything else, remove it.

**The Fill-Or-Ink Rule.** Every semantic color exists in two weights, and the
question is never which looks better — it is what the eye is doing. Reading it
as a shape? Use the fill. Reading it as letters? Use the ink. A thin graphic
(the score ring's arc, a 1px rule) counts as letters. Audit test: if a colored
value sits under a `fontSize`, it must be an ink.

**The Navy-Is-Identity Rule.** `#13294F` appears in the logo and wordmark and
nowhere else. A navy button, navy heading, or navy border is a defect.

**The Tier-Means-Rank Rule.** Green / amber / red never encode sentiment, health
or freshness. They encode position in the fifteen — 1–5, 6–10, 11–15 — and every
surface showing that scale (ranking rows, map fills, score rings, the legend)
resolves it through the same `tierOf(rank)` helper in
[derive.ts](src/lib/derive.ts). Never hand-assign a tier color.

### Legacy: the warm ground

Three entry screens still sit on a warm cream ground (`#FAF8F4`) with sand
borders (`#E8E2D8`) inherited from an earlier pass. **This is drift, not
intent.** The cool `#FAFBFC` / `#EDEFF2` pairing above is the single truth;
the warm values are deprecated and awaiting migration at:

- [globals.css:4](app/globals.css#L4) — `body { background: #FAF8F4 }`
- [App.tsx:263](src/App.tsx#L263) — the root wrapper background
- [CompanyFormScreen.tsx](src/screens/CompanyFormScreen.tsx) — the form card border and the two optional-field input borders
- [ConfirmCandidateScreen.tsx](src/screens/ConfirmCandidateScreen.tsx) — the candidate card border
- [ProfilesScreen.tsx](src/screens/ProfilesScreen.tsx) — the profile card border

Do not add new usages. New surfaces use `ground` and `seam`.

## Typography

**Display / Body / Label Font:** Inter (with `system-ui, sans-serif` fallback),
loaded from Google Fonts at weights 400–800 in [layout.tsx](app/layout.tsx).

**Character:** A single-family system carrying its entire hierarchy through
weight and size rather than contrast of form. The pairing character comes from
the *gap*: headings are unusually heavy (800) and unusually small, body text is
unusually light and small, and the distance between them does the work a display
serif would do elsewhere. It reads as a document set by someone precise, not as
a website.

### Hierarchy

- **Display** (800, 26px, 1.2, −0.01em): the one-per-screen title on entry
  screens — "Znajdź swoją firmę", "Twoje profile firm". Also the sidebar
  wordmark at −0.02em.
- **Headline** (800, 20px, 1.25): the analyzed company's legal name, the
  dashboard page title, the score inside the ring. 22px in the country drawer.
- **Title** (800, 15px): every card heading on the dashboard — "Ranking krajów
  ekspansji", "Źródła", "Mapa potencjału rynków". 16px for the SWOT card only.
- **Body** (400, 13px, 1.55): chat messages, country summaries, detail-panel
  prose. Runs at 600 weight for country names in the ranking.
- **Detail** (400, 12.5px, 1.45): the system's actual workhorse — SWOT bullets,
  business-profile bullets, source rows, error text, meta lines. If a size is
  ambiguous, it is this one.
- **Action** (700, 13px): every button label, without exception.
- **Label** (700, 11.5px, uppercase, +0.03em): section labels in the country
  drawer ("Szanse", "Ryzyka", "Konkurencja") and the tier label above a country
  name (+0.04em there). The only uppercase in the system.
- **Micro** (400, 11px, 1.5): AI disclaimers and table column headers (the latter
  at 700 weight in Ink Faint).

### Named Rules

**The Heavy-and-Small Rule.** Hierarchy is carried by weight before size. A
heading never drops below 700, and 800 is the default for anything that titles a
region. Reaching for a larger size to signal importance is the wrong lever;
reach for weight, then for position.

**The Half-Point Rule.** This system genuinely uses half-point sizes (11.5,
12.5, 13.5, 14.5, 15.5) and they are load-bearing — 12.5 and 13 are distinct
roles, not rounding noise. Preserve them. All type is specified in px, not rem,
and no size is fluid; there is no `clamp()` anywhere.

**The One-Uppercase Rule.** Uppercase is reserved for the 11.5px section labels
inside detail panels. Buttons, headings, chips and nav are always sentence case.

## Layout

Two shells, one grid language.

**Entry shell** (form, confirm, profiles). A single centered column with
`36px 20px 80px` padding: 760px max-width for the form and candidate list,
960px for the profile grid. Logo and wordmark sit top-left at 36px, with the
screen's one action top-right. The profile grid is
`repeat(auto-fill, minmax(260px, 1fr))` at 16px gaps.

**Dashboard shell.** A fixed 264px white sidebar against a `#FAFBFC` main column
capped at 1300px with `26px 34px 70px` padding. Full-width company cards stack
first (18px gaps), then the analysis splits into
`minmax(0, 1.6fr) minmax(0, 1fr)`: map, SWOT and sources on the left; the
top-expansion recommendation and the ranking on the right. Each column is an
independent natural-height stack — neither stretches to match the other, which is
why the `minmax(0, …)` matters and why cards ellipsize instead of forcing
horizontal scroll.

**Density.** Card padding is `20px 22px` for list and chart cards, `22px 24px`
for prose-bearing cards, 18px for entity cards. The gap between cards is
always 18px; the gap between page regions is 26px. Internal bullet stacks run
at 7–8px.

**Responsive.** There is exactly one breakpoint: **900px**, where the analysis
grid collapses to a single column in source order. Drawers cap at `94vw` (chat,
440px) and `92vw` (country, 480px); the full-map modal is `min(1100px, 94vw)`
capped at `92vh`.

### Named Rules

**The One-Breakpoint Rule.** The system currently adapts at 900px only, and the
264px sidebar does not collapse below it. This is the honest state, not a
target — any work touching small screens is extending the system, not conforming
to it, and should say so.

**The Ellipsize-Never-Scroll Rule.** Ranking rows, country names and summaries
truncate with `text-overflow: ellipsis` on a single line. The page body never
scrolls horizontally; a too-narrow column shortens its content instead.

## Elevation & Depth

The system uses **structural layering**: shadow encodes hierarchy at rest, not
just interaction. Five steps, each owning one layer of the stack — page, card,
popover, drawer, modal — so a surface's altitude tells you what it is before you
read it.

### Shadow Vocabulary

- **Seat** (`box-shadow: 0 1px 2px rgba(16,24,40,0.04)`): on every dashboard
  card at rest, paired with its 1px `seam` border. Almost invisible by design —
  it seats the card on the ground rather than lifting it.
- **Lift** (`box-shadow: 0 8px 22px rgba(16,24,40,0.09)`, with
  `transform: translateY(-2px)`): the hover response on any clickable card —
  ranking cards, candidate cards, profile cards. `rgba(30,58,95,0.10)` on
  profile cards specifically.
- **Popover** (`box-shadow: 0 8px 24px rgba(16,24,40,0.12)`): the profile
  context menu. The only floating element that is not a drawer or modal.
- **Drawer** (`box-shadow: -16px 0 40px rgba(0,0,0,0.15)`): directional,
  right-anchored, cast leftward onto the page beneath. Both the chat and the
  country drawer.
- **Modal** (`box-shadow: 0 30px 80px rgba(0,0,0,0.3)`): the deepest step, for
  centered dialogs — the full map and the delete confirmation.
- **Accent glow** (`box-shadow: 0 4px 14px rgba(22,163,74,0.25)`): the sole
  colored shadow, under primary green buttons only.

Scrims: `rgba(17,24,39,0.5)` behind drawers and the delete dialog,
`rgba(17,24,39,0.55)` behind the full map.

### Named Rules

**The Altitude-Is-Meaning Rule.** Never pick a shadow for looks. Pick the step
that matches the layer: a card gets Seat, a hovering card gets Lift, a floating
menu gets Popover, an edge-anchored panel gets Drawer, a centered dialog gets
Modal. A new shadow value is a new layer, and there are no new layers.

**The Colored-Shadow Exception.** Exactly one colored shadow exists — the green
glow under primary buttons. Do not tint any other shadow.

## Shapes

Rectilinear and consistently soft: a nine-step radius ladder, no clipping
tricks, no asymmetric corners, no rotation anywhere in the interface. Corners
scale with the object's size and permanence.

- **2px** — flag sprites only, just enough to avoid a hard pixel edge.
- **9px** — 32px icon buttons and the optional-field inputs.
- **10px** — the system default: buttons, inputs, alert blocks, menus, the AI icon tile.
- **12px** — the map's backing frame and the form's tip callout.
- **14px** — chat bubbles and entity cards (profile, candidate).
- **16px** — every dashboard card and the delete dialog. The signature radius.
- **18px** — the full-map modal, the largest container in the system.
- **999px / 50%** — status chips and confidence badges; circles for the SWOT
  letter discs (26px), map legend dots (9px), the loading spinner (64px) and the
  score ring (84px outer / 64px inner).

Borders are always exactly 1px and always a neutral (`seam`, `stroke`, `rule`,
`hairline`), with two exceptions: the 1.5px green outline on the chat CTA and
the 1px `danger-stroke` around error blocks. The empty-profiles state is the
only dashed border in the system.

**The Score Ring.** The one piece of non-rectilinear data display:
`conic-gradient(<tierColor> <score>%, #EBECEF 0)` on an 84px circle with a 64px
white disc punched out. It renders the 0–100 score with no chart library. Any
future score display should reuse this construction rather than introduce a
charting dependency.

## Components

**Character: calm and briefing-grade.** Evenly weighted, quiet, nothing
competing for attention except the single green action. Every surface should
read like part of a prepared document you can trust at a glance.

All components are currently authored as **inline React style objects** — there
is no CSS-in-JS library, no styled-components, and Tailwind is installed but
unused for component styling. Only pseudo-states live in
[globals.css](app/globals.css), as `.mc-*` classes.

### Buttons

- **Shape:** default 10px corners; the full-width form CTA uses 12px.
- **Primary:** Compass Green fill, white 13px/700 label, `10px 18px` padding,
  under the accent glow. Its full-width variant pads `16px 0`. Hover deepens the
  fill to `#15803D`; there is no transition declared.
- **Secondary:** white fill, 1px `stroke` border, Ink Muted label, `10px 16px`.
  Used for the dashboard's "Wróć do profili" / "Nowa analiza" pair.
- **Outline accent:** white fill, 1.5px Compass Green border, green label, full
  width. Only the sidebar's "Rozpocznij rozmowę". Hover fills to
  `rgba(22,163,74,0.05)`.
- **Quiet accent:** `#F0FDF4` fill, green label, no border, full width — the
  top-expansion card's "Zobacz szczegóły". Hover fills to `#DCFCE7`.
- **Danger:** Alert Red fill, white label — destructive confirmation and the
  chat's stop-generation control, which replaces Send in place while streaming.
- **Icon:** 32×32 (34×34 in the map modal), `fill-inert` background, 9px radius,
  Ink Soft glyph. Every modal close control.
- **Ghost:** no background or border, Ink Soft 13px/600 — back links and the
  profile card's `⋯` menu trigger.

### Cards / Containers

- **Corner style:** 16px for dashboard cards, 14px for entity cards.
- **Background:** always white on the `#FAFBFC` ground.
- **Border:** 1px `seam` — this line, not the shadow, is what separates a card
  from the page.
- **Shadow:** Seat at rest. Clickable cards add Lift on hover.
- **Internal padding:** `20px 22px` (list/chart), `22px 24px` (prose), 18px (entity).
- Section headings sit at 15px/800 Ink with a 14–18px gap beneath.

### Inputs / Fields

- **Style:** white fill, 1px `stroke` border, 10px radius (9px for the two
  optional fields), 15px text for the primary field and 13–14px elsewhere,
  `outline: none`.
- **Focus:** the border switches to Compass Green via `.mc-input:focus`. That
  border change is currently the *entire* focus treatment — there is no ring,
  no offset, and no `:focus-visible` rule anywhere in the system, on inputs or
  on any button. Documented as observed fact and as the system's clearest known
  gap; new work should not treat its absence as a rule to follow.
- **Error:** the field's border turns `#DC2626` and a 12.5px/600 red message
  appears 14px beneath.
- **Labels:** 12.5px/700 Ink Strong, 6px above the field, with a green asterisk
  marking required.

### Chips

- **Status chip:** `#DCFCE7` fill, `#16803C` text, pill radius, `3px 10px`,
  11px/700, led by a 6px Compass Green dot. Marks a completed analysis on a
  profile card.
- **Confidence badge:** the same pill shape carrying a three-value scale —
  low `#B45309` on `#FEF3C7`, medium `#1D4ED8` on `#DBEAFE`, high `#15803D` on
  `#DCFCE7`. Note this scale is deliberately *not* the tier scale; it describes
  the analysis's own certainty, not a country's rank.

### Navigation

The 264px sidebar is the only persistent navigation, and it is not a nav bar: it
carries the 72px compass mark and 26px wordmark centered at the top, then a
single bordered card holding the AI assistant CTA and four canned example
questions. Example questions are full-width left-aligned buttons at 12px Ink
Muted with a `›` chevron in Ink Faint, hovering to a green border and a 3%
green wash. Everything else is in-page: entry screens carry a top-left
lockup and a top-right action, and the dashboard carries two secondary buttons
top-right.

### Drawers

Both drawers anchor right, run full height, and share the Drawer shadow and the
`rgba(17,24,39,0.5)` scrim: **chat** at 440px on white with a bordered header and
a bordered composer footer, **country detail** at 480px on `#FAFBFC` with 28px
padding and no chrome. Both close on scrim click and both stop propagation on
the panel itself.

### Signature Component: the tiered world map

The map is the product's centerpiece and the clearest expression of the system.
A `geoNaturalEarth1` projection fitted to a 960×470 viewBox sits on a
`fill-inert` plate at 12px radius. Every country path is stroked `#FFFFFF` at
0.6px — the white hairline is what keeps a flat fill map from reading as a blob.
Ranked countries take their tier fill; unranked take `#D1D5DB`. Hover drops a
path to `0.78` opacity over 120ms, and only ranked paths take a pointer cursor,
so hit-targeting is honest about what is clickable. A four-item legend
(1–5 / 6–10 / 11–15 / no data) sits 14px beneath at 11.5px Ink Soft with 9px
dots. The identical construction serves both the dashboard card and the
full-screen modal.

### Motion

Five keyframes, all in [globals.css](app/globals.css), all short and all
functional:

- `mc-fade-up` (0.4s ease, 10px rise): screen entry.
- `mc-fade-up` (0.18s): overlay entry — same curve, faster, so modals feel
  attached to the click rather than animated in.
- `mc-spin` (0.9s linear): the 64px analysis spinner and its 18px inline twin.
- `mc-typing-bounce` (1.2s, three dots staggered 0.15s): the assistant composing.
- Hover transitions: `translateY(-2px)` card lifts, `opacity .12s` on map paths.

**The Short-Motion Rule.** Nothing animates longer than 0.4s and nothing
animates that the user did not cause. There is no scroll-triggered motion, no
parallax, and no decorative loop. The typing dots and the spinner are the only
continuous animations, and both report machine state.

## Do's and Don'ts

### Do:

- **Do** put new surfaces on `ground` (`#FAFBFC`) with white cards and 1px
  `seam` (`#EDEFF2`) borders. That pair is the settled system.
- **Do** resolve every tier color through `tierOf(rank)` in
  [derive.ts](src/lib/derive.ts) so the ranking, map, legend and score ring can
  never disagree — and take `ink` or `fill` from it deliberately, never
  whichever one is already in scope.
- **Do** keep `#9CA3AF` off anything with a `fontSize`. It is a disabled-state
  and decoration value now.
- **Do** reach for weight before size when something needs to feel more
  important — 800 at 15px outranks 400 at 20px in this system.
- **Do** keep the 16px card / 10px control radius pairing. A new radius value
  needs a reason that a listed step cannot serve.
- **Do** match the shadow to the layer (Seat / Lift / Popover / Drawer / Modal),
  not to the mood.
- **Do** preserve the half-point type sizes; 12.5px and 13px are distinct roles.
- **Do** carry the AI disclaimer at 11px Ink Faint under any surface presenting
  generated analysis, as the SWOT card and country drawer already do.
- **Do** state absence explicitly — `#D1D5DB` for unranked countries, an em dash
  for a missing KRS, a dashed-border panel for no saved profiles. Missing data is
  a designed state.

### Don't:

- **Don't** use `#FAF8F4` or `#E8E2D8` in new work. They are legacy warm values
  pending migration, listed above.
- **Don't** introduce a second saturated accent. If green is already spoken for
  on the screen, the answer is weight, size or position.
- **Don't** use Meridian Navy (`#13294F`) for anything but the logo and wordmark.
- **Don't** add another near-duplicate green. `#16803C` has been consolidated
  onto `#15803D`; the greens are now `#16A34A` (region), `#15803D` (ink) and
  `#166534` (hover), and that is the whole set.
- **Don't** generalize Analyst Violet (`#7C3AED`). It exists to keep the fourth
  SWOT quadrant distinguishable and has no other license.
- **Don't** use tier green/amber/red to mean anything except rank position
  1–5 / 6–10 / 11–15. Sentiment, health and recency need a different device.
- **Don't** add gradients, glassmorphism, blur backdrops, glow effects, sparkle
  or orb decoration, illustrated mascots, or pastel blob geometry. Each belongs
  to one of the three rejected worlds.
- **Don't** animate anything the user did not cause, and don't exceed 0.4s.
- **Don't** let the map be the only path to a country's data — the ranking list
  beside it carries that duty and must keep carrying it.
- **Don't** reintroduce dead `.mc-*` rules. `.mc-icon-btn`, `.mc-menu-item`,
  `.mc-new-profile-tile`, `.mc-dropdown-row`, `.mc-bubble`, `.mc-top3-card` and
  the `mc-pop` keyframe are defined in
  [globals.css](app/globals.css) but referenced by nothing.
