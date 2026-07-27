/**
 * TRA Officer Console — a standalone app, deliberately published as its own
 * repository/site rather than a screen or path inside the citizen app
 * (see https://github.com/hakrambuilders-cyber/biashara-guide.v2). Separate
 * persona, separate device assumption (desktop, not mobile-first), separate
 * login gate — reflecting the RBAC model in that project's
 * docs/FUNCTIONAL_SPEC.md §9 (officers authenticate; citizens don't). The
 * citizen app has no link to this console at all.
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

// Tries live data first; falls back to a zeroed synthetic sample. This is
// also what the flag-camouflaged sidebar control re-runs: in live mode that
// means "check for real activity again" (never destructive — the anon key
// can only insert, never delete/update, see supabase-setup.sql), in
// fallback mode it means the demo sample goes to 0/empty.
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
  insightsCache = buildTRAInsights(generateMockPopulation(0));
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

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function renderLogin() {
  return `
    <div class="login-screen">
      <div class="login-panel">
        <div class="brand-mark">${brandMarkSvg()}</div>
        <h1>TRA Officer Console</h1>
        <p class="login-sub">Aggregate analytics access for authorised TRA staff.</p>
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
        <a class="login-back" href="https://hakrambuilders-cyber.github.io/biashara-guide.v2/">← Back to citizen app</a>
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
        <div class="sidebar-title">TRA Officer Console</div>
        <div class="sidebar-session">
          <span class="session-label">Signed in as</span>
          <strong>${esc(session.username)}</strong>
        </div>
        <button class="link-btn logout-btn" id="logoutBtn">Log out</button>
        <p class="legal-note sidebar-note">🧪 Aggregate data only — never individual case files. Case-level access requires a logged reason (Functional Specification §9–§10).</p>
      </aside>

      <main class="officer-main">
        <h1>National Analytics Overview <span class="chip officer-chip">${liveMode ? 'LIVE DATA' : 'DEMO DATA'}</span></h1>
        <p class="lead">${liveMode
          ? `Aggregate data from ${plural(insights.overview.total, 'real, anonymized guidance session', 'real, anonymized guidance sessions')} — no individual name or case data appears here, by design.`
          : `No real activity yet — showing a synthetic sample of ${insights.overview.total} simulated businesses so the dashboard isn't empty.`}</p>
        <p class="snapshot-time">Data snapshot generated ${timeAgo(insights.generatedAt)}</p>

        <div class="kpi-grid">
          <div class="kpi-tile">
            <span class="kpi-value">${insights.overview.total}</span>
            <span class="kpi-label">${liveMode ? 'Businesses (real)' : 'Businesses (mock)'}</span>
          </div>
          <div class="kpi-tile">
            <span class="kpi-value">${insights.overview.avgComplianceScore}%</span>
            <span class="kpi-label">Avg. Compliance Score</span>
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
            <span class="snapshot-label">Biggest Compliance Gaps (National)</span>
            ${insights.registrationGaps.map(g => barRow(t(g.label) || g.label, g.pct, plural(g.missing, 'business', 'businesses'))).join('')}
          </div>

          <div class="card">
            <span class="snapshot-label">Most Common Next-Best-Actions</span>
            <p class="question-note">Shows where most businesses are stuck — never who they are.</p>
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

        ${liveMode ? `
          <p class="legal-note footer-note">This is real, anonymized aggregate data from the citizen app. Region, notice types, and benefits eligibility aren't collected by the citizen app's telemetry yet, so those breakdowns aren't shown here. Access to any individual case requires a logged reason — see Functional Specification §9–§10.</p>
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
