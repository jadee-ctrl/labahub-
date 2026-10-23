import type { Order } from "../types";
import { statusColors } from "../theme";
import { formatDate, formatPeso } from "../format";
import { paymentStatus } from "../payment";
import { StatusBadge } from "./ui";

// Styled like a laundry claim stub: the ticket number on top, a status-coloured edge on the left.
export function OrderCard({ order, onClick, showCustomer }: { order: Order; onClick: () => void; showCustomer?: boolean }) {
  const pay = paymentStatus(order);
  const edge = statusColors[order.status]?.fg ?? "var(--border)";
  return (
    <button type="button" className="order-card" onClick={onClick} style={{ ["--edge" as string]: edge }}>
      <div className="order-top">
        <span className="order-id">{order.id}</span>
        {order.status === "delivered" ? (
          <span className="badge badge-done">Completed</span>
        ) : (
          <StatusBadge status={order.status} />
        )}
      </div>
      {showCustomer ? (
        <div className="labelled">
          <span className="labelled-label">Customer</span>
          <span className="labelled-value">{order.customerName}</span>
        </div>
      ) : null}
      <div className="order-service">{order.serviceName}</div>
      <div className="order-tear" aria-hidden="true" />
      <div className="order-bottom">
        <div className="order-pickup">
          <div className="meta-label">Pickup</div>
          <div className="meta-value">{formatDate(order.pickupDate)}</div>
        </div>
        <div className="order-amount">
          <div className="meta-label">Amount</div>
          <div className="meta-value meta-amount">{formatPeso(order.totalAmount)}</div>
        </div>
        <div className="order-pay">
          <div className="meta-label">Payment</div>
          <div className={`pay-pill pay-${pay.tone}`}>{pay.text}</div>
        </div>
      </div>
    </button>
  );
}