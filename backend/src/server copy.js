
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "./db.js";
import { requireAdmin } from "./auth.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3001);

app.use(
  cors({
    origin: "http://localhost:5173",
  })
);
app.use(express.json({ limit: "100kb" }));


/* Opening hours: public read and admin update */

app.get("/api/opening-hours", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT day_key, day_order, day_fi, day_en,
              open_time, close_time, is_closed
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
console.log("Opening hours received:", JSON.stringify(hours, null, 2));
  if (!Array.isArray(hours) || hours.length !== 4) {
    return res.status(400).json({ error: "Please provide all four opening-hour entries." });
  }

  const allowedKeys = ["mon_thu", "fri", "sat", "sun"];

  for (const item of hours) {
    if (
      !allowedKeys.includes(item.day_key) ||
      typeof item.open_time !== "string" ||
      !/^\d{2}:\d{2}$/.test(item.open_time) ||
      typeof item.close_time !== "string" ||
      !/^\d{2}:\d{2}$/.test(item.close_time) ||
      !(typeof item.is_closed === "boolean" || item.is_closed === 0 || item.is_closed === 1)
    ) {
      return res.status(400).json({ error: "Invalid opening-hour values." });
    }
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const item of hours) {
      await connection.execute(
        `UPDATE opening_hours
         SET open_time = ?, close_time = ?, is_closed = ?
         WHERE day_key = ?`,
        [
          item.open_time,
          item.close_time,
          item.is_closed ? 1 : 0,
          item.day_key,
        ]
      );
    }

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
  main_category,
  subcategory,
  item_name,
  quantity_serving,
  price_eur,
  short_information,
  is_available
`;

function cleanItem(body) {
  const item = {
    main_category: String(body.main_category ?? "").trim(),
    subcategory: String(body.subcategory ?? "").trim(),
    item_name: String(body.item_name ?? "").trim(),
    quantity_serving: String(body.quantity_serving ?? "").trim(),
    price_eur: Number(body.price_eur),
    short_information: String(body.short_information ?? "").trim(),
    is_available:
      body.is_available === true ||
      body.is_available === 1 ||
      body.is_available === "1",
  };

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

// Health check: test the MySQL connection.
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      database: "connected",
    });
  } catch (error) {
    console.error(
      "Database connection error:",
      error.code || "",
      error.message
    );

    res.status(503).json({
      status: "error",
      message: error.message,
      code: error.code || "UNKNOWN_DATABASE_ERROR",
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
    console.error(
      "GET /api/menu error:",
      error.code || "",
      error.message
    );

    res.status(500).json({
      error: "Could not load the menu.",
      code: error.code || "DATABASE_QUERY_ERROR",
      details: error.message,
    });
  }
});

// Admin login.
app.post("/api/admin/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (
    !process.env.JWT_SECRET ||
    !process.env.ADMIN_USERNAME ||
    !process.env.ADMIN_PASSWORD
  ) {
    return res.status(500).json({
      error: "Admin login is not configured in backend/.env.",
    });
  }

  const usernameOk =
    typeof username === "string" &&
    username === process.env.ADMIN_USERNAME;

  const passwordOk =
    typeof password === "string" &&
    (
      (await bcrypt
        .compare(password, process.env.ADMIN_PASSWORD)
        .catch(() => false)) ||
      password === process.env.ADMIN_PASSWORD
    );

  if (!usernameOk || !passwordOk) {
    return res.status(401).json({
      error: "Incorrect username or password.",
    });
  }

  const token = jwt.sign(
    { role: "admin", username },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );

  res.json({ token, username });
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
    console.error("GET /api/admin/menu:", error.message);

    res.status(500).json({
      error: "Could not load admin menu.",
      details: error.message,
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
    const [result] = await pool.execute(
      `INSERT INTO menu_items
       (main_category, subcategory, item_name, quantity_serving,
        price_eur, short_information, is_available)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        item.main_category,
        item.subcategory || null,
        item.item_name,
        item.quantity_serving || null,
        item.price_eur,
        item.short_information || null,
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
    console.error("POST /api/admin/menu:", error.message);

    res.status(500).json({
      error: "Could not add item.",
      details: error.message,
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
    const [result] = await pool.execute(
      `UPDATE menu_items
       SET main_category = ?,
           subcategory = ?,
           item_name = ?,
           quantity_serving = ?,
           price_eur = ?,
           short_information = ?,
           is_available = ?
       WHERE item_id = ?`,
      [
        item.main_category,
        item.subcategory || null,
        item.item_name,
        item.quantity_serving || null,
        item.price_eur,
        item.short_information || null,
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
    console.error("PUT /api/admin/menu/:id:", error.message);

    res.status(500).json({
      error: "Could not update item.",
      details: error.message,
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
    console.error("DELETE /api/admin/menu/:id:", error.message);

    res.status(500).json({
      error: "Could not delete item.",
      details: error.message,
    });
  }
});

app.post("/api/orders", async (req, res) => {
  const {
  customer_name,
  customer_phone,
  order_type,
  payment_method,
  delivery_address,
  customer_notes,
  items,
} = req.body;

  if (
    !customer_name?.trim() ||
    !customer_phone?.trim() ||
    !["delivery", "takeaway"].includes(order_type) ||
    !["mobile_scan_pay", "iban_transfer", "pay_on_delivery"].includes(payment_method) ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return res.status(400).json({
      message: "Please provide valid customer and order details.",
    });
  }

  if (order_type === "delivery" && !delivery_address?.trim()) {
    return res.status(400).json({
      message: "Delivery address is required.",
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

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
        throw new Error("Invalid dish or quantity.");
      }

      const [rows] = await connection.execute(
        `SELECT item_id, item_name, price_eur
         FROM menu_items
         WHERE item_id = ? AND is_available = 1`,
        [itemId]
      );

      if (rows.length === 0) {
        throw new Error("A selected dish is unavailable.");
      }

      const dish = rows[0];
      const unitPrice = Number(dish.price_eur);
      const lineTotal = Number((unitPrice * quantity).toFixed(2));

      totalAmount += lineTotal;

      orderItems.push({
        item_id: dish.item_id,
        item_name: dish.item_name,
        quantity,
        unit_price: unitPrice,
        line_total: lineTotal,
      });
    }

    totalAmount = Number(totalAmount.toFixed(2));

    const [orderResult] = await connection.execute(
      `INSERT INTO customer_orders
       (customer_name, customer_phone, order_type,
 payment_method, delivery_address, customer_notes, total_amount)
VALUES (?, ?, ?, ?, ?, ?, ?)`,
[
  customer_name.trim(),
  customer_phone.trim(),
  order_type,
  payment_method,
  order_type === "delivery" ? delivery_address.trim() : null,
  customer_notes?.trim() || null,
  totalAmount,
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

    await connection.commit();

    return res.status(201).json({
      message: "Order saved successfully.",
      order_id: orderId,
      total_amount: totalAmount,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Order creation failed:", error);

    return res.status(500).json({
      message: "Could not save the order. Please try again.",
    });
  } finally {
    connection?.release();
  }
});


/* Admin: list customer orders with their ordered dishes. */
app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const [orders] = await pool.query(`
      SELECT
        order_id,
        customer_name,
        customer_phone,
        order_type,
        delivery_address,
        customer_notes,
        total_amount,
        order_status,
        created_at
      FROM customer_orders
      ORDER BY created_at ASC, order_id ASC
    `);
orders.forEach((order, index) => {
  order.receipt_number = index + 1;
});
    for (const order of orders) {
            const [items] = await pool.query(
        `SELECT item_id, item_name, quantity, unit_price, line_total
         FROM customer_order_items
         WHERE order_id = ?
         ORDER BY order_item_id`,
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
        `SELECT order_id, order_type, total_amount, delivery_charge
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
        (currentTotal - currentCharge).toFixed(2)
      );

      if (foodSubtotal < 0) {
        return res.status(500).json({
          error: "The existing order total is invalid.",
        });
      }

      const newTotal = Number(
        (foodSubtotal + roundedCharge).toFixed(2)
      );

      await pool.execute(
        `UPDATE customer_orders
         SET delivery_charge = ?, total_amount = ?
         WHERE order_id = ?`,
        [roundedCharge, newTotal, orderId]
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
        "SELECT order_id FROM customer_orders WHERE order_id = ?",
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

      await connection.commit();

      return res.json({
        message: `Order #${orderId} deleted successfully.`,
        order_id: orderId,
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

// Handle unexpected errors.
app.use((error, _req, res, _next) => {
  console.error("Unexpected server error:", error);

  res.status(500).json({
    error: "Unexpected server error.",
  });
});

app.listen(port, "::", () => {
  console.log(`Desi Dawat API listening at http://localhost:${port}`);
});