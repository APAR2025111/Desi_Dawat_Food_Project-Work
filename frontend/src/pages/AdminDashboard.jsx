
import React, { useEffect, useMemo, useState } from "react";
// Admin dashboard sign-out navigation: return to the public sign-in page after clearing the saved token.
import { Link, useNavigate } from "react-router-dom";
import { getAdminOrders } from "../api.js";

const sections = [
  {
    title: "About Us Management",
    description: "Edit your story and upload photos or videos",
    icon: "â—†",
    path: "/admin/about",
  },
  {
    title: "Time Management",
    description: "Opening hours and daily schedule",
    icon: "◷",
    path: "/admin/time",
  },
  {
    title: "Inventory Management",
    description: "Stock, expiry dates and reports",
    icon: "▦",
    path: "/admin/inventory",
  },
  {
    title: "Flyer Management",
    description: "Create and print menu flyers",
    icon: "▧",
    path: "/admin/flyers",
  },
  {
    title: "Menu Management",
    description: "Items, prices, photos and availability",
    icon: "♨",
    path: "/admin/menu",
  },
  {
    title: "Rewards Management",
    description: "Set surprise reward cycles, add-on dishes and coupon validity",
    icon: "✦",
    path: "/admin/rewards",
  },
  {
    title: "Customer Management",
    description: "Customer profiles, order counts and lifetime value",
    icon: "♙",
    path: "/admin/customers",
  },
  {
    title: "Receipts & Reports",
    description: "Print receipts and business reports",
    icon: "▤",
    path: "/admin/reports",
  },
  {
    title: "Document Management",
    description: "Store business records and draft documents with local AI",
    icon: "▧",
    path: "/admin/documents",
  },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState("");
  const topDishes = useMemo(() => {
    const totals = new Map();
    orders
      .filter((order) => !["cancelled", "canceled"].includes(String(order.order_status || "").trim().toLowerCase()))
      .forEach((order) => {
        (Array.isArray(order.items) ? order.items : []).forEach((item) => {
          const quantity = Number(item.quantity) || 0;
          if (quantity <= 0) return;
          const key = item.item_id ?? item.item_name;
          if (key == null) return;
          const storedName = String(item.item_name || "Menu item");
          const nameCode = storedName.match(/\((\d+)\)$/)?.[1];
          const current = totals.get(key) || {
            displayId: String(item.display_code || nameCode || item.item_id || "—"),
            name: storedName.replace(/\s+\(\d+\)$/, ""),
            quantity: 0,
            orderCount: 0,
          };
          current.quantity += quantity;
          current.orderCount += 1;
          totals.set(key, current);
        });
      });
    return [...totals.values()]
      .sort((first, second) => second.quantity - first.quantity || first.name.localeCompare(second.name))
      .slice(0, 8);
  }, [orders]);

  useEffect(() => {
    const token = sessionStorage.getItem("desiDawatAdminToken") || "";
    let cancelled = false;
    getAdminOrders(token)
      .then((data) => {
        if (!cancelled) setOrders(Array.isArray(data) ? data : []);
      })
      .catch((error) => {
        if (!cancelled) setSalesError(error.message || "Could not load menu sales.");
      })
      .finally(() => {
        if (!cancelled) setSalesLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Admin dashboard sign-out: end this browser session and go back to sign-in.
  function handleSignOut() {
    sessionStorage.removeItem("desiDawatAdminToken");
    navigate("/admin/login", { replace: true });
  }

  return (
    <div className="admin-dashboard">
      <section className="admin-dashboard-card">
        <header className="admin-dashboard-brand">
          <img
            src="/images/LOGO.jpeg"
            alt="Desi Dawat logo"
          />

          <div>
            <h1>DESI DAWAT</h1>
            <p>Restaurant Administration</p>
            <small>Oulu, Finland</small>
          </div>

          {/* Admin sign-out: keep the signed-in session control visible from the dashboard header. */}
          <button
            type="button"
            className="button button-outline admin-dashboard-signout"
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </header>

        
{/* Admin dashboard welcome: this page is already behind the authenticated admin route. */}
<section className="admin-dashboard-welcome">
  <h2>Welcome to your dashboard</h2>
  <p>Manage your restaurant operations from one place.</p>
</section>

        {/* Admin console entry: keep the existing management tools available after sign-in. */}
        <Link to="/admin/console" className="button button-primary">
          Open full admin console
        </Link>

        <div className="admin-dashboard-grid">
          {sections.map((section) => (
            <Link
              to={section.path}
              className="admin-dashboard-tile"
              key={section.path}
            >
              <span className="admin-dashboard-icon" aria-hidden="true">
                {section.icon}
              </span>

              <h3>{section.title}</h3>
              <p>{section.description}</p>
            </Link>
          ))}
        </div>

        <section className="dish-sales-panel" aria-labelledby="dish-sales-title">
          <div className="dish-sales-heading">
            <div>
              <h2 id="dish-sales-title">Popular dishes</h2>
              <p>Units sold across saved orders, excluding cancelled orders.</p>
            </div>
            {topDishes[0] && (
              <div className="dish-sales-winner">
                <span aria-hidden="true">🏆</span>
                <div><small>Most ordered</small><strong>{topDishes[0].displayId} · {topDishes[0].name}</strong><span>{topDishes[0].quantity} units</span></div>
              </div>
            )}
          </div>
          {salesLoading ? <p className="dish-sales-message">Loading order totals…</p> : null}
          {!salesLoading && salesError ? <p className="dish-sales-message dish-sales-error">{salesError}</p> : null}
          {!salesLoading && !salesError && topDishes.length === 0 ? <p className="dish-sales-message">No non-cancelled order items to chart yet.</p> : null}
          {!salesLoading && !salesError && topDishes.length > 0 && (
            <ul className="dish-sales-chart" aria-label="Menu items ranked by units sold">
              {topDishes.map((dish, index) => (
                <li key={dish.name} className={index === 0 ? "dish-sales-row dish-sales-row-winner" : "dish-sales-row"}>
                  <div className="dish-sales-details">
                    <div className="dish-sales-label"><strong>{dish.displayId} · {dish.name}</strong><span>{dish.quantity} sold · {dish.orderCount} orders</span></div>
                    <div className="dish-sales-track"><span style={{ width: `${Math.max(4, (dish.quantity / topDishes[0].quantity) * 100)}%` }} /></div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <small className="dish-sales-footnote">This shows purchase activity. The system does not currently collect customer likes or ratings.</small>
        </section>

        <Link to="/" className="admin-dashboard-back">
          Return to customer menu
        </Link>
      </section>
    </div>
  );
}
