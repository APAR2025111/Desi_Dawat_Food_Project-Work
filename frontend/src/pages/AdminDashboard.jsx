
import React from "react";
// Admin dashboard sign-out navigation: return to the public sign-in page after clearing the saved token.
import { Link, useNavigate } from "react-router-dom";

const sections = [
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
    title: "Order Management",
    description: "View and manage customer orders",
    icon: "▣",
    path: "/admin/orders",
  },
  {
    title: "Receipts & Reports",
    description: "Print receipts and business reports",
    icon: "▤",
    path: "/admin/reports",
  },
];

export default function AdminDashboard() {
  const navigate = useNavigate();

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

        <Link to="/" className="admin-dashboard-back">
          Return to customer menu
        </Link>
      </section>
    </div>
  );
}
