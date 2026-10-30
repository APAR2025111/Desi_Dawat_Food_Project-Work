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
