import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { Button, Card, EmptyState, SectionHeader, useConfirmAction } from "../components/ui";
import { OrderCard } from "../components/OrderCard";

export default function Dashboard() {
  const { user } = useAuth();
  const { orders, claimOrder, loading } = useData();
  const navigate = useNavigate();
  const { ask, dialog, errorBanner } = useConfirmAction();

  const unassigned = useMemo(() => orders.filter((o) => !o.staffId && o.status === "pending"), [orders]);
  const myActive = useMemo(
    () => (user ? orders.filter((o) => o.staffId === user.id && o.status !== "delivered" && o.status !== "cancelled") : []),
    [orders, user]
  );
  const completedToday = useMemo(() => {
    if (!user) return 0;
    const today = new Date().toDateString();
    return orders.filter((o) => o.staffId === user.id && o.status === "delivered" && new Date(o.updatedAt).toDateString() === today).length;
  }, [orders, user]);

  if (!user) return null;
  const firstName = (user.name || "there").split(" ")[0];

  return (
    <>
      {errorBanner}
      <h1 className="page-title">Hi, {firstName}</h1>
      <p className="page-sub">Here's what needs you today.</p>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{loading ? "–" : unassigned.length}</div>
          <div className="stat-label">Unassigned</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{loading ? "–" : myActive.length}</div>
          <div className="stat-label">My active jobs</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{loading ? "–" : completedToday}</div>
          <div className="stat-label">Done today</div>
        </div>
      </div>

      <SectionHeader title="Unassigned orders" subtitle="Accept an order to start working on it" />
      {unassigned.length === 0 ? (
        <Card style={{ marginBottom: 20 }}>
          <EmptyState title={loading ? "Loading orders…" : "Nothing waiting"} subtitle={loading ? undefined : "All incoming orders have been assigned."} />
        </Card>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {unassigned.map((order) => (
            <Card key={order.id} style={{ marginBottom: 12 }}>
              <div className="claim-row">
                <div style={{ flex: 1 }}>
                  <div className="claim-id">{order.id}</div>
                  <div className="labelled">
                    <span className="labelled-label">Customer</span>
                    <span className="labelled-value">{order.customerName}</span>
                  </div>
                  <div className="claim-service">{order.serviceName}</div>
                  <div className="claim-meta">
                    <span>{order.pickupSlot ? `Pickup ${order.pickupSlot}` : `Delivery ${order.deliverySlot}`}</span>
                  </div>
                </div>
                <Button
                  label="Accept"
                  fullWidth={false}
                  onClick={() =>
                    ask({
                      title: "Accept order",
                      message: `Assign order ${order.id} to yourself?`,
                      confirmLabel: "Accept",
                      run: () => claimOrder(order.id),
                    })
                  }
                />
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionHeader title="My active jobs" />
      {myActive.length === 0 ? (
        <Card>
          <EmptyState title="No active jobs" subtitle="Accept an order above to get started." />
        </Card>
      ) : (
        <div className="order-grid">
          {myActive.map((order) => (
            <OrderCard key={order.id} order={order} showCustomer onClick={() => navigate(`/orders/${order.id}`)} />
          ))}
        </div>
      )}
      {dialog}
    </>
  );
}