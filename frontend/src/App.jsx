
import React from "react";
import { Link, Navigate, NavLink, Route, Routes } from "react-router-dom";
import MenuPage from "./pages/MenuPage.jsx";
import OrderConfirmation from "./pages/OrderReceiptConfirmation.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import AdminSectionPage from "./pages/AdminSectionPage.jsx";
// Admin authentication: keep sign-in public and wrap every admin screen in the shared session guard.
import AdminRoute from "./AdminRoute.jsx";
import AdminLoginPage from "./pages/AdminLoginPage.jsx";
import AboutPage from "./pages/AboutPage.jsx";
import AboutManagementPage from "./pages/AboutManagementPage.jsx";
import FlyerManagement from "./pages/FlyerManagement.jsx";
import OrderNowPage from "./pages/OrderNowPage.jsx";
import MyOrdersPage from "./pages/MyOrdersPage.jsx";
import CustomerAccountPage, { CustomerOffers, MemberRewards } from "./pages/CustomerAccountPage.jsx";
import { CustomerAccountProvider, useCustomerAccount } from "./CustomerAccount.jsx";
import { LETTERHEAD } from "../../shared/letterhead.js";

function Header() {
  const { customer, signOut } = useCustomerAccount();

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
          <small>
            <span>Perinteinen intialainen perhekeittiö · Oulu</span>
            <span>Traditional Indian Family Kitchen · Oulu</span>
          </small>
        </span>
      </Link>

      <nav aria-label="Main navigation" className={customer ? "signed-in-navigation" : undefined}>
        <NavLink to="/" end>
          Menu
        </NavLink>

        {!customer && (
          <NavLink to="/order-now">
            Order Now
          </NavLink>
        )}

        {customer && (
          <details
            className="customer-account-menu"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape" && event.currentTarget.open) {
                event.preventDefault();
                event.currentTarget.querySelector("summary").focus();
                event.currentTarget.open = false;
              }
            }}
          >
            <summary className="customer-account-trigger">{customer.customer_name}</summary>
            <div className="customer-account-options">
              <Link to="/order-now/offers" onClick={(event) => {
                const menu = event.currentTarget.closest("details");
                menu.querySelector("summary").focus();
                menu.open = false;
              }}>My Account</Link>
              <button type="button" onClick={signOut}>Log out</button>
            </div>
          </details>
        )}

        <NavLink to="/admin">
          Admin
        </NavLink>
      </nav>
    </header>
  );
}

export default function App() {
  return <CustomerAccountProvider><Storefront /></CustomerAccountProvider>;
}

function Storefront() {
  return (
    <div className="app-shell">
      <Header />

      <main>
        <Routes>
          <Route
            path="/"
            element={<MenuPage />}
          />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/menu-card" element={<FlyerManagement publicMode />} />
          <Route path="/order-now" element={<OrderNowPage />} />
          <Route path="/order-now/guest" element={<Navigate to="/" replace state={{ checkoutAsGuest: true }} />} />
          <Route path="/order-now/login" element={<OrderNowPage mode="login" />} />
          <Route path="/order-now/sign-up" element={<OrderNowPage mode="sign-up" />} />
          <Route element={<CustomerAccountPage />}>
            <Route path="/order-now/account" element={<Navigate to="/order-now/offers" replace />} />
            <Route path="/order-now/offers" element={<CustomerOffers />} />
            <Route path="/order-now/rewards" element={<MemberRewards />} />
            <Route path="/order-now/my-orders" element={<MyOrdersPage />} />
          </Route>
<Route
  path="/order-confirmation"
  element={<OrderConfirmation />}
/>

          {/* Sign-in stays public; successful sign-in returns to the requested admin screen. */}
<Route path="/admin/login" element={<AdminLoginPage />} />

{/* Every dashboard, legacy console, and admin section requires a valid server-verified admin session. */}
<Route element={<AdminRoute />}>
  <Route path="/admin" element={<AdminDashboard />} />
  <Route path="/admin/about" element={<AboutManagementPage />} />
  <Route path="/admin/console" element={<AdminPage />} />
  <Route path="/admin/time" element={<AdminSectionPage />} />
  <Route path="/admin/inventory" element={<AdminSectionPage />} />
  <Route path="/admin/flyers" element={<AdminSectionPage />} />
  <Route path="/admin/menu" element={<AdminSectionPage />} />
  <Route path="/admin/rewards" element={<AdminSectionPage />} />
  <Route path="/admin/orders" element={<Navigate to="/admin/reports" replace />} />
  <Route path="/admin/customers" element={<AdminSectionPage />} />
  <Route path="/admin/reports" element={<AdminSectionPage />} />
  <Route path="/admin/documents" element={<AdminSectionPage />} />
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
        <div className="site-footer-main">
          <section className="site-footer-brand" aria-label="About Desi Dawat">
            <Link to="/" className="site-footer-brand-link">
              <img src={LETTERHEAD.logo} alt="" />
              <span>{LETTERHEAD.name}</span>
            </Link>
            <p>Perinteinen intialainen perhekeittiö Oulussa.</p>
            <p>Traditional Indian family kitchen in Oulu.</p>
          </section>

          <nav className="site-footer-column" aria-label="Footer navigation">
            <h2>Explore</h2>
            <Link to="/menu-card" target="_blank" rel="noopener noreferrer">Menu Card</Link>
            <Link to="/about">About us</Link>
          </nav>

          <section className="site-footer-column" aria-label="Contact Desi Dawat">
            <h2>Contact</h2>
            <a href={`tel:${LETTERHEAD.phone.replaceAll(" ", "")}`}>Call {LETTERHEAD.phone}</a>
            <a href={`mailto:${LETTERHEAD.email}`}>{LETTERHEAD.email}</a>
            <p>{LETTERHEAD.address}, Finland</p>
          </section>

          <section className="site-footer-order">
            <h2>Ready to order?</h2>
            <p>Contact us on WhatsApp for pickup or home delivery.</p>
            <a className="site-footer-order-link" href="https://wa.me/358449803211" target="_blank" rel="noopener noreferrer">
              Order on WhatsApp <span aria-hidden="true">↗</span>
            </a>
          </section>
        </div>
        <div className="site-footer-bottom">
          <span>© {new Date().getFullYear()} Desi Dawat. All rights reserved.</span>
          <span>Vegetarian Indian Kitchen · Oulu, Finland</span>
        </div>
      </footer>
    </div>
  );
}
