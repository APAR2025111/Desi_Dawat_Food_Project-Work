import test from "node:test";
import assert from "node:assert/strict";
import { getOpeningHoursDecision, getAvailableOrderTimeSlots, getPreferredOrderDecision } from "./openingHours.js";

const weeklyHours = [
  { day_key: "mon_thu", morning_closed: 1, evening_open: "19:00:00", evening_close: "21:00:00", evening_closed: 0 },
  { day_key: "fri", morning_closed: 1, evening_open: "19:00:00", evening_close: "21:00:00", evening_closed: 0 },
  { day_key: "sat", morning_closed: 1, evening_open: "16:00:00", evening_close: "21:00:00", evening_closed: 0 },
  { day_key: "sun", morning_closed: 1, evening_open: "16:00:00", evening_close: "21:00:00", evening_closed: 0 },
];

test("accepts orders during the Finland opening schedule", () => {
  const decision = getOpeningHoursDecision(weeklyHours, new Date("2025-01-06T17:30:00Z"));
  assert.equal(decision.isOpen, true);
  assert.equal(decision.dayKey, "mon_thu");
  assert.equal(decision.localTime, "19:30");
});

test("rejects orders at closing time with the current schedule and local time", () => {
  const decision = getOpeningHoursDecision(weeklyHours, new Date("2025-01-06T19:00:00Z"));
  assert.equal(decision.isOpen, false);
  assert.equal(decision.code, "OUTSIDE_OPENING_HOURS");
  assert.match(decision.message, /19:00–21:00/);
  assert.match(decision.message, /21:00/);
  assert.match(decision.message, /Tilausta ei hyväksytty/);
});

test("uses Saturday and Sunday hours independently", () => {
  const saturday = getOpeningHoursDecision(weeklyHours, new Date("2025-01-04T14:30:00Z"));
  const sunday = getOpeningHoursDecision(weeklyHours, new Date("2025-01-05T14:30:00Z"));
  assert.equal(saturday.isOpen, true);
  assert.equal(sunday.isOpen, true);
  assert.equal(saturday.dayKey, "sat");
  assert.equal(sunday.dayKey, "sun");
});

test("fails closed when opening hours cannot be loaded", () => {
  const decision = getOpeningHoursDecision([], new Date("2025-01-06T17:30:00Z"));
  assert.equal(decision.isOpen, false);
  assert.equal(decision.unavailable, true);
  assert.equal(decision.code, "OPENING_HOURS_UNAVAILABLE");
});

test("builds half-hour order slots from the next available opening time", () => {
  const slots = getAvailableOrderTimeSlots(weeklyHours, new Date("2025-01-06T10:43:00Z"));
  assert.deepEqual(slots, ["19:00", "19:30", "20:00", "20:30"]);
});

test("rounds the current Finland time up to the next half-hour slot", () => {
  const slots = getAvailableOrderTimeSlots(weeklyHours, new Date("2025-01-06T17:43:00Z"));
  assert.deepEqual(slots, ["20:00", "20:30"]);
});

test("at 12:43, begins at 13:00 and continues in 30-minute increments", () => {
  const noonHours = [
    { day_key: "mon_thu", morning_open: "12:00:00", morning_close: "14:30:00", morning_closed: 0, evening_closed: 1 },
  ];
  assert.deepEqual(getAvailableOrderTimeSlots(noonHours, new Date("2025-01-06T10:43:00Z")), ["13:00", "13:30", "14:00"]);
});

test("confirms a preferred time inside today's hours with at least 45 minutes' notice, regardless of when the order is placed", () => {
  const decision = getPreferredOrderDecision(weeklyHours, "19:00", new Date("2025-01-06T13:00:00Z"));
  assert.equal(decision.confirmed, true);
});

test("requires restaurant confirmation when the preferred time is less than 45 minutes away", () => {
  const decision = getPreferredOrderDecision(weeklyHours, "19:30", new Date("2025-01-06T17:00:00Z"));
  assert.equal(decision.confirmed, false);
  assert.equal(decision.code, "PREFERRED_TIME_TOO_SOON");
  assert.match(decision.reason, /at least 45 minutes/);
});

test("confirms when the preferred time is exactly 45 minutes away", () => {
  const decision = getPreferredOrderDecision(weeklyHours, "19:45", new Date("2025-01-06T17:00:00Z"));
  assert.equal(decision.confirmed, true);
});

test("does not confirm when seconds make the notice period shorter than 45 minutes", () => {
  const decision = getPreferredOrderDecision(weeklyHours, "19:45", new Date("2025-01-06T17:00:30Z"));
  assert.equal(decision.confirmed, false);
  assert.equal(decision.code, "PREFERRED_TIME_TOO_SOON");
});

test("requires restaurant confirmation for a preferred time outside the configured hours", () => {
  const decision = getPreferredOrderDecision(weeklyHours, "22:00", new Date("2025-01-06T17:00:00Z"));
  assert.equal(decision.confirmed, false);
  assert.equal(decision.code, "PREFERRED_TIME_OUTSIDE_HOURS");
  assert.match(decision.reason, /outside today's opening hours/);
});

test("saves for review when opening hours cannot be verified", () => {
  const decision = getPreferredOrderDecision([], "19:30", new Date("2025-01-06T17:00:00Z"));
  assert.equal(decision.confirmed, false);
  assert.equal(decision.code, "OPENING_HOURS_UNAVAILABLE");
  assert.match(decision.reason, /review your preferred time/);
});
