import { useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";
import type { SessionStatus, SessionTier } from "../../lib/account";

// ── Section heading ──────────────────────────────────────────────────────────

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-1.5">
        {eyebrow !== undefined && (
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
            {eyebrow}
          </p>
        )}
        <h2 className="font-display text-lg leading-none tracking-tight text-zinc-50 lowercase">
          {title}
        </h2>
        {description !== undefined && (
          <p className="max-w-2xl text-[13px] leading-relaxed text-zinc-400">{description}</p>
        )}
      </div>
      {action !== undefined && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────

export function Panel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-zinc-800 bg-zinc-950 p-5", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
      {children}
    </div>
  );
}

// ── Stat tile ──────────────────────────────────────────────────────────────

export function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-zinc-950 p-5">
      <PanelLabel>{label}</PanelLabel>
      <div className="font-display text-lg leading-none tracking-tight text-zinc-50 lowercase">
        {value}
      </div>
      {hint !== undefined && <div className="text-[13px] text-zinc-400">{hint}</div>}
    </div>
  );
}

/** A row of stat tiles separated by hairlines, matching the marketing grids. */
export function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-zinc-800 bg-zinc-800 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

// ── Toggle switch ──────────────────────────────────────────────────────────

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-100 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-45",
        checked ? "border-zinc-50 bg-zinc-50" : "border-zinc-700 bg-zinc-900",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full transition-transform",
          checked ? "translate-x-[22px] bg-zinc-950" : "translate-x-[3px] bg-zinc-500",
        )}
      />
    </button>
  );
}

/** A labelled toggle row used in settings-style lists. */
export function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5">
      <div className="flex flex-col gap-0.5">
        <div className="text-[13px] font-medium text-zinc-100">{title}</div>
        {description !== undefined && (
          <div className="text-[13px] leading-relaxed text-zinc-500">{description}</div>
        )}
      </div>
      <Switch checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  );
}

// ── Copy field ───────────────────────────────────────────────────────────────

export function CopyField({
  value,
  prefix,
  copyValue,
  className,
}: {
  /** The visible/emphasised part of the value. */
  value: string;
  /** Muted leading text, e.g. "handitoff.io/to/". */
  prefix?: string;
  /** What actually gets copied; defaults to prefix + value. */
  copyValue?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = copyValue ?? `${prefix ?? ""}${value}`;
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3",
        className,
      )}
    >
      <div className="min-w-0 truncate font-mono text-sm text-zinc-100">
        {prefix !== undefined && <span className="text-zinc-500">{prefix}</span>}
        {value}
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-zinc-700 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-100"
        aria-label="Copy"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 px-6 py-10 md:items-center md:text-center">
      <div className="font-display text-base tracking-tight text-zinc-100 lowercase">{title}</div>
      {description !== undefined && (
        <p className="max-w-md text-[13px] leading-relaxed text-zinc-400">{description}</p>
      )}
      {action !== undefined && <div className="mt-1">{action}</div>}
    </div>
  );
}

// ── Status / tier badges ───────────────────────────────────────────────────

const STATUS_VARIANT: Record<
  SessionStatus,
  "default" | "success" | "warn" | "danger" | "info"
> = {
  waiting: "warn",
  connected: "info",
  transferring: "info",
  ended: "default",
  expired: "default",
  failed: "danger",
};

export function StatusBadge({ status }: { status: SessionStatus }) {
  const isLive = status === "connected" || status === "transferring";
  return (
    <Badge variant={STATUS_VARIANT[status]}>
      {isLive && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-current"
          style={{ animation: "ht-pulse-dot 1.6s ease-out infinite" }}
          aria-hidden="true"
        />
      )}
      {status}
    </Badge>
  );
}

export function TierBadge({ tier }: { tier: SessionTier }) {
  return <Badge variant={tier === "pro" ? "success" : "outline"}>{tier}</Badge>;
}

// ── Online dot ───────────────────────────────────────────────────────────────

export function OnlineDot({ online }: { online: boolean }) {
  return (
    <span
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        online ? "bg-emerald-400" : "bg-zinc-600",
      )}
      aria-hidden="true"
    />
  );
}
