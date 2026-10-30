import test from "node:test";
import assert from "node:assert/strict";
import { validateCheckoutDetails } from "./checkoutValidation.js";

const validCustomer = {
  name: "Aino O'Connor",
  phone: "+358 40 123 4567",
  orderType: "delivery",
  address: "Pateniementie 59, 90800 Oulu",
};

test("accepts Finnish customer details and delivery address", () => {
  assert.equal(validateCheckoutDetails(validCustomer), "");
});

test("rejects missing or malformed customer names", () => {
  assert.match(validateCheckoutDetails({ ...validCustomer, name: "" }), /valid customer name/);
  assert.match(validateCheckoutDetails({ ...validCustomer, name: "Aino123" }), /valid customer name/);
});

test("rejects phone numbers with too few digits", () => {
  assert.match(validateCheckoutDetails({ ...validCustomer, phone: "+358 12" }), /valid phone number/);
});

test("requires a delivery address but permits takeaway without one", () => {
  assert.match(validateCheckoutDetails({ ...validCustomer, address: "  " }), /delivery address/);
  assert.equal(validateCheckoutDetails({ ...validCustomer, orderType: "takeaway", address: "" }), "");
});

test("rejects excessively long delivery addresses", () => {
  assert.match(validateCheckoutDetails({ ...validCustomer, address: "x".repeat(501) }), /under 500 characters/);
});
