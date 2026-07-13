"use client";

import { useEffect, useRef, useCallback, useState } from "react";
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
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  const invalidateQueries = useCallback(
    (patterns: string[]) => {
      patterns.forEach((pattern) => {
        queryClient.invalidateQueries({ queryKey: [pattern] });
      });
    },
    [queryClient]
  );

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource("/api/events");
    eventSourceRef.current = es;

    es.onopen = () => {
      setStatus("connected");
      reconnectAttemptsRef.current = 0;
      window.dispatchEvent(new CustomEvent("sse:connected"));
      options.onConnect?.({});
    };

    es.addEventListener("connected", (e) => {
      try {
        const data = JSON.parse(e.data);
        console.log("[SSE] Connected:", data);
      } catch {}
    });

    // Product events
    const productEvents = ["product:create", "product:update", "product:delete", "product:stock"];
    productEvents.forEach((event) => {
      es.addEventListener(event, (e) => {
        try {
          const data = JSON.parse(e.data);
          options.onProductChange?.(data);
          invalidateQueries(["products", "stats", "reports"]);
        } catch {}
      });
    });

    // Sale events
    es.addEventListener("sale:create", (e) => {
      try {
        const data = JSON.parse(e.data);
        options.onSaleChange?.(data);
        invalidateQueries(["sales", "stats", "reports", "finance"]);
      } catch {}
    });

    // Refund events
    es.addEventListener("refund:create", (e) => {
      try {
        const data = JSON.parse(e.data);
        options.onRefundChange?.(data);
        invalidateQueries(["refunds", "sales", "stats", "reports"]);
      } catch {}
    });

    // Department events
    es.addEventListener("department:change", (e) => {
      try {
        const data = JSON.parse(e.data);
        options.onDepartmentChange?.(data);
        invalidateQueries(["departments"]);
      } catch {}
    });

    // Supplier events
    es.addEventListener("supplier:change", (e) => {
      try {
        const data = JSON.parse(e.data);
        options.onSupplierChange?.(data);
        invalidateQueries(["suppliers", "orders"]);
      } catch {}
    });

    // User events
    es.addEventListener("user:change", (e) => {
      try {
        const data = JSON.parse(e.data);
        options.onUserChange?.(data);
        invalidateQueries(["users"]);
      } catch {}
    });

    // Payment method events
    es.addEventListener("payment:change", (e) => {
      try {
        const data = JSON.parse(e.data);
        options.onPaymentChange?.(data);
        invalidateQueries(["payment-methods", "sales"]);
      } catch {}
    });

    // Order events
    es.addEventListener("order:receive", (e) => {
      try {
        const data = JSON.parse(e.data);
        options.onOrderChange?.(data);
        invalidateQueries(["orders", "products"]);
      } catch {}
    });

    es.onerror = () => {
      setStatus("disconnected");
      window.dispatchEvent(new CustomEvent("sse:disconnected"));
      options.onDisconnect?.({});
      es.close();
      eventSourceRef.current = null;

      // Reconnect with exponential backoff
      const attempt = reconnectAttemptsRef.current;
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
      reconnectAttemptsRef.current++;

      setStatus("reconnecting");
      window.dispatchEvent(new CustomEvent("sse:reconnecting"));
      console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${attempt + 1})`);

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, delay);
    };
  }, [options, invalidateQueries]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [connect]);

  return { status };
}
