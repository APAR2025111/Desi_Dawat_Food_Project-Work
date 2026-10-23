
import React from "react";

export default function OrderConfirmation() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("order");

  let confirmation = null;

  try {
    const saved = sessionStorage.getItem("desiDawatOrderConfirmation");
    confirmation = saved ? JSON.parse(saved) : null;
  } catch {
    confirmation = null;
  }

  const items = confirmation?.items || [];

  return (
    <main className="order-confirmation-page">
      <section className="order-confirmation-card">
        <img
          src="/images/LOGO.jpeg"
          alt="Desi Dawat logo"
          className="confirmation-logo"
        />

        <div className="confirmation-success">🎉 😊 ❤️</div>
        {/* Delivery review: make a manually quoted delivery charge clear to the customer. */}
        <h1>{confirmation?.deliveryChargePendingManualReview ? "Your order is saved; delivery fee pending" : "Your order has been accepted!"}</h1>
        <h2>{confirmation?.deliveryChargePendingManualReview ? "Tilaus tallennettu; toimitusmaksu vahvistetaan" : "Tilauksesi on hyväksytty!"}</h2>

        {confirmation?.deliveryChargePendingManualReview && (
          <p className="notice">We saved your order. The restaurant will verify the delivery address and confirm the delivery charge and final total before accepting it.<br /><em>Tallensimme tilauksesi. Ravintola tarkistaa toimitusosoitteen ja vahvistaa toimitusmaksun sekä loppusumman ennen tilauksen hyväksymistä.</em></p>
        )}
        {orderId && (
          <p className="confirmation-order-number">
            Order number: {orderId}
          </p>
        )}

        {/* Confirmation update: reassure customers that we will share order progress. */}
        <p className="confirmation-update">
          Pidämme sinut ajan tasalla tilauksesi etenemisestä.
          <br />
          <em>We will keep you updated about your order.</em>
          <br />
          Kuitti toimitetaan sinulle pian.
          <br />
          <em>We will share your receipt with you soon.</em>
        </p>

        <h3>Your order consists of:</h3>
        <p><em>Tilauksesi sisältää:</em></p>

        {items.length > 0 ? (
          <ol className="confirmation-items">
            {items.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                {item.name} — Quantity: {item.quantity}
              </li>
            ))}
          </ol>
        ) : (
          <p>
            Your order details are not available in this browser session.
            <br />
            <em>
              Tilauksesi tietoja ei ole saatavilla tässä selainistunnossa.
            </em>
          </p>
        )}

        {/* Confirmation payment: customers may use any method listed on their receipt. */}
        <div className="confirmation-message">
          <h3>Payment / Maksaminen</h3>
          <p>You may pay using any of the payment methods listed on your receipt.</p>
          <p><em>Voit maksaa millä tahansa kuitissa mainituista maksutavoista.</em></p>
        </div>

        <p className="confirmation-thanks">
          Thank you for choosing Desi Dawat! ❤️
          <br />
          <em>Kiitos, että valitsit Desi Dawatin!</em>
        </p>

        <button
          type="button"
          className="add-to-cart-btn"
          onClick={() => {
            sessionStorage.removeItem("desiDawatOrderConfirmation");
            window.location.href = "/";
          }}
        >
          Return to Menu / Palaa ruokalistaan
        </button>
      </section>
    </main>
  );
}
