import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.18em]",
  {
    variants: {
      variant: {
        default: "border-zinc-700 bg-zinc-900 text-zinc-300",
        outline: "border-zinc-800 bg-transparent text-zinc-400",
        success: "border-emerald-900/60 bg-emerald-950/40 text-emerald-300",
        warn: "border-amber-900/60 bg-amber-950/40 text-amber-300",
        danger: "border-red-900/60 bg-red-950/40 text-red-300",
        info: "border-sky-900/60 bg-sky-950/40 text-sky-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
