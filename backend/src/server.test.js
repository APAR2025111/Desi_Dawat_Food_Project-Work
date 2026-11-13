import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";

// Use throwaway test-only credentials and import the API without starting its
// production listener. No database calls are made by these routes.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "desi-dawat-test-only-secret";
process.env.ADMIN_USERNAME = "test-admin";
process.env.ADMIN_PASSWORD = "test-password-not-used";
process.env.FRONTEND_ORIGIN = "https://desidawat-test.invalid";
process.env.TRUST_PROXY_HOPS = "0";
const { app, buildCustomerReceiptPdf } = await import("./server.js");
const { pool } = await import("./db.js");
const { getBirthdayOfferYear, isValidDateOfBirth } = await import("./birthdayOffer.js");

let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

test("admin order endpoints reject requests without a valid session", async () => {
  const response = await fetch(`${baseUrl}/api/admin/orders`);
  assert.equal(response.status, 401);
});

test("CORS allows the local frontend and rejects an unrelated origin", async () => {
  const allowed = await fetch(`${baseUrl}/api/menu`, {
    method: "OPTIONS",
    headers: {
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "GET",
    },
  });
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173");

  const configured = await fetch(`${baseUrl}/api/menu`, {
    method: "OPTIONS",
    headers: {
      Origin: process.env.FRONTEND_ORIGIN,
      "Access-Control-Request-Method": "GET",
    },
  });
  assert.equal(configured.status, 204);
  assert.equal(configured.headers.get("access-control-allow-origin"), process.env.FRONTEND_ORIGIN);

  const rejected = await fetch(`${baseUrl}/api/menu`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://untrusted.invalid",
      "Access-Control-Request-Method": "GET",
    },
  });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);
});

test("order endpoint rejects malformed customer input before accessing the database", async () => {
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customer_name: 42,
      customer_phone: "not a phone",
      order_type: "delivery",
      payment_method: "pay_on_delivery",
      items: [{ item_id: 1, quantity: 1 }],
    }),
  });
  assert.equal(response.status, 400);
});

test("order endpoint requires a preferred time before saving", async () => {
  const response = await fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      customer_name: "Test Customer",
      customer_phone: "+358401234567",
      order_type: "takeaway",
      payment_method: "pay_on_delivery",
      items: [{ item_id: 1, quantity: 1 }],
    }),
  });
  assert.equal(response.status, 400);
});

test("checkout saves only a verified account ID and leaves guest orders unlinked", async (t) => {
  const savedCustomerIds = [];
  let guestProfileWrites = 0;
  let rollbacks = 0;
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() { rollbacks += 1; },
    release() {},
    async execute(sql, params) {
      if (sql.startsWith("SELECT customer_id, signup_offer_used_at FROM customers")) {
        assert.match(sql, /is_registered = TRUE/);
        return [params[0] === 42 ? [{ customer_id: 42 }] : []];
      }
      if (sql.startsWith("INSERT INTO customers")) {
        guestProfileWrites += 1;
        assert.equal(params[2], "358401234567");
        return [{}];
      }
      if (sql.includes("FROM menu_items")) {
        return [[{ item_id: 1, item_name: "Aloo Paratha", price_eur: 3.99 }]];
      }
      if (sql.startsWith("INSERT INTO customer_orders")) {
        assert.match(sql, /\(customer_id, customer_name, customer_phone/);
        savedCustomerIds.push(params[0]);
        return [{ insertId: savedCustomerIds.length }];
      }
      assert.match(sql, /^INSERT INTO customer_order_items/);
      return [{}];
    },
  };
  t.mock.method(pool, "query", async () => [[]]);
  t.mock.method(pool, "getConnection", async () => connection);

  const order = {
    customer_id: 999,
    customer_name: "Test Customer",
    customer_phone: "+358401234567",
    order_type: "takeaway",
    payment_method: "pay_on_delivery",
    preferred_time: "19:00",
    items: [{ item_id: 1, quantity: 1 }],
  };
  const submit = (token) => fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(order),
  });
  const sign = (payload, options) => jwt.sign(payload, process.env.JWT_SECRET, options);

  assert.equal((await submit(sign({ role: "customer", customer_id: 42 }))).status, 201);
  assert.equal((await submit()).status, 201);
  assert.equal((await submit(sign({ role: "customer", customer_id: 42 }, { expiresIn: -1 }))).status, 401);
  assert.equal((await submit(sign({ role: "customer", customer_id: 999 }))).status, 401);
  assert.equal((await submit(sign({ role: "admin" }))).status, 403);
  assert.deepEqual(savedCustomerIds, [42, null]);
  assert.equal(guestProfileWrites, 1);
  assert.equal(rollbacks, 1);
});

test("My Orders requires a customer session and scopes history to that account", async (t) => {
  const accountIds = [];
  const ownOrder = { order_id: 123, order_type: "takeaway", order_status: "pending", total_amount: "12.00" };
  t.mock.method(pool, "execute", async (sql, params) => {
    assert.match(sql, /c\.customer_id = o\.customer_id AND c\.is_registered = TRUE/);
    assert.match(sql, /WHERE o\.customer_id = \?/);
    assert.match(sql, /ORDER BY o\.created_at DESC, o\.order_id DESC/);
    accountIds.push(params[0]);
    return [params[0] === 42 ? [ownOrder] : []];
  });

  const history = (token) => fetch(`${baseUrl}/api/customer/orders?customer_id=42`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const sign = (payload, options) => jwt.sign(payload, process.env.JWT_SECRET, options);

  assert.equal((await history()).status, 401);
  assert.equal((await history(sign({ role: "admin" }))).status, 403);
  assert.equal((await history(sign({ role: "customer", customer_id: 42 }, { expiresIn: -1 }))).status, 401);

  const own = await history(sign({ role: "customer", customer_id: 42 }));
  assert.equal(own.status, 200);
  assert.equal(own.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await own.json(), { orders: [ownOrder] });

  const other = await history(sign({ role: "customer", customer_id: 99 }));
  assert.equal(other.status, 200);
  assert.deepEqual(await other.json(), { orders: [] });
  assert.deepEqual(accountIds, [42, 99]);
});

test("birthday week uses Helsinki time across New Year and observes leap-day birthdays", () => {
  const now = new Date("2025-12-28T22:00:00Z");
  assert.equal(getBirthdayOfferYear({ date_of_birth: "1990-01-01" }, now), 2026);
  assert.equal(getBirthdayOfferYear({ date_of_birth: "1990-01-01", birthday_offer_used_year: 2026 }, now), null);
  assert.equal(getBirthdayOfferYear({ date_of_birth: "1990-01-01" }, new Date(now - 1)), null);
  assert.equal(getBirthdayOfferYear({ date_of_birth: "1992-02-29" }, new Date("2025-02-24T12:00:00Z")), 2025);
  assert.equal(isValidDateOfBirth("1990-02-29", now), false);
  assert.equal(isValidDateOfBirth("2026-01-01", now), false);
});

test("a customer can save their birth date once and retry the same request", async (t) => {
  let saved = null;
  t.mock.method(pool, "execute", async (sql, params) => {
    if (sql.startsWith("UPDATE customers")) {
      assert.match(sql, /WHERE customer_id = \? AND is_registered = TRUE AND date_of_birth IS NULL/);
      assert.equal(params[1], 42);
      if (saved) return [{ affectedRows: 0 }];
      saved = params[0];
      return [{ affectedRows: 1 }];
    }
    assert.deepEqual(params, [42]);
    return [[{ date_of_birth: saved, birthday_offer_used_year: null }]];
  });
  const token = jwt.sign({ role: "customer", customer_id: 42 }, process.env.JWT_SECRET);
  const save = (date, session) => fetch(`${baseUrl}/api/customer/date-of-birth`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session}` } : {}) },
    body: JSON.stringify({ date_of_birth: date, customer_id: 99 }),
  });
  assert.equal((await save("1990-01-01")).status, 401);
  assert.equal((await save("1990-02-29", token)).status, 400);
  assert.equal((await save("1990-01-01", token)).status, 200);
  assert.equal((await save("1990-01-01", token)).status, 200);
  assert.equal((await save("1990-01-02", token)).status, 409);
  assert.equal(saved, "1990-01-01");
});

test("birthday and sign-up offers discount food once and reject stale checkout", async (t) => {
  let redeemed = false;
  let redemptionWrites = 0;
  let failOrderItem = false;
  let birthday = null;
  let birthdayUsedYear = null;
  const totals = [];
  const connection = {
    async beginTransaction() {},
    async commit() {},
    async rollback() {},
    release() {},
    async execute(sql, params) {
      if (sql.startsWith("SELECT customer_id, signup_offer_used_at,")) {
        assert.match(sql, /FOR UPDATE/);
        return [[{
          customer_id: 42, signup_offer_used_at: redeemed ? new Date() : null,
          date_of_birth: birthday, birthday_offer_used_year: birthdayUsedYear,
        }]];
      }
      if (sql.includes("FROM menu_items")) {
        return [[{ item_id: 1, item_name: "Test dish", price_eur: "12.55" }]];
      }
      if (sql.startsWith("INSERT INTO customer_orders")) {
        totals.push(params.slice(10, 13));
        return [{ insertId: totals.length }];
      }
      if (sql.startsWith("UPDATE customers SET signup_offer_used_at")) {
        assert.deepEqual(params, [42]);
        redeemed = true;
        redemptionWrites += 1;
      } else if (sql.startsWith("UPDATE customers SET birthday_offer_used_year")) {
        assert.equal(params[1], 42);
        birthdayUsedYear = params[0];
      } else {
        assert.match(sql, /^INSERT INTO customer_order_items/);
        if (failOrderItem) throw new Error("Simulated order item failure");
      }
      return [{}];
    },
  };
  t.mock.method(pool, "query", async () => [[]]);
  t.mock.method(pool, "getConnection", async () => connection);
  const customerToken = jwt.sign({ role: "customer", customer_id: 42 }, process.env.JWT_SECRET);
  const submit = (token, applySignupOffer, applyBirthdayOffer) => fetch(`${baseUrl}/api/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      customer_name: "Test Customer",
      customer_phone: "+358401234567",
      order_type: "takeaway",
      payment_method: "pay_on_delivery",
      preferred_time: "19:00",
      apply_signup_offer: applySignupOffer,
      apply_birthday_offer: applyBirthdayOffer,
      items: [{ item_id: 1, quantity: 1 }],
    }),
  });

  assert.equal((await submit(null, true)).status, 403);
  assert.equal((await submit(null, false, true)).status, 403);
  failOrderItem = true;
  assert.equal((await submit(customerToken, true)).status, 500);
  assert.equal(redeemed, false);

  failOrderItem = false;
  const first = await submit(customerToken, true);
  assert.equal(first.status, 201);
  const order = await first.json();
  assert.deepEqual([order.food_subtotal, order.discount_amount, order.total_amount], [12.55, 1.26, 11.29]);

  const stale = await submit(customerToken, true);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).code, "SIGNUP_OFFER_UNAVAILABLE");
  assert.equal((await submit(customerToken, false)).status, 201);
  assert.deepEqual(totals, [[10, 1.26, 11.29], [10, 1.26, 11.29], [0, 0, 12.55]]);
  assert.equal(redemptionWrites, 1);

  redeemed = false;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" });
  birthday = `1992-${today.slice(5)}`;
  assert.equal((await submit(customerToken, false, false)).status, 409);
  const birthdayOrder = await submit(customerToken, true, true);
  assert.equal(birthdayOrder.status, 201);
  assert.equal((await birthdayOrder.json()).discount_amount, 1.26);
  assert.equal(birthdayUsedYear, Number(today.slice(0, 4)));
  assert.equal(redeemed, false);
  assert.equal((await submit(customerToken, false, true)).status, 409);
});

test("customer receipt endpoint rejects invalid or mismatched order tokens", async () => {
  const invalid = await fetch(`${baseUrl}/api/orders/1/receipt?token=invalid`);
  assert.equal(invalid.status, 401);

  const token = jwt.sign({ orderId: 1, purpose: "customer-receipt" }, process.env.JWT_SECRET);
  const mismatched = await fetch(`${baseUrl}/api/orders/2/receipt?token=${encodeURIComponent(token)}`);
  assert.equal(mismatched.status, 403);
});

test("customer receipt is a two-page PDF with all three Admin payment methods", async () => {
  const pdf = await buildCustomerReceiptPdf({
    total_amount: 11.49,
    delivery_charge: 3.5,
    discount_amount: 0,
    order_type: "delivery",
    customer_name: "Test Customer",
    customer_phone: "+358401234567",
    delivery_address: "Pateniementie 59, Oulu",
    preferred_time: "19:00:00",
    customer_notes: null,
    order_status: "confirmed",
    created_at: new Date("2026-10-25T15:00:00Z"),
  }, [{ item_name: "Aloo Paratha", quantity: 2, unit_price: 3.99, line_total: 7.98 }], 4);
  const pdfText = pdf.toString("latin1");

  assert.equal(pdf.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.match(pdfText, /\/Count 2/);
  assert.ok((pdfText.match(/\/Subtype \/Image/g) || []).length >= 2, "the PDF embeds both the restaurant logo and MobilePay QR");
  assert.ok(pdf.length > 100_000, "the PDF includes the embedded receipt images");
});

test("admin sign-in throttles repeated invalid credentials", async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "wrong-user", password: "wrong-password" }),
    });
    assert.equal(response.status, 401);
  }

  const limited = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "wrong-user", password: "wrong-password" }),
  });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
});

test("admin uploads reject SVG and spoofed images even when authenticated", async () => {
  const token = jwt.sign({ role: "admin", username: "test-admin" }, process.env.JWT_SECRET);
  const form = new FormData();
  form.append("image", new Blob(["<svg></svg>"], { type: "image/svg+xml" }), "payload.svg");
  const response = await fetch(`${baseUrl}/api/admin/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /JPG, PNG, or WebP/);

  const spoofedForm = new FormData();
  spoofedForm.append("image", new Blob(["not a real image"], { type: "image/png" }), "fake.png");
  const spoofedResponse = await fetch(`${baseUrl}/api/admin/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: spoofedForm,
  });
  assert.equal(spoofedResponse.status, 400);
  assert.match((await spoofedResponse.json()).error, /not a valid/);
});

test("inventory API rejects categories that do not match the MySQL enum", async () => {
  const token = jwt.sign({ role: "admin", username: "test-admin" }, process.env.JWT_SECRET);
  const response = await fetch(`${baseUrl}/api/admin/inventory`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ item_name: "Test item", item_category: "unknown" }),
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /packing materials or food items/i);
});
