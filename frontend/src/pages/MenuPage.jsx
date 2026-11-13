import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getMenu, getOpeningHours, getDeliveryQuote, getCustomerSession, getCustomerSurpriseRewards, submitOrder, resolveImageUrl } from "../api.js";
import { validateCheckoutDetails } from "../utils/checkoutValidation.js";
import { getPreferredTimeSlots } from "../utils/preferredTime.js";
import { getBilingualMenuLines } from "../utils/bilingualMenuText.js";
import { getSelectedCustomerRewardId, saveSelectedCustomerRewardId } from "../utils/customerRewardSelection.js";
import { useCustomerAccount } from "../CustomerAccount.jsx";
const euro = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});

const menuAllergenCodes = [
  ["A1", "Gluteenia sisältävät viljat / Cereals containing gluten"],
  ["A2", "Maapähkinät ja maapähkinätuotteet / Peanuts and peanut products"],
  ["A3", "Soijapavut ja soijapaputuotteet / Soybeans and soybean products"],
  ["A4", "Maito ja maitotuotteet (laktoosi mukaan lukien) / Milk and milk products (including lactose)"],
  ["A5", "Pähkinät ja pähkinätuotteet / Nuts and nut products"],
  ["A6", "Sinappi ja sinappituotteet / Mustard and mustard products"],
  ["A7", "Selleri ja sellerituotteet / Celery and celery products"],
  ["A8", "Seesaminsiemenet ja seesaminsiementuotteet / Sesame seeds and sesame seed products"],
  ["A9", "Rikkidioksidi ja sulfiitit (yli 10 mg/kg tai 10 mg/l kokonaisrikkidioksidina) / Sulphur dioxide and sulphites (above 10 mg/kg or 10 mg/l as total sulphur dioxide)"],
  ["A10", "Lupiinit ja lupiinituotteet / Lupin and lupin products"],
];
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

function getDeliveryTimeRanges(day) {
  if (!day) return [];
  return [
    { open: day.morning_open, close: day.morning_close, closed: day.morning_closed },
    { open: day.evening_open, close: day.evening_close, closed: day.evening_closed },
  ].flatMap(({ open, close, closed }) => {
    if (closed === true || Number(closed) === 1 || !open || !close) return [];
    const start = parseClockMinutes(open);
    const end = parseClockMinutes(close);
    return start == null || end == null || end < start ? [] : [{ start, end }];
  });
}

function parseClockMinutes(value) {
  const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour > 23 || minute > 59 ? null : hour * 60 + minute;
}

function getDeliveryHours(ranges) {
  const hours = new Set();
  ranges.forEach(({ start, end }) => {
    for (let hour = Math.floor(start / 60); hour <= Math.floor(end / 60); hour += 1) hours.add(hour);
  });
  return [...hours].sort((first, second) => first - second);
}

function getMinutesForDeliveryHour(hour, ranges) {
  const hourStart = hour * 60;
  const minutes = new Set();
  ranges.forEach(({ start, end }) => {
    const first = Math.max(start, hourStart);
    const last = Math.min(end, hourStart + 59);
    for (let value = first; value <= last; value += 1) minutes.add(value % 60);
  });
  return [...minutes].sort((first, second) => first - second);
}

function isTimeWithinDeliveryHours(time, ranges) {
  const minutes = parseClockMinutes(time);
  return minutes != null && ranges.some(({ start, end }) => minutes >= start && minutes <= end);
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
  const { state } = useLocation();
  const { customer: signedInCustomer } = useCustomerAccount();
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(null);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [detailsItem, setDetailsItem] = useState(null);
  const [cart, setCart] = useState(() => {
    try {
      const savedCart = JSON.parse(sessionStorage.getItem("desiDawatCart") || "[]");
      return Array.isArray(savedCart) ? savedCart : [];
    } catch {
      return [];
    }
  });
  // Checkout form state
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderType, setOrderType] = useState("delivery");
  const [paymentMethod, setPaymentMethod] = useState("pay_on_delivery");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [preferredTime, setPreferredTime] = useState("");
  const [deliveryTimePickerOpen, setDeliveryTimePickerOpen] = useState(false);
  const [deliveryTimePickerStep, setDeliveryTimePickerStep] = useState("hour");
  const [draftDeliveryHour, setDraftDeliveryHour] = useState(19);
  const [draftDeliveryMinute, setDraftDeliveryMinute] = useState(0);
  const [manualDeliveryHour, setManualDeliveryHour] = useState("19");
  const [manualDeliveryMinute, setManualDeliveryMinute] = useState("00");
  const [customerNotes, setCustomerNotes] = useState("");
  const [checkoutError, setCheckoutError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isReviewingOrder, setIsReviewingOrder] = useState(false);
  const [checkoutOffer, setCheckoutOffer] = useState(null);
  const [selectedSurpriseRewardId, setSelectedSurpriseRewardId] = useState("");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const customerToken = state?.checkoutAsGuest ? null : sessionStorage.getItem("desiDawatCustomerToken");
  useEffect(() => {
    if (!customerToken || !signedInCustomer) return;
    setCustomerName((current) => current.trim() ? current : signedInCustomer.customer_name || "");
    setCustomerPhone((current) => current.trim() ? current : signedInCustomer.customer_phone || "");
    setDeliveryAddress((current) => current.trim() ? current : signedInCustomer.delivery_address || "");
  }, [customerToken, signedInCustomer]);
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
  const hasInitializedDeliveryTime = useRef(false);
  const openingHoursRows = useMemo(() => buildOpeningHoursRows(openingHours), [openingHours]);
  const todayOpeningHours = useMemo(() => getTodayOpeningHours(openingHours), [openingHours]);
  const preferredTimeSlots = useMemo(() => getPreferredTimeSlots(todayOpeningHours), [todayOpeningHours]);
  const deliveryTimeRanges = useMemo(() => getDeliveryTimeRanges(todayOpeningHours), [todayOpeningHours]);
  const deliveryHours = useMemo(() => getDeliveryHours(deliveryTimeRanges), [deliveryTimeRanges]);
  const manualHourValue = deliveryHours.includes(Number(manualDeliveryHour))
    ? manualDeliveryHour
    : String(deliveryHours[0] ?? "");
  const minuteDialRef = useRef(null);
  const isPreferredTimeValid = (time) => orderType === "delivery"
    ? /^\d{2}:\d{2}$/.test(time) && isTimeWithinDeliveryHours(time, deliveryTimeRanges)
    : preferredTimeSlots.includes(time);
  useEffect(() => {
    try {
      sessionStorage.setItem("desiDawatCart", JSON.stringify(cart));
    } catch {
      // The cart remains usable even when browser storage is unavailable.
    }
  }, [cart]);
  useEffect(() => {
    if (orderType !== "delivery" || hoursLoading || hasInitializedDeliveryTime.current || !deliveryHours.length) return;

    const initialHour = deliveryHours.includes(Number(manualDeliveryHour))
      ? Number(manualDeliveryHour)
      : deliveryHours[0];
    const availableMinutes = getMinutesForDeliveryHour(initialHour, deliveryTimeRanges);
    const initialMinute = availableMinutes.includes(0) ? 0 : availableMinutes[0];
    if (initialMinute == null) return;

    const hour = String(initialHour).padStart(2, "0");
    const minute = String(initialMinute).padStart(2, "0");
    setManualDeliveryHour(hour);
    setManualDeliveryMinute(minute);
    setPreferredTime(`${hour}:${minute}`);
    hasInitializedDeliveryTime.current = true;
  }, [deliveryHours, deliveryTimeRanges, hoursLoading, manualDeliveryHour, orderType]);
  function openDeliveryTimePicker() {
    const [hour, minute] = preferredTime ? preferredTime.split(":").map(Number) : [NaN, NaN];
    const selectedHour = deliveryHours.includes(hour) ? hour : Number(manualHourValue);
    const availableMinutes = getMinutesForDeliveryHour(selectedHour, deliveryTimeRanges);
    const preferredMinute = Number.isFinite(minute) ? minute : Number(manualDeliveryMinute);
    const selectedMinute = availableMinutes.includes(preferredMinute) ? preferredMinute : (availableMinutes[0] ?? 0);
    setDraftDeliveryHour(selectedHour);
    setDraftDeliveryMinute(selectedMinute);
    setDeliveryTimePickerStep("hour");
    setDeliveryTimePickerOpen(true);
  }
  function updateDeliveryMinuteFromPointer(event) {
    const availableMinutes = getMinutesForDeliveryHour(draftDeliveryHour, deliveryTimeRanges);
    if (!availableMinutes.length) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (bounds.left + bounds.width / 2);
    const dy = event.clientY - (bounds.top + bounds.height / 2);
    const angle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    const requestedMinute = Math.round(angle / 6) % 60;
    setDraftDeliveryMinute(availableMinutes.reduce((closest, value) => Math.abs(value - requestedMinute) < Math.abs(closest - requestedMinute) ? value : closest, availableMinutes[0]));
  }
  function applyDeliveryTime() {
    const hour = String(draftDeliveryHour).padStart(2, "0");
    const minute = String(draftDeliveryMinute).padStart(2, "0");
    if (!isTimeWithinDeliveryHours(`${hour}:${minute}`, deliveryTimeRanges)) return;
    setManualDeliveryHour(hour);
    setManualDeliveryMinute(minute);
    setPreferredTime(`${hour}:${minute}`);
    setDeliveryTimePickerOpen(false);
  }
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
    const filteredItems = items.filter((item) => {
      const matchesCategory =
        category === "All" || (category && item.main_category === category);
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
    if (!category) return [];
    return filteredItems.sort((first, second) => {
      const firstId = Number(first.display_code);
      const secondId = Number(second.display_code);
      if (Number.isFinite(firstId) && Number.isFinite(secondId)) return firstId - secondId;
      if (Number.isFinite(firstId)) return -1;
      if (Number.isFinite(secondId)) return 1;
      return Number(first.item_id) - Number(second.item_id);
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
  useEffect(() => {
    if (!isReviewingOrder || !customerToken) return;
    let active = true;
    Promise.all([getCustomerSession(customerToken), getCustomerSurpriseRewards(customerToken)])
      .then(([{ customer }, { rewards }]) => {
        if (!active) return;
        const availableRewards = Array.isArray(rewards) ? rewards : [];
        const savedRewardId = getSelectedCustomerRewardId(customer.customer_id);
        const birthday = customer.birthday_discount_percent > 0;
        const signup = customer.signup_discount_percent > 0;
        const savedChoiceIsAvailable = savedRewardId === "birthday"
          ? birthday
          : savedRewardId === "signup"
            ? signup
            : availableRewards.some((reward) => String(reward.reward_id) === savedRewardId);
        const selectedRewardId = savedChoiceIsAvailable
          ? savedRewardId
          : birthday
            ? "birthday"
            : signup
              ? "signup"
              : availableRewards.length === 1 ? String(availableRewards[0].reward_id) : "";
        setSelectedSurpriseRewardId(selectedRewardId);
        saveSelectedCustomerRewardId(customer.customer_id, selectedRewardId);
        setCheckoutOffer({
          token: customerToken,
          customerId: customer.customer_id,
          birthday,
          birthdayPercent: Number(customer.birthday_discount_percent) || 0,
          signupPercent: Number(customer.signup_discount_percent) || 0,
          percent: birthday ? customer.birthday_discount_percent : customer.signup_discount_percent,
          surpriseRewards: availableRewards,
        });
      })
      .catch((error) => {
        if (active) setCheckoutError(error.message || "Could not check your offers. Go back and try again.");
      });
    return () => { active = false; };
  }, [isReviewingOrder, customerToken]);

  const reviewedOffer = isReviewingOrder && customerToken && checkoutOffer?.token === customerToken
    ? (() => {
      const selectedReward = checkoutOffer.surpriseRewards?.find((reward) => String(reward.reward_id) === String(selectedSurpriseRewardId));
      if (selectedReward) {
        return { ...checkoutOffer, birthday: false, percent: selectedReward.reward_type === "percent" ? Number(selectedReward.reward_value) : 0, surpriseReward: selectedReward };
      }
      if (selectedSurpriseRewardId === "birthday" && checkoutOffer.birthdayPercent > 0) {
        return { ...checkoutOffer, birthday: true, percent: checkoutOffer.birthdayPercent, surpriseReward: null };
      }
      if (selectedSurpriseRewardId === "signup" && checkoutOffer.signupPercent > 0) {
        return { ...checkoutOffer, birthday: false, percent: checkoutOffer.signupPercent, surpriseReward: null };
      }
      if (selectedSurpriseRewardId === "none") {
        return { ...checkoutOffer, birthday: false, percent: 0, surpriseReward: null };
      }
      return { ...checkoutOffer, surpriseReward: null };
    })()
    : null;
  const offerDiscount = reviewedOffer
    ? Math.round(Math.round(cartTotal * 100) * reviewedOffer.percent / 100) / 100
    : 0;
  // Shared pricing summary appears on review and payment steps so the estimate stays visible.
  const orderPriceSummary = (
    <div className="checkout-price-summary" aria-live="polite">
      <div className="checkout-price-row">
        <span>Food subtotal</span>
        <strong>{euro.format(cartTotal)}</strong>
      </div>
      {offerDiscount > 0 && (
        <div className="checkout-price-row">
          <span>{reviewedOffer.surpriseReward ? "Surprise reward" : reviewedOffer.birthday ? "Birthday-week offer" : "Sign-up offer"} ({reviewedOffer.percent}%)</span>
          <strong>−{euro.format(offerDiscount)}</strong>
        </div>
      )}
      {reviewedOffer?.surpriseReward?.reward_type === "addon" && (
        <div className="checkout-price-row"><span>Surprise reward · {reviewedOffer.surpriseReward.addon_item_name}</span><strong>Free</strong></div>
      )}
      {orderType === "delivery" ? deliveryQuote ? (
        <>
          <div className="checkout-price-row">
            <span>Estimated delivery charge</span>
            <strong>{euro.format(deliveryQuote.delivery_charge)}</strong>
          </div>
          <div className="checkout-price-row checkout-price-total">
            <span>Estimated total</span>
            <strong>{euro.format(Number(deliveryQuote.total_amount) - offerDiscount)}</strong>
          </div>
          <small>{deliveryQuote.message} Final charge is confirmed when the order is accepted.</small>
        </>
      ) : deliveryQuoteLoading ? (
        <p className="cart-note">Calculating estimated delivery charge…</p>
      ) : deliveryQuoteError ? (
        <>
          <div className="checkout-price-row">
            <span>Delivery charge</span>
            <strong>As applicable</strong>
          </div>
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
            <strong>{euro.format(cartTotal - offerDiscount)}</strong>
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
  if (!isPreferredTimeValid(preferredTime)) {
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
  setCheckoutOffer(null);
  if (cart.length === 0) return setCheckoutError("Your cart is empty.");
  const validationError = validateCheckoutDetails({
    name: customerName,
    phone: customerPhone,
    orderType,
    address: deliveryAddress,
  });
  if (validationError) return setCheckoutError(validationError);
  if (!isPreferredTimeValid(preferredTime)) {
    return setCheckoutError("Please select an available preferred delivery or pickup time.");
  }

  if (orderType === "delivery" && manualDeliveryReview) {
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
  setIsReviewingOrder(true);
}
async function confirmOrder() {
  if (isSubmittingOrder || (customerToken && !reviewedOffer)) return;
  setCheckoutError("");
  setIsSubmittingOrder(true);
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
      apply_signup_offer: offerDiscount > 0 && !reviewedOffer.birthday && !reviewedOffer.surpriseReward,
      apply_birthday_offer: Boolean(reviewedOffer?.birthday && !reviewedOffer?.surpriseReward),
      apply_surprise_reward_id: reviewedOffer?.surpriseReward?.reward_id || null,
      items: cart.map((item) => ({ item_id: item.item_id, quantity: item.quantity })),
    }, customerToken);
    if (reviewedOffer?.surpriseReward || (offerDiscount > 0 && (reviewedOffer?.birthday || checkoutOffer?.signupPercent > 0))) {
      saveSelectedCustomerRewardId(checkoutOffer?.customerId, "");
    }
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
      subtotal: Number(data.food_subtotal ?? cartTotal),
      discountAmount: Number(data.discount_amount ?? 0),
      totalAmount: Number(data.total_amount),
      deliveryChargePendingManualReview: Boolean(data.delivery_charge_pending_manual_review),
      deliveryCharge: data.delivery_charge_pending_manual_review
        ? null
        : Number(data.delivery_charge ?? (Number(data.total_amount) - cartTotal).toFixed(2)),
      items: cart.map((item) => ({
        name: item.item_name,
        displayCode: item.display_code || "",
        quantity: item.quantity,
        unitPrice: Number(item.price_eur),
        lineTotal: Number((Number(item.price_eur) * item.quantity).toFixed(2)),
      })),
    };
    sessionStorage.setItem("desiDawatOrderConfirmation", JSON.stringify(confirmation));
    sessionStorage.removeItem("desiDawatCart");
    setCart([]);
    window.location.href = `/order-confirmation?order=${data.order_id}`;
  } catch (error) {
    setCheckoutError(error.message || "Unable to submit your order. Please try again.");
    if (error.code === "SIGNUP_OFFER_UNAVAILABLE" || error.code === "BIRTHDAY_OFFER_CHANGED") {
      setIsReviewingOrder(false);
      setCheckoutOffer(null);
    }
  } finally {
    setIsSubmittingOrder(false);
  }
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
                <span className="promo-icon">🚚</span>
                <span>
                  <strong>Kotiinkuljetus</strong>
                  <small>Tilaa herkullista ruokaa kotiin</small>
                </span>
              </div>
              <div className="promo-service promo-pickup-service">
                <span className="promo-icon">📍</span>
                <strong>Nouto saatavilla</strong>
                <small className="promo-address-line">Pateniementie 59, 90800 Oulu, Suomi</small>
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
          </div>
          <div className="promo-divider" />
          <div className="promo-english">
            <h2>AUTHENTIC INDIAN FOOD</h2>
            <p className="promo-subtitle">
              Fresh Indian vegetarian food
            </p>
            <div className="promo-services">
              <div className="promo-service">
                <span className="promo-icon">🚚</span>
                <span>
                  <strong>Home delivery</strong>
                  <small>Order delicious food to your home</small>
                </span>
              </div>
              <div className="promo-service promo-pickup-service">
                <span className="promo-icon">📍</span>
                <strong>Takeaway available</strong>
                <small className="promo-address-line">Pateniementie 59, 90800 Oulu, Finland</small>
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
          </div>
        </div>
        <div className="promo-brand">
          <img src="/images/LOGO.jpeg" alt="Desi Dawat Food and Catering logo" />
          <h2>Desi Dawat</h2>
          <p>FOOD &amp; CATERING</p>
          <div className="promo-gold-line" />
          <p className="promo-brand-tagline">Vegetarian Indian Kitchen</p>
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
<section className="featured-dish-section" aria-label="Featured dishes">
  <div className="featured-dish-shell">
    <div className="featured-dish-heading">
      <span className="eyebrow">A TASTE OF DESI DAWAT</span>
      <h2>Made to be savoured</h2>
    </div>
    {items.length > 0 && (() => {
      const featured = items[featuredIndex % items.length];
      const image = resolveImageUrl(featured.image_url) || getDishImage(featured.item_name);
      const nameLines = getBilingualMenuLines(featured.item_name || "Today's special");
      const descriptionLines = getBilingualMenuLines(featured.short_information || "A much-loved vegetarian favourite, prepared fresh with aromatic spices.");
      return (
        <article className="featured-dish-card">
          <div className="featured-dish-image-wrap">
            {image ? <img src={image} alt={featured.item_name} className="featured-dish-image" /> : <div className="featured-dish-image-placeholder">Desi Dawat</div>}
            <span className="featured-dish-index">{String(featuredIndex + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}</span>
          </div>
          <div className="featured-dish-copy">
            <div className="featured-dish-title-block">
              <span className="featured-dish-kicker">{featured.subcategory || featured.main_category || "VEGETARIAN FAVOURITE"}</span>
              <h3 className={nameLines.join(" ").length > 48 ? "featured-dish-long-title" : ""}>{nameLines.map((line, index) => <span key={index}>{line}</span>)}</h3>
            </div>
            <div className="featured-dish-detail-block">
              <div className="featured-dish-description">{descriptionLines.map((line, index) => <p key={index}>{line}</p>)}</div>
              <div className="featured-dish-meta"><strong>{euro.format(Number(featured.price_eur) || 0)}</strong></div>
              <button type="button" className="add-to-cart-btn featured-dish-add" onClick={() => addToCart(featured)}>Add to Cart</button>
            </div>
            <div className="featured-dish-controls">
              <button type="button" aria-label="Previous featured dish" onClick={() => setFeaturedIndex((index) => (index - 1 + items.length) % items.length)}>←</button>
              <button type="button" aria-label="Next featured dish" onClick={() => setFeaturedIndex((index) => (index + 1) % items.length)}>→</button>
            </div>
          </div>
        </article>
      );
    })()}
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
          <div className="category-list category-tiles" aria-label="Choose a menu category">
            {categories.map((value) => (
              <button
                key={value}
                type="button"
                className={`category-chip category-tile ${
                  category === value ? "active" : ""
                }`}
                onClick={() => setCategory(value)}
              >
                <span>{value === "All" ? "Explore all dishes" : value}</span>
                <small>{value === "All" ? `${items.length} dishes` : `${items.filter((item) => item.main_category === value).length} dishes`}</small>
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
        {!loading && !error && !category && (
          <p className="menu-category-prompt">Choose a collection above to explore the menu.</p>
        )}
        {!loading && !error && category && visibleItems.length === 0 && (
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
                    {item.display_code && <span className="dish-number-badge" aria-label={`Menu item ${item.display_code}`}>{item.display_code}</span>}
                  </div>
                ) : (
                  <div className="dish-art">
                    {item.display_code && <span className="dish-number-badge" aria-label={`Menu item ${item.display_code}`}>{item.display_code}</span>}
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
                    <h3>{getBilingualMenuLines(item.item_name).map((line, index) => <span key={index} style={{ display: "block" }}>{line}{index === 0 && (Array.isArray(item.allergen_codes) ? item.allergen_codes : String(item.allergen_codes || "").split(",").filter(Boolean)).length > 0 && <span className="dish-allergen-codes"> ({(Array.isArray(item.allergen_codes) ? item.allergen_codes : String(item.allergen_codes || "").split(",").filter(Boolean)).join(", ")})</span>}</span>)}</h3>
                    <strong className="price">
                      {euro.format(Number(item.price_eur))}
                    </strong>
                  </div>
                  <button type="button" className="dish-details-button" onClick={() => setDetailsItem(item)}>View details</button>
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
        <aside className="menu-allergen-legend" aria-label="Allergen code legend">
          <strong>Allergen codes / Allergeenikoodit</strong>
          <p>Codes in parentheses identify allergens present in each dish.</p>
          <ul>{menuAllergenCodes.map(([code, label]) => <li key={code}><strong>{code}</strong> — {label}</li>)}</ul>
        </aside>
      </section>
      </>}
      {detailsItem && (
        <div className="dish-details-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailsItem(null); }}>
          <section className="dish-details-dialog" role="dialog" aria-modal="true" aria-labelledby="dish-details-title">
            <button type="button" className="dish-details-close" aria-label="Close details" onClick={() => setDetailsItem(null)}>×</button>
            <span className="dish-details-kicker">{detailsItem.subcategory || detailsItem.main_category}</span>
            <h2 id="dish-details-title">{getBilingualMenuLines(detailsItem.item_name).map((line, index) => <span key={index}>{line}</span>)}</h2>
            <div className="dish-details-copy">{getBilingualMenuLines(detailsItem.short_information || "A delicious Indian vegetarian favourite.").map((line, index) => <p key={index}>{line}</p>)}</div>
            <div className="dish-details-footer"><strong>{euro.format(Number(detailsItem.price_eur))}</strong></div>
          </section>
        </div>
      )}
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
                    <strong>{getBilingualMenuLines(item.item_name).map((line, index) => <span key={index} style={{ display: "block" }}>{line}{index === 0 && item.display_code && <span className="dish-allergen-codes"> ({item.display_code})</span>}</span>)}</strong>
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
            ].map((step) => {
              const activeStep = isReviewingOrder ? 1 : 0;
              const stepState = step.index === activeStep ? "current" : step.index < activeStep ? "complete" : "";
              return (
                <li className={stepState} key={step.label} aria-current={step.index === activeStep ? "step" : undefined}>
                  <span className="checkout-progress-number">{step.index + 1}</span>
                  <strong>{step.label}</strong>
                </li>
              );
            })}
          </ol>
          {checkoutError && <p className="notice error" role="alert">{checkoutError}</p>}
          {/* Hide the checkout heading on the review step while keeping checkout available. */}
          <div className="section-heading" hidden={isReviewingOrder}>
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
                    hasInitializedDeliveryTime.current = false;
                    setPreferredTime("");
                    setManualDeliveryHour("19");
                    setManualDeliveryMinute("00");
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
                    hasInitializedDeliveryTime.current = false;
                    setPreferredTime("");
                    setManualDeliveryHour("19");
                    setManualDeliveryMinute("00");
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
                {orderType === "delivery" ? (
                  <>
                    <div className="delivery-time-entry">
                      <div className="delivery-manual-time" id="preferred-order-time">
                        <select
                          aria-label="Delivery hour"
                          value={manualHourValue}
                          onChange={(event) => {
                            const hour = event.target.value;
                            const nextMinute = getMinutesForDeliveryHour(Number(hour), deliveryTimeRanges)[0];
                            const minute = Number.isFinite(nextMinute) ? String(nextMinute).padStart(2, "0") : "";
                            setManualDeliveryHour(hour);
                            setManualDeliveryMinute(minute);
                            setPreferredTime(minute ? `${hour}:${minute}` : "");
                          }}
                          required
                          disabled={!deliveryHours.length}
                        >
                          {!deliveryHours.length && <option value="">Unavailable</option>}
                          {deliveryHours.map((hour) => <option key={hour} value={String(hour).padStart(2, "0")}>{String(hour).padStart(2, "0")}</option>)}
                        </select>
                        <span aria-hidden="true">:</span>
                        <input
                          type="number"
                          aria-label="Delivery minute, 00 to 59"
                          min={getMinutesForDeliveryHour(Number(manualHourValue), deliveryTimeRanges)[0] ?? 0}
                          max={getMinutesForDeliveryHour(Number(manualHourValue), deliveryTimeRanges).at(-1) ?? 0}
                          step="1"
                          inputMode="numeric"
                          placeholder="00"
                          value={manualDeliveryMinute}
                          disabled={!getMinutesForDeliveryHour(Number(manualHourValue), deliveryTimeRanges).length}
                          onChange={(event) => {
                            const minute = event.target.value;
                            if (minute === "") {
                              setManualDeliveryMinute(minute);
                              setPreferredTime("");
                              return;
                            }
                            if (/^\d{1,2}$/.test(minute) && Number(minute) <= 59) {
                              const formattedMinute = String(Number(minute)).padStart(2, "0");
                              const candidate = `${manualHourValue}:${formattedMinute}`;
                              setManualDeliveryMinute(minute);
                              setPreferredTime(isTimeWithinDeliveryHours(candidate, deliveryTimeRanges) ? candidate : "");
                            }
                          }}
                          onBlur={() => {
                            const availableMinutes = getMinutesForDeliveryHour(Number(manualHourValue), deliveryTimeRanges);
                            if (!availableMinutes.length) return;
                            const typedMinute = Number(manualDeliveryMinute);
                            const correctedMinute = availableMinutes.includes(typedMinute)
                              ? typedMinute
                              : availableMinutes.reduce((closest, value) => Math.abs(value - typedMinute) < Math.abs(closest - typedMinute) ? value : closest, availableMinutes[0]);
                            const minute = String(correctedMinute).padStart(2, "0");
                            setManualDeliveryMinute(minute);
                            setPreferredTime(`${manualHourValue}:${minute}`);
                          }}
                          required
                        />
                      </div>
                      <button
                        type="button"
                        className="delivery-time-picker-trigger"
                        aria-label="Choose delivery time using the clock"
                        aria-haspopup="dialog"
                        aria-expanded={deliveryTimePickerOpen}
                        disabled={!deliveryHours.length}
                        onClick={openDeliveryTimePicker}
                      >
                        <span aria-hidden="true">◷</span>
                        <span>Clock</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <select
                    id="preferred-order-time"
                    value={preferredTime}
                    onChange={(event) => setPreferredTime(event.target.value)}
                    required
                  >
                    <option value="">Choose a time / Valitse aika</option>
                    {preferredTimeSlots.map((time) => <option key={time} value={time}>{time}</option>)}
                  </select>
                )}
              </div>
            </div>
            <aside className="preparation-time-note" aria-label="Fresh preparation notice">
              <strong>Tuoreena valmistettu / Freshly prepared</strong>
              <span>Koska kaikki annokset valmistetaan tuoreina, tee tilauksesi vähintään tuntia ennen toivomaasi nouto- tai toimitusaikaa.</span>
              <span>As all orders are prepared fresh, please place your order via WhatsApp at least one hour before your preferred pickup or delivery time.</span>
            </aside>
            {deliveryTimePickerOpen && orderType === "delivery" && (
              <div className="delivery-time-picker-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeliveryTimePickerOpen(false); }}>
                <section className="delivery-time-picker" role="dialog" aria-modal="true" aria-labelledby="delivery-time-picker-title" onKeyDown={(event) => { if (event.key === "Escape") setDeliveryTimePickerOpen(false); }}>
                  <button type="button" className="delivery-time-picker-close" aria-label="Close time picker" onClick={() => setDeliveryTimePickerOpen(false)}>×</button>
                  <span className="eyebrow">HOME DELIVERY · {formatOpeningPeriods(todayOpeningHours)}</span>
                  <h2 id="delivery-time-picker-title">Choose a delivery time</h2>
                  <div className="delivery-time-picker-tabs" aria-label="Time selection steps">
                    <button type="button" className={deliveryTimePickerStep === "hour" ? "active" : ""} onClick={() => setDeliveryTimePickerStep("hour")}>1 · Hour</button>
                    <button type="button" className={deliveryTimePickerStep === "minute" ? "active" : ""} disabled={deliveryTimePickerStep === "hour"} onClick={() => setDeliveryTimePickerStep("minute")}>2 · Minute</button>
                  </div>
                  {deliveryTimePickerStep === "hour" ? (
                    <div className="delivery-hour-dial" aria-label="Choose delivery hour">
                      {deliveryHours.map((hour, index) => {
                        const angle = (index / deliveryHours.length) * Math.PI * 2;
                        const minute = getMinutesForDeliveryHour(hour, deliveryTimeRanges)[0] ?? 0;
                        return <button key={hour} type="button" style={{ left: `calc(50% + ${Math.sin(angle) * 104}px)`, top: `calc(50% - ${Math.cos(angle) * 104}px)` }} className={draftDeliveryHour === hour ? "active" : ""} onClick={() => { setDraftDeliveryHour(hour); setDraftDeliveryMinute(minute); setDeliveryTimePickerStep("minute"); }}>{String(hour).padStart(2, "0")}:00</button>;
                      })}
                      <div className="delivery-time-dial-center"><strong>{String(draftDeliveryHour).padStart(2, "0")}:{String(draftDeliveryMinute).padStart(2, "0")}</strong></div>
                    </div>
                  ) : (
                    <div
                      ref={minuteDialRef}
                      className={`delivery-minute-dial${getMinutesForDeliveryHour(draftDeliveryHour, deliveryTimeRanges).length === 1 ? " locked" : ""}`}
                      role="slider"
                      aria-label="Choose delivery minute"
                      aria-valuemin={getMinutesForDeliveryHour(draftDeliveryHour, deliveryTimeRanges)[0] ?? 0}
                      aria-valuemax={getMinutesForDeliveryHour(draftDeliveryHour, deliveryTimeRanges).at(-1) ?? 0}
                      aria-valuenow={draftDeliveryMinute}
                      aria-valuetext={`${String(draftDeliveryHour).padStart(2, "0")}:${String(draftDeliveryMinute).padStart(2, "0")}`}
                      tabIndex="0"
                      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updateDeliveryMinuteFromPointer(event); }}
                      onPointerMove={(event) => { if (event.buttons === 1) updateDeliveryMinuteFromPointer(event); }}
                      onKeyDown={(event) => {
                        const availableMinutes = getMinutesForDeliveryHour(draftDeliveryHour, deliveryTimeRanges);
                        if (event.key === "ArrowRight" || event.key === "ArrowUp") { event.preventDefault(); setDraftDeliveryMinute((minute) => availableMinutes[(availableMinutes.indexOf(minute) + 1 + availableMinutes.length) % availableMinutes.length] ?? minute); }
                        if (event.key === "ArrowLeft" || event.key === "ArrowDown") { event.preventDefault(); setDraftDeliveryMinute((minute) => availableMinutes[(availableMinutes.indexOf(minute) - 1 + availableMinutes.length) % availableMinutes.length] ?? minute); }
                      }}
                    >
                      {Array.from({ length: 12 }, (_, index) => {
                        const angle = index * Math.PI / 6;
                        return <span key={index} className="delivery-minute-mark" style={{ left: `calc(50% + ${Math.sin(angle) * 104}px)`, top: `calc(50% - ${Math.cos(angle) * 104}px)` }}>{String(index * 5).padStart(2, "0")}</span>;
                      })}
                      <span className="delivery-minute-hand" style={{ "--hand-angle": `${draftDeliveryMinute * 6}deg` }} />
                      <span className="delivery-minute-center"><strong>{String(draftDeliveryHour).padStart(2, "0")}:{String(draftDeliveryMinute).padStart(2, "0")}</strong></span>
                    </div>
                  )}
                  <div className="delivery-time-picker-actions">
                    {deliveryTimePickerStep === "minute" && <button type="button" className="button button-outline" onClick={() => setDeliveryTimePickerStep("hour")}>Change hour</button>}
                    <button type="button" className="button button-primary" disabled={deliveryTimePickerStep !== "minute"} onClick={applyDeliveryTime}>Use this time</button>
                  </div>
                </section>
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
                <h2 id="delivery-review-title">Address not verified</h2>
                <p className="delivery-review-instructions">
                  Please check the road distance from <strong>Lidl Store, Pateniemi</strong> to your delivery address in{" "}
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent("Lidl Store, Pateniemi, Oulu, Finland")}&destination=${encodeURIComponent(deliveryAddress)}&travelmode=driving`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google Maps
                  </a>{" "}
                  and check your delivery charge below.
                </p>
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
                    setIsReviewingOrder(true);
                  }}>Continue without estimated delivery charge</button>
                </div>
              </section>
            </div>
          )}
{isReviewingOrder && (
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
    <h4>Items</h4>
    {cart.map((item) => (
      <p key={item.item_id}>
        {getBilingualMenuLines(item.item_name).map((line, index) => <span key={index} style={{ display: "block" }}>{line}{index === 0 && item.display_code ? ` (${item.display_code})` : ""}</span>)}
        × {item.quantity}
      </p>
    ))}
    {customerToken && (checkoutOffer?.surpriseRewards?.length > 0 || checkoutOffer?.birthdayPercent > 0 || checkoutOffer?.signupPercent > 0) && (
      <label className="checkout-surprise-reward">
        Choose an offer for this order
        <select value={selectedSurpriseRewardId} onChange={(event) => {
          setSelectedSurpriseRewardId(event.target.value);
          saveSelectedCustomerRewardId(checkoutOffer?.customerId, event.target.value);
        }}>
          <option value="none">No offer</option>
          {checkoutOffer.birthdayPercent > 0 && <option value="birthday">Birthday-week offer · {checkoutOffer.birthdayPercent}% off food</option>}
          {checkoutOffer.signupPercent > 0 && <option value="signup">Sign-up offer · {checkoutOffer.signupPercent}% off food</option>}
          {checkoutOffer.surpriseRewards.map((reward) => (
            <option key={reward.reward_id} value={reward.reward_id}>
              {reward.reward_type === "percent" ? `${Number(reward.reward_value)}% off food` : `Free ${reward.addon_item_name || "add-on dish"}`} · expires {new Date(reward.expires_at).toLocaleDateString("en-GB")}
            </option>
          ))}
        </select>
      </label>
    )}
    {orderPriceSummary}
    <div className="checkout-actions">
<button
      type="button"
      className="add-to-cart-btn"
      onClick={confirmOrder}
      disabled={isSubmittingOrder || Boolean(customerToken && !reviewedOffer)}
    >
      Continue to confirm your order / Jatka tilauksen vahvistamiseen
    </button>
    <button
      type="button"
      className="add-to-cart-btn"
      onClick={() => {
        setIsReviewingOrder(false);
        setCheckoutError("");
      }}
    >
      Back to Checkout
    </button>
    </div>
  </div>
)}
        </section>
      )}
    </>
  );
}
