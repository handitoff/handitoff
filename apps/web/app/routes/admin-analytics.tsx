import { useEffect, useMemo, useState } from "react";
import { loadPublicRuntimeConfig } from "../lib/runtime-config";
import { seoMeta } from "../lib/seo";
import { Input } from "../components/ui/input";
import { cn } from "../lib/utils";

type FeedbackRow = {
  id: string;
  type: string;
  rating: number | null;
  message: string | null;
  sessionId: string | null;
  errorCode: string | null;
  connectionType: string | null;
  browser: string | null;
  os: string | null;
  sessionState: string | null;
  sizeBucket: string | null;
  durationMs: number | null;
  createdAt: string;
};

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
  deviceEvents: CountRow[];
  sessionEvents: CountRow[];
  transferBatchEvents: CountRow[];
  fileEvents: CountRow[];
  connectionTypes: CountRow[];
  sizeBuckets: CountRow[];
  fileSizeBuckets: CountRow[];
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
    typeof window === "undefined"
      ? ""
      : (window.localStorage.getItem("handitoff_admin_token") ?? ""),
  );
  const [dashboard, setDashboard] = useState<Dashboard | undefined>();
  const [feedback, setFeedback] = useState<FeedbackRow[] | undefined>();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (token.trim() === "") {
      return;
    }
    window.localStorage.setItem("handitoff_admin_token", token);
    const config = loadPublicRuntimeConfig();
    const controller = new AbortController();
    setError(undefined);
    const headers = { authorization: `Bearer ${token}` };
    void Promise.all([
      fetch(`${config.apiUrl}/api/admin/analytics?range=${range}`, {
        signal: controller.signal,
        headers,
      }),
      fetch(`${config.apiUrl}/api/admin/feedback`, {
        signal: controller.signal,
        headers,
      }),
    ])
      .then(async ([analyticsRes, feedbackRes]) => {
        if (!analyticsRes.ok) {
          throw new Error(
            analyticsRes.status === 403 ? "Admin token rejected." : "Dashboard failed.",
          );
        }
        setDashboard((await analyticsRes.json()) as Dashboard);
        if (feedbackRes.ok) {
          const data = (await feedbackRes.json()) as { feedback: FeedbackRow[] };
          setFeedback(data.feedback);
        }
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
    <main className="min-h-svh bg-zinc-950 px-6 py-10 text-zinc-100">
      <header className="mb-8 grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_auto]">
        <div>
          <p className="mb-1 font-mono text-xs uppercase tracking-[0.22em] text-zinc-500">
            Internal
          </p>
          <h1 className="font-display text-4xl lowercase tracking-tight text-zinc-50 md:text-5xl">
            Product analytics
          </h1>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={range}
            onChange={(event) => setRange(event.target.value as Range)}
            className="h-11 rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-100 focus:border-zinc-500 focus:outline-none"
          >
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
          </select>
          <Input
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Admin token"
            aria-label="Admin token"
            className="w-56"
          />
        </div>
      </header>

      {error !== undefined ? (
        <p className="mb-6 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-9">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <span className="text-xs text-zinc-500">{label}</span>
            <strong className="mt-2 block font-display text-2xl tracking-tight text-zinc-50">
              {value}
            </strong>
          </div>
        ))}
      </section>

      {dashboard !== undefined ? (
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Breakdown title="Device events" rows={dashboard.deviceEvents ?? []} />
          <Breakdown title="Session events" rows={dashboard.sessionEvents ?? []} />
          <Breakdown
            title="Transfer batches"
            rows={dashboard.transferBatchEvents ?? dashboard.funnel}
          />
          <Breakdown title="File events" rows={dashboard.fileEvents ?? []} />
          <Breakdown title="Direct vs relayed" rows={dashboard.connectionTypes} />
          <Breakdown title="Transfer batch sizes" rows={dashboard.sizeBuckets} />
          <Breakdown title="File sizes" rows={dashboard.fileSizeBuckets ?? []} />
          <Breakdown title="Failures" rows={dashboard.failures} />
          <Breakdown title="Browsers" rows={dashboard.browsers} />
          <Breakdown title="Operating systems" rows={dashboard.operatingSystems} />
          <Breakdown title="Devices" rows={dashboard.deviceTypes} />
          <RecentFailures rows={dashboard.recentFailedTransfers} />
        </section>
      ) : null}

      {feedback !== undefined ? (
        <section className="mt-4 grid grid-cols-1">
          <FeedbackPanel rows={feedback} />
        </section>
      ) : null}
    </main>
  );
}

function Panel({
  title,
  wide,
  children,
}: {
  title: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn("rounded-xl border border-zinc-800 bg-zinc-900 p-4", wide && "lg:col-span-3")}
    >
      <h2 className="mb-3 font-display text-lg lowercase tracking-tight text-zinc-50">{title}</h2>
      {children}
    </section>
  );
}

function Breakdown({ title, rows }: { title: string; rows: CountRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <Panel title={title}>
      {rows.length === 0 ? <p className="text-sm text-zinc-500">No events.</p> : null}
      {rows.map((row) => (
        <div
          key={row.name}
          className="mt-2 grid grid-cols-[minmax(96px,1fr)_2fr_auto] items-center gap-3"
        >
          <span className="truncate text-sm text-zinc-400">{row.name}</span>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
            <i
              className="block h-full rounded-[inherit] bg-zinc-50"
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </div>
          <strong className="tabular-nums text-zinc-50">{row.count.toLocaleString()}</strong>
        </div>
      ))}
    </Panel>
  );
}

function RecentFailures({ rows }: { rows: Array<Record<string, string | null>> }) {
  return (
    <Panel title="Recent failed transfers" wide>
      {rows.length === 0 ? <p className="text-sm text-zinc-500">No failed transfers.</p> : null}
      {rows.map((row, index) => (
        <div
          key={`${row.transferId ?? index}-${row.createdAt ?? index}`}
          className="grid grid-cols-1 items-center gap-x-3 gap-y-1 border-t border-zinc-800 py-2.5 text-sm md:grid-cols-[160px_160px_120px_1fr_180px]"
        >
          <span className="text-zinc-500">{formatDate(row.createdAt)}</span>
          <strong className="text-zinc-100">{row.failureCode ?? "transfer_failed"}</strong>
          <span className="text-zinc-500">{row.failureStage ?? row.errorStage ?? "unknown"}</span>
          <span className="text-zinc-500">
            {row.browser ?? "Unknown"} / {row.os ?? "Unknown"} / {row.deviceType ?? "unknown"}
          </span>
          <span className="text-zinc-500">
            {row.sizeBucket ?? "unknown"} / {row.connectionType ?? "unknown"}
          </span>
        </div>
      ))}
    </Panel>
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

function FeedbackPanel({ rows }: { rows: FeedbackRow[] }) {
  const errorReports = rows.filter((r) => r.type === "error_report");
  const feedbackRows = rows.filter((r) => r.type === "feedback");

  return (
    <Panel title="User reports" wide>
      {rows.length === 0 ? <p className="text-sm text-zinc-500">No reports yet.</p> : null}

      {feedbackRows.length > 0 ? (
        <>
          <h3 className="mb-2 mt-4 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">
            Feedback ({feedbackRows.length})
          </h3>
          {feedbackRows.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-1 items-baseline gap-x-3 gap-y-1 border-b border-zinc-800/60 py-2 text-sm md:grid-cols-[auto_auto_1fr_auto]"
            >
              <span className="whitespace-nowrap text-zinc-500">{formatDate(row.createdAt)}</span>
              {row.rating !== null ? (
                <span className="tracking-tighter text-amber-400">
                  {"★".repeat(row.rating)}
                  <span className="text-zinc-700">{"★".repeat(5 - row.rating)}</span>
                </span>
              ) : null}
              {row.message !== null ? (
                <span className="break-words text-zinc-100">{row.message}</span>
              ) : (
                <span className="text-zinc-500">No message</span>
              )}
              <span className="text-zinc-500">
                {row.browser ?? "?"} / {row.os ?? "?"}
              </span>
            </div>
          ))}
        </>
      ) : null}

      {errorReports.length > 0 ? (
        <>
          <h3 className="mb-2 mt-6 text-[13px] font-semibold uppercase tracking-wide text-zinc-500">
            Error reports ({errorReports.length})
          </h3>
          {errorReports.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-1 items-center gap-x-3 gap-y-1 border-t border-zinc-800 py-2.5 text-sm md:grid-cols-[160px_160px_120px_1fr_180px]"
            >
              <span className="text-zinc-500">{formatDate(row.createdAt)}</span>
              <strong className="text-zinc-100">{row.errorCode ?? "transfer_failed"}</strong>
              <span className="text-zinc-500">{row.connectionType ?? "unknown"}</span>
              <span className="text-zinc-500">
                {row.browser ?? "?"} / {row.os ?? "?"}
              </span>
              <span className="text-zinc-500">
                {row.sizeBucket ?? "?"}
                {row.durationMs !== null ? ` · ${(row.durationMs / 1000).toFixed(1)}s` : ""}
              </span>
              {row.message !== null ? (
                <span className="break-words text-zinc-100">{row.message}</span>
              ) : null}
            </div>
          ))}
        </>
      ) : null}
    </Panel>
  );
}
