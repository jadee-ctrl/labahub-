import type { Order } from "../types";
import { colors, ORDER_STEPS, statusColors } from "../theme";
import { formatDateTime } from "../format";
import { isStorePickup } from "../context/DataContext";

export function ProgressTimeline({ order }: { order: Order }) {
  const progress = order.progress ?? [];

  if (order.status === "cancelled") {
    const last = progress[progress.length - 1];
    return (
      <div className="cancelled-text">
        {last ? `This order was cancelled on ${formatDateTime(last.timestamp)}.` : "This order has been cancelled."}
      </div>
    );
  }

  const storePickup = isStorePickup(order);
  const steps = ORDER_STEPS.filter((s) => !(storePickup && s === "out_for_delivery"));
  const currentIndex = steps.indexOf(order.status);
  const eventByStatus = new Map<string, string>(progress.map((p) => [String(p.status), String(p.timestamp)]));

  const label = (step: string) => {
    if (step === "ready") return storePickup ? "Ready to Pick Up at Store" : "Ready to Pick Up for Delivery";
    if (step === "delivered") return "Completed";
    return statusColors[step]?.label ?? step;
  };

  // Same step colours as the mobile app.
  const stepColor = (step: string) => {
    switch (step) {
      case "pending":
      case "confirmed":
      case "picked_up":
      case "washing":
        return "#2E9E5B";
      case "ready":
        return "#F59E0B";
      case "out_for_delivery":
      case "delivered":
        return "#9CA3AF";
      default:
        return colors.border;
    }
  };

  return (
    <div>
      {steps.map((step, idx) => {
        const done = currentIndex >= 0 && idx <= currentIndex;
        const isLast = idx === steps.length - 1;
        const ts = eventByStatus.get(step);
        const c = stepColor(step);
        return (
          <div key={step} className="tl-row">
            <div className="tl-rail">
              <div className="tl-dot" style={{ background: done ? c : colors.border }} />
              {!isLast && <div className="tl-line" style={{ background: currentIndex >= 0 && idx < currentIndex ? c : colors.border }} />}
            </div>
            <div className="tl-text">
              <div className="tl-label" style={{ color: done ? c : colors.textFaint }}>
                {label(step)}
              </div>
              <div className={ts ? "tl-time" : "tl-time tl-time-pending"}>{ts ? formatDateTime(ts) : done ? "Completed" : "Pending"}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
