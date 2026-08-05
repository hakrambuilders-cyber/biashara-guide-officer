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
- **National Analytics Overview**: compliance score distribution, risk levels, biggest national compliance gaps, most common next-best-actions, sector breakdown, language/channel split — from **real anonymized citizen activity** when there is any, or a synthetic sample when there isn't (see below).
- **Aggregate only, always.** Every number here is a count or percentage — there is no view, table, or export of an individual business anywhere in this app, in either data mode. In live mode this isn't just a UI convention: the database itself (see `supabase-setup.sql`) never grants this app permission to read a raw row, only two aggregate-only functions.
- **A quiet refresh control.** The Tanzania flag icon in the sidebar just re-checks the live database — deliberately understated rather than an obvious "Refresh" button. It is never destructive: the app's database credentials only have insert/read-aggregate rights, never delete/update.

## Data source: three states, never mixed up

This console always tries the real database first, and is in exactly one of three states at any time — each labeled distinctly so none can be mistaken for another:

| State | Badge | When |
|---|---|---|
| **Live, with data** | `LIVE DATA` (black) | Connected, real guidance sessions exist |
| **Live, empty** | `LIVE DATA` (black) | Connected, database genuinely has 0 rows right now (e.g. right after a cleanup `DELETE`) — shown as real zeros with an explicit "these are genuine zeros, not placeholder data" message |
| **Offline** | `⚠️ OFFLINE — EXAMPLE DATA` (red) + a red banner | The fetch itself failed (Supabase paused, unreachable, or not set up) — only *this* state shows `engine/analytics.js`'s synthetic sample |

Earlier versions of this app conflated "no live data" with "explicitly reset," which meant an empty real database and a paused Supabase project could show different, inconsistent things. That's gone: the only thing that ever changes what's on screen is whether the fetch to Supabase succeeds, not why it's empty.

The citizen app ([biashara-guide.v2](https://github.com/hakrambuilders-cyber/biashara-guide.v2), see its `engine/telemetry.js`) sends one anonymized event to a shared Supabase database whenever someone reaches their Compliance Advisor screen: sector, stage, sales bracket, registration status, compliance score, risk level, next action, language — no name, phone, NIDA number, or free text. This console reads back only pre-aggregated counts/percentages through `get_guidance_overview()` / `get_guidance_breakdowns()` (`supabase-setup.sql`), never a raw row.

**"Topics Causing the Most Confusion"** is real too: every "Ask Anything" chat message in the citizen app is classified into a topic (TIN / tax / notice / benefits / general — see `engine/core.js#classifyChatTopic` there) and logged to a separate `chat_events` table, topic only, never the message text. It's fetched independently from the profile-based stats, so an older database that hasn't run the `chat_events` migration in `supabase-setup.sql` yet just shows no chat card rather than breaking the rest of the live dashboard.

**Known gap:** the citizen app doesn't currently collect region, notice type, or turnover/benefits-eligibility data as part of its telemetry, so those breakdowns only appear in the offline/example state, not live mode. Extending telemetry to cover them is straightforward but intentionally out of scope for this pass — see `engine/telemetry.js` in the citizen repo for the exact fields sent today.

## Troubleshooting

**Seeing "⚠️ OFFLINE — EXAMPLE DATA" (red badge)?** The fetch to Supabase failed. Most likely: the Supabase project is paused (free-tier projects auto-pause after a period of inactivity) — log into [supabase.com](https://supabase.com), find the project, and click Resume/Restore if it shows as paused. A quick way to confirm from the command line: `nslookup <your-project-ref>.supabase.co` — if that says "Non-existent domain," the project isn't reachable at all right now.

**Seeing "LIVE DATA" with all zeros?** That's not an error — it means the connection to Supabase is working fine, the database genuinely has no rows in it right now (e.g. right after running a cleanup `DELETE`). It'll show real numbers again as soon as new activity comes in from the citizen app.

**Made a code change, pushed it, but the live site still shows the old version?** GitHub Pages occasionally gets stuck serving a stale build even when the Actions workflow reports success. Check the Actions tab — if the latest run says "completed successfully" but the live site doesn't match, push an empty commit (`git commit --allow-empty -m "trigger redeploy"`) to force a fresh deployment.

## Code organization

- `index.html`, `app.js` — login gate, live-data fetching (Supabase) with synthetic fallback, dashboard rendering, DOM events
- `supabase-setup.sql` — the exact database schema/policies/functions backing live mode; run once in a new Supabase project's SQL Editor
- `styles.css` — self-contained: shared design tokens/components (kept in sync by hand with the citizen repo's `styles.css`) plus this console's own desktop shell/dashboard layout
- `brand.js` — the same original logo mark used by the citizen app, copied here so both keep one visual identity
- `engine/core.js`, `engine/knowledge.js`, `engine/analytics.js` — copies of the citizen repo's channel-agnostic engine and knowledge base (analytics.js also builds the synthetic fallback); the citizen repo is the source of truth if these ever need to change

## Why a separate repo instead of one shared codebase

Both apps are static, no-build-step vanilla JS/HTML/CSS. Sharing files across two independent GitHub Pages deployments with no build tooling would mean either a git submodule (real complexity for a two-file dependency) or a package registry (overkill for a prototype). Copying the small set of shared files and noting the source of truth in comments is the simplest option that still gets a genuinely separate deployment, login boundary, and URL.
