import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { Card, EmptyState } from "../components/ui";
import { colors } from "../theme";
import { timeAgo } from "../format";

const ICON_BG: Record<string, string> = {
  order_update: colors.infoLight,
  assignment: colors.primaryLight,
  payment: colors.successLight,
  system: colors.border,
};

export default function Notifications() {
  const { user } = useAuth();
  const { notificationsFor, markNotificationRead, markAllNotificationsRead } = useData();
  const navigate = useNavigate();
  const notifs = user ? notificationsFor(user.id) : [];
  const unreadCount = notifs.filter((n) => !n.read).length;

  // Same behaviour as the mobile app: opening the screen marks everything as read after a moment.
  useEffect(() => {
    if (!user || unreadCount === 0) return;
    const t = setTimeout(() => void markAllNotificationsRead(user.id), 1200);
    return () => clearTimeout(t);
  }, [user, unreadCount, markAllNotificationsRead]);

  return (
    <>
      <h1 className="page-title">Notifications</h1>
      {notifs.length === 0 ? (
        <Card>
          <EmptyState title="Nothing new" subtitle="New bookings, cancellations, payments and refunds will appear here." />
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {notifs.map((n, idx) => (
            <div key={n.id}>
              <button
                type="button"
                className={`notif-row${n.read ? "" : " notif-unread"}`}
                onClick={() => {
                  void markNotificationRead(n.id);
                  if (n.orderId) navigate(`/orders/${n.orderId}`);
                }}
              >
                <span className="notif-dot" style={{ background: ICON_BG[n.type] ?? colors.border }} />
                <span style={{ flex: 1 }}>
                  <span className="notif-title">{n.title}</span>
                  <span className="notif-message">{n.message}</span>
                  <span className="notif-time">{timeAgo(n.createdAt)}</span>
                </span>
                {!n.read && <span className="notif-unread-dot" />}
              </button>
              {idx < notifs.length - 1 && <div className="notif-divider" />}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}