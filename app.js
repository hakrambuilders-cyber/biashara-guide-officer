/**
 * Biashara Guide Insights — the officer-facing aggregate insight surface of
 * the same guidance layer used by the citizen journey. It keeps a separate
 * desktop device assumption and login gate to reflect the RBAC model in the
 * citizen project's docs/FUNCTIONAL_SPEC.md §9 (officers authenticate;
 * citizens don't), without positioning Biashara Guide as another citizen app.
 *
 * The login here is a simulation only: no real authentication exists in
 * this prototype. It exists to make the access boundary visible in the
 * demo, not to secure anything.
 *
 * engine/core.js, engine/knowledge.js, engine/analytics.js, and brand.js
 * are copies of the exact same files from the citizen app's repo — kept in
 * sync by hand for now since the two are genuinely separate deployments
 * with no shared build step. If they ever drift, the citizen repo is the
 * source of truth.
 *
 * Live data: this console first tries to fetch real, anonymized aggregate
 * stats from Supabase (see ../supabase-setup.sql) — the same store the
 * citizen app writes one anonymized event to per session
 * (engine/telemetry.js there). If there is no real activity yet (or the
 * fetch fails), it falls back to the synthetic demo population so the
 * dashboard is never just blank. The anon key below is meant to be public —
 * see supabase-setup.sql for why it can only insert/read aggregates, never
 * a raw record.
 */

import { generateMockPopulation, buildTRAInsights } from './engine/analytics.js';
import { SECTORS } from './engine/knowledge.js';
import { ACTIVE_RULES, REGISTRY_META, REGULATORY_REGISTER } from './engine/regulatory.js';
import { brandMarkSvg } from './brand.js';

const SUPABASE_URL = 'https://fintumxfjtzvxmscdtdj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_U6Uc8KXbeAsi0Q_nF9CepA_j0RvgVHv';

const CHANNEL_LABEL = { web: 'Web', ussd: 'USSD', whatsapp: 'WhatsApp' };
const CHAT_TOPIC_LABEL = {
  tin: 'TIN questions',
  tax: 'Tax / VAT questions',
  notice: 'TRA notice questions',
  benefits: 'Benefits / incentive questions',
  general: 'General questions'
};
const ACTION_TITLES = {
  tin: 'Get a TIN',
  businessRegistration: 'Complete business registration',
  licence: 'Check the required licence',
  efd: 'Check whether an EFD machine is required',
  records: 'Start keeping simple records',
  filedReturn: 'Learn whether a return applies to you',
  maintain: 'Keep maintaining good standing'
};
const GAP_DIMENSION_TO_KEY = {
  gap_tin: 'tin',
  gap_business_registration: 'businessRegistration',
  gap_licence: 'licence',
  gap_records: 'records',
  gap_filed_return: 'filedReturn'
};
const GAP_KEY_LABEL = {
  tin: 'No TIN',
  businessRegistration: 'No business registration',
  licence: 'No licence',
  records: 'No records kept',
  filedReturn: 'Have not filed a return'
};

let session = null; // { username } — in-memory only, resets on reload by design
let insightsCache = null;
let liveMode = false;

// ---------------------------------------------------------------------------
// Live data (Supabase) — falls back to synthetic if empty or unreachable
// ---------------------------------------------------------------------------

async function callRpc(fn) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });
  if (!res.ok) throw new Error(`${fn} failed: ${res.status}`);
  return res.json();
}

async function fetchLiveInsights() {
  const [overviewRows, breakdownRows] = await Promise.all([
    callRpc('get_guidance_overview'),
    callRpc('get_guidance_breakdowns')
  ]);

  const total = Number(overviewRows[0]?.total ?? 0);
  if (!total) return null; // no real profile activity yet — let the caller fall back to synthetic
  // (real chat-only activity with zero profile activity is treated as "not
  // live yet" for simplicity — the core dashboard has nothing else real to
  // show in that case; see README "known gaps")

  // Fetched independently: an older database that hasn't had chat_events /
  // get_chat_topic_breakdown added yet (see supabase-setup.sql) must not
  // break the rest of the live dashboard — it should just show no chat
  // breakdown until that migration is run.
  const chatRows = await callRpc('get_chat_topic_breakdown').catch(() => []);

  const chatTopicBreakdown = chatRows.map((r) => ({
    topic: r.topic,
    count: Number(r.count),
    pct: Number(r.pct)
  }));

  const by = (dimension) => breakdownRows.filter((r) => r.dimension === dimension);

  const riskByLevel = Object.fromEntries(by('risk_level').map((r) => [r.key, r]));
  const riskBreakdown = ['low', 'medium', 'high'].map((level) => ({
    level,
    count: Number(riskByLevel[level]?.count ?? 0),
    pct: Number(riskByLevel[level]?.pct ?? 0)
  }));

  const sectorBreakdown = by('sector').map((r) => ({
    name: SECTORS[r.key]?.name.split(' (')[0] ?? r.key,
    count: Number(r.count),
    pct: Number(r.pct)
  }));

  const registrationGaps = breakdownRows
    .filter((r) => GAP_DIMENSION_TO_KEY[r.dimension])
    .map((r) => {
      const key = GAP_DIMENSION_TO_KEY[r.dimension];
      return { key, label: GAP_KEY_LABEL[key], missing: Number(r.count), pct: Number(r.pct) };
    })
    .sort((a, b) => b.pct - a.pct);

  const topNextActions = by('next_action')
    .map((r) => ({ title: ACTION_TITLES[r.key] ?? r.key, count: Number(r.count), pct: Number(r.pct) }))
    .sort((a, b) => b.count - a.count);

  const languageSplit = by('language').map((r) => ({ lang: r.key, count: Number(r.count), pct: Number(r.pct) }));
  const channelSplit = by('channel').map((r) => ({ channel: r.key, count: Number(r.count), pct: Number(r.pct) }));

  return {
    generatedAt: Date.now(),
    overview: {
      total,
      avgComplianceScore: Number(overviewRows[0]?.avg_compliance_score ?? 0),
      highRiskShare: Number(overviewRows[0]?.high_risk_share ?? 0),
      escalationRate: null // not tracked yet — see README "known gaps"
    },
    riskBreakdown,
    sectorBreakdown,
    regionBreakdown: null, // not collected by the citizen app yet
    registrationGaps,
    topNextActions,
    noticeBreakdown: [],
    chatTopicBreakdown,
    languageSplit,
    channelSplit,
    benefitsSnapshot: null // not collected by the citizen app yet
  };
}

// Tries live data first; falls back to a clearly-labelled synthetic sample. This is
// also what the flag-camouflaged sidebar control re-runs: in live mode that
// means "check for real activity again" (never destructive — the anon key
// can only insert, never delete/update, see supabase-setup.sql), in
// fallback mode it regenerates the labelled synthetic sample.
async function loadInsights() {
  try {
    const live = await fetchLiveInsights();
    if (live) {
      liveMode = true;
      insightsCache = live;
      return;
    }
  } catch {
    // Network error, CORS issue, or Supabase not set up yet — fall back below.
  }
  liveMode = false;
  insightsCache = buildTRAInsights(generateMockPopulation(240));
}

// Small inline Tanzania flag — used instead of the 🇹🇿 emoji, which several
// Windows font builds render as a "TZ" letter-code box instead of an actual
// flag. An SVG renders identically everywhere.
function tzFlagSvg() {
  return `<svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">
    <rect width="30" height="20" fill="#1EB53A"/>
    <polygon points="0,20 30,0 30,20" fill="#00A3DD"/>
    <polygon points="0,17.5 0,20 2.5,20 30,2.5 30,0 27.5,0" fill="#FCD116"/>
    <polygon points="0,18.5 0,20 1.5,20 30,1.5 30,0 28.5,0" fill="#000000"/>
  </svg>`;
}

function t(copyObj) {
  return copyObj?.en ?? '';
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function plural(n, word, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

function timeAgo(ts) {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hour${hours === 1 ? '' : 's'} ago`;
}

function barRow(label, percent, sublabel) {
  return `
    <div class="bar-row">
      <div class="bar-row-top"><span>${esc(label)}</span><b>${percent}%</b></div>
      <div class="bar-track"><i style="width:${percent}%;"></i></div>
      ${sublabel ? `<span class="bar-sublabel">${esc(sublabel)}</span>` : ''}
    </div>`;
}

function formatDate(value) {
  if (!value) return 'Current rule; commencement date to be confirmed in legal review';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function renderRegulatoryRegister() {
  const statusLabel = {
    active: 'ACTIVE IN ENGINE',
    'active-reference': 'ACTIVE REFERENCE',
    replaced: 'REPLACED'
  };
  return `
    <section class="regulatory-section" id="regulatory-register" aria-labelledby="regulatory-heading">
      <div class="section-heading-row">
        <div>
          <span class="platform-kicker">INTERNAL GOVERNANCE · PROTOTYPE</span>
          <h2 id="regulatory-heading">Regulatory Update Register</h2>
          <p class="lead">The citizen journey stays short. This internal register controls which verified rules the guidance engine uses and preserves what changed.</p>
        </div>
        <div class="registry-version">
          <span>Active ruleset</span>
          <strong>${esc(ACTIVE_RULES.id)}</strong>
          <small>Sources rechecked ${formatDate(REGISTRY_META.verifiedAt)}</small>
        </div>
      </div>

      <div class="rule-summary-grid" aria-label="Active rule summary">
        <div class="rule-summary"><span>Presumptive-tax ceiling</span><b>TZS 200m / year</b></div>
        <div class="rule-summary"><span>Upper incomplete-record rate</span><b>4% of turnover</b></div>
        <div class="rule-summary"><span>EFD/VFD turnover threshold</span><b>TZS 11m / year</b></div>
      </div>

      <div class="register-list">
        ${REGULATORY_REGISTER.map((entry) => `
          <article class="register-entry status-${entry.status}">
            <div class="register-entry-top">
              <div>
                <span class="register-id">${esc(entry.id)} · ${esc(entry.instrumentType)}</span>
                <h3>${esc(entry.title)}</h3>
              </div>
              <span class="register-status">${statusLabel[entry.status] ?? esc(entry.status)}</span>
            </div>
            <dl class="register-meta">
              <div><dt>Effective from</dt><dd>${formatDate(entry.effectiveFrom)}</dd></div>
              <div><dt>Prototype verification</dt><dd>${formatDate(entry.verifiedOn)}</dd></div>
              <div><dt>Affected guidance</dt><dd>${entry.affectedProfiles.map(esc).join(' · ')}</dd></div>
            </dl>
            <p>${esc(entry.impact)}</p>
            <p class="approval-note">${esc(entry.approval)}</p>
            ${entry.sourceUrl ? `<a class="source-link" href="${esc(entry.sourceUrl)}" target="_blank" rel="noopener noreferrer">Open official source ↗</a>` : ''}
          </article>
        `).join('')}
      </div>
      <p class="legal-note">Governance safeguard: official-source verification in this prototype is not a claim of TRA approval. A real deployment requires authenticated legal/content approval before a rule becomes active.</p>
    </section>`;
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function renderLogin() {
  return `
    <div class="login-screen">
      <div class="login-panel">
        <div class="brand-mark">${brandMarkSvg()}</div>
        <span class="platform-kicker">TRA DIGITAL SERVICES · CONCEPT</span>
        <h1>Biashara Guide Insights</h1>
        <p class="login-sub">Aggregate guidance patterns for authorised staff — one insight surface for Web, USSD, WhatsApp and other connected channels.</p>
        <form id="loginForm" class="login-form">
          <label>Username
            <input type="text" id="loginUser" placeholder="e.g. officer.demo" autocomplete="off" />
          </label>
          <label>Password
            <input type="password" id="loginPass" placeholder="••••••••" autocomplete="off" />
          </label>
          <button type="submit" class="btn btn-primary">Log In</button>
        </form>
        <p class="login-note">🧪 Demo simulation — enter any username and password; nothing is checked, validated, or stored. No real TRA authentication exists in this prototype.</p>
        <p class="integration-note">Citizen guidance and officer insights are two views of the same guidance layer, not two unrelated apps.</p>
      </div>
    </div>`;
}

function renderLoading() {
  return `<div class="login-screen"><div class="login-panel"><div class="brand-mark">${brandMarkSvg()}</div><p class="login-sub" style="margin-top:18px;">Loading analytics…</p></div></div>`;
}

function renderDashboard() {
  const insights = insightsCache;

  return `
    <div class="officer-app">
      <aside class="officer-sidebar">
        <div class="sidebar-top">
          <div class="brand-mark">${brandMarkSvg()}</div>
          <button class="flag-reset" id="flagReset" type="button" title="Refresh" aria-label="Refresh statistics">${tzFlagSvg()}</button>
        </div>
        <div class="sidebar-title">Biashara Guide Insights</div>
        <div class="sidebar-context">Digital guidance layer</div>
        <div class="sidebar-session">
          <span class="session-label">Signed in as</span>
          <strong>${esc(session.username)}</strong>
        </div>
        <a class="sidebar-nav-link" href="#regulatory-register">Regulatory updates</a>
        <button class="link-btn logout-btn" id="logoutBtn">Log out</button>
        <p class="legal-note sidebar-note">🧪 Aggregate data only — never individual case files. Case-level access requires a logged reason (Functional Specification §9–§10).</p>
      </aside>

      <main class="officer-main">
        <span class="platform-kicker">AGGREGATED ACROSS CONNECTED GUIDANCE CHANNELS</span>
        <h1>National Guidance Overview <span class="chip officer-chip">${liveMode ? 'LIVE DATA' : 'DEMO DATA'}</span></h1>
        <p class="lead">${liveMode
          ? `Aggregate data from ${plural(insights.overview.total, 'real, anonymized business guidance snapshot', 'real, anonymized business guidance snapshots')} — these are business journeys, not a count of unique people.`
          : `No real activity yet — showing a synthetic sample of ${insights.overview.total} simulated business guidance journeys so the dashboard isn't empty.`}</p>
        <p class="snapshot-time">Data snapshot generated ${timeAgo(insights.generatedAt)}</p>

        <div class="kpi-grid">
          <div class="kpi-tile">
            <span class="kpi-value">${insights.overview.total}</span>
            <span class="kpi-label">${liveMode ? 'Guidance snapshots (real)' : 'Guidance journeys (mock)'}</span>
          </div>
          <div class="kpi-tile">
            <span class="kpi-value">${insights.overview.avgComplianceScore}%</span>
            <span class="kpi-label">Avg. Guidance Readiness</span>
          </div>
          <div class="kpi-tile ${insights.overview.highRiskShare > 30 ? 'warn' : ''}">
            <span class="kpi-value">${insights.overview.highRiskShare}%</span>
            <span class="kpi-label">At High Risk</span>
          </div>
          <div class="kpi-tile">
            <span class="kpi-value">${insights.overview.escalationRate === null ? '—' : insights.overview.escalationRate + '%'}</span>
            <span class="kpi-label">Escalated to TRA</span>
          </div>
        </div>

        <div class="dashboard-grid">
          <div class="card">
            <span class="snapshot-label">Risk Level (National)</span>
            <div class="risk-legend">
              ${insights.riskBreakdown.map(r => `
                <div class="risk-legend-item">
                  <span class="risk-chip risk-${r.level}">${r.level[0].toUpperCase() + r.level.slice(1)} risk</span>
                  <b>${r.pct}%</b>
                  <span class="step-time">${plural(r.count, 'business', 'businesses')}</span>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="card">
            <span class="snapshot-label">Most Common Guidance Gaps (National)</span>
            <p class="question-note">Operational use: identify where clearer education, assisted service or simpler formalisation guidance may have the greatest reach.</p>
            ${insights.registrationGaps.map(g => barRow(t(g.label) || g.label, g.pct, plural(g.missing, 'business', 'businesses'))).join('')}
          </div>

          <div class="card">
            <span class="snapshot-label">Most Common Next-Best-Actions</span>
            <p class="question-note">Operational use: shows which next-step guidance TRA may need to make easier or more visible — never who the businesses are.</p>
            ${insights.topNextActions.map(a => barRow(t(a.title) || a.title, a.pct, plural(a.count, 'business', 'businesses'))).join('')}
          </div>

          <div class="card">
            <span class="snapshot-label">Breakdown by Business Sector Selected</span>
            ${insights.sectorBreakdown.map(s => barRow(s.name, s.pct, s.avgScore !== undefined ? `${plural(s.count, 'business', 'businesses')} · avg score ${s.avgScore}%` : plural(s.count, 'business', 'businesses'))).join('')}
          </div>

          ${insights.regionBreakdown ? `
            <div class="card">
              <span class="snapshot-label">Breakdown by Region</span>
              ${insights.regionBreakdown.map(r => barRow(r.region, r.pct, `${plural(r.count, 'business', 'businesses')} · biggest gap: ${t(r.topGap)} · avg ${r.avgScore}%`)).join('')}
            </div>` : ''}

          ${insights.noticeBreakdown.length ? `
            <div class="card">
              <span class="snapshot-label">Notice Types Received</span>
              ${insights.noticeBreakdown.map(n => barRow(n.type, n.pct, plural(n.count, 'case', 'cases'))).join('')}
            </div>` : ''}

          ${insights.chatTopicBreakdown.length ? `
            <div class="card">
              <span class="snapshot-label">Topics Causing the Most Confusion</span>
              ${insights.chatTopicBreakdown.map(c => barRow(CHAT_TOPIC_LABEL[c.topic], c.pct, plural(c.count, 'conversation', 'conversations'))).join('')}
            </div>` : ''}

          <div class="card">
            <span class="snapshot-label">Language &amp; Channel Split</span>
            <div class="two-col">
              <div>
                <p class="question-note">Language</p>
                ${insights.languageSplit.map(l => barRow(l.lang === 'sw' ? 'Kiswahili' : 'English', l.pct)).join('')}
              </div>
              <div>
                <p class="question-note">Channel</p>
                ${insights.channelSplit.map(c => barRow(CHANNEL_LABEL[c.channel] ?? c.channel, c.pct)).join('')}
              </div>
            </div>
          </div>

          ${insights.benefitsSnapshot ? `
            <div class="card">
              <span class="snapshot-label">Benefits Eligibility Snapshot</span>
              <div class="benefit"><b>✓</b> ${insights.benefitsSnapshot.presumptiveEligiblePct}% are eligible for the presumptive tax exemption/flat rate</div>
              <div class="benefit"><b>?</b> ${insights.benefitsSnapshot.growthCheckPct}% are worth checking for growth resources</div>
            </div>` : ''}
        </div>

        ${renderRegulatoryRegister()}

        ${liveMode ? `
          <p class="legal-note footer-note">This is real, anonymized aggregate data from completed business guidance snapshots. One person may guide more than one business, so this dashboard deliberately does not present the total as unique citizens. Region, names, phone numbers and individual case profiles are not collected here.</p>
        ` : `
          <p class="legal-note footer-note">This is synthetic demo data (generated, not real people) shown because there's no real activity yet — it disappears the moment real guidance sessions start arriving. Access to any individual case requires a logged reason — see Functional Specification §9–§10.</p>
        `}
      </main>
    </div>`;
}

// ---------------------------------------------------------------------------
// Router / events
// ---------------------------------------------------------------------------

function render() {
  document.getElementById('app').innerHTML = session ? renderDashboard() : renderLogin();
}

async function refreshAndRender() {
  document.getElementById('app').innerHTML = renderLoading();
  await loadInsights();
  render();
}

function attachEvents() {
  document.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'loginForm') {
      e.preventDefault();
      const userInput = document.getElementById('loginUser');
      const username = (userInput?.value ?? '').trim() || 'officer.demo';
      session = { username };
      refreshAndRender();
    }
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('#logoutBtn')) {
      session = null;
      render();
      return;
    }
    if (e.target.closest('#flagReset')) {
      refreshAndRender();
    }
  });
}

attachEvents();
render();
