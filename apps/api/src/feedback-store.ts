import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./.prisma/client/client.js";

export type FeedbackInput = {
  type: "feedback" | "error_report";
  rating?: number;
  message?: string;
  sessionId?: string;
  errorCode?: string;
  connectionType?: string;
  browser?: string;
  os?: string;
  sessionState?: string;
  sizeBucket?: string;
  durationMs?: number;
};

export type FeedbackRow = {
  id: bigint;
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
  createdAt: Date;
};

export interface FeedbackStoreInterface {
  submit(input: FeedbackInput): void;
  getRecent(limit?: number): Promise<FeedbackRow[]>;
  close(): Promise<void>;
}

export class PrismaFeedbackStore implements FeedbackStoreInterface {
  private readonly prisma: PrismaClient;

  public constructor(databaseUrl: string, prisma?: PrismaClient) {
    this.prisma =
      prisma ??
      new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl }),
      });
  }

  public submit(input: FeedbackInput): void {
    void this.prisma.feedbackReport
      .create({
        data: {
          type: input.type,
          rating: input.rating ?? null,
          message: input.message?.trim().slice(0, 1000) ?? null,
          sessionId: input.sessionId?.trim().slice(0, 128) ?? null,
          errorCode: input.errorCode?.trim().slice(0, 128) ?? null,
          connectionType: input.connectionType?.trim().slice(0, 64) ?? null,
          browser: input.browser?.trim().slice(0, 64) ?? null,
          os: input.os?.trim().slice(0, 64) ?? null,
          sessionState: input.sessionState?.trim().slice(0, 128) ?? null,
          sizeBucket: input.sizeBucket?.trim().slice(0, 64) ?? null,
          durationMs: input.durationMs ?? null,
        },
      })
      .catch(() => undefined);
  }

  public async getRecent(limit = 50): Promise<FeedbackRow[]> {
    const rows = await this.prisma.feedbackReport.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows as FeedbackRow[];
  }

  public async close(): Promise<void> {
    await this.prisma.$disconnect();
  }
}
