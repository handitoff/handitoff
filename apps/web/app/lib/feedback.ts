import { loadPublicRuntimeConfig } from "./runtime-config";

export type FeedbackDebugInfo = {
  connectionType?: string;
  browser?: string;
  os?: string;
  sessionState?: string;
  errorCode?: string;
  sizeBucket?: string;
  durationMs?: number;
};

export type FeedbackPayload = {
  type: "feedback" | "error_report";
  rating?: number;
  message?: string;
  sessionId?: string;
} & FeedbackDebugInfo;

export function submitFeedback(payload: FeedbackPayload): void {
  if (typeof window === "undefined") return;
  const config = loadPublicRuntimeConfig();
  const url = `${config.apiUrl.replace(/\/$/, "")}/api/feedback`;
  try {
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Best effort
  }
}
