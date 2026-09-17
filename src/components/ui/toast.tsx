"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import toast, { Toaster, useToasterStore } from "react-hot-toast";

// Re-export the toast function directly
export { toast };

// Pre-styled toast helpers
export const showToast = {
  success: (message: string) => toast.success(message, darkToastOptions),
  error: (message: string) => toast.error(message, darkToastOptions),
  custom: (message: string) => toast(message, darkToastOptions),
  loading: (message: string) => toast.loading(message, darkToastOptions),
  dismiss: (toastId?: string) => toast.dismiss(toastId),
};

const darkToastOptions = {
  style: {
    background: "#191a1b",
    color: "#f7f8f8",
    border: "1px solid #26282d",
    borderRadius: "0.625rem",
    fontSize: "13px",
    boxShadow: "0 12px 32px -12px rgba(0, 0, 0, 0.85)",
  },
  success: {
    iconTheme: {
      primary: "#10b981",
      secondary: "#f7f8f8",
    },
  },
  error: {
    iconTheme: {
      primary: "#ef4444",
      secondary: "#f7f8f8",
    },
  },
};

// The Toaster component to render in the app layout
export function ToasterProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        ...darkToastOptions,
        duration: 3000,
      }}
    />
  );
}

// Hook to get current toasts
export function useToasts() {
  const { toasts } = useToasterStore();
  return toasts;
}

// Toast component for custom rendering
interface ToastProps {
  message: string;
  type?: "success" | "error" | "default";
  className?: string;
}

const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  ({ message, type = "default", className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "pointer-events-auto flex items-center gap-3 rounded-lg border border-line bg-[#191a1b] px-4 py-3 text-[13px] text-fg shadow-[0_12px_32px_-12px_rgba(0,0,0,0.85)]",
          type === "success" && "border-brand/30",
          type === "error" && "border-red-500/30",
          className
        )}
        {...props}
      >
        {message}
      </div>
    );
  }
);
Toast.displayName = "Toast";

export { Toast };