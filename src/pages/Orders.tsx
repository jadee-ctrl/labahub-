import { useMemo, useState } from "react";
import { IoCloseCircle, IoSearch } from "react-icons/io5";
import { useData } from "../context/DataContext";
import { Card, EmptyState } from "../components/ui";
import { OrdersTable } from "../components/OrdersTable";
import { ORDER_FILTERS, matchesFilter, normalizeQuery, orderMatchesQuery, type OrderFilter } from "../orderSearch";

export default function Orders() {
  const { orders, loading } = useData();
  const [filter, setFilter] = useState<OrderFilter>("All");
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [orders]);
  // Counts follow the search, so staff can see where the matches are.
  const searched = useMemo(() => sorted.filter((o) => orderMatchesQuery(o, query)), [sorted, query]);
  const counts = useMemo(
    () => Object.fromEntries(ORDER_FILTERS.map((f) => [f, searched.filter((o) => matchesFilter(o, f)).length])) as Record<OrderFilter, number>,
    [searched]
  );
  const filtered = useMemo(() => searched.filter((o) => matchesFilter(o, filter)), [searched, filter]);
  const searching = normalizeQuery(query).length > 0;

  return (
    <>
      <h1 className="page-title">All orders</h1>

      <div className="orders-toolbar">
        <label className="search-box">
          <IoSearch size={18} aria-hidden="true" />
          <span className="visually-hidden">Search orders</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search order no., customer, phone, service or status"
            autoComplete="off"
          />
          {query ? (
            <button type="button" className="search-clear" onClick={() => setQuery("")} aria-label="Clear search">
              <IoCloseCircle size={18} />
            </button>
          ) : null}
        </label>

        <div className="filter-tabs" role="tablist" aria-label="Filter orders">
          {ORDER_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              className={`filter-tab${filter === f ? " filter-tab-active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f}
              <span className="filter-count">{loading ? "–" : counts[f]}</span>
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          {searching ? (
            <EmptyState title="No matching orders" subtitle={`Nothing matches "${query.trim()}" here. Check the spelling or clear the search.`} />
          ) : (
            <EmptyState title={loading ? "Loading orders…" : "No orders here"} subtitle={loading ? undefined : "Orders in this group will appear here."} />
          )}
        </Card>
      ) : (
        <OrdersTable orders={filtered} />
      )}
    </>
  );
}
