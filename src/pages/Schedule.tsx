import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { IoCarOutline, IoCloseCircle, IoLocationOutline, IoSearch, IoStorefrontOutline } from "react-icons/io5";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { Card, EmptyState, SectionHeader, StatusBadge } from "../components/ui";
import { formatDate, formatPeso } from "../format";
import { paymentStatus } from "../payment";
import { addDays, dayKey, daySummary, isReady, lateOrders, mapsLink, scheduleAll, scheduleFor, slotOf, stopCount, type SlotGroup } from "../schedule";
import { normalizeQuery, orderMatchesQuery } from "../orderSearch";
import type { Order } from "../types";
import { isStorePickup } from "../context/DataContext";

function Stop({ order, mine }: { order: Order; mine: boolean }) {
  const store = isStorePickup(order);
  const done = order.status === "delivered";
  const pay = paymentStatus(order);
  return (
    <div className={`stop${done ? " stop-done" : ""}`}>
      <span className={`stop-icon ${store ? "stop-icon-store" : "stop-icon-deliver"}`} aria-hidden="true">
        {store ? <IoStorefrontOutline size={20} /> : <IoCarOutline size={20} />}
      </span>
      <div className="stop-main">
        <div className="stop-top">
          <span className="stop-name">{order.customerName}</span>
          {order.status === "delivered" ? <span className="badge badge-done">Completed</span> : <StatusBadge status={order.status} />}
          {!done && !isReady(order) ? <span className="stop-flag">Not ready yet</span> : null}
        </div>
        <div className="stop-line">
          {store ? (
            <span>Customer collects at the shop</span>
          ) : (
            <a href={mapsLink(order.address)} target="_blank" rel="noopener noreferrer" className="stop-link">
              <IoLocationOutline size={15} aria-hidden="true" /> {order.address}
            </a>
          )}
        </div>
        <div className="stop-meta">
          <Link to={`/orders/${order.id}`}>{order.id}</Link>
          <span>{order.serviceName}</span>
          <span>
            {formatPeso(order.totalAmount)} · <span className={`pay-text pay-text-${pay.tone}`}>{pay.text}</span>
          </span>
          <span>{order.staffName ? (mine ? "You" : order.staffName) : "Unassigned"}</span>
        </div>
      </div>
    </div>
  );
}

const ALL = "all";

function SlotList({ groups, userId }: { groups: SlotGroup[]; userId?: string }) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.slot} className="slot-block">
          <div className="slot-time">{g.slot}</div>
          <Card className="slot-card">
            {[...g.deliveries, ...g.storePickups].map((o) => (
              <Stop key={o.id} order={o} mine={o.staffId === userId} />
            ))}
          </Card>
        </div>
      ))}
    </>
  );
}

export default function Schedule() {
  const { user } = useAuth();
  const { orders, loading } = useData();
  const today = dayKey(new Date());
  const [view, setView] = useState<string>(today); // "all" or a day "YYYY-MM-DD"
  const [query, setQuery] = useState("");
  const searching = normalizeQuery(query).length > 0;

  const searched = useMemo(() => orders.filter((o) => orderMatchesQuery(o, query)), [orders, query]);
  const allDays = useMemo(() => scheduleAll(searched, today), [searched, today]);
  const groups = useMemo(() => (view === ALL ? allDays.flatMap((d) => d.groups) : scheduleFor(searched, view)), [searched, view, allDays]);
  const late = useMemo(() => (view === ALL ? [] : lateOrders(searched, today)), [searched, today, view]);
  const sum = daySummary(groups);

  const chips = [
    { key: ALL, label: "All", count: allDays.reduce((n, d) => n + stopCount(d.groups), 0) },
    ...[0, 1, 2].map((i) => {
      const key = addDays(today, i);
      return { key, label: i === 0 ? "Today" : i === 1 ? "Tomorrow" : formatWeekday(key), count: stopCount(scheduleFor(searched, key)) };
    }),
  ];
  const pickedOther = view !== ALL && !chips.some((c) => c.key === view);
  const titleFor = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric" });
  };
  const subFor = (key: string) => {
    if (key === today) return "Today";
    const [y, m, d] = key.split("-").map(Number);
    return (key < today ? "Past · " : "") + formatDate(new Date(y, m - 1, d).toISOString());
  };
  const emptyText = searching
    ? { title: "No matching schedules", subtitle: `Nothing matches "${query.trim()}" here. Check the spelling or clear the search.` }
    : { title: "Nothing scheduled", subtitle: view === ALL ? "No upcoming deliveries or store pickups." : "No deliveries or store pickups on this day." };

  return (
    <>
      <h1 className="page-title">Schedule</h1>
      <p className="page-sub">Deliveries and store pickups, by the time the customer chose.</p>

      <div className="orders-toolbar">
        <label className="search-box">
          <IoSearch size={18} aria-hidden="true" />
          <span className="visually-hidden">Search schedules</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, phone, address or order no."
            autoComplete="off"
          />
          {query ? (
            <button type="button" className="search-clear" onClick={() => setQuery("")} aria-label="Clear search">
              <IoCloseCircle size={18} />
            </button>
          ) : null}
        </label>

        <div className="schedule-bar">
          <div className="filter-tabs" role="tablist" aria-label="Day">
            {chips.map((c) => (
              <button
                key={c.key}
                type="button"
                role="tab"
                aria-selected={view === c.key}
                className={`filter-tab${view === c.key ? " filter-tab-active" : ""}`}
                onClick={() => setView(c.key)}
              >
                {c.label}
                <span className="filter-count">{loading ? "–" : c.count}</span>
              </button>
            ))}
          </div>
          <label className={`schedule-date${pickedOther ? " schedule-date-active" : ""}`}>
            <span className="visually-hidden">Pick a date</span>
            <input type="date" className="input" value={view === ALL ? "" : view} onChange={(e) => e.target.value && setView(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{loading ? "–" : sum.deliveries}</div>
          <div className="stat-label">Deliveries</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{loading ? "–" : sum.storePickups}</div>
          <div className="stat-label">Store pickups</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{loading ? "–" : sum.notReady}</div>
          <div className="stat-label">Not ready yet</div>
        </div>
      </div>

      {view === ALL ? (
        allDays.length === 0 ? (
          <Card style={{ marginBottom: 24 }}>
            <EmptyState title={loading ? "Loading…" : emptyText.title} subtitle={loading ? undefined : emptyText.subtitle} />
          </Card>
        ) : (
          allDays.map((d) => (
            <section key={d.key} className="schedule-day">
              <SectionHeader title={titleFor(d.key)} subtitle={subFor(d.key)} />
              <SlotList groups={d.groups} userId={user?.id} />
            </section>
          ))
        )
      ) : (
        <>
          <SectionHeader title={titleFor(view)} subtitle={subFor(view)} />
          {groups.length === 0 ? (
            <Card style={{ marginBottom: 24 }}>
              <EmptyState title={loading ? "Loading…" : emptyText.title} subtitle={loading ? undefined : emptyText.subtitle} />
            </Card>
          ) : (
            <SlotList groups={groups} userId={user?.id} />
          )}
        </>
      )}

      {late.length > 0 ? (
        <>
          <SectionHeader title={`Late (${late.length})`} subtitle="The chosen date has passed and the order isn't finished." />
          <Card className="slot-card late-card">
            {late.map((o) => (
              <div key={o.id}>
                <div className="late-when">
                  Was due {formatDate(o.pickupDate)} · {slotOf(o)}
                </div>
                <Stop order={o} mine={o.staffId === user?.id} />
              </div>
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}

function formatWeekday(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", { weekday: "long" });
}