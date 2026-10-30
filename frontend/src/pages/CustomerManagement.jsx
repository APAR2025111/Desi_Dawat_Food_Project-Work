import React, { useEffect, useMemo, useState } from "react";
import { addAdminCustomer, archiveAdminCustomer, getAdminCustomers, restoreAdminCustomer } from "../api.js";

const currency = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR" });

export default function CustomerManagement({ token, mode = "active", compact = false }) {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ customer_name: "", customer_phone: "", email: "", delivery_address: "" });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadCustomers() {
    setLoading(true);
    setError("");
    try {
      const rows = await getAdminCustomers(token);
      setCustomers(Array.isArray(rows) ? rows : []);
    } catch (loadError) {
      setError(loadError.message || "Could not load customers.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, [token]);

  const visibleCustomers = useMemo(() => customers
    .filter((customer) => Boolean(Number(customer.is_archived)) === (mode === "archived"))
    .filter((customer) => `${customer.customer_name} ${customer.customer_phone} ${customer.email || ""}`.toLowerCase().includes(search.trim().toLowerCase())), [customers, mode, search]);

  async function handleAdd(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await addAdminCustomer(token, form);
      setForm({ customer_name: "", customer_phone: "", email: "", delivery_address: "" });
      setMessage("Customer added. Order count and lifetime total will update automatically when they place orders.");
      await loadCustomers();
    } catch (saveError) {
      setError(saveError.message || "Could not add the customer.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveCustomer(customer) {
    if (!window.confirm(`Archive ${customer.customer_name}? Their order history will be kept, and you can restore them from Order Management.`)) return;
    setError("");
    setMessage("");
    try {
      await archiveAdminCustomer(token, customer.customer_id);
      setMessage(`${customer.customer_name} was archived. Their order history is preserved.`);
      await loadCustomers();
    } catch (archiveError) {
      setError(archiveError.message || "Could not archive the customer.");
    }
  }

  async function restoreCustomer(customer) {
    setError("");
    setMessage("");
    try {
      await restoreAdminCustomer(token, customer.customer_id);
      setMessage(`${customer.customer_name} was restored.`);
      await loadCustomers();
    } catch (restoreError) {
      setError(restoreError.message || "Could not restore the customer.");
    }
  }

  return (
    <section className={`customer-management ${compact ? "customer-management-compact" : ""}`}>
      {!compact && mode === "active" && (
        <>
          <div className="customer-management-heading">
            <div>
              <h2>Customer Management</h2>
              <p>Customer profiles are matched by phone number. Order counts and lifetime value come from saved orders; cancelled orders are excluded.</p>
            </div>
            <button type="button" className="button button-outline" onClick={loadCustomers} disabled={loading}>Refresh</button>
          </div>
          <form className="customer-add-form" onSubmit={handleAdd}>
            <label>Name<input required minLength={2} maxLength={120} value={form.customer_name} onChange={(event) => setForm({ ...form, customer_name: event.target.value })} /></label>
            <label>Phone<input required type="tel" maxLength={30} value={form.customer_phone} onChange={(event) => setForm({ ...form, customer_phone: event.target.value })} /></label>
            <label>Email (optional)<input type="email" maxLength={254} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
            <label>Address (optional)<input maxLength={500} value={form.delivery_address} onChange={(event) => setForm({ ...form, delivery_address: event.target.value })} /></label>
            <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Adding..." : "Add customer"}</button>
          </form>
        </>
      )}

      {compact && <h3>Archived customers</h3>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
      {!compact && mode === "active" && (
        <label className="customer-search">Search customers<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, phone, or email" /></label>
      )}

      {loading ? <p>Loading customers...</p> : (
        <div className="table-wrap">
          <table className="admin-table customer-table">
            <thead><tr><th>Customer</th><th>Contact</th><th>Orders</th><th>Lifetime value</th><th>Last order</th><th>Action</th></tr></thead>
            <tbody>
              {visibleCustomers.map((customer) => (
                <tr key={customer.customer_id}>
                  <td><strong>{customer.customer_name}</strong>{customer.delivery_address && <small>{customer.delivery_address}</small>}</td>
                  <td>{customer.customer_phone}{customer.email && <small>{customer.email}</small>}</td>
                  <td>{Number(customer.order_count || 0)}</td>
                  <td>{currency.format(Number(customer.total_spent || 0))}</td>
                  <td>{customer.last_order_at ? new Date(customer.last_order_at).toLocaleDateString("fi-FI") : "—"}</td>
                  <td>{mode === "archived"
                    ? <button type="button" className="button button-primary" onClick={() => restoreCustomer(customer)}>Restore</button>
                    : <button type="button" className="button button-outline" onClick={() => archiveCustomer(customer)}>Archive</button>}</td>
                </tr>
              ))}
              {!visibleCustomers.length && <tr><td colSpan={6}>{mode === "archived" ? "No archived customers." : "No customers match this search."}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
