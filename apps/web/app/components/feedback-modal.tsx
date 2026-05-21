import { useEffect, useRef, useState } from "react";
import { submitFeedback, type FeedbackDebugInfo } from "../lib/feedback";

type FeedbackModalProps = {
  type: "feedback" | "error_report";
  sessionId?: string;
  debugInfo?: FeedbackDebugInfo;
  onClose: () => void;
};

export function FeedbackModal({ type, sessionId, debugInfo, onClose }: FeedbackModalProps) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    if (type === "feedback") {
      textareaRef.current?.focus();
    }
  }, [type]);

  const handleSubmit = () => {
    submitFeedback({
      type,
      ...(rating > 0 ? { rating } : {}),
      ...(message.trim() !== "" ? { message: message.trim() } : {}),
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...debugInfo,
    });
    setSubmitted(true);
    setTimeout(onClose, 1400);
  };

  const isError = type === "error_report";
  const title = isError ? "Transfer failed" : "Share feedback";
  const submitLabel = isError ? "Send report" : "Submit";

  const displayActive = hovered > 0 ? hovered : rating;

  return (
    <div className="fb-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="fb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="fb-modal-head">
          <h2 className="fb-modal-title">{title}</h2>
          <button className="fb-modal-close" type="button" onClick={onClose} aria-label="Close">×</button>
        </div>

        {submitted ? (
          <div className="fb-thank-you">
            <span className="fb-thank-you-icon">✓</span>
            <p>{isError ? "Report sent. Thank you." : "Thanks for the feedback!"}</p>
          </div>
        ) : (
          <>
            {isError ? (
              <p className="fb-modal-body">
                Want to send a quick report? Your note helps us fix this.
              </p>
            ) : (
              <p className="fb-modal-body">How was your experience?</p>
            )}

            {!isError ? (
              <div
                className="fb-stars"
                onMouseLeave={() => setHovered(0)}
                aria-label="Rating"
              >
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className={`fb-star${displayActive >= star ? " fb-star--on" : ""}`}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHovered(star)}
                    aria-label={`${star} star${star !== 1 ? "s" : ""}`}
                  >
                    ★
                  </button>
                ))}
              </div>
            ) : null}

            {debugInfo !== undefined ? (
              <details
                className="fb-debug"
                open={detailsOpen}
                onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)}
              >
                <summary className="fb-debug-summary">Auto-attached details</summary>
                <div className="fb-debug-grid">
                  {debugInfo.errorCode !== undefined ? (
                    <><span>Error</span><span>{debugInfo.errorCode}</span></>
                  ) : null}
                  {debugInfo.connectionType !== undefined ? (
                    <><span>Connection</span><span>{debugInfo.connectionType}</span></>
                  ) : null}
                  {debugInfo.browser !== undefined && debugInfo.os !== undefined ? (
                    <><span>Environment</span><span>{debugInfo.browser} / {debugInfo.os}</span></>
                  ) : null}
                  {debugInfo.sessionState !== undefined ? (
                    <><span>Session state</span><span>{debugInfo.sessionState}</span></>
                  ) : null}
                  {debugInfo.sizeBucket !== undefined ? (
                    <><span>File size</span><span>{debugInfo.sizeBucket}</span></>
                  ) : null}
                  {debugInfo.durationMs !== undefined ? (
                    <><span>Duration</span><span>{formatDuration(debugInfo.durationMs)}</span></>
                  ) : null}
                </div>
                <p className="fb-debug-note">File names are never included.</p>
              </details>
            ) : null}

            <label className="fb-label" htmlFor="fb-message">
              {isError ? "Add a note (optional)" : "Any comments? (optional)"}
            </label>
            <textarea
              id="fb-message"
              ref={textareaRef}
              className="fb-textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={800}
              rows={3}
              placeholder={isError ? "What were you trying to do?" : "Tell us what you think…"}
            />

            <div className="fb-modal-actions">
              <button
                className="button"
                type="button"
                onClick={handleSubmit}
                disabled={!isError && rating === 0}
              >
                {submitLabel}
              </button>
              <button className="button secondary" type="button" onClick={onClose}>
                {isError ? "Dismiss" : "Cancel"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
