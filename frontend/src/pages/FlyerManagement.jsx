import React, { useEffect, useMemo, useState } from "react";
import { API_ORIGIN, getAdminMenu, getOpeningHours, resolveImageUrl } from "../api.js";
import { LETTERHEAD, renderLetterheadHtml, letterheadStyles } from "../../../shared/letterhead.js";

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

const getFinnishFirstDayLabel = (day) => {
  const label = flyerDays.find(([key]) => key === day)?.[1];
  if (!label) return "Tänään / Today";
  const [english, finnish] = label.split(" / ");
  return `${finnish} / ${english}`;
};

function printBlankLetterhead() {
  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) return false;
  printWindow.document.write(`<!doctype html><html lang="fi"><head><meta charset="utf-8"><title>Desi Dawat Letterhead</title><style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#fff}body{padding:17mm 18mm;font:12pt Arial,sans-serif}${letterheadStyles()}.desi-letterhead{padding-bottom:12px!important;margin-bottom:0!important}.desi-letterhead img{width:78px!important;height:78px!important}.desi-letterhead h1{font-size:25px!important}.desi-letterhead p{font-size:12px!important}@page{size:A4;margin:0}@media print{body{padding:17mm 18mm}}</style></head><body>${renderLetterheadHtml()}<main aria-label="Blank letterhead"></main></body></html>`);
  printWindow.document.close();
  printWindow.onload = () => { printWindow.focus(); printWindow.print(); };
  return true;
}

const getFlyerPeriod = (entry) => {
  const periods = [];
  if (!entry.morning_closed && entry.morning_open && entry.morning_close) {
    periods.push(`${String(entry.morning_open).slice(0, 5)}–${String(entry.morning_close).slice(0, 5)}`);
  }
  if (!entry.evening_closed && entry.evening_open && entry.evening_close) {
    periods.push(`${String(entry.evening_open).slice(0, 5)}–${String(entry.evening_close).slice(0, 5)}`);
  }
  return periods.length ? periods.join(", ") : "Suljettu / Closed";
};

const getFlyerScheduleLines = (hours) => {
  const entries = Array.isArray(hours) ? hours : [];
  const groups = [
    { keys: ["mon_thu", "fri"], fi: "Maanantai–perjantai", en: "Monday–Friday" },
    { keys: ["sat", "sun"], fi: "Lauantai–sunnuntai", en: "Saturday–Sunday" },
  ];
  const lines = [];

  for (const group of groups) {
    const groupedEntries = group.keys.map((key) => entries.find((entry) => entry.day_key === key)).filter(Boolean);
    if (!groupedEntries.length) continue;
    const periods = groupedEntries.map(getFlyerPeriod);
    const useFirstWeekdaySchedule = group.keys[0] === "mon_thu" && groupedEntries.length === group.keys.length;
    if (useFirstWeekdaySchedule || (groupedEntries.length === group.keys.length && periods.every((period) => period === periods[0]))) {
      lines.push(`${group.fi} / ${group.en}: ${periods[0]}`);
    } else {
      groupedEntries.forEach((entry) => {
        const label = `${entry.day_fi || entry.day_key} / ${entry.day_en || entry.day_key}`;
        lines.push(`${label}: ${getFlyerPeriod(entry)}`);
      });
    }
  }
  return lines.length ? lines : ["Aukioloajat eivät saatavilla / Opening hours unavailable"];
};

const getFlyerScheduleMarkup = (hours, includeSpecialBadge = false) => {
  const lines = getFlyerScheduleLines(hours)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
  const badge = includeSpecialBadge
    ? '<div class="special-badge">✨ PÄIVÄN ERIKOISET / TODAY’S SPECIAL ✨</div>'
    : "";
  return `<div class="hours"><strong>Aukioloajat / Opening hours</strong>${lines}${badge}</div>`;
};

const getSelectedDayScheduleMarkup = (hours, day, includeSpecialBadge = false) => {
  const dayKeys = { mon: ["mon", "mon_thu"], tue: ["tue", "mon_thu"], wed: ["wed", "mon_thu"], thu: ["thu", "mon_thu"], fri: ["fri"], sat: ["sat"], sun: ["sun"] };
  const entry = (dayKeys[day] || [day]).map((key) => hours.find((row) => row.day_key === key)).find(Boolean);
  const label = flyerDays.find(([key]) => key === day)?.[1];
  const dayName = label ? getFinnishFirstDayLabel(day) : "Tänään / Today";
  const period = entry ? getFlyerPeriod(entry) : "Aukioloajat eivät saatavilla / Opening hours unavailable";
  const badge = includeSpecialBadge
    ? '<div class="special-badge">✨ PÄIVÄN ERIKOISET / TODAY’S SPECIAL ✨</div>'
    : "";
  return `<div class="hours"><strong>${escapeHtml(dayName)}</strong><p><span class="hours-label">Aukioloajat / Timings</span><br><span class="day-hours-time">${escapeHtml(period)}</span></p>${badge}</div>`;
};


const flyerFoodImages = {
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

const getFlyerFallbackUrl = (item) => {
  const name = String(item.item_name || item.item_name_en || "").trim().toLowerCase();
  const fallback = flyerFoodImages[name];
  return fallback ? `/images/${encodeURIComponent(fallback)}` : "/images/LOGO.jpeg";
};

const getFlyerImageUrl = (item) => {
  const savedUrl = String(item.image_url || "").trim();
  // Some older menu rows explicitly saved the logo as their image. Prefer the
  // matching food photo for those rows, as the menu page does when no photo exists.
  if (savedUrl && !/LOGO\.jpeg(?:$|[?#])/i.test(savedUrl)) {
    return resolveImageUrl(savedUrl, { driveThumbnailWidth: 360 });
  }
  return getFlyerFallbackUrl(item);
};

const waitForFlyerImages = async (documentRef) => {
  await Promise.all(Array.from(documentRef.images, (image) => new Promise((resolve) => {
    let finished = false;
    let timeout;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve();
    };
    timeout = setTimeout(finish, 8000);
    const retryWithFallback = () => {
      const fallback = image.dataset.fallback;
      if (fallback && image.src !== fallback) {
        image.addEventListener("load", finish, { once: true });
        image.addEventListener("error", finish, { once: true });
        image.src = fallback;
      } else finish();
    };
    if (image.complete) {
      if (image.naturalWidth > 0) finish();
      else retryWithFallback();
      return;
    }
    image.addEventListener("load", finish, { once: true });
    image.addEventListener("error", retryWithFallback, { once: true });
  })));
};

const prepareFlyerForPrint = async (flyerWindow, optimizeMenuImages = false) => {
  const documentRef = flyerWindow.document;
  if (documentRef.readyState !== "complete") {
    await new Promise((resolve) => flyerWindow.addEventListener("load", resolve, { once: true }));
  }
  await waitForFlyerImages(documentRef);
  if (optimizeMenuImages) {
    for (const image of Array.from(documentRef.querySelectorAll(".dish img"))) {
      if (!image.naturalWidth || !image.naturalHeight) continue;
      try {
        // Flyer dish photos render at about 48 CSS pixels; 160px stays crisp in print.
        const maxEdge = 160;
        const ratio = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = documentRef.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) continue;
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        image.src = canvas.toDataURL("image/jpeg", 0.72);
        try {
          await image.decode();
        } catch {
          // Browsers without decode support still print the optimized data URL.
        }
      } catch {
        // Keep the original image if its host prevents canvas conversion.
      }
    }
  }
  if (documentRef.fonts?.ready) {
    await Promise.race([documentRef.fonts.ready, new Promise((resolve) => setTimeout(resolve, 3000))]);
  }
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
};

const openFlyerPrintDialog = async (flyerWindow, optimizeMenuImages = false) => {
  await prepareFlyerForPrint(flyerWindow, optimizeMenuImages);
  flyerWindow.focus();
  // Let the browser activate the new tab/window before opening its print dialog.
  await new Promise((resolve) => setTimeout(resolve, 350));
  flyerWindow.focus();
  flyerWindow.print();
};

const loadFlyerImage = (src) => new Promise((resolve) => {
  if (!src) return resolve(null);
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = src;
});

function drawWrappedText(context, text, x, y, maxWidth, lineHeight) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maxWidth) {
      context.fillText(line, x, y);
      y += lineHeight;
      line = word;
    } else line = next;
  }
  if (line) {
    context.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

export default function FlyerManagement({ token }) {
  const [items, setItems] = useState([]);
  const [openingHours, setOpeningHours] = useState([]);
  const [day, setDay] = useState("sun");
  const [format, setFormat] = useState("one-page");
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [twoPageImageUrls, setTwoPageImageUrls] = useState([]);
  const [clickablePage2Url, setClickablePage2Url] = useState("");

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

  function toggleCategory(category, checked) {
    const categoryIds = items
      .filter((item) => Boolean(Number(item.is_available)) && (item.main_category || "Menu") === category)
      .map((item) => String(item.item_id));
    setSelectedIds((current) => checked
      ? [...new Set([...current, ...categoryIds])]
      : current.filter((id) => !categoryIds.includes(id)));
  }

  function changeFlyerFormat(nextFormat) {
    if (nextFormat === "today-special") {
      // Start with no dishes selected so the administrator deliberately chooses today's specials.
      setSelectedIds([]);
    } else if (format === "today-special") {
      setSelectedIds(items.filter((item) => Boolean(Number(item.is_available))).map((item) => String(item.item_id)));
    }
    setFormat(nextFormat);
  }

  async function downloadTodaySpecialImage() {
    if (format !== "today-special") return;
    setGenerating(true);
    setError("");
    setMessage("");
    try {
      const [menuData, hoursData] = await Promise.all([getAdminMenu(token), getOpeningHours()]);
      const freshMenu = Array.isArray(menuData) ? menuData : menuData?.items || [];
      const selectedItems = freshMenu.filter((item) =>
        Boolean(Number(item.is_available)) && selectedIds.includes(String(item.item_id))
      );
      const latestHours = Array.isArray(hoursData) ? hoursData : hoursData?.hours || [];
      if (!selectedItems.length) throw new Error("Select at least one available dish for Today's Special.");
      setItems(freshMenu);
      setOpeningHours(latestHours);

      const canvas = document.createElement("canvas");
      const scale = 2;
      const width = 1200;
      const pad = 76;
      const rowHeights = selectedItems.map((item) => (item.short_information || "").length > 105 ? 154 : 128);
      const height = 1600 + rowHeights.reduce((sum, value) => sum + value, 0);
      canvas.width = width * scale;
      canvas.height = height * scale;
      const context = canvas.getContext("2d");
      context.scale(scale, scale);
      context.fillStyle = "#fffaf3";
      context.fillRect(0, 0, width, height);
      context.strokeStyle = "#c79b35";
      context.lineWidth = 5;
      context.strokeRect(28, 28, width - 56, height - 56);

      const logo = await loadFlyerImage("/images/LOGO.jpeg");
      if (logo) context.drawImage(logo, (width - 128) / 2, 58, 128, 128);
      context.textAlign = "center";
      context.fillStyle = "#791d2a";
      context.font = "bold 48px Georgia, serif";
      context.fillText(LETTERHEAD.name, width / 2, 224);
      context.fillStyle = "#791d2a";
      context.font = "bold 22px Arial, sans-serif";
      context.fillText(LETTERHEAD.finnish, width / 2, 263);
      context.fillText(LETTERHEAD.english, width / 2, 291);
      context.fillStyle = "#30150e";
      context.font = "20px Arial, sans-serif";
      context.fillText(LETTERHEAD.address, width / 2, 322);
      context.fillText(`Puh. / Tel. ${LETTERHEAD.phone}`, width / 2, 350);
      context.fillText(`Email: ${LETTERHEAD.email}`, width / 2, 378);
      context.strokeStyle = "#c79b35";
      context.lineWidth = 4;
      context.beginPath(); context.moveTo(pad, 414); context.lineTo(width - pad, 414); context.stroke();

      let y = 458;
      context.textAlign = "center";
      context.fillStyle = "#791d2a";
      context.font = "bold 27px Georgia, serif";
      context.fillText(getFinnishFirstDayLabel(day), width / 2, y);
      y += 28;
      context.fillStyle = "#791d2a";
      context.font = "bold 22px Arial, sans-serif";
      context.fillText("Aukioloajat / Timings", width / 2, y + 2);
      const dayKeys = { mon: ["mon", "mon_thu"], tue: ["tue", "mon_thu"], wed: ["wed", "mon_thu"], thu: ["thu", "mon_thu"], fri: ["fri"], sat: ["sat"], sun: ["sun"] };
      const dayEntry = (dayKeys[day] || [day]).map((key) => latestHours.find((entry) => entry.day_key === key)).find(Boolean);
      const dayPeriod = dayEntry ? getFlyerPeriod(dayEntry) : "Aukioloajat eivät saatavilla / Opening hours unavailable";
      context.fillStyle = "#791d2a";
      context.font = "bold 26px Arial, sans-serif";
      context.fillText(dayPeriod, width / 2, y + 38);
      context.fillStyle = "#07515a";
      context.font = "bold 30px Arial, sans-serif";
      context.fillText("✨ PÄIVÄN ERIKOISET / TODAY’S SPECIAL ✨", width / 2, y + 86);
      y += 112;

      const images = await Promise.all(selectedItems.map((item) => loadFlyerImage(getFlyerImageUrl(item))));
      for (let index = 0; index < selectedItems.length; index += 1) {
        const item = selectedItems[index];
        const rowHeight = rowHeights[index];
        context.fillStyle = "#eaf7f6";
        context.fillRect(pad, y, width - pad * 2, rowHeight - 12);
        context.textAlign = "left";
        context.fillStyle = "#087f8c";
        context.font = "bold 28px Arial, sans-serif";
        context.fillText(`${item.item_id}.`, pad + 14, y + 46);
        if (images[index]) context.drawImage(images[index], pad + 70, y + 18, 82, 82);
        context.fillStyle = "#30150e";
        context.font = "bold 25px Georgia, serif";
        context.fillText(item.item_name || item.item_name_en || "Menu item", pad + 174, y + 40, 650);
        context.fillStyle = "#791d2a";
        context.textAlign = "right";
        context.font = "bold 25px Arial, sans-serif";
        context.fillText(`€${Number(item.price_eur || 0).toFixed(2)}`, width - pad - 18, y + 42);
        context.textAlign = "left";
        context.fillStyle = "#555555";
        context.font = "20px Arial, sans-serif";
        drawWrappedText(context, item.short_information || "", pad + 174, y + 72, width - 2 * pad - 210, 27);
        y += rowHeight;
      }

      y += 22;
      const orderBoxHeight = 520;
      context.strokeStyle = "#087f8c";
      context.lineWidth = 3;
      context.strokeRect(pad, y, width - pad * 2, orderBoxHeight);
      context.textAlign = "left";
      context.fillStyle = "#07515a";
      context.font = "bold 27px Georgia, serif";
      context.fillText("ENNAKKOTILAUS / PRE-ORDER", pad + 24, y + 42);
      context.fillStyle = "#30150e";
      context.font = "18px Arial, sans-serif";
      drawWrappedText(context, "Tee ennakkotilaus nyt. Tilaukset valmistetaan noutoa tai toimitusta varten klo 16–21.", pad + 24, y + 78, width - 2 * pad - 48, 22);
      drawWrappedText(context, "Place your pre-order now via WhatsApp. Orders will be prepared for pickup or delivery between 4:00 PM and 9:00 PM.", pad + 24, y + 112, width - 2 * pad - 48, 22);
      context.fillStyle = "#128c4a";
      context.font = "bold 22px Arial, sans-serif";
      context.fillText("WhatsApp: +358 44 980 3211", pad + 24, y + 158);
      context.fillStyle = "#07515a";
      context.font = "bold 18px Arial, sans-serif";
      context.fillText("Ilmoita viestissäsi:", pad + 24, y + 202);
      context.fillStyle = "#30150e";
      context.font = "bold 17px Arial, sans-serif";
      const leftColumn = pad + 32;
      const rightColumn = width / 2 + 10;
      ["Annoksen numero", "Toivottu nouto- tai toimitusaika"].forEach((text, index) => {
        context.fillText(`• ${text}`, leftColumn, y + 234 + index * 34);
      });
      ["Määrä", "Toimitusosoite kotiinkuljetuksessa"].forEach((text, index) => {
        context.fillText(`• ${text}`, rightColumn, y + 234 + index * 34);
      });
      context.fillStyle = "#07515a";
      context.font = "bold 18px Arial, sans-serif";
      context.fillText("Please include these details:", pad + 24, y + 326);
      context.fillStyle = "#30150e";
      context.font = "bold 17px Arial, sans-serif";
      ["Item number", "Preferred pickup or delivery time"].forEach((text, index) => {
        context.fillText(`• ${text}`, leftColumn, y + 358 + index * 34);
      });
      ["Quantity", "Delivery address (for home delivery)"].forEach((text, index) => {
        context.fillText(`• ${text}`, rightColumn, y + 358 + index * 34);
      });

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("The flyer image could not be created. Please try again.");
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      const nextUrl = URL.createObjectURL(blob);
      setImageUrl(nextUrl);
      const link = document.createElement("a");
      link.href = nextUrl;
      link.download = `desi-dawat-todays-special-${day}.png`;
      link.click();
      setMessage("Today's Special image is ready. Use the download link below to save it again.");
    } catch (downloadError) {
      setError(downloadError.message || "Could not create the flyer image.");
    } finally {
      setGenerating(false);
    }
  }

  async function downloadTwoPageImages() {
    if (format !== "two-page") return;
    const isTodaySpecial = false;
    setGenerating(true);
    setError("");
    setMessage("");
    twoPageImageUrls.forEach(({ url }) => URL.revokeObjectURL(url));
    setTwoPageImageUrls([]);
    if (clickablePage2Url) URL.revokeObjectURL(clickablePage2Url);
    setClickablePage2Url("");
    try {
      const [menuData, hoursData] = await Promise.all([getAdminMenu(token), getOpeningHours()]);
      const freshMenu = Array.isArray(menuData) ? menuData : menuData?.items || [];
      const flyerItems = freshMenu.filter((item) =>
        Boolean(Number(item.is_available)) && selectedIds.includes(String(item.item_id))
      );
      const latestHours = Array.isArray(hoursData) ? hoursData : hoursData?.hours || [];
      if (!flyerItems.length) throw new Error("Select at least one available menu item before generating the flyer.");
      setItems(freshMenu);
      setOpeningHours(latestHours);

      const width = 1200;
      const height = 1697;
      const pad = 76;
      const scale = 2;
      const pageCanvas = async () => {
        const canvas = document.createElement("canvas");
        canvas.width = width * scale;
        canvas.height = height * scale;
        const context = canvas.getContext("2d");
        context.scale(scale, scale);
        context.fillStyle = "#fffaf3";
        context.fillRect(0, 0, width, height);
        context.strokeStyle = "#c79b35";
        context.lineWidth = 5;
        context.strokeRect(28, 28, width - 56, height - 56);
        const logo = await loadFlyerImage("/images/LOGO.jpeg");
        if (logo) context.drawImage(logo, (width - 116) / 2, 56, 116, 116);
        context.textAlign = "center";
        context.fillStyle = "#791d2a";
        context.font = "bold 45px Georgia, serif";
        context.fillText(LETTERHEAD.name, width / 2, 208);
        context.fillStyle = "#791d2a";
        context.font = "bold 20px Arial, sans-serif";
        context.fillText(LETTERHEAD.finnish, width / 2, 242);
        context.fillText(LETTERHEAD.english, width / 2, 268);
        context.fillStyle = "#30150e";
        context.font = "19px Arial, sans-serif";
        context.fillText(LETTERHEAD.address, width / 2, 294);
        context.fillText(`Puh. / Tel. ${LETTERHEAD.phone}`, width / 2, 320);
        context.fillText(`Email: ${LETTERHEAD.email}`, width / 2, 346);
        context.strokeStyle = "#c79b35";
        context.lineWidth = 4;
        context.beginPath(); context.moveTo(pad, 352); context.lineTo(width - pad, 352); context.stroke();
        return { canvas, context };
      };
      const scheduleLines = getFlyerScheduleLines(latestHours);
      const eveningText = scheduleLines.join(" • ");

      const first = await pageCanvas();
      const ctx = first.context;
      const flyerTitle = day === "all-menu" ? "MENU CARD / RUOKALISTA" : `${(flyerDays.find(([key]) => key === day)?.[1] || "Daily").toUpperCase()} MENU / PÄIVÄN RUOKALISTA`;
      ctx.fillStyle = "#791d2a";
      ctx.font = "bold 30px Georgia, serif";
      ctx.fillText(isTodaySpecial ? "PÄIVÄN ERIKOISET / TODAY’S SPECIAL" : flyerTitle, width / 2, 390);
      let y = 430;
      if (isTodaySpecial) {
        const selectedDay = flyerDays.find(([key]) => key === day)?.[1] || "Today";
        ctx.fillStyle = "#791d2a";
        ctx.font = "bold 24px Georgia, serif";
        ctx.fillText(selectedDay, width / 2, y);
        y += 20;
        ctx.fillStyle = "#d7f7f5";
        ctx.strokeStyle = "#087f8c";
        ctx.lineWidth = 3;
        ctx.fillRect(width / 2 - 225, y, 450, 66);
        ctx.strokeRect(width / 2 - 225, y, 450, 66);
        ctx.fillStyle = "#07515a";
        ctx.font = "bold 28px Arial, sans-serif";
        ctx.fillText("✨ TODAY’S SPECIAL ✨", width / 2, y + 43);
        y += 94;
      }
      ctx.fillStyle = "#07515a";
      ctx.font = "bold 19px Arial, sans-serif";
      ctx.fillText(`Aukioloajat / Opening hours: ${eveningText}`, width / 2, y, width - 2 * pad);
      ctx.textAlign = "left";
      y += 54;
      const categories = [...new Set(flyerItems.map((item) => item.main_category || "Menu"))];
      const itemImageEntries = await Promise.all(flyerItems.map(async (item) => [String(item.item_id), await loadFlyerImage(getFlyerImageUrl(item))]));
      const itemImages = new Map(itemImageEntries);
      const rowHeight = Math.min(150, Math.max(68, 1030 / flyerItems.length));
      let number = 0;
      for (const category of categories) {
        ctx.fillStyle = "#791d2a";
        ctx.font = "bold 26px Georgia, serif";
        ctx.fillText(category, pad, y);
        y += 38;
        for (const item of flyerItems.filter((entry) => (entry.main_category || "Menu") === category)) {
          number += 1;
          ctx.fillStyle = number % 2 ? "#eef8f7" : "#fff2db";
          ctx.fillRect(pad, y, width - 2 * pad, rowHeight - 8);
          const itemImage = itemImages.get(String(item.item_id));
          if (itemImage) ctx.drawImage(itemImage, pad + 10, y + 9, 60, 60);
          ctx.textAlign = "left";
          ctx.fillStyle = "#30150e";
          const compact = rowHeight < 95;
          ctx.font = `${compact ? "bold 17px" : "bold 22px"} Georgia, serif`;
          const itemLabel = `${isTodaySpecial ? `${number}. ` : ""}${item.item_name || item.item_name_en || "Menu item"}`;
          ctx.fillText(itemLabel, pad + 84, y + (compact ? 27 : 30), 700);
          ctx.textAlign = "right";
          ctx.fillStyle = "#791d2a";
          ctx.font = `bold ${compact ? 18 : 22}px Arial, sans-serif`;
          ctx.fillText(`€${Number(item.price_eur || 0).toFixed(2)}`, width - pad - 12, y + (compact ? 27 : 30));
          ctx.textAlign = "left";
          ctx.fillStyle = "#555";
          ctx.font = `${compact ? 14 : 17}px Arial, sans-serif`;
          drawWrappedText(ctx, item.short_information || "", pad + 84, y + (compact ? 50 : 60), width - 2 * pad - 110, compact ? 17 : 22);
          y += rowHeight;
        }
        y += 10;
      }

      const second = await pageCanvas();
      const c2 = second.context;
      if (isTodaySpecial) {
        // Recreate the PDF's second-page pre-order card. The matching SVG below
        // adds a real WhatsApp link while keeping the visible artwork unchanged.
        c2.fillStyle = "#ffffff";
        c2.fillRect(0, 0, width, height);
        const cardX = 150;
        const cardY = 430;
        const cardW = 900;
        const cardH = 800;
        c2.strokeStyle = "#008c99";
        c2.lineWidth = 3;
        c2.beginPath();
        c2.roundRect(cardX, cardY, cardW, cardH, 20);
        c2.stroke();
        c2.textAlign = "left";
        c2.fillStyle = "#07515a";
        c2.font = "bold 32px Georgia, serif";
        c2.fillText("ENNAKKOTILAUS / PRE-ORDER", cardX + 32, cardY + 58);
        c2.fillStyle = "#30150e";
        c2.font = "21px Georgia, serif";
        c2.fillText("Tee ennakkotilaus WhatsAppilla:", cardX + 32, cardY + 106);
        c2.fillText("Place your pre-order via WhatsApp:", cardX + 32, cardY + 144);
        c2.fillStyle = "#e8f5ec";
        c2.strokeStyle = "#128c4a";
        c2.lineWidth = 3;
        c2.beginPath();
        c2.roundRect(cardX + 32, cardY + 164, 420, 62, 12);
        c2.fill();
        c2.stroke();
        c2.fillStyle = "#075e36";
        c2.font = "bold 24px Arial, sans-serif";
        c2.fillText("WhatsApp: +358 44 980 3211", cardX + 52, cardY + 204);
        c2.fillStyle = "#07515a";
        c2.font = "bold 22px Georgia, serif";
        c2.fillText("Ilmoita viestissäsi:", cardX + 32, cardY + 274);
        c2.fillStyle = "#30150e";
        c2.font = "bold 21px Georgia, serif";
        const fiY = [cardY + 316, cardY + 354];
        ["•  Annoksen numero", "•  Toivottu nouto- tai toimitusaika"].forEach((text, index) => c2.fillText(text, cardX + 42, fiY[index]));
        ["•  Määrä", "•  Toimitusosoite kotiinkuljetuksessa"].forEach((text, index) => c2.fillText(text, cardX + 500, fiY[index]));
        c2.fillStyle = "#07515a";
        c2.font = "bold 22px Georgia, serif";
        c2.fillText("Please include these details:", cardX + 32, cardY + 432);
        c2.fillStyle = "#30150e";
        c2.font = "bold 21px Georgia, serif";
        ["•  Item number", "•  Preferred pickup or delivery time"].forEach((text, index) => c2.fillText(text, cardX + 42, cardY + 474 + index * 38));
        ["•  Quantity", "•  Delivery address (for home delivery)"].forEach((text, index) => c2.fillText(text, cardX + 500, cardY + 474 + index * 38));
        c2.textAlign = "center";
        c2.fillStyle = "#791d2a";
        c2.font = "bold 22px Georgia, serif";
        c2.fillText("🙏 Kiitos, että valitset Desi Dawatin! ❤️", width / 2, cardY + 690);
        c2.fillText("🙏 Thank you for choosing Desi Dawat! ❤️", width / 2, cardY + 730);
      } else {
        c2.textAlign = "center";
        c2.fillStyle = "#791d2a";
        c2.font = "bold 38px Georgia, serif";
        c2.fillText("NÄIN TILAAT / HOW TO ORDER", width / 2, 386);
        c2.fillStyle = "#07515a";
        c2.font = "bold 28px Arial, sans-serif";
        c2.fillText("WhatsApp: +358 44 980 3211", width / 2, 456);
        c2.fillStyle = "#30150e";
        c2.font = "24px Arial, sans-serif";
        c2.fillText("Lähetä tuotenumero, määrä ja toivottu nouto- tai toimitusaika.", width / 2, 510, width - 2 * pad);
        c2.fillText("Send the item number, quantity and preferred pickup or delivery time.", width / 2, 550, width - 2 * pad);

        let boxY = 620;
        const orderCards = [
          ["1. Valitse annokset / Choose your items", "Ilmoita ruokalistan tuotenumero ja määrä. / Include each menu item number and quantity."],
          ["2. Nouto tai kotiinkuljetus / Pickup or delivery", "Kerro toivottu aika ja toimitusosoite kotiinkuljetuksessa. / State your preferred time and delivery address for home delivery."],
          ["3. Aukioloajat / Opening hours", eveningText || "Tarkista ajantasaiset aukioloajat / Check current opening hours."],
        ];
        for (const [heading, detail] of orderCards) {
          c2.fillStyle = "#eef8f7";
          c2.strokeStyle = "#087f8c";
          c2.lineWidth = 2;
          c2.fillRect(pad, boxY, width - 2 * pad, 176);
          c2.strokeRect(pad, boxY, width - 2 * pad, 176);
          c2.textAlign = "left";
          c2.fillStyle = "#07515a";
          c2.font = "bold 25px Georgia, serif";
          c2.fillText(heading, pad + 24, boxY + 48);
          c2.fillStyle = "#30150e";
          c2.font = "21px Arial, sans-serif";
          drawWrappedText(c2, detail, pad + 24, boxY + 90, width - 2 * pad - 48, 30);
          boxY += 202;
        }
        c2.textAlign = "center";
        c2.fillStyle = "#791d2a";
        c2.font = "bold 25px Georgia, serif";
        c2.fillText("Kiitos, että valitset Desi Dawatin!", width / 2, boxY + 35);
        c2.fillText("Thank you for choosing Desi Dawat!", width / 2, boxY + 75);
      }

      const makeUrl = (canvas) => new Promise((resolve, reject) => canvas.toBlob((blob) => {
        if (blob) resolve(URL.createObjectURL(blob));
        else reject(new Error("Could not create the flyer images."));
      }, "image/png"));
      const nextUrls = await Promise.all([makeUrl(first.canvas), makeUrl(second.canvas)]);
      twoPageImageUrls.forEach(({ url }) => URL.revokeObjectURL(url));
      setTwoPageImageUrls(nextUrls.map((url, index) => ({ url, page: index + 1 })));
      if (clickablePage2Url) URL.revokeObjectURL(clickablePage2Url);
      if (isTodaySpecial) {
        const svgPage = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="1697" viewBox="0 0 1200 1697" role="img" aria-label="Desi Dawat pre-order page">
  <rect width="1200" height="1697" fill="#fff"/>
  <rect x="150" y="430" width="900" height="800" rx="20" fill="#fff" stroke="#008c99" stroke-width="3"/>
  <g font-family="Georgia,serif" fill="#30150e">
    <text x="182" y="488" font-size="32" font-weight="bold" fill="#07515a">ENNAKKOTILAUS / PRE-ORDER</text>
    <text x="182" y="536" font-size="21">Tee ennakkotilaus WhatsAppilla:</text>
    <text x="182" y="574" font-size="21">Place your pre-order via WhatsApp:</text>
  </g>
  <a xlink:href="https://wa.me/358449803211" href="https://wa.me/358449803211" target="_blank" rel="noopener noreferrer" aria-label="Message Desi Dawat on WhatsApp">
    <rect x="182" y="594" width="420" height="62" rx="12" fill="#e8f5ec" stroke="#128c4a" stroke-width="3"/>
    <text x="202" y="634" font-family="Arial,sans-serif" font-size="24" font-weight="bold" fill="#075e36" text-decoration="underline">WhatsApp: +358 44 980 3211</text>
  </a>
  <g font-family="Georgia,serif" fill="#30150e" font-size="21" font-weight="bold">
    <text x="182" y="704" fill="#07515a" font-size="22">Ilmoita viestissäsi:</text>
    <text x="192" y="746">• Annoksen numero</text><text x="192" y="784">• Toivottu nouto- tai toimitusaika</text>
    <text x="650" y="746">• Määrä</text><text x="650" y="784">• Toimitusosoite kotiinkuljetuksessa</text>
    <text x="182" y="862" fill="#07515a" font-size="22">Please include these details:</text>
    <text x="192" y="904">• Item number</text><text x="192" y="942">• Preferred pickup or delivery time</text>
    <text x="650" y="904">• Quantity</text><text x="650" y="942">• Delivery address (for home delivery)</text>
  </g>
  <g text-anchor="middle" font-family="Georgia,serif" font-size="22" font-weight="bold" fill="#791d2a">
    <text x="600" y="1120">🙏 Kiitos, että valitset Desi Dawatin! ❤️</text>
    <text x="600" y="1160">🙏 Thank you for choosing Desi Dawat! ❤️</text>
  </g>
</svg>`;
        const svgUrl = URL.createObjectURL(new Blob([svgPage], { type: "image/svg+xml;charset=utf-8" }));
        setClickablePage2Url(svgUrl);
      } else {
        setClickablePage2Url("");
      }
      setMessage(isTodaySpecial
        ? "Both Today's Special page images are ready. Download each page using its link below."
        : "Both flyer page images are ready. Download each page using its link below.");
    } catch (downloadError) {
      setError(downloadError.message || "Could not create the two flyer page images.");
    } finally {
      setGenerating(false);
    }
  }

  async function generateFlyer() {
    if (format !== "welcome-message" && availableItems.length === 0) {
      setError(format === "today-special"
        ? "Select at least one available dish for Today's Special."
        : "Select at least one available menu item before generating the flyer.");
      return;
    }
    const flyerWindow = window.open("", "_blank", "width=1100,height=900");
    if (!flyerWindow) {
      setError("Please allow pop-ups to open and print the flyer.");
      return;
    }
    flyerWindow.focus();
    setGenerating(true);
    setError("");
    setMessage("");

    // Refresh immediately before rendering so an open manager cannot print stale menu text.
    let flyerItems = availableItems;
    let flyerOpeningHours = openingHours;
    try {
      const [menuData, hoursData] = await Promise.all([
        getAdminMenu(token),
        getOpeningHours(),
      ]);
      const freshMenu = Array.isArray(menuData) ? menuData : menuData?.items || [];
      flyerItems = freshMenu.filter((item) =>
        Boolean(Number(item.is_available)) && selectedIds.includes(String(item.item_id))
      );
      flyerOpeningHours = Array.isArray(hoursData) ? hoursData : hoursData?.hours || [];
      setItems(freshMenu);
      setOpeningHours(flyerOpeningHours);
    } catch (refreshError) {
      flyerWindow.close();
      setError(refreshError.message || "Could not refresh menu data. Please try again.");
      setGenerating(false);
      return;
    }
    if (format !== "welcome-message" && flyerItems.length === 0) {
      flyerWindow.close();
      setError(format === "today-special"
        ? "Select at least one available dish for Today's Special."
        : "Select at least one available menu item before generating the flyer.");
      setGenerating(false);
      return;
    }

    const hoursMarkup = format === "today-special"
      ? getSelectedDayScheduleMarkup(flyerOpeningHours, day, true)
      : day !== "all-menu" && format !== "welcome-message"
        ? getSelectedDayScheduleMarkup(flyerOpeningHours, day, false)
        : getFlyerScheduleMarkup(flyerOpeningHours, false);
    const welcomeHoursMarkup = getFlyerScheduleLines(flyerOpeningHours)
      .map((line) => `<strong>${escapeHtml(line)}</strong><br />`)
      .join("");

    let deliveryChargesPage = "";
    // Welcome flyer: keep this content and print layout aligned with the full admin console version.
    if (format === "welcome-message") {
      flyerWindow.document.write(`
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <base href="${escapeHtml(window.location.origin)}/" />
            <title>Desi Dawat - Welcome_message</title>
            <style>
              body {
                font-family: Georgia, serif;
                color: #30150e;
                background: #fff8ef;
                margin: 0;
                padding: 18mm;
                font-size: 15pt;
                line-height: 1.5;
              }
              h1, h2, h3 { color: #791d2a; }
              h1 { margin: 5px 0; }
              h2 { font-size: 20pt; line-height: 1.2; margin: 14px 0 8px; }
              p { margin: 8px 0; }
              hr { border: 0; border-top: 1px solid #c79b35; margin: 12px 0; }
              a { color: #791d2a; overflow-wrap: anywhere; }
              .welcome-link {
                display: inline-block;
                padding: 7px 12px;
                border: 2px solid #c79b35;
                border-radius: 8px;
                background: #fff0c2;
                color: #651923;
                font: bold 16pt/1.25 Arial, sans-serif;
                text-decoration: underline;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .welcome-whatsapp {
                border-color: #128c4a;
                background: #e8f5ec;
                color: #075e36;
                font-size: 19pt;
              }
              .welcome-opening-hours { font-size: 15pt; }
              @page { size: A4; margin: 12mm; }
              ${letterheadStyles()}
              @media print {
                body { padding: 0; font-size: 14pt; line-height: 1.42; }
                h2 { font-size: 18pt; }
              }
            </style>
          </head>
          <body>
            ${renderLetterheadHtml()}
            <p class="welcome-opening-hours">
              🕒 <strong>AU KIOLOAJAT / OPENING HOURS</strong>
            </p>
            <p class="welcome-opening-hours">${welcomeHoursMarkup}</p>
            <p>Tarjoamme tuoretta ja aitoa intialaista kasvisruokaa: herkullisia aterioita, leipiä, riisiä ja välipaloja.</p>
            <p>We offer fresh, authentic Indian vegetarian food, including delicious meals, breads, rice and snacks.</p>
            <p>🚗 Kotiinkuljetus ja nouto saatavilla!</p>
            <p>🚗 Home delivery and pickup available!</p>
            <hr />
            <h2>📋 RUOKALISTAN ENNAKKOTILAUKSET / MENU PRE-ORDERS</h2>
            <p>
              <a class="welcome-link" href="https://drive.google.com/file/d/148Jb31MPW50SbUWmTFwsH1td9DkigM6V/view?usp=sharing" target="_blank" rel="noopener noreferrer">
                Avaa ruokalista/View Menu
              </a>
            </p>
            <h2>📲 NÄIN TEET ENNAKKOTILAUKSEN / HOW TO PRE-ORDER</h2>
            <p>🇫🇮 Tee ennakkotilaus WhatsAppilla ja ilmoita tuotenumero, määrä sekä toivottu nouto- tai toimitusaika.</p>
            <p>🇬🇧 Place your pre-order via WhatsApp and include the item number, quantity, and preferred pickup or delivery time.</p>
            <p><a class="welcome-link welcome-whatsapp" href="https://wa.me/358449803211">WhatsApp: +358 44 980 3211</a></p>
            <hr />
            <hr />
            <h2>📞KYSYMYKSET JA APU/QUERIES &amp; ASSISTANCE</h2>
            <p><a class="welcome-link" href="tel:+358413279444">+358 41 327 9444</a></p>
            <p>🙏 Kiitos, että valitset Desi Dawatin! ❤️</p>
            <p>🙏 Thank you for choosing Desi Dawat! ❤️</p>
          </body>
        </html>
      `);
      flyerWindow.document.close();
      await openFlyerPrintDialog(flyerWindow);
      setMessage("Flyer opened in a new window. Choose your print settings there.");
      setGenerating(false);
      return;
    } else {
      let itemNumber = 0;
      const flyerCategories = [...new Set(flyerItems.map((item) => item.main_category || "Menu"))];
      const menuMarkup = flyerCategories.map((category) => {
        const rows = flyerItems.filter((item) => (item.main_category || "Menu") === category).map((item) => {
          itemNumber += 1;
          const displayNumber = format === "today-special" ? item.item_id : itemNumber;
          const number = `<b class="dish-number">${displayNumber}.</b>`;
          const name = escapeHtml(item.item_name || item.item_name_en || "Menu item");
          const desc = item.short_information ? `<p class="description">${escapeHtml(item.short_information)}</p>` : "";
          const rawImageUrl = getFlyerImageUrl(item);
          const imageUrl = escapeHtml(rawImageUrl);
          let imageOrigin = "";
          try { imageOrigin = new URL(rawImageUrl, window.location.origin).origin; } catch { /* fallback below */ }
          const canCanvasOptimize = imageOrigin === window.location.origin || imageOrigin === API_ORIGIN;
          const crossOrigin = canCanvasOptimize ? 'crossorigin="anonymous"' : "";
          return `<article class="dish">${number}<img ${crossOrigin} src="${imageUrl}" alt="${name}" data-fallback="${escapeHtml(new URL(getFlyerFallbackUrl(item), window.location.origin).href)}"><div class="details"><strong>${name}</strong>${desc}</div><b class="dish-price">€${Number(item.price_eur || 0).toFixed(2)}</b></article>`;
        }).join("");
        return `<h2>${escapeHtml(category)}</h2>${rows}`;
      }).join("");
      const title = format === "today-special"
        ? "PÄIVÄN ERIKOISET / TODAY’S SPECIAL"
        : day === "all-menu" ? "MENU CARD / RUOKALISTA" : `${escapeHtml((flyerDays.find(([key]) => key === day)?.[1] || "Daily").split(" /")[0].toUpperCase())} MENU / PÄIVÄN RUOKALISTA`;
      const specialIntro = `<div class="hours-grid">${hoursMarkup}</div>`;
      const preOrderMarkup = format === "today-special"
        ? `<section class="preorder"><h2>ENNAKKOTILAUS / PRE-ORDER</h2><p><strong>Tee ennakkotilaus nyt.</strong> Tilaukset valmistetaan noutoa tai toimitusta varten klo 16–21.</p><p><strong>Place your pre-order now via WhatsApp.</strong> Orders will be prepared for pickup or delivery between 4:00 PM and 9:00 PM.</p><p><a class="whatsapp-link" href="https://wa.me/358449803211" target="_blank" rel="noopener noreferrer">WhatsApp: +358 44 980 3211</a></p><p class="order-prompt"><strong>Ilmoita viestissäsi:</strong></p><ul class="order-fields"><li>Annoksen numero</li><li>Määrä</li><li>Toivottu nouto- tai toimitusaika</li><li>Toimitusosoite kotiinkuljetuksessa</li></ul><p class="order-prompt"><strong>Please include these details:</strong></p><ul class="order-fields"><li>Item number</li><li>Quantity</li><li>Preferred pickup or delivery time</li><li>Delivery address (for home delivery)</li></ul></section>`
        : `<section class="preorder"><h2>TILAUS / ORDER</h2><p>Tee tilaus WhatsAppilla:</p><p>Place your order via WhatsApp:</p><p>Koska kaikki annokset valmistetaan tuoreina, tee tilauksesi vähintään tuntia ennen toivomaasi nouto- tai toimitusaikaa.</p><p>As all orders are prepared fresh, please place your order via WhatsApp at least one hour before your preferred pickup or delivery time.</p><p><a class="whatsapp-link" href="https://wa.me/358449803211" target="_blank" rel="noopener noreferrer">WhatsApp: +358 44 980 3211</a></p><p class="order-prompt"><strong>Ilmoita viestissäsi:</strong></p><ul class="order-fields"><li>Annoksen numero</li><li>Määrä</li><li>Toivottu nouto- tai toimitusaika</li><li>Toimitusosoite kotiinkuljetuksessa</li></ul><p class="order-prompt"><strong>Please include these details:</strong></p><ul class="order-fields"><li>Item number</li><li>Quantity</li><li>Preferred pickup or delivery time</li><li>Delivery address (for home delivery)</li></ul></section>`;
      const orderPage = preOrderMarkup ? `<section class="order-page">${preOrderMarkup}</section>` : "";
      deliveryChargesPage = day === "all-menu" && format === "one-page" ? `
        <section class="delivery-charges-page">
          <h1>TOIMITUSMAKSUT</h1>
          <p class="delivery-source">Laskettu Lidl Pateniemen myymälästä</p>
          <div class="delivery-charge-row"><h2>Enintään 3 km</h2><p>Alle 15 €: 2 € toimitusmaksu</p><p>Vähintään 15 €: ilmainen toimitus</p></div>
          <div class="delivery-charge-row"><h2>Yli 3 km – enintään 7 km</h2><p>3,50 € toimitusmaksu</p></div>
          <div class="delivery-charge-row"><h2>Yli 7 km – enintään 15 km</h2><p>6 € toimitusmaksu</p></div>
          <div class="delivery-charge-row delivery-free"><h2>Yli 75 € tilaukset</h2><p>Ilmainen toimitus</p></div>
          <hr />
          <h1>DELIVERY CHARGES</h1>
          <p class="delivery-source">From Lidl Store, Pateniemi</p>
          <div class="delivery-charge-row"><h2>Within 3 km</h2><p>Orders below €15: €2 delivery fee</p><p>Orders of €15 and above: free delivery</p></div>
          <div class="delivery-charge-row"><h2>More than 3 km – up to 7 km</h2><p>€3.50 delivery fee</p></div>
          <div class="delivery-charge-row"><h2>More than 7 km – up to 15 km</h2><p>€6 delivery fee</p></div>
          <div class="delivery-charge-row delivery-free"><h2>Orders above €75</h2><p>Free delivery</p></div>
        </section>` : "";
      flyerWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${escapeHtml(window.location.origin)}/"><title>Desi Dawat - ${format === "today-special" ? "Today's Special" : "Menu Flyer"}</title><style>body{font:14px Georgia,serif;color:#30150e;background:#fff8ef;margin:0;padding:14mm}.flyer-heading{text-align:center;border-bottom:3px solid #c79b35;padding-bottom:10px}.flyer-heading .desi-letterhead{border:0;margin:0;padding:0}.flyer-heading .desi-letterhead img{width:88px;height:88px}.flyer-heading .desi-letterhead h1{margin:5px 0}.flyer-heading .desi-letterhead p{margin:2px 0;font-size:14.3px;line-height:1.35}.flyer-heading .desi-letterhead h1{font-size:28.6px;line-height:1.2}.flyer-heading>.flyer-title{margin:0}h1,h2{color:#791d2a}.dish{display:flex;gap:12px;align-items:center;border-bottom:1px dotted #c79b35;padding:8px 0}.dish img{width:48px;height:48px;object-fit:cover}.details{flex:1}.details>strong{font-size:18px;line-height:1.25}.dish-price{font-size:17px;white-space:nowrap}.description{margin:5px 0 2px;color:#49413b;font:15px/1.35 Arial,sans-serif}.dish-number{min-width:24px;color:#087f8c;font:700 16px Arial,sans-serif}.hours-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:16px auto;max-width:620px;text-align:center}.hours{padding:13px 16px;background:#fff0c2;border:2px solid #c79b35;border-radius:8px;color:#791d2a}.hours strong{display:block;font-size:19px;margin-bottom:5px}.hours p{margin:4px 0;font-size:19px;line-height:1.35}.hours-label{font-size:18px;font-weight:700}.day-hours-time{display:inline-block;margin-top:3px;font-size:24px;font-weight:800;letter-spacing:.2px}.hours-time{display:inline-block;color:#075e36;font-size:22px;font-weight:800;letter-spacing:.3px}.special-badge{display:block;width:max-content;max-width:100%;box-sizing:border-box;margin:8px auto;padding:12px 22px;border:3px solid #087f8c;border-radius:12px;background:#d7f7f5;color:#07515a;font-family:Arial,sans-serif;font-size:21px;font-weight:900;letter-spacing:1.2px;text-align:center;box-shadow:0 3px 0 #087f8c,0 6px 16px rgba(8,127,140,.22);animation:special-pulse 1.4s ease-in-out infinite alternate}@keyframes special-pulse{from{filter:brightness(.94);transform:scale(.99)}to{filter:brightness(1.06);transform:scale(1.03)}}.order-page{page-break-before:always;break-before:page;min-height:240mm;display:flex;align-items:flex-start;justify-content:center;padding-top:12mm}.preorder{width:100%;margin:0 auto;min-height:220mm;box-sizing:border-box;page-break-before:auto;break-before:auto;padding:36px 40px;border:3px solid #087f8c;border-radius:16px;background:#eefafa;page-break-inside:avoid;break-inside:avoid;font:22px/1.5 Arial,sans-serif}.preorder h2{margin-top:0;color:#07515a;font-size:32px;line-height:1.2}.preorder p{margin:16px 0;font-size:22px;line-height:1.5}.whatsapp-link{display:inline-block;padding:16px 24px;border:3px solid #128c4a;border-radius:10px;background:#e8f5ec;color:#075e36!important;font:bold 28px Arial,sans-serif;text-decoration:underline;-webkit-print-color-adjust:exact;print-color-adjust:exact}.order-prompt{margin-top:24px!important;color:#07515a;font-size:22px}.order-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px 22px;margin:7px 0;padding-left:22px;font-weight:bold}.thanks{margin-top:28px!important;text-align:center;font-weight:bold;color:#791d2a;font-size:22px}.second-page{page-break-before:always;break-before:page}@media print{.order-page{page-break-before:always;break-before:page}}@page{size:A4;margin:12mm}@media print{.special-badge{animation:none;filter:none;opacity:1;transform:none}}${letterheadStyles()}</style></head><body><section><div class="flyer-heading">${renderLetterheadHtml()}${format === "today-special" ? "" : `<h2 class="flyer-title">${title}</h2>`}</div>${specialIntro}${menuMarkup}</section>${orderPage}</body></html>`);
    }
    if (deliveryChargesPage) {
      const deliveryStyle = flyerWindow.document.createElement("style");
      deliveryStyle.textContent = `.delivery-charges-page{page-break-before:always;break-before:page;box-sizing:border-box;min-height:245mm;padding:12mm 14mm;border:2px solid #e5d3ad;background:#fffdf7;color:#3c2c22;font:16px/1.35 Arial,sans-serif}.delivery-charges-page h1{text-align:center;margin:0;color:#791d2a;font:700 27px Georgia,serif}.delivery-charges-page .delivery-source{text-align:center;margin:4px 0 12px;font-weight:700;color:#51443c}.delivery-charge-row{padding:8px 12px;border-bottom:1px solid #d8b66a;break-inside:avoid}.delivery-charge-row h2{margin:0 0 3px;color:#791d2a;font:700 19px Georgia,serif}.delivery-charge-row p{margin:2px 0}.delivery-charge-row.delivery-free{margin-top:8px;padding:10px 12px;background:#fff6df;border:0}.delivery-charge-row.delivery-free p{font-weight:700;color:#6e1d2b}.delivery-charges-page hr{margin:12px 0;border:0;border-top:2px solid #c79b35}@media print{.delivery-charges-page{page-break-before:always;break-before:page;min-height:245mm}}`;
      flyerWindow.document.head.appendChild(deliveryStyle);
      flyerWindow.document.body.insertAdjacentHTML("beforeend", deliveryChargesPage);
    }
    flyerWindow.document.close();
    await openFlyerPrintDialog(flyerWindow, format === "one-page");
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
            <select value={format} onChange={(event) => changeFlyerFormat(event.target.value)}>
              <option value="one-page">One-page menu / Yhden sivun menu</option>
              <option value="welcome-message">Welcome message / Tervetuloviesti</option>
              <option value="today-special">Today's Special / Päivän erikoiset</option>
            </select>
          </label>
        </div>
        {format !== "welcome-message" && <div className="flyer-item-selection">
          <h3>{format === "today-special" ? "Select Today's Special dishes / Valitse päivän erikoisannokset" : "Select dishes / Valitse annokset"}</h3>
          <p>{availableItems.length} available item(s) selected.</p>
          <div className="flyer-selection-actions">
            <button type="button" onClick={() => setSelectedIds(items.filter((item) => Boolean(Number(item.is_available))).map((item) => String(item.item_id)))}>Select all available</button>
            <button type="button" onClick={() => setSelectedIds([])}>Deselect all</button>
          </div>
          {items.filter((item) => Boolean(Number(item.is_available))).length === 0 && <p>No available menu items were found.</p>}
          <div className="flyer-category-grid">{[...new Set(items.filter((item) => Boolean(Number(item.is_available))).map((item) => item.main_category || "Menu"))].map((category) => {
            const categoryItems = items.filter((item) => Boolean(Number(item.is_available)) && (item.main_category || "Menu") === category);
            const categoryIds = categoryItems.map((item) => String(item.item_id));
            const selectedCount = categoryIds.filter((id) => selectedIds.includes(id)).length;
            return <div className="flyer-category" key={category}>
            <div className="flyer-category-heading"><h4>{category}</h4><div className="flyer-category-actions">
              <button type="button" onClick={() => toggleCategory(category, true)}>Select all</button>
              <button type="button" onClick={() => toggleCategory(category, false)}>Clear</button>
            </div></div>
            <p className="flyer-category-count">{selectedCount} / {categoryItems.length} selected</p>
            {categoryItems.map((item) => <label className="check-label" key={item.item_id}>
              <input type="checkbox" checked={selectedIds.includes(String(item.item_id))} onChange={(event) => toggleItem(item.item_id, event.target.checked)} />
              {item.item_name || item.item_name_en} — €{Number(item.price_eur || 0).toFixed(2)}
            </label>)}
          </div>})}</div>
        </div>}
        <div className="form-actions">
          <button type="button" className="button button-outline flyer-letterhead-button" onClick={() => setMessage(printBlankLetterhead() ? "Blank letterhead opened. Choose Print or Save as PDF." : "Please allow pop-ups to print the blank letterhead.")}>Print blank letterhead / Tulosta tyhjä kirjelomake</button>
          {format === "today-special" && <button type="button" onClick={downloadTodaySpecialImage} disabled={generating}>{generating ? "Preparing image..." : "Download Today's Special image"}</button>}
          <button type="button" onClick={generateFlyer} disabled={generating}>{generating ? "Preparing..." : "Generate and print flyer"}</button>
          {imageUrl && format === "today-special" && <a href={imageUrl} download={`desi-dawat-todays-special-${day}.png`}>Download Today's Special PNG</a>}
        </div>
      </>}
    </div>
  );
}
