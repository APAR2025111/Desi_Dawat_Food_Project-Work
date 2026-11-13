import React, { useEffect, useState } from "react";
import { getCustomerOrders, getCustomerOrderReceiptPdf } from "../api.js";
import { useCustomerAccount } from "../CustomerAccount.jsx";

const orderDate = new Intl.DateTimeFormat("en-FI", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Helsinki",
});
const euro = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR" });

export default function MyOrdersPage() {
  const { token, signOut } = useCustomerAccount();
  const [result, setResult] = useState(null);
  const [receiptAction, setReceiptAction] = useState(null);
  const [receiptMessages, setReceiptMessages] = useState({});

  useEffect(() => {
    const controller = new AbortController();
    getCustomerOrders(token, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setResult({ token, ...data });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401 || error.status === 403) {
          signOut();
        } else {
          setResult({ token, error: "Could not load your orders. Please try again." });
        }
      });
    return () => controller.abort();
  }, [token, signOut]);

  const current = result?.token === token ? result : null;
  const orders = current?.orders;

  async function handleReceipt(order) {
    const orderId = Number(order.order_id);
    setReceiptAction({ orderId });
    setReceiptMessages((messages) => ({ ...messages, [orderId]: "Preparing your one-page bilingual receipt…" }));
    try {
      const pdf = await getCustomerOrderReceiptPdf(token, orderId);
      const url = URL.createObjectURL(pdf);
      const receiptNumber = order.receipt_number || order.order_id;
      const link = document.createElement("a");
      link.href = url;
      link.download = `desi-dawat-receipt-${receiptNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setReceiptMessages((messages) => ({ ...messages, [orderId]: "Receipt downloaded." }));
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setReceiptMessages((messages) => ({ ...messages, [orderId]: error.message || "Could not load this receipt." }));
    } finally {
      setReceiptAction(null);
    }
  }

  return (
    <section aria-labelledby="my-orders-title">
      <h2 id="my-orders-title">My Orders</h2>
      {!current && <p role="status">Loading your orders…</p>}
      {current?.error && <p role="alert">{current.error}</p>}
      {orders?.length === 0 && <p>You haven’t placed an order while signed in yet.</p>}
      {orders?.length > 0 && (
        <ul className="customer-order-list">
          {orders.map((order) => (
            <li key={order.order_id}>
              <h3>Receipt #{order.receipt_number || order.order_id}</h3>
              <p><time dateTime={order.created_at}>{orderDate.format(new Date(order.created_at))}</time></p>
              <p>{order.order_type === "delivery" ? "Delivery" : "Takeaway"} · <span className="customer-order-status">{order.order_status}</span></p>
              <p>Total {euro.format(Number(order.total_amount))}</p>
              <div className="order-receipt-actions">
                <button className="button button-secondary" type="button" disabled={receiptAction?.orderId === Number(order.order_id)} onClick={() => handleReceipt(order)}>
                  {receiptAction?.orderId === Number(order.order_id) ? "Preparing PDF…" : "Download one-page receipt PDF"}
                </button>
              </div>
              {receiptMessages[order.order_id] && <p className="order-receipt-message" aria-live="polite">{receiptMessages[order.order_id]}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
