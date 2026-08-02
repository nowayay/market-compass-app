# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary audience: the Master's-thesis committee and demo viewers.** They meet
MarketCompass in a short, guided walkthrough — often once, often without prior
context. They must be able to grasp the concept, follow the pipeline from
company name to expansion analysis, and judge the work as a complete,
convincing product within that single sitting. Design decisions are answerable
to that viewing situation.

**Portrayed user (the person the product is built as if for): an owner or
manager of a Polish SME**, a non-specialist decision-maker weighing whether and
where to expand abroad. Every screen, label and default assumes this person.
The interface must never read as a toy to a professional who opens it, but it
is not analyst tooling either.

These two are not in conflict: the demo is convincing precisely when the SME
scenario is executed without compromise.

## Product Purpose

MarketCompass turns a Polish company's name into a structured international
expansion analysis. The user enters a company name (optionally narrowing with
founding year or KRS number); the app identifies the real legal entity, enriches
it with web research, and produces a single AI-generated expansion analysis —
a SWOT plus a scored ranking of 15 target countries, each with its own
opportunities and risks. A chat assistant sits alongside, aware of the analyzed
company. Success is a viewer who understands, in one pass, that the answer on
screen is about a *real, identified company* and not about a name typed into a
prompt.

## Positioning

**Verified input, structured output — the pipeline is the product.**

Neither half is the claim on its own. The analysis is anchored to a real legal
entity resolved from the Polish KRS register (plus verified official website and
web research with recorded provenance), and it always resolves into the same
rigorous, comparable deliverable: SWOT plus 15 scored countries with
opportunities and risks. Never a freeform essay. A generic AI chat can imitate
the output but cannot truthfully claim the verified input; a registry lookup can
claim the input but produces no decision.

Provenance is part of the claim, not decoration: sources carry a provider
(`krs`, `openai_web_search`), a type (official registry, official company
website, official company document, government, discovery source) and an
authority level (primary, authoritative secondary, secondary).

## Operating Context

The product is a five-screen linear flow, all client-state, all in one browser
session:

1. **Profiles** — the landing screen when saved analyses exist; a picker with
   per-profile delete.
2. **Form** — company name (required), founding year and KRS number (optional).
3. **Confirm** — a candidate list, shown when identification resolves to more
   than one company. The confirmation reuses the original frozen query verbatim.
4. **Analyzing** — a genuine wait: the research route allows up to 300 s, the
   client gives up at 290 s. Country details allow 120 s.
5. **Dashboard** — interactive world map (d3-geo Natural Earth projection),
   SWOT, sources, top-expansion recommendation, and the 15-country ranking;
   plus country-detail and full-map modals and the chat modal.

Waiting is a real part of the experience, not an edge case. So is partial
success: a truncated chat reply keeps its text and shows a neutral "shortened"
note rather than an error.

## Capabilities and Constraints

**Stack (existing):** Next.js 15 App Router, React 19, TypeScript, Tailwind v4
present but the screens are written in inline styles, `zod` for contracts,
`d3-geo` for the map, OpenAI SDK. Deployed on Vercel. Route handlers are the
only backend.

**Confirmed constraints:**

- **No natural-person data, ever.** MarketCompass never stores, transmits or
  returns data about board members, shareholders, representatives, beneficial
  owners or employees. This is stated in the contracts and surfaced to the user
  on the form screen. It is binding and non-negotiable.
- **Privacy-safe provenance only.** Public source URLs are origin-only (scheme +
  host) or null. Exact page URLs, titles, snippets, query strings and fragments
  never reach the client.
- **Coarse location only** — city/region/country, never a street address.
- **No accounts, no database.** Company profiles persist in browser
  `localStorage` only. Single user, single device.
- **Country ranking is exactly 15 distinct countries**, sorted by score
  descending, scores 0–100.
- The paid web-research stages (company identification, domain discovery,
  domain confirmation, business research) are each **independently
  feature-flagged and off by default**, with per-window request caps and
  concurrency limits. The UI must remain coherent when a stage is disabled.

**Out of scope — do not design for these:** user accounts and auth, PostgreSQL /
Prisma, PDF report generation, multi-device sync. They appear on the README
roadmap but are aspirational; the current feature set is the product.

**Stale README claims to ignore as product truth:** Framer Motion and Lucide
Icons are listed but not installed; there is no `public/` directory, no web app
manifest and no service worker, so the "Progressive Web App / installable"
claim is not implemented. Do not carry these into design work as facts.

## Brand Commitments

- **Name:** MarketCompass. Rendered as "Market" + "Compass" with the second half
  in the accent green (`#16A34A`) against navy (`#13294F`).
- **Assistant name:** MarketCompassAI.
- **Mark:** an existing custom compass logo component
  ([CompassLogo.tsx](src/components/CompassLogo.tsx)).
- **Language:** the entire interface is Polish, addressing the user directly and
  informally ("Znajdź swoją firmę", "Podaj nazwę firmy"). Plain, confident,
  non-jargon; explains registry terms rather than assuming them.
- **Honesty in copy:** the form already tells the user what their data is used
  for and that no natural-person data is processed. That candor is part of the
  voice.

## Evidence on Hand

- Real, working pipeline against the Polish KRS registry — the verification
  claim is demonstrable, not mocked.
- Recorded source provenance per fact ([companyResearch.ts:88-122](src/contracts/companyResearch.ts#L88-L122)).
- Test coverage for the storage, derivation and client layers
  ([src/\_\_tests\_\_/](src/__tests__/)).

**Absent — must never be fabricated:** customers, users, testimonials, case
studies, press, pricing, accuracy benchmarks, adoption numbers, partner or
integration logos, certifications, or any claim of commercial deployment. This
is an unreleased thesis project with no users.

## Product Principles

1. **Show the verification, don't just assert it.** The registry origin and the
   source provenance are the product's whole credibility; a design that hides
   them throws away the differentiator.
2. **One company, one analysis, one shape.** The deliverable is fixed and
   comparable — SWOT and 15 scored countries. Consistency of that shape is a
   feature, not a limitation to design around.
3. **Built for the SME owner, legible to a professional.** No jargon the
   portrayed user wouldn't use; no simplification a specialist would find
   hollow.
4. **The wait is part of the product.** Long research runs, partial results and
   disabled stages are normal states and deserve designed treatment, not
   spinners and error red.
5. **Never imply more than exists.** No fabricated proof, no accounts that
   aren't there, no persistence promises `localStorage` can't keep.

## Accessibility & Inclusion

No product-specific standard was established. Baseline craft applies: the map is
a decorative-plus-interactive surface and must never be the only path to the
ranking data — the ranked list beside it already carries that duty and must
continue to.
