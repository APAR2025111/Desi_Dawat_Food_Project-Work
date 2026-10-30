const HELSINKI_TIME_ZONE = "Europe/Helsinki";

const weekdays = {
  Monday: { key: "mon_thu", fi: "maanantaina" },
  Tuesday: { key: "mon_thu", fi: "tiistaina" },
  Wednesday: { key: "mon_thu", fi: "keskiviikkona" },
  Thursday: { key: "mon_thu", fi: "torstaina" },
  Friday: { key: "fri", fi: "perjantaina" },
  Saturday: { key: "sat", fi: "lauantaina" },
  Sunday: { key: "sun", fi: "sunnuntaina" },
};

function toMinutes(value) {
  const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function displayTime(value) {
  const minutes = toMinutes(value);
  if (minutes == null) return "";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function displayMinutes(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function isMarkedClosed(value) {
  return value === true || Number(value) === 1;
}

export function getAvailableOrderTimeSlots(rows, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HELSINKI_TIME_ZONE,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  const row = rows.find((entry) => entry.day_key === weekdays[value("weekday")]?.key);
  if (!row) return [];

  const periods = [
    { open: row.morning_open, close: row.morning_close, closed: row.morning_closed },
    { open: row.evening_open, close: row.evening_close, closed: row.evening_closed },
  ].filter((period) => !isMarkedClosed(period.closed));
  const allSlots = new Set();
  for (const period of periods) {
    const open = toMinutes(period.open);
    const close = toMinutes(period.close);
    if (open == null || close == null || close < open) continue;
    const start = Math.ceil(open / 30) * 30;
    for (let minute = start; minute < close; minute += 30) {
      allSlots.add(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
    }
  }
  const currentMinutes = Number(value("hour")) * 60 + Number(value("minute"));
  const roundedCurrent = Math.ceil(currentMinutes / 30) * 30;
  const lastClosingMinute = periods.reduce((latest, period) => Math.max(latest, toMinutes(period.close) ?? -1), -1);
  const slots = currentMinutes >= lastClosingMinute
    ? allSlots
    : new Set([...allSlots].filter((time) => (toMinutes(time) ?? -1) >= roundedCurrent));
  return [...slots].sort();
}

export function getPreferredOrderDecision(rows, preferredTime, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HELSINKI_TIME_ZONE,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  const weekday = value("weekday");
  const day = weekdays[weekday];
  const row = rows.find((entry) => entry.day_key === day?.key);
  const localNow = Number(value("hour")) * 60 + Number(value("minute")) + Number(value("second")) / 60;
  const selectedMinutes = toMinutes(preferredTime);

  if (!row || selectedMinutes == null) {
    return {
      confirmed: false,
      code: "OPENING_HOURS_UNAVAILABLE",
      reason: "We received your order request, but could not verify today's opening hours. The restaurant will review your preferred time and confirm the order and receipt if feasible. / Otimme tilauspyyntösi vastaan, mutta emme voineet tarkistaa tämän päivän aukioloaikoja. Ravintola tarkistaa toivomasi ajan ja vahvistaa tilauksen sekä kuitin, jos se on mahdollista.",
    };
  }

  const periods = [
    { open: row.morning_open, close: row.morning_close, closed: row.morning_closed },
    { open: row.evening_open, close: row.evening_close, closed: row.evening_closed },
  ].filter((period) => !isMarkedClosed(period.closed))
    .map(({ open, close }) => ({ open: toMinutes(open), close: toMinutes(close) }))
    .filter((period) => period.open != null && period.close != null);
  const matchingPeriod = periods.find(({ open, close }) => {
    const firstSlot = open + 30;
    const lastSlot = close + 60;
    return selectedMinutes >= firstSlot
      && selectedMinutes <= lastSlot
      && (selectedMinutes - firstSlot) % 30 === 0;
  });

  if (!matchingPeriod) {
    const hoursText = periods.length
      ? periods.map(({ open, close }) => `${displayMinutes(open)}–${displayMinutes(close)}`).join(", ")
      : "closed / suljettu";
    return {
      confirmed: false,
      code: "PREFERRED_TIME_OUTSIDE_HOURS",
      reason: `Your order request was received, but the preferred time ${displayTime(preferredTime)} is outside today's opening hours (${hoursText}). The restaurant will confirm the order and share a receipt if feasible. / Tilauspyyntösi vastaanotettiin, mutta toivomasi aika ${displayTime(preferredTime)} on tämän päivän aukioloaikojen (${hoursText}) ulkopuolella. Ravintola vahvistaa tilauksen ja lähettää kuitin, jos se on mahdollista.`,
    };
  }

  const minutesUntilPreferred = selectedMinutes - localNow;
  if (minutesUntilPreferred < 45) {
    const reason = minutesUntilPreferred < 0
      ? `the selected time ${displayTime(preferredTime)} has already passed today`
      : `the selected time ${displayTime(preferredTime)} is less than 45 minutes away; at least 45 minutes' notice is required`;
    const reasonFi = minutesUntilPreferred < 0
      ? `valitsemasi aika ${displayTime(preferredTime)} on jo mennyt tältä päivältä`
      : `valitsemaasi aikaan ${displayTime(preferredTime)} on alle 45 minuuttia; tilaus tarvitsee vähintään 45 minuutin varoitusajan`;
    return {
      confirmed: false,
      code: "PREFERRED_TIME_TOO_SOON",
      reason: `Your order request was received, but ${reason}. The restaurant will confirm the order and share a receipt if feasible. / Tilauspyyntösi vastaanotettiin, mutta ${reasonFi}. Ravintola vahvistaa tilauksen ja lähettää kuitin, jos se on mahdollista.`,
    };
  }

  return { confirmed: true, minutesUntilPreferred };
}

export function getOpeningHoursDecision(rows, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HELSINKI_TIME_ZONE,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  const weekday = value("weekday");
  const localHour = Number(value("hour"));
  const localMinute = Number(value("minute"));
  const localTime = `${String(localHour).padStart(2, "0")}:${String(localMinute).padStart(2, "0")}`;
  const day = weekdays[weekday];
  const row = rows.find((entry) => entry.day_key === day?.key);

  if (!row) {
    return {
      isOpen: false,
      unavailable: true,
      code: "OPENING_HOURS_UNAVAILABLE",
      message: "Orders cannot be accepted because today's opening hours could not be verified. / Tilausta ei voida hyväksyä, koska tämän päivän aukioloaikoja ei saatu tarkistettua.",
    };
  }

  const periods = [
    { open: row.morning_open, close: row.morning_close, closed: row.morning_closed },
    { open: row.evening_open, close: row.evening_close, closed: row.evening_closed },
  ].filter((period) => !isMarkedClosed(period.closed) && toMinutes(period.open) != null && toMinutes(period.close) != null);
  const minuteOfDay = localHour * 60 + localMinute;
  const isOpen = periods.some(({ open, close }) => {
    const start = toMinutes(open);
    const end = toMinutes(close);
    return end >= start
      ? minuteOfDay >= start && minuteOfDay < end
      : minuteOfDay >= start || minuteOfDay < end;
  });
  const hoursText = periods.length
    ? periods.map(({ open, close }) => `${displayTime(open)}–${displayTime(close)}`).join(", ")
    : "closed / suljettu";

  if (isOpen) return { isOpen: true, dayKey: day.key, localTime, periods, hoursText };

  return {
    isOpen: false,
    code: "OUTSIDE_OPENING_HOURS",
    dayKey: day.key,
    localTime,
    periods,
    hoursText,
    message: `Order not accepted: Desi Dawat is closed ${day.fi}. Today's opening hours are ${hoursText}; the current time in Oulu is ${localTime}. Please place your order during opening hours. / Tilausta ei hyväksytty: Desi Dawat on nyt suljettu ${day.fi}. Tämän päivän aukioloajat ovat ${hoursText}; kellonaika Oulussa on ${localTime}. Tee tilaus aukioloaikana.`,
  };
}
