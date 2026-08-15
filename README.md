# Biashara Guide Insights (Officer View)

A desktop-oriented officer view for aggregate national guidance insights — never individual citizen case data. In this comparison version, it is intentionally framed as the staff-facing insight surface of the **same Biashara Guide guidance layer** that can serve citizens through existing digital touchpoints.

**Citizen app (separate project):** https://github.com/hakrambuilders-cyber/biashara-guide.v2 — read [its PRODUCT_CONSTITUTION.md](https://github.com/hakrambuilders-cyber/biashara-guide.v2/blob/master/docs/PRODUCT_CONSTITUTION.md) and [FUNCTIONAL_SPEC.md](https://github.com/hakrambuilders-cyber/biashara-guide.v2/blob/master/docs/FUNCTIONAL_SPEC.md) for the vision, architecture, and the RBAC model (§9) this console implements.

🧪 **This is an unofficial concept prototype** — not affiliated with or endorsed by TRA. The login is a simulation: any username/password is accepted, nothing is checked or stored. No real TRA authentication exists here.

## Run it

```
npm start
```

Open the URL it prints, log in with anything, and you'll land on the National Guidance Overview.

## What it shows

- **Login simulation** as the entry gate — reflects the real design intent (officers authenticate, citizens don't) without any real backend to authenticate against.
- **National Guidance Overview**: readiness/risk distribution, biggest national guidance gaps, most common next-best-actions, sector breakdown, and language/channel split — from **real anonymized citizen activity** when there is any, or a clearly labelled synthetic sample when there isn't (see below).
- **Aggregate only, always.** Every number here is a count or percentage — there is no view, table, or export of an individual business anywhere in this app, in either data mode. In live mode this isn't just a UI convention: the database itself (see `supabase-setup.sql`) never grants this app permission to read a raw row, only two aggregate-only functions.
- **A quiet refresh control.** The Tanzania flag icon in the sidebar re-checks for real data (or, if none exists, regenerates the synthetic sample). It can never delete real data; the app's database credentials only have insert/read-aggregate rights.

## Data source: live vs. synthetic

This console tries **real data first**. The citizen app ([biashara-guide.v2](https://github.com/hakrambuilders-cyber/biashara-guide.v2), see its `engine/telemetry.js`) sends one anonymized event to a shared Supabase database whenever someone reaches their Compliance Advisor screen: sector, stage, sales bracket, registration status, compliance score, risk level, next action, language — no name, phone, NIDA number, or free text. This console reads back only pre-aggregated counts/percentages through `get_guidance_overview()` / `get_guidance_breakdowns()` (`supabase-setup.sql`), never a raw row.

**If there's no real activity yet** (or the fetch fails), it falls back to `engine/analytics.js`'s synthetic population of mock businesses, scored by the *same* compliance/risk logic (`engine/core.js`) a real citizen's profile goes through — clearly labeled "DEMO DATA" instead of "LIVE DATA" so it's never mistaken for the real thing.

**"Topics Causing the Most Confusion"** is real too: every "Ask Anything" chat message in the citizen app is classified into a topic (TIN / tax / notice / benefits / general — see `engine/core.js#classifyChatTopic` there) and logged to a separate `chat_events` table, topic only, never the message text. It's fetched independently from the profile-based stats, so an older database that hasn't run the `chat_events` migration in `supabase-setup.sql` yet just shows no chat card rather than breaking the rest of the live dashboard.

**Known gap:** the citizen app doesn't currently collect region, notice type, or turnover/benefits-eligibility data as part of its telemetry, so those breakdowns only appear in synthetic/demo mode, not live mode. Extending telemetry to cover them is straightforward but intentionally out of scope for this pass — see `engine/telemetry.js` in the citizen repo for the exact fields sent today.

## Code organization

- `index.html`, `app.js` — login gate, live-data fetching (Supabase) with synthetic fallback, dashboard rendering, DOM events
- `supabase-setup.sql` — the exact database schema/policies/functions backing live mode; run once in a new Supabase project's SQL Editor
- `styles.css` — self-contained: shared design tokens/components (kept in sync by hand with the citizen repo's `styles.css`) plus this console's own desktop shell/dashboard layout
- `brand.js` — the same original logo mark used by the citizen app, copied here so both keep one visual identity
- `engine/core.js`, `engine/knowledge.js`, `engine/analytics.js` — copies of the citizen repo's channel-agnostic engine and knowledge base (analytics.js also builds the synthetic fallback); the citizen repo is the source of truth if these ever need to change
- `engine/regulatory.js` — synced active ruleset and regulatory update history used by the internal Regulatory Update Register

## Prototype packaging note

The citizen and officer views remain separate folders in this local comparison so each can be tested independently and the officer authentication boundary stays visible. That packaging decision does not mean citizens should adopt a second standalone app; Version B's product model is one reusable guidance layer with different channel and staff surfaces.
