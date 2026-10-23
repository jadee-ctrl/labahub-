import type { Order } from "./types";
import { isStorePickup } from "./context/DataContext";
import { formatPeso } from "./format";
import { isOnline, orderBalance, quantityText, totalFor } from "./payment";

// Printed at the top of every receipt.
export const SHOP = {
  name: "LabaHub Laundry Service Booking",
  address: "Brgy. Tambacan, Iligan City, 9200",
  phone: "0952 560 3364",
};

/** Receipts are printed only once the laundry is Ready (store pickup or delivery). */
export function canPrintReceipt(order: Pick<Order, "status">): boolean {
  return order.status === "ready";
}

/** "Oct 16 · 8:00–10:00 AM" */
export function receiptTime(order: Order): string {
  const date = new Date(order.pickupDate).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  const slot = (order.pickupSlot || order.deliverySlot || "").replace(/\s*-\s*/, "–").replace(/^(\d{1,2}:\d{2})\s*(AM|PM)–(.+\2)$/, "$1–$3");
  return slot ? `${date} · ${slot}` : date;
}

/**
 * The service line: quantity × price. Uses the actual weight when the total was worked out from it,
 * otherwise the booked estimate (online orders keep the amount the customer paid).
 */
export function receiptLine(order: Order): { qty: string; price: string; amount: string } {
  const actual = order.actualQuantity;
  // The total follows the actual weight; old orders weighed before that rule may not match, so check.
  const usesActual = actual != null && totalFor(order, actual) === order.totalAmount;
  const qty = usesActual ? quantityText(order, actual!) : `${quantityText(order, order.estimatedWeightKg)} (est.)`;
  return { qty, price: formatPeso(order.servicePrice), amount: formatPeso(order.totalAmount) };
}

/** Payment method label and the highlighted line. */
export function receiptPayment(order: Order): { method: string; callout: string; paid: boolean } {
  const store = isStorePickup(order);
  const online = isOnline(order);
  const method = online ? "Online (PayMongo)" : store ? "Cash" : "Cash on delivery";
  if (order.paymentStatus === "paid") {
    const bal = orderBalance(order);
    if (bal > 0) {
      const paidPart = `${method} – paid ${formatPeso(order.totalAmount - bal)}`;
      return { method: paidPart, callout: store ? `PAY BALANCE AT PICKUP ${formatPeso(bal)}` : `BALANCE DUE ${formatPeso(bal)} – PAY IN APP`, paid: false };
    }
    return { method, callout: online ? "PAID – Online" : "PAID – Cash", paid: true };
  }
  if (online) return { method, callout: `UNPAID ${formatPeso(order.totalAmount)}`, paid: false };
  return { method, callout: store ? `PAY AT PICKUP ${formatPeso(order.totalAmount)}` : `CASH DUE ${formatPeso(order.totalAmount)}`, paid: false };
}
