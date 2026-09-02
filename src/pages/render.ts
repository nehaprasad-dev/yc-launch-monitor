import type { Company, Signal } from "@prisma/client";

import type { SourceHealthSummary } from "../monitor/types.js";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function signalLabel(type: string): string {
  if (type === "EARLY_YC") return "Early YC";
  if (type === "SPEEDRUN") return "Speedrun";
  return "Confirmed";
}

function healthClass(status: string): string {
  if (status === "healthy") return "ok";
  if (status === "degraded") return "warn";
  return "bad";
}

function pageShell(title: string, active: "home" | "signals" | "settings", body: string): string {
  const repoUrl = "https://github.com/nehaprasad-dev/yc-launch-monitor";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Syne:wght@600;700;800&display=swap" rel="stylesheet" />
    <style>
      :root {
        --bg: #E9EDF5;
        --bg-deep: #DDE4F0;
        --ink: #12182A;
        --muted: #5B6478;
        --faint: #8791A6;
        --line: rgba(18, 24, 42, 0.1);
        --accent: #E85D4C;
        --accent-soft: #FFD8D2;
        --teal: #0F8A75;
        --teal-soft: #D4F0EA;
        --amber: #C98512;
        --amber-soft: #F8E7C2;
        --surface: rgba(255, 255, 255, 0.72);
        --font: "Outfit", sans-serif;
        --display: "Syne", sans-serif;
      }

      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; }
      body {
        font-family: var(--font);
        color: var(--ink);
        background:
          radial-gradient(ellipse 70% 45% at 0% 0%, rgba(232, 93, 76, 0.16), transparent 55%),
          radial-gradient(ellipse 55% 40% at 100% 8%, rgba(15, 138, 117, 0.14), transparent 50%),
          linear-gradient(165deg, #F3F5FA 0%, var(--bg) 48%, var(--bg-deep) 100%);
        background-attachment: fixed;
      }
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        pointer-events: none;
        opacity: 0.22;
        background:
          repeating-linear-gradient(
            -18deg,
            transparent,
            transparent 11px,
            rgba(18, 24, 42, 0.035) 11px,
            rgba(18, 24, 42, 0.035) 12px
          );
      }

      a { color: inherit; text-decoration: none; }
      a:hover { color: var(--accent); }

      .wrap {
        position: relative;
        z-index: 1;
        width: min(1080px, calc(100% - 32px));
        margin: 0 auto;
        padding: 26px 0 64px;
      }

      header.site {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 40px;
        animation: in 500ms ease both;
      }
      .logo {
        display: flex;
        align-items: baseline;
        gap: 8px;
        font-family: var(--display);
        font-weight: 800;
        font-size: 26px;
        letter-spacing: -0.04em;
      }
      .logo em {
        font-style: normal;
        color: var(--accent);
      }
      .logo span {
        font-family: var(--font);
        font-size: 12px;
        font-weight: 600;
        color: var(--faint);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      nav {
        display: flex;
        gap: 4px;
      }
      nav a {
        padding: 8px 12px;
        font-size: 14px;
        font-weight: 600;
        color: var(--muted);
        border-bottom: 2px solid transparent;
      }
      nav a.active {
        color: var(--ink);
        border-bottom-color: var(--accent);
      }

      .intro {
        display: grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 28px;
        align-items: end;
        margin-bottom: 36px;
        animation: in 600ms ease both;
      }
      .intro h1 {
        margin: 0 0 12px;
        font-family: var(--display);
        font-size: clamp(2rem, 4.5vw, 3.25rem);
        line-height: 1.02;
        letter-spacing: -0.045em;
        max-width: 13ch;
      }
      .intro p {
        margin: 0;
        max-width: 38ch;
        color: var(--muted);
        font-size: 1.05rem;
        line-height: 1.55;
      }
      .pulse {
        justify-self: end;
        text-align: right;
      }
      .pulse .live {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--teal);
      }
      .pulse .live i {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--teal);
        box-shadow: 0 0 0 0 rgba(15, 138, 117, 0.55);
        animation: ping 1.8s ease infinite;
      }
      .pulse .when {
        color: var(--faint);
        font-size: 13px;
        font-weight: 500;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }
      .btn {
        appearance: none;
        border: 0;
        cursor: pointer;
        font: inherit;
        font-weight: 700;
        font-size: 14px;
        padding: 11px 16px;
        border-radius: 4px;
        transition: transform 150ms ease, background 150ms ease;
      }
      .btn:hover { transform: translateY(-1px); }
      .btn-main {
        background: var(--ink);
        color: #fff;
      }
      .btn-main:hover { background: #242C44; }
      .btn-side {
        background: transparent;
        color: var(--ink);
        border: 1.5px solid var(--line);
      }

      .metrics {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 0;
        margin-bottom: 28px;
        border-top: 1px solid var(--line);
        border-bottom: 1px solid var(--line);
        animation: in 700ms ease both;
      }
      .metric {
        padding: 22px 8px 20px;
        border-right: 1px solid var(--line);
      }
      .metric:last-child { border-right: 0; }
      .metric .k {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--faint);
      }
      .metric .v {
        margin-top: 6px;
        font-family: var(--display);
        font-size: 2rem;
        font-weight: 700;
        letter-spacing: -0.04em;
      }

      .block {
        margin-bottom: 28px;
        animation: in 750ms ease both;
      }
      .block-head {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .block-head h2 {
        margin: 0;
        font-family: var(--display);
        font-size: 1.35rem;
        letter-spacing: -0.03em;
      }
      .block-head p {
        margin: 0;
        color: var(--faint);
        font-size: 13px;
      }

      .sources {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .source {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        backdrop-filter: blur(8px);
      }
      .source .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--faint);
      }
      .source .ok { background: var(--teal); }
      .source .warn { background: var(--amber); }
      .source .bad { background: var(--accent); }
      .source .label.ok { color: var(--teal); }
      .source .label.warn { color: var(--amber); }
      .source .label.bad { color: var(--accent); }

      .feature {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 18px;
        align-items: start;
        padding: 22px 0;
        border-top: 2px solid var(--ink);
        border-bottom: 1px solid var(--line);
      }
      .feature .badge {
        display: inline-block;
        padding: 5px 9px;
        background: var(--accent);
        color: #fff;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        border-radius: 3px;
      }
      .feature h3 {
        margin: 0 0 6px;
        font-family: var(--display);
        font-size: 1.6rem;
        letter-spacing: -0.03em;
      }
      .feature .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 14px;
        margin-bottom: 10px;
        color: var(--muted);
        font-size: 13px;
        font-weight: 600;
      }
      .feature .text {
        color: var(--muted);
        line-height: 1.5;
        max-width: 60ch;
      }
      .feature .conf {
        text-align: right;
        font-family: var(--display);
        font-size: 2rem;
        font-weight: 700;
        letter-spacing: -0.04em;
        color: var(--teal);
      }
      .feature .conf small {
        display: block;
        margin-top: 2px;
        font-family: var(--font);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--faint);
      }
      .feature a {
        color: var(--ink);
        font-weight: 700;
        border-bottom: 2px solid var(--accent-soft);
      }
      .feature a:hover { border-bottom-color: var(--accent); }

      .list {
        display: grid;
        gap: 0;
      }
      .row {
        display: grid;
        grid-template-columns: 110px 1fr auto;
        gap: 16px;
        align-items: start;
        padding: 16px 0;
        border-bottom: 1px solid var(--line);
      }
      .row .type {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--accent);
        padding-top: 4px;
      }
      .row h4 {
        margin: 0 0 4px;
        font-size: 1.05rem;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      .row .sub {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.45;
      }
      .row .side {
        text-align: right;
        color: var(--faint);
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
      }

      .surface {
        background: var(--surface);
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: 8px 14px;
        backdrop-filter: blur(10px);
      }

      table { width: 100%; border-collapse: collapse; }
      th, td {
        text-align: left;
        padding: 14px 8px;
        border-bottom: 1px solid var(--line);
        font-size: 14px;
      }
      th {
        font-size: 11px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--faint);
        font-weight: 700;
      }
      tr:hover td { background: rgba(232, 93, 76, 0.04); }

      .settings { display: grid; gap: 10px; }
      .setting {
        padding: 14px 0;
        border-bottom: 1px solid var(--line);
      }
      .setting .k {
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--faint);
      }
      code {
        display: inline-block;
        margin-top: 6px;
        font-size: 13px;
        color: var(--ink);
        word-break: break-word;
      }

      .page-title {
        margin: 0 0 8px;
        font-family: var(--display);
        font-size: clamp(1.8rem, 3.5vw, 2.5rem);
        letter-spacing: -0.04em;
      }
      .page-lead {
        margin: 0 0 24px;
        color: var(--muted);
        max-width: 48ch;
        line-height: 1.5;
      }
      .empty {
        padding: 28px 0;
        color: var(--muted);
        border-top: 1px solid var(--line);
      }

      @keyframes in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: none; }
      }
      @keyframes ping {
        0% { box-shadow: 0 0 0 0 rgba(15, 138, 117, 0.45); }
        70% { box-shadow: 0 0 0 10px rgba(15, 138, 117, 0); }
        100% { box-shadow: 0 0 0 0 rgba(15, 138, 117, 0); }
      }

      @media (max-width: 820px) {
        .intro { grid-template-columns: 1fr; }
        .pulse { justify-self: start; text-align: left; }
        .metrics { grid-template-columns: 1fr 1fr; }
        .metric:nth-child(2) { border-right: 0; }
        .metric:nth-child(3), .metric:nth-child(4) { border-top: 1px solid var(--line); }
        .feature { grid-template-columns: 1fr; }
        .feature .conf { text-align: left; }
        .row { grid-template-columns: 1fr; gap: 6px; }
        .row .side { text-align: left; }
        header.site { flex-wrap: wrap; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="site">
        <div class="logo">YC<em>Monitor</em> <span>launch watch</span></div>
        <div style="display:flex; align-items:center; gap:14px; flex-wrap:wrap;">
          <nav aria-label="Primary">
            <a class="${active === "home" ? "active" : ""}" href="/">Monitor</a>
            <a class="${active === "signals" ? "active" : ""}" href="/signals">Signals</a>
            <a class="${active === "settings" ? "active" : ""}" href="/settings">Settings</a>
          </nav>
          <a href="${repoUrl}" target="_blank" rel="noreferrer" style="font-size:13px; font-weight:600; color:var(--muted); border:1px solid var(--line); border-radius:999px; padding:8px 12px;">GitHub</a>
        </div>
      </header>
      ${body}
    </div>
  </body>
</html>`;
}

export function renderDashboard(params: {
  latestRunLabel: string;
  nextRunLabel: string;
  counts: { companyCount: number; signalCount: number; earlySignalCount: number; alertCount: number };
  officialCounts: { ycCount: number; speedrunCount: number };
  signals: Array<
    Signal & {
      company: { name: string; batch: string | null; domain: string | null; ycUrl: string | null } | null;
      founder: { name: string } | null;
    }
  >;
  companies: Company[];
  sourceHealth: SourceHealthSummary[];
  schedulerRunning: boolean;
}): string {
  const featuredCompany = params.companies[0];
  const recentCompanies = params.companies.slice(1, 7);
  const latestSignal = params.signals[0];
  const officialTotal = params.officialCounts.ycCount + params.officialCounts.speedrunCount;
  const primarySourceHealth = params.sourceHealth.filter((health) => ["YC_DIRECTORY", "YC_SPEEDRUN"].includes(health.source));
  const signalSourceHealth = params.sourceHealth.filter((health) => !["YC_DIRECTORY", "YC_SPEEDRUN"].includes(health.source));

  const renderSourcePills = (items: SourceHealthSummary[]) =>
    items
    .map(
      (health) => `
        <div class="source">
          <span class="dot ${healthClass(health.status)}"></span>
          ${escapeHtml(health.source)}
          <span class="label ${healthClass(health.status)}">${escapeHtml(health.status)}</span>
        </div>`,
    )
    .join("");

  const feature = featuredCompany
    ? `
      <div class="feature">
        <div><span class="badge">${escapeHtml(featuredCompany.program === "SPEEDRUN" ? "Speedrun" : "YC Directory")}</span></div>
        <div>
          <h3>${escapeHtml(featuredCompany.name)}</h3>
          <div class="meta">
            <span>${escapeHtml(featuredCompany.program)}</span>
            <span>${escapeHtml(featuredCompany.batch ?? "Batch TBD")}</span>
            <span>${featuredCompany.officialConfirmedAt ? escapeHtml(featuredCompany.officialConfirmedAt.toISOString().slice(0, 10)) : "Recently observed"}</span>
          </div>
          <div class="text">${escapeHtml(featuredCompany.description ?? featuredCompany.domain ?? "Live company pulled from the public YC directory.")}</div>
          <div style="margin-top:12px;">
            ${featuredCompany.ycUrl ? `<a href="${escapeHtml(featuredCompany.ycUrl)}">Open company</a>` : ""}
            ${featuredCompany.domain ? ` · <a href="https://${escapeHtml(featuredCompany.domain)}">Website</a>` : ""}
          </div>
        </div>
        <div class="conf">${officialTotal}<small>official found</small></div>
      </div>`
    : `<div class="empty">No official companies loaded yet. Run a scan with <code>YC_DIRECTORY</code> and <code>YC_SPEEDRUN</code>.</div>`;

  const founderFeature = latestSignal
    ? `
      <div class="feature">
        <div><span class="badge">${escapeHtml(signalLabel(latestSignal.signalType))}</span></div>
        <div>
          <h3>${escapeHtml(latestSignal.company?.name ?? "Unknown company")}</h3>
          <div class="meta">
            <span>${escapeHtml(latestSignal.founder?.name ?? "Unknown founder")}</span>
            <span>${escapeHtml(latestSignal.company?.batch ?? latestSignal.batch ?? "Batch TBD")}</span>
            <span>${escapeHtml(latestSignal.platform)}</span>
          </div>
          <div class="text">${escapeHtml(latestSignal.text)}</div>
          <div style="margin-top:12px;">
            <a href="${escapeHtml(latestSignal.url)}">Open source</a>
          </div>
        </div>
        <div class="conf">${Math.round(latestSignal.confidence * 100)}%<small>confidence</small></div>
      </div>`
    : `<div class="empty">No founder-announced early signals yet. Use <code>/social-inbox</code> or enable X later.</div>`;

  const rows = recentCompanies
    .map(
      (company) => `
        <div class="row">
          <div class="type">${escapeHtml(company.program === "SPEEDRUN" ? "Speedrun" : "YC")}</div>
          <div>
            <h4>${escapeHtml(company.name)}</h4>
            <div class="sub">${escapeHtml(company.batch ?? "Batch TBD")} · ${escapeHtml(company.description ?? company.domain ?? "Public directory company")}</div>
          </div>
          <div class="side">${company.ycUrl ? `<a href="${escapeHtml(company.ycUrl)}">open</a>` : ""}</div>
        </div>`,
    )
    .join("");

  return pageShell(
    "YC Launch Monitor",
    "home",
    `
      <section class="intro">
        <div>
          <h1>Catch founder YC announcements before the directory updates.</h1>
          <p>The monitor watches public YC listings, checks founder signals, and separates early acceptance posts from official confirmations so your Slack gets the important update first.</p>
          <div class="actions">
            <form method="post" action="/run-now" onsubmit="event.preventDefault(); fetch('/run-now',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(r=>r.json()).then(()=>location.reload());">
              <button class="btn btn-main" type="submit">Run scan now</button>
            </form>
            <a class="btn btn-side" href="/signals">All signals</a>
          </div>
        </div>
        <div class="pulse">
          <div class="live"><i></i>${params.schedulerRunning ? "Monitoring" : "Idle"}</div>
          <div class="when">Last scan ${escapeHtml(params.latestRunLabel)}</div>
          <div class="when">Next ${escapeHtml(params.nextRunLabel)}</div>
          ${
            latestSignal
              ? `<div class="surface" style="margin-top:16px; max-width:320px; text-align:left;">
                  <div style="font-size:11px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:var(--accent);">Latest founder signal</div>
                  <div style="margin-top:8px;font-weight:700;">${escapeHtml(latestSignal.company?.name ?? "Unknown company")}</div>
                  <div style="margin-top:6px;color:var(--muted);font-size:13px;line-height:1.45;">${escapeHtml(latestSignal.text.slice(0, 120))}${latestSignal.text.length > 120 ? "…" : ""}</div>
                </div>`
              : ""
          }
        </div>
      </section>

      <section class="metrics">
        <div class="metric"><div class="k">Official companies</div><div class="v">${officialTotal}</div></div>
        <div class="metric"><div class="k">Early signals</div><div class="v">${params.counts.earlySignalCount}</div></div>
        <div class="metric"><div class="k">Speedrun tracked</div><div class="v">${params.officialCounts.speedrunCount}</div></div>
        <div class="metric"><div class="k">Alerts</div><div class="v">${params.counts.alertCount}</div></div>
      </section>

      <section class="block">
        <div class="block-head">
          <h2>Early signal highlight</h2>
          <p>This is the product's core differentiator</p>
        </div>
        ${founderFeature}
      </section>

      <section class="block">
        <div class="block-head">
          <h2>Discovery sources</h2>
          <p>Primary public sources first, optional/demo sources separate</p>
        </div>
        <div class="sources">${renderSourcePills(primarySourceHealth) || `<div class="source"><span class="dot warn"></span>No primary sources yet</div>`}</div>
        ${
          signalSourceHealth.length > 0
            ? `<div style="margin-top:10px;" class="sources">${renderSourcePills(signalSourceHealth)}</div>`
            : ""
        }
      </section>

      ${
        feature
          ? `<section class="block">
              <div class="block-head">
                <h2>Latest official company</h2>
                <p>Real data from YC / Speedrun public listings</p>
              </div>
              ${feature}
            </section>`
          : ""
      }

      ${
        rows
          ? `<section class="block">
              <div class="block-head"><h2>Recent companies</h2><p>Latest public listings pulled from free sources</p></div>
              <div class="list">${rows}</div>
            </section>`
          : ""
      }
    `,
  );
}

export function renderSignalsPage(
  signals: Array<
    Signal & {
      company: { name: string; batch: string | null } | null;
      founder: { name: string } | null;
    }
  >,
  companies: Company[],
): string {
  const founderSignals = signals.filter((signal) =>
    ["X", "LINKEDIN", "SOCIAL_INBOX", "DEMO"].includes(signal.platform),
  );

  const founderSignalRows = founderSignals
    .map(
      (signal) => `
        <tr>
          <td>${escapeHtml(signal.detectedAt.toISOString().replace("T", " ").slice(0, 19))}</td>
          <td>${escapeHtml(signal.signalType)}</td>
          <td>${escapeHtml(signal.company?.name ?? "Unknown")}</td>
          <td>${escapeHtml(signal.founder?.name ?? "Unknown")}</td>
          <td>${Math.round(signal.confidence * 100)}%</td>
          <td><a href="${escapeHtml(signal.url)}">Open</a></td>
        </tr>`,
    )
    .join("");

  const companyRows = companies
    .map(
      (company) => `
        <div class="row">
          <div class="type">${escapeHtml(company.program === "SPEEDRUN" ? "Speedrun" : "YC")}</div>
          <div>
            <h4>${escapeHtml(company.name)}</h4>
            <div class="sub">${escapeHtml(company.batch ?? "Batch TBD")} · ${escapeHtml(company.description ?? company.domain ?? "Public company listing")}</div>
          </div>
          <div class="side">${company.ycUrl ? `<a href="${escapeHtml(company.ycUrl)}">open</a>` : ""}</div>
        </div>`,
    )
    .join("");

  return pageShell(
    "Signals · YC Launch Monitor",
    "signals",
    `
      <h1 class="page-title">Signals</h1>
      <p class="page-lead">Official public-company listings and founder-driven early signals are separated below so demo data does not blend into the real directory feed.</p>

      <section class="block">
        <div class="block-head">
          <h2>Official companies</h2>
          <p>Real YC / Speedrun listings from free public sources</p>
        </div>
        <div class="list">${companyRows || `<div class="empty">No official companies loaded yet.</div>`}</div>
      </section>

      <section class="block">
        <div class="block-head">
          <h2>Founder signals</h2>
          <p>Inbox, demo, or social-source detections</p>
        </div>
        <div class="surface">
          <table>
            <thead>
              <tr>
                <th>Detected</th>
                <th>Type</th>
                <th>Company</th>
                <th>Founder</th>
                <th>Confidence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${founderSignalRows || `<tr><td colspan="6">No founder signals yet.</td></tr>`}</tbody>
          </table>
        </div>
      </section>
    `,
  );
}

export function renderSettingsPage(settings: Record<string, string>): string {
  return pageShell(
    "Settings · YC Launch Monitor",
    "settings",
    `
      <h1 class="page-title">Settings</h1>
      <p class="page-lead">Active runtime config. Early signals work via social inbox without X API credits.</p>
      <div class="settings">
        ${Object.entries(settings)
          .map(
            ([key, value]) => `
              <div class="setting">
                <div class="k">${escapeHtml(key)}</div>
                <code>${escapeHtml(value)}</code>
              </div>`,
          )
          .join("")}
      </div>
    `,
  );
}
