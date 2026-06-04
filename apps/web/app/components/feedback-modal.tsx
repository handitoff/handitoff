import { Check, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { submitFeedback, type FeedbackDebugInfo } from "../lib/feedback";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { cn } from "../lib/utils";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isError
              ? "Want to send a quick report? Your note helps us fix this."
              : "How was your experience?"}
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-6 text-zinc-300">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-950/60 text-emerald-400">
              <Check className="h-5 w-5" />
            </span>
            <p className="text-sm">
              {isError ? "Report sent. Thank you." : "Thanks for the feedback!"}
            </p>
          </div>
        ) : (
          <>
            {!isError ? (
              <div className="flex gap-1.5" onMouseLeave={() => setHovered(0)} aria-label="Rating">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    className={cn(
                      "transition-colors",
                      displayActive >= star ? "text-amber-400" : "text-zinc-700",
                      "hover:text-amber-400",
                    )}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHovered(star)}
                    aria-label={`${star} star${star !== 1 ? "s" : ""}`}
                  >
                    <Star
                      className="h-7 w-7"
                      fill={displayActive >= star ? "currentColor" : "none"}
                    />
                  </button>
                ))}
              </div>
            ) : null}

            {debugInfo !== undefined ? (
              <details className="border border-zinc-800 text-sm">
                <summary className="cursor-pointer px-3 py-2 text-zinc-400 hover:text-zinc-200">
                  Auto-attached details
                </summary>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-3 pb-2 pt-1 text-xs">
                  {debugInfo.errorCode !== undefined ? (
                    <>
                      <dt className="text-zinc-500">Error</dt>
                      <dd className="font-medium text-zinc-300">{debugInfo.errorCode}</dd>
                    </>
                  ) : null}
                  {debugInfo.connectionType !== undefined ? (
                    <>
                      <dt className="text-zinc-500">Connection</dt>
                      <dd className="font-medium text-zinc-300">{debugInfo.connectionType}</dd>
                    </>
                  ) : null}
                  {debugInfo.browser !== undefined && debugInfo.os !== undefined ? (
                    <>
                      <dt className="text-zinc-500">Environment</dt>
                      <dd className="font-medium text-zinc-300">
                        {debugInfo.browser} / {debugInfo.os}
                      </dd>
                    </>
                  ) : null}
                  {debugInfo.sessionState !== undefined ? (
                    <>
                      <dt className="text-zinc-500">Session state</dt>
                      <dd className="font-medium text-zinc-300">{debugInfo.sessionState}</dd>
                    </>
                  ) : null}
                  {debugInfo.sizeBucket !== undefined ? (
                    <>
                      <dt className="text-zinc-500">File size</dt>
                      <dd className="font-medium text-zinc-300">{debugInfo.sizeBucket}</dd>
                    </>
                  ) : null}
                  {debugInfo.durationMs !== undefined ? (
                    <>
                      <dt className="text-zinc-500">Duration</dt>
                      <dd className="font-medium text-zinc-300">
                        {formatDuration(debugInfo.durationMs)}
                      </dd>
                    </>
                  ) : null}
                </dl>
                <p className="border-t border-zinc-800 px-3 py-2 text-[11px] text-zinc-500">
                  File names are never included.
                </p>
              </details>
            ) : null}

            <div className="flex flex-col gap-2">
              <Label htmlFor="fb-message">
                {isError ? "Add a note (optional)" : "Any comments? (optional)"}
              </Label>
              <Textarea
                id="fb-message"
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={800}
                rows={3}
                placeholder={isError ? "What were you trying to do?" : "Tell us what you think…"}
              />
            </div>

            <DialogFooter>
              <Button variant="secondary" type="button" onClick={onClose}>
                {isError ? "Dismiss" : "Cancel"}
              </Button>
              <Button type="button" onClick={handleSubmit} disabled={!isError && rating === 0}>
                {submitLabel}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
