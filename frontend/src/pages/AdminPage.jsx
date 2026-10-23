import React from "react";
import { useCallback, useEffect, useState } from "react";
// Admin console navigation: send sign-out and rejected sessions back to the public sign-in page.
import { useNavigate } from "react-router-dom";
// Inventory size: normalize older size labels and restrict newly saved values to gm/ml.
import { isValidInventorySize, normalizeInventorySize } from "../utils/inventorySize.js";

import {
  deleteMenuItem,
  deleteOrder,
  getAdminMenu,
  loginAdmin,
  saveMenuItem,
  getAdminOrders,
  updateOrderStatus,
  updateDeliveryCharge,
  getOpeningHours,
  saveOpeningHours,
  getAdminInventory,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from "../api.js";


const blank = {
  main_category: "", subcategory: "", item_name: "", quantity_serving: "1 serving",
  price_eur: "", short_information: "", is_available: true,
};

export default function AdminPage() {
  // Admin console navigation: keep the protected console route aligned with session state.
  const navigate = useNavigate();
  const [token, setToken] = useState(() => sessionStorage.getItem("desiDawatAdminToken") || "");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [items, setItems] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [inventoryMessage, setInventoryMessage] = useState("");
  const [inventoryError, setInventoryError] = useState("");
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryCategory, setInventoryCategory] = useState("packing_material");

  
  const [inventoryForm, setInventoryForm] = useState({
  item_id: null,
  item_category: "packing_material",
  item_name: "",
  item_name_hindi: "",
  item_name_finnish: "",
  rack_number: "",
  item_size: "",
  quantity: "",
  unit: "pieces",
  availability: "available",
  expiry_date: "",
  expiry_note: "",
  notes: "",
});


  const [orders, setOrders] = useState([]);
  const [receiptOrder, setReceiptOrder] = useState(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  
  const [openingHours, setOpeningHours] = useState([]);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursMessage, setHoursMessage] = useState("");
  const [hoursError, setHoursError] = useState("");

  const [savingCharge, setSavingCharge] = useState({});
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [flyerDay, setFlyerDay] = useState("sun");
  const [selectedAllMenuItems, setSelectedAllMenuItems] = useState([]);
  
const [flyerFormat, setFlyerFormat] = useState("two-page");
const [flyerGenerating, setFlyerGenerating] = useState(false);
const [selectedFlyerItems, setSelectedFlyerItems] = useState([]);
  const loadItems = useCallback(async (activeToken = token) => {
    if (!activeToken) return;
    try {
      const data = await getAdminMenu(activeToken);
      setItems(data);
      setError("");
    } catch (err) {
      setError(err.message);
      // Admin session expiry: return to sign-in if the console's protected menu request rejects the token.
      if (err.message.toLowerCase().includes("session") || err.message.toLowerCase().includes("sign in")) {
        setToken("");
        sessionStorage.removeItem("desiDawatAdminToken");
        navigate("/admin/login", { replace: true, state: { from: "/admin/console" } });
      }
    }
  }, [token, navigate]);
  
const handleGenerateFlyer = () => {
  setFlyerGenerating(true);

  try {
    // Welcome flyer hours: build the printable schedule from admin-managed server opening hours.
    const escapeFlyerText = (value) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
    })[character]);
    const welcomeHoursMarkup = openingHours.map((day) => {
      const periods = [];
      if (!day.morning_closed && day.morning_open && day.morning_close) periods.push(`${day.morning_open}–${day.morning_close}`);
      if (!day.evening_closed && day.evening_open && day.evening_close) periods.push(`${day.evening_open}–${day.evening_close}`);
      const schedule = periods.length ? periods.join(", ") : "Suljettu / Closed";
      return `<strong>${escapeFlyerText(day.day_fi)} / ${escapeFlyerText(day.day_en)}: ${escapeFlyerText(schedule)}</strong><br />`;
    }).join("") || "<strong>Aukioloajat eivät saatavilla / Opening hours unavailable</strong>";

    const availableItems = items.filter((item) => {
  const isAvailable = Boolean(Number(item.is_available));

  if (flyerDay === "all-menu") {
  return (
    isAvailable &&
    selectedAllMenuItems.map(String).includes(String(item.item_id))
  );
}

  return (
    isAvailable &&
    selectedFlyerItems.map(String).includes(String(item.item_id))
  );
});
if (flyerFormat !== "welcome-message" && availableItems.length === 0) {
  alert("No available menu items to include in the flyer.");
  return;
}
    const flyerWindow = window.open("", "_blank");

    if (!flyerWindow) {
      alert("Please allow pop-ups to open the flyer.");
      return;
    }

    if (flyerFormat === "welcome-message") {
      flyerWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <title>Desi Dawat - Welcome_message</title>
            <style>
              body {
                font-family: Georgia, serif;
                color: #30150e;
                background: #fff8ef;
                margin: 0;
                padding: 18mm;
                line-height: 1.4;
              }
              header {
                text-align: center;
                border-bottom: 3px solid #c79b35;
                padding-bottom: 10px;
                margin-bottom: 12px;
              }
              header img {
                width: 85px;
                height: 85px;
                object-fit: contain;
              }
              h1, h2, h3 { color: #791d2a; }
              h1 { margin: 5px 0; }
              h2 { font-size: 17px; margin: 12px 0 6px; }
              p { margin: 5px 0; }
              hr { border: 0; border-top: 1px solid #c79b35; margin: 10px 0; }
              a { color: #791d2a; overflow-wrap: anywhere; }
              @page { size: A4; margin: 12mm; }
              @media print {
                body { padding: 0; font-size: 11pt; }
                h2 { font-size: 15pt; }
              }
            </style>
          </head>
          <body>
            <header>
              <img src="/images/LOGO.jpeg" alt="Desi Dawat logo" />
              <h1>DESI DAWAT – OULU</h1>
              <p>Intialainen kasvisruoka / Indian Vegetarian Food</p>
              <p>Pateniementie 59, 90800 Oulu, Finland</p>
            </header>
<p class="welcome-opening-hours">
  🕒 <strong>AU KIOLOAJAT / OPENING HOURS</strong>
</p>
<p class="welcome-opening-hours">${welcomeHoursMarkup}</p>
            
            <p>Tarjoamme tuoretta ja aitoa intialaista kasvisruokaa: herkullisia aterioita, leipiä, riisiä ja välipaloja.</p>
             <p>We offer fresh, authentic Indian vegetarian food, including delicious meals, 
             breads, rice and snacks.</p>
            <p>🚗 Kotiinkuljetus ja nouto saatavilla!</p>
                  
           
            <p>🚗 Home delivery and pickup available!</p>
           


            <hr />

            <h2>📋 RUOKALISTA-TILAUKSET/ MENU-ORDERS </h2>
            <p>
              <a href="https://drive.google.com/file/d/1hFz08DQoDrXuKx1zyj_nTuQZHui1b3TQ/view?usp=sharing" target="_blank" rel="noopener noreferrer">
                Avaa ruokalista/View Menu 
              </a>
            </p>

            <h2>📲  NÄIN TILAAT/HOW TO ORDER</h2>
            <p>🇫🇮 Lähetä WhatsApp-viesti ja ilmoita tuotenumero, määrä sekä toivottu nouto- tai toimitusaika.</p>
            <p>🇬🇧 Send a WhatsApp message with the item number, quantity, and preferred pickup or delivery time.</p>
            <p><a href="https://wa.me/358449803211">WhatsApp: +358 44 980 3211</a></p>

            <hr />

            

            <hr />

            <h2>📞KYSYMYKSET JA APU/QUERIES &amp; ASSISTANCE </h2>
            <p><a href="tel:+358413279444">+358 41 327 9444</a></p>

            
            <p>🙏 Kiitos, että valitset Desi Dawatin! ❤️</p>
            <p>🙏 Thank you for choosing Desi Dawat! ❤️</p>
          </body>
        </html>
      `);
      flyerWindow.document.close();
      flyerWindow.focus();
      flyerWindow.print();
      return;
    }

    flyerWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Desi Dawat - Daily Flyer</title>
          <style>
            body {
              font-family: Georgia, serif;
              color: #30150e;
              background: #fff8ef;
              margin: 0;
              padding: 24px;
            }
            header {
              text-align: center;
              border-bottom: 3px solid #c79b35;
              padding-bottom: 16px;
            }
            header img {
              width: 100px;
              height: 100px;
              object-fit: contain;
            }
            h1, h2 { color: #791d2a; }
            
.dish {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  border-bottom: 1px dotted #c79b35;
  padding: 10px 0;
}

.flyer-dish-image {
  width: 50px;
  height: 50px;
  object-fit: cover;
  border-radius: 6px;
  flex-shrink: 0;
}

.flyer-dish-details {
  flex: 1;
  min-width: 0;
  text-align: left;
}

.flyer-dish-name {
  font-weight: bold;
  margin: 0 0 3px;
}

.flyer-dish-description {
  font-size: 13px;
  line-height: 1.5;
  color: #555;
  overflow-wrap: anywhere;
}

.price {
  width: 65px;
  flex-shrink: 0;
  text-align: right;
  white-space: nowrap;
  font-weight: bold;
}

            .price { white-space: nowrap; font-weight: bold; }
            .page-two {
              page-break-before: always;
              break-before: page;
            }
              
@page {
  size: A4;
  margin: 18mm;
}

            @media print {
              body { padding: 0; }
              .page { min-height: 95vh; }
            }

            
.flyer-opening-hours {
  margin: 12px 0 16px;
  padding: 14px;
  background: #fff0c2;
  border: 3px solid #c79b35;
  border-radius: 8px;
  font-size: 13px;
  font-weight: bold;
  color: #791d2a;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.12);
}



/* Daily flyer schedule styling: center the selected day and emphasize its times. */
.flyer-hours-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  align-items: start;
  text-align: center;
}

.flyer-hours-day {
  min-width: 0;
  padding: 4px;
  line-height: 1.5;
  overflow-wrap: break-word;
}


.flyer-hours-day {
  min-width: 0;
  text-align: center;
  overflow-wrap: anywhere;
}

.flyer-hours-day strong,
.flyer-hours-day small {
  display: block;
  margin-bottom: 3px;
}

.flyer-hours-day .hours-time {
  display: inline-block;
  margin-top: 3px;
  padding: 3px 7px;
  border-radius: 4px;
  background: #fff;
  color: #075e36;
  font-size: 16px;
  font-weight: 800;
}

.flyer-hours-day p {
  margin: 3px 0;
  line-height: 1.3;
}
  .page + .page {
  page-break-before: always;
  break-before: page;
}
          </style>
        </head>
        <body>
          <section class="page">
            <header>
              <img src="/images/LOGO.jpeg" alt="Desi Dawat logo" />
              <h1>Desi Dawat</h1>
              <p>Intialainen kasvisruoka / Indian Vegetarian Food</p>
              <!-- Flyer address placement: keep the restaurant address on the first menu page. -->
              <p>📍 Pateniementie 59, 90800 Oulu, Finland</p>
              <h2>${flyerDay === "all-menu"
  ? "RUOKALISTA / MENU CARD"
  : ({
      mon: "MONDAY",
      tue: "TUESDAY",
      wed: "WEDNESDAY",
      thu: "THURSDAY",
      fri: "FRIDAY",
      sat: "SATURDAY",
      sun: "SUNDAY"
    })[flyerDay] + " MENU / PÄIVÄN RUOKALISTA"}</h2>
            </header>
            ${(() => {
  const days = [
    { key: "mon_thu", fi: "Maanantai–torstai", en: "Monday–Thursday" },
    { key: "fri", fi: "Perjantai", en: "Friday" },
    { key: "sat", fi: "Lauantai", en: "Saturday" },
    { key: "sun", fi: "Sunnuntai", en: "Sunday" },
  ];

  const formatTime = (time) => time ? String(time).slice(0, 5) : "";
  // Daily menu flyers show only the selected day's schedule; the full menu retains the weekly schedule.
  const selectedHoursKey = ["mon", "tue", "wed", "thu"].includes(flyerDay) ? "mon_thu" : flyerDay;
  const visibleDays = flyerDay === "all-menu" ? days : days.filter(({ key }) => key === selectedHoursKey);

  return `
    <div class="flyer-opening-hours">
      <strong>AUKIOLOAJAT / OPENING HOURS</strong>
      <div class="flyer-hours-grid">
        ${visibleDays.map(({ key, fi, en }) => {
          const day = openingHours.find((d) => d.day_key === key);
          if (!day) return "";

          const morning = day.morning_closed
            ? "Suljettu / Closed"
            : `${formatTime(day.morning_open)}–${formatTime(day.morning_close)}`;

          const evening = day.evening_closed
            ? "Suljettu / Closed"
            : `${formatTime(day.evening_open)}–${formatTime(day.evening_close)}`;

          return `
            <div class="flyer-hours-day">
              <strong>${fi}</strong>
              <small>${en}</small>
              <p>Aamu / Morning: <span class="hours-time">${morning}</span></p>
              <p>Ilta / Evening: <span class="hours-time">${evening}</span></p>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
})()}
            <main id="menu"></main>
          </section>

          ${
            flyerFormat === "two-page" && flyerDay !== "all-menu"
              ? `
                <section class="page page-two">
                  <header>
                    <img src="/images/LOGO.jpeg" alt="Desi Dawat logo" />
                    <h1>TILAUSOHJEET</h1>
                    <p>HOW TO ORDER</p>
                  </header>
<br />
                  <h2>📲 Näin tilaat / How to Order</h2>
                  <p>WhatsApp: +358 449803211</p>
                  <p>Soita / Call: +358 449803211</p>
                <p>
  ${(() => {
  const day =
  openingHours.find((d) => d.day_key === flyerDay) ||
  openingHours.find((d) => d.day_key === "mon_thu") ||
  undefined;

  if (!day) {
    return "Aukioloajat: Ei saatavilla / Opening hours: Unavailable";
  }

  const formatTime = (time) =>
    time ? String(time).slice(0, 5) : "";

  return `
    Aukioloajat / Opening hours:
    <br />
    Aamu: ${
      day.morning_closed
        ? "Suljettu"
        : `${formatTime(day.morning_open)}–${formatTime(day.morning_close)}`
    }
    / Morning: ${
      day.morning_closed
        ? "Closed"
        : `${formatTime(day.morning_open)}–${formatTime(day.morning_close)}`
    }
    <br />
    Ilta: ${
      day.evening_closed
        ? "Suljettu"
        : `${formatTime(day.evening_open)}–${formatTime(day.evening_close)}`
    }
    / Evening: ${
      day.evening_closed
        ? "Closed"
        : `${formatTime(day.evening_open)}–${formatTime(day.evening_close)}`
    }
  `;
})()}
<br />
  <br />
  Ole hyvä ja ilmoita tilauksessasi ruokalistan tuotenumero, haluamasi määrä sekä toivomasi nouto- tai toimitusaika.
  <br />
  Please mention the menu item number, the quantity you wish to order, and your preferred pickup or delivery time.
</p>
         
                  <h2>🚚 Kuljetusmaksut / Delivery Charges</h2>
                  <p>Lähtöpaikka: Lidl, Pateniemi / Starting point: Lidl Store, Pateniemi</p>
                  <p>Enintään 3 km / Within 3 km: €2 alle €15 tilauksille / for orders below €15; ilmainen / FREE from €15.</p>
                  <p>Yli 3 km – enintään 7 km / More than 3 km up to 7 km: €3.50.</p>
                  <p>Yli 7 km – enintään 15 km / More than 7 km up to 15 km: €6.</p>
                  <p>Yli €75 tilaukset / Orders above €75: ILMAINEN KULJETUS / FREE DELIVERY.</p>
                </section>
              `
              : ""
          }

          <script>
            const menuItems = ${JSON.stringify(availableItems)};
            const root = document.getElementById("menu");
            const groups = {};

            menuItems.forEach((item) => {
              const category = item.main_category || "Menu";
              if (!groups[category]) groups[category] = [];
              groups[category].push(item);
            });
let dishNumber = 0;
            Object.entries(groups).forEach(([category, dishes]) => {
              const heading = document.createElement("h2");
              heading.textContent = category;
              root.appendChild(heading);

              dishes.forEach((dish, dishIndex) => {
                const row = document.createElement("div");
                row.className = "dish";

const image = document.createElement("img");
const imageName = String(dish.item_name || "").trim().toLowerCase();

const imageFiles = {
  "chole": "Chole.png",
  "chilli paneer": "Chilli Paneer.png",
  "dal makhani": "Dal Makhani.png",
  "dahi vada": "Dahi Vada.png",
  "kadai paneer": "Kadai Paneer.png",
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
  "mini meal": "Mini Meal.png",
  "bhature": "Bread Pakoda.png"
};


const savedImageUrl = String(dish.image_url || "").trim();

image.src = savedImageUrl
  ? savedImageUrl
  : imageFiles[imageName]
    ? "/images/" + imageFiles[imageName]
    : "/images/LOGO.jpeg";

image.alt = imageFiles[imageName]
  ? dish.item_name
  : "Desi Dawat logo";

image.className = "flyer-dish-image";
row.appendChild(image);

                
const name = document.createElement("div");
name.className = "flyer-dish-details";

const dishName = document.createElement("div");
dishName.className = "flyer-dish-name";
dishNumber++;
dishName.textContent = dishNumber + ". " + dish.item_name;
console.log("Flyer number:", dishIndex + 1, dish.item_name);
dishName.style.display = "block";
if (dish.short_information && dish.short_information.trim()) {
  const description = document.createElement("div");
  description.className = "flyer-dish-description";
  description.textContent = dish.short_information;
  name.appendChild(description);
}
name.prepend(dishName);

                const price = document.createElement("span");
                price.className = "price";
                price.textContent =
                  "€" + Number(dish.price_eur).toFixed(2);
console.log("Dish name element:", name.textContent);
console.log("Dish name HTML:", name.innerHTML);
                row.append(name, price);
                root.appendChild(row);
              });
            });
          </script>

<!-- Daily menu flyer intentionally ends after its menu and how-to-order pages; omit the old trailing welcome pages. -->
</body>
      </html>
    `);

    flyerWindow.document.close();
    flyerWindow.focus();
    flyerWindow.print();
  } catch (err) {
    alert("Unable to generate flyer: " + err.message);
  } finally {
    setFlyerGenerating(false);
  }
};

  
const loadOrders = useCallback(async (activeToken = token) => {
  if (!activeToken) return;

  setOrdersLoading(true);

  try {
    const data = await getAdminOrders(activeToken);
    setOrders(data);
  } catch (err) {
    setError(err.message);
  } finally {
    setOrdersLoading(false);
  }
}, []);

const loadInventory = useCallback(async (activeToken = token) => {
  if (!activeToken) return;

  setInventoryLoading(true);
  setInventoryError("");

  try {
    const data = await getAdminInventory(activeToken);
    setInventory(data);
  } catch (err) {
    setInventoryError(err.message || "Failed to load inventory.");
  } finally {
    setInventoryLoading(false);
  }
}, [token]);


useEffect(() => {
  if (token) {
    loadInventory(token);
  } else {
    setInventory([]);
  }
}, [token, loadInventory]);

  useEffect(() => { if (token) loadItems(token); }, [token, loadItems]);
  
  useEffect(() => {
    if (token) {
      loadOpeningHours();
    } else {
      setOpeningHours([]);
    }
  }, [token]);


async function handleDeleteOrder(order) {
  const confirmed = window.confirm(
    `Are you sure you want to permanently delete order #${order.order_id} for ${order.customer_name}? This action cannot be undone.`
  );

  if (!confirmed) return;

  setError("");
  setMessage("");

  try {
    await deleteOrder(token, order.order_id);

    setOrders((previous) =>
      previous.filter((item) => item.order_id !== order.order_id)
    );

    setMessage(`Order #${order.order_id} deleted successfully.`);
  } catch (err) {
    setError(err.message);
  }
}


function resetInventoryForm() {
  setInventoryForm({
    item_id: null,
    item_category: inventoryCategory,
    item_name: "",
    item_name_hindi: "",
    item_name_finnish: "",
    rack_number: "",
    item_size: "",
    quantity: "",
    unit: "pieces",
    availability: "available",
    expiry_date: "",
    expiry_note: "",
    notes: "",
  });
}

async function handleSaveInventory(event) {
  event.preventDefault();
  setInventoryError("");
  setMessage("");

  try {
  // Inventory size validation: reject container/count labels in Size; keep those in Unit.
  if (!isValidInventorySize(inventoryForm.item_size)) {
    setInventoryError("Size must be a number followed by gm or ml only (for example, 230 gm or 500 ml). Put can/pieces in Unit.");
    return;
  }
  const quantity = Number(inventoryForm.quantity);

  if (
    inventoryForm.quantity === "" ||
    !Number.isInteger(quantity) ||
    quantity < 0
  ) {
    setInventoryError("Quantity must be a whole number (0 or greater).");
    return;
  }
    const payload = {
      ...inventoryForm,
      item_size: normalizeInventorySize(inventoryForm.item_size),
      item_category: inventoryCategory,
    };

    if (inventoryForm.item_id) {
      await updateInventoryItem(token, inventoryForm.item_id, payload);
      setMessage("Inventory item updated successfully.");
    } else {
      await addInventoryItem(token, payload);
      setMessage("Inventory item added successfully.");
    }

    await loadInventory(token);
    resetInventoryForm();
  } catch (err) {
    setInventoryError(err.message || "Failed to save inventory item.");
  }
}

function handleEditInventory(item) {
  setInventoryForm({
    ...item,
    item_size: normalizeInventorySize(item.item_size),
    quantity: item.quantity ?? "",
    expiry_date: item.expiry_date
      ? String(item.expiry_date).slice(0, 10)
      : "",
  });
}

async function handleDeleteInventory(item) {
  const confirmed = window.confirm(
    `Delete "${item.item_name}" from inventory? This cannot be undone.`
  );

  if (!confirmed) return;

  setInventoryError("");
  setMessage("");

  try {
    await deleteInventoryItem(token, item.item_id);
    await loadInventory(token);
    setMessage("Inventory item deleted successfully.");
  } catch (err) {
    setInventoryError(err.message || "Failed to delete inventory item.");
  }
}


async function handleSaveDeliveryCharge(order) {
  const input = document.getElementById(
    `delivery-charge-${order.order_id}`
  );

  const deliveryCharge = Number(input?.value);

  if (
    !input ||
    input.value.trim() === "" ||
    !Number.isFinite(deliveryCharge) ||
    deliveryCharge < 0
  ) {
    setError("Please enter a valid delivery charge of €0.00 or more.");
    return;
  }

  if (order.order_type !== "delivery" && deliveryCharge !== 0) {
    setError("Takeaway orders must have a delivery charge of €0.00.");
    return;
  }

  setSavingCharge((previous) => ({
    ...previous,
    [order.order_id]: true,
  }));
  setError("");
  setMessage("");

  try {
    const result = await updateDeliveryCharge(
      token,
      order.order_id,
      deliveryCharge
    );

    setOrders((previous) =>
      previous.map((item) =>
        item.order_id === order.order_id
          ? {
              ...item,
              delivery_charge: result.delivery_charge,
              total_amount: result.total_amount,
            }
          : item
      )
    );

    setMessage(`Kuljetusmaksu
Delivery Charge saved for order #${order.order_id}.`);
  } catch (err) {
    setError(err.message);
  } finally {
    setSavingCharge((previous) => ({
      ...previous,
      [order.order_id]: false,
    }));
  }
}

  async function handleLogin(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await loginAdmin(username, password);
      sessionStorage.setItem("desiDawatAdminToken", result.token);
      setToken(result.token); setPassword(""); setMessage("Signed in successfully.");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function beginEdit(item) {
    setEditingId(item.item_id);
    setForm({
      main_category: item.main_category || "", subcategory: item.subcategory || "",
      item_name: item.item_name || "", quantity_serving: item.quantity_serving || "",
      price_eur: String(item.price_eur ?? ""), short_information: item.short_information || "",
      is_available: Boolean(Number(item.is_available)),
    });
    setMessage(""); setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() { setEditingId(null); setForm(blank); }

  async function handleSave(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const payload = { ...form, price_eur: Number(form.price_eur), is_available: Boolean(form.is_available) };
      await saveMenuItem(token, editingId ? { ...payload, item_id: editingId } : payload);
      setMessage(editingId ? "Menu item updated in MySQL." : "Menu item added to MySQL.");
      resetForm();
      await loadItems(token);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function toggleVisibility(item) {
    setError(""); setMessage("");
    try {
      await saveMenuItem(token, { ...item, is_available: !Boolean(Number(item.is_available)) });
      setMessage(`${item.item_name}: ${Boolean(Number(item.is_available)) ? "hidden from" : "shown on"} the customer menu.`);
      await loadItems(token);
    } catch (err) { setError(err.message); }
  }

  async function removeItem(item) {
    if (!window.confirm(`Permanently delete "${item.item_name}" from the database? Hiding is safer if you may need it later.`)) return;
    setError(""); setMessage("");
    try {
      await deleteMenuItem(token, item.item_id);
      setMessage("Menu item deleted.");
      if (editingId === item.item_id) resetForm();
      await loadItems(token);
    } catch (err) { setError(err.message); }
  }

  // Admin sign-out: clear the session and leave the protected route immediately.
  function logout() {
    sessionStorage.removeItem("desiDawatAdminToken");
    setToken(""); setItems([]); resetForm(); setMessage("Signed out.");
    navigate("/admin/login", { replace: true });
  }

  
  async function loadOpeningHours() {
    setHoursLoading(true);
    setHoursError("");

    try {
      const data = await getOpeningHours();
     setOpeningHours(
  data.map((day) => ({
    ...day,
    morning_open: String(day.morning_open ?? "").slice(0, 5),
    morning_close: String(day.morning_close ?? "").slice(0, 5),
    morning_closed: Boolean(day.morning_closed),
    evening_open: String(day.evening_open ?? "").slice(0, 5),
    evening_close: String(day.evening_close ?? "").slice(0, 5),
    evening_closed: Boolean(day.evening_closed),
  }))
);
    } catch (err) {
      setHoursError(err.message || "Could not load opening hours.");
    } finally {
      setHoursLoading(false);
    }
  }

  async function handleSaveOpeningHours(event) {
    event.preventDefault();
    setHoursSaving(true);
    setHoursError("");
    setHoursMessage("");

    try {
      await saveOpeningHours(token, openingHours);
      setHoursMessage("Opening hours saved successfully!");
      await loadOpeningHours();
    } catch (err) {
      setHoursError(err.message || "Could not save opening hours.");
    } finally {
      setHoursSaving(false);
    }
  }

  function updateOpeningHour(dayKey, field, value) {
    setOpeningHours((current) =>
      current.map((day) =>
        day.day_key === dayKey ? { ...day, [field]: value } : day
      )
    );
  }

  if (!token) return (
    <section className="admin-page narrow">
      <span className="eyebrow">PRIVATE AREA</span><h1>Menu administration</h1>
      <p className="muted">Sign in to manage Desi Dawat menu items and prices.</p>
      <form className="panel login-form" onSubmit={handleLogin}>
        <label>Username<input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="button button-primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="hint">Set your admin username and password in <code>backend/.env</code>.</p>
    </section>
  );

  return (
    <section className="admin-page">
      <div className="admin-heading">
        <div><span className="eyebrow">PRIVATE AREA</span><h1>Menu administration</h1><p className="muted">Changes are saved to your MySQL database.</p></div>
        <button className="button button-outline" onClick={logout}>Sign out</button>
      </div>

      <form className="panel editor-form" onSubmit={handleSave}>
        <div className="panel-heading"><h2>{editingId ? `Edit item #${editingId}` : "Add a menu item"}</h2>{editingId && <button type="button" className="text-button" onClick={resetForm}>Cancel edit</button>}</div>
        <div className="form-grid">
          <label>Dish name *<input value={form.item_name} onChange={(e) => setForm({ ...form, item_name: e.target.value })} required maxLength="200" /></label>
          <label>Main category *<input value={form.main_category} onChange={(e) => setForm({ ...form, main_category: e.target.value })} required maxLength="100" placeholder="e.g. Curries" /></label>
          <label>Subcategory<input value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })} maxLength="100" /></label>
          <label>Serving size<input value={form.quantity_serving} onChange={(e) => setForm({ ...form, quantity_serving: e.target.value })} maxLength="100" /></label>
          <label>Price (€) *<input type="number" min="0" step="0.01" value={form.price_eur} onChange={(e) => setForm({ ...form, price_eur: e.target.value })} required /></label>
          <label className="check-label"><input type="checkbox" checked={form.is_available} onChange={(e) => setForm({ ...form, is_available: e.target.checked })} /> Display on customer menu</label>
          <label className="full-field">Description<textarea rows="3" value={form.short_information} onChange={(e) => setForm({ ...form, short_information: e.target.value })} /></label>
          

<label className="full-field">
  Food picture URL
  <input
    type="url"
    value={form.image_url || ""}
    onChange={(e) =>
      setForm({ ...form, image_url: e.target.value })
    }
    placeholder="Paste the food picture URL here"
  />
  <input
    type="file"
    accept="image/*"
    onChange={async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const data = new FormData();
      data.append("image", file);

      try {
        const token = sessionStorage.getItem("desiDawatAdminToken");
        const response = await fetch(
          "http://localhost:3001/api/admin/upload",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            body: data,
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error || "Upload failed");
        }

        setForm({
          ...form,
          image_url: `http://localhost:3001${result.image_url}`,
        });

        alert("Food picture uploaded successfully.");
      } catch (error) {
        alert(error.message || "Could not upload picture.");
      }
    }}
  />
</label>

        </div>
        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}
        <div className="form-actions"><button className="button button-primary" disabled={busy}>{busy ? "Saving…" : editingId ? "Save changes" : "Add item"}</button><button type="button" className="button button-outline" onClick={resetForm}>Clear form</button></div>
      </form>



<section className="panel flyer-generator">
  <div className="panel-heading">
    <h2>Flyer Generator / Esitteen luonti</h2>
    <p className="muted">
      Generate a bilingual flyer using your website's menu and images.
    </p>
  </div>

  <div className="form-grid">
    <label>
      Select day / Valitse päivä
      <select
        value={flyerDay}
        onChange={(e) => setFlyerDay(e.target.value)}
      >
        <option value="mon">Monday / Maanantai</option>
        <option value="tue">Tuesday / Tiistai</option>
        <option value="wed">Wednesday / Keskiviikko</option>
        <option value="thu">Thursday / Torstai</option>
        <option value="fri">Friday / Perjantai</option>
        <option value="sat">Saturday / Lauantai</option>
        <option value="sun">Sunday / Sunnuntai</option>
        <option value="all-menu">Desi-Dawat_Menu / Koko ruokalista</option>
      </select>
    </label>

    <label>
      Flyer format / Esitteen muoto
      <select
        value={flyerFormat}
        onChange={(e) => setFlyerFormat(e.target.value)}
      >
        <option value="one-page">One-page menu / Yhden sivun menu</option>
        <option value="two-page">Two-page flyer / Kahden sivun esite</option>
        <option value="welcome-message">Welcome_message</option>
      </select>
    </label>
  </div>

<div className="flyer-item-selection">
  <h3>Select dishes / Valitse annokset</h3>
  <p className="muted">
    Select the dishes to include in your flyer.
  </p>
  <div className="flyer-selection-actions">
  <button
    type="button"
    className="secondary-button"
    onClick={() => {
  const availableIds = items
    .filter((item) => Boolean(Number(item.is_available)))
    .map((item) => String(item.item_id));

  if (flyerDay === "all-menu") {
    setSelectedAllMenuItems(availableIds);
  } else {
    setSelectedFlyerItems(availableIds);
  }
}}
  >
    Select All / Valitse kaikki
  </button>

  <button
    type="button"
    className="secondary-button"
    onClick={() => setSelectedFlyerItems([])}
  >
    Deselect All / Poista valinnat
  </button>
</div>

  {[...new Set(
    items
      .filter((item) => Boolean(item.is_available))
      .map((item) => item.main_category || "Other")
  )].map((category) => (
    <div className="flyer-category" key={category}>
      <h4>{category}</h4>

      {items
        .filter(
          (item) =>
            Boolean(item.is_available) &&
            (item.main_category || "Other") === category
        )
        .map((item) => (
          <label className="check-label" key={item.item_id}>
            <input
              type="checkbox"
              checked={
  flyerDay === "all-menu"
   ? selectedAllMenuItems.map(String).includes(String(item.item_id))
: selectedFlyerItems.map(String).includes(String(item.item_id))
}
onChange={(e) => {
  const checked = e.target.checked;
  const setter =
    flyerDay === "all-menu"
      ? setSelectedAllMenuItems
      : setSelectedFlyerItems;

  setter((previous) => {
    const itemId = String(item.item_id);

    if (checked) {
      return previous.map(String).includes(itemId)
        ? previous
        : [...previous, item.item_id];
    }

    return previous.filter((id) => String(id) !== itemId);
  });
}}
            />
            {item.item_name} — €
            {Number(item.price_eur).toFixed(2)}
          </label>
        ))}
    </div>
  ))}
</div>

  <div className="form-actions">
    <button
      type="button"
      className="button button-primary"
     onClick={handleGenerateFlyer}
disabled={flyerGenerating}
    >
      Generate Flyer / Luo esite
      {flyerGenerating
  ? "Generating..."
  : "Generate Flyer / Luo esite"}
    </button>
  </div>
</section>

<section className="panel opening-hours-admin">
  <div className="panel-heading">
    <h2>Opening Hours / Aukioloajat</h2>
    <p className="muted">
      Update the hours displayed on the customer menu.
    </p>
  </div>

  {hoursLoading && <p>Loading opening hours...</p>}
  {hoursError && <p className="form-error">{hoursError}</p>}
  {hoursMessage && <p className="form-success">{hoursMessage}</p>}

  {!hoursLoading && openingHours.length > 0 && (
    <form onSubmit={handleSaveOpeningHours}>
      {openingHours.map((day) => (
  <div className="field-row" key={day.day_key}>
    <div>
      <strong>{day.day_fi}</strong>
      <p className="muted">{day.day_en}</p>
    </div>

    <div>
      <strong>Morning / Aamu</strong>
      <label>
        Opens
        <input
          type="time"
          value={String(day.morning_open ?? "").slice(0, 5)}
          disabled={Boolean(day.morning_closed)}
          onChange={(e) =>
            updateOpeningHour(day.day_key, "morning_open", e.target.value)
          }
          required={!day.morning_closed}
        />
      </label>
      <label>
        Closes
        <input
          type="time"
          value={String(day.morning_close ?? "").slice(0, 5)}
          disabled={Boolean(day.morning_closed)}
          onChange={(e) =>
            updateOpeningHour(day.day_key, "morning_close", e.target.value)
          }
          required={!day.morning_closed}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={Boolean(day.morning_closed)}
          onChange={(e) =>
            updateOpeningHour(day.day_key, "morning_closed", e.target.checked)
          }
        />
        Closed / Suljettu
      </label>
    </div>

    <div>
      <strong>Evening / Ilta</strong>
      <label>
        Opens
        <input
          type="time"
          value={String(day.evening_open ?? "").slice(0, 5)}
          disabled={Boolean(day.evening_closed)}
          onChange={(e) =>
            updateOpeningHour(day.day_key, "evening_open", e.target.value)
          }
          required={!day.evening_closed}
        />
      </label>
      <label>
        Closes
        <input
          type="time"
          value={String(day.evening_close ?? "").slice(0, 5)}
          disabled={Boolean(day.evening_closed)}
          onChange={(e) =>
            updateOpeningHour(day.day_key, "evening_close", e.target.value)
          }
          required={!day.evening_closed}
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={Boolean(day.evening_closed)}
          onChange={(e) =>
            updateOpeningHour(day.day_key, "evening_closed", e.target.checked)
          }
        />
        Closed / Suljettu
      </label>
    </div>
  </div>
))}

      <div className="form-actions">
        <button
          type="submit"
          className="button button-primary"
          disabled={hoursSaving || openingHours.length !== 4}
        >
          {hoursSaving ? "Saving..." : "Save Opening Hours"}
        </button>
      </div>
    </form>
  )}

  {!hoursLoading && !hoursError && openingHours.length === 0 && (
    <p>No opening hours found in the database.</p>
  )}
</section>


<section className="panel inventory-admin">
  <div className="inventory-print-header">
  <img src="/images/LOGO.jpeg" alt="Desi Dawat Logo" />
  <h1>DESI DAWAT</h1>
  <p>Tuoretta intialaista kasvisruokaa</p>
  <p>Fresh Indian Vegetarian Food</p>
  <p>Pateniementie 59, 90800 Oulu</p>
  <p>Puh. / Tel. +358 449803211</p>

  <hr />
  <h2>INVENTORY REPORT / VARASTORAPORTTI</h2>
</div>


  <div className="panel-heading">
    <h2>Inventory / Varasto</h2>
    <p className="muted">
      Manage packing materials and food items.
    </p>
  </div>
<div className="inventory-report-actions">
  <button
    type="button"
    className="secondary-button"
    onClick={() => window.print()}
  >
    Print Inventory Report / Tulosta varastoraportti
  </button>
</div>
  {inventoryError && (
    <p className="form-error">{inventoryError}</p>
  )}

  {inventoryMessage && (
    <p className="form-success">{inventoryMessage}</p>
  )}

  <div className="field-row">
    <label>
      Inventory Category
      <select
        value={inventoryCategory}
        onChange={(event) => {
          const category = event.target.value;
          setInventoryCategory(category);
          setInventoryForm((previous) => ({
            ...previous,
            item_id: null,
            item_category: category,
            item_name: "",
            item_name_hindi: "",
            item_name_finnish: "",
            rack_number: "",
            item_size: "",
            quantity: "",
            unit: category === "packing_material" ? "pieces" : "kg",
            availability: "available",
            expiry_date: "",
            expiry_note: "",
            notes: "",
          }));
        }}
      >
        <option value="packing_material">Packing Materials</option>
        <option value="food_item">Food Items</option>
      </select>
    </label>
  </div>

  <form onSubmit={handleSaveInventory}>
    <div className="field-row">
      <label>
        Item Name *
        <input
          required
          value={inventoryForm.item_name}
          onChange={(event) =>
            setInventoryForm((previous) => ({
              ...previous,
              item_name: event.target.value,
            }))
          }
        />
      </label>

      <label>
        Size (gm or ml only)
        <input
          value={inventoryForm.item_size}
          pattern="[0-9]+([.][0-9]+)?[ ]*(gm|ml)"
          title="Enter a measurement such as 230 gm or 500 ml. Put can or pieces in Unit."
          placeholder="e.g. 230 gm or 500 ml"
          onChange={(event) =>
            setInventoryForm((previous) => ({
              ...previous,
              item_size: event.target.value,
            }))
          }
        />
        <small className="muted">Use gm or ml here. Record cans, pieces, packs, etc. in the Unit field.</small>
      </label>
    </div>

    <div className="field-row">
      <label>
        Quantity
        <input
          type="number"
          min="0"
          step="1"
          value={inventoryForm.quantity}
          onChange={(event) =>
            setInventoryForm((previous) => ({
              ...previous,
              quantity: event.target.value,
            }))
          }
        />
      </label>

      <label>
        Unit
        <input
          value={inventoryForm.unit}
          placeholder="pieces, kg, litres"
          onChange={(event) =>
            setInventoryForm((previous) => ({
              ...previous,
              unit: event.target.value,
            }))
          }
        />
      </label>
    </div>

    {inventoryCategory === "food_item" && (
      <div className="field-row">
        <label>
          Expiry Date
          <input
            type="date"
            value={inventoryForm.expiry_date}
            onChange={(event) =>
              setInventoryForm((previous) => ({
                ...previous,
                expiry_date: event.target.value,
              }))
            }
          />
        </label>

        <label>
          Expiry Note
          <input
            value={inventoryForm.expiry_note}
            placeholder="e.g. Use first"
            onChange={(event) =>
              setInventoryForm((previous) => ({
                ...previous,
                expiry_note: event.target.value,
              }))
            }
          />
        </label>
      </div>
    )}

    <div className="field-row">
      <label>
        Rack Number
        <input
          value={inventoryForm.rack_number}
          onChange={(event) =>
            setInventoryForm((previous) => ({
              ...previous,
              rack_number: event.target.value,
            }))
          }
        />
      </label>

      <label>
        Availability
        <select
          value={inventoryForm.availability}
          onChange={(event) =>
            setInventoryForm((previous) => ({
              ...previous,
              availability: event.target.value,
            }))
          }
        >
          <option value="available">Available</option>
          <option value="low_stock">Low Stock</option>
          <option value="out_of_stock">Out of Stock</option>
          <option value="not_confirmed">Not Confirmed</option>
        </select>
      </label>
    </div>

    <label>
      Notes
      <textarea
        value={inventoryForm.notes}
        onChange={(event) =>
          setInventoryForm((previous) => ({
            ...previous,
            notes: event.target.value,
          }))
        }
      />
    </label>

    <div className="form-actions">
      <button className="button button-primary" type="submit">
        {inventoryForm.item_id ? "Update Item" : "Add Item"}
      </button>

      <button
        className="button button-outline"
        type="button"
        onClick={resetInventoryForm}
      >
        Clear Form
      </button>
    </div>
  </form>

  <hr />

  <h3>Current Inventory</h3>

  {inventoryLoading && <p>Loading inventory...</p>}

  {!inventoryLoading && (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Size</th>
            <th>Quantity</th>
            <th>Expiry</th>
            <th>Availability</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {inventory
            .filter(
              (item) => item.item_category === inventoryCategory
            )
            .map((item) => (
              <tr key={item.item_id}>
                <td>{item.item_name}</td>
                <td>{normalizeInventorySize(item.item_size) || "—"}</td>
                <td>
  {item.quantity == null || item.quantity === ""
    ? "—"
    : Number(item.quantity).toLocaleString("en-US", {
        maximumFractionDigits: 0,
      })}{" "}
  {item.unit}
</td>
                <td>
  {item.expiry_date
    ? (() => {
        const date = String(item.expiry_date).slice(0, 10);
        const [year, month, day] = date.split("-");
        return `${day}-${month}-${year}`;
      })()
    : "—"}
</td>
                <td>{item.availability.replaceAll("_", " ")}</td>
                <td>
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => handleEditInventory(item)}
                  >
                    Edit
                  </button>
                  {" "}
                  <button
                    type="button"
                    className="button button-outline"
                    onClick={() => handleDeleteInventory(item)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

          {inventory.filter(
            (item) => item.item_category === inventoryCategory
          ).length === 0 && (
            <tr>
              <td colSpan="6">No inventory items in this category yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )}
</section>

<div className="admin-list-heading">
  <h2>
    Customer Orders{" "}
    <span className="count-pill">{orders.length}</span>
  </h2>
  <button
    className="button button-outline"
    onClick={() => loadOrders(token)}
    disabled={ordersLoading}
  >
    {ordersLoading ? "Loading…" : "Refresh orders"}
  </button>
</div>

{error && <p className="form-error">{error}</p>}

{ordersLoading ? (
  <p className="notice">Loading customer orders…</p>
) : orders.length === 0 ? (
  <div className="notice">No customer orders found.</div>
) : (
  <div className="table-wrap">
    <table className="admin-table">
      <thead>
        <tr>
          <th>Order</th>
          <th>Customer</th>
          <th>Items</th>
          <th>Delivery Charge</th>
          <th>Total</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => (
          <tr key={order.order_id}>
            <td>
              <strong>Receipt #{order.receipt_number}</strong>
              <small>
                {order.created_at
                  ? new Date(order.created_at).toLocaleString()
                  : ""}
              </small>
            </td>
            <td>
              <strong>{order.customer_name}</strong>
              <small>{order.customer_phone}</small>
              <small>
                {order.order_type === "delivery" ? "Home delivery" : "Takeaway"}
              </small>
              {order.delivery_address && (
                <small>{order.delivery_address}</small>
              )}
              {order.customer_notes && (
                <small>Note: {order.customer_notes}</small>
              )}
            </td>
            <td>
              
{(order.items || []).map((dish, index) => (
  <small key={`${dish.item_id}-${index}`}>
    <strong>{dish.item_name}</strong>
    <br />
    Quantity: {dish.quantity}
    {" · "}Unit price: €{Number(dish.unit_price).toFixed(2)}
    {" · "}Item total: €{Number(dish.line_total).toFixed(2)}
  </small>
))}

            </td>
            
<td>
  {order.order_type === "delivery" ? (
    <div>
      <label>
        Kuljetusmaksu
Delivery Charge (€)
        <input
          id={`delivery-charge-${order.order_id}`}
          type="number"
          min="0"
          step="0.01"
          defaultValue={Number(order.delivery_charge || 0).toFixed(2)}
          disabled={Boolean(savingCharge[order.order_id])}
        />
      </label>

      <button
        type="button"
        className="button button-primary"
        disabled={Boolean(savingCharge[order.order_id])}
        onClick={() => handleSaveDeliveryCharge(order)}
      >
        {savingCharge[order.order_id] ? "Saving…" : "Save charge"}
      </button>
    </div>
  ) : (
    <span>€0.00 — Takeaway</span>
  )}
</td>

            
<td>
  {/* Existing order totals: reflect any discount saved from the dashboard order manager. */}
  <small>Food subtotal: €{(Number(order.total_amount) - Number(order.delivery_charge || 0) + Number(order.discount_amount || 0)).toFixed(2)}</small>
  <br />
  <small>Discount ({Number(order.discount_percent || 0).toFixed(2)}%): −€{Number(order.discount_amount || 0).toFixed(2)}</small>
  <br />
  <strong>
    Grand total: €{Number(order.total_amount).toFixed(2)}
  </strong>
</td>

            <td>
              <select
                value={order.order_status}
                onChange={async (event) => {
                  const newStatus = event.target.value;
                  try {
                    await updateOrderStatus(token, order.order_id, newStatus);
                    setOrders((previous) =>
                      previous.map((item) =>
                        item.order_id === order.order_id
                          ? { ...item, order_status: newStatus }
                          : item
                      )
                    );
                    setMessage(`Order #${order.order_id} status updated.`);
                    setError("");
                  } catch (err) {
                    setError(err.message);
                  }
                }}
              >
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed</option>
                <option value="preparing">Preparing</option>
                <option value="ready">Ready</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </td>
          
<td>
  <div className="order-action-buttons">
    <button
      type="button"
      className="button"
      onClick={() => setReceiptOrder(order)}
    >
      Print Receipt
    </button>

    <button
      type="button"
      className="button button-outline"
      onClick={() => handleDeleteOrder(order)}
    >
      Delete order
    </button>
  </div>
</td>

          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}

      <div className="admin-list-heading"><h2>All menu items <span className="count-pill">{items.length}</span></h2><button className="button button-outline" onClick={() => loadItems(token)}>Refresh</button></div>
      {error && <p className="form-error">{error}</p>}
      <div className="table-wrap">
        <table className="admin-table">
          <thead><tr><th>Dish</th><th>Category</th><th>Price</th><th>Visibility</th><th>Actions</th></tr></thead>
          <tbody>{items.map((item) => {
            const visible = Boolean(Number(item.is_available));
            return <tr key={item.item_id}>
              <td><strong>{item.item_name}</strong><small>#{item.item_id} · {item.quantity_serving || "Serving not set"}</small></td>
              <td>{item.main_category}<small>{item.subcategory || ""}</small></td>
              <td>€{Number(item.price_eur).toFixed(2)}</td>
              <td><span className={`status ${visible ? "status-on" : "status-off"}`}>{visible ? "Visible" : "Hidden"}</span><button className="text-button" onClick={() => toggleVisibility(item)}>{visible ? "Hide" : "Show"}</button></td>
              <td><div className="row-actions"><button className="text-button" onClick={() => beginEdit(item)}>Edit</button><button className="text-button danger-text" onClick={() => removeItem(item)}>Delete</button></div></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    
      {items.length === 0 && <div className="notice">No items returned. Check the database connection and table.</div>}

      {receiptOrder && (
        <div className="receipt-overlay print-receipt-only">
          <div className="receipt-card">
            <div className="receipt-actions no-print">
              <button
                type="button"
                className="button button-primary"
                onClick={() => {
  const receipt = document.querySelector(".print-receipt-only");

  if (!receipt) {
    alert("Receipt not found");
    return;
  }

  const printWindow = window.open("", "_blank", "width=900,height=700");

  if (!printWindow) {
    alert("Please allow pop-ups to print the receipt.");
    return;
  }

  const styles = Array.from(
    document.querySelectorAll("style, link[rel='stylesheet']")
  )
    .map((element) => element.outerHTML)
    .join("\n");

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Desi Dawat Receipt</title>
        ${styles}
        <style>
          @page { size: A4; margin: 8mm; }
          body { margin: 0; background: white; }
          .receipt-overlay {
            position: static !important;
            inset: auto !important;
            width: 100% !important;
            height: auto !important;
            overflow: visible !important;
            padding: 0 !important;
            background: white !important;
          }
          .receipt-card {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
          }
          .receipt-actions, .no-print { display: none !important; }
          .receipt-paper {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            box-sizing: border-box !important;
          }
          .receipt-details-grid {
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
          }
          /* Receipt print design: strengthen branding and highlight totals without changing receipt content. */
          .receipt-paper { border: 1px solid #ead8b8 !important; border-top: 8px solid #c79b35 !important; color: #39291f !important; }
          .receipt-brand { padding-bottom: 16px; border-bottom: 1px solid #ead8b8; }
          .receipt-brand h1 { font-family: Georgia, serif; letter-spacing: 1.5px; }
          .receipt-details-grid p { padding: 8px 10px; background: #fcf8f2; border: 1px solid #eee4d7; border-radius: 5px; }
          .receipt-items th { color: #fff !important; background: #791d2a !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .receipt-items tbody tr:nth-child(even) { background: #fcf8f2; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          .receipt-total { padding: 13px 15px; background: #fff3d9; border-left: 5px solid #c79b35; border-bottom: 2px solid #c79b35; border-radius: 4px; }
          .receipt-thanks { color: #791d2a; font-weight: 600; }
          /* Single-page receipt print: compact the cloned receipt for typical orders on A4 paper. */
          @page { size: A4; margin: 6mm; }
          @media print {
            .receipt-paper { font-size: 10.5px !important; line-height: 1.25 !important; border-top-width: 4px !important; }
            .receipt-brand { padding-bottom: 6px !important; margin-bottom: 7px !important; }
            .receipt-brand img { width: 54px !important; height: 54px !important; }
            .receipt-brand h1 { font-size: 20px !important; margin: 4px 0 !important; }
            .receipt-details-grid { gap: 2px 7px !important; }
            .receipt-details-grid p { padding: 4px 6px !important; margin: 2px 0 !important; }
            .receipt-paper h2, .receipt-paper h3 { margin: 7px 0 5px !important; }
            .receipt-items { margin: 7px 0 !important; font-size: 10px !important; }
            .receipt-items th, .receipt-items td { padding: 4px 5px !important; }
            .receipt-total { margin: 6px 0 !important; padding: 7px 9px !important; }
            .receipt-paper hr { margin: 6px 0 !important; }
            /* Receipt print spacing: use more of the page height while keeping the receipt readable. */
            .receipt-paper { font-size: 11.5px !important; line-height: 1.4 !important; }
            .receipt-brand { padding-bottom: 10px !important; margin-bottom: 12px !important; }
            .receipt-brand img { width: 62px !important; height: 62px !important; }
            .receipt-brand h1 { font-size: 22px !important; margin: 6px 0 !important; }
            .receipt-details-grid { gap: 5px 9px !important; }
            .receipt-details-grid p { padding: 6px 8px !important; margin: 4px 0 !important; }
            .receipt-items { margin: 12px 0 !important; font-size: 11px !important; }
            .receipt-items th, .receipt-items td { padding: 6px 7px !important; }
            .receipt-total { margin: 10px 0 !important; padding: 10px 12px !important; }
            /* Receipt color theme: emphasize the restaurant details and make item information easier to scan. */
            .receipt-brand p { color: #6f4b16 !important; font-weight: 600 !important; }
            .receipt-brand p.receipt-english { color: #791d2a !important; font-weight: 700 !important; }
            .receipt-details-grid p { color: #35231d !important; background: #fff9ec !important; border-color: #e3cf9b !important; }
            .receipt-details-grid strong { color: #791d2a !important; }
            .receipt-items th { color: #fff !important; background: #791d2a !important; }
            .receipt-items td { color: #35231d !important; border-bottom-color: #e8d7b2 !important; }
            .receipt-items tbody tr:nth-child(even) { background: #fff7e5 !important; }
            .receipt-total { color: #791d2a !important; background: #fff0cc !important; border-color: #b58a26 !important; }
            /* Sky-blue receipt accents: highlight item names and charge lines, with a clear border around the printed page. */
            .receipt-paper { border: 2px solid #3b91bd !important; border-top: 6px solid #267ba5 !important; padding: 5mm !important; }
            .receipt-brand { border-color: #9ecfe4 !important; }
            .receipt-brand p { color: #245c78 !important; }
            .receipt-brand p.receipt-english { color: #175b83 !important; }
            .receipt-details-grid p { color: #234b5d !important; background: #f0f9fc !important; border-color: #b7dce9 !important; }
            .receipt-details-grid strong { color: #175b83 !important; }
            .receipt-items { border: 1px solid #76b9d4 !important; }
            .receipt-items th { background: #267ba5 !important; color: #fff !important; }
            .receipt-items td { border-bottom-color: #c9e4ef !important; }
            .receipt-items tbody td:first-child { color: #175b83 !important; font-weight: 700 !important; }
            .receipt-items tbody tr:nth-child(even) { background: #edf8fc !important; }
            .receipt-total { color: #144f70 !important; background: #e6f5fb !important; border-color: #3b91bd !important; }
            /* Minimal receipt theme: replace colored cards with clean typography, fine dividers, and one restrained blue accent. */
            .receipt-paper { color: #202124 !important; background: #fff !important; border: 1px solid #c79b35 !important; border-top: 4px solid #c79b35 !important; }
            .receipt-brand { border-bottom-color: #dadce0 !important; }
            .receipt-brand p, .receipt-brand p.receipt-english { color: #5f6368 !important; }
            .receipt-details-grid p { color: #3c4043 !important; background: transparent !important; border: 0 !important; border-bottom: 1px solid #e8eaed !important; border-radius: 0 !important; padding: 5px 0 !important; }
            .receipt-details-grid strong { color: #5f6368 !important; }
            .receipt-paper h2, .receipt-paper h3 { color: #202124 !important; }
            .receipt-items { border: 0 !important; }
            .receipt-items th { color: #3c4043 !important; background: #f8f9fa !important; border-bottom: 2px solid #c79b35 !important; }
            .receipt-items td { color: #3c4043 !important; border-bottom: 1px solid #e8eaed !important; }
            .receipt-items tbody td:first-child { color: #202124 !important; font-weight: 600 !important; }
            .receipt-items tbody tr:nth-child(even) { background: #fff !important; }
            .receipt-total { color: #202124 !important; background: transparent !important; border: 0 !important; border-top: 2px solid #c79b35 !important; border-bottom: 1px solid #dadce0 !important; border-radius: 0 !important; padding: 9px 0 !important; }
            /* Receipt payment block: keep the selected payment request short and separated. */
            .receipt-payment-details { margin: 7px 0 !important; padding: 5px 0 !important; border-top: 1px solid #c79b35 !important; break-inside: avoid; }
            .receipt-payment-details h3 { margin: 3px 0 4px !important; font-size: 12px !important; color: #202124 !important; }
            .receipt-payment-details p { margin: 2px 0 !important; padding: 0 !important; border: 0 !important; background: transparent !important; color: #3c4043 !important; }
            .receipt-mobile-payment { display: flex !important; align-items: center !important; gap: 8px !important; }
            .receipt-mobile-payment img { width: 72px !important; height: 72px !important; object-fit: contain !important; }
            .receipt-mobile-payment p { margin: 0 !important; }
            /* Payment request page: force the selected payment method onto a distinct second A4 sheet. */
            .receipt-payment-page { break-before: page !important; page-break-before: always !important; min-height: 270mm; box-sizing: border-box; border: 1px solid #c79b35; border-top: 5px solid #c79b35; padding: 18mm; }
            .payment-page-brand { text-align: center; padding-bottom: 12px; margin-bottom: 20px; border-bottom: 1px solid #dadce0; }
            .payment-page-brand h1 { font: 700 24px Georgia, serif; color: #202124; margin: 0 0 6px; }
            .payment-page-brand p { margin: 3px 0; color: #5f6368; }
            /* Payment page options: separate each accepted method for easy reading and printing. */
            .payment-method-option { margin: 14px 0 !important; padding: 12px !important; border: 1px solid #dadce0 !important; break-inside: avoid; }
            .payment-method-option h2 { margin: 0 0 8px !important; }
            .payment-method-option p { margin: 5px 0 !important; }
            .receipt-payment-details { margin: 18px 0 !important; padding: 12px 0 !important; border-top: 1px solid #dadce0 !important; break-inside: avoid; }
            .receipt-payment-details h2 { font-size: 18px !important; color: #202124 !important; }
            .receipt-payment-details p { margin: 8px 0 !important; }
            .receipt-payment-details .payment-instruction { margin-top: 20px !important; font-weight: 700 !important; }
            .receipt-mobile-payment img { width: 128px !important; height: 128px !important; }
          }
        </style>
      </head>
      <body>
        ${receipt.outerHTML}
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();

  printWindow.onload = () => {
    printWindow.print();
  };
}}
              >
                Print / Save as PDF
              </button>
              <button
                type="button"
                className="button button-outline"
                onClick={() => setReceiptOrder(null)}
              >
                Close
              </button>
            </div>

            <div className="receipt-paper">
             <div className="receipt-brand">
  <img src="/images/LOGO.jpeg" alt="Desi Dawat logo" />

  <h1>DESI DAWAT</h1>

  <p>Tuoretta intialaista kasvisruokaa</p>
  <p className="receipt-english">
    Fresh Indian Vegetarian Food
  </p>

  <p>Pateniementie 59, 90800 Oulu</p>
  <p>Puh. / Tel. +358 449803211</p>
  {/* Receipt contact: restaurant email address. */}
  <p>Email: desidawat.food@gmail.com</p>
</div>

              <hr />

              <h2>TILAUSKUITTI
Order Receipt</h2>
<div className="receipt-details-grid">
              <p>
  <strong>Kuitti nro</strong>
  <span className="receipt-english">Receipt No.</span>
  <span>#{receiptOrder.receipt_number}</span>
</p>
              <p>
  <strong>Päivämäärä</strong>
  <span className="receipt-english">Date</span>
  {receiptOrder.created_at
    ? new Date(receiptOrder.created_at).toLocaleString()
    : "—"}
</p>
              <p>
  <strong>Asiakas</strong>
  <span className="receipt-english">Customer</span>
  {receiptOrder.customer_name}
</p>
              <p>
  <strong>Puhelin</strong>
  <span className="receipt-english">Phone</span>
  {receiptOrder.customer_phone}
</p>
              <p>
  <strong>Tilaustyyppi</strong>
  <span className="receipt-english">Order Type</span>
  {receiptOrder.order_type === "delivery"
    ? "Kotiinkuljetus / Home Delivery"
    : "Nouto / Takeaway"}
</p>

              {receiptOrder.delivery_address && (
  <p>
    <strong>Toimitusosoite</strong>
    <span className="receipt-english">Delivery Address</span>
    {receiptOrder.delivery_address}
  </p>
)}

</div>
              <hr />

              <h3>
  Tuotteet
  <span className="receipt-english">Items</span>
</h3>
              <table className="receipt-items">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Qty</th>
                    <th>Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(receiptOrder.items || []).map((dish, index) => (
                    <tr key={`${dish.item_id}-${index}`}>
                      <td>{dish.item_name}</td>
                      <td>{dish.quantity}</td>
                      <td>€{Number(dish.unit_price).toFixed(2)}</td>
                      <td>€{Number(dish.line_total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <hr />

              <p>
                Ruokien välisummaa
Food Subtotal: €
                {(Number(receiptOrder.total_amount) - Number(receiptOrder.delivery_charge || 0) + Number(receiptOrder.discount_amount || 0)).toFixed(2)}
              </p>
              {/* Receipt display: show a discount row only when a discount percentage is greater than zero. */}
              {Number(receiptOrder.discount_percent || 0) > 0 && (
                <p>Discount ({Number(receiptOrder.discount_percent || 0).toFixed(2)}%): −€{Number(receiptOrder.discount_amount || 0).toFixed(2)}</p>
              )}
              <p>Kuljetusmaksu
Delivery Charge: €
                {Number(receiptOrder.delivery_charge || 0).toFixed(2)}
              </p>
              <h2 className="receipt-total">
                YHTEENSÄ
TOTAL: €{Number(receiptOrder.total_amount).toFixed(2)}
              </h2>
              <p>
  <strong>Tilauksen tila</strong>
  <span className="receipt-english">Order Status</span>
  {receiptOrder.order_status}
</p>
              
<p className="receipt-payment-note">
  <strong>Tilauksesi on vahvistettu! 😊</strong>
  <span className="receipt-english">
    Your order is confirmed! 😊
  </span>
  Maksu voi näkyä tilillämme viiveellä – pankit eivät aina ole yhtä nopeita kuin keittiömme! Hyvää ruokahalua!
  <span className="receipt-english">
    Payment may take time to reach our account — banks aren't always as fast as our kitchen! Enjoy your meal!
  </span>
</p>

              <hr />
              <p className="receipt-thanks">
  Kiitos, kun tilasit Desi Dawatista! ❤️
  <span className="receipt-english">
    Thank you for ordering from Desi Dawat!
  </span>
  <span className="receipt-english">
    Hyvää ruokahalua! / Enjoy your meal!
  </span>
</p>
              {/* Receipt payment request: keep the chosen method on a dedicated second print page. */}
              <div className="receipt-payment-page">
                <header className="payment-page-brand">
                  <h1>DESI DAWAT</h1>
                  <p>Payment Options / Maksutavat</p>
                  <p>Receipt #{receiptOrder.receipt_number} · Amount due: €{Number(receiptOrder.total_amount || 0).toFixed(2)}</p>
                </header>

              <section className="receipt-payment-details">
                  {/* Receipt payment options: list each accepted way to pay, separated for quick scanning. */}
                  <div className="payment-method-option">
                    <h2>1. Pay on delivery or pickup</h2>
                    <p>Please pay €{Number(receiptOrder.total_amount || 0).toFixed(2)} when your order is {receiptOrder.order_type === "delivery" ? "delivered" : "collected"}.</p>
                  </div>
                  <div className="payment-method-option">
                    <h2>2. Bank transfer / IBAN</h2>
                    <p>Account holder: Ruchi Srivastava · Bank: OP Bank, Finland</p>
                    <p>IBAN: FI6157445020094271</p>
                    <p>BIC/SWIFT: OKOYFIHH</p>
                    <p>Please transfer €{Number(receiptOrder.total_amount || 0).toFixed(2)}.</p>
                    <p>Please show payment confirmation during delivery or pickup.</p>
                  </div>
                  <div className="payment-method-option">
                    <h2>3. MobilePay QR</h2>
                    <div className="receipt-mobile-payment">
                      <img src="/images/MobilePay-QR.png.jpeg" alt="MobilePay QR code" />
                      <p>Scan to pay €{Number(receiptOrder.total_amount || 0).toFixed(2)}. Please show payment confirmation during delivery or pickup.</p>
                    </div>
                  </div>
                </section>
              </div>
          </div>
        </div>
        </div>
      )}

    </section>
  );
}

