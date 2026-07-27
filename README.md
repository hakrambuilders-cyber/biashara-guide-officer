# TRA Officer Console (Biashara Guide)

A standalone, desktop-oriented app for TRA officers to view aggregate national analytics — never individual citizen case data. Deliberately published as its **own separate repository and site**, not a page inside the citizen app, so there is no link between the two: the citizen app has no path to this console at all.

**Citizen app (separate project):** https://github.com/hakrambuilders-cyber/biashara-guide.v2 — read [its PRODUCT_CONSTITUTION.md](https://github.com/hakrambuilders-cyber/biashara-guide.v2/blob/master/docs/PRODUCT_CONSTITUTION.md) and [FUNCTIONAL_SPEC.md](https://github.com/hakrambuilders-cyber/biashara-guide.v2/blob/master/docs/FUNCTIONAL_SPEC.md) for the vision, architecture, and the RBAC model (§9) this console implements.

🧪 **This is an unofficial concept prototype** — not affiliated with or endorsed by TRA. The login is a simulation: any username/password is accepted, nothing is checked or stored. No real TRA authentication exists here.

## Run it

```
npm start
```

Open the URL it prints, log in with anything, and you'll land on the National Analytics Overview.

## What it shows

- **Login simulation** as the entry gate — reflects the real design intent (officers authenticate, citizens don't) without any real backend to authenticate against.
- **National Analytics Overview**: compliance score distribution, risk levels, biggest national compliance gaps, most common next-best-actions, sector/region breakdowns, notice types received, topics causing the most confusion, language/channel split, and a benefits-eligibility snapshot.
- **Aggregate only, always.** Every number here is a count or percentage — there is no view, table, or export of an individual business anywhere in this app. That's not just a UI choice; the underlying `engine/analytics.js` module physically never returns per-business data to the caller.
- **A quiet refresh control.** The 🇹🇿 flag icon in the sidebar regenerates the anonymous synthetic snapshot with a new random seed — deliberately understated rather than an obvious "Reset Data" button, since it only ever re-samples fake aggregate data, never a real record.

## Data source (today vs. real deployment)

There is no backend yet — `engine/analytics.js` generates a synthetic population of 240 mock businesses and scores every one of them with the *same* compliance/risk logic (`engine/core.js`) that a real citizen's profile goes through in the citizen app. That's deliberate: it proves the aggregate view is powered by the real engine, not a separately mocked-up model. In a real deployment, `generateMockPopulation()` is replaced by a real event-collection pipeline; `buildTRAInsights()`'s aggregation logic stays the same.

## Code organization

- `index.html`, `app.js` — login gate + dashboard rendering, DOM events
- `styles.css` — self-contained: shared design tokens/components (kept in sync by hand with the citizen repo's `styles.css`) plus this console's own desktop shell/dashboard layout
- `brand.js` — the same original logo mark used by the citizen app, copied here so both keep one visual identity
- `engine/core.js`, `engine/knowledge.js`, `engine/analytics.js` — copies of the citizen repo's channel-agnostic engine and knowledge base; the citizen repo is the source of truth if these ever need to change

## Why a separate repo instead of one shared codebase

Both apps are static, no-build-step vanilla JS/HTML/CSS. Sharing files across two independent GitHub Pages deployments with no build tooling would mean either a git submodule (real complexity for a two-file dependency) or a package registry (overkill for a prototype). Copying the small set of shared files and noting the source of truth in comments is the simplest option that still gets a genuinely separate deployment, login boundary, and URL.
