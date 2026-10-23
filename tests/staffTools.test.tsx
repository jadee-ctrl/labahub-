import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { Order } from "../src/types";

const auth: any = { user: { id: "s1", name: "Maria Santos", email: "m@x.ph", phone: "", role: "staff", createdAt: "" } };
const data: any = { orders: [], services: [], loading: false, error: null };
vi.mock("../src/context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../src/context/DataContext", async (orig) => ({ ...(await orig<any>()), useData: () => data }));

import { canCollectBalanceCash, canRefund, canRefundDifference, canSetQuantity, hasOpenCheckout, orderBalance, paymentStatus, quantityText, totalFor, weightOutcome } from "../src/payment";
import { computeReport } from "../src/reportStats";
import { addDays, dayKey, daySummary, lateOrders, mapsLink, scheduleAll, scheduleFor, slotStart } from "../src/schedule";
import OrderDetail from "../src/pages/OrderDetail";
import Services, { validateService } from "../src/pages/Services";
import { SERVICE_ICONS, autoIcon, nextFreeIcon } from "../src/serviceIcons";
import Schedule from "../src/pages/Schedule";
import Receipt from "../src/pages/Slip";
import { receiptLine, receiptPayment, receiptTime } from "../src/receipt";

const order = (over: Partial<Order> = {}): Order => ({
  id: "ORD-1", customerId: "c", customerName: "Juan Dela Cruz", customerPhone: "0917 123 4567", address: "Store pickup",
  serviceId: "svc-wash-fold", serviceName: "Wash & Fold", servicePrice: 60, serviceUnit: "per kg", estimatedWeightKg: 3,
  pickupDate: new Date(2026, 9, 16, 0, 0).toISOString(), pickupSlot: "8:00 AM - 10:00 AM", deliverySlot: "", status: "washing",
  staffId: "s1", staffName: "Maria Santos", paymentMethod: "COD", paymentStatus: "unpaid", totalAmount: 180,
  createdAt: "2026-10-16T00:00:00Z", updatedAt: "", progress: [], ...over,
});
const online = (over: Partial<Order> = {}) => order({ paymentMethod: "PayMongo", paymentStatus: "paid", paymongoStatus: "paid", ...over });

beforeEach(() => {
  cleanup();
  Object.assign(data, {
    orders: [], services: [], loading: false,
    setActualQuantity: vi.fn().mockResolvedValue(undefined), refundOrder: vi.fn().mockResolvedValue({ status: "pending", transferLink: null }),
    checkRefund: vi.fn().mockResolvedValue("succeeded"), saveService: vi.fn().mockResolvedValue(undefined),
    advanceStatus: vi.fn(), claimOrder: vi.fn(), markPaid: vi.fn(),
  });
});

describe("refund rules and labels", () => {
  it("only paid online orders that aren't delivered, and only once", () => {
    expect(canRefund(online())).toBe(true);
    expect(canRefund(online({ status: "cancelled" }))).toBe(true); // paid after the customer cancelled
    expect(canRefund(online({ status: "delivered" }))).toBe(false);
    expect(canRefund(order({ paymentStatus: "paid" }))).toBe(false); // cash
    expect(canRefund(online({ paymentStatus: "unpaid" }))).toBe(false);
    expect(canRefund(online({ refundStatus: "pending" }))).toBe(false);
    expect(canRefund(online({ refundStatus: "failed" }))).toBe(true); // retry allowed
  });
  it("payment label follows the refund", () => {
    expect(paymentStatus(online({ status: "cancelled" })).text).toBe("Paid, needs refund");
    expect(paymentStatus(online({ refundStatus: "refunding" })).text).toBe("Refund in progress");
    expect(paymentStatus(online({ refundStatus: "succeeded" })).text).toBe("Refunded");
    expect(paymentStatus(online({ refundStatus: "failed" })).text).toBe("Refund failed");
  });
  it("refunded money is not counted as received", () => {
    const r = computeReport([online({ id: "a", totalAmount: 300 }), online({ id: "b", totalAmount: 150, status: "cancelled", refundStatus: "succeeded", refundAmount: 150 }), online({ id: "c", totalAmount: 90, refundStatus: "failed" })], []);
    expect([r.onlineReceived, r.received, r.refunded]).toEqual([390, 390, 150]);
  });
});

describe("actual weight", () => {
  it("price always follows the actual weight at the booked price", () => {
    expect(totalFor(order(), 4.5)).toBe(270);
    expect(totalFor(order({ serviceUnit: "per item", servicePrice: 25 }), 2.6)).toBe(75); // items are whole numbers
    expect(quantityText(order(), 4.5)).toBe("4.5 kg");
    expect(quantityText(order({ serviceUnit: "per item" }), 1)).toBe("1 item");
    expect(weightOutcome(order(), 4.5).text).toBe("The total becomes ₱270 (was ₱180).");
    expect(weightOutcome(online({ address: "Store pickup" }), 4).text).toMatch(/balance of ₱60 is due \(collect it in cash at the store\)/);
    expect(weightOutcome(online({ address: "12 Rizal St", pickupSlot: "", deliverySlot: "9-11" }), 4).text).toMatch(/balance of ₱60 is due \(the customer pays it in the LabaHub app\)/);
    expect(weightOutcome(online(), 2).text).toMatch(/overpaid ₱60; refund the difference/);
  });
  it("weight only while Picked Up, only the assigned staff, locked once the difference is settled", () => {
    expect(canSetQuantity(order({ status: "picked_up" }), "s1")).toBe(true);
    expect(canSetQuantity(order({ status: "picked_up" }), "s2")).toBe(false);
    for (const status of ["pending", "confirmed", "washing", "ready", "out_for_delivery", "delivered", "cancelled"] as const) {
      expect(canSetQuantity(order({ status }), "s1")).toBe(false);
    }
    expect(canSetQuantity(online({ status: "picked_up", balanceStatus: "paid" }), "s1")).toBe(false);
    expect(canSetQuantity(online({ status: "picked_up", adjustRefundStatus: "pending" }), "s1")).toBe(false);
    expect(canSetQuantity(online({ status: "picked_up", adjustRefundStatus: "failed" }), "s1")).toBe(true);
  });
  it("balance rules", () => {
    const heavy = online({ paidAmount: 180, totalAmount: 240, status: "picked_up" });
    expect(orderBalance(heavy)).toBe(60);
    expect(orderBalance({ ...heavy, balancePaidAmount: 60, balanceStatus: "paid", balanceMethod: "cash" })).toBe(0);
    expect(canCollectBalanceCash({ ...heavy, address: "Store pickup" })).toBe(true);
    expect(canCollectBalanceCash({ ...heavy, address: "12 Rizal St", pickupSlot: "", deliverySlot: "9-11" })).toBe(false); // delivery pays in app
    expect(paymentStatus(heavy).text).toBe("Balance due ₱60");
    const light = online({ paidAmount: 180, totalAmount: 120 });
    expect(orderBalance(light)).toBe(-60);
    expect(canRefundDifference(light)).toBe(true);
    expect(paymentStatus(light).text).toBe("Overpaid ₱60");
    expect(orderBalance({ ...light, adjustRefundStatus: "pending", adjustRefundAmount: 60 })).toBe(0);
    expect(canRefundDifference({ ...light, adjustRefundStatus: "pending", adjustRefundAmount: 60 })).toBe(false);
    expect(canRefund({ ...light, adjustRefundStatus: "pending", adjustRefundAmount: 60 })).toBe(false); // full refund via dashboard then
    expect(hasOpenCheckout(online({ paymentStatus: "unpaid", paymongoStatus: "pending" }))).toBe(true);
    expect(hasOpenCheckout(heavy)).toBe(false);
    expect(hasOpenCheckout({ ...heavy, balanceStatus: "pending" })).toBe(true);
  });
  it("reports count balances and refunded differences correctly", () => {
    const r = computeReport([
      online({ id: "a", paidAmount: 180, totalAmount: 240, balancePaidAmount: 60, balanceStatus: "paid", balanceMethod: "cash", address: "Store pickup" }),
      online({ id: "b", paidAmount: 180, totalAmount: 240, balancePaidAmount: 60, balanceStatus: "paid", balanceMethod: "online", address: "12 Rizal St" }),
      online({ id: "c", paidAmount: 180, totalAmount: 120, adjustRefundStatus: "succeeded", adjustRefundAmount: 60 }),
      online({ id: "d", paidAmount: 180, totalAmount: 300, address: "12 Rizal St", pickupSlot: "", deliverySlot: "9-11" }), // balance 120 still due online
    ], []);
    expect([r.cashCollected, r.onlineReceived]).toEqual([60, 180 + 240 + 120 + 180]);
    expect(r.onlineAwaiting).toBe(120);
    expect(r.refunded).toBe(60);
  });
  it("order page: validates, confirms the new total, then saves", async () => {
    data.orders = [order({ status: "picked_up" })];
    const u = userEvent.setup();
    render(<MemoryRouter initialEntries={["/orders/ORD-1"]}><Routes><Route path="/orders/:id" element={<OrderDetail />} /></Routes></MemoryRouter>);
    await u.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText(/Enter the weight in kg/)).toBeTruthy();
    await u.type(screen.getByLabelText("Actual weight (kg)"), "4.5");
    await u.click(screen.getByRole("button", { name: "Save" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toMatch(/total becomes ₱270 \(was ₱180\)/);
    expect(dialog.textContent).toMatch(/until the order is marked Washing/);
    await u.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(data.setActualQuantity).toHaveBeenCalledWith("ORD-1", 4.5));
  });
  it("order page: no weight form once Washing", () => {
    data.orders = [order({ status: "washing" })];
    render(<MemoryRouter initialEntries={["/orders/ORD-1"]}><Routes><Route path="/orders/:id" element={<OrderDetail />} /></Routes></MemoryRouter>);
    expect(screen.queryByLabelText("Actual weight (kg)")).toBeNull();
  });
  it("order page: store balance -> 'Mark balance received'; overpaid -> 'Refund difference'; delivery -> pay in app", async () => {
    data.markBalancePaid = vi.fn().mockResolvedValue(undefined); data.refundDifference = vi.fn().mockResolvedValue({ status: "pending" });
    const renderIt = () => render(<MemoryRouter initialEntries={["/orders/ORD-1"]}><Routes><Route path="/orders/:id" element={<OrderDetail />} /></Routes></MemoryRouter>);
    const u = userEvent.setup();
    data.orders = [online({ paidAmount: 180, totalAmount: 240, status: "ready", address: "Store pickup" })]; renderIt();
    await u.click(screen.getByRole("button", { name: "Mark balance received (₱60 cash)" }));
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(data.markBalancePaid).toHaveBeenCalledWith("ORD-1")); cleanup();
    data.orders = [online({ paidAmount: 180, totalAmount: 240, status: "ready", address: "12 Rizal St", pickupSlot: "", deliverySlot: "9:00 AM - 11:00 AM" })]; renderIt();
    expect(screen.queryByRole("button", { name: /Mark balance received/ })).toBeNull();
    expect(screen.getByText(/pays the balance in the LabaHub app/)).toBeTruthy(); cleanup();
    data.orders = [online({ paidAmount: 180, totalAmount: 120, status: "washing" })]; renderIt();
    await u.click(screen.getByRole("button", { name: "Refund difference (₱60)" }));
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Refund" }));
    await waitFor(() => expect(data.refundDifference).toHaveBeenCalledWith("ORD-1"));
  });
  it("order page: no weight form for another staff member's order", () => {
    data.orders = [order({ staffId: "s2", staffName: "Ben", status: "picked_up" })];
    render(<MemoryRouter initialEntries={["/orders/ORD-1"]}><Routes><Route path="/orders/:id" element={<OrderDetail />} /></Routes></MemoryRouter>);
    expect(screen.queryByLabelText("Actual weight (kg)")).toBeNull();
  });
});

describe("refund on the order page", () => {
  const renderDetail = () => render(<MemoryRouter initialEntries={["/orders/ORD-1"]}><Routes><Route path="/orders/:id" element={<OrderDetail />} /></Routes></MemoryRouter>);
  it("asks first, then calls the server", async () => {
    data.orders = [online()];
    const u = userEvent.setup(); renderDetail();
    await u.click(screen.getByRole("button", { name: "Cancel order and refund" }));
    expect(data.refundOrder).not.toHaveBeenCalled();
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel and refund" }));
    await waitFor(() => expect(data.refundOrder).toHaveBeenCalledWith("ORD-1"));
    expect(await screen.findByText(/Refund started/)).toBeTruthy();
  });
  it("cash and delivered orders have no refund button; refund in progress shows link + status check", async () => {
    data.orders = [order({ paymentStatus: "paid", status: "delivered" })];
    renderDetail(); expect(screen.queryByRole("button", { name: /refund/i })).toBeNull(); cleanup();
    data.orders = [online({ status: "cancelled", refundStatus: "refunding", refundAmount: 180, refundTransferLink: "https://pm.link/x" })];
    const u = userEvent.setup(); renderDetail();
    expect(screen.queryByRole("button", { name: /Cancel order and refund/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Refund link" }).getAttribute("href")).toBe("https://pm.link/x");
    await u.click(screen.getByRole("button", { name: "Check refund status" }));
    expect(await screen.findByText("Refund completed.")).toBeTruthy();
  });
  it("Print receipt shows ONLY for Ready orders", () => {
    for (const status of ["pending", "confirmed", "picked_up", "washing", "out_for_delivery", "delivered", "cancelled"] as const) {
      data.orders = [order({ status })]; renderDetail();
      expect(screen.queryByRole("link", { name: /Print receipt/ }), status).toBeNull(); cleanup();
    }
    data.orders = [order({ status: "ready" })]; renderDetail();
    expect(screen.getByRole("link", { name: /Print receipt/ }).getAttribute("href")).toBe("/orders/ORD-1/receipt");
  });
});

describe("schedule", () => {
  const today = dayKey(new Date(2026, 9, 16, 9));
  it("days and slots", () => {
    expect(today).toBe("2026-10-16");
    expect(addDays(today, 1)).toBe("2026-10-17");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect([slotStart("8:00 AM - 10:00 AM"), slotStart("1:00 PM - 3:00 PM"), slotStart("12:00 PM - 1:00 PM"), slotStart("??")]).toEqual([480, 780, 720, 1440]);
  });
  it("groups the day by slot in time order, splits deliveries and store pickups, skips cancelled", () => {
    const list = [
      order({ id: "a", pickupSlot: "1:00 PM - 3:00 PM" }),
      order({ id: "b", address: "12 Rizal St", pickupSlot: "", deliverySlot: "9:00 AM - 11:00 AM", status: "ready" }),
      order({ id: "c", pickupSlot: "1:00 PM - 3:00 PM", status: "cancelled" }),
      order({ id: "d", pickupDate: new Date(2026, 9, 17).toISOString() }),
    ];
    const g = scheduleFor(list, today);
    expect(g.map((x) => x.slot)).toEqual(["9:00 AM - 11:00 AM", "1:00 PM - 3:00 PM"]);
    expect(g[0].deliveries.map((o) => o.id)).toEqual(["b"]);
    expect(g[1].storePickups.map((o) => o.id)).toEqual(["a"]);
    expect(daySummary(g)).toEqual({ deliveries: 1, storePickups: 1, notReady: 1, done: 0 });
  });
  it("late = date passed and not finished", () => {
    const list = [order({ id: "old", pickupDate: new Date(2026, 9, 14).toISOString() }), order({ id: "olddone", status: "delivered", pickupDate: new Date(2026, 9, 14).toISOString() }), order({ id: "now" })];
    expect(lateOrders(list, today).map((o) => o.id)).toEqual(["old"]);
  });
  it("All view: every date, earliest first; no cancelled, no completed from past days", () => {
    const at = (d: number) => new Date(2026, 9, d, 0).toISOString();
    const list = [
      order({ id: "tom", pickupDate: at(17) }), order({ id: "today", pickupDate: at(16) }),
      order({ id: "pastOpen", pickupDate: at(14) }), order({ id: "pastDone", status: "delivered", pickupDate: at(14) }),
      order({ id: "cxl", status: "cancelled", pickupDate: at(18) }),
    ];
    const days = scheduleAll(list, today);
    expect(days.map((d) => d.key)).toEqual(["2026-10-14", "2026-10-16", "2026-10-17"]);
    expect(days[0].groups.flatMap((g) => g.storePickups.map((o) => o.id))).toEqual(["pastOpen"]);
  });
  it("page: All chip + search bar (search covers name, phone and address)", async () => {
    const t = new Date(); const tomorrow = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1, 9);
    data.orders = [
      order({ id: "ORD-A", customerName: "Ana Reyes", pickupDate: t.toISOString(), address: "5 Tambacan St", pickupSlot: "", deliverySlot: "9:00 AM - 11:00 AM" }),
      order({ id: "ORD-B", customerName: "Ben Cruz", customerPhone: "0918 555 0000", pickupDate: tomorrow.toISOString() }),
    ];
    const u = userEvent.setup(); render(<MemoryRouter><Schedule /></MemoryRouter>);
    expect(screen.queryByText(/Only my orders/)).toBeNull();
    expect(within(screen.getByRole("tab", { name: /^All/ })).getByText("2")).toBeTruthy();
    expect(within(screen.getByRole("tab", { name: /^Today/ })).getByText("1")).toBeTruthy();
    expect(screen.queryByText("Ben Cruz")).toBeNull(); // Today shows only today's stop
    await u.click(screen.getByRole("tab", { name: /^All/ }));
    expect(screen.getByText("Ana Reyes")).toBeTruthy(); expect(screen.getByText("Ben Cruz")).toBeTruthy();
    await u.type(screen.getByRole("searchbox"), "tambacan");
    expect(screen.getByText("Ana Reyes")).toBeTruthy(); expect(screen.queryByText("Ben Cruz")).toBeNull();
    await u.clear(screen.getByRole("searchbox")); await u.type(screen.getByRole("searchbox"), "0918 555");
    expect(screen.getByText("Ben Cruz")).toBeTruthy(); expect(screen.queryByText("Ana Reyes")).toBeNull();
    await u.clear(screen.getByRole("searchbox")); await u.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText("No matching schedules")).toBeTruthy();
  });
  it("maps link is encoded", () => expect(mapsLink("12 Rizal St & 5th")).toBe("https://www.google.com/maps/search/?api=1&query=12%20Rizal%20St%20%26%205th"));
  it("page shows today's stops (no call button)", () => {
    data.orders = [order({ pickupDate: new Date().toISOString(), address: "12 Rizal St", pickupSlot: "", deliverySlot: "9:00 AM - 11:00 AM" })];
    render(<MemoryRouter><Schedule /></MemoryRouter>);
    expect(screen.getByText("9:00 AM - 11:00 AM")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Call/ })).toBeNull();
    expect(screen.getByText("Not ready yet", { selector: ".stop-flag" })).toBeTruthy();
  });
});

describe("services", () => {
  it("icon is picked from the name, never shared, and shown as a preview (no picker)", async () => {
    const used = ["shirt-outline", "sparkles-outline", "footsteps-outline"];
    expect(autoIcon("Comforter Wash", used)).toBe("bed-outline");
    expect(autoIcon("Sneaker Care", used)).toBe("flame-outline"); // shoe icon taken -> first free one
    expect(autoIcon("Bag Spa", used, { icon: "water-outline", name: "Bag Spa" })).toBe("water-outline"); // unchanged name keeps its icon
    expect(autoIcon("Curtain Wash", used, { icon: "water-outline", name: "Bag Spa" })).toBe("flower-outline"); // renamed -> new match
    expect(autoIcon("Shoe Spa", used, { icon: "water-outline", name: "Bag Spa" })).toBe("water-outline"); // match taken -> keeps
    expect(nextFreeIcon(SERVICE_ICONS.map((i) => i.name))).toBeUndefined();
    data.services = [{ id: "a", name: "Wash", description: "", price: 60, unit: "per kg", active: true, icon: "shirt-outline" }];
    const u = userEvent.setup(); render(<MemoryRouter><Services /></MemoryRouter>);
    await u.click(screen.getByRole("button", { name: "Add service" }));
    expect(screen.queryByRole("button", { name: /Shirt/ })).toBeNull(); // no icon grid any more
    await u.type(screen.getByLabelText("Name"), "Shoe Cleaning");
    expect(screen.getByText("Icon in the app: Shoes")).toBeTruthy();
    await u.type(screen.getByLabelText("Price (₱)"), "150");
    await u.click(screen.getAllByRole("button", { name: "Add service" }).at(-1)!);
    await waitFor(() => expect(data.saveService).toHaveBeenCalledWith({ id: undefined, name: "Shoe Cleaning", description: "", price: 150, unit: "per kg", active: true }));
  });
  it("delete asks first, then reports what happened", async () => {
    data.deleteService = vi.fn().mockResolvedValue("archived");
    data.services = [{ id: "a", name: "Wash", description: "", price: 60, unit: "per kg", active: true, icon: "shirt-outline" }];
    const u = userEvent.setup(); render(<MemoryRouter><Services /></MemoryRouter>);
    await u.click(screen.getByRole("button", { name: "Delete" }));
    expect(data.deleteService).not.toHaveBeenCalled();
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(data.deleteService).toHaveBeenCalledWith("a"));
    expect(await screen.findByText(/Deleted "Wash". Its past orders still show it./)).toBeTruthy();
  });
  const draft = { name: "Comforter", description: "", price: "250", unit: "per item" as const, active: true };
  it("validates like the database", () => {
    expect(validateService(draft).input).toEqual({ id: undefined, name: "Comforter", description: "", price: 250, unit: "per item", active: true });
    expect(validateService({ ...draft, name: "X" }).errors.name).toBeTruthy();
    expect(validateService({ ...draft, price: "-1" }).errors.price).toBeTruthy();
    expect(validateService({ ...draft, price: "1.234" }).errors.price).toBeTruthy();
    expect(validateService({ ...draft, price: "1,500" }).input?.price).toBe(1500);
  });
  it("add a service from the page", async () => {
    data.services = [{ id: "svc-wash-fold", name: "Wash & Fold", description: "", price: 60, unit: "per kg", active: true, icon: "shirt-outline" }];
    const u = userEvent.setup(); render(<MemoryRouter><Services /></MemoryRouter>);
    await u.click(screen.getByRole("button", { name: "Add service" }));
    await u.type(screen.getByLabelText("Name"), "Comforter Wash"); await u.type(screen.getByLabelText("Price (₱)"), "250");
    await u.selectOptions(screen.getByLabelText("Charged"), "per item");
    await u.click(screen.getAllByRole("button", { name: "Add service" }).at(-1)!);
    await waitFor(() => expect(data.saveService).toHaveBeenCalledWith({ id: undefined, name: "Comforter Wash", description: "", price: 250, unit: "per item", active: true }));
    expect(await screen.findByText(/Added “Comforter Wash”/)).toBeTruthy();
  });
});


describe("order receipt", () => {
  beforeEach(() => { window.print = vi.fn(); });
  const renderReceipt = () => render(<MemoryRouter initialEntries={["/orders/ORD-1/receipt"]}><Routes><Route path="/orders/:id/receipt" element={<Receipt />} /></Routes></MemoryRouter>);
  const rowValue = (label: string) => screen.queryByText(label, { selector: "dt" })?.nextElementSibling?.textContent ?? null;

  it("refuses to print for orders that aren't Ready", () => {
    for (const status of ["washing", "out_for_delivery", "delivered", "cancelled"] as const) {
      data.orders = [order({ status })]; renderReceipt();
      expect(screen.getByText(/isn't ready yet/)).toBeTruthy();
      expect(screen.queryByText("ORDER RECEIPT")).toBeNull(); cleanup();
    }
    expect(window.print).not.toHaveBeenCalled();
  });
  it("store pickup: no address line, 'Pickup' time, PAY AT PICKUP for unpaid cash", () => {
    data.orders = [order({ status: "ready", serviceName: "Express Wash", servicePrice: 90, estimatedWeightKg: 3, totalAmount: 270 })]; renderReceipt();
    expect(screen.getByText("LabaHub Laundry Service Booking")).toBeTruthy();
    expect(screen.getByText("Brgy. Tambacan, Iligan City, 9200")).toBeTruthy();
    expect(screen.getByText("Tel: 0952 560 3364")).toBeTruthy();
    expect(rowValue("Type")).toBe("Store pickup");
    expect(rowValue("Deliver to")).toBeNull();
    expect(rowValue("Pickup")).toMatch(/Oct 16 · 8:00–10:00 AM/);
    expect(rowValue("Payment")).toBe("Cash");
    expect(screen.getByText("** PAY AT PICKUP ₱270 **")).toBeTruthy();
    expect(screen.getByText("3 kg (est.) x ₱90")).toBeTruthy();
    expect(screen.queryByText(/Notes/)).toBeNull();
  });
  it("delivery: address line, 'Delivery' time, CASH DUE / PAID", () => {
    const d = { status: "ready" as const, address: "45 Katipunan Ave., QC", pickupSlot: "", deliverySlot: "9:00 AM - 11:00 AM", actualQuantity: 4.6, totalAmount: 276 };
    data.orders = [order(d)]; renderReceipt();
    expect(rowValue("Type")).toBe("Delivery");
    expect(rowValue("Deliver to")).toBe("45 Katipunan Ave., QC");
    expect(rowValue("Delivery")).toMatch(/9:00–11:00 AM/);
    expect(rowValue("Payment")).toBe("Cash on delivery");
    expect(screen.getByText("** CASH DUE ₱276 **")).toBeTruthy();
    expect(screen.getByText("4.6 kg x ₱60")).toBeTruthy(); cleanup();
    data.orders = [order({ ...d, paymentMethod: "PayMongo", paymentStatus: "paid", totalAmount: 180 })]; renderReceipt();
    expect(screen.getByText("** PAID – Online **")).toBeTruthy();
  });
  it("balance on the receipt", () => {
    const heavy = { paymentMethod: "PayMongo" as const, paymentStatus: "paid" as const, paidAmount: 180, totalAmount: 240 };
    expect(receiptPayment(order({ ...heavy })).callout).toBe("PAY BALANCE AT PICKUP ₱60");
    expect(receiptPayment(order({ ...heavy })).method).toBe("Online (PayMongo) – paid ₱180");
    expect(receiptPayment(order({ ...heavy, address: "12 Rizal St", pickupSlot: "", deliverySlot: "9-11" })).callout).toBe("BALANCE DUE ₱60 – PAY IN APP");
    expect(receiptPayment(order({ ...heavy, balancePaidAmount: 60, balanceStatus: "paid", balanceMethod: "cash" })).callout).toBe("PAID – Online");
  });
  it("helpers", () => {
    expect(receiptTime(order({ pickupSlot: "11:00 AM - 1:00 PM" }))).toMatch(/· 11:00 AM–1:00 PM$/);
    expect(receiptPayment(order({ paymentStatus: "paid" })).callout).toBe("PAID – Cash");
    // online order weighed heavier: the paid total stays, so the line shows what was booked
    expect(receiptLine(online({ actualQuantity: 5, totalAmount: 180 })).qty).toBe("3 kg (est.)");
    expect(receiptLine(order({ serviceUnit: "per item", servicePrice: 25, estimatedWeightKg: 2, actualQuantity: 2, totalAmount: 50 })).qty).toBe("2 items");
  });
});