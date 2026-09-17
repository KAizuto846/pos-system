"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

type EventCallback = (data: unknown) => void;

type UseRealtimeSyncOptions = {
  onProductChange?: EventCallback;
  onSaleChange?: EventCallback;
  onRefundChange?: EventCallback;
  onDepartmentChange?: EventCallback;
  onSupplierChange?: EventCallback;
  onUserChange?: EventCallback;
  onPaymentChange?: EventCallback;
  onOrderChange?: EventCallback;
  onConnect?: EventCallback;
  onDisconnect?: EventCallback;
};

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "reconnecting";

export function useRealtimeSync(options: UseRealtimeSyncOptions = {}) {
  const queryClient = useQueryClient();
  const optionsRef = useRef(options);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    let unmounted = false;

    const invalidateQueries = (patterns: string[]) => {
      patterns.forEach((pattern) => {
        queryClient.invalidateQueries({ queryKey: [pattern] });
      });
    };

    const connect = () => {
      if (unmounted || eventSourceRef.current) return;

      const es = new EventSource("/api/events");
      eventSourceRef.current = es;

      es.onopen = () => {
        if (unmounted || eventSourceRef.current !== es) return;
        setStatus("connected");
        reconnectAttemptsRef.current = 0;
        window.dispatchEvent(new CustomEvent("sse:connected"));
        optionsRef.current.onConnect?.({});
      };

      const addListener = (
        event: string,
        callback: keyof UseRealtimeSyncOptions,
        queryKeys: string[]
      ) => {
        es.addEventListener(event, (message) => {
          try {
            const data = JSON.parse(message.data);
            optionsRef.current[callback]?.(data);
            invalidateQueries(queryKeys);
          } catch {}
        });
      };

      ["product:create", "product:update", "product:delete", "product:stock"].forEach((event) => {
        addListener(event, "onProductChange", ["products", "stats", "reports"]);
      });
      addListener("sale:create", "onSaleChange", ["sales", "stats", "reports", "finance"]);
      addListener("refund:create", "onRefundChange", ["refunds", "sales", "stats", "reports"]);
      addListener("department:change", "onDepartmentChange", ["departments"]);
      addListener("supplier:change", "onSupplierChange", ["suppliers", "orders"]);
      addListener("user:change", "onUserChange", ["users"]);
      addListener("payment:change", "onPaymentChange", ["payment-methods", "sales"]);
      addListener("order:receive", "onOrderChange", ["orders", "products"]);

      es.onerror = () => {
        if (unmounted || eventSourceRef.current !== es) return;

        es.close();
        eventSourceRef.current = null;
        window.dispatchEvent(new CustomEvent("sse:disconnected"));
        optionsRef.current.onDisconnect?.({});

        if (reconnectTimeoutRef.current) return;

        const attempt = reconnectAttemptsRef.current++;
        const baseDelay = Math.min(1000 * 2 ** attempt, 30000);
        const delay = Math.min(baseDelay + Math.random() * baseDelay * 0.3, 30000);

        setStatus("reconnecting");
        window.dispatchEvent(new CustomEvent("sse:reconnecting"));
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          connect();
        }, delay);
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [queryClient]);

  return { status };
}
