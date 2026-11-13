import React, { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { loginCustomer, registerCustomer } from "../api.js";
import { useCustomerAccount } from "../CustomerAccount.jsx";

export default function OrderNowPage({ mode = "choose" }) {
  const { customer, isChecking } = useCustomerAccount();

  if (mode === "login" || mode === "sign-up") {
    return mode === "sign-up" ? <CustomerSignUp /> : <CustomerLogin />;
  }

  if (customer) return <Navigate to="/" replace />;
  if (isChecking) return <p className="notice" role="status">Checking your account…</p>;

  return (
    <section className="order-entry-page order-entry-choice-page" aria-labelledby="order-now-title">
      <p className="eyebrow">Desi Dawat · Oulu</p>
      <h1 id="order-now-title">How would you like to order?</h1>
      <p>Continue as a guest, or use a customer account to access member benefits.</p>
      <div className="order-entry-options">
        <article className="order-entry-option">
          <h2>Order as a guest</h2>
          <p>Place an order without registering.</p>
          <Link className="button" to="/order-now/guest">Continue as guest</Link>
        </article>
        <article className="order-entry-option order-entry-account-option">
          <h2>Already registered?</h2>
          <p>Log in to access your customer account.</p>
          <Link className="button button-secondary" to="/order-now/login">Log in</Link>
          <p className="order-entry-register-prompt">
            New customer? <Link to="/order-now/sign-up">Create an account</Link> to receive customer offers.
          </p>
        </article>
      </div>
    </section>
  );
}

function CustomerSignUp() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [createdCustomer, setCreatedCustomer] = useState(null);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const form = event.currentTarget;
    const values = new FormData(form);
    const password = String(values.get("password") || "");
    const passwordConfirmation = String(values.get("password_confirmation") || "");

    if (password !== passwordConfirmation) {
      setError("The passwords do not match. Please check them and try again.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await registerCustomer({
        customer_name: String(values.get("customer_name") || "").trim(),
        customer_phone: String(values.get("customer_phone") || "").trim(),
        email: String(values.get("email") || "").trim(),
        password,
        delivery_address: String(values.get("delivery_address") || "").trim(),
      });
      setCreatedCustomer(result.customer);
      form.reset();
    } catch (requestError) {
      setError(requestError.message || "We could not create your account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (createdCustomer) {
    return (
      <section className="order-entry-page" aria-labelledby="customer-access-title">
        <p className="eyebrow">Customer account</p>
        <h1 id="customer-access-title">Your account is ready</h1>
        <p>Welcome, {createdCustomer.customer_name}. Your account has been created successfully.</p>
        <p className="order-entry-note">You can now log in with your email and password.</p>
        <div className="order-entry-form-actions">
          <Link className="button" to="/order-now/login">Log in</Link>
          <Link className="button" to="/">Explore the menu</Link>
          <Link className="button button-secondary" to="/order-now">Back to order options</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="order-entry-page order-entry-signup" aria-labelledby="customer-access-title">
      <p className="eyebrow">Customer account</p>
      <h1 id="customer-access-title">Create your account</h1>
      <p>Join Desi Dawat to enjoy registered-customer benefits and a smoother checkout.</p>

      <form className="customer-signup-form" onSubmit={handleSubmit}>
        <label>
          Full name
          <input name="customer_name" type="text" autoComplete="name" minLength={2} maxLength={120} required />
        </label>
        <label>
          Phone number
          <input name="customer_phone" type="tel" autoComplete="tel" minLength={7} maxLength={30} required />
        </label>
        <label>
          Email address
          <input name="email" type="email" autoComplete="email" maxLength={254} required />
        </label>
        <label>
          Delivery address <span className="customer-signup-optional">(optional)</span>
          <textarea name="delivery_address" autoComplete="street-address" maxLength={500} rows={3} />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
          <small>Use at least 8 characters.</small>
        </label>
        <label>
          Confirm password
          <input name="password_confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={128} required />
        </label>

        {error && <p className="customer-signup-message customer-signup-error" role="alert">{error}</p>}

        <div className="order-entry-form-actions">
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating account…" : "Create account"}
          </button>
          <Link className="button button-secondary" to="/order-now">Cancel</Link>
        </div>
      </form>

      <p className="order-entry-back"><Link to="/order-now">Back to account options</Link></p>
    </section>
  );
}

function CustomerLogin() {
  const { customer, isChecking, signIn } = useCustomerAccount();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      const result = await loginCustomer(
        String(values.get("email") || "").trim(),
        String(values.get("password") || "")
      );
      signIn(result);
    } catch (requestError) {
      setError(requestError.message || "We could not sign you in. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isChecking) {
    return (
      <section className="order-entry-page" aria-live="polite">
        <p className="eyebrow">Customer account</p>
        <h1>Checking your account</h1>
      </section>
    );
  }

  if (customer) return <Navigate to="/order-now/offers" replace />;

  return (
    <section className="order-entry-page order-entry-signup" aria-labelledby="customer-access-title">
      <p className="eyebrow">Customer account</p>
      <h1 id="customer-access-title">Log in</h1>
      <p>Sign in with the email address and password you used to create your account.</p>
      <form className="customer-auth-form" onSubmit={handleSubmit}>
        <label>
          Email address
          <input name="email" type="email" autoComplete="username" maxLength={254} required />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="current-password" maxLength={128} required />
        </label>
        {error && <p className="customer-signup-message customer-signup-error" role="alert">{error}</p>}
        <div className="order-entry-form-actions">
          <button className="button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in…" : "Log in"}
          </button>
          <Link className="button button-secondary" to="/order-now">Cancel</Link>
        </div>
      </form>
      <p className="order-entry-back">New to Desi Dawat? <Link to="/order-now/sign-up">Create an account</Link></p>
    </section>
  );
}
