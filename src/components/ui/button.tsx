"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand/60 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-brand-strong text-white hover:bg-brand shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset]",
        destructive:
          "bg-red-600/90 text-white hover:bg-red-600",
        outline:
          "border border-line bg-white/[0.02] text-fg hover:bg-white/[0.06]",
        secondary:
          "bg-white/[0.05] text-fg hover:bg-white/[0.09]",
        ghost:
          "text-fg-muted hover:bg-white/[0.06] hover:text-fg",
        link:
          "text-brand hover:text-emerald-400 underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-10 rounded-lg px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
