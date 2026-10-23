import type { Order } from "./types";
import { isStorePickup } from "./context/DataContext";

// The date a customer picks when booking is when they want their laundry BACK:
//   * store orders: the customer collects at the shop in that time slot
//   * delivery orders: staff deliver to the address in that time window

/** Local calendar day "YYYY-MM-DD" (the shop's computer time zone). */
export function dayKey(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return dayKey(new Date(y, m - 1, d + days));
}

/** Minutes after midnight for the start of "8:00 AM - 10:00 AM". Unknown slots sort last. */
export function slotStart(slot: string): number {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i.exec(slot ?? "");
  if (!m) return 24 * 60;
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return h * 60 + Number(m[2] ?? 0);
}

export const slotOf = (o: Order) => o.pickupSlot || o.deliverySlot || "Any time";
const open = (o: Order) => o.status !== "delivered" && o.status !== "cancelled";
/** Laundry is ready to hand over (or already on the way). */
export const isReady = (o: Order) => o.status === "ready" || o.status === "out_for_delivery";

export interface SlotGroup {
  slot: string;
  deliveries: Order[];
  storePickups: Order[];
}

/** Everything due on one day (not cancelled), grouped by time slot in time order. Done orders are kept, so the day reads complete. */
export function scheduleFor(orders: Order[], key: string): SlotGroup[] {
  const groups = new Map<string, SlotGroup>();
  for (const o of orders) {
    if (o.status === "cancelled" || dayKey(o.pickupDate) !== key) continue;
    const slot = slotOf(o);
    const g = groups.get(slot) ?? { slot, deliveries: [], storePickups: [] };
    (isStorePickup(o) ? g.storePickups : g.deliveries).push(o);
    groups.set(slot, g);
  }
  return [...groups.values()].sort((a, b) => slotStart(a.slot) - slotStart(b.slot) || a.slot.localeCompare(b.slot));
}

/** Not finished and its date has passed. Oldest first. */
export function lateOrders(orders: Order[], todayKey: string): Order[] {
  return orders
    .filter((o) => open(o) && dayKey(o.pickupDate) !== "" && dayKey(o.pickupDate) < todayKey)
    .sort((a, b) => a.pickupDate.localeCompare(b.pickupDate));
}

/** Short counts for the top of the page. */
export function daySummary(groups: SlotGroup[]) {
  const all = groups.flatMap((g) => [...g.deliveries, ...g.storePickups]);
  return {
    deliveries: groups.reduce((n, g) => n + g.deliveries.length, 0),
    storePickups: groups.reduce((n, g) => n + g.storePickups.length, 0),
    notReady: all.filter((o) => open(o) && !isReady(o)).length,
    done: all.filter((o) => o.status === "delivered").length,
  };
}

/** Google Maps search link for an address (opens the Maps app on phones). */
export function mapsLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/**
 * "All" view: every date that has deliveries or store pickups, earliest first.
 * Cancelled orders are left out, and so are completed orders from past days (history lives in Orders).
 */
export function scheduleAll(orders: Order[], todayKey: string): { key: string; groups: SlotGroup[] }[] {
  const keep = orders.filter((o) => {
    const k = dayKey(o.pickupDate);
    return o.status !== "cancelled" && k !== "" && (k >= todayKey || open(o));
  });
  const keys = [...new Set(keep.map((o) => dayKey(o.pickupDate)))].sort();
  return keys.map((key) => ({ key, groups: scheduleFor(keep, key) }));
}

/** How many stops a view shows (for the counts on the filter buttons). */
export const stopCount = (groups: SlotGroup[]) => groups.reduce((n, g) => n + g.deliveries.length + g.storePickups.length, 0);