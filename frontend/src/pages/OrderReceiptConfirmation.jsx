import React from "react";
import { renderLetterheadHtml, letterheadStyles } from "../../../shared/letterhead.js";

const euro = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR" });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function receiptDocument(confirmation, orderNumber, items) {
  const date = confirmation?.createdAt ? new Date(confirmation.createdAt) : new Date();
  const dateText = Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("fi-FI");
  const money = (value) => Number.isFinite(Number(value)) ? euro.format(Number(value)) : "—";
  const deliveryPending = Boolean(confirmation?.deliveryChargePendingManualReview);
  const deliveryCharge = deliveryPending ? "Vahvistetaan / To be confirmed" : money(confirmation?.deliveryCharge);
  const orderType = confirmation?.orderType === "delivery"
    ? "Kotiinkuljetus / Home delivery"
    : "Nouto / Takeaway";
  const lines = items.map((item) => `
    <tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.quantity)}</td>
      <td>${money(item.unitPrice)}</td>
      <td>${money(item.lineTotal)}</td>
    </tr>`).join("");
  const addressRow = confirmation?.deliveryAddress
    ? `<p><strong>Toimitusosoite / Delivery address:</strong><br>${escapeHtml(confirmation.deliveryAddress)}</p>`
    : "";
  const preferredTimeRow = confirmation?.preferredTime
    ? `<p><strong>Toivottu ${confirmation?.orderType === "delivery" ? "toimitusaika" : "noutoaika"} / Preferred ${confirmation?.orderType === "delivery" ? "delivery" : "pickup"} time:</strong> ${escapeHtml(confirmation.preferredTime)}</p>`
    : "";
  const notesRow = confirmation?.customerNotes
    ? `<p><strong>Lisätiedot / Instructions:</strong><br>${escapeHtml(confirmation.customerNotes)}</p>`
    : "";
  const total = confirmation?.totalAmount ?? confirmation?.subtotal;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Desi Dawat receipt ${escapeHtml(orderNumber)}</title>
<style>
*{box-sizing:border-box}body{max-width:780px;margin:32px auto;padding:32px;color:#34251f;background:#fff;font:16px/1.6 Arial,sans-serif;border:1px solid #decda9;border-top:6px solid #781e2a;border-radius:12px}h1{margin:0;color:#781e2a;font:700 30px Georgia,serif}.receipt-title{padding:12px 16px;background:#fbf3e5;color:#781e2a;border-radius:8px;font-weight:700}.details p{margin:12px 0}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{padding:11px 9px;border-bottom:1px solid #e9dfd1;text-align:left}th{background:#781e2a;color:#fff}td:nth-child(n+2),th:nth-child(n+2){text-align:right}.total{display:flex;justify-content:space-between;padding:15px 18px;background:#fff2d2;border-left:5px solid #c58b28;color:#781e2a;font-size:21px;font-weight:700}.pending{padding:14px;background:#fff5df;border-left:4px solid #c58b28}${letterheadStyles()}@media print{body{margin:0 auto;border-radius:0}}</style></head>
<body>${renderLetterheadHtml()}<div class="receipt-title">TILAUSKUITTI / ORDER RECEIPT · #${escapeHtml(orderNumber)}</div>
<section class="details"><p><strong>Päivämäärä / Date:</strong> ${escapeHtml(dateText)}</p><p><strong>Asiakas / Customer:</strong> ${escapeHtml(confirmation?.customerName || "—")}</p><p><strong>Puhelin / Phone:</strong> ${escapeHtml(confirmation?.customerPhone || "—")}</p><p><strong>Tilaustapa / Order type:</strong> ${orderType}</p>${addressRow}${preferredTimeRow}${notesRow}</section>
<h2>Tuotteet / Items</h2><table><thead><tr><th>Tuote / Item</th><th>Määrä / Qty</th><th>Hinta / Price</th><th>Yhteensä / Total</th></tr></thead><tbody>${lines}</tbody></table>
<p>Ruokien välisummaa / Food subtotal: <strong>${money(confirmation?.subtotal)}</strong></p>
<p>Toimitusmaksu / Delivery charge: <strong>${deliveryCharge}</strong></p>
<div class="total"><span>YHTEENSÄ / TOTAL</span><span>${money(total)}</span></div>
<p>Kiitos tilauksestasi! / Thank you for your order!</p></body></html>`;
}

export default function OrderReceiptConfirmation() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("order");
  let confirmation = null;

  try {
    const saved = sessionStorage.getItem("desiDawatOrderConfirmation");
    confirmation = saved ? JSON.parse(saved) : null;
  } catch {
    confirmation = null;
  }

  const items = Array.isArray(confirmation?.items) ? confirmation.items : [];
  const isAccepted = confirmation?.orderStatus === "confirmed";
  const isPending = confirmation?.orderStatus === "pending";
  const isUnverified = !isAccepted && !isPending;
  const orderNumber = isAccepted ? String(confirmation?.receiptNumber || "—") : "—";
  const hasSubtotal = Number.isFinite(Number(confirmation?.subtotal));
  const total = confirmation?.totalAmount ?? confirmation?.subtotal;

  return (
    <main className="order-confirmation-page">
      <section className="order-confirmation-card">
        <img src="/images/LOGO.jpeg" alt="Desi Dawat logo" className="confirmation-logo" />
        <div className="confirmation-success" aria-hidden="true">🎉 😊 ❤️</div>
        <h1>{isPending ? "Order request received — awaiting confirmation" : isUnverified ? "Order status unavailable" : confirmation?.deliveryChargePendingManualReview ? "Your order is accepted; delivery fee pending" : "Your order has been placed and accepted"}</h1>
        <h2>{isPending ? "Tilauspyyntö vastaanotettu — odottaa vahvistusta" : isUnverified ? "Tilauksen tila ei ole saatavilla" : confirmation?.deliveryChargePendingManualReview ? "Tilauksesi on hyväksytty; toimitusmaksu vahvistetaan" : "Tilauksesi on tehty ja hyväksytty"}</h2>

        {isPending && (
          <p className="notice" role="status">
            {confirmation?.confirmationReason || confirmation?.orderMessage || "The restaurant will review your preferred time and confirm your order and share a receipt if feasible. / Ravintola tarkistaa toivomasi ajan ja vahvistaa tilauksen sekä lähettää kuitin, jos se on mahdollista."}
          </p>
        )}
        {isUnverified && (
          <p className="notice" role="status">Vahvistusta ei voitu ladata. Ota yhteyttä ravintolaan ennen kuin oletat tilauksen olevan hyväksytty.<br /><em>We could not load the order confirmation. Please contact the restaurant before assuming the order was accepted.</em></p>
        )}

        {confirmation?.deliveryChargePendingManualReview && (
          <p className="notice">Your order is accepted. The restaurant will verify the delivery address and confirm the delivery charge and final total.<br /><em>Tilauksesi on hyväksytty. Ravintola tarkistaa toimitusosoitteen ja vahvistaa toimitusmaksun sekä loppusumman.</em></p>
        )}
        {isAccepted && orderId && <p className="confirmation-order-number">Tilausnumero / Order number: <strong>#{orderNumber}</strong></p>}
        {confirmation?.preferredTime && <p className="confirmation-order-number">{confirmation.orderType === "delivery" ? "Toivottu toimitusaika / Preferred delivery time" : "Toivottu noutoaika / Preferred pickup time"}: <strong>{confirmation.preferredTime}</strong></p>}

        <p className="confirmation-update">
          Päivitämme sinulle tilauksesi tilanteesta pian ja voimme ottaa sinuun yhteyttä, jos tilauksen tiedot tarvitsevat vahvistusta.
          <br />
          <em>We will update you about your order soon and may contact you if any order details need confirmation.</em>
        </p>
        <p className="confirmation-whatsapp-contact">
          Kysyttävää? Lähetä meille viesti WhatsAppissa.
          <br />
          <em>Have a question? Message us on WhatsApp.</em>
          <br />
          <a className="confirmation-whatsapp-link" href="https://wa.me/358449803211" target="_blank" rel="noopener noreferrer">WhatsApp: +358 44 980 3211</a>
        </p>
        <h3>Tilauksesi sisältää / Your order consists of:</h3>
        {items.length ? (
          <ol className="confirmation-items">
            {items.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                <span>{item.name} × {item.quantity}</span>
                {Number.isFinite(Number(item.lineTotal)) && <strong>{euro.format(Number(item.lineTotal))}</strong>}
              </li>
            ))}
          </ol>
        ) : (
          <p>Tilauksesi tietoja ei ole saatavilla tässä selainistunnossa.<br /><em>Your order details are not available in this browser session.</em></p>
        )}

        {hasSubtotal && (
          <div className="confirmation-receipt-summary">
            <p><span>Ruokien välisummaa / Food subtotal</span><strong>{euro.format(Number(confirmation.subtotal))}</strong></p>
            <p><span>Toimitusmaksu / Delivery charge</span><strong>{confirmation.deliveryChargePendingManualReview ? "Vahvistetaan / Pending" : euro.format(Number(confirmation.deliveryCharge || 0))}</strong></p>
            <p className="confirmation-total"><span>Yhteensä / Total</span><strong>{euro.format(Number(total))}</strong></p>
          </div>
        )}

        <div className="confirmation-message">
          <h3>Maksaminen / Payment</h3>
          <p>Tilaustasi koskeva kuitti lähetetään, kun tilauksesi on valmis.<br /><em>We will share your order receipt once your order is completed.</em></p>
          <p>{isPending || isUnverified
            ? <>Odota ravintolan vahvistusta ennen maksamista.<br /><em>Please wait for the restaurant’s confirmation and receipt before paying.</em></>
            : <>Voit maksaa millä tahansa kuitissa mainituista maksutavoista.<br /><em>You may pay using any of the payment methods listed on your receipt.</em></>}</p>
        </div>

        <p className="confirmation-thanks">Kiitos tilauksestasi! / Thank you for choosing Desi Dawat! ❤️</p>
        <div className="confirmation-actions">
          <button type="button" className="add-to-cart-btn" onClick={() => {
            sessionStorage.removeItem("desiDawatOrderConfirmation");
            window.location.href = "/";
          }}>
            Return to Menu / Palaa ruokalistaan
          </button>
        </div>
      </section>
    </main>
  );
}
