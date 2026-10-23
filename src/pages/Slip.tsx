import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import { isStorePickup, useData } from "../context/DataContext";
import { SHOP, canPrintReceipt, receiptLine, receiptPayment, receiptTime } from "../receipt";

// Order receipt, printed when the laundry is Ready and attached to the bag.
// Narrow (80 mm) like a store receipt; also prints fine on A4/Letter.
export default function Slip() {
  const { id } = useParams<{ id: string }>();
  const { orders, loading } = useData();
  const order = orders.find((o) => o.id === id);
  const allowed = !!order && canPrintReceipt(order);
  const [qr, setQr] = useState<string | null>(null);
  const [printedAt] = useState(() => new Date());
  const printed = useRef(false);

  useEffect(() => {
    if (!order || !allowed) return;
    let alive = true;
    QRCode.toDataURL(order.id, { margin: 1, width: 240, errorCorrectionLevel: "M" })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [order, allowed]);

  // Open the print window once the receipt (and its QR code) is ready.
  useEffect(() => {
    if (!allowed || !qr || printed.current) return;
    printed.current = true;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [allowed, qr]);

  if (!order) return <p className="receipt-message">{loading ? "Loading…" : "Order not found."}</p>;
  if (!allowed) {
    return (
      <p className="receipt-message">
        This order isn't ready yet, so a receipt can't be printed. Receipts are available once the order is marked Ready.
      </p>
    );
  }

  const store = isStorePickup(order);
  const line = receiptLine(order);
  const pay = receiptPayment(order);
  const rows: [string, string][] = [
    ["Order no.", order.id],
    ["Printed", printedAt.toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })],
    ["Customer", order.customerName],
    ["Phone", order.customerPhone || "—"],
    ["Type", store ? "Store pickup" : "Delivery"],
    ...(store ? [] : ([["Deliver to", order.address]] as [string, string][])),
    [store ? "Pickup" : "Delivery", receiptTime(order)],
  ];

  return (
    <div className="receipt-page">
      <article className="receipt" aria-label={`Receipt for order ${order.id}`}>
        <header className="receipt-shop">
          <div className="receipt-shop-name">{SHOP.name}</div>
          <div>{SHOP.address}</div>
          <div>Tel: {SHOP.phone}</div>
        </header>
        <hr />
        <div className="receipt-title">ORDER RECEIPT</div>
        <dl className="receipt-rows">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <hr />
        <div className="receipt-item">
          <div className="receipt-item-name">{order.serviceName}</div>
          <div className="receipt-item-line">
            <span>
              {line.qty} x {line.price}
            </span>
            <span>{line.amount}</span>
          </div>
        </div>
        <hr />
        <div className="receipt-total">
          <span>TOTAL</span>
          <span>{line.amount}</span>
        </div>
        <dl className="receipt-rows">
          <div>
            <dt>Payment</dt>
            <dd>{pay.method}</dd>
          </div>
        </dl>
        <div className={`receipt-callout${pay.paid ? " receipt-callout-paid" : ""}`}>** {pay.callout} **</div>
        <hr />
        <footer className="receipt-foot">
          {qr ? <img className="receipt-qr" src={qr} alt="QR code with the order number" /> : <div className="receipt-qr" />}
          <div className="receipt-foot-id">{order.id}</div>
          <div>Thank you for choosing LabaHub!</div>
        </footer>
      </article>

      <div className="receipt-toolbar no-print">
        <span>Attach the receipt to the laundry bag or plastic.</span>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Print
        </button>
      </div>
    </div>
  );
}