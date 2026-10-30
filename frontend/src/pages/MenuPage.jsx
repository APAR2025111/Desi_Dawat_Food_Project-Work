import React, { useEffect, useMemo, useState } from "react";
import { getMenu, getOpeningHours, getDeliveryQuote, submitOrder, resolveImageUrl } from "../api.js";
import { validateCheckoutDetails } from "../utils/checkoutValidation.js";
import { getPreferredTimeSlots } from "../utils/preferredTime.js";
const euro = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});
const foodImages = {
  "bread pakoda": "Bread Pakoda.webp",
  "chilli paneer": "Chilli Paneer.webp",
  "chili paneer": "Chilli Paneer.webp",
  chole: "Chole.webp",
  "chana masala": "Chole.webp",
  "dahi vada": "Dahi Vada.webp",
  "dal makhani": "Dal Makhani.webp",
  "kadai paneer": "Kadai Paneer.webp",
  "karahi paneer": "Kadai Paneer.webp",
  "lobio e khas": "Lobio-e-Khas.webp",
  "lobio-e-khas": "Lobio-e-Khas.webp",
  "mushroom e khas": "Mushroom-e-Khas.webp",
  "mushroom-e-khas": "Mushroom-e-Khas.webp",
  "palak e khas": "Palak-e-Khas.webp",
  "palak-e-khas": "Palak-e-Khas.webp",
  "paneer kofta": "Paneer Kofta.webp",
  "paneer tikka masala": "Paneer Tikka Masala.webp",
  "shahi paneer": "Shahi Paneer.webp",
  "veg pulav": "Vegetable_Pulav.webp",
  "veg pulao": "Vegetable_Pulav.webp",
  "vegetable pulav": "Vegetable_Pulav.webp",
  "vegetable pulao": "Vegetable_Pulav.webp",
};
function getDishImage(itemName) {
  const name = String(itemName || "").trim().toLowerCase();
  const filename = foodImages[name];
  return filename
    ? `/images/${encodeURIComponent(filename)}`
    : null;
}

function formatOpeningPeriods(day) {
  const periods = [];
  if (!day.morning_closed && day.morning_open && day.morning_close) {
    periods.push(`${String(day.morning_open).slice(0, 5)}–${String(day.morning_close).slice(0, 5)}`);
  }
  if (!day.evening_closed && day.evening_open && day.evening_close) {
    periods.push(`${String(day.evening_open).slice(0, 5)}–${String(day.evening_close).slice(0, 5)}`);
  }
  return periods.length ? periods.join(", ") : "Suljettu / Closed";
}

function getTodayOpeningHours(hours) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Helsinki",
    weekday: "short",
  }).format(new Date()).toLowerCase();
  const dayKey = weekday === "fri" ? "fri" : weekday === "sat" || weekday === "sun" ? weekday : "mon_thu";
  return hours.find((day) => day.day_key === dayKey);
}

function buildOpeningHoursRows(hours) {
  const groups = [
    { keys: ["mon_thu", "fri"], fi: "Maanantai–perjantai", en: "Monday–Friday" },
    { keys: ["sat", "sun"], fi: "Lauantai–sunnuntai", en: "Saturday–Sunday" },
  ];
  const rows = [];

  for (const group of groups) {
    const days = group.keys.map((key) => hours.find((day) => day.day_key === key)).filter(Boolean);
    if (!days.length) continue;
    const periods = days.map(formatOpeningPeriods);
    const useFirstWeekdaySchedule = group.keys[0] === "mon_thu" && days.length === group.keys.length;
    if (useFirstWeekdaySchedule || (days.length === group.keys.length && periods.every((period) => period === periods[0]))) {
      rows.push({ key: group.keys.join("-"), day_fi: group.fi, day_en: group.en, periods: [{ time: periods[0] }] });
    } else if (days.length === group.keys.length) {
      rows.push({
        key: group.keys.join("-"),
        day_fi: group.fi,
        day_en: group.en,
        periods: days.map((day, index) => ({
          label: `${day.day_fi || day.day_key} / ${day.day_en || day.day_key}`,
          time: periods[index],
        })),
      });
    } else {
      days.forEach((day) => rows.push({
        key: day.day_key,
        day_fi: day.day_fi || day.day_key,
        day_en: day.day_en || day.day_key,
        periods: [{ time: formatOpeningPeriods(day) }],
      }));
    }
  }
  return rows;
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
  const [preferredTime, setPreferredTime] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isReviewingOrder, setIsReviewingOrder] = useState(false);
  const [isPaymentStep, setIsPaymentStep] = useState(false);
  // Delivery estimate state for the customer order-review screen.
  const [deliveryQuote, setDeliveryQuote] = useState(null);
  // Track which address and subtotal produced the current quote so checkout can reuse it.
  const [deliveryQuoteKey, setDeliveryQuoteKey] = useState("");
  const [deliveryQuoteError, setDeliveryQuoteError] = useState("");
  const [deliveryQuoteLoading, setDeliveryQuoteLoading] = useState(false);
  const [showDeliveryReviewPrompt, setShowDeliveryReviewPrompt] = useState(false);
  const [manualDeliveryReview, setManualDeliveryReview] = useState(false);
  const [openingHours, setOpeningHours] = useState([]);
  const [hoursLoading, setHoursLoading] = useState(true);
  const openingHoursRows = useMemo(() => buildOpeningHoursRows(openingHours), [openingHours]);
  const todayOpeningHours = useMemo(() => getTodayOpeningHours(openingHours), [openingHours]);
  const preferredTimeSlots = useMemo(() => getPreferredTimeSlots(todayOpeningHours), [todayOpeningHours]);
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
        if (existingItem.quantity >= 100) {
          setCheckoutError("Maximum 100 of each dish per order.");
          return previousCart;
        }
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
  // Debounce address-based estimates while the customer types, and ignore stale responses.
  useEffect(() => {
    if (!checkoutOpen || orderType !== "delivery" || deliveryAddress.trim().length < 6) {
      setDeliveryQuote(null);
      setDeliveryQuoteKey("");
      setDeliveryQuoteError("");
      setDeliveryQuoteLoading(false);
      return undefined;
    }

    let isCurrentRequest = true;
    const quoteKey = JSON.stringify([deliveryAddress.trim(), Number(cartTotal.toFixed(2))]);
    setDeliveryQuote(null);
    setDeliveryQuoteKey("");
    setDeliveryQuoteError("");
    setDeliveryQuoteLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const quote = await getDeliveryQuote(deliveryAddress.trim(), cartTotal);
        if (isCurrentRequest) {
          setDeliveryQuote(quote);
          setDeliveryQuoteKey(quoteKey);
        }
      } catch (quoteError) {
        if (isCurrentRequest) {
          setDeliveryQuoteError(quoteError.message || "Could not calculate the delivery charge.");
        }
      } finally {
        if (isCurrentRequest) setDeliveryQuoteLoading(false);
      }
    }, 650);

    return () => {
      isCurrentRequest = false;
      window.clearTimeout(timer);
    };
  }, [checkoutOpen, orderType, deliveryAddress, cartTotal]);
  // Shared pricing summary appears on review and payment steps so the estimate stays visible.
  const orderPriceSummary = (
    <div className="checkout-price-summary" aria-live="polite">
      <div className="checkout-price-row">
        <span>Food subtotal</span>
        <strong>{euro.format(cartTotal)}</strong>
      </div>
      {orderType === "delivery" ? deliveryQuote ? (
        <>
          <div className="checkout-price-row">
            <span>Estimated delivery charge</span>
            <strong>{euro.format(deliveryQuote.delivery_charge)}</strong>
          </div>
          <div className="checkout-price-row checkout-price-total">
            <span>Estimated total</span>
            <strong>{euro.format(deliveryQuote.total_amount)}</strong>
          </div>
          <small>{deliveryQuote.message} Final charge is confirmed when the order is accepted.</small>
        </>
      ) : deliveryQuoteLoading ? (
        <p className="cart-note">Calculating estimated delivery charge…</p>
      ) : deliveryQuoteError ? (
        <>
          <div className="checkout-price-row">
            <span>Delivery charge</span>
            <strong>Pending confirmation</strong>
          </div>
          <p className="cart-note">We could not verify this address or delivery distance. Review the delivery information before continuing.</p>
        </>
      ) : (
        <p className="cart-note">Enter a complete delivery address to calculate the estimated charge automatically.</p>
      ) : (
        <>
          <div className="checkout-price-row">
            <span>Delivery charge</span>
            <strong>{euro.format(0)}</strong>
          </div>
          <div className="checkout-price-row checkout-price-total">
            <span>Estimated total</span>
            <strong>{euro.format(cartTotal)}</strong>
          </div>
        </>
      )}
    </div>
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
  }  // Submit the checkout form to the backend.
function handleCheckoutSubmit(event) {
  event.preventDefault();
  const validationError = validateCheckoutDetails({
    name: customerName,
    phone: customerPhone,
    orderType,
    address: deliveryAddress,
  });
  if (validationError) return setCheckoutError(validationError);
  if (!preferredTime || !preferredTimeSlots.includes(preferredTime)) {
    return setCheckoutError("Please select an available preferred delivery or pickup time.");
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
  void prepareOrderReview();
}
// Reuse the current address/subtotal quote; the backend recalculates again when the order is submitted.
async function prepareOrderReview() {
  setCheckoutError("");
  if (cart.length === 0) return setCheckoutError("Your cart is empty.");
  const validationError = validateCheckoutDetails({
    name: customerName,
    phone: customerPhone,
    orderType,
    address: deliveryAddress,
  });
  if (validationError) return setCheckoutError(validationError);
  if (!preferredTime || !preferredTimeSlots.includes(preferredTime)) {
    return setCheckoutError("Please select an available preferred delivery or pickup time.");
  }

  if (orderType === "delivery" && manualDeliveryReview) {
    setIsPaymentStep(false);
    setIsReviewingOrder(true);
    return;
  }

  const currentQuoteKey = JSON.stringify([deliveryAddress.trim(), Number(cartTotal.toFixed(2))]);
  const hasCurrentQuote = deliveryQuote && deliveryQuoteKey === currentQuoteKey;
  if (orderType === "delivery" && !hasCurrentQuote) {
    if (deliveryQuoteError) {
      setShowDeliveryReviewPrompt(true);
      return;
    }
    setDeliveryQuote(null);
    setDeliveryQuoteKey("");
    setDeliveryQuoteError("");
    setDeliveryQuoteLoading(true);
    try {
      const quote = await getDeliveryQuote(deliveryAddress.trim(), cartTotal);
      setDeliveryQuote(quote);
      setDeliveryQuoteKey(currentQuoteKey);
      setManualDeliveryReview(false);
    } catch (quoteError) {
      setDeliveryQuoteError(quoteError.message || "Could not calculate the delivery charge.");
      setShowDeliveryReviewPrompt(true);
      return;
    } finally {
      setDeliveryQuoteLoading(false);
    }
  }
  setIsPaymentStep(false);
  setIsReviewingOrder(true);
}
  return (
    <>
      {!checkoutOpen && <>
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
              href="https://wa.me/358449803211"
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp / Soita: +358 449803211
            </a>
 <p className="promo-address">
  ✉️ Sähköposti:{" "}
  <a href="mailto:desidawat.food@gmail.com">
    desidawat.food@gmail.com
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
              href="https://wa.me/358449803211"
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp / Call: +358 449803211
            </a>
            <p className="promo-address">
  ✉️ Email:{" "}
  <a href="mailto:desidawat.food@gmail.com">
    desidawat.food@gmail.com
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
    ) : openingHoursRows.length > 0 ? (
      openingHoursRows.map((day) => (
        <div className="opening-hours-row" key={day.key}>
          <span>
            <strong>{day.day_fi}</strong>
            <small>{day.day_en}</small>
          </span>
          <div className="opening-hours-sessions">
            {day.periods.map((period) => (
              <div key={`${period.label || day.key}-${period.time}`}>
                {period.label && <strong>{period.label}: </strong>}{period.time}
              </div>
            ))}
          </div>
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
            const imageUrl = resolveImageUrl(item.image_url) || getDishImage(item.item_name);
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
      </>}
      {/* Keep cart content in the DOM, but hide it on review/payment steps to avoid repeating order details. */}
      <section className="cart-section" id="cart" hidden={checkoutOpen}>
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
          <ol className="checkout-progress" aria-label="Checkout progress">
            {[
              { label: "Details", index: 0 },
              { label: "Review", index: 1 },
              { label: "Payment", index: 2 },
            ].map((step) => {
              const activeStep = isPaymentStep ? 2 : isReviewingOrder ? 1 : 0;
              const stepState = step.index === activeStep ? "current" : step.index < activeStep ? "complete" : "";
              return (
                <li className={stepState} key={step.label} aria-current={step.index === activeStep ? "step" : undefined}>
                  <span className="checkout-progress-number">{step.index + 1}</span>
                  <strong>{step.label}</strong>
                </li>
              );
            })}
          </ol>
          {/* Hide the checkout heading on the review/payment steps while keeping checkout available. */}
          <div className="section-heading" hidden={isReviewingOrder || isPaymentStep}>
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
                  onChange={() => {
                    setOrderType("delivery");
                    setManualDeliveryReview(false);
                  }}
                />
                Home delivery
              </label>
              <label>
                <input
                  type="radio"
                  name="order-type"
                  value="takeaway"
                  checked={orderType === "takeaway"}
                  onChange={() => {
                    setOrderType("takeaway");
                    setManualDeliveryReview(false);
                  }}
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
                  onChange={(event) => {
                    setDeliveryAddress(event.target.value);
                    setManualDeliveryReview(false);
                  }}
                  placeholder="Street address, postal code and city (Oulu)"
                  rows={3}
                  required
                />
              </div>
            )}
            <div className="preferred-time-row">
              <aside className="today-hours-card" aria-live="polite">
                <strong>Tämän päivän aukioloajat / Today’s opening hours</strong>
                <span>{hoursLoading ? "Ladataan… / Loading…" : todayOpeningHours ? formatOpeningPeriods(todayOpeningHours) : "Ei saatavilla / Unavailable"}</span>
              </aside>
              <div className="checkout-field">
                <label htmlFor="preferred-order-time">
                  {orderType === "delivery" ? "Preferred delivery time / Toivottu toimitusaika" : "Preferred pickup time / Toivottu noutoaika"} *
                </label>
                <select
                  id="preferred-order-time"
                  value={preferredTime}
                  onChange={(event) => setPreferredTime(event.target.value)}
                  required
                >
                  <option value="">
                    Choose a time / Valitse aika
                  </option>
                  {preferredTimeSlots.map((time) => <option key={time} value={time}>{time}</option>)}
                </select>
                <p className="preparation-time-note">Valmistamme kaikki tilaukset tuoreina. Valitse aika, joka antaa 45–60 minuuttia valmisteluun. Vahvistamme tarkan toimitus- tai noutoajan senhetkisen tilausjonon mukaan. / All orders are freshly prepared. Please choose a time that allows 45–60 minutes for preparation. We’ll confirm the exact delivery or pickup time based on the current order queue.</p>
              </div>
            </div>
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
            {orderPriceSummary}
<button
  type="button"
  className="add-to-cart-btn"
  onClick={prepareOrderReview}
  disabled={deliveryQuoteLoading}
>
  {deliveryQuoteLoading ? "Calculating delivery charge…" : "Review Order Details"}
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
          {showDeliveryReviewPrompt && !isReviewingOrder && (
            <div className="delivery-review-overlay" role="presentation">
              <section className="delivery-review-dialog" role="dialog" aria-modal="true" aria-labelledby="delivery-review-title">
                <h2 id="delivery-review-title">Address not found / delivery distance unverified</h2>
                <p>We couldn’t confirm this address or its delivery distance. This does not necessarily mean delivery is unavailable. Please check the route and distance in Google Maps. You may continue without an estimated delivery charge; if your order is accepted during opening hours, the restaurant will verify the address and confirm the charge with you.</p>
                <h3>Delivery charge criteria</h3>
                <ul>
                  <li>Food orders over €75: free delivery within 15 km.</li>
                  <li>Otherwise, up to 3 km: €2 for food orders under €15; free for €15 or more.</li>
                  <li>Over 3 km and up to 7 km: €3.50.</li>
                  <li>Over 7 km and up to 15 km: €6.</li>
                  <li>Over 15 km: outside the standard delivery area; contact the restaurant to confirm availability.</li>
                </ul>
                <div className="delivery-review-actions">
                  <button type="button" className="add-to-cart-btn" onClick={() => setShowDeliveryReviewPrompt(false)}>Edit address</button>
                  <button type="button" className="add-to-cart-btn" onClick={() => {
                    setManualDeliveryReview(true);
                    setShowDeliveryReviewPrompt(false);
                    setCheckoutError("");
                    setIsPaymentStep(false);
                    setIsReviewingOrder(true);
                  }}>Continue without estimated delivery charge</button>
                </div>
              </section>
            </div>
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
      <p><strong>Delivery address:</strong> {deliveryAddress}</p>
    )}
    <p><strong>{orderType === "delivery" ? "Preferred delivery time" : "Preferred pickup time"}:</strong> {preferredTime}</p>
    {orderType === "delivery" && manualDeliveryReview && (
      <p className="cart-note" role="status">No delivery charge is included yet. The restaurant will verify the address and confirm the delivery charge with you.</p>
    )}
    <h4>Items</h4>
    {cart.map((item) => (
      <p key={item.item_id}>
        {item.item_name} × {item.quantity}
      </p>
    ))}
    {orderPriceSummary}
    <div className="checkout-actions">
<button
      type="button"
      className="add-to-cart-btn"
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
  </div>
)}
        {isReviewingOrder && isPaymentStep && (
          <div className="checkout-review">
            <h3>Payment / Maksaminen</h3>
            <p><strong>Customer:</strong> {customerName}</p>
            <p><strong>Phone:</strong> {customerPhone}</p>
            <p><strong>Order type:</strong> {orderType === "delivery" ? "Home delivery" : "Takeaway / pickup"}</p>
            {orderType === "delivery" && <p><strong>Delivery address:</strong> {deliveryAddress}</p>}
            <p><strong>{orderType === "delivery" ? "Preferred delivery time" : "Preferred pickup time"}:</strong> {preferredTime}</p>
            {orderType === "delivery" && manualDeliveryReview && (
              <p className="cart-note" role="status">No delivery charge is included yet. The restaurant will verify the address and confirm the delivery charge with you.</p>
            )}
            <h4>Your order consists of / Tilauksesi sisältää</h4>
            {cart.map((item, index) => (
              <p key={item.item_id}>
                {index + 1}. {item.item_name} × {item.quantity}
              </p>
            ))}
            {orderPriceSummary}
            {/* Payment choices callout: highlight that customers can choose any method on the receipt. */}
            <div className="checkout-field checkout-payment-note">
              <p>You may pay using any of the payment methods listed on your receipt.</p>
              <p><em>Voit maksaa millä tahansa kuitissa mainituista maksutavoista.</em></p>
              <p>Confirm your order to complete checkout and receive your order confirmation.</p>
              <p><em>Vahvista tilaus viimeistelläksesi tilauksen ja saadaksesi tilausvahvistuksen.</em></p>
            </div>
            {checkoutError && <p className="notice error" role="alert">{checkoutError}</p>}
            <div className="checkout-actions">
            <button
              type="button"
              className="add-to-cart-btn"
              onClick={async () => {
                setCheckoutError("");
                try {
                  const data = await submitOrder({
                    customer_name: customerName.trim(),
                    customer_phone: customerPhone.trim(),
                    order_type: orderType,
                    payment_method: paymentMethod,
                    delivery_address: orderType === "delivery" ? deliveryAddress.trim() : null,
                    preferred_time: preferredTime,
                    delivery_charge_manual_review: orderType === "delivery" && manualDeliveryReview,
                    customer_notes: customerNotes.trim(),
                    items: cart.map((item) => ({ item_id: item.item_id, quantity: item.quantity })),
                  });
                  const confirmation = {
                    orderId: data.order_id,
                    orderStatus: data.order_status,
                    orderMessage: data.message,
                    confirmationReason: data.confirmation_reason,
                    receiptNumber: data.receipt_number || null,
                    receiptToken: data.receipt_token,
                    orderType,
                    paymentMethod,
                    customerName: customerName.trim(),
                    customerPhone: customerPhone.trim(),
                    deliveryAddress: orderType === "delivery" ? deliveryAddress.trim() : "",
                    preferredTime,
                    customerNotes: customerNotes.trim(),
                    createdAt: new Date().toISOString(),
                    subtotal: Number(cartTotal.toFixed(2)),
                    totalAmount: Number(data.total_amount),
                    deliveryChargePendingManualReview: Boolean(data.delivery_charge_pending_manual_review),
                    deliveryCharge: data.delivery_charge_pending_manual_review
                      ? null
                      : Number((Number(data.total_amount) - cartTotal).toFixed(2)),
                    items: cart.map((item) => ({
                      name: item.item_name,
                      quantity: item.quantity,
                      unitPrice: Number(item.price_eur),
                      lineTotal: Number((Number(item.price_eur) * item.quantity).toFixed(2)),
                    })),
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
          </div>
        )}
        </section>
      )}
    </>
  );
}
