import type { Order } from "./types";
import { statusColors } from "./theme";
import { methodLabel, paymentStatus } from "./payment";
import type { computeReport } from "./reportStats";

// Report periods, CSV export and labels for the Reports page, kept out of the page so they can be tested.

export const REPORT_PERIODS = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "month", label: "This month" },
  { id: "last-month", label: "Last month" },
] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number]["id"];

/** Start (inclusive) and end (exclusive) of a period, in the computer's local time. null = no limit. */
export function periodRange(period: ReportPeriod, now = new Date()): { from: Date | null; to: Date | null } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (period) {
    case "today":
      return { from: startOfToday, to: null };
    case "7d":
      return { from: new Date(startOfToday.getFullYear(), startOfToday.getMonth(), startOfToday.getDate() - 6), to: null };
    case "month":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: null };
    case "last-month":
      return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 1) };
    default:
      return { from: null, to: null };
  }
}

/** Orders placed within the period (by the date the order was created). */
export function ordersInPeriod(orders: Order[], period: ReportPeriod, now = new Date()): Order[] {
  const { from, to } = periodRange(period, now);
  if (!from && !to) return orders;
  return orders.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    if (Number.isNaN(t)) return false;
    return (!from || t >= from.getTime()) && (!to || t < to.getTime());
  });
}

const d = (x: Date) => x.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

/** e.g. "Oct 1, 2026 – Oct 16, 2026" or "All orders". */
export function periodText(period: ReportPeriod, now = new Date()): string {
  if (period === "all") return "All orders";
  const { from, to } = periodRange(period, now);
  const end = to ? new Date(to.getTime() - 1) : now;
  return from && d(from) === d(end) ? d(end) : `${from ? d(from) : ""} – ${d(end)}`;
}

export function orderStatusLabel(o: Order): string {
  return o.status === "delivered" ? "Completed" : statusColors[o.status]?.label ?? o.status;
}

/** One CSV cell. Quotes when needed, and stops spreadsheet apps from running text that looks like a formula. */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (cells: (string | number | null | undefined)[]) => cells.map(csvCell).join(",");
const isoDate = (iso: string) => {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
};

/** The whole report as CSV text: a summary block, then one line per order. Amounts are plain numbers (pesos). */
export function buildReportCsv(opts: {
  orders: Order[];
  stats: ReturnType<typeof computeReport>;
  periodLabel: string;
  rangeText: string;
  generatedAt?: Date;
}): string {
  const { orders, stats, periodLabel, rangeText, generatedAt = new Date() } = opts;
  const lines = [
    row(["LabaHub report"]),
    row(["Period", `${periodLabel} (${rangeText})`]),
    row(["Generated", isoDate(generatedAt.toISOString())]),
    "",
    row(["Summary", "Amount (PHP)"]),
    row(["Total money", stats.received]),
    row(["Cash collected", stats.cashCollected]),
    row(["Paid online", stats.onlineReceived]),
    row(["Waiting for online payment", stats.onlineAwaiting]),
    row(["Refunded online (not counted above)", stats.refunded]),
    "",
    row(["Orders", "Count"]),
    row(["Total", stats.total]),
    row(["In progress", stats.active]),
    row(["Completed", stats.delivered]),
    row(["Cancelled", stats.cancelled]),
    "",
    row(["Order no.", "Date placed", "Customer", "Phone", "Service", "Est. weight/qty", "Actual weight/qty", "Amount (PHP)", "Payment method", "Payment", "Status", "Staff"]),
    ...orders.map((o) =>
      row([
        o.id,
        isoDate(o.createdAt),
        o.customerName,
        o.customerPhone,
        o.serviceName,
        o.estimatedWeightKg || "",
        o.actualQuantity ?? "",
        o.totalAmount,
        methodLabel(o),
        paymentStatus(o).text,
        orderStatusLabel(o),
        o.staffName ?? "",
      ])
    ),
  ];
  return lines.join("\r\n") + "\r\n";
}

/** Saves the CSV through the browser. The BOM lets Excel read names with ñ and other accents correctly. */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
