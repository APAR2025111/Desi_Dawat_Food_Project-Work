export const LETTERHEAD = Object.freeze({
  name: "DESI DAWAT",
  finnish: "Perinteinen intialainen perhekeittiö",
  english: "Traditional Indian Family Kitchen",
  address: "Pateniementie 59, 90800 Oulu",
  phone: "+358 44 980 3211",
  email: "desidawat.food@gmail.com",
  logo: "/images/LOGO.jpeg",
});

const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
})[character]);

export function renderLetterheadHtml({ logoSrc = LETTERHEAD.logo, className = "desi-letterhead" } = {}) {
  return `<div class="${escapeHtml(className)}"><img src="${escapeHtml(logoSrc)}" alt="Desi Dawat logo"><h1>${LETTERHEAD.name}</h1><p>${LETTERHEAD.finnish}</p><p>${LETTERHEAD.english}</p><p>${LETTERHEAD.address}</p><p>Puh. / Tel. ${LETTERHEAD.phone}</p><p>Email: ${LETTERHEAD.email}</p></div>`;
}

export function letterheadStyles() {
  return `.desi-letterhead{box-sizing:border-box;text-align:center!important;border-bottom:2px solid #c79b35;padding:0 0 14px;margin:0 0 18px;color:#35231d}.desi-letterhead img{display:block;width:74px;height:74px;object-fit:contain;margin:0 auto 8px;border:2px solid #c79b35;border-radius:50%;padding:2px;background:#21130e}.desi-letterhead h1{margin:0 0 7px;font:700 26px Georgia,serif;letter-spacing:1px;color:#791d2a}.desi-letterhead p{margin:3px 0;font:600 13px/1.35 Arial,sans-serif;color:#51443c}.desi-letterhead p:nth-of-type(1),.desi-letterhead p:nth-of-type(2){font-weight:700;color:#791d2a}@media print{.desi-letterhead{break-inside:avoid}.desi-letterhead img{print-color-adjust:exact;-webkit-print-color-adjust:exact}}`;
}
