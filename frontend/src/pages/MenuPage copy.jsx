import React, { useEffect, useMemo, useState } from "react";

import { getMenu, getOpeningHours } from "../api.js";

const euro = new Intl.NumberFormat("fi-FI", {

  style: "currency",

  currency: "EUR",

});

const foodImages = {

  "bread pakoda": "Bread Pakoda.png",

  "chilli paneer": "Chilli Paneer.png",

  "chili paneer": "Chilli Paneer.png",

  chole: "Chole.png",

  "chana masala": "Chole.png",

  "dahi vada": "Dahi Vada.png",

  "dal makhani": "Dal Makhani.png",

  "kadai paneer": "Kadai Paneer.png",

  "karahi paneer": "Kadai Paneer.png",

  "lobio e khas": "Lobio-e-Khas.png",

  "lobio-e-khas": "Lobio-e-Khas.png",

  "mushroom e khas": "Mushroom-e-Khas.png",

  "mushroom-e-khas": "Mushroom-e-Khas.png",

  "palak e khas": "Palak-e-Khas.png",

  "palak-e-khas": "Palak-e-Khas.png",

  "paneer kofta": "Paneer Kofta.png",

  "paneer tikka masala": "Paneer Tikka Masala.png",

  "shahi paneer": "Shahi Paneer.png",

  "veg pulav": "Vegetable_Pulav.png",

  "veg pulao": "Vegetable_Pulav.png",

  "vegetable pulav": "Vegetable_Pulav.png",

  "vegetable pulao": "Vegetable_Pulav.png",

};

function getDishImage(itemName) {

  const name = String(itemName || "").trim().toLowerCase();

  const filename = foodImages[name];

  return filename

    ? `/images/${encodeURIComponent(filename)}`

    : null;

}

export default function MenuPage() {

  const [items, setItems] = useState([]);

  const [search, setSearch] = useState("");

  const [category, setCategory] = useState("All");

  const [cart, setCart] = useState([]);

  // Checkout form state

  const [checkoutOpen, setCheckoutOpen] = useState(false);

  const [customerName, setCustomerName] = useState("");

  const [customerPhone, setCustomerPhone] = useState("");

  const [orderType, setOrderType] = useState("delivery");

  const [paymentMethod, setPaymentMethod] = useState("pay_on_delivery");

  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryQuote, setDeliveryQuote] = useState(null);
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);

  const [customerNotes, setCustomerNotes] = useState("");

  const [checkoutError, setCheckoutError] = useState("");

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState("");

  const [isReviewingOrder, setIsReviewingOrder] = useState(false);

  const [isPaymentStep, setIsPaymentStep] = useState(false);

  const [openingHours, setOpeningHours] = useState([]);

  const [hoursLoading, setHoursLoading] = useState(true);

  // Load menu from the backend.

  useEffect(() => {

    getMenu()

      .then((data) => setItems(Array.isArray(data) ? data : []))

      .catch((err) => setError(err.message || "Unable to load menu."))

      .finally(() => setLoading(false));

  }, []);

  // Load opening hours from the backend.

useEffect(() => {

  getOpeningHours()

    .then((data) => {

      setOpeningHours(Array.isArray(data) ? data : []);

    })

    .catch((err) => {

      console.error("Unable to load opening hours:", err);

      setOpeningHours([]);

    })

    .finally(() => setHoursLoading(false));

}, []);

  // Menu categories.

  const categories = useMemo(

    () => [

      "All",

      ...new Set(

        items.map((item) => item.main_category).filter(Boolean)

      ),

    ],

    [items]

  );

  // Search and category filtering.

  const visibleItems = useMemo(() => {

    const term = search.trim().toLowerCase();

    return items.filter((item) => {

      const matchesCategory =

        category === "All" || item.main_category === category;

      const matchesSearch =

        !term ||

        [

          item.item_name,

          item.main_category,

          item.subcategory,

          item.short_information,

        ].some((value) =>

          String(value || "").toLowerCase().includes(term)

        );

      return matchesCategory && matchesSearch;

    });

  }, [items, search, category]);

  // Add a dish or increase its quantity.

  function addToCart(item) {

    setCart((previousCart) => {

      const existingItem = previousCart.find(

        (cartItem) => cartItem.item_id === item.item_id

      );

      if (existingItem) {

        return previousCart.map((cartItem) =>

          cartItem.item_id === item.item_id

            ? {

                ...cartItem,

                quantity: cartItem.quantity + 1,

              }

            : cartItem

        );

      }

      return [...previousCart, { ...item, quantity: 1 }];

    });

  }

  // Decrease quantity.

  function decreaseQuantity(itemId) {

    setCart((previousCart) =>

      previousCart

        .map((item) =>

          item.item_id === itemId

            ? { ...item, quantity: item.quantity - 1 }

            : item

        )

        .filter((item) => item.quantity > 0)

    );

  }

  // Remove a dish.

  function removeFromCart(itemId) {

    setCart((previousCart) =>

      previousCart.filter((item) => item.item_id !== itemId)

    );

  }

  // Number of individual dishes.

  const cartCount = cart.reduce(

    (total, item) => total + item.quantity,

    0

  );

  // Cart subtotal.

  const cartTotal = cart.reduce(

    (total, item) =>

      total + Number(item.price_eur) * item.quantity,

    0

  );

  // Scroll to the full cart.

  function scrollToCart() {

    document.getElementById("cart")?.scrollIntoView({

      behavior: "smooth",

      block: "start",

    });

  }

  // Open checkout.

  function openCheckout() {

    if (cart.length === 0) {

      setCheckoutError("Please add at least one dish to your cart.");

      return;

    }

    setCheckoutError("");

    setCheckoutOpen(true);

    setTimeout(() => {

      document.getElementById("checkout")?.scrollIntoView({

        behavior: "smooth",

        block: "start",

      });

    }, 0);

  }

  // Submit the checkout form to the backend.

function handleCheckoutSubmit(event) {

  event.preventDefault();

  const name = customerName.trim();

  const phone = customerPhone.trim();

  if (!name || !/^[A-Za-zÀ-ÖØ-öø-ÿ\s'-]+$/.test(name)) {

    setCheckoutError("Please enter a valid customer name using letters only.");

    return;

  }

  if (

    !/^[+]?[0-9\s()-]{7,20}$/.test(phone) ||

    phone.replace(/\D/g, "").length < 7

  ) {

    setCheckoutError("Please enter a valid phone number with at least 7 digits.");

    return;

  }

  if (cart.length === 0) {

    setCheckoutError("Your cart is empty.");

    return;

  }

  if (orderType === "delivery" && !deliveryAddress.trim()) {

    setCheckoutError("Please enter your delivery address.");

    return;

  }

  setCheckoutError("");

  setIsPaymentStep(false);
        setIsReviewingOrder(true);

}

  return (

    <>

      {/* Floating cart at the top-right. */}

      <button

        type="button"

        className="floating-cart"

        onClick={scrollToCart}

        aria-label={`Shopping cart with ${cartCount} items`}

      >

        <span>🛒 Cart ({cartCount})</span>

        <span>{euro.format(cartTotal)}</span>

      </button>

      {/* Promotional banner. */}

      <section className="promo-banner">

        <div className="promo-main">

          <div className="promo-finnish">

            <span className="promo-eyebrow">DESI DAWAT · OULU</span>

            <h1>AITOA INTIALAISTA RUOKAA</h1>

            <p className="promo-subtitle">

              Tuoretta intialaista kasvisruokaa

            </p>

            <div className="promo-services">

              <div className="promo-service">

                <span className="promo-icon">🛵</span>

                <span>

                  <strong>Kotiinkuljetus</strong>

                  <small>Tilaa herkullista ruokaa kotiin</small>

                </span>

              </div>

              <div className="promo-service">

                <span className="promo-icon">📍</span>

                <span>

                  <strong>Nouto saatavilla</strong>

                  <small>Oulu, Suomi</small>

                </span>

              </div>

            </div>

            <a

              className="promo-phone"

              href="https\\://wa.me/358449803211"

              target="\_blank"

              rel="noreferrer"

            >

              WhatsApp / Soita: +358 449803211

            </a>

 <p className="promo-address">

  ✉️ Sähköposti:{" "}

  <a href="mailto:desidawat.food\@gmail.com">

    desidawat.food\@gmail.com

  </a>

</p>

            <p className="promo-address">

              📍 Pateniementie 59, 90800 Oulu

            </p>

          </div>

          <div className="promo-divider" />

          <div className="promo-english">

            <h2>AUTHENTIC INDIAN FOOD</h2>

            <p className="promo-subtitle">

              Fresh Indian vegetarian food

            </p>

            <div className="promo-services">

              <div className="promo-service">

                <span className="promo-icon">🛵</span>

                <span>

                  <strong>Home delivery</strong>

                  <small>Order delicious food to your home</small>

                </span>

              </div>

              <div className="promo-service">

                <span className="promo-icon">📍</span>

                <span>

                  <strong>Takeaway available</strong>

                  <small>Oulu, Finland</small>

                </span>

              </div>

            </div>

            <a

              className="promo-phone"

              href="https\\://wa.me/358449803211"

              target="\_blank"

              rel="noreferrer"

            >

              WhatsApp / Call: +358 449803211

            </a>

            <p className="promo-address">

  ✉️ Email:{" "}

  <a href="mailto:desidawat.food\@gmail.com">

    desidawat.food\@gmail.com

  </a>

</p>

            <p className="promo-address">

              📍 Pateniementie 59, 90800 Oulu

            </p>

          </div>

        </div>

        <div className="promo-brand">

          <img

            src="/images/LOGO.jpeg"

            alt="Desi Dawat Food and Catering logo"

          />

          <h2>Desi Dawat</h2>

          <p>FOOD &amp; CATERING</p>

          <div className="promo-gold-line" />

          <p className="promo-brand-tagline">

            Vegetarian Indian Kitchen

          </p>

        </div>

      </section>

{/* Opening Hours */}

<section className="opening-hours-section">

  <div className="opening-hours-card">

    <h2>AUKIOLOAJAT / OPENING HOURS</h2>

    <p className="opening-hours-subtitle">

      Aukioloajat / Opening Hours

    </p>

    {hoursLoading ? (

      <p>Loading opening hours...</p>

    ) : openingHours.length > 0 ? (

      openingHours.map((day) => (

        <div className="opening-hours-row" key={day.day_key}>

          <span>

            <strong>{day.day_fi}</strong>

            <small>{day.day_en}</small>

          </span>

          <strong>

            {day.is_closed

              ? "Suljettu / Closed"

              : `${String(day.open_time).slice(0, 5)}–${String(

                  day.close_time

                ).slice(0, 5)}`}

          </strong>

        </div>

      ))

    ) : (

      <p>Opening hours are currently unavailable.</p>

    )}

    <p className="opening-hours-welcome">

      Lämpimästi tervetuloa!

      <small>Welcome to Desi Dawat!</small>

    </p>

  </div>

</section>

      {/* Menu. */}

      <section className="menu-section" id="menu">

        <div className="section-heading">

          <div>

            <span className="eyebrow">MADE WITH CARE</span>

            <h2>Our menu</h2>

          </div>

          <span className="item-count">

            {loading ? "Loading menu…" : `${visibleItems.length} dishes`}

          </span>

        </div>

        <div className="menu-controls">

          <input

            aria-label="Search menu"

            value={search}

            onChange={(event) => setSearch(event.target.value)}

            placeholder="Search dishes…"

          />

          <div className="category-list">

            {categories.map((value) => (

              <button

                key={value}

                type="button"

                className={`category-chip ${

                  category === value ? "active" : ""

                }`}

                onClick={() => setCategory(value)}

              >

                {value}

              </button>

            ))}

          </div>

        </div>

        {loading && (

          <div className="notice">

            Loading the menu from the database…

          </div>

        )}

        {error && (

          <div className="notice error">

            <strong>Could not load the menu.</strong>

            <br />

            {error}

            <br />

            Check the backend server and MySQL connection.

          </div>

        )}

        {!loading && !error && visibleItems.length === 0 && (

          <div className="notice">No dishes match your search.</div>

        )}

        <div className="menu-grid">

          {visibleItems.map((item) => {

            const imageUrl = getDishImage(item.item_name);

            return (

              <article className="menu-card" key={item.item_id}>

                {imageUrl ? (

                  <div className="dish-photo-wrap">

                    <img

                      className="dish-photo"

                      src={imageUrl}

                      alt={item.item_name}

                      loading="lazy"

                      onError={(event) => {

                        event.currentTarget.style.display = "none";

                      }}

                    />

                  </div>

                ) : (

                  <div className="dish-art" aria-hidden="true">

                    <span>✦</span>

                    <b>

                      {item.item_name

                        ? item.item_name.slice(0, 1).toUpperCase()

                        : "D"}

                    </b>

                    <span>✦</span>

                  </div>

                )}

                <div className="menu-card-body">

                  <div className="card-kicker">

                    {item.subcategory || item.main_category}

                  </div>

                  <div className="dish-title-row">

                    <h3>{item.item_name}</h3>

                    <strong className="price">

                      {euro.format(Number(item.price_eur))}

                    </strong>

                  </div>

                  <p>

                    {item.short_information ||

                      "A delicious Indian vegetarian favourite."}

                  </p>

                  {item.quantity_serving && (

                    <small className="serving">

                      {item.quantity_serving}

                    </small>

                  )}

                  <button

                    type="button"

                    className="add-to-cart-btn"

                    onClick={() => addToCart(item)}

                  >

                    Add to Cart

                  </button>

                </div>

              </article>

            );

          })}

        </div>

      </section>

      {/* Shopping cart. */}

      <section className="cart-section" id="cart">

        <div className="section-heading">

          <div>

            <span className="eyebrow">YOUR ORDER</span>

            <h2>🛒 Shopping Cart ({cartCount})</h2>

          </div>

        </div>

        {cart.length === 0 ? (

          <p>Your cart is empty. Add some delicious dishes!</p>

        ) : (

          <>

            <div className="cart-items">

              {cart.map((item) => (

                <div className="cart-item" key={item.item_id}>

                  <div className="cart-item-info">

                    <strong>{item.item_name}</strong>

                    <span>

                      {euro.format(Number(item.price_eur))} each

                    </span>

                  </div>

                  <div className="cart-item-actions">

                    <button

                      type="button"

                      aria-label={`Decrease ${item.item_name} quantity`}

                      onClick={() => decreaseQuantity(item.item_id)}

                    >

                      −

                    </button>

                    <span>{item.quantity}</span>

                    <button

                      type="button"

                      aria-label={`Increase ${item.item_name} quantity`}

                      onClick={() => addToCart(item)}

                    >

                      +

                    </button>

                    <button

                      type="button"

                      onClick={() => removeFromCart(item.item_id)}

                    >

                      Remove

                    </button>

                  </div>

                  <strong>

                    {euro.format(Number(item.price_eur) * item.quantity)}

                  </strong>

                </div>

              ))}

            </div>

            <div className="cart-total">

              <strong>Order subtotal</strong>

              <strong>{euro.format(cartTotal)}</strong>

            </div>

            <p className="cart-note">

              Delivery charges, if applicable, are not included yet.

            </p>

            <button

              type="button"

              className="add-to-cart-btn"

              onClick={openCheckout}

            >

              Continue to Checkout

            </button>

            {checkoutError && (

              <p className="notice error" role="alert">

                {checkoutError}

              </p>

            )}

          </>

        )}

      </section>

      {/* Checkout form. */}

      {checkoutOpen && (

        <section className="cart-section checkout-section" id="checkout">

          <div className="section-heading">

            <div>

              <span className="eyebrow">ALMOST THERE</span>

              <h2>Checkout</h2>

            </div>

          </div>

          {!isReviewingOrder && (
          <form onSubmit={handleCheckoutSubmit}>

            <div className="checkout-field">

              <label htmlFor="customer-name">Full name *</label>

              <input

                id="customer-name"

                type="text"

                autoComplete="name"

                value={customerName}

                onChange={(event) => setCustomerName(event.target.value)}

                placeholder="Enter your full name"

                required

              />

            </div>

            <div className="checkout-field">

              <label htmlFor="customer-phone">Phone number *</label>

              <input

                id="customer-phone"

                type="tel"

                autoComplete="tel"

                value={customerPhone}

                onChange={(event) => setCustomerPhone(event.target.value)}

                placeholder="Enter your phone number"

                required

              />

            </div>

            <fieldset className="checkout-field">

              <legend>How would you like to receive your order? *</legend>

              <label>

                <input

                  type="radio"

                  name="order-type"

                  value="delivery"

                  checked={orderType === "delivery"}

                  onChange={() => setOrderType("delivery")}

                />

                Home delivery

              </label>

              <label>

                <input

                  type="radio"

                  name="order-type"

                  value="takeaway"

                  checked={orderType === "takeaway"}

                  onChange={() => setOrderType("takeaway")}

                />

                Takeaway / pickup

              </label>

            </fieldset>

            {orderType === "delivery" && (

              <div className="checkout-field">

                <label htmlFor="delivery-address">

                  Delivery address *

                </label>

                <textarea

                  id="delivery-address"

                  autoComplete="street-address"

                  value={deliveryAddress}

                  onChange={(event) =>

                    setDeliveryAddress(event.target.value)

                  }

                  placeholder="Street address, postal code and city"

                  rows={3}

                  required

                />

              </div>

            )}

            <div className="checkout-field">

              <label htmlFor="customer-notes">

                Additional instructions (optional)

              </label>

              <textarea

                id="customer-notes"

                value={customerNotes}

                onChange={(event) => setCustomerNotes(event.target.value)}

                placeholder="Any special instructions for your order?"

                rows={3}

              />

            </div>

           <div className="cart-total">

              <strong>Food subtotal</strong>

              <strong>{euro.format(cartTotal)}</strong>

            </div>

            <p className="cart-note">

              Delivery fees and payment will be confirmed before the order

              is submitted.

            </p>

            {checkoutError && (

              <p className="notice error" role="alert">

                {checkoutError}

              </p>

            )}

<button

  type="button"

  className="add-to-cart-btn"

  onClick={async () => {
    setCheckoutError("");
    if (cart.length === 0) {
      setCheckoutError("Your cart is empty.");
      return;
    }
    if (!customerName.trim() || !customerPhone.trim()) {
      setCheckoutError("Please enter your name and phone number.");
      return;
    }
    if (orderType === "delivery" && !deliveryAddress.trim()) {
      setCheckoutError("Please enter your delivery address.");
      return;
    }
    setDeliveryQuote(null);
    if (orderType === "delivery") {
      setDeliveryQuoteLoading(true);
      try {
        const response = await fetch("http://localhost:3001/api/delivery-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delivery_address: deliveryAddress.trim(), food_subtotal: Number(cartTotal.toFixed(2)) }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "Could not calculate the delivery charge.");
        setDeliveryQuote(data);
      } catch (error) {
        setCheckoutError(error.message || "Could not calculate the delivery charge.");
        setDeliveryQuoteLoading(false);
        return;
      }
      setDeliveryQuoteLoading(false);
    }
    setIsPaymentStep(false);
    setIsReviewingOrder(true);
  }}

>

  Review Order Details

</button>

            <button

              type="button"

              className="add-to-cart-btn"

              onClick={() => {

                setCheckoutOpen(false);

                setCheckoutError("");

              }}

            >

              Back to Cart

            </button>

          </form>
          )}

{isReviewingOrder && !isPaymentStep && (

  <div className="checkout-review">

    <h3>Review Your Order</h3>

    <p><strong>Customer:</strong> {customerName}</p>

    <p><strong>Phone:</strong> {customerPhone}</p>

    <p>

      <strong>Order type:</strong>{" "}

      {orderType === "delivery" ? "Home delivery" : "Takeaway / pickup"}

    </p>

    {orderType === "delivery" && (
      <>
        <p><strong>Delivery address:</strong> {deliveryAddress}</p>
        {deliveryQuote && (
          <>
            <p><strong>Driving distance from Lidl Pateniemi:</strong> {deliveryQuote.distance_km} km</p>
            <p><strong>Delivery charge:</strong> {euro.format(Number(deliveryQuote.delivery_charge))}</p>
            {deliveryQuote.message && <p className="cart-note">{deliveryQuote.message}</p>}
          </>
        )}
      </>
    )}

    <h4>Items</h4>

    {cart.map((item) => (

      <p key={item.item_id}>

        {item.item_name} × {item.quantity}

      </p>

    ))}

    <div className="cart-total">
      <strong>Food subtotal / Ruoan välisummaa</strong>
      <strong>{euro.format(cartTotal)}</strong>
    </div>
    {orderType === "delivery" && deliveryQuote && (
      <div className="cart-total">
        <strong>Delivery / Toimitus</strong>
        <strong>{euro.format(Number(deliveryQuote.delivery_charge))}</strong>
      </div>
    )}
    <div className="cart-total">
      <strong>Total / Yhteensä</strong>
      <strong>{euro.format(cartTotal + (orderType === "delivery" && deliveryQuote ? Number(deliveryQuote.delivery_charge) : 0))}</strong>
    </div>
    {deliveryQuoteLoading && <p className="notice">Calculating driving distance and delivery fee…</p>}

<button
      type="button"
      className="add-to-cart-btn"
      disabled={deliveryQuoteLoading || (orderType === "delivery" && !deliveryQuote)}
      onClick={() => {
        setCheckoutError("");
        setIsPaymentStep(true);
      }}
    >
      Continue to Payment / Siirry maksamaan
    </button>

    <button

      type="button"

      className="add-to-cart-btn"

      onClick={() => {
        setIsPaymentStep(false);
        setIsReviewingOrder(false);
        setCheckoutError("");
      }}

    >

      Back to Checkout

    </button>

  </div>

)}

        {isReviewingOrder && isPaymentStep && (
          <div className="checkout-review">
            <h3>Choose Payment Method / Valitse maksutapa</h3>
            <p><strong>Customer:</strong> {customerName}</p>
            <p><strong>Phone:</strong> {customerPhone}</p>
            <p><strong>Order type:</strong> {orderType === "delivery" ? "Home delivery" : "Takeaway / pickup"}</p>
            {orderType === "delivery" && <p><strong>Delivery address:</strong> {deliveryAddress}</p>}

            <h4>Your order consists of / Tilauksesi sisältää</h4>
            {cart.map((item, index) => (
              <p key={item.item_id}>
                {index + 1}. {item.item_name} × {item.quantity}
              </p>
            ))}
            <div className="cart-total">
              <strong>Food subtotal / Ruoan välisummaa</strong>
              <strong>{euro.format(cartTotal)}</strong>
            </div>
            {orderType === "delivery" && deliveryQuote && (
              <>
                <p><strong>Driving distance:</strong> {deliveryQuote.distance_km} km</p>
                <div className="cart-total">
                  <strong>Delivery charge / Toimitusmaksu</strong>
                  <strong>{euro.format(Number(deliveryQuote.delivery_charge))}</strong>
                </div>
              </>
            )}
            <div className="cart-total">
              <strong>Total / Yhteensä</strong>
              <strong>{euro.format(cartTotal + (orderType === "delivery" && deliveryQuote ? Number(deliveryQuote.delivery_charge) : 0))}</strong>
            </div>

            <div className="checkout-field">
              <label htmlFor="payment-method">Payment method / Maksutapa</label>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "20px", flexWrap: "wrap" }}>
                <select
                  id="payment-method"
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  required
                >
                  <option value="mobile_scan_pay">Mobile Scan Pay / Mobiilimaksu</option>
                  <option value="iban_transfer">Bank Transfer (IBAN) / Tilisiirto</option>
                  <option value="pay_on_delivery">Pay on Delivery / Maksu toimituksen yhteydessä</option>
                </select>
                {paymentMethod === "mobile_scan_pay" && (
                  <div style={{ textAlign: "center" }}>
                    <img
                      src="/images/MobilePay-QR.png.jpeg"
                      alt="Desi Dawat mobile payment QR code"
                      style={{ width: "240px", maxWidth: "100%", height: "auto", display: "block", borderRadius: "8px" }}
                    />
                    <p>Scan to pay / Skannaa maksaaksesi</p>
                  </div>
                )}
              </div>
            </div>

            {paymentMethod === "iban_transfer" && (
              <div className="checkout-field">
                <h3>Please pay your order amount to the following bank account:</h3>
                <p><em>Ole hyvä ja maksa tilauksesi summa seuraavalle pankkitilille:</em></p>
                <p><strong>Account Holder / Tilinhaltija:</strong> Ruchi Srivastava</p>
                <p><strong>Bank / Pankki:</strong> OP Bank, Finland</p>
                <p><strong>IBAN:</strong> FI6157445020094271</p>
                <p><strong>BIC/SWIFT:</strong> OKOYFIHH</p>
                <hr />
                <p><strong>After you place your order successfully, it will be accepted. 😊</strong></p>
                <p><em>Tilauksesi hyväksytään, kun olet lähettänyt sen onnistuneesti. 😊</em></p>
                <p>No worries — bank transfers may take some time to reach us and be confirmed. Please show payment confirmation during delivery or pickup. We will update you about your order status and deliver it soon. 😊</p>
                <p>Ei huolta — pankkisiirron saapuminen ja maksun vahvistaminen voivat kestää jonkin aikaa. Näytä maksuvahvistus toimituksen tai noudon yhteydessä. Ilmoitamme sinulle tilauksesi tilanteesta ja toimitamme sen pian. 😊</p>
                <p><strong>Thank you for choosing Desi Dawat!</strong><br /><em>Kiitos, että valitsit Desi Dawatin!</em></p>
              </div>
            )}

            {paymentMethod === "mobile_scan_pay" && (
              <div className="checkout-field">
                <p>Please show payment confirmation during delivery or pickup. We will update you about your order status and deliver it soon. 😊</p>
                <p><em>Näytä maksuvahvistus toimituksen tai noudon yhteydessä. Ilmoitamme sinulle tilauksesi tilanteesta ja toimitamme sen pian. 😊</em></p>
              </div>
            )}
            {paymentMethod === "pay_on_delivery" && (
              <div className="checkout-field">
                <p>You can pay when your order is delivered or collected. Thank you for choosing Desi Dawat! 😊</p>
                <p><em>Voit maksaa, kun tilauksesi toimitetaan tai noudat sen. Kiitos, että valitsit Desi Dawatin! 😊</em></p>
              </div>
            )}

            {checkoutError && <p className="notice error" role="alert">{checkoutError}</p>}

            <button
              type="button"
              className="add-to-cart-btn"
              onClick={async () => {
                setCheckoutError("");
                try {
                  const response = await fetch("http://localhost:3001/api/orders", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      customer_name: customerName.trim(),
                      customer_phone: customerPhone.trim(),
                      order_type: orderType,
                      payment_method: paymentMethod,
                      delivery_address: orderType === "delivery" ? deliveryAddress.trim() : null,
                      delivery_distance_km: orderType === "delivery" && deliveryQuote ? Number(deliveryQuote.distance_km) : null,
                      customer_notes: customerNotes.trim(),
                      items: cart.map((item) => ({ item_id: item.item_id, quantity: item.quantity })),
                    }),
                  });
                  const data = await response.json();
                  if (!response.ok) throw new Error(data.message || "Could not save your order.");
                  const confirmation = {
                    orderId: data.order_id,
                    paymentMethod,
                    orderType,
                    items: cart.map((item) => ({ name: item.item_name, quantity: item.quantity })),
                  };
                  sessionStorage.setItem("desiDawatOrderConfirmation", JSON.stringify(confirmation));
                  window.location.href = `/order-confirmation?order=${data.order_id}`;
                } catch (error) {
                  setCheckoutError(error.message || "Unable to submit your order. Please try again.");
                }
              }}
            >
              Confirm and Place Order / Vahvista ja tee tilaus
            </button>
            <button
              type="button"
              className="add-to-cart-btn"
              onClick={() => {
                setIsPaymentStep(false);
                setCheckoutError("");
              }}
            >
              Back to Order Review / Takaisin tilauksen tarkistukseen
            </button>
          </div>
        )}

        </section>

      )}

    </>

  );

}
