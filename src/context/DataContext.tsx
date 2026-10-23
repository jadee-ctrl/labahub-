import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { AppNotification, Order, Service } from "../types";
import { supabase } from "../lib/supabase";
import { mapNotification, mapOrder, mapProgress, mapService } from "../lib/mappers";
import { ORDER_STEPS } from "../theme";
import { hasOpenCheckout } from "../payment";
import { useAuth } from "./AuthContext";

interface DataContextValue {
  orders: Order[];
  services: Service[];
  notifications: AppNotification[];
  loading: boolean;
  error: string | null;
  /** How many new orders are waiting for a staff member to accept them. */
  newOrderCount: number;
  claimOrder: (orderId: string) => Promise<void>;
  advanceStatus: (orderId: string) => Promise<void>;
  markPaid: (orderId: string) => Promise<void>;
  /** Saves the real weight (kg) or item count (only while Picked Up). The price always updates. */
  setActualQuantity: (orderId: string, quantity: number) => Promise<void>;
  /** Store pickup: the balance after re-weighing was paid in cash at the store. */
  markBalancePaid: (orderId: string) => Promise<void>;
  /** Weighed lighter than paid online: refund the difference through PayMongo. */
  refundDifference: (orderId: string) => Promise<{ status: string }>;
  /** Adds (no id) or updates a service. */
  saveService: (input: ServiceInput) => Promise<void>;
  /** "deleted" = removed completely; "archived" = it had orders, so it's hidden everywhere but kept for them. */
  deleteService: (id: string) => Promise<"deleted" | "archived">;
  /** Full PayMongo refund of a paid online order; cancels the order. */
  refundOrder: (orderId: string) => Promise<{ status: string; transferLink?: string | null }>;
  /** Asks PayMongo for the latest refund status. */
  checkRefund: (orderId: string) => Promise<string>;
  notificationsFor: (userId: string) => AppNotification[];
  unreadCountFor: (userId: string) => number;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: (userId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export interface ServiceInput {
  id?: string;
  name: string;
  description: string;
  price: number;
  unit: "per kg" | "per item";
  active: boolean;
  icon?: string;
}

// Calls a server function and turns its { error } reply into a readable message.
async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let message = error.message;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx = (error as any).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const j = await ctx.json();
        if (j?.error) message = j.error;
      } catch {
        /* not JSON */
      }
    }
    throw new Error(message);
  }
  return data as T;
}

const DataContext = createContext<DataContextValue | undefined>(undefined);

// ---- Orders badge rule (documented in MIGRATION-SUMMARY-V2.md) ----
// An order "needs attention" while it is PENDING and NOBODY has accepted it yet
// (the same rule as the dashboard's "Unassigned orders" list).
// It leaves the count when a staff member accepts it (status becomes confirmed) or the
// customer cancels it. Opening a page never clears it.
export function needsAttention(order: Order): boolean {
  return order.status === "pending" && !order.staffId;
}

export function isStorePickup(order: Order): boolean {
  return order.address?.trim().toLowerCase() === "store pickup" || (!order.deliverySlot && Boolean(order.pickupSlot));
}

// The next step for an order. Store-pickup orders skip "Out for Delivery"
// (the database enforces the same rule).
export function nextStatus(order: Order): string | null {
  const idx = ORDER_STEPS.indexOf(order.status);
  if (idx === -1 || idx === ORDER_STEPS.length - 1) return null;
  const next = ORDER_STEPS[idx + 1];
  if (next === "out_for_delivery" && isStorePickup(order)) return "delivered";
  return next;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [orders, setOrders] = useState<Order[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    const [svcRes, orderRes, notifRes] = await Promise.all([
      supabase.from("services").select("*").order("price"),
      supabase.from("orders").select("*, order_progress(*)").order("created_at", { ascending: false }),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }),
    ]);
    const firstError = svcRes.error ?? orderRes.error ?? notifRes.error;
    setError(firstError ? firstError.message : null);

    if (svcRes.data) {
      setServices(svcRes.data.map(mapService));
    }
    if (orderRes.data) {
      setOrders(
        orderRes.data.map((o) =>
          mapOrder(
            o,
            [...(o.order_progress ?? [])]
              .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
              .map(mapProgress)
          )
        )
      );
    }
    if (notifRes.data) setNotifications(notifRes.data.map(mapNotification));
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setOrders([]);
      setNotifications([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, [userId, fetchAll]);

  // Live updates: new bookings from customers appear without reloading the page.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`staff-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => void fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "order_progress" }, () => void fetchAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => void fetchAll())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, fetchAll]);

  // Each action asks the database to do the change. The database checks the rules
  // (are you staff? is it your order? is this the next step?) and throws if not allowed.
  const runAction = useCallback(
    async (fn: string, orderId: string) => {
      const { error: rpcError } = await supabase.rpc(fn, { p_order_id: orderId });
      if (rpcError) throw new Error(rpcError.message);
      await fetchAll();
    },
    [fetchAll]
  );

  const claimOrder = useCallback((id: string) => runAction("staff_claim_order", id), [runAction]);
  const advanceStatus = useCallback((id: string) => runAction("staff_advance_order", id), [runAction]);
  const markPaid = useCallback((id: string) => runAction("staff_mark_paid", id), [runAction]);

  const setActualQuantity = useCallback(
    async (orderId: string, quantity: number) => {
      // A checkout the customer could still pay at the OLD price is closed first (the database insists).
      const current = orders.find((o) => o.id === orderId);
      if (current && hasOpenCheckout(current)) {
        await callFunction("paymongo-refund", { action: "close_checkout", orderId });
      }
      const { error: rpcError } = await supabase.rpc("staff_set_actual_quantity", { p_order_id: orderId, p_quantity: quantity });
      if (rpcError) throw new Error(rpcError.message);
      await fetchAll();
    },
    [fetchAll, orders]
  );

  const markBalancePaid = useCallback((id: string) => runAction("staff_mark_balance_paid", id), [runAction]);

  const refundDifference = useCallback(
    async (orderId: string) => {
      try {
        return await callFunction<{ status: string }>("paymongo-refund", { action: "refund_difference", orderId });
      } finally {
        await fetchAll();
      }
    },
    [fetchAll]
  );

  const saveService = useCallback(
    async (input: ServiceInput) => {
      const { error: rpcError } = await supabase.rpc("staff_save_service", {
        p_id: input.id ?? null,
        p_name: input.name,
        p_description: input.description,
        p_price: input.price,
        p_unit: input.unit,
        p_active: input.active,
        p_icon: input.icon ?? null,
      });
      if (rpcError) throw new Error(rpcError.message);
      await fetchAll();
    },
    [fetchAll]
  );

  const deleteService = useCallback(
    async (id: string) => {
      const { data, error: rpcError } = await supabase.rpc("staff_delete_service", { p_id: id });
      if (rpcError) throw new Error(rpcError.message);
      await fetchAll();
      return data === "archived" ? "archived" : "deleted";
    },
    [fetchAll]
  );

  const refundOrder = useCallback(
    async (orderId: string) => {
      try {
        return await callFunction<{ status: string; transferLink?: string | null }>("paymongo-refund", { action: "refund", orderId });
      } finally {
        await fetchAll();
      }
    },
    [fetchAll]
  );

  const checkRefund = useCallback(
    async (orderId: string) => {
      try {
        const r = await callFunction<{ status: string }>("paymongo-refund", { action: "status", orderId });
        return r.status;
      } finally {
        await fetchAll();
      }
    },
    [fetchAll]
  );

  const notificationsFor = useCallback(
    (uid: string) => notifications.filter((n) => n.userId === uid).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notifications]
  );
  const unreadCountFor = useCallback(
    (uid: string) => notifications.filter((n) => n.userId === uid && !n.read).length,
    [notifications]
  );
  const markNotificationRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }, []);
  const markAllNotificationsRead = useCallback(async (uid: string) => {
    setNotifications((prev) => prev.map((n) => (n.userId === uid ? { ...n, read: true } : n)));
    await supabase.from("notifications").update({ read: true }).eq("user_id", uid).eq("read", false);
  }, []);

  const newOrderCount = orders.filter(needsAttention).length;

  return (
    <DataContext.Provider
      value={{
        orders,
        services,
        notifications,
        loading,
        error,
        newOrderCount,
        claimOrder,
        advanceStatus,
        markPaid,
        setActualQuantity,
        markBalancePaid,
        refundDifference,
        saveService,
        deleteService,
        refundOrder,
        checkRefund,
        notificationsFor,
        unreadCountFor,
        markNotificationRead,
        markAllNotificationsRead,
        refresh: fetchAll,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
