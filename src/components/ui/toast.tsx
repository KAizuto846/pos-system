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
    background: "hsl(222.2 84% 4.9%)",
    color: "hsl(210 40% 98%)",
    border: "1px solid hsl(217.2 32.6% 17.5%)",
    borderRadius: "0.5rem",
    fontSize: "0.875rem",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.5)",
  },
  success: {
    iconTheme: {
      primary: "#10b981", // emerald-500
      secondary: "#f8fafc",
    },
  },
  error: {
    iconTheme: {
      primary: "#ef4444", // red-500
      secondary: "#f8fafc",
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
          "pointer-events-auto flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 shadow-lg",
          type === "success" && "border-emerald-600/50",
          type === "error" && "border-red-600/50",
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
