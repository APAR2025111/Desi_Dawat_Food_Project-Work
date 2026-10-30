import test from "node:test";
import assert from "node:assert/strict";
import { getPreferredTimeSlots } from "./preferredTime.js";

test("offers a full 24-hour clock in half-hour increments", () => {
  const slots = getPreferredTimeSlots();
  assert.equal(slots.length, 48);
  assert.equal(slots[0], "00:00");
  assert.equal(slots[1], "00:30");
  assert.equal(slots[26], "13:00");
  assert.equal(slots.at(-1), "23:30");
  assert.ok(slots.every((slot) => /^(?:[01]\d|2[0-3]):(?:00|30)$/.test(slot)));
});
