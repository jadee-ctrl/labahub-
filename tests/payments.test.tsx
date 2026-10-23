import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { formatPeso } from "../src/format";
import { canMarkCashReceived, methodLabel, paymentStatus } from "../src/payment";
import { matchesFilter, orderMatchesQuery } from "../src/orderSearch";
import { computeReport } from "../src/reportStats";
import { buildReportCsv, csvCell, ordersInPeriod, periodRange } from "../src/reportExport";
import { mapOrder } from "../src/lib/mappers";
import type { Order } from "../src/types";

const data: any = { orders: [], loading: false };
vi.mock("../src/context/DataContext", async (orig) => ({ ...(await orig<any>()), useData: () => data }));
import Orders from "../src/pages/Orders";

const order = (over: Partial<Order> = {}): Order => ({
  id: "ORD-1", customerId: "c", customerName: "Juan Dela Cruz", customerPhone: "0917 123 4567", address: "Store pickup",
  serviceId: "svc-wash-fold", serviceName: "Wash & Fold", servicePrice: 60, serviceUnit: "per kg", estimatedWeightKg: 3,
  pickupDate: "2026-10-17T00:00:00Z", pickupSlot: "8:00 AM - 10:00 AM", deliverySlot: "", status: "pending",
  paymentMethod: "COD", paymentStatus: "unpaid", totalAmount: 180, createdAt: "2026-10-16T00:00:00Z", updatedAt: "", progress: [], ...over,
});

describe("peso format", () => {
  it("adds thousands separators and keeps centavos only when present", () => {
    expect(formatPeso(1500)).toBe("₱1,500");
    expect(formatPeso(180)).toBe("₱180");
    expect(formatPeso(1234.5)).toBe("₱1,234.50");
  });
});

describe("mapping payment fields from the database", () => {
  it("reads PAYMONGO, legacy PAYPAL and COD", () => {
    expect(mapOrder({ payment_method: "PAYMONGO", paymongo_status: "pending" }).paymentMethod).toBe("PayMongo");
    expect(mapOrder({ payment_method: "PAYMONGO", paymongo_status: "pending" }).paymongoStatus).toBe("pending");
    expect(mapOrder({ payment_method: "PAYPAL" }).paymentMethod).toBe("PayPal");
    expect(mapOrder({ payment_method: "COD" }).paymentMethod).toBe("COD");
  });
});

describe("payment status shown to staff", () => {
  it("cash orders", () => {
    expect(paymentStatus(order()).text).toBe("Cash due");
    expect(paymentStatus(order({ paymentStatus: "paid" })).text).toBe("Paid in cash");
    expect(methodLabel(order())).toBe("Cash on delivery");
  });
  it("online orders never say COD", () => {
    const o = order({ paymentMethod: "PayMongo", paymongoStatus: "pending" });
    expect(paymentStatus(o).text).toBe("Waiting for online payment");
    expect(paymentStatus({ ...o, paymongoStatus: "failed" }).text).toBe("Online payment failed");
    expect(paymentStatus({ ...o, paymongoStatus: "expired" }).text).toBe("Online payment not completed");
    expect(paymentStatus({ ...o, paymentStatus: "paid" }).text).toBe("Paid online");
    expect(methodLabel(o)).toBe("Online (PayMongo)");
  });
  it("cancelled orders aren't asking for money", () => expect(paymentStatus(order({ status: "cancelled" })).text).toBe("Not paid"));
  it("'Mark cash received' only for delivered, unpaid CASH orders", () => {
    expect(canMarkCashReceived(order({ status: "delivered" }))).toBe(true);
    expect(canMarkCashReceived(order({ status: "delivered", paymentMethod: "PayMongo" }))).toBe(false);
    expect(canMarkCashReceived(order({ status: "delivered", paymentStatus: "paid" }))).toBe(false);
    expect(canMarkCashReceived(order({ status: "washing" }))).toBe(false);
  });
});

describe("order search and filters", () => {
  it("finds by order no., customer, phone digits, service, status and payment; ignores case/spaces", () => {
    const o = order({ id: "ORD-1A142958602-B5633", status: "out_for_delivery", staffName: "Maria Santos" });
    for (const q of ["b5633", "  JUAN ", "0917123", "0917 123", "wash", "out for delivery", "cash due", "maria"]) expect(orderMatchesQuery(o, q)).toBe(true);
    expect(orderMatchesQuery(o, "")).toBe(true);
    expect(orderMatchesQuery(o, "dry clean")).toBe(false);
    expect(orderMatchesQuery(o, "12")).toBe(false); // too few digits to search phone numbers
  });
  it("filters", () => {
    expect(matchesFilter(order({ status: "cancelled" }), "Cancelled")).toBe(true);
    expect(matchesFilter(order({ status: "cancelled" }), "Unpaid")).toBe(false);
    expect(matchesFilter(order(), "Unpaid")).toBe(true);
    expect(matchesFilter(order({ paymentStatus: "paid" }), "Unpaid")).toBe(false);
    expect(matchesFilter(order({ staffId: "s1" }), "Unassigned")).toBe(false);
  });
});

describe("reports money", () => {
  it("separates cash and online, counts online payments before delivery, ignores cancelled", () => {
    const r = computeReport(
      [
        order({ id: "a", status: "delivered", paymentStatus: "paid", totalAmount: 540 }), // cash collected
        order({ id: "b", status: "washing", paymentMethod: "PayMongo", paymentStatus: "paid", totalAmount: 300 }), // paid online, not delivered yet
        order({ id: "c", status: "delivered", totalAmount: 160 }), // cash to collect
        order({ id: "d", paymentMethod: "PayMongo", paymongoStatus: "pending", totalAmount: 270 }), // waiting online
        order({ id: "e", status: "cancelled", totalAmount: 999 }), // ignored
      ],
      []
    );
    expect([r.cashCollected, r.onlineReceived, r.received, r.cashToCollect, r.onlineAwaiting]).toEqual([540, 300, 840, 160, 270]);
    expect([r.total, r.active, r.delivered, r.cancelled]).toEqual([5, 2, 2, 1]);
  });
});

describe("report export", () => {
  const now = new Date(2026, 9, 16, 15, 0); // Oct 16, 2026, 3 PM local time
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();
  it("picks orders by the date they were placed", () => {
    const list = [order({ id: "today", createdAt: at(2026, 9, 16, 1) }), order({ id: "oct10", createdAt: at(2026, 9, 10) }), order({ id: "oct1", createdAt: at(2026, 9, 1, 0) }), order({ id: "sep30", createdAt: at(2026, 8, 30, 23) })];
    const ids = (p: any) => ordersInPeriod(list, p, now).map((o) => o.id);
    expect(ids("all")).toEqual(["today", "oct10", "oct1", "sep30"]);
    expect(ids("today")).toEqual(["today"]);
    expect(ids("7d")).toEqual(["today", "oct10"]);
    expect(ids("month")).toEqual(["today", "oct10", "oct1"]);
    expect(ids("last-month")).toEqual(["sep30"]);
    expect(periodRange("last-month", new Date(2026, 0, 5)).from?.getMonth()).toBe(11); // January → December of last year
  });
  it("CSV cells are quoted when needed and can't run as spreadsheet formulas", () => {
    expect(csvCell("Dela Cruz, Juan")).toBe('"Dela Cruz, Juan"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+639171234567")).toBe("'+639171234567");
    expect(csvCell(180)).toBe("180");
    expect(csvCell(undefined)).toBe("");
  });
  it("CSV has the summary and one line per order", () => {
    const list = [order({ status: "delivered", paymentStatus: "paid", totalAmount: 540, customerName: "Peña, Ana" }), order({ id: "ORD-2", paymentMethod: "PayMongo", paymongoStatus: "pending", totalAmount: 270 })];
    const csv = buildReportCsv({ orders: list, stats: computeReport(list, []), periodLabel: "All time", rangeText: "All orders" });
    const lines = csv.trim().split("\r\n");
    expect(lines).toContain("Total money,540");
    expect(lines).toContain("Waiting for online payment,270");
    const first = lines.find((l) => l.startsWith("ORD-1,"))!;
    expect(first).toMatch(/^ORD-1,2026-10-1\d \d\d:\d\d,"Peña, Ana",0917 123 4567,Wash & Fold,3,,540,Cash on delivery,Paid in cash,Completed,$/);
    expect(lines.filter((l) => l.startsWith("ORD-"))).toHaveLength(2);
  });
});

describe("Orders page", () => {
  beforeEach(() => {
    cleanup();
    data.orders = [
      order({ id: "ORD-AAA", customerName: "Juan Dela Cruz", createdAt: "2026-10-16T02:00:00Z" }),
      order({ id: "ORD-BBB", customerName: "Ana Reyes", customerPhone: "0918 222 3344", paymentMethod: "PayMongo", paymongoStatus: "pending", createdAt: "2026-10-16T01:00:00Z" }),
      order({ id: "ORD-CCC", customerName: "Ramon Cruz", status: "cancelled", createdAt: "2026-10-16T00:00:00Z" }),
    ];
  });
  const renderOrders = () => render(<MemoryRouter><Orders /></MemoryRouter>);
  const cardIds = () => Array.from(document.querySelectorAll(".order-id")).map((e) => e.textContent);

  it("shows counts per filter and online orders without 'COD'", () => {
    renderOrders();
    expect(within(screen.getByRole("tab", { name: /^All/ })).getByText("3")).toBeTruthy();
    expect(within(screen.getByRole("tab", { name: /^Cancelled/ })).getByText("1")).toBeTruthy();
    expect(screen.getByText("Waiting for online payment")).toBeTruthy();
    expect(screen.queryByText(/COD/)).toBeNull();
  });
  it("search narrows the list, updates counts, shows an empty state, and clearing restores everything", async () => {
    const u = userEvent.setup(); renderOrders();
    await u.type(screen.getByRole("searchbox"), "0918 222");
    expect(cardIds()).toEqual(["ORD-BBB"]);
    expect(within(screen.getByRole("tab", { name: /^All/ })).getByText("1")).toBeTruthy();
    await u.clear(screen.getByRole("searchbox")); await u.type(screen.getByRole("searchbox"), "nobody");
    expect(screen.getByText("No matching orders")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Clear search" }));
    expect(cardIds()).toEqual(["ORD-AAA", "ORD-BBB", "ORD-CCC"]);
  });
  it("is a table with one row per order; clicking a row opens that order", async () => {
    const u = userEvent.setup();
    render(<MemoryRouter initialEntries={["/orders"]}><Routes><Route path="/orders" element={<Orders />} /><Route path="/orders/:id" element={<div>detail page</div>} /></Routes></MemoryRouter>);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Order no.", "Customer", "Service", "Pickup", "Amount", "Payment", "Status"]);
    await u.click(screen.getByText("Ana Reyes"));
    expect(screen.getByText("detail page")).toBeTruthy();
  });
  it("Cancelled and Unpaid filters", async () => {
    const u = userEvent.setup(); renderOrders();
    await u.click(screen.getByRole("tab", { name: /^Cancelled/ })); expect(cardIds()).toEqual(["ORD-CCC"]);
    await u.click(screen.getByRole("tab", { name: /^Unpaid/ })); expect(cardIds()).toEqual(["ORD-AAA", "ORD-BBB"]);
  });
});
