import React, { useEffect, useMemo, useState } from "react";
import { getAdminOrders } from "../api.js";
import { buildReceiptPaymentDetails } from "../utils/receiptPayment.js";

// Reports dashboard: provide date/status-filtered order summaries and printable customer receipts.
const money = (value) => Number(value || 0).toFixed(2);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const localDateKey = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export default function ReportsManagement({ token }) {
  const [orders, setOrders] = useState([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadOrders() {
    if (!token) {
      setLoading(false);
      setError("Your admin session has expired. Please sign in again.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await getAdminOrders(token);
      setOrders(Array.isArray(data) ? data : data?.orders || []);
    } catch (loadError) {
      setError(loadError.message || "Could not load orders for the report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadOrders(); }, [token]);

  // Report filters: apply selected local calendar dates and order status to the report and summary totals.
  const filteredOrders = useMemo(() => orders.filter((order) => {
    const orderDate = localDateKey(order.created_at);
    if (fromDate && orderDate < fromDate) return false;
    if (toDate && orderDate > toDate) return false;
    if (status !== "all" && order.order_status !== status) return false;
    return true;
  }), [orders, fromDate, toDate, status]);

  const summary = useMemo(() => {
    const activeOrders = filteredOrders.filter((order) => order.order_status !== "cancelled");
    return {
      count: filteredOrders.length,
      value: activeOrders.reduce((total, order) => total + Number(order.total_amount || 0), 0),
      discounts: activeOrders.reduce((total, order) => total + Number(order.discount_amount || 0), 0),
      delivery: filteredOrders.filter((order) => order.order_type === "delivery").length,
      cancelled: filteredOrders.filter((order) => order.order_status === "cancelled").length,
    };
  }, [filteredOrders]);

  function printReport() {
    const reportWindow = window.open("", "_blank", "width=1000,height=800");
    if (!reportWindow) {
      setError("Please allow pop-ups to print or save the report.");
      return;
    }
    const rows = filteredOrders.map((order) => `<tr><td>#${escapeHtml(order.receipt_number || order.order_id)}</td><td>${escapeHtml(order.created_at ? new Date(order.created_at).toLocaleString() : "—")}</td><td>${escapeHtml(order.customer_name)}</td><td>${order.order_type === "delivery" ? "Home delivery" : "Takeaway"}</td><td>${escapeHtml(order.order_status)}</td><td>${money(order.discount_percent)}% / −€${money(order.discount_amount)}</td><td>€${money(order.total_amount)}</td></tr>`).join("");
    const range = `${fromDate ? escapeHtml(fromDate) : "All dates"} – ${toDate ? escapeHtml(toDate) : "All dates"}`;
    reportWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Desi Dawat Order Report</title><style>body{font:13px Arial,sans-serif;color:#30150e;padding:10mm}header{text-align:center;border-bottom:2px solid #c79b35;padding-bottom:10px}header img{width:65px;height:65px;object-fit:contain}h1,h2{color:#791d2a}.summary{display:flex;gap:12px;margin:16px 0}.summary div{flex:1;border:1px solid #c79b35;padding:10px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border:1px solid #aaa}th{background:#fff0c2}@page{size:A4 landscape;margin:10mm}</style></head><body><header><img src="/images/LOGO.jpeg" alt="Desi Dawat"><h1>DESI DAWAT</h1><p>Order Report / Tilausraportti</p><p>Pateniementie 59, 90800 Oulu</p></header><p><strong>Period:</strong> ${range} · <strong>Status:</strong> ${escapeHtml(status === "all" ? "All statuses" : status)}</p><div class="summary"><div>Orders: <strong>${summary.count}</strong></div><div>Order value (excluding cancelled): <strong>€${money(summary.value)}</strong></div><div>Discounts given: <strong>€${money(summary.discounts)}</strong></div><div>Delivery orders: <strong>${summary.delivery}</strong></div><div>Cancelled: <strong>${summary.cancelled}</strong></div></div><table><thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Order type</th><th>Status</th><th>Discount</th><th>Final total</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No orders in this report period.</td></tr>'}</tbody></table></body></html>`);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.onload = () => reportWindow.print();
  }

  function printReceipt(order) {
    const receiptWindow = window.open("", "_blank", "width=900,height=700");
    if (!receiptWindow) {
      setError("Please allow pop-ups to print the receipt.");
      return;
    }
    const dishes = (order.items || []).map((dish, index) => `<tr><td>${escapeHtml(dish.item_name)}</td><td>${escapeHtml(dish.quantity)}</td><td>€${money(dish.unit_price)}</td><td>€${money(dish.line_total)}</td></tr>`).join("");
    const address = order.delivery_address ? `<p><strong>Toimitusosoite / Delivery Address:</strong> ${escapeHtml(order.delivery_address)}</p>` : "";
    const notes = order.customer_notes ? `<p><strong>Customer note:</strong> ${escapeHtml(order.customer_notes)}</p>` : "";
    const discountAmount = Number(order.discount_amount || 0);
    const subtotal = Number(order.total_amount || 0) - Number(order.delivery_charge || 0) + discountAmount;
    // Receipt payment request: print only the payment method selected by this customer.
    const paymentDetails = buildReceiptPaymentDetails(order, money);
    receiptWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Desi Dawat Receipt</title><style>body{font:14px Arial,sans-serif;color:#30150e;padding:10mm}.brand{text-align:center;border-bottom:2px solid #c79b35;padding-bottom:10px}.brand img{width:70px;height:70px;object-fit:contain}h1,h2{color:#791d2a}.details{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{text-align:left;padding:8px;border-bottom:1px solid #ccc}.total{text-align:right;font-size:20px}.en{color:#655244}@page{size:A4;margin:10mm}/* Receipt print design: polish the page while preserving its existing text and order details. */
*{box-sizing:border-box}body{font:14px/1.55 Arial,sans-serif;color:#39291f;max-width:760px;margin:18px auto;padding:30px 38px;background:#fff;border:1px solid #ead8b8;border-top:8px solid #c79b35;box-shadow:0 12px 36px rgba(48,21,14,.12)}header,.brand{text-align:center;border-bottom:1px solid #ead8b8;padding:0 0 17px;margin:0 0 20px}header img,.brand img{width:82px;height:82px;object-fit:contain;padding:3px;background:#21130e;border:2px solid #c79b35;border-radius:50%}header h1,.brand h1{font:700 28px Georgia,serif;letter-spacing:1.5px;color:#791d2a;margin:10px 0 6px}header p,.brand p{margin:4px 0;color:#65584d}h2{color:#791d2a;margin:18px 0 12px}body>h2{padding:11px 14px;background:#fff7e9;border-left:5px solid #c79b35;border-radius:4px}.details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}.details p,body>p{margin:5px 0;padding:8px 10px;background:#fcf8f2;border:1px solid #eee4d7;border-radius:5px;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin:18px 0;border:1px solid #ead8b8}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #eee4d7}thead{background:#791d2a;color:#fff}th{color:#fff!important;font-weight:700}tbody tr:nth-child(even){background:#fcf8f2}.total{margin-top:16px;padding:13px 15px;text-align:right;font-size:22px;background:#fff3d9;border-left:5px solid #c79b35;border-bottom:2px solid #c79b35;border-radius:4px;color:#791d2a}hr{margin:17px 0;border:0;border-top:1px solid #d9c69f}body>p:last-child{text-align:center;background:transparent;border:0;color:#791d2a;font-weight:600}@media print{body{max-width:none;margin:0;padding:0;background:#fff;border:0;border-top:7px solid #c79b35;box-shadow:none}header,.brand,table,.details,.total{break-inside:avoid}thead{print-color-adjust:exact;-webkit-print-color-adjust:exact}tbody tr:nth-child(even),body>h2,.total,th{print-color-adjust:exact;-webkit-print-color-adjust:exact}}/* Single-page receipt print: reduce print spacing so typical orders fit on one A4 page. */@page{size:A4;margin:6mm}@media print{body{max-width:none;margin:0;padding:0;border:0;border-top:4px solid #c79b35;box-shadow:none;font-size:10.5px;line-height:1.25}header,.brand{padding-bottom:6px;margin-bottom:7px}header img,.brand img{width:54px;height:54px;padding:2px}header h1,.brand h1{font-size:20px;margin:4px 0}header p,.brand p{margin:1px 0}h2{font-size:15px;margin:7px 0 5px}body>h2{padding:6px 9px}.details{gap:2px 7px}.details p,body>p{margin:2px 0;padding:4px 6px}table{margin:7px 0;font-size:10px}th,td{padding:4px 5px}.total{margin:6px 0;padding:7px 9px;font-size:17px}hr{margin:6px 0}header,.brand,.total{break-inside:avoid}table,.details{break-inside:auto}}/* Receipt print spacing: use more of the page height while keeping the receipt readable. */@media print{body{font-size:11.5px;line-height:1.4}header,.brand{padding-bottom:10px;margin-bottom:12px}header img,.brand img{width:62px;height:62px}header h1,.brand h1{font-size:22px;margin:6px 0}header p,.brand p{margin:3px 0}h2{font-size:16px;margin:12px 0 8px}body>h2{padding:8px 11px}.details{gap:5px 9px}.details p,body>p{margin:4px 0;padding:6px 8px}table{margin:12px 0;font-size:11px}th,td{padding:6px 7px}.total{margin:10px 0;padding:10px 12px;font-size:19px}hr{margin:10px 0}}/* Receipt color theme: emphasize the restaurant details and make item information easier to scan. */@media print{header p,.brand p{color:#6f4b16;font-weight:600}header p:first-of-type,.brand p:first-of-type{color:#791d2a;font-weight:700}header p:last-of-type,.brand p:last-of-type{color:#5b3510}h3{color:#791d2a;border-bottom:2px solid #c79b35;padding-bottom:4px}table{border:1px solid #d8b65a}thead{background:#791d2a!important;color:#fff!important}th{background:#791d2a!important;color:#fff!important}td{color:#35231d;border-bottom:1px solid #e8d7b2}tbody tr:nth-child(even){background:#fff7e5!important}.details p,body>p:not(:last-child){color:#35231d;background:#fff9ec;border-color:#e3cf9b}.details strong,body>p strong{color:#791d2a}.total{background:#fff0cc;border-left-color:#b58a26;border-bottom-color:#b58a26;color:#791d2a}}/* Sky-blue receipt accents: highlight item names and charge lines, with a clear border around the printed page. */@media print{body{border:2px solid #3b91bd!important;padding:5mm!important;border-top:6px solid #267ba5!important}header,.brand{border-bottom:1px solid #9ecfe4}header p,.brand p{color:#245c78!important}header p:first-of-type,.brand p:first-of-type{color:#175b83!important}header p:last-of-type,.brand p:last-of-type{color:#245c78!important}h3{color:#175b83!important;border-color:#3b91bd!important}table{border:1px solid #76b9d4!important}thead,th{background:#267ba5!important;color:#fff!important}td{border-bottom:1px solid #c9e4ef!important}tbody td:first-child{color:#175b83!important;font-weight:700}tbody tr:nth-child(even){background:#edf8fc!important}.details p,body>p:not(:last-child){color:#234b5d!important;background:#f0f9fc!important;border-color:#b7dce9!important}.details strong,body>p strong{color:#175b83!important}.total{background:#e6f5fb!important;border-color:#3b91bd!important;color:#144f70!important}}/* Minimal receipt theme: replace colored cards with clean typography, fine dividers, and one restrained blue accent. */@media print{body{color:#202124!important;background:#fff!important;border:1px solid #c79b35!important;border-top:4px solid #c79b35!important}h1,h2,h3{color:#202124!important}header,.brand{border-bottom:1px solid #dadce0!important}header p,.brand p,header p:first-of-type,.brand p:first-of-type,header p:last-of-type,.brand p:last-of-type{color:#5f6368!important}.details p,body>p:not(:last-child){color:#3c4043!important;background:transparent!important;border:0!important;border-bottom:1px solid #e8eaed!important;border-radius:0!important;padding:5px 0!important}.details strong,body>p strong{color:#5f6368!important}.details p{border-bottom:1px solid #e8eaed!important}body>h2{background:transparent!important;border:0!important;border-bottom:1px solid #e8eaed!important;border-radius:0!important;padding:7px 0!important}h3{border-color:#dadce0!important}table{border:0!important}thead,th{background:#f8f9fa!important;color:#3c4043!important}th{border-bottom:2px solid #c79b35!important}td{color:#3c4043!important;border-bottom:1px solid #e8eaed!important}tbody td:first-child{color:#202124!important;font-weight:600!important}tbody tr:nth-child(even){background:#fff!important}.total{background:transparent!important;border:0!important;border-top:2px solid #c79b35!important;border-bottom:1px solid #dadce0!important;border-radius:0!important;color:#202124!important;padding:9px 0!important}.total strong{color:#1a73e8!important}}/* Receipt payment block: keep selected payment instructions compact and distinct on the printed receipt. */.receipt-payment-page{break-before:page;page-break-before:always;box-sizing:border-box;min-height:270mm;margin:0;padding:18mm;border:1px solid #c79b35;border-top:5px solid #c79b35}.payment-page-brand{text-align:center;padding-bottom:12px;margin-bottom:20px;border-bottom:1px solid #dadce0}.payment-page-brand h1{font:700 24px Georgia,serif;color:#202124;margin:0 0 6px}.payment-page-brand p{margin:3px 0;color:#5f6368}.payment-method-option{margin:14px 0;padding:12px;border:1px solid #dadce0;break-inside:avoid}.payment-method-option h2{margin:0 0 8px}.payment-method-option p{margin:5px 0}.receipt-payment-details{margin:18px 0;padding:12px 0;border-top:1px solid #dadce0;break-inside:avoid}.receipt-payment-details h2{font-size:18px;color:#202124}.receipt-payment-details p{margin:8px 0}.payment-instruction{margin-top:20px!important;font-weight:700}.receipt-payment-details h3{margin:3px 0 4px;font-size:12px;color:#202124}.receipt-payment-details p{margin:2px 0;padding:0;border:0;background:transparent;color:#3c4043}.receipt-mobile-payment{display:flex;align-items:center;gap:8px}.receipt-mobile-payment img{width:128px;height:128px;object-fit:contain}.receipt-mobile-payment p{margin:0}</style></head><body><div class="brand"><img src="/images/LOGO.jpeg" alt="Desi Dawat logo"><h1>DESI DAWAT</h1><p>Tuoretta intialaista kasvisruokaa / Fresh Indian Vegetarian Food</p><p>Pateniementie 59, 90800 Oulu · Tel. +358 44 980 3211</p><!-- Receipt contact: restaurant email address. --><p>Email: desidawat.food@gmail.com</p></div><h2>TILAUSKUITTI / Order Receipt</h2><div class="details"><p><strong>Kuitti nro / Receipt No.</strong><br>#${escapeHtml(order.receipt_number || order.order_id)}</p><p><strong>Päivämäärä / Date</strong><br>${escapeHtml(order.created_at ? new Date(order.created_at).toLocaleString() : "—")}</p><p><strong>Asiakas / Customer</strong><br>${escapeHtml(order.customer_name)}</p><p><strong>Puhelin / Phone</strong><br>${escapeHtml(order.customer_phone)}</p><p><strong>Tilaustyyppi / Order Type</strong><br>${order.order_type === "delivery" ? "Kotiinkuljetus / Home Delivery" : "Nouto / Takeaway"}</p></div>${address}${notes}<hr><h3>Tuotteet / Items</h3><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${dishes}</tbody></table><p>Ruokien välisummaa / Food Subtotal: €${money(subtotal)}</p>${Number(order.discount_percent || 0) > 0 ? `<p>Discount (${money(order.discount_percent)}%): −€${money(discountAmount)}</p>` : ""}<p>Kuljetusmaksu / Delivery Charge: €${money(order.delivery_charge)}</p><h2 class="total">YHTEENSÄ / TOTAL: €${money(order.total_amount)}</h2><p><strong>Tilauksen tila / Order Status:</strong> ${escapeHtml(order.order_status)}</p><p>🙏 Kiitos, kun tilasit Desi Dawatista! / Thank you for ordering from Desi Dawat! ❤️</p>${paymentDetails}</body></html>`);
    receiptWindow.document.close();
    receiptWindow.focus();
    receiptWindow.onload = () => receiptWindow.print();
  }

  return (
    <div className="time-management receipts-reports">
      <div className="panel-heading">
        <div><h2>Receipts &amp; Reports / Kuitit ja raportit</h2><p>Filter orders, review totals, print the report, or print an individual receipt.</p></div>
        <button type="button" className="button button-outline" onClick={loadOrders} disabled={loading}>{loading ? "Loading..." : "Refresh orders"}</button>
      </div>

      {/* Report controls: filter the report and totals by date range and order status. */}
      <div className="form-grid report-filters">
        <label>From date<input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label>To date<input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} /></label>
        <label>Order status<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option>{["pending", "confirmed", "preparing", "ready", "completed", "cancelled"].map((value) => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select></label>
      </div>
      <div className="form-actions"><button type="button" className="button button-primary" onClick={printReport} disabled={loading}>Print / Save report</button><button type="button" className="button button-outline" onClick={() => { setFromDate(""); setToDate(""); setStatus("all"); }}>Clear filters</button></div>
      {error && <p className="form-error">{error}</p>}
      {loading ? <p>Loading orders...</p> : <>
        {/* Report totals: include the discounts applied by admins in the filtered period. */}
        <div className="report-summary-grid">
          <div><span>Orders in report</span><strong>{summary.count}</strong></div>
          <div><span>Order value, excluding cancelled</span><strong>€{money(summary.value)}</strong></div>
          <div><span>Discounts given</span><strong>€{money(summary.discounts)}</strong></div>
          <div><span>Home delivery</span><strong>{summary.delivery}</strong></div>
          <div><span>Cancelled</span><strong>{summary.cancelled}</strong></div>
        </div>
        <div className="panel-heading admin-list-heading"><h3>Receipts and orders <span className="count-pill">{filteredOrders.length}</span></h3></div>
        {!filteredOrders.length ? <p className="notice">No orders match these filters.</p> : <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Items</th><th>Order type</th><th>Discount</th><th>Final total</th><th>Status</th><th>Receipt</th></tr></thead>
            <tbody>{filteredOrders.map((order) => <tr key={order.order_id}>
              <td>#{order.receipt_number || order.order_id}</td>
              <td>{order.created_at ? new Date(order.created_at).toLocaleString() : "—"}</td>
              <td><strong>{order.customer_name}</strong><small>{order.customer_phone}</small></td>
              <td>{(order.items || []).map((item, index) => <small key={`${item.item_id}-${index}`}>{item.item_name} × {item.quantity}</small>)}</td>
              <td>{order.order_type === "delivery" ? "Home delivery" : "Takeaway"}</td>
              <td>{money(order.discount_percent)}% / −€{money(order.discount_amount)}</td>
              <td>€{money(order.total_amount)}</td>
              <td>{order.order_status}</td>
              <td><button type="button" className="button" onClick={() => printReceipt(order)}>Print receipt</button></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </>}
    </div>
  );
}