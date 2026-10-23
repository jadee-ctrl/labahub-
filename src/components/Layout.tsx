import { useEffect } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { IoBarChartOutline, IoCalendarOutline, IoCubeOutline, IoGridOutline, IoLogOutOutline, IoNotificationsOutline, IoPersonOutline, IoPricetagsOutline } from "react-icons/io5";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { Avatar, useConfirmAction } from "./ui";

// The phone's bottom tabs become a left sidebar on a computer
// (and go back to a bottom tab bar on narrow screens).
const NAV = [
  { to: "/dashboard", label: "Dashboard", Icon: IoGridOutline },
  { to: "/orders", label: "Orders", Icon: IoCubeOutline },
  { to: "/schedule", label: "Schedule", Icon: IoCalendarOutline },
  { to: "/reports", label: "Reports", Icon: IoBarChartOutline },
  { to: "/services", label: "Services", Icon: IoPricetagsOutline },
  { to: "/notifications", label: "Alerts", Icon: IoNotificationsOutline },
  { to: "/profile", label: "Profile", Icon: IoPersonOutline },
];

const formatCount = (n: number) => (n > 99 ? "99+" : String(n));

export function Layout() {
  const { user, logout } = useAuth();
  const { unreadCountFor, newOrderCount, loading, error } = useData();
  const navigate = useNavigate();
  const { ask, dialog } = useConfirmAction();
  const unreadAlerts = user ? unreadCountFor(user.id) : 0;

  // Orders badge: hidden while loading and when there are none; "!" if the orders couldn't be loaded.
  const ordersBadge: { text: string; label: string; tone: "alert" | "muted" } | null = error
    ? { text: "!", label: "orders could not be loaded", tone: "muted" }
    : loading || newOrderCount === 0
    ? null
    : { text: formatCount(newOrderCount), label: `${newOrderCount} new ${newOrderCount === 1 ? "order needs" : "orders need"} attention`, tone: "alert" };

  // Browser tab title shows the count too, e.g. "(3) LabaHub Staff".
  useEffect(() => {
    document.title = !error && !loading && newOrderCount > 0 ? `(${newOrderCount}) LabaHub Staff` : "LabaHub Staff";
    return () => {
      document.title = "LabaHub Staff";
    };
  }, [newOrderCount, loading, error]);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.png" alt="" className="brand-logo" />
          <div>
            <div className="brand-title">LabaHub</div>
            <div className="brand-sub">Staff</div>
          </div>
        </div>

        <nav className="nav" aria-label="Main">
          {NAV.map(({ to, label, Icon }) => {
            const isOrders = to === "/orders";
            const showAlertsDot = to === "/notifications" && unreadAlerts > 0;
            return (
              <NavLink
                key={to}
                to={to}
                end={isOrders ? false : undefined}
                className={({ isActive }) => `nav-item${isActive ? " nav-active" : ""}`}
                aria-label={isOrders && ordersBadge ? `${label}, ${ordersBadge.label}` : showAlertsDot ? `${label}, ${unreadAlerts} unread` : label}
              >
                <span className="nav-icon">
                  <Icon size={22} />
                  {showAlertsDot ? <span className="nav-badge nav-badge-corner nav-badge-narrow">{formatCount(unreadAlerts)}</span> : null}
                  {isOrders && ordersBadge ? (
                    <span className={`nav-badge nav-badge-corner nav-badge-narrow${ordersBadge.tone === "muted" ? " nav-badge-muted" : ""}`}>{ordersBadge.text}</span>
                  ) : null}
                </span>
                <span className="nav-label">{label}</span>
                {isOrders && ordersBadge ? (
                  <span
                    className={`pill-badge${ordersBadge.tone === "muted" ? " pill-badge-muted" : ""}`}
                    title={ordersBadge.label}
                    aria-hidden="true"
                  >
                    {ordersBadge.text}
                  </span>
                ) : null}
                {showAlertsDot ? (
                  <span className="pill-badge" title={`${unreadAlerts} unread`} aria-hidden="true">
                    {formatCount(unreadAlerts)}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </nav>

        {user ? (
          <div className="account">
            <Link to="/profile" className="account-card" title="View and edit your profile">
              <Avatar name={user.name || user.email} path={user.avatarPath} size={44} />
              <span className="account-text">
                <span className="account-name">{user.name || user.email}</span>
                <span className="account-role">Staff</span>
              </span>
            </Link>
            <button
              type="button"
              className="logout-btn"
              aria-label="Log out"
              title="Log out"
              onClick={() =>
                ask({
                  title: "Log out",
                  message: "Are you sure you want to log out?",
                  confirmLabel: "Log out",
                  run: async () => {
                    await logout();
                    navigate("/login", { replace: true });
                  },
                })
              }
            >
              <IoLogOutOutline size={22} />
            </button>
          </div>
        ) : null}
      </aside>

      <main className="content">
        <div className="content-inner">
          {error ? (
            <div className="error-banner" role="alert">
              Could not load data: {error}
            </div>
          ) : null}
          <Outlet />
        </div>
      </main>
      {dialog}
    </div>
  );
}
