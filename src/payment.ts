import type { Order } from "./types";
import { formatPeso } from "./format";

// One place that decides how an order's payment is described, so every screen agrees.

export type PaymentTone = "paid" | "due" | "waiting" | "problem" | "none";

export function isOnline(order: Order): boolean {
  return order.paymentMethod !== "COD";
}

export function methodLabel(order: Order): string {
  if (order.paymentMethod === "PayMongo") return "Online (PayMongo)";
  if (order.paymentMethod === "PayPal") return "Online (PayPal test)";
  return "Cash on delivery";
}

/** Short status for cards and lists. */
export function paymentStatus(order: Order): { text: string; tone: PaymentTone } {
  if (order.refundStatus === "succeeded") return { text: "Refunded", tone: "none" };
  if (order.refundStatus && order.refundStatus !== "failed") return { text: "Refund in progress", tone: "waiting" };
  if (order.refundStatus === "failed") return { text: "Refund failed", tone: "problem" };
  if (order.paymentStatus === "paid" && order.status === "cancelled" && isOnline(order)) return { text: "Paid, needs refund", tone: "problem" };
  if (order.paymentStatus === "paid") {
    const bal = orderBalance(order);
    if (bal > 0) return { text: `Balance due ${formatPeso(bal)}`, tone: "due" };
    if (bal < 0) return { text: `Overpaid ${formatPeso(-bal)}`, tone: "problem" };
    if (hasActiveAdjustRefund(order) && order.adjustRefundStatus !== "succeeded") return { text: "Paid, refunding difference", tone: "waiting" };
    return { text: isOnline(order) ? "Paid online" : "Paid in cash", tone: "paid" };
  }
  if (order.status === "cancelled") return { text: "Not paid", tone: "none" };
  if (!isOnline(order)) return { text: "Cash due", tone: "due" };
  switch (order.paymongoStatus) {
    case "failed":
      return { text: "Online payment failed", tone: "problem" };
    case "cancelled":
    case "expired":
      return { text: "Online payment not completed", tone: "problem" };
    default:
      return { text: "Waiting for online payment", tone: "waiting" };
  }
}

/** Staff may record cash only for delivered, unpaid cash-on-delivery orders. */
export function canMarkCashReceived(order: Order): boolean {
  return order.status === "delivered" && order.paymentStatus === "unpaid" && !isOnline(order);
}

/** A refund is under way or done (failed attempts don't count). */
export function hasActiveRefund(order: Order): boolean {
  return !!order.refundStatus && order.refundStatus !== "failed";
}

/** Paid ONLINE orders that aren't delivered can be cancelled and refunded through PayMongo (once). */
export function canRefund(order: Order): boolean {
  return (
    order.paymentMethod === "PayMongo" && order.paymentStatus === "paid" && order.status !== "delivered" && !hasActiveRefund(order) &&
    // once a balance was paid or a difference refunded, refunds are done from the PayMongo dashboard
    order.balanceStatus !== "paid" && !hasActiveAdjustRefund(order)
  );
}

// ---------- Balance after re-weighing (same rule as public.order_balance in the database) ----------
export const hasActiveAdjustRefund = (o: Order) => !!o.adjustRefundStatus && o.adjustRefundStatus !== "failed";
const round2 = (n: number) => Math.round(n * 100) / 100;

/** > 0: the customer still owes this. < 0: overpaid by this. 0: settled. Only for paid orders. */
export function orderBalance(o: Order): number {
  if (o.paymentStatus !== "paid") return 0;
  return round2(o.totalAmount - (o.paidAmount ?? o.totalAmount) - (o.balancePaidAmount ?? 0) + (hasActiveAdjustRefund(o) ? o.adjustRefundAmount ?? 0 : 0));
}

const isStore = (o: Order) => o.address?.trim().toLowerCase() === "store pickup" || (!o.deliverySlot && Boolean(o.pickupSlot));
const openBalanceCheckout = (o: Order) => o.balanceStatus === "pending" || o.balanceStatus === "failed";

/** Store pickup: staff record the balance paid in cash at the counter. */
export function canCollectBalanceCash(o: Order): boolean {
  return isStore(o) && o.paymentStatus === "paid" && o.status !== "cancelled" && orderBalance(o) > 0 && !openBalanceCheckout(o);
}

/** Lighter than paid online: refund the difference (once, at least ₱1). */
export function canRefundDifference(o: Order): boolean {
  return o.paymentMethod === "PayMongo" && o.paymentStatus === "paid" && o.status !== "cancelled" && orderBalance(o) <= -1 && !hasActiveAdjustRefund(o);
}

/** An online checkout the customer could still pay; it's closed before a new weight is saved. */
export function hasOpenCheckout(o: Order): boolean {
  return (o.paymentStatus === "unpaid" && (o.paymongoStatus === "pending" || o.paymongoStatus === "failed")) || openBalanceCheckout(o);
}

/** What saving `qty` means for the money, for the confirmation message. */
export function weightOutcome(o: Order, qty: number): { newTotal: number; text: string } {
  const newTotal = totalFor(o, qty);
  if (o.paymentStatus !== "paid") return { newTotal, text: `The total becomes ${formatPeso(newTotal)} (was ${formatPeso(o.totalAmount)}).` };
  const after = orderBalance({ ...o, paidAmount: o.paidAmount ?? o.totalAmount, totalAmount: newTotal });
  if (after > 0) {
    return {
      newTotal,
      text: `The total becomes ${formatPeso(newTotal)}. The customer already paid ${formatPeso(o.totalAmount - orderBalance(o))}, so a balance of ${formatPeso(after)} is due ${
        isStore(o) ? "(collect it in cash at the store)" : "(the customer pays it in the LabaHub app)"
      }.`,
    };
  }
  if (after < 0) return { newTotal, text: `The total becomes ${formatPeso(newTotal)}. The customer overpaid ${formatPeso(-after)}; refund the difference after saving.` };
  return { newTotal, text: `The total stays ${formatPeso(newTotal)}.` };
}

// ---------- Actual weight / item count ----------
export const isPerItem = (order: Pick<Order, "serviceUnit">) => order.serviceUnit === "per item";

/** "4.5 kg" or "3 items" */
export function quantityText(order: Pick<Order, "serviceUnit">, qty: number): string {
  if (isPerItem(order)) return `${qty} ${qty === 1 ? "item" : "items"}`;
  return `${Number(qty.toFixed(2))} kg`;
}

/**
 * The assigned staff member enters the real weight only while the order is Picked Up
 * (it locks once washing starts), and not after the difference was paid or refunded.
 */
export function canSetQuantity(order: Order, userId: string): boolean {
  return order.staffId === userId && order.status === "picked_up" && order.balanceStatus !== "paid" && !hasActiveAdjustRefund(order);
}

/** The total the database will calculate for this quantity (same formula as booking). */
export function totalFor(order: Order, qty: number): number {
  const q = isPerItem(order) ? Math.max(1, Math.round(qty)) : Math.round(qty * 100) / 100;
  return Math.round(order.servicePrice * q);
}
