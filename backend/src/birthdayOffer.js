const helsinkiDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Helsinki",
  dateStyle: "short",
});

export const BIRTHDAY_DISCOUNT_PERCENT = 10;

export function isValidDateOfBirth(value, now = new Date()) {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime())
    && date.toISOString().slice(0, 10) === value
    && value <= helsinkiDate.format(now);
}

export function getBirthdayOfferYear({ date_of_birth, birthday_offer_used_year }, now = new Date()) {
  if (!isValidDateOfBirth(date_of_birth, now)) return null;
  const today = new Date(`${helsinkiDate.format(now)}T00:00:00Z`);
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() - (today.getUTCDay() + 6) % 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const monthDay = date_of_birth.slice(5);

  for (let year = monday.getUTCFullYear(); year <= sunday.getUTCFullYear(); year += 1) {
    if (year === birthday_offer_used_year) continue;
    const anniversary = new Date(`${year}-${monthDay}T00:00:00Z`);
    // Observe February 29 birthdays on February 28 in common years.
    if (monthDay === "02-29" && anniversary.getUTCMonth() === 2) {
      anniversary.setUTCDate(anniversary.getUTCDate() - 1);
    }
    if (anniversary >= monday && anniversary <= sunday) return year;
  }
  return null;
}
