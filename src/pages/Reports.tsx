import { useMemo, useState } from "react";
import { IoDownloadOutline, IoPrintOutline } from "react-icons/io5";
import { useData } from "../context/DataContext";
import { Card, SectionHeader } from "../components/ui";
import { statusColors } from "../theme";
import { formatDate, formatPeso } from "../format";
import { computeReport } from "../reportStats";
import { paymentStatus } from "../payment";
import { REPORT_PERIODS, buildReportCsv, downloadCsv, orderStatusLabel, ordersInPeriod, periodText, type ReportPeriod } from "../reportExport";

function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max === 0 || count === 0 ? 0 : Math.max(4, Math.round((count / max) * 100));
  return (
    <div className="bar-row">
      <div className="bar-label">{label}</div>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="bar-value">{count}</div>
    </div>
  );
}

function Money({ label, value, note, tone }: { label: string; value: number; note: string; tone: "total" | "paid" | "waiting" }) {
  return (
    <div className={`money money-${tone}`}>
      <div className="money-label">{label}</div>
      <div className="money-value">{formatPeso(value)}</div>
      <div className="money-note">{note}</div>
    </div>
  );
}

export default function Reports() {
  const { orders, services, loading } = useData();
  const [period, setPeriod] = useState<ReportPeriod>("all");
  const periodLabel = REPORT_PERIODS.find((p) => p.id === period)?.label ?? "All time";
  const rangeText = periodText(period);
  // Newest first, matching the Orders page.
  const shown = useMemo(
    () => [...ordersInPeriod(orders, period)].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [orders, period]
  );
  const stats = useMemo(() => computeReport(shown, services), [shown, services]);
  const generatedAt = new Date();

  const exportCsv = () => {
    const csv = buildReportCsv({ orders: shown, stats, periodLabel, rangeText });
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`labahub-report-${period}-${stamp}.csv`, csv);
  };
  const maxService = Math.max(1, ...Object.values(stats.byService));
  const maxStatus = Math.max(1, ...Object.values(stats.byStatus));

  return (
    <>
      {/* Only on paper: who/what/when this report is. */}
      <div className="print-only print-head">
        <div className="print-title">LabaHub report</div>
        <div>
          {periodLabel} · {rangeText} · Printed {generatedAt.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
        </div>
      </div>

      <div className="report-head no-print">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-sub">{period === "all" ? "How the shop is doing, from every order so far." : `Orders placed ${rangeText}.`}</p>
        </div>
        <div className="report-actions">
          <button type="button" className="btn btn-secondary" onClick={exportCsv} disabled={loading}>
            <IoDownloadOutline size={18} aria-hidden="true" /> Export CSV
          </button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()} disabled={loading}>
            <IoPrintOutline size={18} aria-hidden="true" /> Print
          </button>
        </div>
      </div>

      <div className="filter-tabs report-periods no-print" role="tablist" aria-label="Report period">
        {REPORT_PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={period === p.id}
            className={`filter-tab report-period${period === p.id ? " filter-tab-active" : ""}`}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <SectionHeader title="Money" subtitle={loading ? "Loading…" : undefined} />
      <div className="money-grid">
        <Money label="Total money" value={stats.received} note="Cash collected + paid online" tone="total" />
        <Money label="Cash collected" value={stats.cashCollected} note="Cash recorded by staff" tone="paid" />
        <Money label="Paid online" value={stats.onlineReceived} note="Confirmed by PayMongo" tone="paid" />
        <Money label="Waiting for online payment" value={stats.onlineAwaiting} note="Customer hasn't finished paying" tone="waiting" />
      </div>

      <SectionHeader title="Orders" />
      <Card style={{ marginBottom: 24 }}>
        <div className="order-totals">
          <div><span className="ot-value">{stats.total}</span><span className="ot-label">Total</span></div>
          <div><span className="ot-value">{stats.active}</span><span className="ot-label">In progress</span></div>
          <div><span className="ot-value">{stats.delivered}</span><span className="ot-label">Delivered</span></div>
          <div><span className="ot-value">{stats.cancelled}</span><span className="ot-label">Cancelled</span></div>
        </div>
      </Card>

      <div className="two-col">
        <div>
          <SectionHeader title="Orders by service" />
          <Card>
            {services.map((s) => (
              <Bar key={s.id} label={s.name} count={stats.byService[s.id] ?? 0} max={maxService} />
            ))}
          </Card>
        </div>
        <div>
          <SectionHeader title="Orders by status" />
          <Card>
            {Object.keys(statusColors).map((st) => (
              <Bar key={st} label={statusColors[st].label} count={stats.byStatus[st] ?? 0} max={maxStatus} />
            ))}
          </Card>
        </div>
      </div>

      {/* Only on paper: the orders behind the numbers. */}
      <div className="print-only print-orders">
        <div className="section-title">Orders ({shown.length})</div>
        <table className="print-table">
          <thead>
            <tr>
              <th>Order no.</th>
              <th>Date placed</th>
              <th>Customer</th>
              <th>Service</th>
              <th className="num">Amount</th>
              <th>Payment</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((o) => (
              <tr key={o.id}>
                <td>{o.id}</td>
                <td>{formatDate(o.createdAt)}</td>
                <td>{o.customerName}</td>
                <td>{o.serviceName}</td>
                <td className="num">{formatPeso(o.totalAmount)}</td>
                <td>{paymentStatus(o).text}</td>
                <td>{orderStatusLabel(o)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 ? <p>No orders in this period.</p> : null}
      </div>
    </>
  );
}