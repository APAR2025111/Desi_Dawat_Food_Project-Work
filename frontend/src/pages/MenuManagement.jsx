import React, { useEffect, useMemo, useState } from "react";
import { deleteMenuItem, getAdminMenu, saveMenuItem } from "../api.js";

// Menu dashboard: provide the same item editing, availability, and removal actions as the full admin console.
const emptyMenuItem = {
  main_category: "",
  subcategory: "",
  item_name: "",
  quantity_serving: "1 serving",
  price_eur: "",
  short_information: "",
  image_url: "",
  is_available: true,
};

const isItemAvailable = (item) => Boolean(Number(item.is_available));

export default function MenuManagement({ token }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyMenuItem);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  async function loadItems() {
    setLoading(true);
    setError("");
    try {
      const data = await getAdminMenu(token);
      setItems(Array.isArray(data) ? data : data?.items || []);
    } catch (loadError) {
      setError(loadError.message || "Could not load menu items.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("Your admin session has expired. Please sign in again.");
      return;
    }
    loadItems();
  }, [token]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => [
      item.item_name,
      item.main_category,
      item.subcategory,
      item.short_information,
    ].some((value) => String(value || "").toLowerCase().includes(query)));
  }, [items, search]);

  function resetForm() {
    setEditingId(null);
    setForm(emptyMenuItem);
  }

  function editItem(item) {
    setEditingId(item.item_id);
    setForm({
      main_category: item.main_category || "",
      subcategory: item.subcategory || "",
      item_name: item.item_name || "",
      quantity_serving: item.quantity_serving || "",
      price_eur: String(item.price_eur ?? ""),
      short_information: item.short_information || "",
      image_url: item.image_url || "",
      is_available: isItemAvailable(item),
    });
    setError("");
    setMessage("");
    document.getElementById("menu-item-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveItem(event) {
    event.preventDefault();
    const price = Number(form.price_eur);
    if (!Number.isFinite(price) || price < 0) {
      setError("Enter a valid price of €0.00 or more.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = { ...form, price_eur: price, is_available: Boolean(form.is_available) };
      await saveMenuItem(token, editingId ? { ...payload, item_id: editingId } : payload);
      setMessage(editingId ? "Menu item updated successfully." : "Menu item added successfully.");
      resetForm();
      await loadItems();
    } catch (saveError) {
      setError(saveError.message || "Could not save the menu item.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisibility(item) {
    const currentlyAvailable = isItemAvailable(item);
    setError("");
    setMessage("");
    try {
      await saveMenuItem(token, { ...item, is_available: !currentlyAvailable });
      setMessage(`${item.item_name}: ${currentlyAvailable ? "hidden from" : "shown on"} the customer menu.`);
      await loadItems();
    } catch (visibilityError) {
      setError(visibilityError.message || "Could not update menu visibility.");
    }
  }

  async function removeItem(item) {
    if (!window.confirm(`Permanently delete "${item.item_name}" from the menu? This cannot be undone.`)) return;
    setError("");
    setMessage("");
    try {
      await deleteMenuItem(token, item.item_id);
      if (editingId === item.item_id) resetForm();
      setMessage(`"${item.item_name}" was deleted.`);
      await loadItems();
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete the menu item.");
    }
  }

  async function uploadImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const apiBase = import.meta.env.VITE_API_BASE_URL || `${window.location.protocol}//${window.location.hostname}:3001/api`;
    const imageBase = apiBase.replace(/\/api\/?$/, "");
    const data = new FormData();
    data.append("image", file);
    setError("");
    try {
      const response = await fetch(`${apiBase}/admin/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: data,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Image upload failed.");
      setForm((current) => ({ ...current, image_url: `${imageBase}${result.image_url}` }));
      setMessage("Food picture uploaded. Save the menu item to keep the image.");
    } catch (uploadError) {
      setError(uploadError.message || "Could not upload the food picture.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="time-management menu-management">
      <h2>Menu Management / Ruokalistan hallinta</h2>
      <p>Add menu dishes, update their details, and control whether customers can see them.</p>

      {/* Menu editor: mirror the full admin console fields and save behavior. */}
      <form id="menu-item-editor" className="panel editor-form" onSubmit={saveItem}>
        <div className="panel-heading">
          <h3>{editingId ? `Edit item #${editingId}` : "Add a menu item"}</h3>
          {editingId && <button type="button" className="text-button" onClick={resetForm}>Cancel edit</button>}
        </div>
        <div className="form-grid">
          <label>Dish name *
            <input value={form.item_name} onChange={(event) => setForm({ ...form, item_name: event.target.value })} required maxLength="200" />
          </label>
          <label>Main category *
            <input value={form.main_category} onChange={(event) => setForm({ ...form, main_category: event.target.value })} required maxLength="100" placeholder="e.g. Curries" />
          </label>
          <label>Subcategory
            <input value={form.subcategory} onChange={(event) => setForm({ ...form, subcategory: event.target.value })} maxLength="100" />
          </label>
          <label>Serving size
            <input value={form.quantity_serving} onChange={(event) => setForm({ ...form, quantity_serving: event.target.value })} maxLength="100" />
          </label>
          <label>Price (€) *
            <input type="number" min="0" step="0.01" value={form.price_eur} onChange={(event) => setForm({ ...form, price_eur: event.target.value })} required />
          </label>
          <label className="check-label">
            <input type="checkbox" checked={form.is_available} onChange={(event) => setForm({ ...form, is_available: event.target.checked })} />
            Display on customer menu
          </label>
          <label className="full-field">Description
            <textarea rows="3" value={form.short_information} onChange={(event) => setForm({ ...form, short_information: event.target.value })} />
          </label>
          <label className="full-field">Food picture URL
            <input type="url" value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })} placeholder="Paste the food picture URL here" />
            <input type="file" accept="image/*" onChange={uploadImage} />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        {message && <p className="form-success">{message}</p>}
        <div className="form-actions">
          <button type="submit" className="button button-primary" disabled={saving}>{saving ? "Saving..." : editingId ? "Save changes" : "Add item"}</button>
          <button type="button" className="button button-outline" onClick={resetForm}>Clear form</button>
        </div>
      </form>

      {/* Menu list: show current availability and provide the existing edit, hide/show, and delete actions. */}
      <div className="panel-heading admin-list-heading">
        <h3>Menu items <span className="count-pill">{items.length}</span></h3>
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search dishes or categories" aria-label="Search menu items" />
      </div>
      {loading ? <p>Loading menu items...</p> : error && !items.length ? null : (
        <div className="table-wrap">
          <table className="admin-table">
            <thead><tr><th>Dish</th><th>Category</th><th>Serving</th><th>Price</th><th>Visibility</th><th>Actions</th></tr></thead>
            <tbody>
              {filteredItems.map((item) => {
                const available = isItemAvailable(item);
                return <tr key={item.item_id}>
                  <td>{item.item_name || "—"}<small>{item.short_information || ""}</small>{item.image_url && <small>Food image added</small>}</td>
                  <td>{item.main_category || "—"}<small>{item.subcategory || ""}</small></td>
                  <td>{item.quantity_serving || "—"}</td>
                  <td>€{Number(item.price_eur || 0).toFixed(2)}</td>
                  <td><span className={`status ${available ? "status-on" : "status-off"}`}>{available ? "Visible" : "Hidden"}</span></td>
                  <td><div className="row-actions">
                    <button type="button" className="text-button" onClick={() => editItem(item)}>Edit</button>
                    <button type="button" className="text-button" onClick={() => toggleVisibility(item)}>{available ? "Hide" : "Show"}</button>
                    <button type="button" className="text-button danger-text" onClick={() => removeItem(item)}>Delete</button>
                  </div></td>
                </tr>;
              })}
              {!filteredItems.length && <tr><td colSpan="6">{items.length ? "No matching menu items." : "No menu items found."}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}