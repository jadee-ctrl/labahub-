import type { Order } from "./types";
import { statusColors } from "./theme";
import { paymentStatus } from "./payment";

// Same idea as the mobile app's order search, plus the staff-only fields (customer phone, staff).
export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function orderMatchesQuery(order: Order, query: string): boolean {
  const q = normalizeQuery(query);
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  const fields = [
    order.id,
    order.customerName,
    order.serviceName,
    order.staffName,
    order.address,
    order.status.replace(/_/g, " "),
    statusColors[order.status]?.label,
    order.status === "delivered" ? "completed" : undefined,
    paymentStatus(order).text,
  ];
  if (fields.some((f) => !!f && f.toLowerCase().includes(q))) return true;
  // Phone numbers: match on digits so "0917 123" finds "09171234567".
  return digits.length >= 3 && order.customerPhone.replace(/\D/g, "").includes(digits);
}

export const ORDER_FILTERS = ["All", "Unassigned", "In progress", "Delivered", "Cancelled", "Unpaid"] as const;
export type OrderFilter = (typeof ORDER_FILTERS)[number];

export function matchesFilter(order: Order, filter: OrderFilter): boolean {
  switch (filter) {
    case "Unassigned":
      return !order.staffId && order.status !== "cancelled";
    case "In progress":
      return order.status !== "delivered" && order.status !== "cancelled";
    case "Delivered":
      return order.status === "delivered";
    case "Cancelled":
      return order.status === "cancelled";
    case "Unpaid":
      return order.paymentStatus === "unpaid" && order.status !== "cancelled";
    default:
      return true;
  }
}
