export function getPreferredTimeSlots(day) {
  if (!day) return [];

  const periods = [
    { open: day.morning_open, close: day.morning_close, closed: day.morning_closed },
    { open: day.evening_open, close: day.evening_close, closed: day.evening_closed },
  ];
  const slots = new Set();

  periods.forEach(({ open, close, closed }) => {
    if (closed || !open || !close) return;
    const openMinutes = parseTime(open);
    const closeMinutes = parseTime(close);
    if (openMinutes == null || closeMinutes == null || closeMinutes < openMinutes) return;

    const firstSlot = openMinutes + 30;
    const lastSlot = Math.min(closeMinutes + 60, 23 * 60 + 30);
    for (let minutes = firstSlot; minutes <= lastSlot; minutes += 30) {
      slots.add(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
    }
  });

  return [...slots].sort();
}

function parseTime(value) {
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}
