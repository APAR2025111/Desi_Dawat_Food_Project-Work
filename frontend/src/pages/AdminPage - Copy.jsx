import React from "react";
import { useCallback, useEffect, useState } from "react";

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
      if (err.message.toLowerCase().includes("session") || err.message.toLowerCase().includes("sign in")) {
        setToken("");
        sessionStorage.removeItem("desiDawatAdminToken");
      }
    }
  }, [token]);
  
const handleGenerateFlyer = () => {
  setFlyerGenerating(true);

  try {
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
  margin: 8px 0 12px;
  padding: 8px;
  border-top: 2px solid #c99a36;
  border-bottom: 1px solid #c99a36;
  font-size: 10px;
}

.flyer-hours-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
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

  return `
    <div class="flyer-opening-hours">
      <strong>AUKIOLOAJAT / OPENING HOURS</strong>
      <div class="flyer-hours-grid">
        ${days.map(({ key, fi, en }) => {
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
              <p>Aamu / Morning: ${morning}</p>
              <p>Ilta / Evening: ${evening}</p>
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
                  <p>📍 Pateniementie 59, 90800 Oulu, Finland</p>
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

<section class="page closing-page" style="page-break-before: always; break-before: page;">
  <header>
    <img src="/images/LOGO.jpeg" alt="Desi Dawat logo" />
    <h1>DESI DAWAT – OULU</h1>
    <p>Intialainen kasvisruoka / Indian Vegetarian Food</p>
    <p>Pateniementie 59, 90800 Oulu, Finland</p>
  </header>

  <h2>🇫🇮 SUOMEKSI</h2>
  <p>Tarjoamme tuoretta ja aitoa intialaista kasvisruokaa: herkullisia aterioita, leipiä, riisiä ja välipaloja.</p>
  <p>🚗 Kotiinkuljetus ja nouto saatavilla!</p>
  <p>❤️ Lämpimästi tervetuloa!</p>

  <hr />

  <h2>🇬🇧 ENGLISH</h2>
  <p>We offer fresh, authentic Indian vegetarian food, including delicious meals, breads, rice and snacks.</p>
  <p>🚗 Home delivery and pickup available!</p>
  <p>❤️ A warm welcome to everyone!</p>

  <hr />

  <h2>📋 MENU / RUOKALISTA &amp; ORDERS / TILAUKSET</h2>
  <p>
    <a href="https://drive.google.com/file/d/1hFz08DQoDrXuKx1zyj_nTuQZHui1b3TQ/view?usp=sharing">
      Open Menu / Avaa ruokalista
    </a>
  </p>

  <h2>📲 HOW TO ORDER / NÄIN TILAAT</h2>
  <p>🇫🇮 Lähetä WhatsApp-viesti ja ilmoita tuotenumero, määrä sekä toivottu nouto- tai toimitusaika.</p>
  <p>🇬🇧 Send a WhatsApp message with the item number, quantity, and preferred pickup or delivery time.</p>
  <p>
    <a href="https://wa.me/358449803211">WhatsApp: +358 44 980 3211</a>
  </p>

  <hr />

  <h2>🇫🇮 AUKIOLOAJAT / 🇬🇧 OPENING HOURS</h2>
  <p>Ma–To / Mon–Thu: 19:00–22:00</p>
  <p>Pe / Fri: 19:00–23:00</p>
  <p>La / Sat: 11:00–14:00, 18:00–22:00</p>
  <p>Su / Sun: 11:00–14:00, 18:00–21:00</p>

  <hr />

  <h2>📞 QUERIES &amp; ASSISTANCE / KYSYMYKSET JA APU</h2>
  <p><a href="tel:+358413279444">+358 41 327 9444</a></p>

  <p>🙏 Thank you for choosing Desi Dawat! ❤️</p>
  <p>🙏 Kiitos, että valitset Desi Dawatin! ❤️</p>
  <div class="whatsapp-qr">
  <h3>For More Updates, Join Our WhatsApp Group!</h3>
  <p>Lisää päivityksiä varten liity WhatsApp-ryhmäämme!</p>
  <img
  src="/images/WhatsApp_Group_QR.jpeg"
  alt="Desi Dawat WhatsApp group QR code"
  style="width: 150px; height: 150px; object-fit: contain;"
/>
  <p>Scan this QR code with WhatsApp to join our group.</p>
</div>
</section>


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

  function logout() {
    sessionStorage.removeItem("desiDawatAdminToken");
    setToken(""); setItems([]); resetForm(); setMessage("Signed out.");
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
  const setter =
    flyerDay === "all-menu"
      ? setSelectedAllMenuItems
      : setSelectedFlyerItems;

  setter((previous) =>
    e.target.checked
      ? [...previous, item.item_id]
      : previous.filter((id) => id !== item.item_id)
  );
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
        Size / Specification
        <input
          value={inventoryForm.item_size}
          placeholder="e.g. 500 ml box, 1 litre container"
          onChange={(event) =>
            setInventoryForm((previous) => ({
              ...previous,
              item_size: event.target.value,
            }))
          }
        />
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
                <td>{item.item_size || "—"}</td>
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
  <small>
    Ruokien välisummaa
Food Subtotal: €
    {(
      Number(order.total_amount) -
      Number(order.delivery_charge || 0)
    ).toFixed(2)}
  </small>
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
                {(Number(receiptOrder.total_amount) -
                  Number(receiptOrder.delivery_charge || 0)).toFixed(2)}
              </p>
              <p>
                Kuljetusmaksu
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
            </div>
          </div>
        </div>
      )}

    </section>
  );
}

