import { PrismaPg } from "@prisma/adapter-pg";
import { normalizeAnalyticsEvent, type AnalyticsEventInput } from "@handitoff/analytics";

import type { AnalyticsDashboardStore, AnalyticsRange } from "./app.js";
import { PrismaClient, type Prisma } from "./.prisma/client/client.js";

export class PrismaAnalyticsStore implements AnalyticsDashboardStore {
  private readonly prisma: PrismaClient;

  public constructor(databaseUrl: string, prisma?: PrismaClient) {
    this.prisma =
      prisma ??
      new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl }),
      });
  }

  public isEnabled(): boolean {
    return true;
  }

  public record(event: AnalyticsEventInput): void {
    const normalized = normalizeAnalyticsEvent(event);
    void this.prisma.analyticsEvent
      .create({
        data: {
          eventName: normalized.eventName,
          anonymousId: normalized.anonymousId,
          sessionId: normalized.sessionId ?? null,
          transferId: normalized.transferId ?? null,
          properties: normalized.properties as Prisma.InputJsonObject,
        },
      })
      .catch(() => undefined);
  }

  public async getDashboard(range: AnalyticsRange): Promise<unknown> {
    const since = rangeToInterval(range);
    const [
      summary,
      funnel,
      connectionTypes,
      sizeBuckets,
      failures,
      browsers,
      operatingSystems,
      deviceTypes,
      recentFailedTransfers,
    ] = await Promise.all([
      this.summary(since),
      this.countByEvent(since),
      this.countByProperty("connectionType", since, ["connection_type_detected"]),
      this.countByProperty("sizeBucket", since, ["transfer_started", "transfer_completed"]),
      this.countFailures(since),
      this.countByProperty("browser", since),
      this.countByProperty("os", since),
      this.countByProperty("deviceType", since),
      this.recentFailedTransfers(since),
    ]);

    return {
      range,
      summary,
      funnel,
      connectionTypes,
      sizeBuckets,
      failures,
      browsers,
      operatingSystems,
      deviceTypes,
      recentFailedTransfers,
    };
  }

  public async close(): Promise<void> {
    await this.prisma.$disconnect();
  }

  private async summary(since: string): Promise<Record<string, number>> {
    const rows = await this.prisma.$queryRaw<
      Array<Record<string, string | number | bigint | null>>
    >`
      with events as (
        select * from analytics_events where created_at >= now() - ${since}::interval
      ),
      counts as (
        select
          count(*) filter (where event_name = 'session_created') as sessions_created,
          count(*) filter (where event_name = 'peer_connected') as peers_connected,
          count(*) filter (where event_name = 'transfer_started') as transfers_started,
          count(*) filter (where event_name = 'transfer_completed') as transfers_completed
        from events
      ),
      completed as (
        select
          avg(nullif((properties->>'totalBytes')::numeric, 0)) as average_transfer_size,
          avg(nullif((properties->>'durationMs')::numeric, 0)) as average_transfer_duration,
          avg(nullif((properties->>'averageMbps')::numeric, 0)) as average_mbps
        from events
        where event_name = 'transfer_completed'
      )
      select
        counts.sessions_created,
        counts.peers_connected,
        counts.transfers_started,
        counts.transfers_completed,
        case when counts.transfers_started = 0 then 0
          else counts.transfers_completed::numeric / counts.transfers_started end as transfer_success_rate,
        case when counts.sessions_created = 0 then 0
          else counts.peers_connected::numeric / counts.sessions_created end as pairing_success_rate,
        coalesce(completed.average_transfer_size, 0) as average_transfer_size,
        coalesce(completed.average_transfer_duration, 0) as average_transfer_duration,
        coalesce(completed.average_mbps, 0) as average_mbps
      from counts, completed
    `;
    const row = rows[0] ?? {};
    return {
      sessionsCreated: toNumber(row.sessions_created),
      peersConnected: toNumber(row.peers_connected),
      transfersStarted: toNumber(row.transfers_started),
      transfersCompleted: toNumber(row.transfers_completed),
      transferSuccessRate: toNumber(row.transfer_success_rate),
      pairingSuccessRate: toNumber(row.pairing_success_rate),
      averageTransferSize: toNumber(row.average_transfer_size),
      averageTransferDuration: toNumber(row.average_transfer_duration),
      averageMbps: toNumber(row.average_mbps),
    };
  }

  private async countByEvent(since: string): Promise<Array<{ name: string; count: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ name: string; count: bigint }>>`
      select event_name as name, count(*) as count
      from analytics_events
      where created_at >= now() - ${since}::interval
        and event_name in (
          'session_created', 'join_requested', 'peer_approved',
          'peer_connected', 'transfer_started', 'transfer_completed'
        )
      group by event_name
      order by array_position(array[
        'session_created', 'join_requested', 'peer_approved',
        'peer_connected', 'transfer_started', 'transfer_completed'
      ], event_name)
    `;
    return rows.map((row) => ({ name: row.name, count: Number(row.count) }));
  }

  private async countByProperty(
    property: string,
    since: string,
    eventNames?: string[],
  ): Promise<Array<{ name: string; count: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ name: string | null; count: bigint }>>`
      select name, count(*) as count
      from (
        select coalesce(properties->>${property}, 'unknown') as name
        from analytics_events
        where created_at >= now() - ${since}::interval
          and (${eventNames ?? null}::text[] is null or event_name = any(${eventNames ?? null}::text[]))
      ) property_counts
      group by name
      order by count(*) desc
      limit 12
    `;
    return rows.map((row) => ({ name: row.name ?? "unknown", count: Number(row.count) }));
  }

  private async countFailures(since: string): Promise<Array<{ name: string; count: number }>> {
    const rows = await this.prisma.$queryRaw<Array<{ name: string | null; count: bigint }>>`
      select coalesce(properties->>'failureCode', event_name) as name, count(*) as count
      from analytics_events
      where created_at >= now() - ${since}::interval
        and event_name in ('peer_connection_failed', 'transfer_failed')
      group by coalesce(properties->>'failureCode', event_name)
      order by count(*) desc
      limit 12
    `;
    return rows.map((row) => ({ name: row.name ?? "unknown", count: Number(row.count) }));
  }

  private async recentFailedTransfers(since: string): Promise<unknown[]> {
    return this.prisma.$queryRaw`
      select
        created_at as "createdAt",
        session_id as "sessionId",
        transfer_id as "transferId",
        properties->>'failureCode' as "failureCode",
        properties->>'errorStage' as "errorStage",
        properties->>'browser' as browser,
        properties->>'os' as os,
        properties->>'deviceType' as "deviceType",
        properties->>'sizeBucket' as "sizeBucket",
        properties->>'connectionType' as "connectionType"
      from analytics_events
      where created_at >= now() - ${since}::interval
        and event_name = 'transfer_failed'
      order by created_at desc
      limit 20
    `;
  }
}

function rangeToInterval(range: AnalyticsRange): string {
  switch (range) {
    case "7d":
      return "7 days";
    case "30d":
      return "30 days";
    case "24h":
      return "24 hours";
  }
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
