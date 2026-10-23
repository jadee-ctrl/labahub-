import type { Order, Service } from "./types";
import { hasActiveAdjustRefund, hasActiveRefund, isOnline, orderBalance } from "./payment";

// All money figures for the Reports page, in one testable place.
export function computeReport(orders: Order[], services: Service[]) {
  const live = orders.filter((o) => o.status !== "cancelled");
  const paid = orders.filter((o) => o.paymentStatus === "paid");
  const sum = (list: Order[]) => list.reduce((s, o) => s + o.totalAmount, 0);

  const first = (o: Order) => o.paidAmount ?? o.totalAmount; // what was paid before any re-weighing
  const balanceBy = (o: Order, m: "cash" | "online") => (o.balanceStatus === "paid" && o.balanceMethod === m ? o.balancePaidAmount ?? 0 : 0);
  const add = (list: Order[], f: (o: Order) => number) => list.reduce((s, o) => s + f(o), 0);

  // Cash: cash-on-delivery payments + balances paid in cash at the store.
  const cashCollected = add(paid.filter((o) => !isOnline(o)), first) + add(paid, (o) => balanceBy(o, "cash"));
  // Online payments count as soon as PayMongo confirms them, even before the laundry is delivered.
  // Fully refunded payments and refunded differences are given back, so they don't count.
  const onlineReceived = add(paid.filter((o) => isOnline(o) && !hasActiveRefund(o)), (o) =>
    first(o) + balanceBy(o, "online") - (hasActiveAdjustRefund(o) ? o.adjustRefundAmount ?? 0 : 0));
  const refunded = orders.filter(hasActiveRefund).reduce((s, o) => s + (o.refundAmount ?? o.totalAmount), 0) +
    add(orders.filter((o) => !hasActiveRefund(o) && hasActiveAdjustRefund(o)), (o) => o.adjustRefundAmount ?? 0);
  // Delivered cash orders whose cash hasn't been recorded yet.
  const cashToCollect = sum(live.filter((o) => o.status === "delivered" && o.paymentStatus === "unpaid" && !isOnline(o)));
  // Online orders the customer hasn't finished paying yet.
  // (plus balances a delivery customer still has to pay online after re-weighing)
  const onlineAwaiting = sum(live.filter((o) => isOnline(o) && o.paymentStatus === "unpaid")) +
    add(live.filter((o) => o.paymentStatus === "paid" && o.address?.trim().toLowerCase() !== "store pickup"), (o) => Math.max(0, orderBalance(o)));

  const byService: Record<string, number> = {};
  services.forEach((s) => (byService[s.id] = 0));
  orders.forEach((o) => (byService[o.serviceId] = (byService[o.serviceId] ?? 0) + 1));
  const byStatus: Record<string, number> = {};
  orders.forEach((o) => (byStatus[o.status] = (byStatus[o.status] ?? 0) + 1));

  return {
    total: orders.length,
    delivered: orders.filter((o) => o.status === "delivered").length,
    cancelled: orders.length - live.length,
    active: live.filter((o) => o.status !== "delivered").length,
    cashCollected,
    onlineReceived,
    received: cashCollected + onlineReceived,
    cashToCollect,
    onlineAwaiting,
    refunded,
    byService,
    byStatus,
  };
}
