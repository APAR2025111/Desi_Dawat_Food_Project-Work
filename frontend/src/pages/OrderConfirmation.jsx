
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
  const paymentMethod = confirmation?.paymentMethod || "pay_on_delivery";

  const isDelivery = confirmation?.orderType === "delivery";
  const isPayOnDelivery = paymentMethod === "pay_on_delivery";

  return (
    <main className="order-confirmation-page">
      <section className="order-confirmation-card">
        <img
          src="/images/LOGO.jpeg"
          alt="Desi Dawat logo"
          className="confirmation-logo"
        />

        <div className="confirmation-success">🎉 😊 ❤️</div>

        <h1>Your order has been accepted!</h1>
        <h2>Tilauksesi on hyväksytty!</h2>

        {orderId && (
          <p className="confirmation-order-number">
            Order number: {orderId}
          </p>
        )}

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

        <div className="confirmation-message">
          {isPayOnDelivery ? (
            <>
              <h3>Pay on Delivery / Maksu toimituksen yhteydessä</h3>
              <p>
                Please pay when your order is delivered or collected.
                Thank you for choosing us! 😊
              </p>
              <p>
                <em>
                  Ole hyvä ja maksa tilauksen toimituksen tai noudon
                  yhteydessä. Kiitos, että valitsit meidät! 😊
                </em>
              </p>
            </>
          ) : (
            <>
              <h3>
                {paymentMethod === "iban_transfer"
                  ? "Bank Transfer / Tilisiirto"
                  : "Mobile Scan Pay / Mobiilimaksu"}
              </h3>
              <p>
                Please show your payment confirmation during delivery or
                pickup. No worries—your order has been accepted! We will
                update you about its status and deliver it soon. 😊
              </p>
              <p>
                <em>
                  Ole hyvä ja näytä maksuvahvistus toimituksen tai noudon
                  yhteydessä. Ei huolta – tilauksesi on hyväksytty!
                  Ilmoitamme sinulle tilauksesi tilanteesta ja toimitamme
                  sen pian. 😊
                </em>
              </p>
            </>
          )}
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
