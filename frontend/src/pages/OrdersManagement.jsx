import React, { useEffect, useState } from "react";
import { deleteOrder, getAdminOrders, updateDeliveryCharge, updateOrderDiscount, updateOrderStatus } from "../api.js";
import { buildReceiptPaymentDetails } from "../utils/receiptPayment.js";

// Order dashboard: provide refresh, order status, delivery charge, receipt, and delete actions.
const orderStatuses = ["pending", "confirmed", "preparing", "ready", "completed", "cancelled"];
const formatMoney = (value) => Number(value || 0).toFixed(2);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export default function OrdersManagement({ token }) {
  const [orders, setOrders] = useState([]);
  const [deliveryCharges, setDeliveryCharges] = useState({});
  const [discountPercents, setDiscountPercents] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingCharge, setSavingCharge] = useState({});
  const [updatingStatus, setUpdatingStatus] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadOrders(showLoading = true) {
    if (!token) {
      setLoading(false);
      setError("Your admin session has expired. Please sign in again.");
      return;
    }
    if (showLoading) setLoading(true);
    setError("");
    try {
      const data = await getAdminOrders(token);
      const list = Array.isArray(data) ? data : data?.orders || [];
      setOrders(list);
      setDeliveryCharges(Object.fromEntries(list.map((order) => [order.order_id, formatMoney(order.delivery_charge)])));
      setDiscountPercents(Object.fromEntries(list.map((order) => [order.order_id, String(order.discount_percent ?? 0)])));
    } catch (loadError) {
      setError(loadError.message || "Could not load customer orders.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, [token]);

  async function changeStatus(order, newStatus) {
    setError("");
    setMessage("");
    setUpdatingStatus((current) => ({ ...current, [order.order_id]: true }));
    try {
      await updateOrderStatus(token, order.order_id, newStatus);
      setOrders((current) => current.map((item) => item.order_id === order.order_id ? { ...item, order_status: newStatus } : item));
      setMessage(`Order #${order.receipt_number || order.order_id} status updated.`);
    } catch (updateError) {
      setError(updateError.message || "Could not update the order status.");
    } finally {
      setUpdatingStatus((current) => ({ ...current, [order.order_id]: false }));
    }
  }

  async function saveCharge(order) {
    const rawCharge = deliveryCharges[order.order_id] ?? "";
    const charge = Number(rawCharge);
    if (String(rawCharge).trim() === "" || !Number.isFinite(charge) || charge < 0) {
      setError("Enter a valid delivery charge of €0.00 or more.");
      setMessage("");
      return;
    }
    setError("");
    setMessage("");
    setSavingCharge((current) => ({ ...current, [order.order_id]: true }));
    try {
      const result = await updateDeliveryCharge(token, order.order_id, charge);
      setOrders((current) => current.map((item) => item.order_id === order.order_id
        ? { ...item, delivery_charge: result.delivery_charge ?? charge, total_amount: result.total_amount ?? item.total_amount }
        : item));
      setDeliveryCharges((current) => ({ ...current, [order.order_id]: formatMoney(result.delivery_charge ?? charge) }));
      setMessage(`Delivery charge saved for order #${order.receipt_number || order.order_id}.`);
    } catch (saveError) {
      setError(saveError.message || "Could not save the delivery charge.");
    } finally {
      setSavingCharge((current) => ({ ...current, [order.order_id]: false }));
    }
  }

  // Admin discount: save a 0–100% discount on the food subtotal while keeping delivery unchanged.
  async function saveDiscount(order) {
    const rawPercent = discountPercents[order.order_id] ?? "0";
    const percent = Number(rawPercent);
    if (String(rawPercent).trim() === "" || !Number.isFinite(percent) || percent < 0 || percent > 100) {
      setError("Enter a discount between 0% and 100%.");
      setMessage("");
      return;
    }
    setError("");
    setMessage("");
    setSavingCharge((current) => ({ ...current, [`discount-${order.order_id}`]: true }));
    try {
      const result = await updateOrderDiscount(token, order.order_id, percent);
      setOrders((current) => current.map((item) => item.order_id === order.order_id
        ? { ...item, discount_percent: result.discount_percent, discount_amount: result.discount_amount, total_amount: result.total_amount }
        : item));
      setMessage(`Discount saved. New total for order #${order.receipt_number || order.order_id}: €${formatMoney(result.total_amount)}.`);
    } catch (discountError) {
      setError(discountError.message || "Could not save the discount.");
    } finally {
      setSavingCharge((current) => ({ ...current, [`discount-${order.order_id}`]: false }));
    }
  }
  async function removeOrder(order) {
    if (!window.confirm(`Permanently delete order #${order.receipt_number || order.order_id} for ${order.customer_name}? This cannot be undone.`)) return;
    setError("");
    setMessage("");
    try {
      await deleteOrder(token, order.order_id);
      setOrders((current) => current.filter((item) => item.order_id !== order.order_id));
      setMessage(`Order #${order.receipt_number || order.order_id} deleted.`);
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete the order.");
    }
  }

  function printReceipt(order) {
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      setError("Please allow pop-ups to print the receipt.");
      return;
    }
    const rows = (order.items || []).map((dish) => `<tr><td>${escapeHtml(dish.item_name)}</td><td>${escapeHtml(dish.quantity)}</td><td>€${formatMoney(dish.unit_price)}</td><td>€${formatMoney(dish.line_total)}</td></tr>`).join("");
    const deliveryAddress = order.delivery_address ? `<p><strong>Delivery address:</strong> ${escapeHtml(order.delivery_address)}</p>` : "";
    const notes = order.customer_notes ? `<p><strong>Customer note:</strong> ${escapeHtml(order.customer_notes)}</p>` : "";
    const discountAmount = Number(order.discount_amount || 0);
    const subtotal = Number(order.total_amount || 0) - Number(order.delivery_charge || 0) + discountAmount;
    // Receipt payment request: reflect the customer-selected method with concise payment directions.
    const paymentDetails = buildReceiptPaymentDetails(order, formatMoney);
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Desi Dawat Order Receipt</title><style>body{font:14px Arial,sans-serif;color:#30150e;padding:12mm}header{text-align:center;border-bottom:2px solid #c79b35;padding-bottom:12px}header img{width:75px;height:75px;object-fit:contain}h1,h2{color:#791d2a}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{text-align:left;padding:8px;border-bottom:1px solid #ddd}.total{text-align:right;font-size:20px}@page{size:A4;margin:12mm}/* Receipt print design: polish the page while preserving its existing text and order details. */
*{box-sizing:border-box}body{font:14px/1.55 Arial,sans-serif;color:#39291f;max-width:760px;margin:18px auto;padding:30px 38px;background:#fff;border:1px solid #ead8b8;border-top:8px solid #c79b35;box-shadow:0 12px 36px rgba(48,21,14,.12)}header,.brand{text-align:center;border-bottom:1px solid #ead8b8;padding:0 0 17px;margin:0 0 20px}header img,.brand img{width:82px;height:82px;object-fit:contain;padding:3px;background:#21130e;border:2px solid #c79b35;border-radius:50%}header h1,.brand h1{font:700 28px Georgia,serif;letter-spacing:1.5px;color:#791d2a;margin:10px 0 6px}header p,.brand p{margin:4px 0;color:#65584d}h2{color:#791d2a;margin:18px 0 12px}body>h2{padding:11px 14px;background:#fff7e9;border-left:5px solid #c79b35;border-radius:4px}.details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}.details p,body>p{margin:5px 0;padding:8px 10px;background:#fcf8f2;border:1px solid #eee4d7;border-radius:5px;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin:18px 0;border:1px solid #ead8b8}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #eee4d7}thead{background:#791d2a;color:#fff}th{color:#fff!important;font-weight:700}tbody tr:nth-child(even){background:#fcf8f2}.total{margin-top:16px;padding:13px 15px;text-align:right;font-size:22px;background:#fff3d9;border-left:5px solid #c79b35;border-bottom:2px solid #c79b35;border-radius:4px;color:#791d2a}hr{margin:17px 0;border:0;border-top:1px solid #d9c69f}body>p:last-child{text-align:center;background:transparent;border:0;color:#791d2a;font-weight:600}@media print{body{max-width:none;margin:0;padding:0;background:#fff;border:0;border-top:7px solid #c79b35;box-shadow:none}header,.brand,table,.details,.total{break-inside:avoid}thead{print-color-adjust:exact;-webkit-print-color-adjust:exact}tbody tr:nth-child(even),body>h2,.total,th{print-color-adjust:exact;-webkit-print-color-adjust:exact}}/* Single-page receipt print: reduce print spacing so typical orders fit on one A4 page. */@page{size:A4;margin:6mm}@media print{body{max-width:none;margin:0;padding:0;border:0;border-top:4px solid #c79b35;box-shadow:none;font-size:10.5px;line-height:1.25}header,.brand{padding-bottom:6px;margin-bottom:7px}header img,.brand img{width:54px;height:54px;padding:2px}header h1,.brand h1{font-size:20px;margin:4px 0}header p,.brand p{margin:1px 0}h2{font-size:15px;margin:7px 0 5px}body>h2{padding:6px 9px}.details{gap:2px 7px}.details p,body>p{margin:2px 0;padding:4px 6px}table{margin:7px 0;font-size:10px}th,td{padding:4px 5px}.total{margin:6px 0;padding:7px 9px;font-size:17px}hr{margin:6px 0}header,.brand,.total{break-inside:avoid}table,.details{break-inside:auto}}/* Receipt print spacing: use more of the page height while keeping the receipt readable. */@media print{body{font-size:11.5px;line-height:1.4}header,.brand{padding-bottom:10px;margin-bottom:12px}header img,.brand img{width:62px;height:62px}header h1,.brand h1{font-size:22px;margin:6px 0}header p,.brand p{margin:3px 0}h2{font-size:16px;margin:12px 0 8px}body>h2{padding:8px 11px}.details{gap:5px 9px}.details p,body>p{margin:4px 0;padding:6px 8px}table{margin:12px 0;font-size:11px}th,td{padding:6px 7px}.total{margin:10px 0;padding:10px 12px;font-size:19px}hr{margin:10px 0}}/* Receipt color theme: emphasize the restaurant details and make item information easier to scan. */@media print{header p,.brand p{color:#6f4b16;font-weight:600}header p:first-of-type,.brand p:first-of-type{color:#791d2a;font-weight:700}header p:last-of-type,.brand p:last-of-type{color:#5b3510}h3{color:#791d2a;border-bottom:2px solid #c79b35;padding-bottom:4px}table{border:1px solid #d8b65a}thead{background:#791d2a!important;color:#fff!important}th{background:#791d2a!important;color:#fff!important}td{color:#35231d;border-bottom:1px solid #e8d7b2}tbody tr:nth-child(even){background:#fff7e5!important}.details p,body>p:not(:last-child){color:#35231d;background:#fff9ec;border-color:#e3cf9b}.details strong,body>p strong{color:#791d2a}.total{background:#fff0cc;border-left-color:#b58a26;border-bottom-color:#b58a26;color:#791d2a}}/* Sky-blue receipt accents: highlight item names and charge lines, with a clear border around the printed page. */@media print{body{border:2px solid #3b91bd!important;padding:5mm!important;border-top:6px solid #267ba5!important}header,.brand{border-bottom:1px solid #9ecfe4}header p,.brand p{color:#245c78!important}header p:first-of-type,.brand p:first-of-type{color:#175b83!important}header p:last-of-type,.brand p:last-of-type{color:#245c78!important}h3{color:#175b83!important;border-color:#3b91bd!important}table{border:1px solid #76b9d4!important}thead,th{background:#267ba5!important;color:#fff!important}td{border-bottom:1px solid #c9e4ef!important}tbody td:first-child{color:#175b83!important;font-weight:700}tbody tr:nth-child(even){background:#edf8fc!important}.details p,body>p:not(:last-child){color:#234b5d!important;background:#f0f9fc!important;border-color:#b7dce9!important}.details strong,body>p strong{color:#175b83!important}.total{background:#e6f5fb!important;border-color:#3b91bd!important;color:#144f70!important}}/* Minimal receipt theme: replace colored cards with clean typography, fine dividers, and one restrained blue accent. */@media print{body{color:#202124!important;background:#fff!important;border:1px solid #c79b35!important;border-top:4px solid #c79b35!important}h1,h2,h3{color:#202124!important}header,.brand{border-bottom:1px solid #dadce0!important}header p,.brand p,header p:first-of-type,.brand p:first-of-type,header p:last-of-type,.brand p:last-of-type{color:#5f6368!important}.details p,body>p:not(:last-child){color:#3c4043!important;background:transparent!important;border:0!important;border-bottom:1px solid #e8eaed!important;border-radius:0!important;padding:5px 0!important}.details strong,body>p strong{color:#5f6368!important}.details p{border-bottom:1px solid #e8eaed!important}body>h2{background:transparent!important;border:0!important;border-bottom:1px solid #e8eaed!important;border-radius:0!important;padding:7px 0!important}h3{border-color:#dadce0!important}table{border:0!important}thead,th{background:#f8f9fa!important;color:#3c4043!important}th{border-bottom:2px solid #c79b35!important}td{color:#3c4043!important;border-bottom:1px solid #e8eaed!important}tbody td:first-child{color:#202124!important;font-weight:600!important}tbody tr:nth-child(even){background:#fff!important}.total{background:transparent!important;border:0!important;border-top:2px solid #c79b35!important;border-bottom:1px solid #dadce0!important;border-radius:0!important;color:#202124!important;padding:9px 0!important}.total strong{color:#1a73e8!important}}/* Receipt payment block: keep selected payment instructions compact and distinct on the printed receipt. */.receipt-payment-page{break-before:page;page-break-before:always;box-sizing:border-box;min-height:270mm;margin:0;padding:18mm;border:1px solid #c79b35;border-top:5px solid #c79b35}.payment-page-brand{text-align:center;padding-bottom:12px;margin-bottom:20px;border-bottom:1px solid #dadce0}.payment-page-brand h1{font:700 24px Georgia,serif;color:#202124;margin:0 0 6px}.payment-page-brand p{margin:3px 0;color:#5f6368}.payment-method-option{margin:14px 0;padding:12px;border:1px solid #dadce0;break-inside:avoid}.payment-method-option h2{margin:0 0 8px}.payment-method-option p{margin:5px 0}.receipt-payment-details{margin:18px 0;padding:12px 0;border-top:1px solid #dadce0;break-inside:avoid}.receipt-payment-details h2{font-size:18px;color:#202124}.receipt-payment-details p{margin:8px 0}.payment-instruction{margin-top:20px!important;font-weight:700}.receipt-payment-details h3{margin:3px 0 4px;font-size:12px;color:#202124}.receipt-payment-details p{margin:2px 0;padding:0;border:0;background:transparent;color:#3c4043}.receipt-mobile-payment{display:flex;align-items:center;gap:8px}.receipt-mobile-payment img{width:128px;height:128px;object-fit:contain}.receipt-mobile-payment p{margin:0}</style></head><body><header><img src="/images/LOGO.jpeg" alt="Desi Dawat"><h1>DESI DAWAT</h1><p>Fresh Indian Vegetarian Food</p><p>Pateniementie 59, 90800 Oulu · Tel. +358 44 980 3211</p><!-- Receipt contact: restaurant email address. --><p>Email: desidawat.food@gmail.com</p></header><h2>Order Receipt / Tilauskuitti</h2><p><strong>Receipt:</strong> #${escapeHtml(order.receipt_number || order.order_id)}</p><p><strong>Date:</strong> ${escapeHtml(order.created_at ? new Date(order.created_at).toLocaleString() : "—")}</p><p><strong>Customer:</strong> ${escapeHtml(order.customer_name)}</p><p><strong>Phone:</strong> ${escapeHtml(order.customer_phone)}</p><p><strong>Order type:</strong> ${order.order_type === "delivery" ? "Home delivery" : "Takeaway"}</p>${deliveryAddress}${notes}<table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${rows}</tbody></table><p>Food subtotal: €${formatMoney(subtotal)}</p>${Number(order.discount_percent || 0) > 0 ? `<p>Discount (${formatMoney(order.discount_percent)}%): −€${formatMoney(discountAmount)}</p>` : ""}<p>Delivery charge: €${formatMoney(order.delivery_charge)}</p><h2 class="total">TOTAL: €${formatMoney(order.total_amount)}</h2><p>Order status: ${escapeHtml(order.order_status)}</p><hr><p>Thank you for ordering from Desi Dawat! ❤️</p>${paymentDetails}</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onload = () => printWindow.print();
  }

  return (
    <div className="time-management order-management">
      <div className="panel-heading">
        <div>
          <h2>Customer Orders / Asiakastilaukset</h2>
          <p>{orders.length} order(s)</p>
        </div>
        <button type="button" className="button button-outline" onClick={() => loadOrders()} disabled={loading}>{loading ? "Loading..." : "Refresh orders"}</button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}
      {loading ? <p>Loading customer orders...</p> : !orders.length ? <p className="notice">No customer orders found.</p> : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Delivery charge</th><th>Discount</th><th>Final bill</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{orders.map((order) => (
              <tr key={order.order_id}>
                <td><strong>Receipt #{order.receipt_number || order.order_id}</strong><small>{order.created_at ? new Date(order.created_at).toLocaleString() : ""}</small></td>
                <td><strong>{order.customer_name}</strong><small>{order.customer_phone}</small><small>{order.order_type === "delivery" ? "Home delivery" : "Takeaway"}</small>{order.delivery_address && <small>{order.delivery_address}</small>}{order.customer_notes && <small>Note: {order.customer_notes}</small>}</td>
                <td>{(order.items || []).map((dish, index) => <small key={`${dish.item_id}-${index}`}><strong>{dish.item_name}</strong><br />Quantity: {dish.quantity} · Unit price: €{formatMoney(dish.unit_price)} · Item total: €{formatMoney(dish.line_total)}</small>)}</td>
                <td>{order.order_type === "delivery" ? <div className="order-delivery-charge">
                  <label htmlFor={`delivery-charge-${order.order_id}`}>Delivery charge (€)</label>
                  <input id={`delivery-charge-${order.order_id}`} type="number" min="0" step="0.01" value={deliveryCharges[order.order_id] ?? "0.00"} onChange={(event) => setDeliveryCharges((current) => ({ ...current, [order.order_id]: event.target.value }))} disabled={Boolean(savingCharge[order.order_id])} />
                  <button type="button" className="button button-primary" onClick={() => saveCharge(order)} disabled={Boolean(savingCharge[order.order_id])}>{savingCharge[order.order_id] ? "Saving..." : "Save charge"}</button>
                </div> : <span>€0.00 — Takeaway</span>}</td>
                <td><div className="order-discount-control"><label htmlFor={`order-discount-${order.order_id}`}>Discount (%)</label><input id={`order-discount-${order.order_id}`} type="number" min="0" max="100" step="0.01" value={discountPercents[order.order_id] ?? "0"} onChange={(event) => setDiscountPercents((current) => ({ ...current, [order.order_id]: event.target.value }))} disabled={Boolean(savingCharge[`discount-${order.order_id}`])} /><button type="button" className="button button-primary" onClick={() => saveDiscount(order)} disabled={Boolean(savingCharge[`discount-${order.order_id}`])}>{savingCharge[`discount-${order.order_id}`] ? "Saving..." : "Apply discount"}</button></div><small>Discount: −€{formatMoney(order.discount_amount)} ({formatMoney(order.discount_percent)}%)</small></td><td><small>Food subtotal: €{formatMoney(Number(order.total_amount) - Number(order.delivery_charge || 0) + Number(order.discount_amount || 0))}</small><br /><strong>Final bill: €{formatMoney(order.total_amount)}</strong></td>
                <td><select aria-label={`Order status for ${order.receipt_number || order.order_id}`} value={order.order_status} disabled={Boolean(updatingStatus[order.order_id])} onChange={(event) => changeStatus(order, event.target.value)}>{orderStatuses.map((status) => <option key={status} value={status}>{status.charAt(0).toUpperCase() + status.slice(1)}</option>)}</select></td>
                <td><div className="order-action-buttons"><button type="button" className="button" onClick={() => printReceipt(order)}>Print receipt</button><button type="button" className="button button-outline" onClick={() => removeOrder(order)}>Delete order</button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}