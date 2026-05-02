export type HostedAbuseDecision = "allow" | "block";

export type HostedAbuseSignal = {
  ipAddress: string;
  sessionCount: number;
  signalingMessagesPerMinute: number;
};

export type HostedAbuseLimits = {
  maxActiveSessionsPerIp: number;
  maxSignalingMessagesPerMinutePerSession: number;
  maxTurnRequestsPerMinutePerIp: number;
};

export const DEFAULT_HOSTED_ABUSE_LIMITS: HostedAbuseLimits = {
  maxActiveSessionsPerIp: 3,
  maxSignalingMessagesPerMinutePerSession: 200,
  maxTurnRequestsPerMinutePerIp: 30,
};

export function evaluateAbuseSignal(
  signal: HostedAbuseSignal,
  limits: HostedAbuseLimits = DEFAULT_HOSTED_ABUSE_LIMITS,
): HostedAbuseDecision {
  if (signal.sessionCount > limits.maxActiveSessionsPerIp) {
    return "block";
  }
  if (signal.signalingMessagesPerMinute > limits.maxSignalingMessagesPerMinutePerSession) {
    return "block";
  }
  return "allow";
}

export type TurnAbuseTracker = {
  hit(ipAddress: string): HostedAbuseDecision;
  reset(): void;
};

type WindowEntry = { count: number; resetAt: number };

export function createTurnAbuseTracker(
  limits: HostedAbuseLimits = DEFAULT_HOSTED_ABUSE_LIMITS,
  now: () => number = Date.now,
): TurnAbuseTracker {
  const windows = new Map<string, WindowEntry>();
  const windowMs = 60_000;

  return {
    hit(ipAddress: string): HostedAbuseDecision {
      const nowMs = now();
      let entry = windows.get(ipAddress);
      if (entry === undefined || nowMs >= entry.resetAt) {
        entry = { count: 0, resetAt: nowMs + windowMs };
        windows.set(ipAddress, entry);
      }
      entry.count += 1;
      return entry.count > limits.maxTurnRequestsPerMinutePerIp ? "block" : "allow";
    },
    reset(): void {
      windows.clear();
    },
  };
}
