"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-normal transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "bg-brand/12 text-emerald-300 ring-1 ring-inset ring-brand/25",
        secondary:
          "bg-white/[0.05] text-fg-muted ring-1 ring-inset ring-line",
        destructive:
          "bg-red-500/12 text-red-300 ring-1 ring-inset ring-red-500/25",
        outline:
          "text-fg-muted ring-1 ring-inset ring-line",
        warning:
          "bg-amber-500/12 text-amber-300 ring-1 ring-inset ring-amber-500/25",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
