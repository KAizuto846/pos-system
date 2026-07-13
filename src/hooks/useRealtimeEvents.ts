"use client";

import { useEffect, useCallback } from "react";

type EventCallback = (data: unknown) => void;

type UseRealtimeEventsOptions = {
  onProductChange?: EventCallback;
  onSaleChange?: EventCallback;
  onRefundChange?: EventCallback;
  onDepartmentChange?: EventCallback;
  onSupplierChange?: EventCallback;
  onUserChange?: EventCallback;
  onPaymentChange?: EventCallback;
  onOrderChange?: EventCallback;
};

export function useRealtimeEvents(options: UseRealtimeEventsOptions = {}) {
  const handleMessage = useCallback(
    (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        // Parse SSE format: "event: type\ndata: {...}\n\n"
        const lines = e.data.split("\n");
        let eventType = "";
        let eventData = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7);
          } else if (line.startsWith("data: ")) {
            eventData = line.slice(6);
          }
        }

        if (!eventType || !eventData) return;

        const parsed = JSON.parse(eventData);

        switch (eventType) {
          case "product:create":
          case "product:update":
          case "product:delete":
          case "product:stock":
            options.onProductChange?.(parsed);
            break;
          case "sale:create":
            options.onSaleChange?.(parsed);
            break;
          case "refund:create":
            options.onRefundChange?.(parsed);
            break;
          case "department:change":
            options.onDepartmentChange?.(parsed);
            break;
          case "supplier:change":
            options.onSupplierChange?.(parsed);
            break;
          case "user:change":
            options.onUserChange?.(parsed);
            break;
          case "payment:change":
            options.onPaymentChange?.(parsed);
            break;
          case "order:receive":
            options.onOrderChange?.(parsed);
            break;
        }
      } catch {}
    },
    [options]
  );

  useEffect(() => {
    const es = new EventSource("/api/events");

    const eventTypes = [
      "product:create",
      "product:update",
      "product:delete",
      "product:stock",
      "sale:create",
      "refund:create",
      "department:change",
      "supplier:change",
      "user:change",
      "payment:change",
      "order:receive",
    ];

    eventTypes.forEach((event) => {
      es.addEventListener(event, handleMessage);
    });

    return () => {
      es.close();
    };
  }, [handleMessage]);
}
