import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loginAdmin } from "../api.js";

export default function AdminLoginPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Admin sign-in: after success, return to the page that required authentication.
  async function handleLogin(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const result = await loginAdmin(username, password);
      sessionStorage.setItem("desiDawatAdminToken", result.token);
      const from = location.state?.from;
      const destination = typeof from === "string"
        ? from
        : from?.pathname
          ? `${from.pathname}${from.search || ""}${from.hash || ""}`
          : "/admin";
      navigate(destination, { replace: true });
    } catch (loginError) {
      setError(loginError.message || "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-page narrow">
      <span className="eyebrow">PRIVATE AREA</span>
      <h1>Admin sign in</h1>
      <p className="muted">Sign in to manage Desi Dawat.</p>
      <form className="panel login-form" onSubmit={handleLogin}>
        <label>
          Username
          <input
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="hint">Use the admin credentials configured for the backend.</p>
    </section>
  );
}