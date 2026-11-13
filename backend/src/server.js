
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";
import { requireAdmin, requireCustomer } from "./auth.js";
import { getPreferredOrderDecision } from "./openingHours.js";
import { BIRTHDAY_DISCOUNT_PERCENT, getBirthdayOfferYear, isValidDateOfBirth } from "./birthdayOffer.js";
import multer from "multer";
import PDFDocument from "pdfkit";
import { LETTERHEAD, renderLetterheadHtml, letterheadStyles } from "../../shared/letterhead.js";
import { createDocumentRouter } from "./documentManagement.js";
dotenv.config();
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { randomInt } from "node:crypto";

// Let production hosts place uploads on durable storage outside an immutable release directory.
const uploadDir = path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"));
// Legal and business records use a separate private directory and are never exposed through /uploads.
const documentDir = path.resolve(process.env.DOCUMENT_STORAGE_DIR || path.join(process.cwd(), "private-documents"));

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(documentDir)) {
  fs.mkdirSync(documentDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const allowedTypes = new Map([
      [".jpg", "image/jpeg"],
      [".jpeg", "image/jpeg"],
      [".png", "image/png"],
      [".webp", "image/webp"],
    ]);
    if (allowedTypes.get(extension) === file.mimetype) {
      cb(null, true);
    } else {
      const error = new Error("Upload a JPG, PNG, or WebP image.");
      error.statusCode = 400;
      cb(error);
    }
  },
});
const aboutMediaUpload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `about-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const allowedTypes = new Map([
      [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"], [".webp", "image/webp"],
      [".mp4", "video/mp4"], [".webm", "video/webm"],
    ]);
    if (allowedTypes.get(extension) === file.mimetype) return cb(null, true);
    const error = new Error("Upload a JPG, PNG, WebP, MP4, or WebM file.");
    error.statusCode = 400;
    return cb(error);
  },
});
export const app = express();
const port = Number(process.env.PORT || 3001);
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error("TRUST_PROXY_HOPS must be a non-negative integer.");
}
app.set("trust proxy", trustProxyHops);
const allowedOrigins = new Set(
  (process.env.FRONTEND_ORIGIN || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
);
if (process.env.NODE_ENV !== "production") {
  allowedOrigins.add("http://localhost:5173");
  allowedOrigins.add("http://127.0.0.1:5173");
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      const error = new Error("Origin is not allowed.");
      error.statusCode = 403;
      return callback(error);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  })
);
app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});
app.use(express.json({ limit: "100kb" }));
app.use("/uploads", express.static(uploadDir));
app.use("/api/admin/documents", createDocumentRouter({
  pool,
  requireAdmin,
  storageDir: documentDir,
}));

/* Public About Us page content and media */
app.get("/api/about", async (_req, res) => {
  try {
    const [[contentRows], [mediaRows]] = await Promise.all([
      pool.query("SELECT title, description FROM about_page_content WHERE content_id = 1 LIMIT 1"),
      pool.query("SELECT media_id, media_url, media_type, alt_text FROM about_page_media ORDER BY sort_order, media_id"),
    ]);
    const content = contentRows[0] || {};
    return res.json({
      title: content.title || "About Desi Dawat",
      description: content.description || "",
      media: mediaRows,
    });
  } catch (error) {
    console.error("GET /api/about failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: "Could not load About Us content." });
  }
});

app.put("/api/admin/about", requireAdmin, async (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  if (!title || title.length > 200 || description.length > 10000) {
    return res.status(400).json({ error: "Enter a heading up to 200 characters and description up to 10,000 characters." });
  }
  try {
    await pool.execute(
      `INSERT INTO about_page_content (content_id, title, description)
       VALUES (1, ?, ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description)`,
      [title, description || null]
    );
    return res.json({ message: "About Us content saved.", title, description });
  } catch (error) {
    console.error("PUT /api/admin/about failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: "Could not save About Us content." });
  }
});

/* Opening hours: public read and admin update */

app.get("/api/opening-hours", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
  day_key,
  day_order,
  day_fi,
  day_en,
  open_time,
  close_time,
  is_closed,
  morning_open,
  morning_close,
  morning_closed,
  evening_open,
  evening_close,
  evening_closed
FROM opening_hours
ORDER BY day_order`
    );

    res.json(rows);
  } catch (error) {
    console.error("GET /api/opening-hours:", error);
    res.status(500).json({ error: "Could not load opening hours." });
  }
});

app.put("/api/admin/opening-hours", requireAdmin, async (req, res) => {
  const { hours } = req.body || {};
  if (!Array.isArray(hours) || hours.length !== 4) {
    return res.status(400).json({ error: "Please provide all four opening-hour entries." });
  }

  const allowedKeys = ["mon_thu", "fri", "sat", "sun"];

  for (const item of hours) {
        if (
      !allowedKeys.includes(item.day_key) ||
      (!item.morning_closed &&
        (typeof item.morning_open !== "string" ||
          !/^\d{2}:\d{2}$/.test(item.morning_open) ||
          typeof item.morning_close !== "string" ||
          !/^\d{2}:\d{2}$/.test(item.morning_close))) ||
      (!item.evening_closed &&
        (typeof item.evening_open !== "string" ||
          !/^\d{2}:\d{2}$/.test(item.evening_open) ||
          typeof item.evening_close !== "string" ||
          !/^\d{2}:\d{2}$/.test(item.evening_close))) ||
      (typeof item.morning_closed !== "boolean" &&
        item.morning_closed !== 0 &&
        item.morning_closed !== 1) ||
      (typeof item.evening_closed !== "boolean" &&
        item.evening_closed !== 0 &&
        item.evening_closed !== 1)
    ) {
      return res.status(400).json({
        error: "Invalid opening-hour values.",
      });
    }
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const item of hours) {
        await connection.execute(
  `UPDATE opening_hours
   SET open_time = ?, close_time = ?, is_closed = ?,
       morning_open = ?, morning_close = ?, morning_closed = ?,
       evening_open = ?, evening_close = ?, evening_closed = ?
   WHERE day_key = ?`,
  [
    !item.morning_closed && item.morning_open ? item.morning_open : item.evening_open || null,
    !item.evening_closed && item.evening_close ? item.evening_close : item.morning_close || null,
    item.morning_closed && item.evening_closed ? 1 : 0,
    item.morning_open || null,
    item.morning_close || null,
    item.morning_closed ? 1 : 0,
    item.evening_open || null,
    item.evening_close || null,
    item.evening_closed ? 1 : 0,
           item.day_key,
    ]
        );
    } // closes the for loop

    await connection.commit();
    res.json({ message: "Opening hours saved successfully." });
  } catch (error) {
    await connection.rollback();
    console.error("PUT /api/admin/opening-hours:", error);
    res.status(500).json({ error: "Could not save opening hours." });
  } finally {
    connection.release();
  }
});



const publicColumns = `
  item_id,
  display_code,
  main_category,
  subcategory,
  item_name,
  quantity_serving,
  price_eur,
  short_information,
  image_url,
  allergen_codes,
  is_available
`;

const allowedAllergenCodes = new Set(["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10"]);

function cleanItem(body) {
  const allergenCodes = Array.isArray(body.allergen_codes)
    ? [...new Set(body.allergen_codes.map((code) => String(code).trim().toUpperCase()).filter((code) => allowedAllergenCodes.has(code)))]
    : String(body.allergen_codes || "").split(",").map((code) => code.trim().toUpperCase()).filter((code) => allowedAllergenCodes.has(code));
  const item = {
    display_code: String(body.display_code ?? "").trim().toUpperCase(),
    main_category: String(body.main_category ?? "").trim(),
    subcategory: String(body.subcategory ?? "").trim(),
    item_name: String(body.item_name ?? "").trim(),
    quantity_serving: String(body.quantity_serving ?? "").trim(),
    price_eur: Number(body.price_eur),
    short_information: String(body.short_information ?? "").trim(),
    image_url: String(body.image_url ?? "").trim(),
    allergen_codes: allergenCodes,
    is_available:
      body.is_available === true ||
      body.is_available === 1 ||
      body.is_available === "1",
  };

  if (item.display_code && !/^\d{1,9}$/.test(item.display_code)) {
    return { error: "Menu item code must contain numbers only." };
  }

  if (!item.main_category || !item.item_name) {
    return {
      error: "Main category and item name are required.",
    };
  }

  if (!Number.isFinite(item.price_eur) || item.price_eur < 0) {
    return {
      error: "Price must be a valid non-negative number.",
    };
  }

  if (
    item.item_name.length > 200 ||
    item.main_category.length > 100 ||
    item.subcategory.length > 100 ||
    item.quantity_serving.length > 100
  ) {
    return { error: "One or more text fields are too long." };
  }

  return { item };
}

async function resolveMenuCode(requestedCode, excludeId = null) {
  if (requestedCode) return requestedCode;
  const [rows] = excludeId === null
    ? await pool.execute("SELECT display_code FROM menu_items")
    : await pool.execute("SELECT display_code FROM menu_items WHERE item_id <> ?", [excludeId]);
  const highestUsedNumber = rows
    .map((row) => String(row.display_code || ""))
    .filter((code) => /^\d+$/.test(code))
    .reduce((highest, code) => Math.max(highest, Number(code)), 23);
  return String(highestUsedNumber + 1);
}

// Health check: test the MySQL connection.
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    console.error("Database health check failed:", error.code || "UNKNOWN");

    res.status(503).json({
      status: "error",
      message: "Database is temporarily unavailable.",
      code: "DATABASE_UNAVAILABLE",
    });
  }
});

// Public menu: show only available items.
app.get("/api/menu", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${publicColumns}
       FROM menu_items
       WHERE is_available = 1
       ORDER BY main_category, item_name`
    );

    res.json(rows);
  } catch (error) {
    console.error("GET /api/menu failed:", error.code || "UNKNOWN");

    res.status(500).json({
      error: "Could not load the menu.",
      code: "DATABASE_QUERY_FAILED",
    });
  }
});

// Admin login: throttle repeated attempts by source address for this API instance.
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;
app.post("/api/admin/login", async (req, res) => {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  if (loginAttempts.size > 1000) {
    for (const [address, attempt] of loginAttempts) {
      if (now >= attempt.resetAt) loginAttempts.delete(address);
    }
  }
  const previous = loginAttempts.get(key);
  if (previous && now < previous.resetAt && previous.count >= LOGIN_MAX_ATTEMPTS) {
    res.setHeader("Retry-After", String(Math.ceil((previous.resetAt - now) / 1000)));
    return res.status(429).json({ error: "Too many sign-in attempts. Please try again later." });
  }
  const { username, password } = req.body || {};

  if (
    !process.env.JWT_SECRET ||
    !process.env.ADMIN_USERNAME ||
    !process.env.ADMIN_PASSWORD
  ) {
    return res.status(500).json({
      error: "Admin sign-in is not configured.",
    });
  }

  const usernameOk =
    typeof username === "string" &&
    username === process.env.ADMIN_USERNAME;

  let passwordOk = false;
  if (typeof password === "string") {
    passwordOk = await bcrypt.compare(password, process.env.ADMIN_PASSWORD).catch(() => false);
    if (!passwordOk && process.env.NODE_ENV !== "production") {
      passwordOk = password === process.env.ADMIN_PASSWORD;
    }
  }

  if (!usernameOk || !passwordOk) {
    const attempt = previous && now < previous.resetAt
      ? previous
      : { count: 0, resetAt: now + LOGIN_WINDOW_MS };
    loginAttempts.set(key, { ...attempt, count: attempt.count + 1 });
    return res.status(401).json({
      error: "Incorrect username or password.",
    });
  }
  loginAttempts.delete(key);

  const token = jwt.sign(
    { role: "admin", username },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({ token, username });
});

// Admin session validation: called by the frontend before rendering protected admin pages.
app.get("/api/admin/session", requireAdmin, (req, res) => {
  res.json({ role: req.admin.role, username: req.admin.username });
});

// Customer login: rate-limit repeated attempts and return a short-lived customer-only session.
const customerLoginAttempts = new Map();
app.post("/api/customer-auth/login", async (req, res) => {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  if (customerLoginAttempts.size > 1000) {
    for (const [address, attempt] of customerLoginAttempts) {
      if (now >= attempt.resetAt) customerLoginAttempts.delete(address);
    }
  }
  const previous = customerLoginAttempts.get(key);
  if (previous && now < previous.resetAt && previous.count >= LOGIN_MAX_ATTEMPTS) {
    res.setHeader("Retry-After", String(Math.ceil((previous.resetAt - now) / 1000)));
    return res.status(429).json({ error: "Too many sign-in attempts. Please try again later." });
  }

  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !password || password.length > 128) {
    return res.status(401).json({ error: "Email or password is incorrect." });
  }
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ error: "Customer sign-in is not configured." });
  }

  try {
    const [rows] = await pool.execute(
      `SELECT customer_id, customer_name, login_email, password_hash, is_registered
       FROM customers WHERE login_email = ? AND is_registered = TRUE LIMIT 1`,
      [email]
    );
    const account = rows[0];
    const passwordOk = account?.password_hash
      ? await bcrypt.compare(password, account.password_hash).catch(() => false)
      : false;

    if (!account || !passwordOk) {
      const attempt = previous && now < previous.resetAt
        ? previous
        : { count: 0, resetAt: now + LOGIN_WINDOW_MS };
      customerLoginAttempts.set(key, { ...attempt, count: attempt.count + 1 });
      return res.status(401).json({ error: "Email or password is incorrect." });
    }

    customerLoginAttempts.delete(key);
    const token = jwt.sign(
      { role: "customer", customer_id: Number(account.customer_id) },
      process.env.JWT_SECRET,
      { expiresIn: "8h" }
    );
    return res.json({
      token,
      customer: {
        customer_id: Number(account.customer_id),
        customer_name: account.customer_name,
        email: account.login_email,
      },
    });
  } catch (error) {
    if (error.code === "ER_BAD_FIELD_ERROR" || error.code === "ER_NO_SUCH_TABLE") {
      return res.status(503).json({ error: "Customer account setup is not complete yet. Please try again later." });
    }
    console.error("POST /api/customer-auth/login failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: "Could not sign in. Please try again." });
  }
});

const SIGNUP_DISCOUNT_PERCENT = 10;

app.get("/api/customer-auth/session", requireCustomer, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const [rows] = await pool.execute(
      `SELECT customer_id, customer_name, customer_phone, delivery_address, login_email, signup_offer_used_at,
              DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS date_of_birth, birthday_offer_used_year
       FROM customers WHERE customer_id = ? AND is_registered = TRUE LIMIT 1`,
      [Number(req.customer.customer_id)]
    );
    if (!rows.length) return res.status(401).json({ error: "Customer account is no longer available." });
    return res.json({
      customer: {
        customer_id: Number(rows[0].customer_id),
        customer_name: rows[0].customer_name,
        customer_phone: rows[0].customer_phone,
        delivery_address: rows[0].delivery_address,
        email: rows[0].login_email,
        signup_discount_percent: rows[0].signup_offer_used_at === null ? SIGNUP_DISCOUNT_PERCENT : 0,
        signup_offer_used_at: rows[0].signup_offer_used_at,
        date_of_birth: rows[0].date_of_birth,
        birthday_discount_percent: getBirthdayOfferYear(rows[0]) ? BIRTHDAY_DISCOUNT_PERCENT : 0,
      },
    });
  } catch (error) {
    if (error.code === "ER_BAD_FIELD_ERROR" || error.code === "ER_NO_SUCH_TABLE") {
      return res.status(503).json({ error: "Customer account setup is not complete yet. Please try again later." });
    }
    console.error("GET /api/customer-auth/session failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: "Could not check your customer session." });
  }
});

app.put("/api/customer/date-of-birth", requireCustomer, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const dateOfBirth = req.body?.date_of_birth;
  if (!isValidDateOfBirth(dateOfBirth)) {
    return res.status(400).json({ error: "Enter a valid date of birth that is today or earlier." });
  }

  const customerId = Number(req.customer.customer_id);
  try {
    let account = { date_of_birth: dateOfBirth };
    const [result] = await pool.execute(
      `UPDATE customers SET date_of_birth = ?
       WHERE customer_id = ? AND is_registered = TRUE AND date_of_birth IS NULL`,
      [dateOfBirth, customerId]
    );
    if (result.affectedRows === 0) {
      const [accounts] = await pool.execute(
        `SELECT DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS date_of_birth, birthday_offer_used_year
         FROM customers WHERE customer_id = ? AND is_registered = TRUE`,
        [customerId]
      );
      if (!accounts.length) return res.status(401).json({ error: "Customer account is no longer available." });
      [account] = accounts;
      if (account.date_of_birth !== dateOfBirth) {
        return res.status(409).json({ error: "Your date of birth is already saved and cannot be changed. Reload to see the saved date." });
      }
    }
    return res.json({
      date_of_birth: dateOfBirth,
      birthday_discount_percent: getBirthdayOfferYear(account) ? BIRTHDAY_DISCOUNT_PERCENT : 0,
    });
  } catch (error) {
    console.error("PUT /api/customer/date-of-birth failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: "Could not save your date of birth. Please try again." });
  }
});

app.get("/api/customer/orders", requireCustomer, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const [orders] = await pool.execute(
      `SELECT o.order_id,
              (SELECT COUNT(*)
               FROM customer_orders AS earlier
               WHERE earlier.created_at < o.created_at
                  OR (earlier.created_at = o.created_at AND earlier.order_id <= o.order_id)) AS receipt_number,
              o.created_at, o.order_type, o.order_status, o.total_amount
       FROM customer_orders AS o
       JOIN customers AS c ON c.customer_id = o.customer_id AND c.is_registered = TRUE
       WHERE o.customer_id = ?
       ORDER BY o.created_at DESC, o.order_id DESC`,
      [Number(req.customer.customer_id)]
    );
    return res.json({ orders });
  } catch (error) {
    console.error("GET /api/customer/orders failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: "Could not load your orders. Please try again." });
  }
});

app.get("/api/customer/orders/:id/receipt.pdf", requireCustomer, async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId) || orderId < 1) return res.status(400).send("Invalid order number.");
  try {
    const [orderRows] = await pool.execute(
      `SELECT orders.order_id, orders.customer_name, orders.customer_phone, orders.order_type,
              orders.delivery_address, orders.preferred_time, orders.customer_notes,
              orders.delivery_charge, orders.discount_amount, orders.total_amount,
              orders.admin_remark, orders.order_status, orders.created_at
       FROM customer_orders AS orders
       JOIN customers AS account ON account.customer_id = orders.customer_id AND account.is_registered = TRUE
       WHERE orders.order_id = ? AND orders.customer_id = ? LIMIT 1`,
      [orderId, Number(req.customer.customer_id)]
    );
    if (!orderRows.length) return res.status(404).send("Receipt not found.");
    const [itemRows] = await pool.execute(
      `SELECT customer_order_items.item_name,
              customer_order_items.quantity,
              customer_order_items.unit_price,
              customer_order_items.line_total
       FROM customer_order_items
       WHERE customer_order_items.order_id = ?
       ORDER BY customer_order_items.order_item_id`,
      [orderId]
    );
    const [receiptNumberRows] = await pool.execute(
      `SELECT COUNT(*) AS receipt_number
       FROM customer_orders AS candidate
       JOIN customer_orders AS target ON target.order_id = ?
       WHERE candidate.created_at < target.created_at
          OR (candidate.created_at = target.created_at AND candidate.order_id <= target.order_id)`,
      [orderId]
    );
    const receiptNumber = Number(receiptNumberRows[0]?.receipt_number) || orderId;
    const receiptPdf = await buildCustomerReceiptPdf(orderRows[0], itemRows, receiptNumber, {
      includePaymentPage: false,
      onePage: true,
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=desi-dawat-receipt-${receiptNumber}.pdf`);
    res.setHeader("Content-Length", receiptPdf.length);
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(receiptPdf);
  } catch (error) {
    console.error("GET customer order receipt failed:", error.code || "UNKNOWN");
    return res.status(500).send("Could not generate this receipt. Please try again.");
  }
});

app.get("/api/customer/surprise-rewards", requireCustomer, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const [rows] = await pool.execute(
      `SELECT customer_surprise_rewards.reward_id,
              customer_surprise_rewards.sequence_position,
              customer_surprise_rewards.reward_type,
              customer_surprise_rewards.reward_value,
              customer_surprise_rewards.qualifying_order_id,
              qualifying_order.created_at AS qualifying_order_date,
              (SELECT COUNT(*)
               FROM customer_orders AS earlier
               WHERE earlier.created_at < qualifying_order.created_at
                  OR (earlier.created_at = qualifying_order.created_at AND earlier.order_id <= qualifying_order.order_id)) AS qualifying_order_receipt_number,
              customer_surprise_rewards.addon_item_id,
              menu_items.item_name AS addon_item_name,
              customer_surprise_rewards.expires_at,
              customer_surprise_rewards.created_at,
              customer_surprise_rewards.redeemed_at,
              customer_surprise_rewards.redemption_order_id,
              redemption_order.created_at AS redemption_order_date,
              (SELECT COUNT(*)
               FROM customer_orders AS earlier
               WHERE earlier.created_at < redemption_order.created_at
                  OR (earlier.created_at = redemption_order.created_at AND earlier.order_id <= redemption_order.order_id)) AS redemption_receipt_number
       FROM customer_surprise_rewards
       LEFT JOIN menu_items ON menu_items.item_id = customer_surprise_rewards.addon_item_id
       LEFT JOIN customer_orders AS qualifying_order
         ON qualifying_order.order_id = customer_surprise_rewards.qualifying_order_id
       LEFT JOIN customer_orders AS redemption_order
         ON redemption_order.order_id = customer_surprise_rewards.redemption_order_id
       WHERE customer_surprise_rewards.customer_id = ?
         AND (customer_surprise_rewards.redeemed_at IS NOT NULL
              OR customer_surprise_rewards.expires_at > NOW())
       ORDER BY (customer_surprise_rewards.redeemed_at IS NOT NULL) ASC,
                CASE
                  WHEN customer_surprise_rewards.redeemed_at IS NOT NULL
                    THEN COALESCE(redemption_order.created_at, customer_surprise_rewards.redeemed_at)
                  ELSE customer_surprise_rewards.created_at
                END ASC,
                customer_surprise_rewards.reward_id ASC`,
      [Number(req.customer.customer_id)]
    );
    return res.json({ rewards: rows });
  } catch (error) {
    console.error("GET /api/customer/surprise-rewards failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: "Surprise rewards are temporarily unavailable. Please try again later." });
  }
});

app.get("/api/admin/surprise-reward-dishes", requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT menu_items.item_id, menu_items.item_name, menu_items.price_eur,
              menu_items.is_available, (surprise_reward_addon_items.item_id IS NOT NULL) AS is_reward_choice
       FROM menu_items
       LEFT JOIN surprise_reward_addon_items ON surprise_reward_addon_items.item_id = menu_items.item_id
       ORDER BY menu_items.main_category, menu_items.item_name`
    );
    return res.json({ items: rows });
  } catch (error) {
    console.error("GET /api/admin/surprise-reward-dishes failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: "Could not load surprise reward dish choices. Apply database migration 018 first." });
  }
});

function normalizeRewardCycle(value) {
  if (!Array.isArray(value) || value.length !== 15) return null;
  const cycle = [];
  for (const slot of value) {
    if (slot?.type === "addon") {
      cycle.push({ type: "addon" });
      continue;
    }
    const min = Number(slot?.min);
    const max = Number(slot?.max);
    if (slot?.type !== "percent" || !Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max > 10 || min > max) return null;
    cycle.push({ type: "percent", min, max });
  }
  return cycle;
}

app.get("/api/admin/surprise-reward-settings", requireAdmin, async (_req, res) => {
  try {
    const [[settings]] = await pool.query("SELECT validity_days, cycle_config FROM surprise_reward_settings WHERE settings_id = 1");
    if (!settings) return res.status(503).json({ error: "Reward settings are missing. Apply database migration 018." });
    let cycle = settings.cycle_config;
    if (typeof cycle === "string") cycle = JSON.parse(cycle);
    return res.json({ validity_days: Number(settings.validity_days), cycle_config: cycle });
  } catch (error) {
    console.error("GET /api/admin/surprise-reward-settings failed:", error.code || "UNKNOWN");
    return res.status(503).json({ error: "Reward setup is incomplete. Apply database migration 018 and reload this page." });
  }
});

app.put("/api/admin/surprise-reward-settings", requireAdmin, async (req, res) => {
  const cycle = normalizeRewardCycle(req.body?.cycle_config);
  const validityDays = Number(req.body?.validity_days);
  if (!cycle || !Number.isInteger(validityDays) || validityDays < 1 || validityDays > 90) {
    return res.status(400).json({ error: "Set exactly 15 reward positions, percentages from 1% to 10%, and coupon validity from 1 to 90 days." });
  }
  try {
    const [addonRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM surprise_reward_addon_items
       JOIN menu_items ON menu_items.item_id = surprise_reward_addon_items.item_id
       WHERE menu_items.is_available = 1`
    );
    if (cycle.some((slot) => slot.type === "addon") && Number(addonRows[0]?.total) === 0) {
      return res.status(400).json({ error: "Select at least one available add-on dish before saving a cycle that includes free dishes." });
    }
    await pool.execute(
      "UPDATE surprise_reward_settings SET validity_days = ?, cycle_config = ? WHERE settings_id = 1",
      [validityDays, JSON.stringify(cycle)]
    );
    return res.json({ validity_days: validityDays, cycle_config: cycle });
  } catch (error) {
    console.error("PUT /api/admin/surprise-reward-settings failed:", error.code || "UNKNOWN");
    return res.status(503).json({ error: "Could not save reward settings. Apply database migration 018 and try again." });
  }
});

app.put("/api/admin/surprise-reward-dishes", requireAdmin, async (req, res) => {
  const itemIds = req.body?.item_ids;
  if (!Array.isArray(itemIds) || itemIds.length < 1 || itemIds.length > 200 || itemIds.some((id) => !Number.isInteger(Number(id)) || Number(id) < 1)) {
    return res.status(400).json({ error: "Choose at least one valid menu dish for add-on rewards." });
  }
  const ids = [...new Set(itemIds.map(Number))];
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    if (ids.length) {
      const placeholders = ids.map(() => "?").join(",");
      const [available] = await connection.execute(
        `SELECT item_id FROM menu_items WHERE is_available = 1 AND item_id IN (${placeholders})`, ids
      );
      if (available.length !== ids.length) {
        await connection.rollback();
        return res.status(400).json({ error: "Only currently available dishes can be add-on rewards." });
      }
    }
    await connection.query("DELETE FROM surprise_reward_addon_items");
    for (const id of ids) await connection.execute("INSERT INTO surprise_reward_addon_items (item_id) VALUES (?)", [id]);
    await connection.commit();
    return res.json({ item_ids: ids });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("PUT /api/admin/surprise-reward-dishes failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: "Could not save surprise reward dish choices." });
  } finally {
    connection?.release();
  }
});

// Admin: list all items, including hidden items.
app.get("/api/admin/menu", requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ${publicColumns}
       FROM menu_items
       ORDER BY item_id`
    );

    res.json(rows);
  } catch (error) {
    console.error("GET /api/admin/menu failed:", error.code || "UNKNOWN");

    res.status(500).json({
      error: "Could not load admin menu.",
    });
  }
});

// Admin: add a menu item.
app.post("/api/admin/menu", requireAdmin, async (req, res) => {
  const { item, error } = cleanItem(req.body || {});

  if (error) {
    return res.status(400).json({ error });
  }

  try {
    item.display_code = await resolveMenuCode(item.display_code);
    const [result] = await pool.execute(
      `INSERT INTO menu_items
       (display_code, main_category, subcategory, item_name, quantity_serving,
 price_eur, short_information, image_url, allergen_codes, is_available)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.display_code,
        item.main_category,
        item.subcategory || null,
        item.item_name,
        item.quantity_serving || null,
        item.price_eur,
        item.short_information || null,
item.image_url || null,
item.allergen_codes.join(",") || null,
item.is_available ? 1 : 0,
      ]
    );

    const [rows] = await pool.execute(
      `SELECT ${publicColumns}
       FROM menu_items
       WHERE item_id = ?`,
      [result.insertId]
    );

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error("POST /api/admin/menu failed:", error.code || "UNKNOWN");

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "That menu item code is already in use. Choose a unique code." });
    }

    res.status(500).json({
      error: "Could not add item.",
    });
  }
});

// Admin: edit a menu item or change its visibility.
app.put("/api/admin/menu/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Invalid item ID." });
  }

  const { item, error } = cleanItem(req.body || {});

  if (error) {
    return res.status(400).json({ error });
  }

  try {
    if (!item.display_code) {
      const [existingRows] = await pool.execute(
        "SELECT display_code FROM menu_items WHERE item_id = ?",
        [id]
      );
      item.display_code = existingRows[0]?.display_code || "";
    }
    item.display_code = await resolveMenuCode(item.display_code, id);
    const [result] = await pool.execute(
      `UPDATE menu_items
       SET display_code = ?,
           main_category = ?,
           subcategory = ?,
           item_name = ?,
           quantity_serving = ?,
           price_eur = ?,
           short_information = ?,
image_url = ?,
allergen_codes = ?,
is_available = ?
WHERE item_id = ?`,
      [
        item.display_code,
        item.main_category,
        item.subcategory || null,
        item.item_name,
        item.quantity_serving || null,
        item.price_eur,
        item.short_information || null,
item.image_url || null,
item.allergen_codes.join(",") || null,
item.is_available ? 1 : 0,
id,
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        error: "Menu item not found.",
      });
    }

    const [rows] = await pool.execute(
      `SELECT ${publicColumns}
       FROM menu_items
       WHERE item_id = ?`,
      [id]
    );

    res.json(rows[0]);
  } catch (error) {
    console.error("PUT /api/admin/menu/:id failed:", error.code || "UNKNOWN");

    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "That menu item code is already in use. Choose a unique code." });
    }

    res.status(500).json({
      error: "Could not update item.",
    });
  }
});

// Admin: delete a menu item.
app.delete("/api/admin/menu/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Invalid item ID." });
  }

  try {
    const [result] = await pool.execute(
      "DELETE FROM menu_items WHERE item_id = ?",
      [id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        error: "Menu item not found.",
      });
    }

    res.json({ message: "Menu item deleted." });
  } catch (error) {
    console.error("DELETE /api/admin/menu/:id failed:", error.code || "UNKNOWN");

    res.status(500).json({
      error: "Could not delete item.",
    });
  }
});

function escapeReceiptHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function normalizeCustomerPhone(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/* Public customer registration. Guest contact profiles are never claimed by phone alone. */
app.post("/api/customer-auth/register", async (req, res) => {
  const name = typeof req.body?.customer_name === "string" ? req.body.customer_name.trim() : "";
  const phone = typeof req.body?.customer_phone === "string" ? req.body.customer_phone.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const address = typeof req.body?.delivery_address === "string" ? req.body.delivery_address.trim() : "";
  const normalizedPhone = normalizeCustomerPhone(phone);
  const validName = name.length >= 2 && name.length <= 120 && /^[\p{L}\p{M}\s'-]+$/u.test(name);
  const validPhone = /^[+]?[0-9\s().-]{7,30}$/.test(phone) && normalizedPhone.length >= 7 && normalizedPhone.length <= 32;
  const validEmail = email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  if (!validName || !validPhone || !validEmail || password.length < 8 || password.length > 128 || address.length > 500) {
    return res.status(400).json({
      error: "Enter a valid name, phone number, and email. Passwords must be 8–128 characters.",
    });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [emailRows] = await connection.execute(
      "SELECT customer_id FROM customers WHERE login_email = ? LIMIT 1 FOR UPDATE",
      [email]
    );
    if (emailRows.length) {
      await connection.rollback();
      return res.status(409).json({ error: "An account already uses this email. Please log in instead." });
    }

    const [phoneRows] = await connection.execute(
      "SELECT customer_id, is_registered FROM customers WHERE phone_normalized = ? LIMIT 1 FOR UPDATE",
      [normalizedPhone]
    );
    if (phoneRows.length) {
      await connection.rollback();
      return res.status(409).json({
        error: phoneRows[0].is_registered
          ? "This phone number is already linked to an account. Please use another number or log in."
          : "This phone number is already associated with a guest profile. Please contact the restaurant to register it safely.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await connection.execute(
      `INSERT INTO customers
       (customer_name, customer_phone, phone_normalized, email, login_email, password_hash, is_registered, delivery_address)
       VALUES (?, ?, ?, ?, ?, ?, TRUE, ?)` ,
      [name, phone, normalizedPhone, email, email, passwordHash, address || null]
    );

    await connection.commit();
    return res.status(201).json({
      message: "Your account has been created. You can now log in.",
      customer: { customer_id: result.insertId, customer_name: name, email },
    });
  } catch (error) {
    if (connection) await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "An account or customer profile already uses one of these details." });
    }
    if (error.code === "ER_BAD_FIELD_ERROR" || error.code === "ER_NO_SUCH_TABLE") {
      return res.status(503).json({ error: "Customer account setup is not complete yet. Please try again later." });
    }
    console.error("POST /api/customer-auth/register failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: "Could not create your account." });
  } finally {
    connection?.release();
  }
});

export function buildCustomerReceiptHtml(order, items, receiptNumber) {
  const money = (amount) => Number(amount || 0).toFixed(2);
  const subtotal = Number(order.total_amount || 0) - Number(order.delivery_charge || 0) + Number(order.discount_amount || 0);
  const total = money(order.total_amount);
  const deliveryPending = order.order_status === "pending" && String(order.customer_notes || "").includes("DELIVERY CHARGE PENDING MANUAL REVIEW");
  let logoImage = "";
  let mobilePayQr = "";
  try {
    const logoPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/public/images/LOGO.jpeg");
    logoImage = `data:image/jpeg;base64,${fs.readFileSync(logoPath).toString("base64")}`;
  } catch (error) {
    console.error("Restaurant logo is unavailable for receipt:", error.code || "UNKNOWN");
  }
  try {
    const qrPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/public/images/Mobile_Pay_QR.jpeg");
    mobilePayQr = `data:image/jpeg;base64,${fs.readFileSync(qrPath).toString("base64")}`;
  } catch (error) {
    console.error("MobilePay QR is unavailable for receipt:", error.code || "UNKNOWN");
  }
  const itemRows = items.map((item) => `<tr><td>${escapeReceiptHtml(item.item_name)}</td><td>${escapeReceiptHtml(item.quantity)}</td><td>€${money(item.unit_price)}</td><td>€${money(item.line_total)}</td></tr>`).join("");
  const address = order.delivery_address
    ? `<p><strong>Toimitusosoite / Delivery address:</strong><br>${escapeReceiptHtml(order.delivery_address)}</p>`
    : "";
  const preferredTime = `<p><strong>Toivottu ${order.order_type === "delivery" ? "toimitusaika" : "noutoaika"} / Preferred ${order.order_type === "delivery" ? "delivery" : "pickup"} time:</strong><br>${escapeReceiptHtml(String(order.preferred_time || "—").slice(0, 5))}</p>`;
  const customerNotes = String(order.customer_notes || "")
    .split(/\r?\n/)
    .filter((line) => !/^(DELIVERY CHARGE PENDING MANUAL REVIEW|ORDER REVIEW REQUIRED:)/.test(line.trim()))
    .join("\n")
    .trim();
  const notes = customerNotes
    ? `<p><strong>Lisätiedot / Instructions:</strong><br>${escapeReceiptHtml(customerNotes)}</p>`
    : "";
  const charge = deliveryPending ? "Vahvistetaan / Pending confirmation" : `€${money(order.delivery_charge)}`;
  const date = order.created_at ? new Date(order.created_at).toLocaleString("fi-FI", { timeZone: "Europe/Helsinki" }) : "—";
  const status = order.order_status === "confirmed" ? "Vahvistettu / Confirmed" : escapeReceiptHtml(order.order_status);

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Desi Dawat Receipt #${escapeReceiptHtml(receiptNumber)}</title><style>
*{box-sizing:border-box}body{font:11.5px/1.4 Arial,sans-serif;color:#202124;max-width:760px;margin:18px auto;padding:24px 30px;background:#fff;border:1px solid #c79b35;border-top:6px solid #c79b35}h1,h2{color:#202124}.title{padding:9px 11px;background:#fff7e9;border-left:4px solid #c79b35;color:#791d2a;font-weight:800}.details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 9px}.details p{margin:4px 0;padding:6px 8px;background:#fcf8f2;border:1px solid #eee4d7;border-radius:4px;overflow-wrap:anywhere}.customer-note-box{height:48px;margin:8px 0;border:1px solid #9aa0a6;border-radius:3px;padding:5px 7px;color:#5f6368;font-size:10px}.customer-note-box span{background:#fff;padding-right:5px}table{width:100%;border-collapse:collapse;margin:12px 0;border:1px solid #ead8b8}th,td{text-align:left;padding:6px 7px;border-bottom:1px solid #eee4d7}thead{background:#791d2a;color:#fff}td:nth-child(n+2),th:nth-child(n+2){text-align:right}.total{margin:10px 0;padding:10px 12px;text-align:right;font-size:19px;background:#fff3d9;border-left:5px solid #c79b35;color:#791d2a}.pending{padding:10px;background:#fff5df;border-left:4px solid #c79b35}.page-one{break-after:page;page-break-after:always}.payment-page{min-height:265mm;margin:0;padding:18mm;border:1px solid #c79b35;border-top:5px solid #c79b35;break-before:page;page-break-before:always}.payment-brand{text-align:center;padding-bottom:12px;margin-bottom:20px;border-bottom:1px solid #dadce0}.payment-brand h1{font:700 24px Georgia,serif;margin:0 0 6px}.payment-brand p{margin:3px 0;color:#5f6368}.payment-option{margin:14px 0;padding:12px;border:1px solid #dadce0;break-inside:avoid}.payment-option h2{margin:0 0 8px;font-size:18px}.payment-option p{margin:5px 0}.qr-row{display:flex;align-items:center;gap:14px}.qr-row img{width:128px;height:128px;object-fit:contain}.receipt-note{margin-top:16px;color:#791d2a;font-weight:600}@page{size:A4;margin:8mm}@media print{body{max-width:none;margin:0;padding:0;border:0;border-top:4px solid #c79b35}.page-one{min-height:270mm;break-after:page;page-break-after:always}.payment-page{min-height:270mm;break-before:page;page-break-before:always}.title,thead,.total,.payment-option{-webkit-print-color-adjust:exact;print-color-adjust:exact}table,.details,.total,header{break-inside:avoid}}
</style>${letterheadStyles()}</head><body><section class="page-one">${renderLetterheadHtml({ logoSrc: logoImage || LETTERHEAD.logo })}<div class="title">TILAUSKUITTI / ORDER RECEIPT · #${escapeReceiptHtml(receiptNumber)}</div><section class="details"><p><strong>Päivämäärä / Date:</strong><br>${escapeReceiptHtml(date)}</p><p><strong>Asiakas / Customer:</strong><br>${escapeReceiptHtml(order.customer_name)}</p><p><strong>Puhelin / Phone:</strong><br>${escapeReceiptHtml(order.customer_phone)}</p><p><strong>Tilaustapa / Order type:</strong><br>${order.order_type === "delivery" ? "Kotiinkuljetus / Home delivery" : "Nouto / Takeaway"}</p>${address}${preferredTime}${notes}</section><div class="customer-note-box"><span>Asiakkaan huomio / Customer note:</span></div><h2>Tuotteet / Items</h2><table><thead><tr><th>Tuote / Item</th><th>Määrä / Qty</th><th>Hinta / Price</th><th>Yhteensä / Total</th></tr></thead><tbody>${itemRows}</tbody></table><p>Ruokien välisummaa / Food subtotal: <strong>€${money(subtotal)}</strong></p>${Number(order.discount_amount || 0) > 0 ? `<p>Alennus / Discount: −€${money(order.discount_amount)}</p>` : ""}<p>Kuljetusmaksu / Delivery charge: <strong>${charge}</strong></p><h2 class="total">YHTEENSÄ / TOTAL: €${total}</h2><p><strong>Tilauksen tila / Order status:</strong> ${status}</p><p>Kiitos, kun tilasit Desi Dawatista! / Thank you for ordering from Desi Dawat!</p></section><section class="payment-page"><header class="payment-brand">${renderLetterheadHtml()}<p>Maksutavat / Payment Options</p><p>Kuitti / Receipt #${escapeReceiptHtml(receiptNumber)} · Maksettava / Amount due: €${total}</p></header><div class="payment-option"><h2>1. Käteinen toimituksen tai noudon yhteydessä / Pay on delivery or pickup</h2><p>Maksa €${total}, kun tilaus toimitetaan tai noudetaan.</p><p>Please pay €${total} when your order is delivered or collected.</p></div><div class="payment-option"><h2>2. Tilisiirto / Bank transfer</h2><p>Tilinomistaja / Account holder: Ruchi Srivastava · OP Bank, Finland</p><p>IBAN: FI6157445020094271</p><p>BIC/SWIFT: OKOYFIHH</p><p>Siirrä €${total}. / Please transfer €${total}.</p><p>Näytä maksuvahvistus noudon tai toimituksen yhteydessä. / Please show payment confirmation during delivery or pickup.</p></div><div class="payment-option"><h2>3. MobilePay QR</h2><div class="qr-row">${mobilePayQr ? `<img src="${mobilePayQr}" alt="MobilePay QR code">` : ""}<p>Skannaa ja maksa €${total}. Näytä maksuvahvistus noudon tai toimituksen yhteydessä.<br>Scan to pay €${total}. Please show payment confirmation during delivery or pickup.</p></div></div></section></body></html>`;
}

export function buildCustomerReceiptPdf(order, items, receiptNumber, { includePaymentPage = true, language = null, onePage = false } = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40, compress: false, info: { Title: `Desi Dawat Receipt #${receiptNumber}`, Author: "Desi Dawat" } });
    const chunks = [];
    const maroon = "#791D2A";
    const gold = "#C79B35";
    const ink = "#35231D";
    const muted = "#66584D";
    const cream = "#FFF7E9";
    const finnish = language === "fi";
    const labels = finnish ? {
      title: "TILAUSKUITTI",
      receiptNumber: "Kuitti nro",
      date: "Päivämäärä",
      customer: "Asiakas",
      phone: "Puhelin",
      type: "Tilaustyyppi",
      delivery: "Kotiinkuljetus",
      takeaway: "Nouto",
      preferredDelivery: "Toivottu toimitusaika",
      preferredTakeaway: "Toivottu noutoaika",
      address: "Toimitusosoite",
      instructions: "Lisätiedot",
      customerNote: "Asiakkaan huomio",
      items: "TUOTTEET",
      item: "Tuote",
      quantity: "Määrä",
      price: "Hinta",
      lineTotal: "Yhteensä",
      subtotal: "Ruokien välisummaa",
      discount: "Alennus",
      deliveryCharge: "Kuljetusmaksu",
      pending: "Vahvistetaan",
      total: "YHTEENSÄ",
      status: "Tilauksen tila",
      confirmed: "Vahvistettu",
      thankYou: "Kiitos, kun tilasit Desi Dawatista!",
      brandTagline: LETTERHEAD.finnish,
    } : language === "en" ? {
      title: "ORDER RECEIPT",
      receiptNumber: "Receipt No.",
      date: "Date",
      customer: "Customer",
      phone: "Phone",
      type: "Order type",
      delivery: "Home delivery",
      takeaway: "Takeaway",
      preferredDelivery: "Preferred delivery time",
      preferredTakeaway: "Preferred pickup time",
      address: "Delivery address",
      instructions: "Instructions",
      customerNote: "Customer note",
      items: "ITEMS",
      item: "Item",
      quantity: "Qty",
      price: "Price",
      lineTotal: "Total",
      subtotal: "Food subtotal",
      discount: "Discount",
      deliveryCharge: "Delivery charge",
      pending: "Pending confirmation",
      total: "TOTAL",
      status: "Order status",
      confirmed: "Confirmed",
      thankYou: "Thank you for ordering from Desi Dawat!",
      brandTagline: LETTERHEAD.english,
    } : null;
    const pageWidth = doc.page.width;
    const left = 42;
    const right = pageWidth - left;
    const contentWidth = right - left;
    const money = (amount) => Number(amount || 0).toFixed(2);
    const total = money(order.total_amount);
    const subtotal = Number(order.total_amount || 0) - Number(order.delivery_charge || 0) + Number(order.discount_amount || 0);
    const deliveryPending = order.order_status === "pending" && String(order.customer_notes || "").includes("DELIVERY CHARGE PENDING MANUAL REVIEW");
    const customerNotes = String(order.customer_notes || "").split(/\r?\n/)
      .filter((line) => !/^(DELIVERY CHARGE PENDING MANUAL REVIEW|ORDER REVIEW REQUIRED:)/.test(line.trim()))
      .join(" ").trim();
    const logoPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/public/images/LOGO.jpeg");
    const qrPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/public/images/Mobile_Pay_QR.jpeg");
    const printText = (text, x, y, width, options = {}) => {
      doc.text(String(text ?? "—"), x, y, { width, height: options.height || 12, lineBreak: false, ellipsis: true, ...options });
    };
    const drawField = (label, value, x, y, width) => {
      const fieldHeight = onePage ? 28 : 34;
      doc.roundedRect(x, y, width, fieldHeight, 4).fillAndStroke(cream, "#EAD8B8");
      doc.font("Helvetica-Bold").fontSize(onePage ? 6.5 : 7.5).fillColor(maroon);
      printText(label, x + 8, y + 4, width - 16, { height: 8 });
      doc.font("Helvetica").fontSize(onePage ? 8 : 9).fillColor(ink);
      printText(value, x + 8, y + 15, width - 16, { height: 10 });
    };
    const fieldGap = onePage ? 32 : 40;
    const drawPaymentOption = (title, lines, x, y, width, height) => {
      doc.roundedRect(x, y, width, height, 6).fillAndStroke("#FFFFFF", "#DADCE0");
      doc.font("Helvetica-Bold").fontSize(12).fillColor(maroon);
      printText(title, x + 14, y + 12, width - 28, { height: 16 });
      doc.font("Helvetica").fontSize(10).fillColor(ink);
      lines.forEach((line, index) => printText(line, x + 14, y + 35 + (index * 17), width - 28, { height: 13 }));
    };

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Keep the PDF brand stamp centered and consistent with the shared letterhead used by web prints.
    const brandLogoSize = 50;
    const logoX = (pageWidth - brandLogoSize) / 2;
    if (fs.existsSync(logoPath)) doc.image(logoPath, logoX, 20, { width: brandLogoSize, height: brandLogoSize });
    doc.font("Helvetica-Bold").fontSize(17).fillColor(maroon).text(LETTERHEAD.name, left, 73, { width: contentWidth, align: "center" });
    if (labels) {
      doc.font("Helvetica-Bold").fontSize(10).fillColor(ink).text(labels.brandTagline, left, 96, { width: contentWidth, align: "center" });
    } else {
      doc.font("Helvetica-Bold").fontSize(10).fillColor(ink).text(LETTERHEAD.finnish, left, 96, { width: contentWidth, align: "center" });
      doc.font("Helvetica-Bold").fontSize(10).fillColor(ink).text(LETTERHEAD.english, left, 110, { width: contentWidth, align: "center" });
    }
    doc.font("Helvetica").fontSize(9).fillColor(muted).text(LETTERHEAD.address, left, 126, { width: contentWidth, align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor(muted).text(`${finnish ? "Puh." : language === "en" ? "Tel." : "Puh. / Tel."} ${LETTERHEAD.phone}`, left, 139, { width: contentWidth, align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor(muted).text(`Email: ${LETTERHEAD.email}`, left, 152, { width: contentWidth, align: "center" });
    doc.moveTo(left, 168).lineTo(right, 168).lineWidth(1.5).strokeColor(gold).stroke();
    doc.roundedRect(left, 176, contentWidth, 28, 4).fill(maroon);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#FFFFFF").text(`${labels?.title || "TILAUSKUITTI / ORDER RECEIPT"} · #${receiptNumber}`, left + 10, 184, { width: contentWidth - 20, align: "center" });

    const date = order.created_at ? new Date(order.created_at).toLocaleString(finnish ? "fi-FI" : "en-FI", { timeZone: "Europe/Helsinki" }) : "—";
    const columnGap = 10;
    const columnWidth = (contentWidth - columnGap) / 2;
    let y = 212;
    drawField(labels?.receiptNumber || "Kuitti nro / Receipt No.", `#${receiptNumber}`, left, y, columnWidth);
    drawField(labels?.date || "Päivämäärä / Date", date, left + columnWidth + columnGap, y, columnWidth);
    y += fieldGap;
    drawField(labels?.customer || "Asiakas / Customer", order.customer_name, left, y, columnWidth);
    drawField(labels?.phone || "Puhelin / Phone", order.customer_phone, left + columnWidth + columnGap, y, columnWidth);
    y += fieldGap;
    drawField(labels?.type || "Tilaustyyppi / Order type", order.order_type === "delivery" ? (labels?.delivery || "Kotiinkuljetus / Home delivery") : (labels?.takeaway || "Nouto / Takeaway"), left, y, columnWidth);
    drawField(labels ? (order.order_type === "delivery" ? labels.preferredDelivery : labels.preferredTakeaway) : `Toivottu ${order.order_type === "delivery" ? "toimitusaika" : "noutoaika"} / Preferred time`, String(order.preferred_time || "—").slice(0, 5), left + columnWidth + columnGap, y, columnWidth);
    y += fieldGap;
    if (order.delivery_address) {
      drawField(labels?.address || "Toimitusosoite / Delivery address", order.delivery_address, left, y, contentWidth);
      y += fieldGap;
    }
    if (customerNotes) {
      drawField(labels?.instructions || "Lisätiedot / Instructions", customerNotes, left, y, contentWidth);
      y += fieldGap;
    }

    const adminRemark = String(order.admin_remark || "").trim();
    if (adminRemark && !onePage) {
      drawField(labels?.customerNote || "Asiakkaan huomio / Customer note", adminRemark, left, y, contentWidth);
      y += fieldGap;
    }
    doc.font("Helvetica-Bold").fontSize(12).fillColor(maroon).text(labels?.items || "TUOTTEET / ITEMS", left, y + 2);
    y += 22;
    const tableHeaderHeight = onePage ? 18 : 22;
    doc.rect(left, y, contentWidth, tableHeaderHeight).fill(maroon);
    doc.font("Helvetica-Bold").fontSize(onePage ? 7 : 8.5).fillColor("#FFFFFF");
    printText(labels?.item || "Tuote / Item", left + 7, y + (onePage ? 5 : 7), 260, { height: 10 });
    printText(labels?.quantity || "Määrä / Qty", left + 278, y + (onePage ? 5 : 7), 48, { height: 10, align: "right" });
    printText(labels?.price || "Hinta / Price", left + 337, y + (onePage ? 5 : 7), 70, { height: 10, align: "right" });
    printText(labels?.lineTotal || "Yhteensä / Total", left + 414, y + (onePage ? 5 : 7), 92, { height: 10, align: "right" });
    y += tableHeaderHeight;
    const compactRows = onePage && items.length > 20;
    const reservedFooterHeight = onePage ? 105 + (Number(order.discount_amount || 0) > 0 ? 14 : 0) : 0;
    const availableRowsHeight = onePage ? Math.max(items.length * 5, doc.page.height - 55 - y - reservedFooterHeight) : Infinity;
    const itemNameWidth = 260;
    const preferredItemFontSize = onePage ? (compactRows ? 6.5 : 8) : items.length > 20 ? 7 : 8.5;
    let itemFontSize = preferredItemFontSize;
    const getItemRowHeights = (fontSize) => items.map((item) => {
      doc.font("Helvetica").fontSize(fontSize);
      const nameHeight = doc.heightOfString(String(item.item_name || "—"), { width: itemNameWidth, lineGap: 0 });
      return Math.max(fontSize + 4, nameHeight + 4);
    });
    let itemRowHeights = getItemRowHeights(itemFontSize);
    if (onePage) {
      // Keep every character of long combo names visible. Reduce the item font only as
      // much as needed to fit wrapped names and totals on the single-page receipt.
      while (itemFontSize > 5 && itemRowHeights.reduce((sum, height) => sum + height, 0) > availableRowsHeight) {
        itemFontSize = Math.max(5, itemFontSize - 0.5);
        itemRowHeights = getItemRowHeights(itemFontSize);
      }
    }
    for (const [index, item] of items.entries()) {
      const rowHeight = itemRowHeights[index];
      if (index % 2 === 1) doc.rect(left, y, contentWidth, rowHeight).fill("#FCF8F2");
      doc.font("Helvetica").fontSize(itemFontSize).fillColor(ink);
      const textY = y + Math.max(2, (rowHeight - itemFontSize) / 2);
      printText(item.item_name, left + 7, y + 2, itemNameWidth, {
        height: Math.max(itemFontSize + 2, rowHeight - 2),
        lineBreak: true,
        ellipsis: false,
      });
      printText(item.quantity, left + 278, textY, 48, { height: itemFontSize + 2, align: "right" });
      printText(`€${money(item.unit_price)}`, left + 337, textY, 70, { height: itemFontSize + 2, align: "right" });
      printText(`€${money(item.line_total)}`, left + 414, textY, 92, { height: itemFontSize + 2, align: "right" });
      doc.moveTo(left, y + rowHeight).lineTo(right, y + rowHeight).lineWidth(0.4).strokeColor("#E9DFD1").stroke();
      y += rowHeight;
    }
    y += onePage ? 5 : 10;
    doc.font("Helvetica").fontSize(onePage ? 8 : 9).fillColor(ink);
    printText(`${labels?.subtotal || "Ruokien välisummaa / Food subtotal"}: €${money(subtotal)}`, left, y, contentWidth, { height: 12, align: "right" });
    y += onePage ? 13 : 17;
    if (Number(order.discount_amount || 0) > 0) {
      // PDFKit's built-in Helvetica font does not render the Unicode minus consistently; use an ASCII hyphen.
      printText(`${labels?.discount || "Alennus / Discount"}: - €${money(order.discount_amount)}`, left, y, contentWidth, { height: 12, align: "right" });
      y += onePage ? 14 : 17;
    }
    printText(`${labels?.deliveryCharge || "Kuljetusmaksu / Delivery charge"}: ${deliveryPending ? (labels?.pending || "Vahvistetaan / Pending") : `€${money(order.delivery_charge)}`}`, left, y, contentWidth, { height: 12, align: "right" });
    y += onePage ? 14 : 18;
    const totalBoxHeight = onePage ? 25 : 30;
    doc.roundedRect(left, y, contentWidth, totalBoxHeight, 4).fill("#FFF0CC");
    doc.font("Helvetica-Bold").fontSize(onePage ? 12 : 14).fillColor(maroon).text(`${labels?.total || "YHTEENSÄ / TOTAL"}: €${total}`, left + 10, y + (onePage ? 6 : 7), { width: contentWidth - 20, align: "right" });
    y += onePage ? 31 : 39;
    const statusText = labels
      ? (order.order_status === "pending" ? labels.pending : labels.confirmed)
      : "Vahvistettu / Confirmed";
    doc.font("Helvetica-Bold").fontSize(onePage ? 8 : 9).fillColor(maroon).text(`${labels?.status || "Tilauksen tila / Order status"}: ${statusText}`, left, y, { width: contentWidth });
    y += onePage ? 14 : 18;
    doc.font("Helvetica-Bold").fontSize(onePage ? 8 : 9).fillColor(maroon).text(labels?.thankYou || "Kiitos, kun tilasit Desi Dawatista! / Thank you for ordering from Desi Dawat!", left, Math.min(y, doc.page.height - 55), { width: contentWidth, align: "center" });

    if (includePaymentPage) {
    // Page 2 repeats the same centered letterhead stamp.
    doc.addPage({ size: "A4", margin: 40 });
    if (fs.existsSync(logoPath)) doc.image(logoPath, logoX, 20, { width: brandLogoSize, height: brandLogoSize });
    doc.font("Helvetica-Bold").fontSize(17).fillColor(maroon).text(LETTERHEAD.name, left, 73, { width: contentWidth, align: "center" });
    doc.font("Helvetica-Bold").fontSize(10).fillColor(ink).text(LETTERHEAD.finnish, left, 96, { width: contentWidth, align: "center" });
    doc.font("Helvetica-Bold").fontSize(10).fillColor(ink).text(LETTERHEAD.english, left, 110, { width: contentWidth, align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor(muted).text(LETTERHEAD.address, left, 126, { width: contentWidth, align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor(muted).text(`Puh. / Tel. ${LETTERHEAD.phone}`, left, 139, { width: contentWidth, align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor(muted).text(`Email: ${LETTERHEAD.email}`, left, 152, { width: contentWidth, align: "center" });
    doc.font("Helvetica-Bold").fontSize(13).fillColor(maroon).text("MAKSUTAVAT / PAYMENT OPTIONS", left, 174, { width: contentWidth, align: "center" });
    doc.font("Helvetica").fontSize(10).fillColor(muted).text(`Kuitti / Receipt #${receiptNumber} · Maksettava / Amount due: €${total}`, left, 196, { width: contentWidth, align: "center" });
    doc.moveTo(left, 218).lineTo(right, 218).lineWidth(1).strokeColor(gold).stroke();

    drawPaymentOption("1. Käteinen toimituksen tai noudon yhteydessä / Pay on delivery or pickup", [
      `Maksa €${total}, kun tilaus toimitetaan tai noudetaan.`,
      `Please pay €${total} when your order is delivered or collected.`,
    ], left, 232, contentWidth, 84);
    drawPaymentOption("2. Tilisiirto / Bank transfer", [
      "Tilinomistaja / Account holder: Ruchi Srivastava · OP Bank, Finland",
      "IBAN: FI6157445020094271",
      "BIC/SWIFT: OKOYFIHH",
      `Siirrä €${total}. / Please transfer €${total}.`,
      "Näytä maksuvahvistus noudon tai toimituksen yhteydessä. / Show payment confirmation at pickup or delivery.",
    ], left, 326, contentWidth, 142);
    doc.roundedRect(left, 484, contentWidth, 315, 6).fillAndStroke("#FFFFFF", "#DADCE0");
    doc.font("Helvetica-Bold").fontSize(12).fillColor(maroon).text("3. MobilePay QR", left + 14, 498, { width: contentWidth - 28 });
    if (fs.existsSync(qrPath)) doc.image(qrPath, left + 18, 524, { fit: [264, 264] });
    doc.font("Helvetica").fontSize(10).fillColor(ink).text(`Skannaa ja maksa €${total}. Näytä maksuvahvistus noudon tai toimituksen yhteydessä.\n\nScan to pay €${total}. Please show payment confirmation during delivery or pickup.`, left + 220, 541, { width: contentWidth - 240, height: 100 });
    doc.font("Helvetica").fontSize(9).fillColor(muted).text(`${LETTERHEAD.name} · ${LETTERHEAD.address} · ${LETTERHEAD.phone}`, left, 812, { width: contentWidth, align: "center" });
    }

    doc.end();
  });
}

app.post("/api/orders", (req, res, next) => {
  if (req.headers.authorization === undefined) return next();
  return requireCustomer(req, res, next);
}, async (req, res) => {
  const {
  customer_name,
  customer_phone,
  order_type,
  payment_method,
  delivery_address,
  preferred_time,
  delivery_charge_manual_review,
  customer_notes,
  apply_signup_offer,
  apply_birthday_offer,
  apply_surprise_reward_id,
  items,
} = req.body || {};

  if (apply_signup_offer === true && !req.customer) {
    return res.status(403).json({ error: "Sign in to use the sign-up offer." });
  }
  if (apply_birthday_offer === true && !req.customer) {
    return res.status(403).json({ error: "Sign in to use the birthday offer." });
  }
  if (apply_surprise_reward_id != null && !req.customer) {
    return res.status(403).json({ error: "Sign in to use a surprise reward." });
  }
  if (apply_surprise_reward_id != null && (apply_signup_offer === true || apply_birthday_offer === true)) {
    return res.status(400).json({ error: "Use one customer offer per order." });
  }

  const validName = typeof customer_name === "string" &&
    customer_name.trim().length >= 2 && customer_name.trim().length <= 120 &&
    /^[\p{L}\p{M}\s'-]+$/u.test(customer_name.trim());
  const validPhone = typeof customer_phone === "string" &&
    /^[+]?[0-9\s()-]{7,30}$/.test(customer_phone.trim()) &&
    customer_phone.replace(/\D/g, "").length >= 7;
  if (
    !validName || !validPhone ||
    (delivery_address != null && (typeof delivery_address !== "string" || delivery_address.length > 500)) ||
    typeof preferred_time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(preferred_time) ||
    (customer_notes != null && (typeof customer_notes !== "string" || customer_notes.length > 1000)) ||
    !Array.isArray(items) || items.length === 0 || items.length > 50
  ) {
    return res.status(400).json({ message: "Please provide valid customer and order details." });
  }

  if (
    !["delivery", "takeaway"].includes(order_type) ||
    // Payment options: allow delivery/pickup, bank transfer, and MobilePay QR.
    !["mobile_scan_pay", "iban_transfer", "pay_on_delivery"].includes(payment_method) ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return res.status(400).json({
      message: "Please provide valid customer and order details.",
    });
  }

  if (order_type === "delivery" && (!delivery_address?.trim() || delivery_address.trim().length < 6)) {
    return res.status(400).json({
      message: "Delivery address is required.",
    });
  }

  let openingRows = [];
  try {
    [openingRows] = await pool.query(
      `SELECT day_key, morning_open, morning_close, morning_closed,
              evening_open, evening_close, evening_closed
       FROM opening_hours`
    );
  } catch (error) {
    console.error("Opening hours unavailable; saving the order for restaurant review:", error.code || "UNKNOWN");
  }
  const acceptanceDecision = getPreferredOrderDecision(openingRows, preferred_time, new Date(), order_type);
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    let customerId = null;
    let signupOfferAvailable = false;
    let birthdayOfferYear = null;
    let surpriseReward = null;
    if (req.customer) {
      const [accounts] = await connection.execute(
        `SELECT customer_id, signup_offer_used_at, DATE_FORMAT(date_of_birth, '%Y-%m-%d') AS date_of_birth,
                birthday_offer_used_year FROM customers WHERE customer_id = ? AND is_registered = TRUE FOR UPDATE`,
        [Number(req.customer.customer_id)]
      );
      if (!accounts.length) {
        await connection.rollback();
        return res.status(401).json({ error: "Your customer account is no longer available. Please sign in again." });
      }
      customerId = accounts[0].customer_id;
      signupOfferAvailable = accounts[0].signup_offer_used_at === null;
      birthdayOfferYear = getBirthdayOfferYear(accounts[0]);
      if (apply_surprise_reward_id == null && apply_birthday_offer === true && !birthdayOfferYear) {
        await connection.rollback();
        return res.status(409).json({
          code: "BIRTHDAY_OFFER_CHANGED",
          error: "Your birthday offer availability has changed. Review the updated total before placing your order.",
        });
      }
      if (!birthdayOfferYear && apply_signup_offer === true && !signupOfferAvailable) {
        await connection.rollback();
        return res.status(409).json({
          code: "SIGNUP_OFFER_UNAVAILABLE",
          error: "Your sign-up offer has already been used. Review the updated total before placing your order.",
        });
      }
      if (apply_surprise_reward_id != null) {
        const rewardId = Number(apply_surprise_reward_id);
        if (!Number.isInteger(rewardId) || rewardId < 1) {
          await connection.rollback();
          return res.status(400).json({ error: "Choose a valid surprise reward." });
        }
        const [rewardRows] = await connection.execute(
          `SELECT reward_id, reward_type, reward_value, addon_item_id
           FROM customer_surprise_rewards
           WHERE reward_id = ? AND customer_id = ? AND redeemed_at IS NULL AND expires_at > NOW()
           FOR UPDATE`,
          [rewardId, customerId]
        );
        if (!rewardRows.length) {
          await connection.rollback();
          return res.status(409).json({ code: "SURPRISE_REWARD_UNAVAILABLE", error: "That surprise reward has expired or was already used. Review your available offers." });
        }
        surpriseReward = rewardRows[0];
      }
    } else {
      await connection.execute(
        `INSERT INTO customers
         (customer_name, customer_phone, phone_normalized, delivery_address)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           customer_name = IF(is_registered = FALSE, VALUES(customer_name), customer_name),
           customer_phone = IF(is_registered = FALSE, VALUES(customer_phone), customer_phone),
           delivery_address = IF(is_registered = FALSE, COALESCE(VALUES(delivery_address), delivery_address), delivery_address),
           is_archived = IF(is_registered = FALSE, FALSE, is_archived)`,
        [
          customer_name.trim(),
          customer_phone.trim(),
          normalizeCustomerPhone(customer_phone),
          order_type === "delivery" ? delivery_address.trim() : null,
        ]
      );
    }

    let totalAmount = 0;
    const orderItems = [];

    for (const cartItem of items) {
      const itemId = Number(cartItem.item_id);
      const quantity = Number(cartItem.quantity);

      if (
        !Number.isInteger(itemId) ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 100
      ) {
        const invalidItemError = new Error("Invalid dish or quantity.");
        invalidItemError.statusCode = 400;
        throw invalidItemError;
      }

      const [rows] = await connection.execute(
        `SELECT item_id, item_name, display_code, price_eur
         FROM menu_items
         WHERE item_id = ? AND is_available = 1`,
        [itemId]
      );

      if (rows.length === 0) {
        const unavailableItemError = new Error("A selected dish is unavailable.");
        unavailableItemError.statusCode = 409;
        throw unavailableItemError;
      }

      const dish = rows[0];
      const unitPrice = Number(dish.price_eur);
      const lineTotal = Number((unitPrice * quantity).toFixed(2));

      totalAmount += lineTotal;

      orderItems.push({
        item_id: dish.item_id,
        item_name: dish.display_code ? `${dish.item_name} (${dish.display_code})` : dish.item_name,
        quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
      });
    }

    totalAmount = Number(totalAmount.toFixed(2));
    let deliveryCharge = 0;
    let deliveryDistanceKm = null;
    let deliveryChargePendingManualReview =
      order_type === "delivery" && delivery_charge_manual_review === true;
    if (order_type === "delivery" && !deliveryChargePendingManualReview) {
      try {
        const quote = await calculateDesiDawatDeliveryQuote(delivery_address, totalAmount);
        deliveryCharge = quote.delivery_charge;
        deliveryDistanceKm = quote.distance_km;
      } catch (quoteError) {
        if (!["DELIVERY_ROUTE_UNAVAILABLE", "DELIVERY_OUT_OF_AREA"].includes(quoteError.code)) throw quoteError;
        // Save the order for staff to verify the address and set its delivery fee before accepting it.
        deliveryChargePendingManualReview = true;
        console.warn("Delivery route unavailable; order saved for manual fee review:", quoteError.message);
      }
    }
    const foodSubtotal = totalAmount;
    let rewardAddonItem = null;
    if (surpriseReward?.reward_type === "addon") {
      if (!surpriseReward.addon_item_id) {
        await connection.rollback();
        return res.status(409).json({ code: "SURPRISE_REWARD_UNAVAILABLE", error: "This add-on reward is no longer available. Please contact the restaurant." });
      }
      const [addonRows] = await connection.execute(
        `SELECT menu_items.item_id, menu_items.item_name
         FROM menu_items
         JOIN surprise_reward_addon_items ON surprise_reward_addon_items.item_id = menu_items.item_id
         WHERE menu_items.item_id = ? AND menu_items.is_available = 1`,
        [surpriseReward.addon_item_id]
      );
      if (!addonRows.length) {
        await connection.rollback();
        return res.status(409).json({ code: "SURPRISE_REWARD_UNAVAILABLE", error: "The add-on dish is no longer available. Review your offers or contact the restaurant." });
      }
      rewardAddonItem = addonRows[0];
      orderItems.push({ item_id: rewardAddonItem.item_id, item_name: rewardAddonItem.item_name, quantity: 1, unit_price: 0, line_total: 0 });
    }
    const offerPercent = surpriseReward?.reward_type === "percent" ? Number(surpriseReward.reward_value)
      : surpriseReward ? 0
        : apply_birthday_offer === true && birthdayOfferYear ? BIRTHDAY_DISCOUNT_PERCENT
          : apply_signup_offer === true && signupOfferAvailable ? SIGNUP_DISCOUNT_PERCENT : 0;
    const discountAmount = Math.round(Math.round(foodSubtotal * 100) * offerPercent / 100) / 100;
    const discountPercent = discountAmount > 0 ? offerPercent : 0;
    totalAmount = Number((foodSubtotal - discountAmount + deliveryCharge).toFixed(2));

    // Keep restaurant review details visible to staff in the Admin order notes.
    const persistedCustomerNotes = [
      customer_notes?.trim(),
      deliveryChargePendingManualReview ? "DELIVERY CHARGE PENDING MANUAL REVIEW — verify the address and confirm the fee with the customer." : null,
      !acceptanceDecision.confirmed ? `ORDER REVIEW REQUIRED: ${acceptanceDecision.code} — ${acceptanceDecision.reason}` : null,
    ].filter(Boolean).join("\n") || null;
    const [orderResult] = await connection.execute(
      `INSERT INTO customer_orders
       (customer_id, customer_name, customer_phone, order_type, payment_method,
        delivery_address, preferred_time, customer_notes, delivery_charge,
        delivery_distance_km, discount_percent, discount_amount, total_amount, order_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerId,
        customer_name.trim(),
        customer_phone.trim(),
        order_type,
        payment_method,
        order_type === "delivery" ? delivery_address.trim() : null,
        preferred_time,
        persistedCustomerNotes,
        deliveryCharge,
        deliveryDistanceKm,
        discountPercent,
        discountAmount,
        totalAmount,
        acceptanceDecision.confirmed ? "confirmed" : "pending",
      ]
    );

    const orderId = orderResult.insertId;

    for (const item of orderItems) {
      await connection.execute(
        `INSERT INTO customer_order_items
         (order_id, item_id, item_name, quantity,
          unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          item.item_id,
          item.item_name,
          item.quantity,
          item.unit_price,
          item.line_total,
        ]
      );
    }

    if (!surpriseReward && discountAmount > 0 && apply_birthday_offer === true && birthdayOfferYear) {
      await connection.execute(
        "UPDATE customers SET birthday_offer_used_year = ? WHERE customer_id = ?",
        [birthdayOfferYear, customerId]
      );
    } else if (!surpriseReward && discountAmount > 0) {
      await connection.execute(
        "UPDATE customers SET signup_offer_used_at = CURRENT_TIMESTAMP WHERE customer_id = ?",
        [customerId]
      );
    }

    if (surpriseReward) {
      await connection.execute(
        `UPDATE customer_surprise_rewards
         SET redeemed_at = CURRENT_TIMESTAMP, redemption_order_id = ?
         WHERE reward_id = ? AND redeemed_at IS NULL`,
        [orderId, surpriseReward.reward_id]
      );
    }

    let earnedSurpriseReward = null;
    if (req.customer && foodSubtotal > 30) {
      const [[rewardSettings]] = await connection.query(
        "SELECT validity_days, cycle_config FROM surprise_reward_settings WHERE settings_id = 1 FOR UPDATE"
      );
      if (!rewardSettings) throw new Error("Surprise reward settings are not configured. Apply database migration 018.");
      let cycleConfig = rewardSettings.cycle_config;
      if (typeof cycleConfig === "string") cycleConfig = JSON.parse(cycleConfig);
      cycleConfig = normalizeRewardCycle(cycleConfig);
      if (!cycleConfig) throw new Error("Surprise reward cycle settings are invalid.");
      const [[sequence]] = await connection.query(
        "SELECT qualifying_order_count FROM surprise_reward_state WHERE state_id = 1 FOR UPDATE"
      );
      const nextCount = Number(sequence?.qualifying_order_count || 0) + 1;
      const sequencePosition = ((nextCount - 1) % 15) + 1;
      await connection.execute(
        "UPDATE surprise_reward_state SET qualifying_order_count = ? WHERE state_id = 1",
        [nextCount]
      );

      const cycleSlot = cycleConfig[sequencePosition - 1];
      let rewardType = cycleSlot.type;
      let rewardValue;
      let addonItemId = null;
      if (cycleSlot.type === "percent") {
        rewardValue = randomInt(cycleSlot.min, cycleSlot.max + 1);
      } else {
        const [choices] = await connection.query(
          `SELECT menu_items.item_id FROM menu_items
           JOIN surprise_reward_addon_items ON surprise_reward_addon_items.item_id = menu_items.item_id
           WHERE menu_items.is_available = 1`
        );
        if (choices.length) addonItemId = choices[randomInt(0, choices.length)].item_id;
      }

      if (rewardType !== "addon" || addonItemId != null) {
        const [rewardResult] = await connection.execute(
          `INSERT INTO customer_surprise_rewards
           (sequence_position, customer_id, qualifying_order_id, reward_type, reward_value, addon_item_id, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? DAY))`,
          [sequencePosition, customerId, orderId, rewardType, rewardValue ?? null, addonItemId, Number(rewardSettings.validity_days)]
        );
        const [rewardDetails] = await connection.execute(
          `SELECT reward_id, sequence_position, reward_type, reward_value,
                  addon_item_id, menu_items.item_name AS addon_item_name, expires_at
           FROM customer_surprise_rewards
           LEFT JOIN menu_items ON menu_items.item_id = customer_surprise_rewards.addon_item_id
           WHERE reward_id = ?`,
          [rewardResult.insertId]
        );
        earnedSurpriseReward = rewardDetails[0] || null;
      }
    }

    const receiptToken = acceptanceDecision.confirmed
      ? jwt.sign(
          { orderId: Number(orderId), purpose: "customer-receipt" },
          process.env.JWT_SECRET,
          { expiresIn: "30d" }
        )
      : null;
    await connection.commit();

    let receiptNumber = null;
    if (acceptanceDecision.confirmed) {
      // Match the Admin receipt number (position in its created-at ordered list).
      try {
        const [receiptNumberRows] = await pool.execute(
          `SELECT COUNT(*) AS receipt_number
           FROM customer_orders AS candidate
           JOIN customer_orders AS target ON target.order_id = ?
           WHERE candidate.created_at < target.created_at
              OR (candidate.created_at = target.created_at AND candidate.order_id <= target.order_id)`,
          [orderId]
        );
        receiptNumber = Number(receiptNumberRows[0]?.receipt_number) || Number(orderId);
      } catch (receiptNumberError) {
        console.error("Order accepted but receipt sequence lookup failed:", receiptNumberError.code || "UNKNOWN");
        receiptNumber = Number(orderId);
      }
    }

    return res.status(201).json({
      message: acceptanceDecision.confirmed
        ? "Your order has been placed and accepted. / Tilauksesi on tehty ja hyväksytty."
        : "Your order request was received and is waiting for restaurant confirmation. / Tilauspyyntösi vastaanotettiin ja odottaa ravintolan vahvistusta.",
      order_id: orderId,
      ...(acceptanceDecision.confirmed ? { receipt_number: receiptNumber, receipt_token: receiptToken } : {}),
      order_status: acceptanceDecision.confirmed ? "confirmed" : "pending",
      confirmation_reason: acceptanceDecision.confirmed ? null : acceptanceDecision.reason,
      food_subtotal: foodSubtotal,
      delivery_charge: deliveryCharge,
      discount_amount: discountAmount,
      earned_surprise_reward: earnedSurpriseReward,
      total_amount: totalAmount,
      delivery_charge_pending_manual_review: deliveryChargePendingManualReview,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Order creation failed:", error.code || "ORDER_SAVE_FAILED");

    return res.status(error.statusCode || 500).json({
      message: error.statusCode && error.statusCode < 500 ? error.message : "Could not save the order. Please try again.",
      code: error.statusCode && error.statusCode < 500 ? (error.code || "INVALID_ORDER") : "ORDER_SAVE_FAILED",
    });
  } finally {
    connection?.release();
  }
});

/* Signed, order-specific customer receipt download; the signed token grants access only to this order. */
app.get("/api/orders/:id/receipt", async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId) || orderId < 1) return res.status(400).send("Invalid order number.");

  let tokenPayload;
  try {
    tokenPayload = jwt.verify(String(req.query.token || ""), process.env.JWT_SECRET);
  } catch {
    return res.status(401).send("This receipt link is invalid or has expired. Please contact Desi Dawat for a new copy.");
  }
  if (tokenPayload.purpose !== "customer-receipt" || Number(tokenPayload.orderId) !== orderId) {
    return res.status(403).send("This receipt link does not match the order.");
  }

  try {
    const [orderRows] = await pool.execute(
      `SELECT order_id, customer_name, customer_phone, order_type, delivery_address, preferred_time,
              customer_notes, delivery_charge, discount_amount, total_amount,
              admin_remark,
              order_status, created_at
       FROM customer_orders WHERE order_id = ? LIMIT 1`,
      [orderId]
    );
    if (!orderRows.length) return res.status(404).send("Order not found.");
    const [itemRows] = await pool.execute(
      `SELECT item_name, quantity, unit_price, line_total
       FROM customer_order_items WHERE order_id = ? ORDER BY order_item_id`,
      [orderId]
    );
    const [receiptNumberRows] = await pool.execute(
      `SELECT COUNT(*) AS receipt_number
       FROM customer_orders AS candidate
       JOIN customer_orders AS target ON target.order_id = ?
       WHERE candidate.created_at < target.created_at
          OR (candidate.created_at = target.created_at AND candidate.order_id <= target.order_id)`,
      [orderId]
    );
    const receiptNumber = Number(receiptNumberRows[0]?.receipt_number) || orderId;
    const receiptPdf = await buildCustomerReceiptPdf(orderRows[0], itemRows, receiptNumber);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=desi-dawat-receipt-${receiptNumber}.pdf`);
    res.setHeader("Content-Length", receiptPdf.length);
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(receiptPdf);
  } catch (error) {
    console.error("GET customer receipt failed:", error.code || "UNKNOWN");
    return res.status(500).send("Could not generate this receipt. Please contact Desi Dawat.");
  }
});

/* Admin PDF receipt: use the same branded PDF renderer available to customer receipt links. */
app.get("/api/admin/orders/:id/receipt.pdf", requireAdmin, async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId) || orderId < 1) return res.status(400).send("Invalid order number.");
  try {
    const [orderRows] = await pool.execute(
      `SELECT order_id, customer_name, customer_phone, payment_method, order_type, delivery_address,
              preferred_time, customer_notes, delivery_charge, discount_percent, discount_amount,
              total_amount, admin_remark, order_status, created_at
       FROM customer_orders WHERE order_id = ? LIMIT 1`,
      [orderId]
    );
    if (!orderRows.length) return res.status(404).send("Order not found.");
    const [itemRows] = await pool.execute(
      `SELECT item_name, quantity, unit_price, line_total
       FROM customer_order_items WHERE order_id = ? ORDER BY order_item_id`,
      [orderId]
    );
    const [receiptNumberRows] = await pool.execute(
      `SELECT COUNT(*) AS receipt_number
       FROM customer_orders AS candidate
       JOIN customer_orders AS target ON target.order_id = ?
       WHERE candidate.created_at < target.created_at
          OR (candidate.created_at = target.created_at AND candidate.order_id <= target.order_id)`,
      [orderId]
    );
    const receiptNumber = Number(receiptNumberRows[0]?.receipt_number) || orderId;
    const receiptPdf = await buildCustomerReceiptPdf(orderRows[0], itemRows, receiptNumber);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=desi-dawat-receipt-${receiptNumber}.pdf`);
    res.setHeader("Content-Length", receiptPdf.length);
    res.setHeader("Cache-Control", "private, no-store");
    return res.send(receiptPdf);
  } catch (error) {
    console.error("GET admin PDF receipt failed:", error.code || "UNKNOWN");
    return res.status(500).send("Could not generate this receipt. Please contact Desi Dawat.");
  }
});


/* Admin: list customer orders with their ordered dishes. */
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const [orders] = await pool.query(`
      SELECT
        o.order_id,
        o.customer_id,
        c.is_registered,
        c.login_email,
        o.customer_name,
        o.customer_phone,
        o.payment_method,
        o.order_type,
        o.delivery_address,
        o.preferred_time,
        o.customer_notes,
        o.admin_remark,
        o.delivery_charge,
        o.discount_percent,
        o.discount_amount,
        o.delivery_distance_km,
        o.total_amount,
        o.order_status,
        o.created_at
      FROM customer_orders AS o
      LEFT JOIN customers AS c ON c.customer_id = o.customer_id
      ORDER BY o.created_at ASC, o.order_id ASC
    `);
orders.forEach((order, index) => {
  order.receipt_number = index + 1;
});

    for (const order of orders) {
            const [items] = await pool.query(
        `SELECT order_items.item_id, menu_items.display_code, order_items.item_name,
                order_items.quantity, order_items.unit_price, order_items.line_total
         FROM customer_order_items AS order_items
         LEFT JOIN menu_items ON menu_items.item_id = order_items.item_id
         WHERE order_items.order_id = ?
         ORDER BY order_items.order_item_id`,
        [order.order_id]
      );

      order.items = items;
    }

    res.json(orders);
  } catch (error) {
    console.error("GET /api/admin/orders:", error);
    res.status(500).json({
      error: "Could not load customer orders.",
    });
  }
});

app.put("/api/admin/orders/:id/remark", requireAdmin, async (req, res) => {
  const orderId = Number(req.params.id);
  const remark = String(req.body?.admin_remark || "").trim().slice(0, 1000);
  if (!Number.isInteger(orderId) || orderId < 1) return res.status(400).json({ error: "Invalid order number." });
  try {
    const [result] = await pool.execute("UPDATE customer_orders SET admin_remark = ? WHERE order_id = ?", [remark || null, orderId]);
    if (!result.affectedRows) return res.status(404).json({ error: "Order not found." });
    return res.json({ order_id: orderId, admin_remark: remark });
  } catch (error) {
    console.error("Save order remark failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: "Could not save the order remark." });
  }
});

/* Admin: list saved customer profiles with lifetime order statistics. */
app.get("/api/admin/customers", requireAdmin, async (_req, res) => {
  try {
    const [customers] = await pool.query(`
      SELECT
        c.customer_id,
        c.customer_name,
        c.customer_phone,
        c.email,
        c.login_email,
        c.is_registered,
        c.delivery_address,
        c.is_archived,
        c.created_at,
        COALESCE(registered_stats.order_count, 0) + COALESCE(guest_stats.order_count, 0) AS order_count,
        COALESCE(registered_stats.total_spent, 0) + COALESCE(guest_stats.total_spent, 0) AS total_spent,
        CASE
          WHEN registered_stats.last_order_at IS NULL THEN guest_stats.last_order_at
          WHEN guest_stats.last_order_at IS NULL THEN registered_stats.last_order_at
          WHEN registered_stats.last_order_at >= guest_stats.last_order_at THEN registered_stats.last_order_at
          ELSE guest_stats.last_order_at
        END AS last_order_at
      FROM customers AS c
      LEFT JOIN (
        SELECT customer_id, SUM(order_status <> 'cancelled') AS order_count,
               SUM(CASE WHEN order_status <> 'cancelled' THEN total_amount ELSE 0 END) AS total_spent,
               MAX(CASE WHEN order_status <> 'cancelled' THEN created_at ELSE NULL END) AS last_order_at
        FROM customer_orders
        WHERE customer_id IS NOT NULL
        GROUP BY customer_id
      ) AS registered_stats ON registered_stats.customer_id = c.customer_id
      LEFT JOIN (
        SELECT normalized_phone, SUM(order_status <> 'cancelled') AS order_count,
               SUM(CASE WHEN order_status <> 'cancelled' THEN total_amount ELSE 0 END) AS total_spent,
               MAX(CASE WHEN order_status <> 'cancelled' THEN created_at ELSE NULL END) AS last_order_at
        FROM (
          SELECT order_status, total_amount, created_at,
                 REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(customer_phone), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '') AS normalized_phone
          FROM customer_orders
          WHERE customer_id IS NULL AND customer_phone IS NOT NULL AND TRIM(customer_phone) <> ''
        ) AS order_phone
        GROUP BY normalized_phone
      ) AS guest_stats ON guest_stats.normalized_phone = c.phone_normalized
      ORDER BY c.is_archived ASC, c.customer_name ASC, c.customer_id ASC
    `);
    return res.json(customers);
  } catch (error) {
    console.error("GET /api/admin/customers failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: "Could not load customer profiles. Apply the customer management database migration and try again." });
  }
});

/* Admin: manually add a customer profile, including customers with no orders. */
app.post("/api/admin/customers", requireAdmin, async (req, res) => {
  const name = typeof req.body?.customer_name === "string" ? req.body.customer_name.trim() : "";
  const phone = typeof req.body?.customer_phone === "string" ? req.body.customer_phone.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  const address = typeof req.body?.delivery_address === "string" ? req.body.delivery_address.trim() : "";
  const normalizedPhone = normalizeCustomerPhone(phone);
  const validPhone = /^[+]?[0-9\s().-]{7,30}$/.test(phone) && normalizedPhone.length >= 7 && normalizedPhone.length <= 32;
  const validEmail = !email || (email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (name.length < 2 || name.length > 120 || !validPhone || !validEmail || address.length > 500) {
    return res.status(400).json({ error: "Enter a name, valid phone number, and optional valid email and address." });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO customers (customer_name, customer_phone, phone_normalized, email, delivery_address)
       VALUES (?, ?, ?, ?, ?)`,
      [name, phone, normalizedPhone, email || null, address || null]
    );
    return res.status(201).json({
      message: "Customer added.",
      customer_id: result.insertId,
      customer_name: name,
      customer_phone: phone,
      email: email || null,
      delivery_address: address || null,
      is_archived: 0,
      order_count: 0,
      total_spent: 0,
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ error: "A customer with this phone number already exists." });
    }
    console.error("POST /api/admin/customers failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: "Could not add the customer." });
  }
});

/* Customer removal is reversible: archive the profile and keep all order history. */
app.put("/api/admin/customers/:id/archive", requireAdmin, async (req, res) => {
  const customerId = Number(req.params.id);
  if (!Number.isInteger(customerId) || customerId < 1) return res.status(400).json({ error: "Invalid customer ID." });
  try {
    const [result] = await pool.execute("UPDATE customers SET is_archived = TRUE WHERE customer_id = ?", [customerId]);
    if (!result.affectedRows) return res.status(404).json({ error: "Customer not found." });
    return res.json({ message: "Customer archived. Order history is preserved.", customer_id: customerId });
  } catch (error) {
    console.error("PUT /api/admin/customers/:id/archive failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: "Could not archive the customer." });
  }
});

app.put("/api/admin/customers/:id/restore", requireAdmin, async (req, res) => {
  const customerId = Number(req.params.id);
  if (!Number.isInteger(customerId) || customerId < 1) return res.status(400).json({ error: "Invalid customer ID." });
  try {
    const [result] = await pool.execute("UPDATE customers SET is_archived = FALSE WHERE customer_id = ?", [customerId]);
    if (!result.affectedRows) return res.status(404).json({ error: "Customer not found." });
    return res.json({ message: "Customer restored.", customer_id: customerId });
  } catch (error) {
    console.error("PUT /api/admin/customers/:id/restore failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: "Could not restore the customer." });
  }
});

/* Admin: update a customer's order status. */
app.put(
  "/api/admin/orders/:id/status",
  requireAdmin,
  async (req, res) => {
    const allowedStatuses = [
      "pending",
      "confirmed",
      "preparing",
      "ready",
      "completed",
      "cancelled",
    ];

    const orderId = Number(req.params.id);
    const { order_status } = req.body;

    if (!Number.isInteger(orderId) || orderId < 1) {
      return res.status(400).json({ error: "Invalid order ID." });
    }

    if (!allowedStatuses.includes(order_status)) {
      return res.status(400).json({ error: "Invalid order status." });
    }

    try {
      const [result] = await pool.execute(
        "UPDATE customer_orders SET order_status = ? WHERE order_id = ?",
        [order_status, orderId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: "Order not found." });
      }

      res.json({
        message: "Order status updated successfully.",
        order_id: orderId,
        order_status,
      });
    } catch (error) {
      console.error("PUT /api/admin/orders/:id/status:", error);
      res.status(500).json({
        error: "Could not update order status.",
      });
    }
  }
);

/* Admin: update delivery charge for an order. */
app.put(
  "/api/admin/orders/:id/delivery-charge",
  requireAdmin,
  async (req, res) => {
    const orderId = Number(req.params.id);
    const deliveryCharge = Number(req.body.delivery_charge);

    if (!Number.isInteger(orderId) || orderId < 1) {
      return res.status(400).json({ error: "Invalid order ID." });
    }

    if (
      req.body.delivery_charge === undefined ||
      req.body.delivery_charge === null ||
      req.body.delivery_charge === "" ||
      !Number.isFinite(deliveryCharge) ||
      deliveryCharge < 0 ||
      !Number.isSafeInteger(Math.round(deliveryCharge * 100))
    ) {
      return res.status(400).json({
        error: "Enter a valid delivery charge of €0.00 or more.",
      });
    }

    const roundedCharge = Number(deliveryCharge.toFixed(2));

    try {
      const [orders] = await pool.execute(
        `SELECT order_id, order_type, total_amount, delivery_charge, discount_amount, customer_notes
         FROM customer_orders
         WHERE order_id = ?`,
        [orderId]
      );

      if (orders.length === 0) {
        return res.status(404).json({ error: "Order not found." });
      }

      const order = orders[0];

      if (order.order_type !== "delivery" && roundedCharge !== 0) {
        return res.status(400).json({
          error: "Takeaway orders must have a delivery charge of €0.00.",
        });
      }

      const currentCharge = Number(order.delivery_charge || 0);
      const currentTotal = Number(order.total_amount);
      const foodSubtotal = Number(
        (currentTotal - currentCharge + Number(order.discount_amount || 0)).toFixed(2)
      );

      if (foodSubtotal < 0) {
        return res.status(500).json({
          error: "The existing order total is invalid.",
        });
      }

      const newTotal = Number(
        (foodSubtotal - Number(order.discount_amount || 0) + roundedCharge).toFixed(2)
      );

      // Saving even a €0.00 fee confirms the manual review; remove its marker so receipts show the saved amount.
      const updatedCustomerNotes = String(order.customer_notes || "")
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith("DELIVERY CHARGE PENDING MANUAL REVIEW"))
        .join("\n")
        .trim() || null;

      await pool.execute(
        `UPDATE customer_orders
         SET delivery_charge = ?, total_amount = ?, customer_notes = ?
         WHERE order_id = ?`,
        [roundedCharge, newTotal, updatedCustomerNotes, orderId]
      );

      return res.json({
        message: "Delivery charge updated successfully.",
        order_id: orderId,
        food_subtotal: foodSubtotal,
        delivery_charge: roundedCharge,
        total_amount: newTotal,
      });
    } catch (error) {
      console.error("PUT /api/admin/orders/:id/delivery-charge:", error);

      return res.status(500).json({
        error: "Could not update the delivery charge.",
      });
    }
  }
);


// Order discounts: store a percentage off the food subtotal; delivery remains full price.
app.put("/api/admin/orders/:id/discount", requireAdmin, async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId) || orderId < 1) return res.status(400).json({ error: "Invalid order ID." });
  const discountType = req.body.discount_type === "flat" ? "flat" : "percent";
  const rawValue = discountType === "flat" ? req.body.discount_amount : req.body.discount_percent;
  const discountValue = Number(rawValue);
  if (rawValue === undefined || rawValue === null || rawValue === "" || !Number.isFinite(discountValue) || discountValue < 0 || (discountType === "percent" && discountValue > 100)) {
    return res.status(400).json({ error: discountType === "flat" ? "Enter a valid discount amount of €0.00 or more." : "Discount must be between 0% and 100%." });
  }
  try {
    const [orders] = await pool.execute(
      `SELECT order_id, total_amount, delivery_charge, discount_amount
       FROM customer_orders WHERE order_id = ?`,
      [orderId]
    );
    if (orders.length === 0) return res.status(404).json({ error: "Order not found." });
    const order = orders[0];
    const deliveryCharge = Number(order.delivery_charge || 0);
    const foodSubtotal = Number((Number(order.total_amount) - deliveryCharge + Number(order.discount_amount || 0)).toFixed(2));
    if (foodSubtotal < 0) return res.status(500).json({ error: "The existing order total is invalid." });
    const discountAmount = discountType === "flat"
      ? Number(discountValue.toFixed(2))
      : Number((foodSubtotal * Number(discountValue.toFixed(2)) / 100).toFixed(2));
    if (discountAmount > foodSubtotal) return res.status(400).json({ error: "The discount cannot exceed the food subtotal." });
    const storedPercent = discountType === "flat" ? 0 : Number(discountValue.toFixed(2));
    const newTotal = Number((foodSubtotal - discountAmount + deliveryCharge).toFixed(2));
    await pool.execute(
      `UPDATE customer_orders
       SET discount_percent = ?, discount_amount = ?, total_amount = ?
       WHERE order_id = ?`,
      [storedPercent, discountAmount, newTotal, orderId]
    );
    return res.json({ message: "Order discount saved successfully.", order_id: orderId, discount_type: discountType, discount_percent: storedPercent, discount_amount: discountAmount, food_subtotal: foodSubtotal, delivery_charge: deliveryCharge, total_amount: newTotal });
  } catch (error) {
    console.error("PUT /api/admin/orders/:id/discount:", error);
    return res.status(500).json({ error: "Could not save the order discount." });
  }
});

/* Admin: update the editable receipt details and its item snapshot atomically. */
app.put("/api/admin/orders/:id/edit", requireAdmin, async (req, res) => {
  const orderId = Number(req.params.id);
  const body = req.body || {};
  const customerName = String(body.customer_name || "").trim();
  const customerPhone = String(body.customer_phone || "").trim();
  const orderType = body.order_type;
  const paymentMethod = body.payment_method;
  const preferredTime = String(body.preferred_time || "");
  const deliveryAddress = String(body.delivery_address || "").trim();
  const customerNotes = String(body.customer_notes || "").trim();
  const discountType = body.discount_type === "flat" ? "flat" : "percent";
  const discountValue = Number(body.discount_value || 0);
  const requestedDeliveryCharge = Number(body.delivery_charge || 0);
  if (!Number.isInteger(orderId) || orderId < 1) return res.status(400).json({ error: "Invalid order ID." });
  if (customerName.length < 2 || customerName.length > 120 || !/^[\p{L}\p{M}\s'-]+$/u.test(customerName)) return res.status(400).json({ error: "Enter a valid customer name." });
  if (!/^[+]?[0-9\s()-]{7,30}$/.test(customerPhone) || customerPhone.replace(/\D/g, "").length < 7) return res.status(400).json({ error: "Enter a valid customer phone number." });
  if (!["delivery", "takeaway"].includes(orderType) || !["mobile_scan_pay", "iban_transfer", "pay_on_delivery"].includes(paymentMethod)) return res.status(400).json({ error: "Choose a valid order type and payment method." });
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(preferredTime) || customerNotes.length > 1000) return res.status(400).json({ error: "Enter a valid preferred time and customer note." });
  if (orderType === "delivery" && deliveryAddress.length < 6) return res.status(400).json({ error: "A valid delivery address is required." });
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) return res.status(400).json({ error: "Keep between 1 and 50 menu items on the receipt." });
  if (!Number.isFinite(discountValue) || discountValue < 0 || (discountType === "percent" && discountValue > 100)) return res.status(400).json({ error: "Enter a valid percentage or flat discount." });
  if (!Number.isFinite(requestedDeliveryCharge) || requestedDeliveryCharge < 0) return res.status(400).json({ error: "Enter a valid delivery charge." });

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    const [orders] = await connection.execute("SELECT order_id, delivery_charge FROM customer_orders WHERE order_id = ? FOR UPDATE", [orderId]);
    if (!orders.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Order not found." });
    }
    const deliveryCharge = orderType === "delivery" ? Number(requestedDeliveryCharge.toFixed(2)) : 0;
    const savedItems = [];
    let foodSubtotal = 0;
    for (const entry of body.items) {
      const itemId = Number(entry.item_id);
      const quantity = Number(entry.quantity);
      if (!Number.isInteger(itemId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw Object.assign(new Error("Each item needs a valid quantity."), { statusCode: 400 });
      const [menuRows] = await connection.execute("SELECT item_id, item_name, display_code, price_eur FROM menu_items WHERE item_id = ?", [itemId]);
      if (!menuRows.length) throw Object.assign(new Error("One selected menu item no longer exists."), { statusCode: 409 });
      const unitPrice = Number(menuRows[0].price_eur);
      const lineTotal = Number((unitPrice * quantity).toFixed(2));
      foodSubtotal += lineTotal;
      savedItems.push({ item_id: itemId, item_name: menuRows[0].display_code ? `${menuRows[0].item_name} (${menuRows[0].display_code})` : menuRows[0].item_name, quantity, unit_price: unitPrice, line_total: lineTotal });
    }
    foodSubtotal = Number(foodSubtotal.toFixed(2));
    const discountAmount = discountType === "flat" ? Number(discountValue.toFixed(2)) : Number((foodSubtotal * Number(discountValue.toFixed(2)) / 100).toFixed(2));
    if (discountAmount > foodSubtotal) throw Object.assign(new Error("The discount cannot exceed the food subtotal."), { statusCode: 400 });
    const discountPercent = discountType === "flat" ? 0 : Number(discountValue.toFixed(2));
    const totalAmount = Number((foodSubtotal - discountAmount + deliveryCharge).toFixed(2));
    const normalizedPhone = normalizeCustomerPhone(customerPhone);
    await connection.execute(
      `INSERT INTO customers (customer_name, customer_phone, phone_normalized, delivery_address)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         customer_name = IF(is_registered = FALSE, VALUES(customer_name), customer_name),
         customer_phone = IF(is_registered = FALSE, VALUES(customer_phone), customer_phone),
         delivery_address = IF(is_registered = FALSE, COALESCE(VALUES(delivery_address), delivery_address), delivery_address),
         is_archived = IF(is_registered = FALSE, FALSE, is_archived)`,
      [customerName, customerPhone, normalizedPhone, orderType === "delivery" ? deliveryAddress : null]
    );
    await connection.execute(
      `UPDATE customer_orders SET customer_name = ?, customer_phone = ?, order_type = ?, payment_method = ?, delivery_address = ?, preferred_time = ?, customer_notes = ?, delivery_charge = ?, discount_percent = ?, discount_amount = ?, total_amount = ? WHERE order_id = ?`,
      [customerName, customerPhone, orderType, paymentMethod, orderType === "delivery" ? deliveryAddress : null, preferredTime, customerNotes || null, deliveryCharge, discountPercent, discountAmount, totalAmount, orderId]
    );
    await connection.execute("DELETE FROM customer_order_items WHERE order_id = ?", [orderId]);
    for (const item of savedItems) {
      await connection.execute("INSERT INTO customer_order_items (order_id, item_id, item_name, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?)", [orderId, item.item_id, item.item_name, item.quantity, item.unit_price, item.line_total]);
    }
    await connection.commit();
    return res.json({ message: "Receipt updated successfully.", order_id: orderId, total_amount: totalAmount, delivery_charge: deliveryCharge, discount_amount: discountAmount, discount_percent: discountPercent });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("PUT /api/admin/orders/:id/edit:", error.code || error.message || "UNKNOWN");
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : "Could not update the receipt." });
  } finally {
    connection?.release();
  }
});
/* Admin: delete a customer order. */
app.delete(
  "/api/admin/orders/:id",
  requireAdmin,
  async (req, res) => {
    const orderId = Number(req.params.id);

    if (!Number.isInteger(orderId) || orderId < 1) {
      return res.status(400).json({ error: "Invalid order ID." });
    }

    let connection;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [orders] = await connection.execute(
        "SELECT order_id, customer_phone FROM customer_orders WHERE order_id = ? FOR UPDATE",
        [orderId]
      );

      if (orders.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: "Order not found." });
      }

      await connection.execute(
        "DELETE FROM customer_order_items WHERE order_id = ?",
        [orderId]
      );

      await connection.execute(
        "DELETE FROM customer_orders WHERE order_id = ?",
        [orderId]
      );

      const normalizedPhone = normalizeCustomerPhone(orders[0].customer_phone);
      const [remainingOrders] = await connection.execute(
        `SELECT order_id
         FROM customer_orders
         WHERE REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(customer_phone), ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', '') = ?
         LIMIT 1`,
        [normalizedPhone]
      );
      const customerArchived = remainingOrders.length === 0;
      if (customerArchived) {
        await connection.execute(
          "UPDATE customers SET is_archived = TRUE WHERE phone_normalized = ?",
          [normalizedPhone]
        );
      }

      await connection.commit();

      return res.json({
        message: customerArchived
          ? `Order #${orderId} deleted successfully. Customer archived because no orders remain.`
          : `Order #${orderId} deleted successfully.`,
        order_id: orderId,
        customer_archived: customerArchived,
      });
    } catch (error) {
      if (connection) await connection.rollback();

      console.error("DELETE /api/admin/orders/:id:", error);

      return res.status(500).json({
        error: "Could not delete the order.",
      });
    } finally {
      connection?.release();
    }
  }
);

// Delivery-distance provider settings. Keep the public routing API key in the backend environment only.
const DESI_DAWAT_DELIVERY_ORIGIN = "Lidl Pateniemi, Pateniementie, Oulu, Finland";
const HEIGIT_API_BASE = "https://api.heigit.org";
let cachedDeliveryOriginCoordinates = null;

async function geocodeDeliveryAddress(address, apiKey) {
  const search = new URL(`${HEIGIT_API_BASE}/pelias/v1/search`);
  search.searchParams.set("text", address);
  search.searchParams.set("boundary.country", "FIN");
  search.searchParams.set("size", "1");

  let response;
  try {
    response = await fetch(search, {
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(10000),
    });
  } catch (networkError) {
    console.error("HeiGIT geocoding request failed:", networkError.message);
    const error = new Error("Address lookup is temporarily unavailable. Please try again shortly.");
    error.statusCode = 503;
    error.code = "DELIVERY_ROUTE_UNAVAILABLE";
    throw error;
  }
  const result = await response.json().catch(() => ({}));
  const coordinates = result?.features?.[0]?.geometry?.coordinates;
  if (!response.ok || !Array.isArray(coordinates) || coordinates.length < 2 ||
      !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) {
    console.error("HeiGIT geocoding failed:", response.status, result?.message || "No location returned");
    const error = new Error("We could not locate this address in Finland. Check the address and try again.");
    error.statusCode = 422;
    error.code = "DELIVERY_ROUTE_UNAVAILABLE";
    throw error;
  }

  return coordinates;
}

async function calculateDesiDawatDeliveryQuote(deliveryAddress, foodSubtotal) {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) {
    const error = new Error("Delivery distance service is not configured. Please contact Desi Dawat.");
    error.statusCode = 503;
    error.code = "DELIVERY_ROUTE_UNAVAILABLE";
    throw error;
  }

  const address = String(deliveryAddress || "").trim();
  const subtotal = Number(foodSubtotal);
  if (!address || !Number.isFinite(subtotal) || subtotal < 0) {
    const error = new Error("A valid delivery address and food subtotal are required.");
    error.statusCode = 400;
    throw error;
  }

  if (!cachedDeliveryOriginCoordinates) {
    cachedDeliveryOriginCoordinates = await geocodeDeliveryAddress(DESI_DAWAT_DELIVERY_ORIGIN, apiKey);
  }
  // If a customer omits the city, retry address lookup in Oulu, where this restaurant delivers.
  let destinationCoordinates;
  try {
    destinationCoordinates = await geocodeDeliveryAddress(`${address}, Finland`, apiKey);
  } catch (lookupError) {
    if (lookupError.statusCode !== 422 || /\boulu\b/i.test(address)) throw lookupError;
    destinationCoordinates = await geocodeDeliveryAddress(`${address}, Oulu, Finland`, apiKey);
  }
  let response;
  try {
    response = await fetch(`${HEIGIT_API_BASE}/openrouteservice/v2/directions/driving-car`, {
      method: "POST",
      signal: AbortSignal.timeout(10000),
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({
        coordinates: [cachedDeliveryOriginCoordinates, destinationCoordinates],
        units: "m",
        instructions: false,
      }),
    });
  } catch (networkError) {
    console.error("HeiGIT routing request failed:", networkError.message);
    const error = new Error("Route calculation is temporarily unavailable. Please try again shortly.");
    error.statusCode = 503;
    error.code = "DELIVERY_ROUTE_UNAVAILABLE";
    throw error;
  }

  const result = await response.json().catch(() => ({}));
  const meters = result?.routes?.[0]?.summary?.distance;
  if (!response.ok || !Number.isFinite(meters)) {
    console.error("HeiGIT routing failed:", response.status, result?.error?.message || result?.message || "No route returned");
    const error = new Error("We could not calculate a driving route for this address. Check the address and try again.");
    error.statusCode = 422;
    error.code = "DELIVERY_ROUTE_UNAVAILABLE";
    throw error;
  }

  const distanceKm = Number((meters / 1000).toFixed(2));
  // Keep the distance limit ahead of the €75 free-delivery rule: addresses beyond
  // 15 km are outside the standard delivery area, even for large orders.
  if (meters > 15000) {
    const error = new Error("This address is more than 15 km away from Lidl Pateniemi and is outside our standard delivery area. Please contact us to check availability.");
    error.statusCode = 422;
    error.code = "DELIVERY_OUT_OF_AREA";
    throw error;
  }

  let deliveryCharge = 0;
  let message = "";
  if (subtotal > 75) {
    deliveryCharge = 0;
    message = "Free delivery for food orders above €75.";
  } else if (meters <= 3000) {
    deliveryCharge = subtotal < 15 ? 2 : 0;
    message = subtotal < 15
      ? "€2 delivery for orders below €15 within 3 km."
      : "Free delivery within 3 km for orders of €15 or more.";
  } else if (meters <= 7000) {
    deliveryCharge = 3.5;
    message = "Delivery charge for 3–7 km.";
  } else {
    deliveryCharge = 6;
    message = "Delivery charge for over 7 km and up to 15 km.";
  }

  return {
    distance_km: distanceKm,
    delivery_charge: Number(deliveryCharge.toFixed(2)),
    food_subtotal: Number(subtotal.toFixed(2)),
    total_amount: Number((subtotal + deliveryCharge).toFixed(2)),
    message,
  };
}

// Customer-facing quote endpoint. This only calculates a quote; order creation
// MUST recalculate on the server (see the POST /api/orders instructions below).
app.post("/api/delivery-quote", async (req, res) => {
  try {
    const quote = await calculateDesiDawatDeliveryQuote(
      req.body.delivery_address,
      req.body.food_subtotal
    );
    return res.json(quote);
  } catch (error) {
    // Return a stable error code so checkout can distinguish out-of-area addresses from temporary quote failures.
    return res.status(error.statusCode || 502).json({
      message: error.statusCode && error.statusCode < 500 ? error.message : "Could not calculate delivery charge. Please try again later.",
      code: error.code || "DELIVERY_QUOTE_FAILED",
    });
  }
});
// Admin: upload a food picture
app.post(
  "/api/admin/upload",
  requireAdmin,
  upload.single("image"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: "Please select an image file.",
      });
    }

    const uploaded = fs.readFileSync(req.file.path);
    const extension = path.extname(req.file.originalname).toLowerCase();
    const validImageSignature = extension === ".png"
      ? uploaded.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : extension === ".jpg" || extension === ".jpeg"
        ? uploaded.length >= 3 && uploaded[0] === 0xff && uploaded[1] === 0xd8 && uploaded[2] === 0xff
        : extension === ".webp"
          ? uploaded.length >= 12 && uploaded.toString("ascii", 0, 4) === "RIFF" && uploaded.toString("ascii", 8, 12) === "WEBP"
          : false;
    if (!validImageSignature) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "The uploaded file is not a valid JPG, PNG, or WebP image." });
    }

    res.json({
      message: "Image uploaded successfully.",
      image_url: `/uploads/${req.file.filename}`,
    });
  }
);

app.post("/api/admin/about/media", requireAdmin, aboutMediaUpload.single("media"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose an image or video to upload." });

  try {
    const uploaded = await fs.promises.readFile(req.file.path);
    const extension = path.extname(req.file.originalname).toLowerCase();
    const isPng = extension === ".png" && uploaded.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg = [".jpg", ".jpeg"].includes(extension) && uploaded.length >= 3 && uploaded[0] === 0xff && uploaded[1] === 0xd8 && uploaded[2] === 0xff;
    const isWebp = extension === ".webp" && uploaded.length >= 12 && uploaded.toString("ascii", 0, 4) === "RIFF" && uploaded.toString("ascii", 8, 12) === "WEBP";
    const isMp4 = extension === ".mp4" && uploaded.length >= 12 && uploaded.toString("ascii", 4, 8) === "ftyp";
    const isWebm = extension === ".webm" && uploaded.length >= 4 && uploaded.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (!(isPng || isJpeg || isWebp || isMp4 || isWebm)) {
      await fs.promises.unlink(req.file.path);
      return res.status(400).json({ error: "The file content does not match a supported image or video format." });
    }

    const mediaType = isMp4 || isWebm ? "video" : "image";
    const mediaUrl = `/uploads/${req.file.filename}`;
    const altText = path.basename(req.file.originalname).slice(0, 255);
    const [result] = await pool.execute(
      "INSERT INTO about_page_media (media_url, media_type, alt_text) VALUES (?, ?, ?)",
      [mediaUrl, mediaType, altText]
    );
    return res.status(201).json({
      message: "About Us media uploaded.",
      media: { media_id: result.insertId, media_url: mediaUrl, media_type: mediaType, alt_text: altText },
    });
  } catch (error) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    console.error("POST /api/admin/about/media failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: "Could not save About Us media." });
  }
});

app.delete("/api/admin/about/media/:id", requireAdmin, async (req, res) => {
  const mediaId = Number(req.params.id);
  if (!Number.isInteger(mediaId) || mediaId < 1) return res.status(400).json({ error: "Invalid media ID." });

  try {
    const [rows] = await pool.execute(
      "SELECT media_url FROM about_page_media WHERE media_id = ? LIMIT 1",
      [mediaId]
    );
    if (!rows.length) return res.status(404).json({ error: "About Us media not found." });
    await pool.execute("DELETE FROM about_page_media WHERE media_id = ?", [mediaId]);

    const filename = path.basename(rows[0].media_url);
    const mediaPath = path.resolve(uploadDir, filename);
    if (path.dirname(mediaPath) === uploadDir) await fs.promises.unlink(mediaPath).catch(() => {});
    return res.json({ message: "About Us media removed.", media_id: mediaId });
  } catch (error) {
    console.error("DELETE /api/admin/about/media failed:", error.code || "UNKNOWN");
    return res.status(500).json({ error: "Could not remove About Us media." });
  }
});

app.use("/uploads", express.static(uploadDir));

// Inventory size validation: the Size column accepts gm/ml measurements only; package counts belong in Unit.
function isValidInventorySize(value) {
  return value == null || String(value).trim() === "" || /^[0-9]+(?:\.[0-9]+)?\s*(?:gm|ml)$/i.test(String(value).trim());
}
const inventoryFields = [
  "item_name",
  "item_name_hindi",
  "item_name_finnish",
  "rack_number",
  "item_size",
  "quantity",
  "unit",
  "availability",
  "expiry_date",
  "expiry_note",
  "notes",
];

function normalizeInventoryCategory(value) {
  if (value === "packing" || value === "packing_material") return "packing";
  if (value === "food" || value === "food_item") return "food";
  return null;
}

function withInventoryCategoryAlias(row) {
  return {
    ...row,
    item_category: row.category === "food" ? "food_item" : "packing_material",
  };
}

app.get("/api/admin/inventory", requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM inventory_items ORDER BY item_id DESC"
    );
    res.json(rows.map(withInventoryCategoryAlias));
  } catch (err) {
    console.error("Load inventory error:", err);
    res.status(500).json({ message: "Failed to load inventory." });
  }
});

app.post("/api/admin/inventory", requireAdmin, async (req, res) => {
  try {
    const category = normalizeInventoryCategory(req.body.item_category ?? req.body.category);
    if (!category) {
      return res.status(400).json({ message: "Choose packing materials or food items." });
    }
    // Inventory size API guard: reject labels such as "can" or "pieces" in item_size.
    if (!isValidInventorySize(req.body.item_size)) {
      return res.status(400).json({ message: "Size must use gm or ml only. Put can/pieces in Unit." });
    }
    const values = inventoryFields.map((field) => {
      const value = req.body[field];
      return value === "" || value === undefined ? null : value;
    });

    if (!req.body.item_name?.trim()) {
      return res.status(400).json({ message: "Item name is required." });
    }

    const columns = ["category", ...inventoryFields].join(", ");
    const placeholders = [category, ...inventoryFields].map(() => "?").join(", ");

    const [result] = await pool.query(
      `INSERT INTO inventory_items (${columns}) VALUES (${placeholders})`,
      [category, ...values]
    );

    res.status(201).json({
      message: "Inventory item added successfully.",
      item_id: result.insertId,
    });
  } catch (err) {
    console.error("Add inventory error:", err);
    res.status(500).json({ message: "Failed to add inventory item." });
  }
});

app.put("/api/admin/inventory/:id", requireAdmin, async (req, res) => {
  try {
    const hasCategory = Object.prototype.hasOwnProperty.call(req.body, "item_category") ||
      Object.prototype.hasOwnProperty.call(req.body, "category");
    const category = hasCategory
      ? normalizeInventoryCategory(req.body.item_category ?? req.body.category)
      : null;
    if (hasCategory && !category) {
      return res.status(400).json({ message: "Choose packing materials or food items." });
    }
    // Inventory size API guard: apply the gm/ml rule when editing existing stock.
    if (Object.prototype.hasOwnProperty.call(req.body, "item_size") && !isValidInventorySize(req.body.item_size)) {
      return res.status(400).json({ message: "Size must use gm or ml only. Put can/pieces in Unit." });
    }
    const updates = inventoryFields.filter((field) =>
      Object.prototype.hasOwnProperty.call(req.body, field)
    );
    if (hasCategory) updates.unshift("category");

    if (!updates.length) {
      return res.status(400).json({ message: "No fields to update." });
    }

    if (
      Object.prototype.hasOwnProperty.call(req.body, "item_name") &&
      !req.body.item_name?.trim()
    ) {
      return res.status(400).json({ message: "Item name is required." });
    }

    const values = updates.map((field) => {
      if (field === "category") return category;
      const value = req.body[field];
      return value === "" || value === undefined ? null : value;
    });

    const [result] = await pool.query(
      `UPDATE inventory_items SET ${updates
        .map((field) => `${field} = ?`)
        .join(", ")} WHERE item_id = ?`,
      [...values, req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Inventory item not found." });
    }

    res.json({ message: "Inventory item updated successfully." });
  } catch (err) {
    console.error("Update inventory error:", err);
    res.status(500).json({ message: "Failed to update inventory item." });
  }
});

app.delete("/api/admin/inventory/:id", requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.query(
      "DELETE FROM inventory_items WHERE item_id = ?",
      [req.params.id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Inventory item not found." });
    }

    res.json({ message: "Inventory item deleted successfully." });
  } catch (err) {
    console.error("Delete inventory error:", err);
    res.status(500).json({ message: "Failed to delete inventory item." });
  }
});

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  app.listen(port, "::", () => {
    console.log(`Desi Dawat API listening on port ${port}`);
  });
}

// Register last so errors from multipart parsing and every API route are handled.
app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  const status = error.statusCode || error.status || (error instanceof multer.MulterError ? 400 : 500);
  if (status >= 500) console.error("Unexpected server error:", error.code || error.message);
  res.status(status).json({
    error: status < 500 ? error.message : "Unexpected server error.",
  });
});
