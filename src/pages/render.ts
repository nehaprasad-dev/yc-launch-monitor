import type { Signal } from "@prisma/client";

import type { SourceHealthSummary } from "../monitor/types.js";

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      }
      body {
        margin: 0;
        background: #0b1020;
        color: #ebf1ff;
      }
      a { color: #8bb8ff; }
      .wrap {
        max-width: 1080px;
        margin: 0 auto;
        padding: 32px 20px 56px;
      }
      .nav {
        display: flex;
        gap: 16px;
        margin-bottom: 24px;
      }
      .grid {
        display: grid;
        gap: 16px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .card {
        background: #131b31;
        border: 1px solid #263252;
        border-radius: 16px;
        padding: 18px;
      }
      .eyebrow {
        color: #9fb2d9;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .value {
        font-size: 28px;
        font-weight: 700;
        margin-top: 6px;
      }
      .signal {
        display: grid;
        gap: 10px;
      }
      .pill {
        display: inline-block;
        border-radius: 999px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: 700;
        background: #233052;
      }
      .ok { color: #7ee787; }
      .warn { color: #f2cc60; }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      td, th {
        text-align: left;
        padding: 12px 10px;
        border-bottom: 1px solid #263252;
      }
      code {
        background: #111827;
        padding: 2px 6px;
        border-radius: 6px;
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="nav">
        <a href="/">Live monitor</a>
        <a href="/signals">Signals</a>
        <a href="/settings">Settings</a>
      </div>
      ${body}
    </div>
  </body>
</html>`;
}

export function renderDashboard(params: {
  latestRunLabel: string;
  nextRunLabel: string;
  counts: { companyCount: number; signalCount: number; earlySignalCount: number; alertCount: number };
  signals: Array<
    Signal & {
      company: { name: string; batch: string | null; domain: string | null; ycUrl: string | null } | null;
      founder: { name: string } | null;
    }
  >;
  sourceHealth: SourceHealthSummary[];
  schedulerRunning: boolean;
}): string {
  const latestSignal = params.signals[0];
  const sourceList = params.sourceHealth
    .map((health) => {
      const statusClass = health.status === "healthy" ? "ok" : health.status === "degraded" ? "warn" : "";
      return `<div>${health.source}: <span class="${statusClass}">${health.status}</span></div>`;
    })
    .join("");

  const hero = latestSignal
    ? `
      <div class="card signal">
        <div class="eyebrow">${latestSignal.signalType === "EARLY_YC" ? "Early signal" : latestSignal.signalType === "SPEEDRUN" ? "New Speedrun company" : "Official confirmation"}</div>
        <div class="value" style="font-size: 24px;">${latestSignal.company?.name ?? "Unknown company"}</div>
        <div>Founder: ${latestSignal.founder?.name ?? "Unknown"}</div>
        <div>Batch: ${latestSignal.company?.batch ?? latestSignal.batch ?? "Unknown"}</div>
        <div>Source: ${latestSignal.platform}</div>
        <div>${latestSignal.text}</div>
        <div>${latestSignal.signalType === "EARLY_YC" ? "Not yet confirmed by YC" : "Officially confirmed"}</div>
        <div><a href="${latestSignal.url}">View source</a>${latestSignal.company?.ycUrl ? ` · <a href="${latestSignal.company.ycUrl}">Company</a>` : ""}</div>
      </div>
    `
    : `<div class="card">No signals captured yet.</div>`;

  return pageShell(
    "YC Launch Monitor",
    `
      <h1>YC Launch Monitor</h1>
      <div class="card" style="margin-bottom: 16px;">
        <div class="eyebrow">Monitoring</div>
        <div class="value" style="font-size: 22px;">${params.schedulerRunning ? "Running" : "Idle"}</div>
        <div>Last scan: ${params.latestRunLabel}</div>
        <div>Next run: ${params.nextRunLabel}</div>
        <div style="margin-top: 10px;">${sourceList}</div>
      </div>
      <div class="grid">
        <div class="card"><div class="eyebrow">Companies tracked</div><div class="value">${params.counts.companyCount}</div></div>
        <div class="card"><div class="eyebrow">Signals this week</div><div class="value">${params.counts.signalCount}</div></div>
        <div class="card"><div class="eyebrow">Early signals</div><div class="value">${params.counts.earlySignalCount}</div></div>
        <div class="card"><div class="eyebrow">Alerts sent</div><div class="value">${params.counts.alertCount}</div></div>
      </div>
      <h2 style="margin-top: 28px;">Latest signal</h2>
      ${hero}
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
): string {
  const rows = signals
    .map(
      (signal) => `
        <tr>
          <td>${signal.detectedAt.toISOString()}</td>
          <td>${signal.signalType}</td>
          <td>${signal.company?.name ?? "Unknown"}</td>
          <td>${signal.founder?.name ?? "Unknown"}</td>
          <td>${Math.round(signal.confidence * 100)}%</td>
          <td><a href="${signal.url}">Source</a></td>
        </tr>
      `,
    )
    .join("");

  return pageShell(
    "Signals",
    `
      <h1>Signals</h1>
      <div class="card">
        <table>
          <thead>
            <tr>
              <th>Detected</th>
              <th>Type</th>
              <th>Company</th>
              <th>Founder</th>
              <th>Confidence</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="6">No signals yet.</td></tr>`}</tbody>
        </table>
      </div>
    `,
  );
}

export function renderSettingsPage(settings: Record<string, string>): string {
  return pageShell(
    "Settings",
    `
      <h1>Settings</h1>
      <div class="card">
        <p>This page surfaces the active runtime configuration used by the monitor.</p>
        ${Object.entries(settings)
          .map(([key, value]) => `<div style="margin-bottom: 10px;"><span class="eyebrow">${key}</span><br /><code>${value}</code></div>`)
          .join("")}
      </div>
    `,
  );
}
