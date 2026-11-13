import React, { useEffect, useMemo, useState } from "react";
import { API_BASE, deleteOrder, getAdminCustomers, getAdminMenu, getAdminOrders, submitOrder, updateAdminOrderReceipt, updateDeliveryCharge, updateOrderDiscount, updateOrderRemark, updateOrderStatus } from "../api.js";
import { buildReceiptPaymentDetails } from "../utils/receiptPayment.js";
import { getCustomerNoteForReceipt } from "../utils/orderNotes.js";
import { renderLetterheadHtml, letterheadStyles } from "../../../shared/letterhead.js";
import { downloadReceiptFirstPageImage } from "../utils/receiptImage.js";

// Reports dashboard: provide date/status-filtered order summaries and printable customer receipts.
const money = (value) => Number(value || 0).toFixed(2);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
const localDateKey = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const EMPTY_MANUAL_ORDER = {
  customer_name: "", customer_phone: "", order_type: "takeaway", delivery_address: "",
  preferred_time: "", payment_method: "pay_on_delivery", customer_notes: "",
  manual_delivery_charge: false, delivery_charge: "", discount_type: "percent", discount_value: "",
};

export default function ReportsManagement({ token }) {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [customerChoice, setCustomerChoice] = useState("new");
  const [manualOrder, setManualOrder] = useState(EMPTY_MANUAL_ORDER);
  const [manualItems, setManualItems] = useState({});
  const [activeMenuCategory, setActiveMenuCategory] = useState("");
  const [editingReceipt, setEditingReceipt] = useState(false);
  const [receiptEdit, setReceiptEdit] = useState(null);
  const [receiptEditItems, setReceiptEditItems] = useState({});
  const [receiptEditCategory, setReceiptEditCategory] = useState("");
  const [manualLoading, setManualLoading] = useState(true);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState("");
  const [createdOrder, setCreatedOrder] = useState(null);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [receiptRemarks, setReceiptRemarks] = useState({});
  const [savingRemarks, setSavingRemarks] = useState({});
  const [updatingStatuses, setUpdatingStatuses] = useState({});

  const menuCategories = useMemo(() => [...new Set(menuItems.map((item) => item.main_category).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [menuItems]);
  const manualFoodSubtotal = useMemo(() => menuItems.reduce((sum, item) => {
    const quantity = Number(manualItems[item.item_id] || 0);
    return sum + Number(item.price_eur || 0) * (Number.isInteger(quantity) ? quantity : 0);
  }, 0), [menuItems, manualItems]);

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
      const orderRows = Array.isArray(data) ? data : data?.orders || [];
      setOrders(orderRows);
      setReceiptRemarks(Object.fromEntries(orderRows.map((order) => [order.order_id, order.admin_remark || ""])));
    } catch (loadError) {
      setError(loadError.message || "Could not load orders for the report.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadOrders(); }, [token]);

  async function saveReceiptRemark(order) {
    setSavingRemarks((current) => ({ ...current, [order.order_id]: true }));
    setError("");
    setMessage("");
    try {
      const result = await updateOrderRemark(token, order.order_id, receiptRemarks[order.order_id] || "");
      setOrders((current) => current.map((item) => item.order_id === order.order_id ? { ...item, admin_remark: result.admin_remark } : item));
      setMessage(`Receipt remark saved for #${order.receipt_number || order.order_id}.`);
    } catch (saveError) {
      setError(saveError.message || "Could not save the receipt remark.");
    } finally {
      setSavingRemarks((current) => ({ ...current, [order.order_id]: false }));
    }
  }

  async function changeReceiptStatus(order, newStatus) {
    setUpdatingStatuses((current) => ({ ...current, [order.order_id]: true }));
    setError("");
    setMessage("");
    try {
      await updateOrderStatus(token, order.order_id, newStatus);
      setOrders((current) => current.map((item) => item.order_id === order.order_id ? { ...item, order_status: newStatus } : item));
      setMessage(`Order #${order.receipt_number || order.order_id} status updated.`);
    } catch (statusError) {
      setError(statusError.message || "Could not update the order status.");
    } finally {
      setUpdatingStatuses((current) => ({ ...current, [order.order_id]: false }));
    }
  }

  async function removeReceiptOrder(order) {
    if (!window.confirm(`Permanently delete order #${order.receipt_number || order.order_id} for ${order.customer_name}? This cannot be undone.`)) return;
    setError("");
    setMessage("");
    try {
      const result = await deleteOrder(token, order.order_id);
      setOrders((current) => current.filter((item) => item.order_id !== order.order_id));
      if (Number(createdOrder?.order_id) === Number(order.order_id)) {
        setCreatedOrder(null);
        setEditingReceipt(false);
        setReceiptEdit(null);
      }
      setMessage(result.customer_archived
        ? `Order #${order.receipt_number || order.order_id} deleted. The customer was archived because no orders remain.`
        : `Order #${order.receipt_number || order.order_id} deleted.`);
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete the order.");
    }
  }

  async function printPdfReceipt(order) {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setError("Please allow pop-ups to open the PDF receipt.");
      return;
    }
    printWindow.document.write("<p style='font:16px Arial,sans-serif;padding:24px'>Preparing PDF receipt…</p>");
    try {
      const response = await fetch(`${API_BASE}/admin/orders/${order.order_id}/receipt.pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || "Could not generate the PDF receipt.");
      }
      const pdfUrl = URL.createObjectURL(await response.blob());
      printWindow.location.href = pdfUrl;
      setTimeout(() => URL.revokeObjectURL(pdfUrl), 60_000);
    } catch (pdfError) {
      printWindow.close();
      setError(pdfError.message || "Could not open the PDF receipt.");
    }
  }

  useEffect(() => {
    let active = true;
    async function loadManualOrderOptions() {
      setManualLoading(true);
      try {
        const [customerRows, menuRows] = await Promise.all([getAdminCustomers(token), getAdminMenu(token)]);
        if (!active) return;
        setCustomers((Array.isArray(customerRows) ? customerRows : []).filter((customer) => !Boolean(Number(customer.is_archived))));
        setMenuItems((Array.isArray(menuRows) ? menuRows : []).filter((item) => Boolean(Number(item.is_available))));
      } catch (loadError) {
        if (active) setManualError(loadError.message || "Could not load customers and menu items.");
      } finally {
        if (active) setManualLoading(false);
      }
    }
    if (token) loadManualOrderOptions();
    return () => { active = false; };
  }, [token]);

  function updateManualOrder(field, value) {
    setManualOrder((current) => ({ ...current, [field]: value }));
    setCreatedOrder(null);
    setManualError("");
  }

  function chooseCustomer(value) {
    setCustomerChoice(value);
    const customer = customers.find((entry) => String(entry.customer_id) === value);
    setManualOrder((current) => ({
      ...current,
      customer_name: customer?.customer_name || "",
      customer_phone: customer?.customer_phone || "",
      delivery_address: customer?.delivery_address || "",
    }));
    setCreatedOrder(null);
    setManualError("");
  }

  function beginReceiptEdit(order) {
    const flatDiscount = Number(order.discount_amount || 0) > 0 && Number(order.discount_percent || 0) === 0;
    setReceiptEdit({
      customer_name: order.customer_name || "", customer_phone: order.customer_phone || "",
      order_type: order.order_type || "takeaway", delivery_address: order.delivery_address || "",
      preferred_time: String(order.preferred_time || "").slice(0, 5), payment_method: order.payment_method || "pay_on_delivery",
      customer_notes: order.customer_notes || "", delivery_charge: String(order.delivery_charge || 0),
      discount_type: flatDiscount ? "flat" : "percent",
      discount_value: String(flatDiscount ? order.discount_amount || 0 : order.discount_percent || 0),
    });
    setReceiptEditItems(Object.fromEntries((order.items || []).map((item) => [item.item_id, String(item.quantity)])));
    setReceiptEditCategory(menuCategories[0] || "");
    setEditingReceipt(true);
    setManualError("");
  }

  function openReceiptEditor(order) {
    setCreatedOrder(order);
    beginReceiptEdit(order);
    requestAnimationFrame(() => document.getElementById("manual-receipt-heading")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function saveReceiptEdits(event) {
    event.preventDefault();
    if (!createdOrder || !receiptEdit) return;
    setManualSaving(true);
    setManualError("");
    setMessage("");
    try {
      const items = Object.entries(receiptEditItems)
        .map(([item_id, quantity]) => ({ item_id: Number(item_id), quantity: Number(quantity) }))
        .filter((item) => Number.isInteger(item.quantity) && item.quantity > 0);
      if (!items.length) throw new Error("Keep at least one item on the receipt.");
      await updateAdminOrderReceipt(token, createdOrder.order_id, {
        ...receiptEdit,
        delivery_charge: Number(receiptEdit.delivery_charge || 0),
        discount_value: Number(receiptEdit.discount_value || 0),
        items,
      });
      const refreshed = await getAdminOrders(token);
      const orderRows = Array.isArray(refreshed) ? refreshed : refreshed?.orders || [];
      const savedOrder = orderRows.find((order) => Number(order.order_id) === Number(createdOrder.order_id));
      if (!savedOrder) throw new Error("Edits were saved, but the updated receipt could not be reloaded. Refresh orders to see it.");
      setOrders(orderRows);
      setCreatedOrder(savedOrder);
      setEditingReceipt(false);
      setReceiptEdit(null);
      setMessage(`Receipt #${savedOrder.receipt_number || savedOrder.order_id} updated and saved.`);
    } catch (editError) {
      setManualError(editError.message || "Could not save receipt edits.");
    } finally {
      setManualSaving(false);
    }
  }

  async function createAdminReceipt(event) {
    event.preventDefault();
    setManualSaving(true);
    setManualError("");
    setMessage("");
    let savedResponse = null;
    let deliveryFeeError = "";
    let adjustmentError = "";
    try {
      const items = Object.entries(manualItems)
        .map(([item_id, quantity]) => ({ item_id: Number(item_id), quantity: Number(quantity) }))
        .filter((item) => Number.isInteger(item.quantity) && item.quantity > 0);
      if (!items.length) throw new Error("Add at least one menu item to the receipt.");
      const discountValue = manualOrder.discount_value === "" ? 0 : Number(manualOrder.discount_value);
      if (!Number.isFinite(discountValue) || discountValue < 0 || (manualOrder.discount_type === "percent" && discountValue > 100)) throw new Error("Enter a valid discount value.");
      if (manualOrder.discount_type === "flat" && discountValue > Number(manualFoodSubtotal.toFixed(2))) throw new Error("The discount cannot exceed the food subtotal.");
      if (manualOrder.order_type === "delivery" && manualOrder.manual_delivery_charge &&
          (manualOrder.delivery_charge === "" || !Number.isFinite(Number(manualOrder.delivery_charge)) || Number(manualOrder.delivery_charge) < 0)) {
        throw new Error("Enter a valid delivery charge of €0.00 or more.");
      }
      savedResponse = await submitOrder({
        customer_name: manualOrder.customer_name.trim(),
        customer_phone: manualOrder.customer_phone.trim(),
        order_type: manualOrder.order_type,
        payment_method: manualOrder.payment_method,
        delivery_address: manualOrder.order_type === "delivery" ? manualOrder.delivery_address.trim() : null,
        preferred_time: manualOrder.preferred_time,
        delivery_charge_manual_review: manualOrder.order_type === "delivery" && manualOrder.manual_delivery_charge,
        customer_notes: manualOrder.customer_notes.trim(),
        items,
      });
      // A successful order POST is the point of no return: clear the entry form
      // immediately so a later refresh problem cannot lead to accidental duplicates.
      setManualOrder(EMPTY_MANUAL_ORDER);
      setCustomerChoice("new");
      setManualItems({});
      setActiveMenuCategory("");
      setCreatedOrder(null);
      if (manualOrder.order_type === "delivery" && manualOrder.manual_delivery_charge) {
        try {
          await updateDeliveryCharge(token, savedResponse.order_id, Number(manualOrder.delivery_charge));
        } catch (feeError) {
          deliveryFeeError = feeError.message || "Could not save the manual delivery charge.";
        }
      }
      if (manualOrder.discount_value !== "" && Number(manualOrder.discount_value) > 0) {
        try {
          await updateOrderDiscount(token, savedResponse.order_id, manualOrder.discount_type === "flat"
            ? { discount_type: "flat", discount_amount: Number(manualOrder.discount_value) }
            : { discount_type: "percent", discount_percent: Number(manualOrder.discount_value) });
        } catch (discountError) {
          adjustmentError = discountError.message || "Could not save the discount.";
        }
      }
      const refreshed = await getAdminOrders(token);
      const orderRows = Array.isArray(refreshed) ? refreshed : refreshed?.orders || [];
      const savedOrder = orderRows.find((order) => Number(order.order_id) === Number(savedResponse.order_id));
      if (!savedOrder) throw new Error("The order was saved, but its receipt details could not be loaded. Use Refresh orders and print it from the list.");
      setOrders(orderRows);
      setCreatedOrder(savedOrder);
      setEditingReceipt(false);
      setMessage(`Order saved as receipt #${savedOrder.receipt_number || savedOrder.order_id}. ${savedResponse.order_status === "pending" ? "It is pending restaurant review." : "It is confirmed."}`);
      if (deliveryFeeError) setManualError(`The order and receipt were created, but the manual delivery charge was not saved: ${deliveryFeeError}. Edit the receipt in Receipts & Reports to update the charge.`);
      if (adjustmentError) setManualError(`The order and receipt were created, but the discount was not saved: ${adjustmentError}. Edit the receipt to apply it.`);
    } catch (saveError) {
      if (savedResponse?.order_id) {
        setManualError(`Order #${savedResponse.receipt_number || savedResponse.order_id} was saved, but ${saveError.message || "the receipt could not be refreshed"}. Use Refresh orders before trying again.`);
      } else {
        setManualError(saveError.message || "Could not create the receipt.");
      }
    } finally {
      setManualSaving(false);
    }
  }

  // Report filters: apply the selected local calendar date range to orders and summary totals.
  const filteredOrders = useMemo(() => orders.filter((order) => {
    const orderDate = localDateKey(order.created_at);
    if (fromDate && orderDate < fromDate) return false;
    if (toDate && orderDate > toDate) return false;
    return true;
  }), [orders, fromDate, toDate]);

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
    const rows = filteredOrders.map((order) => `<tr><td>#${escapeHtml(order.receipt_number || order.order_id)}</td><td>${escapeHtml(order.created_at ? new Date(order.created_at).toLocaleString() : "—")}</td><td>${escapeHtml(order.customer_name)}${order.admin_remark ? `<br><small>Remark: ${escapeHtml(order.admin_remark)}</small>` : ""}</td><td>${order.order_type === "delivery" ? "Home delivery" : "Takeaway"}</td><td>${escapeHtml(order.order_status)}</td><td>${money(order.discount_percent)}% / −€${money(order.discount_amount)}</td><td>€${money(order.total_amount)}</td></tr>`).join("");
    const range = `${fromDate ? escapeHtml(fromDate) : "All dates"} – ${toDate ? escapeHtml(toDate) : "All dates"}`;
    reportWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Desi Dawat Order Report</title><style>body{font:13px Arial,sans-serif;color:#30150e;padding:10mm}h1,h2{color:#791d2a}.report-heading{text-align:center;margin:0 0 14px;color:#791d2a}.summary{display:flex;gap:12px;margin:16px 0}.summary div{flex:1;border:1px solid #c79b35;padding:10px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:8px;border:1px solid #aaa}th{background:#fff0c2}${letterheadStyles()}@page{size:A4 landscape;margin:10mm}</style></head><body>${renderLetterheadHtml()}<h2 class="report-heading">Order Report / Tilausraportti</h2><p><strong>Period:</strong> ${range}</p><div class="summary"><div>Orders: <strong>${summary.count}</strong></div><div>Order value (excluding cancelled): <strong>€${money(summary.value)}</strong></div><div>Discounts given: <strong>€${money(summary.discounts)}</strong></div><div>Delivery orders: <strong>${summary.delivery}</strong></div><div>Cancelled: <strong>${summary.cancelled}</strong></div></div><table><thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Order type</th><th>Status</th><th>Discount</th><th>Final total</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No orders in this report period.</td></tr>'}</tbody></table></body></html>`);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.onload = () => reportWindow.print();
  }

  function printReceipt(order, downloadImage = false) {
    if (downloadImage) {
      setError("");
      setMessage("Preparing first-page receipt image...");
    }
    let receiptFrame = null;
    let receiptWindow;
    if (downloadImage) {
      receiptFrame = document.createElement("iframe");
      receiptFrame.title = "Receipt image renderer";
      receiptFrame.tabIndex = -1;
      receiptFrame.style.cssText = "position:fixed;left:-10000px;top:0;width:900px;height:700px;border:0;pointer-events:none";
      document.body.appendChild(receiptFrame);
      receiptWindow = receiptFrame.contentWindow;
    } else {
      receiptWindow = window.open("", "_blank", "width=900,height=700");
    }
    if (!receiptWindow) {
      receiptFrame?.remove();
      setError(downloadImage ? "Could not prepare the receipt image." : "Please allow pop-ups to print the receipt.");
      return;
    }
    const dishes = (order.items || []).map((dish, index) => `<tr><td>${escapeHtml(dish.item_name)}</td><td>${escapeHtml(dish.quantity)}</td><td>€${money(dish.unit_price)}</td><td>€${money(dish.line_total)}</td></tr>`).join("");
    const address = order.delivery_address ? `<p><strong>Toimitusosoite / Delivery Address:</strong> ${escapeHtml(order.delivery_address)}</p>` : "";
    const preferredTime = `<p><strong>Preferred ${order.order_type === "delivery" ? "delivery" : "pickup"} time / Toivottu aika:</strong> ${escapeHtml(String(order.preferred_time || "—").slice(0, 5))}</p>`;
const customerNote = getCustomerNoteForReceipt(order.customer_notes ?? order.notes);
const notes = [customerNote ? `<p style="white-space: pre-wrap"><strong>Lisätiedot / Additional instructions:</strong> ${escapeHtml(customerNote)}</p>` : "", order.admin_remark ? `<p style="white-space:pre-wrap"><strong>Asiakkaan huomio / Customer note:</strong> ${escapeHtml(order.admin_remark)}</p>` : ""].join("");
    const discountAmount = Number(order.discount_amount || 0);
    const discountLine = discountAmount > 0
      ? `<p>${Number(order.discount_percent || 0) > 0 ? `Discount (${money(order.discount_percent)}%)` : "Discount"}: −€${money(discountAmount)}</p>`
      : "";
    const subtotal = Number(order.total_amount || 0) - Number(order.delivery_charge || 0) + discountAmount;
    // Receipt payment request: print only the payment method selected by this customer.
    const paymentDetails = buildReceiptPaymentDetails(order, money);
    receiptWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Desi Dawat Receipt</title><style>body{font:14px Arial,sans-serif;color:#30150e;padding:10mm}.brand{text-align:center;border-bottom:2px solid #c79b35;padding-bottom:10px}.brand img{width:70px;height:70px;object-fit:contain}.brand p:nth-of-type(1),.brand p:nth-of-type(2){font-size:14px;font-weight:700;line-height:1.4;margin:5px 0;color:#791d2a}h1,h2{color:#791d2a}.details{display:grid;grid-template-columns:1fr 1fr;gap:4px 20px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{text-align:left;padding:8px;border-bottom:1px solid #ccc}.total{text-align:right;font-size:20px}.en{color:#655244}@page{size:A4;margin:10mm}/* Receipt print design: polish the page while preserving its existing text and order details. */
*{box-sizing:border-box}body{font:14px/1.55 Arial,sans-serif;color:#39291f;max-width:760px;margin:18px auto;padding:30px 38px;background:#fff;border:1px solid #ead8b8;border-top:8px solid #c79b35;box-shadow:0 12px 36px rgba(48,21,14,.12)}header,.brand{text-align:center;border-bottom:1px solid #ead8b8;padding:0 0 17px;margin:0 0 20px}header img,.brand img{width:82px;height:82px;object-fit:contain;padding:3px;background:#21130e;border:2px solid #c79b35;border-radius:50%}header h1,.brand h1{font:700 28px Georgia,serif;letter-spacing:1.5px;color:#791d2a;margin:10px 0 6px}header p,.brand p{margin:4px 0;color:#65584d}h2{color:#791d2a;margin:18px 0 12px}body>h2{padding:11px 14px;background:#fff7e9;border-left:5px solid #c79b35;border-radius:4px}.details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}.details p,body>p{margin:5px 0;padding:8px 10px;background:#fcf8f2;border:1px solid #eee4d7;border-radius:5px;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;margin:18px 0;border:1px solid #ead8b8}th,td{text-align:left;padding:9px 8px;border-bottom:1px solid #eee4d7}thead{background:#791d2a;color:#fff}th{color:#fff!important;font-weight:700}tbody tr:nth-child(even){background:#fcf8f2}.total{margin-top:16px;padding:13px 15px;text-align:right;font-size:22px;background:#fff3d9;border-left:5px solid #c79b35;border-bottom:2px solid #c79b35;border-radius:4px;color:#791d2a}hr{margin:17px 0;border:0;border-top:1px solid #d9c69f}body>p:last-child{text-align:center;background:transparent;border:0;color:#791d2a;font-weight:600}@media print{body{max-width:none;margin:0;padding:0;background:#fff;border:0;border-top:7px solid #c79b35;box-shadow:none}header,.brand,table,.details,.total{break-inside:avoid}thead{print-color-adjust:exact;-webkit-print-color-adjust:exact}tbody tr:nth-child(even),body>h2,.total,th{print-color-adjust:exact;-webkit-print-color-adjust:exact}}/* Single-page receipt print: reduce print spacing so typical orders fit on one A4 page. */@page{size:A4;margin:6mm}@media print{body{max-width:none;margin:0;padding:0;border:0;border-top:4px solid #c79b35;box-shadow:none;font-size:10.5px;line-height:1.25}header,.brand{padding-bottom:6px;margin-bottom:7px}header img,.brand img{width:54px;height:54px;padding:2px}header h1,.brand h1{font-size:20px;margin:4px 0}header p,.brand p{margin:1px 0}h2{font-size:15px;margin:7px 0 5px}body>h2{padding:6px 9px}.details{gap:2px 7px}.details p,body>p{margin:2px 0;padding:4px 6px}table{margin:7px 0;font-size:10px}th,td{padding:4px 5px}.total{margin:6px 0;padding:7px 9px;font-size:17px}hr{margin:6px 0}header,.brand,.total{break-inside:avoid}table,.details{break-inside:auto}}/* Receipt print spacing: use more of the page height while keeping the receipt readable. */@media print{body{font-size:11.5px;line-height:1.4}header,.brand{padding-bottom:10px;margin-bottom:12px}header img,.brand img{width:62px;height:62px}header h1,.brand h1{font-size:22px;margin:6px 0}header p,.brand p{margin:3px 0}h2{font-size:16px;margin:12px 0 8px}body>h2{padding:8px 11px}.details{gap:5px 9px}.details p,body>p{margin:4px 0;padding:6px 8px}table{margin:12px 0;font-size:11px}th,td{padding:6px 7px}.total{margin:10px 0;padding:10px 12px;font-size:19px}hr{margin:10px 0}}/* Receipt color theme: emphasize the restaurant details and make item information easier to scan. */@media print{header p,.brand p{color:#6f4b16;font-weight:600}header p:first-of-type,.brand p:first-of-type{color:#791d2a;font-weight:700}header p:last-of-type,.brand p:last-of-type{color:#5b3510}h3{color:#791d2a;border-bottom:2px solid #c79b35;padding-bottom:4px}table{border:1px solid #d8b65a}thead{background:#791d2a!important;color:#fff!important}th{background:#791d2a!important;color:#fff!important}td{color:#35231d;border-bottom:1px solid #e8d7b2}tbody tr:nth-child(even){background:#fff7e5!important}.details p,body>p:not(:last-child){color:#35231d;background:#fff9ec;border-color:#e3cf9b}.details strong,body>p strong{color:#791d2a}.total{background:#fff0cc;border-left-color:#b58a26;border-bottom-color:#b58a26;color:#791d2a}}/* Sky-blue receipt accents: highlight item names and charge lines, with a clear border around the printed page. */@media print{body{border:2px solid #3b91bd!important;padding:5mm!important;border-top:6px solid #267ba5!important}header,.brand{border-bottom:1px solid #9ecfe4}header p,.brand p{color:#245c78!important}header p:first-of-type,.brand p:first-of-type{color:#175b83!important}header p:last-of-type,.brand p:last-of-type{color:#245c78!important}h3{color:#175b83!important;border-color:#3b91bd!important}table{border:1px solid #76b9d4!important}thead,th{background:#267ba5!important;color:#fff!important}td{border-bottom:1px solid #c9e4ef!important}tbody td:first-child{color:#175b83!important;font-weight:700}tbody tr:nth-child(even){background:#edf8fc!important}.details p,body>p:not(:last-child){color:#234b5d!important;background:#f0f9fc!important;border-color:#b7dce9!important}.details strong,body>p strong{color:#175b83!important}.total{background:#e6f5fb!important;border-color:#3b91bd!important;color:#144f70!important}}/* Minimal receipt theme: replace colored cards with clean typography, fine dividers, and one restrained blue accent. */@media print{body{color:#202124!important;background:#fff!important;border:1px solid #c79b35!important;border-top:4px solid #c79b35!important}h1,h2,h3{color:#202124!important}header,.brand{border-bottom:1px solid #dadce0!important}header p,.brand p,header p:first-of-type,.brand p:first-of-type,header p:last-of-type,.brand p:last-of-type{color:#5f6368!important}.details p,body>p:not(:last-child){color:#3c4043!important;background:transparent!important;border:0!important;border-bottom:1px solid #e8eaed!important;border-radius:0!important;padding:5px 0!important}.details strong,body>p strong{color:#5f6368!important}.details p{border-bottom:1px solid #e8eaed!important}body>h2{background:transparent!important;border:0!important;border-bottom:1px solid #e8eaed!important;border-radius:0!important;padding:7px 0!important}h3{border-color:#dadce0!important}table{border:0!important}thead,th{background:#f8f9fa!important;color:#3c4043!important}th{border-bottom:2px solid #c79b35!important}td{color:#3c4043!important;border-bottom:1px solid #e8eaed!important}tbody td:first-child{color:#202124!important;font-weight:600!important}tbody tr:nth-child(even){background:#fff!important}.total{background:transparent!important;border:0!important;border-top:2px solid #c79b35!important;border-bottom:1px solid #dadce0!important;border-radius:0!important;color:#202124!important;padding:9px 0!important}.total strong{color:#1a73e8!important}}/* Receipt payment block: keep selected payment instructions compact and distinct on the printed receipt. */.receipt-payment-page{break-before:page;page-break-before:always;box-sizing:border-box;min-height:270mm;margin:0;padding:18mm;border:1px solid #c79b35;border-top:5px solid #c79b35}.payment-page-brand{text-align:center;padding-bottom:12px;margin-bottom:20px;border-bottom:1px solid #dadce0}.payment-page-brand h1{font:700 24px Georgia,serif;color:#202124;margin:0 0 6px}.payment-page-brand p{margin:3px 0;color:#5f6368}.payment-method-option{margin:14px 0;padding:12px;border:1px solid #dadce0;break-inside:avoid}.payment-method-option h2{margin:0 0 8px}.payment-method-option p{margin:5px 0}.receipt-payment-details{margin:18px 0;padding:12px 0;border-top:1px solid #dadce0;break-inside:avoid}.receipt-payment-details h2{font-size:18px;color:#202124}.receipt-payment-details p{margin:8px 0}.payment-instruction{margin-top:20px!important;font-weight:700}.receipt-payment-details h3{margin:3px 0 4px;font-size:12px;color:#202124}.receipt-payment-details p{margin:2px 0;padding:0;border:0;background:transparent;color:#3c4043}.receipt-mobile-payment{display:flex;align-items:center;gap:8px}.receipt-mobile-payment img{width:256px;height:256px;object-fit:contain}.receipt-mobile-payment p{margin:0}${letterheadStyles()}</style></head><body>${renderLetterheadHtml()}<h2>TILAUSKUITTI / Order Receipt</h2><div class="details"><p><strong>Kuitti nro / Receipt No.</strong><br>#${escapeHtml(order.receipt_number || order.order_id)}</p><p><strong>Päivämäärä / Date</strong><br>${escapeHtml(order.created_at ? new Date(order.created_at).toLocaleString() : "—")}</p><p><strong>Asiakas / Customer</strong><br>${escapeHtml(order.customer_name)}</p><p><strong>Puhelin / Phone</strong><br>${escapeHtml(order.customer_phone)}</p><p><strong>Tilaustyyppi / Order Type</strong><br>${order.order_type === "delivery" ? "Kotiinkuljetus / Home Delivery" : "Nouto / Takeaway"}</p></div>${address}${preferredTime}${notes}<hr><h3>Tuotteet / Items</h3><table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${dishes}</tbody></table><p>Ruokien välisummaa / Food Subtotal: €${money(subtotal)}</p>${discountLine}<p>Kuljetusmaksu / Delivery Charge: €${money(order.delivery_charge)}</p><h2 class="total">YHTEENSÄ / TOTAL: €${money(order.total_amount)}</h2><p><strong>Tilauksen tila / Order Status:</strong> ${escapeHtml(order.order_status)}</p><p>🙏 Kiitos, kun tilasit Desi Dawatista! / Thank you for ordering from Desi Dawat! ❤️</p>${paymentDetails}</body></html>`);
    receiptWindow.onload = async () => {
      if (downloadImage) {
        try {
          await downloadReceiptFirstPageImage(receiptWindow.document.body, order.receipt_number || order.order_id);
          setMessage(`First-page image downloaded for receipt #${order.receipt_number || order.order_id}.`);
        } catch (imageError) {
          setError(imageError.message || "Could not download the receipt image.");
        } finally {
          receiptFrame?.remove();
        }
        return;
      }
      receiptWindow.focus();
      receiptWindow.print();
    };
    receiptWindow.document.close();
  }

  return (
    <div className="time-management receipts-reports">
      <div className="panel-heading">
        <div><h2>Receipts &amp; Reports / Kuitit ja raportit</h2><p>Filter orders, review totals, print the report, or print an individual receipt.</p></div>
        <button type="button" className="button button-outline" onClick={loadOrders} disabled={loading}>{loading ? "Loading..." : "Refresh orders"}</button>
      </div>

      {/* Report controls: filter the report and totals by date range. */}
      <div className="form-grid report-filters">
        <label>From date<input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} /></label>
        <label>To date<input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} /></label>
      </div>
      <div className="form-actions"><button type="button" className="button button-primary" onClick={printReport} disabled={loading}>Print / Save report</button><button type="button" className="button button-outline" onClick={() => { setFromDate(""); setToDate(""); }}>Clear filters</button></div>
      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}
      <section className="manual-receipt-panel" aria-labelledby="manual-receipt-heading">
        <div className="panel-heading"><div><h3 id="manual-receipt-heading">Create a receipt / order</h3><p>Use a saved customer or enter a new one. Prices and receipt details come from the same checkout and receipt flow as customer orders.</p></div></div>
        {manualError && <p className="form-error" role="alert">{manualError}</p>}
        {manualLoading ? <p>Loading customers and available menu items...</p> : (
          <form onSubmit={createAdminReceipt}>
            <div className="form-grid manual-receipt-grid">
              <label>Customer
                <select value={customerChoice} onChange={(event) => chooseCustomer(event.target.value)}>
                  <option value="new">New customer</option>
                  {customers.map((customer) => <option key={customer.customer_id} value={String(customer.customer_id)}>{customer.customer_name} · {customer.customer_phone}</option>)}
                </select>
              </label>
              <label>Customer name *<input required minLength={2} maxLength={120} value={manualOrder.customer_name} onChange={(event) => updateManualOrder("customer_name", event.target.value)} /></label>
              <label>Phone *<input required type="tel" maxLength={30} value={manualOrder.customer_phone} onChange={(event) => updateManualOrder("customer_phone", event.target.value)} /></label>
              <label>Order type
                <select value={manualOrder.order_type} onChange={(event) => updateManualOrder("order_type", event.target.value)}><option value="takeaway">Pickup / takeaway</option><option value="delivery">Home delivery</option></select>
              </label>
              {manualOrder.order_type === "delivery" && <label className="manual-receipt-wide">Delivery address *<textarea required minLength={6} maxLength={500} rows={2} value={manualOrder.delivery_address} onChange={(event) => updateManualOrder("delivery_address", event.target.value)} /></label>}
              {manualOrder.order_type === "delivery" && <label className="manual-receipt-wide manual-fee-toggle"><input type="checkbox" checked={manualOrder.manual_delivery_charge} onChange={(event) => updateManualOrder("manual_delivery_charge", event.target.checked)} /> Enter delivery charge manually if route lookup is unavailable</label>}
              {manualOrder.order_type === "delivery" && manualOrder.manual_delivery_charge && <label>Manual delivery charge (€) *<input required type="number" min="0" step="0.01" value={manualOrder.delivery_charge} onChange={(event) => updateManualOrder("delivery_charge", event.target.value)} /></label>}
              <label>Discount type<select value={manualOrder.discount_type} onChange={(event) => updateManualOrder("discount_type", event.target.value)}><option value="percent">Percentage (%)</option><option value="flat">Fixed amount (€)</option></select></label>
              <label>Discount value<input type="number" min="0" step="0.01" max={manualOrder.discount_type === "percent" ? "100" : undefined} value={manualOrder.discount_value} onChange={(event) => updateManualOrder("discount_value", event.target.value)} placeholder={manualOrder.discount_type === "percent" ? "0–100%" : "€ amount"} /></label>
              <label>Preferred {manualOrder.order_type === "delivery" ? "delivery" : "pickup"} time *<input required type="time" value={manualOrder.preferred_time} onChange={(event) => updateManualOrder("preferred_time", event.target.value)} /></label>
              <label>Payment method
                <select value={manualOrder.payment_method} onChange={(event) => updateManualOrder("payment_method", event.target.value)}><option value="pay_on_delivery">Pay on delivery or pickup</option><option value="iban_transfer">Bank transfer</option><option value="mobile_scan_pay">MobilePay QR</option></select>
              </label>
              <label className="manual-receipt-wide">Customer note (optional)<textarea maxLength={1000} rows={2} value={manualOrder.customer_notes} onChange={(event) => updateManualOrder("customer_notes", event.target.value)} /></label>
            </div>
            <section className="manual-receipt-items-picker" aria-label="Purchased items and quantities">
              <strong>Purchased items and quantities *</strong>
              <div className="manual-receipt-categories">{menuCategories.map((category) => <button type="button" key={category} className={`button ${activeMenuCategory === category ? "button-primary" : "button-outline"}`} aria-expanded={activeMenuCategory === category} onClick={() => setActiveMenuCategory(activeMenuCategory === category ? "" : category)}>{category}</button>)}</div>
              {activeMenuCategory && <div className="manual-receipt-items" role="region" aria-label={`${activeMenuCategory} menu items`}>
                {menuItems.filter((item) => item.main_category === activeMenuCategory).map((item) => <label key={item.item_id}><span>{item.display_code ? `(${item.display_code}) ` : ""}{item.item_name} · €{money(item.price_eur)}</span><input aria-label={`Quantity of ${item.item_name}`} type="number" min="0" max="100" value={manualItems[item.item_id] || ""} onChange={(event) => { setManualItems((current) => ({ ...current, [item.item_id]: event.target.value })); setCreatedOrder(null); }} /></label>)}
              </div>}
            </section>
            <div className="form-actions"><button type="submit" className="button button-primary" disabled={manualSaving || manualLoading}>{manualSaving ? "Saving order..." : "Create order and receipt"}</button></div>
          </form>
        )}
        {createdOrder && <div className="manual-receipt-result"><strong>Receipt #{createdOrder.receipt_number || createdOrder.order_id} is ready.</strong><div className="order-action-buttons"><button type="button" className="button" onClick={() => printReceipt(createdOrder)}>Print receipt</button><button type="button" className="button button-outline" onClick={() => printReceipt(createdOrder, true)}>Download first-page image</button><button type="button" className="button button-outline" onClick={() => editingReceipt ? setEditingReceipt(false) : beginReceiptEdit(createdOrder)}>{editingReceipt ? "Close editor" : "Edit receipt"}</button></div></div>}
        {createdOrder && editingReceipt && receiptEdit && <form className="manual-receipt-editor" onSubmit={saveReceiptEdits}>
          <h4>Edit saved receipt #{createdOrder.receipt_number || createdOrder.order_id}</h4>
          <div className="form-grid manual-receipt-grid">
            <label>Customer name *<input required minLength={2} maxLength={120} value={receiptEdit.customer_name} onChange={(event) => setReceiptEdit((current) => ({ ...current, customer_name: event.target.value }))} /></label>
            <label>Phone *<input required type="tel" maxLength={30} value={receiptEdit.customer_phone} onChange={(event) => setReceiptEdit((current) => ({ ...current, customer_phone: event.target.value }))} /></label>
            <label>Order type<select value={receiptEdit.order_type} onChange={(event) => setReceiptEdit((current) => ({ ...current, order_type: event.target.value }))}><option value="takeaway">Pickup / takeaway</option><option value="delivery">Home delivery</option></select></label>
            <label>Preferred time *<input required type="time" value={receiptEdit.preferred_time} onChange={(event) => setReceiptEdit((current) => ({ ...current, preferred_time: event.target.value }))} /></label>
            {receiptEdit.order_type === "delivery" && <label className="manual-receipt-wide">Delivery address *<textarea required minLength={6} maxLength={500} rows={2} value={receiptEdit.delivery_address} onChange={(event) => setReceiptEdit((current) => ({ ...current, delivery_address: event.target.value }))} /></label>}
            {receiptEdit.order_type === "delivery" && <label>Delivery charge (€) *<input required type="number" min="0" step="0.01" value={receiptEdit.delivery_charge} onChange={(event) => setReceiptEdit((current) => ({ ...current, delivery_charge: event.target.value }))} /></label>}
            <label>Payment method<select value={receiptEdit.payment_method} onChange={(event) => setReceiptEdit((current) => ({ ...current, payment_method: event.target.value }))}><option value="pay_on_delivery">Pay on delivery or pickup</option><option value="iban_transfer">Bank transfer</option><option value="mobile_scan_pay">MobilePay QR</option></select></label>
            <label>Discount type<select value={receiptEdit.discount_type} onChange={(event) => setReceiptEdit((current) => ({ ...current, discount_type: event.target.value, discount_value: "" }))}><option value="percent">Percentage (%)</option><option value="flat">Fixed amount (€)</option></select></label>
            <label>Discount value<input type="number" min="0" step="0.01" max={receiptEdit.discount_type === "percent" ? "100" : undefined} value={receiptEdit.discount_value} onChange={(event) => setReceiptEdit((current) => ({ ...current, discount_value: event.target.value }))} /></label>
            <label className="manual-receipt-wide">Customer note<textarea maxLength={1000} rows={2} value={receiptEdit.customer_notes} onChange={(event) => setReceiptEdit((current) => ({ ...current, customer_notes: event.target.value }))} /></label>
          </div>
          <strong>Update purchased items</strong>
          <div className="manual-receipt-categories">{menuCategories.map((category) => <button type="button" key={category} className={`button ${receiptEditCategory === category ? "button-primary" : "button-outline"}`} aria-expanded={receiptEditCategory === category} onClick={() => setReceiptEditCategory(receiptEditCategory === category ? "" : category)}>{category}</button>)}</div>
          {receiptEditCategory && <div className="manual-receipt-items" role="region" aria-label={`Edit ${receiptEditCategory} items`}>
            {menuItems.filter((item) => item.main_category === receiptEditCategory).map((item) => <label key={item.item_id}><span>{item.display_code ? `(${item.display_code}) ` : ""}{item.item_name} · €{money(item.price_eur)}</span><input aria-label={`Receipt quantity of ${item.item_name}`} type="number" min="0" max="100" value={receiptEditItems[item.item_id] || ""} onChange={(event) => setReceiptEditItems((current) => ({ ...current, [item.item_id]: event.target.value }))} /></label>)}
          </div>}
          <div className="form-actions"><button type="submit" className="button button-primary" disabled={manualSaving}>{manualSaving ? "Saving edits..." : "Save receipt edits"}</button></div>
        </form>}
      </section>
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
            <thead><tr><th>Receipt</th><th>Date</th><th>Customer</th><th>Items</th><th>Order type</th><th>Discount</th><th>Final total</th><th>Status</th><th>Receipt remark</th><th>Receipt actions</th></tr></thead>
            <tbody>{filteredOrders.map((order) => <tr key={order.order_id}>
              <td>#{order.receipt_number || order.order_id}</td>
              <td>{order.created_at ? new Date(order.created_at).toLocaleString() : "—"}</td>
              <td><strong>{order.customer_name}</strong><small>{order.customer_phone}</small></td>
              <td>{(order.items || []).map((item, index) => <small key={`${item.item_id}-${index}`}>{item.item_name} × {item.quantity}</small>)}</td>
              <td>{order.order_type === "delivery" ? "Home delivery" : "Takeaway"}</td>
              <td>{Number(order.discount_percent) > 0 ? `${money(order.discount_percent)}%` : Number(order.discount_amount) > 0 ? "Flat" : "—"} / −€{money(order.discount_amount)}</td>
              <td>€{money(order.total_amount)}</td>
              <td><select aria-label={`Status for order ${order.receipt_number || order.order_id}`} value={order.order_status} disabled={Boolean(updatingStatuses[order.order_id])} onChange={(event) => changeReceiptStatus(order, event.target.value)}>{["pending", "confirmed", "preparing", "ready", "completed", "cancelled"].map((orderStatus) => <option key={orderStatus} value={orderStatus}>{orderStatus}</option>)}</select></td>
              <td><div className="receipt-remark-editor"><textarea aria-label={`Receipt remark for order ${order.receipt_number || order.order_id}`} rows={2} maxLength={1000} value={receiptRemarks[order.order_id] ?? ""} onChange={(event) => setReceiptRemarks((current) => ({ ...current, [order.order_id]: event.target.value }))} /><button type="button" className="button button-outline" disabled={Boolean(savingRemarks[order.order_id])} onClick={() => saveReceiptRemark(order)}>{savingRemarks[order.order_id] ? "Saving…" : "Save remark"}</button></div></td>
              <td><div className="order-action-buttons"><button type="button" className="button" onClick={() => printPdfReceipt(order)}>Print PDF receipt</button><button type="button" className="button button-outline" onClick={() => printReceipt(order, true)}>Download first-page image</button><button type="button" className="button button-outline" onClick={() => openReceiptEditor(order)}>Edit receipt</button><button type="button" className="button button-outline" onClick={() => removeReceiptOrder(order)}>Delete order</button></div></td>
            </tr>)}</tbody>
          </table>
        </div>}
      </>}
    </div>
  );
}
