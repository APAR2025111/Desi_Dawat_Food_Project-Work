import React, { useEffect, useMemo, useState } from "react";
import { getAdminMenu, getOpeningHours } from "../api.js";

// Flyer manager: provide the dedicated flyer page with menu selection and print controls.
const flyerDays = [
  ["mon", "Monday / Maanantai"],
  ["tue", "Tuesday / Tiistai"],
  ["wed", "Wednesday / Keskiviikko"],
  ["thu", "Thursday / Torstai"],
  ["fri", "Friday / Perjantai"],
  ["sat", "Saturday / Lauantai"],
  ["sun", "Sunday / Sunnuntai"],
  ["all-menu", "Full menu / Koko ruokalista"],
];

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

export default function FlyerManagement({ token }) {
  const [items, setItems] = useState([]);
  const [openingHours, setOpeningHours] = useState([]);
  const [day, setDay] = useState("sun");
  const [format, setFormat] = useState("two-page");
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadFlyerData() {
      setLoading(true);
      setError("");
      try {
        const [menuData, hoursData] = await Promise.all([
          getAdminMenu(token),
          getOpeningHours(),
        ]);
        if (cancelled) return;
        const menu = Array.isArray(menuData) ? menuData : menuData?.items || [];
        setItems(menu);
        setSelectedIds(menu.filter((item) => Boolean(Number(item.is_available))).map((item) => String(item.item_id)));
        setOpeningHours(Array.isArray(hoursData) ? hoursData : hoursData?.hours || []);
      } catch (loadError) {
        if (!cancelled) setError(loadError.message || "Could not load menu items for the flyer.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (token) loadFlyerData();
    else {
      setLoading(false);
      setError("Your admin session has expired. Please sign in again.");
    }
    return () => { cancelled = true; };
  }, [token]);

  const availableItems = useMemo(
    () => items.filter((item) => Boolean(Number(item.is_available)) && selectedIds.includes(String(item.item_id))),
    [items, selectedIds]
  );
  const categories = useMemo(
    () => [...new Set(availableItems.map((item) => item.main_category || "Menu"))],
    [availableItems]
  );

  function toggleItem(itemId, checked) {
    const id = String(itemId);
    setSelectedIds((current) => checked
      ? (current.includes(id) ? current : [...current, id])
      : current.filter((existing) => existing !== id));
  }

  function generateFlyer() {
    if (format !== "welcome-message" && availableItems.length === 0) {
      setError("Select at least one available menu item before generating the flyer.");
      return;
    }
    const flyerWindow = window.open("", "_blank");
    if (!flyerWindow) {
      setError("Please allow pop-ups to open and print the flyer.");
      return;
    }
    setGenerating(true);
    setError("");
    setMessage("");

    // Daily menu flyers show only the selected day's hours on their ordering page.
    const selectedHoursKey = ["mon", "tue", "wed", "thu"].includes(day) ? "mon_thu" : day;
    const visibleOpeningHours = day === "all-menu"
      ? openingHours
      : openingHours.filter((entry) => entry.day_key === selectedHoursKey);
    const hoursMarkup = visibleOpeningHours.map((entry) => {
      const label = entry.day_en || entry.day_fi || entry.day_key || "";
      const morning = entry.morning_closed
        ? "Closed"
        : `${String(entry.morning_open || "").slice(0, 5)}–${String(entry.morning_close || "").slice(0, 5)}`;
      const evening = entry.evening_closed
        ? "Closed"
        : `${String(entry.evening_open || "").slice(0, 5)}–${String(entry.evening_close || "").slice(0, 5)}`;
      return `<div class="hours"><strong>${escapeHtml(label)}</strong><p>Morning: <span class="hours-time">${escapeHtml(morning)}</span></p><p>Evening: <span class="hours-time">${escapeHtml(evening)}</span></p></div>`;
    }).join("");

    // Welcome flyer hours: use the latest server-managed schedule and escape it before printing.
    const welcomeHoursMarkup = openingHours.map((entry) => {
      const periods = [];
      if (!entry.morning_closed && entry.morning_open && entry.morning_close) {
        periods.push(`${String(entry.morning_open).slice(0, 5)}–${String(entry.morning_close).slice(0, 5)}`);
      }
      if (!entry.evening_closed && entry.evening_open && entry.evening_close) {
        periods.push(`${String(entry.evening_open).slice(0, 5)}–${String(entry.evening_close).slice(0, 5)}`);
      }
      const schedule = periods.length ? periods.join(", ") : "Suljettu / Closed";
      const label = `${entry.day_fi || ""} / ${entry.day_en || ""}`;
      return `<strong>${escapeHtml(label)}: ${escapeHtml(schedule)}</strong><br />`;
    }).join("") || "<strong>Aukioloajat eivät saatavilla / Opening hours unavailable</strong>";

    // Welcome flyer: keep this content and print layout aligned with the full admin console version.
    if (format === "welcome-message") {
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
            <p>We offer fresh, authentic Indian vegetarian food, including delicious meals, breads, rice and snacks.</p>
            <p>🚗 Kotiinkuljetus ja nouto saatavilla!</p>
            <p>🚗 Home delivery and pickup available!</p>
            <hr />
            <h2>📋 RUOKALISTA-TILAUKSET/ MENU-ORDERS</h2>
            <p>
              <a href="https://drive.google.com/file/d/1hFz08DQoDrXuKx1zyj_nTuQZHui1b3TQ/view?usp=sharing" target="_blank" rel="noopener noreferrer">
                Avaa ruokalista/View Menu
              </a>
            </p>
            <h2>📲 NÄIN TILAAT/HOW TO ORDER</h2>
            <p>🇫🇮 Lähetä WhatsApp-viesti ja ilmoita tuotenumero, määrä sekä toivottu nouto- tai toimitusaika.</p>
            <p>🇬🇧 Send a WhatsApp message with the item number, quantity, and preferred pickup or delivery time.</p>
            <p><a href="https://wa.me/358449803211">WhatsApp: +358 44 980 3211</a></p>
            <hr />
            <hr />
            <h2>📞KYSYMYKSET JA APU/QUERIES &amp; ASSISTANCE</h2>
            <p><a href="tel:+358413279444">+358 41 327 9444</a></p>
            <p>🙏 Kiitos, että valitset Desi Dawatin! ❤️</p>
            <p>🙏 Thank you for choosing Desi Dawat! ❤️</p>
          </body>
        </html>
      `);
      flyerWindow.document.close();
      flyerWindow.focus();
      flyerWindow.print();
      setMessage("Flyer opened in a new window. Choose your print settings there.");
      setGenerating(false);
      return;
    } else {
      const menuMarkup = categories.map((category) => {
        const rows = availableItems.filter((item) => (item.main_category || "Menu") === category).map((item) => {
          const name = escapeHtml(item.item_name || item.item_name_en || "Menu item");
          const desc = item.short_information ? `<p class="description">${escapeHtml(item.short_information)}</p>` : "";
          const imageUrl = item.image_url ? escapeHtml(item.image_url) : "/images/LOGO.jpeg";
          return `<article class="dish"><img src="${imageUrl}" alt=""><div class="details"><strong>${name}</strong>${desc}</div><b>€${Number(item.price_eur || 0).toFixed(2)}</b></article>`;
        }).join("");
        return `<h2>${escapeHtml(category)}</h2>${rows}`;
      }).join("");
      const title = day === "all-menu" ? "MENU CARD / RUOKALISTA" : `${escapeHtml((flyerDays.find(([key]) => key === day)?.[1] || "Daily").split(" /")[0].toUpperCase())} MENU / PÄIVÄN RUOKALISTA`;
      const secondPage = format === "two-page" && day !== "all-menu"
        ? `<section class="second-page"><header><img src="/images/LOGO.jpeg" alt=""><h1>HOW TO ORDER / NÄIN TILAAT</h1></header><h2>WhatsApp: +358 44 980 3211</h2><p>Please include the menu item number, quantity, and your preferred pickup or delivery time.</p><p>Ilmoita tuotenumero, määrä ja toivottu nouto- tai toimitusaika.</p><div class="hours-grid">${hoursMarkup}</div><p>Home delivery and pickup available!</p></section>`
        : "";
      flyerWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Desi Dawat - Menu Flyer</title><style>body{font:14px Georgia,serif;color:#30150e;background:#fff8ef;margin:0;padding:14mm}header{text-align:center;border-bottom:3px solid #c79b35;padding-bottom:10px}header img{width:80px;height:80px;object-fit:contain}h1,h2{color:#791d2a}.dish{display:flex;gap:12px;align-items:center;border-bottom:1px dotted #c79b35;padding:8px 0}.dish img{width:48px;height:48px;object-fit:cover}.details{flex:1}.description{margin:4px 0;color:#555}/* Daily flyer schedule styling: center the hours card and make the times easy to scan. */.hours-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:16px auto;max-width:620px;text-align:center}.hours{padding:14px;background:#fff0c2;border:2px solid #c79b35;border-radius:8px;color:#791d2a}.hours strong{display:block;font-size:16px;margin-bottom:6px}.hours p{margin:5px 0}.hours-time{display:inline-block;color:#075e36;font-size:18px;font-weight:800;letter-spacing:.3px}.second-page{page-break-before:always;break-before:page}@page{size:A4;margin:12mm}</style></head><body><section><header><img src="/images/LOGO.jpeg" alt=""><h1>Desi Dawat</h1><p>Indian Vegetarian Food / Intialaista kasvisruokaa</p><h2>${title}</h2><!-- Flyer address placement: keep the restaurant address on the first menu page. --><p>📍 Pateniementie 59, 90800 Oulu, Finland</p></header><div class="hours-grid">${hoursMarkup}</div>${menuMarkup}</section>${secondPage}</body></html>`);
    }
    flyerWindow.document.close();
    flyerWindow.focus();
    flyerWindow.print();
    setMessage("Flyer opened in a new window. Choose your print settings there.");
    setGenerating(false);
  }

  return (
    <div className="time-management flyer-management">
      <h2>Flyer Generator / Esitteen luonti</h2>
      <p>Choose a day, select the available menu items, and create a printable flyer or welcome message.</p>
      {loading && <p>Loading menu and opening hours...</p>}
      {error && <p className="form-error">{error}</p>}
      {message && <p className="form-success">{message}</p>}
      {!loading && !error && <>
        <div className="form-grid">
          <label>Select day / Valitse päivä
            <select value={day} onChange={(event) => setDay(event.target.value)}>
              {flyerDays.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label>Flyer format / Esitteen muoto
            <select value={format} onChange={(event) => setFormat(event.target.value)}>
              <option value="one-page">One-page menu / Yhden sivun menu</option>
              <option value="two-page">Two-page flyer / Kahden sivun esite</option>
              <option value="welcome-message">Welcome message / Tervetuloviesti</option>
            </select>
          </label>
        </div>
        {format !== "welcome-message" && <div className="flyer-item-selection">
          <h3>Select dishes / Valitse annokset</h3>
          <p>{availableItems.length} available item(s) selected.</p>
          <div className="flyer-selection-actions">
            <button type="button" onClick={() => setSelectedIds(items.filter((item) => Boolean(Number(item.is_available))).map((item) => String(item.item_id)))}>Select all available</button>
            <button type="button" onClick={() => setSelectedIds([])}>Deselect all</button>
          </div>
          {items.filter((item) => Boolean(Number(item.is_available))).length === 0 && <p>No available menu items were found.</p>}
          {[...new Set(items.filter((item) => Boolean(Number(item.is_available))).map((item) => item.main_category || "Menu"))].map((category) => <div className="flyer-category" key={category}>
            <h4>{category}</h4>
            {items.filter((item) => Boolean(Number(item.is_available)) && (item.main_category || "Menu") === category).map((item) => <label className="check-label" key={item.item_id}>
              <input type="checkbox" checked={selectedIds.includes(String(item.item_id))} onChange={(event) => toggleItem(item.item_id, event.target.checked)} />
              {item.item_name || item.item_name_en} — €{Number(item.price_eur || 0).toFixed(2)}
            </label>)}
          </div>)}
        </div>}
        <div className="form-actions">
          <button type="button" onClick={generateFlyer} disabled={generating}>{generating ? "Preparing..." : "Generate and print flyer"}</button>
        </div>
      </>}
    </div>
  );
}