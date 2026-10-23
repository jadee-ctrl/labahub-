import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { IoChevronBack, IoPrintOutline } from "react-icons/io5";
import { useAuth } from "../context/AuthContext";
import { nextStatus, useData } from "../context/DataContext";
import { Banner, Button, Card, Divider, SectionHeader, StatusBadge, useConfirmAction } from "../components/ui";
import { ProgressTimeline } from "../components/ProgressTimeline";
import { statusColors } from "../theme";
import { canPrintReceipt } from "../receipt";
import { formatDate, formatDateTime, formatPeso } from "../format";
import {
  canCollectBalanceCash, canMarkCashReceived, canRefund, canRefundDifference, canSetQuantity, isOnline, isPerItem, methodLabel, orderBalance,
  paymentStatus, quantityText, weightOutcome,
} from "../payment";

function Row({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value" style={grow ? { flex: 1, textAlign: "right" } : undefined}>
        {children}
      </span>
    </div>
  );
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { orders, advanceStatus, claimOrder, markPaid, setActualQuantity, markBalancePaid, refundDifference, refundOrder, checkRefund, loading } = useData();
  const { ask, dialog, errorBanner } = useConfirmAction();
  const order = orders.find((o) => o.id === id);
  const [qtyText, setQtyText] = useState("");
  const [qtyError, setQtyError] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [checking, setChecking] = useState(false);

  const back = (
    <Link to="/orders" className="back-link">
      <IoChevronBack size={20} /> Orders
    </Link>
  );

  if (!order || !user) {
    return (
      <>
        {back}
        <p>{loading ? "Loading…" : "Order not found."}</p>
      </>
    );
  }

  const upcoming = nextStatus(order);
  const isFinished = order.status === "delivered" || order.status === "cancelled";
  const isMine = order.staffId === user.id;
  const upcomingLabel = upcoming ? statusColors[upcoming]?.label ?? upcoming : "";
  const pay = paymentStatus(order);
  const phoneHref = order.customerPhone ? `tel:${order.customerPhone.replace(/[^\d+]/g, "")}` : null;
  const perItem = isPerItem(order);
  const unitWord = perItem ? "item(s)" : "kg";
  const showQtyForm = canSetQuantity(order, user.id);
  const balance = orderBalance(order);
  const paidSoFar = order.totalAmount - balance;

  const submitQuantity = (e: FormEvent) => {
    e.preventDefault();
    const qty = Number(qtyText.replace(",", "."));
    if (!qtyText.trim() || !Number.isFinite(qty) || qty <= 0 || qty > 1000) {
      setQtyError(perItem ? "Enter the number of items (1 to 1000)." : "Enter the weight in kg (more than 0, up to 1000).");
      return;
    }
    setQtyError("");
    const shown = quantityText(order, perItem ? Math.max(1, Math.round(qty)) : qty);
    ask({
      title: perItem ? "Save item count" : "Save actual weight",
      message: `Save ${shown} for order ${order.id}? ${weightOutcome(order, qty).text} The customer is notified. You can still correct it until the order is marked Washing.`,
      confirmLabel: "Save",
      run: async () => {
        await setActualQuantity(order.id, qty);
        setQtyText("");
        setNotice({ kind: "success", text: `Saved ${shown}.` });
      },
    });
  };

  const startRefund = () =>
    ask({
      title: "Cancel and refund",
      message: `Cancel order ${order.id} and refund ${formatPeso(order.totalAmount)} to the customer through PayMongo? This can't be undone.`,
      confirmLabel: "Cancel and refund",
      run: async () => {
        const r = await refundOrder(order.id);
        setNotice({
          kind: "success",
          text: r.transferLink
            ? "Refund started. QR Ph refunds must be claimed: send the customer the refund link shown below."
            : r.status === "succeeded"
            ? "Refund sent."
            : "Refund started. PayMongo usually finishes e-wallet refunds within a day.",
        });
      },
    });

  const refreshRefund = async () => {
    setChecking(true);
    try {
      const st = await checkRefund(order.id);
      setNotice({ kind: "info", text: st === "succeeded" ? "Refund completed." : `Refund is still ${st}.` });
    } catch (e) {
      setNotice({ kind: "error", text: e instanceof Error ? e.message : "Could not check the refund." });
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      {back}
      {errorBanner}
      {notice ? (
        <Banner kind={notice.kind} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Banner>
      ) : null}
      <div className="detail-title-row">
        <h1 className="page-title">{order.id}</h1>
        {canPrintReceipt(order) ? (
          <a className="btn btn-secondary slip-btn" href={`/orders/${encodeURIComponent(order.id)}/receipt`} target="_blank" rel="noopener">
            <IoPrintOutline size={18} aria-hidden="true" /> Print receipt
          </a>
        ) : null}
      </div>

      <div className="detail-grid">
        <div>
          <Card style={{ marginBottom: 16 }}>
            <div className="detail-header">
              <div>
                <div className="detail-service">{order.serviceName}</div>
                <div className="detail-meta">{order.customerName}</div>
              </div>
              <StatusBadge status={order.status} />
            </div>
            <Divider />
            <Row label="Customer phone">
              {phoneHref ? (
                <a href={phoneHref} className="phone-link">
                  {order.customerPhone}
                </a>
              ) : (
                "Not given"
              )}
            </Row>
            <Row label="Pickup">
              {formatDate(order.pickupDate)}
              {order.pickupSlot ? ` · ${order.pickupSlot}` : ""}
            </Row>
            {order.deliverySlot ? <Row label="Delivery window">{order.deliverySlot}</Row> : null}
            <Row label="Address" grow>
              {order.address}
            </Row>
            {order.instructions ? (
              <Row label="Instructions" grow>
                {order.instructions}
              </Row>
            ) : null}
            <Row label="Assigned staff">{order.staffName ?? "Unassigned"}</Row>
          </Card>

          <SectionHeader title="Payment" />
          <Card style={{ marginBottom: 16 }}>
            <Row label={order.actualQuantity ? "Estimated" : "Load"}>
              {order.estimatedWeightKg} {unitWord} × {formatPeso(order.servicePrice)}
            </Row>
            {order.actualQuantity ? (
              <Row label={perItem ? "Actual count" : "Actual weight"}>
                {quantityText(order, order.actualQuantity)}
                {order.weighedAt ? <span className="muted-inline"> · {formatDateTime(order.weighedAt)}</span> : null}
              </Row>
            ) : null}
            {showQtyForm ? (
              <form className="qty-form" onSubmit={submitQuantity} noValidate>
                <label className="qty-label" htmlFor="actual-qty">
                  {perItem ? "Actual item count" : "Actual weight (kg)"}
                </label>
                <div className="qty-row">
                  <input
                    id="actual-qty"
                    className={`input${qtyError ? " input-error" : ""}`}
                    inputMode="decimal"
                    placeholder={perItem ? "e.g. 5" : "e.g. 4.5"}
                    value={qtyText}
                    onChange={(e) => setQtyText(e.target.value)}
                    aria-invalid={!!qtyError}
                  />
                  <Button type="submit" label={order.actualQuantity ? "Update" : "Save"} variant="secondary" fullWidth={false} />
                </div>
                {qtyError ? <span className="field-error">{qtyError}</span> : null}
                <span className="field-hint">
                  The total is recalculated at the booked price ({formatPeso(order.servicePrice)} {order.serviceUnit}) and the customer is notified.
                  This locks once the order is marked Washing.
                </span>
              </form>
            ) : null}
            <Row label="Method">{methodLabel(order)}</Row>
            <Divider />
            <div className="info-row">
              <span className="total-label">Total</span>
              <span className="total-value">{formatPeso(order.totalAmount)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">Status</span>
              <span className={`pay-pill pay-${pay.tone}`}>{pay.text}</span>
            </div>
            {order.paymentStatus === "paid" && order.paidAt ? <Row label="Paid on">{formatDateTime(order.paidAt)}</Row> : null}
            {order.paymentStatus === "paid" && (balance !== 0 || order.balanceStatus === "paid" || order.adjustRefundStatus) ? (
              <div className="refund-box">
                <Row label="Paid so far">{formatPeso(paidSoFar)}</Row>
                {order.balanceStatus === "paid" ? (
                  <Row label="Balance paid">
                    {formatPeso(order.balancePaidAmount ?? 0)} · {order.balanceMethod === "cash" ? "cash at the store" : "online"}
                  </Row>
                ) : null}
                {order.adjustRefundStatus ? (
                  <Row label="Difference refund">
                    {formatPeso(order.adjustRefundAmount ?? 0)} · {order.adjustRefundStatus === "succeeded" ? "refunded" : order.adjustRefundStatus === "failed" ? "failed" : "in progress"}
                  </Row>
                ) : null}
                {balance > 0 ? (
                  <Row label="Balance due">
                    <span className="balance-due">{formatPeso(balance)}</span>
                  </Row>
                ) : null}
                {balance > 0 && !canCollectBalanceCash(order) && order.status !== "cancelled" ? (
                  <p className="pay-note">
                    {order.balanceStatus === "pending" || order.balanceStatus === "failed"
                      ? "The customer has started paying the balance in the app. It updates by itself once PayMongo confirms it."
                      : "Delivery order: the customer pays the balance in the LabaHub app. It updates by itself once PayMongo confirms it."}
                  </p>
                ) : null}
                {balance < 0 ? (
                  <Row label="Overpaid">
                    <span className="balance-over">{formatPeso(-balance)}</span>
                  </Row>
                ) : null}
              </div>
            ) : null}
            {canCollectBalanceCash(order) && (
              <Button
                label={`Mark balance received (${formatPeso(balance)} cash)`}
                variant="secondary"
                style={{ marginTop: 8 }}
                onClick={() =>
                  ask({
                    title: "Balance received",
                    message: `Confirm you received the balance of ${formatPeso(balance)} in cash for order ${order.id}?`,
                    confirmLabel: "Confirm",
                    run: () => markBalancePaid(order.id),
                  })
                }
              />
            )}
            {canRefundDifference(order) && (
              <Button
                label={`Refund difference (${formatPeso(-balance)})`}
                variant="secondary"
                style={{ marginTop: 8 }}
                onClick={() =>
                  ask({
                    title: "Refund the difference",
                    message: `The laundry weighed less than what was paid. Refund ${formatPeso(-balance)} to the customer through PayMongo? The order continues normally.`,
                    confirmLabel: "Refund",
                    run: async () => {
                      await refundDifference(order.id);
                      setNotice({ kind: "success", text: `Refund of ${formatPeso(-balance)} started.` });
                    },
                  })
                }
              />
            )}
            {isOnline(order) && order.paymentStatus === "unpaid" && order.status !== "cancelled" ? (
              <p className="pay-note">The customer pays in the LabaHub app. This updates by itself once PayMongo confirms the payment.</p>
            ) : null}
            {order.refundStatus ? (
              <div className="refund-box">
                <Row label="Refund">{order.refundAmount != null ? formatPeso(order.refundAmount) : "—"}</Row>
                {order.refundedAt ? <Row label="Refunded on">{formatDateTime(order.refundedAt)}</Row> : null}
                {order.refundTransferLink && order.refundStatus !== "succeeded" ? (
                  <p className="pay-note">
                    QR Ph refund: the customer must open this link to claim it.{" "}
                    <a href={order.refundTransferLink} target="_blank" rel="noopener noreferrer">
                      Refund link
                    </a>{" "}
                    <button type="button" className="link-btn" onClick={() => void navigator.clipboard?.writeText(order.refundTransferLink!)}>
                      Copy
                    </button>
                  </p>
                ) : null}
                {order.refundStatus !== "succeeded" ? (
                  <Button label="Check refund status" variant="ghost" loading={checking} onClick={() => void refreshRefund()} style={{ marginTop: 4 }} />
                ) : null}
              </div>
            ) : null}
            {canRefund(order) && (
              <Button
                label={order.refundStatus === "failed" ? "Try the refund again" : order.status === "cancelled" ? "Refund this payment" : "Cancel order and refund"}
                variant="danger"
                style={{ marginTop: 8 }}
                onClick={startRefund}
              />
            )}
            {canMarkCashReceived(order) && (
              <Button
                label="Mark cash received"
                variant="secondary"
                style={{ marginTop: 8 }}
                onClick={() =>
                  ask({
                    title: "Cash received",
                    message: `Confirm you received ${formatPeso(order.totalAmount)} in cash for order ${order.id}?`,
                    confirmLabel: "Confirm",
                    run: () => markPaid(order.id),
                  })
                }
              />
            )}
          </Card>
        </div>

        <div>
          <SectionHeader title="Order progress" />
          <Card style={{ marginBottom: 16 }}>
            <ProgressTimeline order={order} />
          </Card>

          {!order.staffId && !isFinished && (
            <Button
              label="Accept this order"
              onClick={() =>
                ask({
                  title: "Accept order",
                  message: "Assign this order to yourself?",
                  confirmLabel: "Accept",
                  run: () => claimOrder(order.id),
                })
              }
            />
          )}
          {order.staffId && isMine && !isFinished && upcoming && (
            <Button
              label={`Mark as ${upcomingLabel}`}
              onClick={() =>
                ask({
                  title: "Update status",
                  message: `Mark order ${order.id} as "${upcomingLabel}"?`,
                  confirmLabel: "Confirm",
                  run: () => advanceStatus(order.id),
                })
              }
            />
          )}
          {order.staffId && !isMine && !isFinished && <p className="not-mine">This order is assigned to {order.staffName}.</p>}
        </div>
      </div>
      {dialog}
    </>
  );
}
