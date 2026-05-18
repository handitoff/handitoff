import { useEffect, useMemo, useState } from "react";
import { loadPublicRuntimeConfig } from "../lib/runtime-config";
import { seoMeta } from "../lib/seo";

type Range = "24h" | "7d" | "30d";

type CountRow = { name: string; count: number };
type Dashboard = {
  summary: {
    sessionsCreated: number;
    peersConnected: number;
    transfersStarted: number;
    transfersCompleted: number;
    transferSuccessRate: number;
    pairingSuccessRate: number;
    averageTransferSize: number;
    averageTransferDuration: number;
    averageMbps: number;
  };
  funnel: CountRow[];
  connectionTypes: CountRow[];
  sizeBuckets: CountRow[];
  failures: CountRow[];
  browsers: CountRow[];
  operatingSystems: CountRow[];
  deviceTypes: CountRow[];
  recentFailedTransfers: Array<Record<string, string | null>>;
};

export function meta() {
  return seoMeta({
    title: "Analytics - handitoff.io",
    description: "Internal handitoff.io analytics dashboard.",
    path: "/admin/analytics",
    noIndex: true,
  });
}

export default function AdminAnalytics() {
  const [range, setRange] = useState<Range>("24h");
  const [token, setToken] = useState(() =>
    typeof window === "undefined" ? "" : (window.localStorage.getItem("handitoff_admin_token") ?? ""),
  );
  const [dashboard, setDashboard] = useState<Dashboard | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (token.trim() === "") {
      return;
    }
    window.localStorage.setItem("handitoff_admin_token", token);
    const config = loadPublicRuntimeConfig();
    const controller = new AbortController();
    setError(undefined);
    void fetch(`${config.apiUrl}/api/admin/analytics?range=${range}`, {
      signal: controller.signal,
      headers: { authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(response.status === 403 ? "Admin token rejected." : "Dashboard failed.");
        }
        setDashboard((await response.json()) as Dashboard);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : "Dashboard failed.");
        }
      });
    return () => controller.abort();
  }, [range, token]);

  const summary = dashboard?.summary;
  const cards = useMemo(
    () =>
      summary === undefined
        ? []
        : [
            ["Sessions created", summary.sessionsCreated.toLocaleString()],
            ["Peers connected", summary.peersConnected.toLocaleString()],
            ["Transfers started", summary.transfersStarted.toLocaleString()],
            ["Transfers completed", summary.transfersCompleted.toLocaleString()],
            ["Transfer success", formatPercent(summary.transferSuccessRate)],
            ["Pairing success", formatPercent(summary.pairingSuccessRate)],
            ["Average size", formatBytes(summary.averageTransferSize)],
            ["Average duration", formatDuration(summary.averageTransferDuration)],
            ["Average Mbps", summary.averageMbps.toFixed(2)],
          ],
    [summary],
  );

  return (
    <main className="admin-analytics">
      <header className="admin-analytics-head">
        <div>
          <p className="admin-kicker">Internal</p>
          <h1>Product analytics</h1>
        </div>
        <div className="admin-controls">
          <select value={range} onChange={(event) => setRange(event.target.value as Range)}>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Admin token"
            aria-label="Admin token"
          />
        </div>
      </header>

      {error !== undefined ? <p className="admin-error">{error}</p> : null}

      <section className="admin-card-grid">
        {cards.map(([label, value]) => (
          <div className="admin-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </section>

      {dashboard !== undefined ? (
        <section className="admin-grid">
          <Breakdown title="Funnel" rows={dashboard.funnel} />
          <Breakdown title="Direct vs relayed" rows={dashboard.connectionTypes} />
          <Breakdown title="Transfers by size" rows={dashboard.sizeBuckets} />
          <Breakdown title="Failures" rows={dashboard.failures} />
          <Breakdown title="Browsers" rows={dashboard.browsers} />
          <Breakdown title="Operating systems" rows={dashboard.operatingSystems} />
          <Breakdown title="Devices" rows={dashboard.deviceTypes} />
          <RecentFailures rows={dashboard.recentFailedTransfers} />
        </section>
      ) : null}
    </main>
  );
}

function Breakdown({ title, rows }: { title: string; rows: CountRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <section className="admin-panel">
      <h2>{title}</h2>
      {rows.length === 0 ? <p className="admin-muted">No events.</p> : null}
      {rows.map((row) => (
        <div className="admin-row" key={row.name}>
          <span>{row.name}</span>
          <div className="admin-bar" aria-hidden="true">
            <i style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
          <strong>{row.count.toLocaleString()}</strong>
        </div>
      ))}
    </section>
  );
}

function RecentFailures({ rows }: { rows: Array<Record<string, string | null>> }) {
  return (
    <section className="admin-panel admin-panel-wide">
      <h2>Recent failed transfers</h2>
      {rows.length === 0 ? <p className="admin-muted">No failed transfers.</p> : null}
      {rows.map((row, index) => (
        <div className="admin-failure" key={`${row.transferId ?? index}-${row.createdAt ?? index}`}>
          <span>{formatDate(row.createdAt)}</span>
          <strong>{row.failureCode ?? "transfer_failed"}</strong>
          <span>{row.errorStage ?? "unknown"}</span>
          <span>{row.browser ?? "Unknown"} / {row.os ?? "Unknown"} / {row.deviceType ?? "unknown"}</span>
          <span>{row.sizeBucket ?? "unknown"} / {row.connectionType ?? "unknown"}</span>
        </div>
      ))}
    </section>
  );
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(value: number): string {
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

function formatDate(value: string | null | undefined): string {
  if (value === null || value === undefined) return "unknown";
  return new Date(value).toLocaleString();
}
