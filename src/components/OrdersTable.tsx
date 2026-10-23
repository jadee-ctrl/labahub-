import { useNavigate } from "react-router-dom";
import type { Order } from "../types";
import { statusColors } from "../theme";
import { formatDate, formatPeso } from "../format";
import { paymentStatus } from "../payment";
import { StatusBadge } from "./ui";

// The Orders page as a table: one row per order, the whole row opens the order.
export function OrdersTable({ orders }: { orders: Order[] }) {
  const navigate = useNavigate();
  return (
    <div className="table-wrap">
      <table className="orders-table">
        <thead>
          <tr>
            <th scope="col">Order no.</th>
            <th scope="col">Customer</th>
            <th scope="col">Service</th>
            <th scope="col">Pickup</th>
            <th scope="col" className="col-num">Amount</th>
            <th scope="col">Payment</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const pay = paymentStatus(o);
            const open = () => navigate(`/orders/${o.id}`);
            return (
              <tr
                key={o.id}
                className="orders-row"
                style={{ ["--edge" as string]: statusColors[o.status]?.fg ?? "var(--border)" }}
                onClick={open}
              >
                <td className="cell-id">
                  {/* A real link, so keyboard users and "open in new tab" work too. */}
                  <a
                    href={`/orders/${o.id}`}
                    className="order-id"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      open();
                    }}
                  >
                    {o.id}
                  </a>
                </td>
                <td className="cell-customer">
                  <div className="cell-strong">{o.customerName}</div>
                  {o.customerPhone ? <div className="cell-sub">{o.customerPhone}</div> : null}
                </td>
                <td className="cell-service">
                  <div className="cell-strong">{o.serviceName}</div>
                  <div className="cell-sub">
                    {o.estimatedWeightKg} {o.serviceUnit === "per item" ? "item(s)" : "kg"}
                  </div>
                </td>
                <td className="cell-pickup">
                  <div className="cell-strong">{formatDate(o.pickupDate)}</div>
                  <div className="cell-sub">{o.pickupSlot || o.deliverySlot || ""}</div>
                </td>
                <td className="col-num cell-amount">{formatPeso(o.totalAmount)}</td>
                <td className="cell-pay">
                  <span className={`pay-pill pay-${pay.tone}`}>{pay.text}</span>
                </td>
                <td className="cell-status">
                  {o.status === "delivered" ? <span className="badge badge-done">Completed</span> : <StatusBadge status={o.status} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}