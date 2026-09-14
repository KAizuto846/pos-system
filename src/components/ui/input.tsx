"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-lg border border-line bg-white/[0.02] px-3 py-1 text-[13px] text-fg transition-colors",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg",
        "placeholder:text-fg-subtle",
        "hover:bg-white/[0.03]",
        "focus-visible:outline-none focus-visible:border-brand/50 focus-visible:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-brand/15",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
