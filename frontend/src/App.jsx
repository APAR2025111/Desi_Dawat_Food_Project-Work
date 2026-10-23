
import React from "react";
import { Link, NavLink, Route, Routes } from "react-router-dom";
import MenuPage from "./pages/MenuPage.jsx";
import OrderConfirmation from "./pages/OrderConfirmation.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminSectionPage from "./pages/AdminSectionPage.jsx";
// Admin authentication: keep sign-in public and wrap every admin screen in the shared session guard.
import AdminRoute from "./AdminRoute.jsx";
import AdminLoginPage from "./pages/AdminLoginPage.jsx";

function Header() {
  return (
    <header className="site-header">
      <Link
        to="/"
        className="brand"
        aria-label="Desi Dawat home"
      >
        <img
          src="/images/LOGO.jpeg"
          alt="Desi Dawat Food & Catering"
          className="brand-logo"
        />

        <span className="brand-text">
          <strong>Desi Dawat</strong>
          <small>Indian Vegetarian Kitchen · Oulu</small>
        </span>
      </Link>

      <nav aria-label="Main navigation">
        <NavLink to="/" end>
          Menu
        </NavLink>

        <NavLink to="/admin">
          Admin
        </NavLink>
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <Header />

      <main>
        <Routes>
          <Route
            path="/"
            element={<MenuPage />}
          />
<Route
  path="/order-confirmation"
  element={<OrderConfirmation />}
/>

          {/* Sign-in stays public; successful sign-in returns to the requested admin screen. */}
<Route path="/admin/login" element={<AdminLoginPage />} />

{/* Every dashboard, legacy console, and admin section requires a valid server-verified admin session. */}
<Route element={<AdminRoute />}>
  <Route path="/admin" element={<AdminDashboard />} />
  <Route path="/admin/console" element={<AdminPage />} />
  <Route path="/admin/time" element={<AdminSectionPage />} />
  <Route path="/admin/inventory" element={<AdminSectionPage />} />
  <Route path="/admin/flyers" element={<AdminSectionPage />} />
  <Route path="/admin/menu" element={<AdminSectionPage />} />
  <Route path="/admin/orders" element={<AdminSectionPage />} />
  <Route path="/admin/reports" element={<AdminSectionPage />} />
</Route>

          <Route
            path="*"
            element={
              <div className="notice">
                Page not found.{" "}
                <Link to="/">Return to menu</Link>
              </div>
            }
          />
        </Routes>
      </main>

      <footer className="site-footer">
        <strong>Desi Dawat</strong>
        <span>
          Vegetarian Indian food, made with care in Oulu.
        </span>
      </footer>
    </div>
  );
}
