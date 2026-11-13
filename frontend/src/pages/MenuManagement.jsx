import React, { useEffect, useMemo, useRef, useState } from "react";
import { API_BASE, API_ORIGIN, deleteMenuItem, getAdminMenu, getLocalAiModels, saveMenuItem, resolveImageUrl, translateMenuText } from "../api.js";
import { getBilingualMenuLines } from "../utils/bilingualMenuText.js";

// Menu dashboard: provide the same item editing, availability, and removal actions as the full admin console.
const emptyMenuItem = {
  display_code: "",
  main_category: "",
  subcategory: "",
  item_name: "",
  quantity_serving: "1 serving",
  price_eur: "",
  short_information: "",
  image_url: "",
  allergen_codes: [],
  is_available: true,
  item_name_fi: "",
  short_information_fi: "",
};
const customCategoryOption = "__custom_occasion_category__";

const allergenOptions = [
  ["A1", "Cereals containing gluten"],
  ["A2", "Peanuts and peanut products"],
  ["A3", "Soybeans and soybean products"],
  ["A4", "Milk and milk products (including lactose)"],
  ["A5", "Nuts and nut products"],
  ["A6", "Mustard and mustard products"],
  ["A7", "Celery and celery products"],
  ["A8", "Sesame seeds and sesame seed products"],
  ["A9", "Sulphur dioxide and sulphites (above 10 mg/kg or 10 mg/l as total sulphur dioxide)"],
  ["A10", "Lupin and lupin products"],
];

const isItemAvailable = (item) => Boolean(Number(item.is_available));

function splitBilingualValue(value) {
  const lines = getBilingualMenuLines(value);
  return { english: lines[0] || "", finnish: lines[1] || "" };
}

function joinBilingualValue(english, finnish) {
  const en = String(english || "").trim();
  const fi = String(finnish || "").trim();
  return fi ? `${en} | ${fi}` : en;
}

export default function MenuManagement({ token }) {
  const allergenPickerRef = useRef(null);
  const translationTimers = useRef({});
  const translationTasks = useRef({ name: Promise.resolve(null), description: Promise.resolve(null) });
  const translationTaskResolvers = useRef({ name: null, description: null });
  const completedTranslations = useRef({ name: null, description: null });
  const translationRequests = useRef({ name: 0, description: 0 });
  const pendingTranslations = useRef({ name: "", description: "" });
  const finnishEdited = useRef({ name: false, description: false });
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyMenuItem);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [customCategoryName, setCustomCategoryName] = useState("");
  const [translationModel, setTranslationModel] = useState("");
  const [translationAvailable, setTranslationAvailable] = useState(null);
  const [translationStatus, setTranslationStatus] = useState({ name: "", description: "" });

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

  useEffect(() => {
    let active = true;
    if (!token) return undefined;
    getLocalAiModels(token)
      .then((result) => {
        if (!active) return;
        const models = Array.isArray(result?.models) ? result.models : [];
        setTranslationAvailable(Boolean(result?.available && models.length));
        const translationModel = models.find(({ name }) => /translategemma/i.test(name)) || models[0];
        setTranslationModel(translationModel?.name || "");
        if (!result?.available || !models.length) {
          setTranslationStatus((current) => ({
            name: pendingTranslations.current.name ? "Ollama is unavailable. Start it and reopen Menu Management to translate." : current.name,
            description: pendingTranslations.current.description ? "Ollama is unavailable. Start it and reopen Menu Management to translate." : current.description,
          }));
        }
      })
      .catch(() => {
        if (!active) return;
        setTranslationAvailable(false);
        setTranslationStatus((current) => ({
          name: pendingTranslations.current.name ? "Could not check Ollama. Start it and reopen Menu Management to translate." : current.name,
          description: pendingTranslations.current.description ? "Could not check Ollama. Start it and reopen Menu Management to translate." : current.description,
        }));
      });
    return () => { active = false; };
  }, [token]);

  useEffect(() => {
    if (!translationAvailable || !translationModel) return;
    Object.entries(pendingTranslations.current).forEach(([field, text]) => {
      if (!text || finnishEdited.current[field]) return;
      pendingTranslations.current[field] = "";
      updateEnglishText(field === "name" ? "item_name" : "short_information", text);
    });
  }, [translationAvailable, translationModel]);

  useEffect(() => () => {
    Object.values(translationTimers.current).forEach(clearTimeout);
  }, []);

  useEffect(() => {
    function closeAllergenPicker(event) {
      if (allergenPickerRef.current?.open && !allergenPickerRef.current.contains(event.target)) {
        allergenPickerRef.current.open = false;
      }
    }
    document.addEventListener("pointerdown", closeAllergenPicker);
    return () => document.removeEventListener("pointerdown", closeAllergenPicker);
  }, []);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => [
      item.item_name,
      item.display_code,
      item.main_category,
      item.subcategory,
      item.short_information,
    ].some((value) => String(value || "").toLowerCase().includes(query)));
  }, [items, search]);

  const mainCategories = useMemo(() => Array.from(new Set(
    items.map((item) => String(item.main_category || "").trim()).filter(Boolean)
  )).sort((first, second) => first.localeCompare(second)), [items]);

  function resetForm() {
    cancelAllTranslations();
    translationRequests.current = { name: translationRequests.current.name + 1, description: translationRequests.current.description + 1 };
    pendingTranslations.current = { name: "", description: "" };
    finnishEdited.current = { name: false, description: false };
    setTranslationStatus({ name: "", description: "" });
    setEditingId(null);
    setForm(emptyMenuItem);
    setCustomCategoryName("");
    setUploadError("");
  }

  function editItem(item) {
    const itemName = splitBilingualValue(item.item_name);
    const itemDescription = splitBilingualValue(item.short_information);
    setEditingId(item.item_id);
    cancelAllTranslations();
    translationRequests.current = { name: translationRequests.current.name + 1, description: translationRequests.current.description + 1 };
    pendingTranslations.current = { name: "", description: "" };
    finnishEdited.current = { name: false, description: false };
    setTranslationStatus({ name: "", description: "" });
    setCustomCategoryName("");
    setUploadError("");
    setForm({
      display_code: item.display_code || "",
      main_category: item.main_category || "",
      subcategory: item.subcategory || "",
      item_name: itemName.english,
      item_name_fi: itemName.finnish,
      quantity_serving: item.quantity_serving || "",
      price_eur: String(item.price_eur ?? ""),
      short_information: itemDescription.english,
      short_information_fi: itemDescription.finnish,
      image_url: resolveImageUrl(item.image_url),
      allergen_codes: Array.isArray(item.allergen_codes) ? item.allergen_codes : String(item.allergen_codes || "").split(",").filter(Boolean),
      is_available: isItemAvailable(item),
    });
    // When an older menu record has no Finnish fields yet, editing it should
    // start the same local translation flow used when adding a new dish.
    if (!itemName.finnish) updateEnglishText("item_name", itemName.english);
    if (!itemDescription.finnish) updateEnglishText("short_information", itemDescription.english);
    setError("");
    setMessage("");
    document.getElementById("menu-item-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelTranslation(field) {
    clearTimeout(translationTimers.current[field]);
    translationTimers.current[field] = null;
    translationTaskResolvers.current[field]?.(null);
    translationTaskResolvers.current[field] = null;
    translationTasks.current[field] = Promise.resolve(null);
  }

  function cancelAllTranslations() {
    cancelTranslation("name");
    cancelTranslation("description");
    completedTranslations.current = { name: null, description: null };
  }

  function updateEnglishText(field, value) {
    const translationField = field === "item_name" ? "name" : "description";
    const finnishField = field === "item_name" ? "item_name_fi" : "short_information_fi";
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(!finnishEdited.current[translationField] ? { [finnishField]: "" } : {}),
    }));
    translationRequests.current[translationField] += 1;
    const requestId = translationRequests.current[translationField];
    cancelTranslation(translationField);
    completedTranslations.current[translationField] = null;
    pendingTranslations.current[translationField] = "";
    if (finnishEdited.current[translationField] || !value.trim() || value.trim().length < 3) {
      setTranslationStatus((current) => ({ ...current, [translationField]: "" }));
      return;
    }
    const maxCharacters = translationField === "name" ? 200 - value.trim().length - 3 : 5000;
    if (maxCharacters < 1) {
      setTranslationStatus((current) => ({ ...current, [translationField]: "Shorten the English name to leave room for its Finnish translation." }));
      return;
    }
    if (!translationAvailable || !translationModel) {
      pendingTranslations.current[translationField] = value.trim();
      setTranslationStatus((current) => ({ ...current, [translationField]: "Waiting for local Ollama; Finnish can also be entered manually." }));
      return;
    }

    setTranslationStatus((current) => ({ ...current, [translationField]: "Finnish translation will appear shortly…" }));
    translationTasks.current[translationField] = new Promise((resolve) => {
      translationTaskResolvers.current[translationField] = resolve;
    });
    translationTimers.current[translationField] = setTimeout(async () => {
      let outcome = null;
      try {
        const result = await translateMenuText(token, { text: value.trim(), field: translationField, model: translationModel, max_characters: maxCharacters });
        if (translationRequests.current[translationField] !== requestId || finnishEdited.current[translationField]) return;
        const translation = String(result.translation || "").trim();
        completedTranslations.current[translationField] = { source: value.trim(), translation };
        outcome = { source: value.trim(), translation };
        setForm((current) => ({ ...current, [finnishField]: translation }));
        setTranslationStatus((current) => ({ ...current, [translationField]: "Finnish translation added. You can edit it before saving." }));
      } catch (translationError) {
        if (translationRequests.current[translationField] !== requestId) return;
        setTranslationStatus((current) => ({ ...current, [translationField]: translationError.message || "Finnish translation failed; enter it manually." }));
      } finally {
        if (translationRequests.current[translationField] === requestId) {
          translationTaskResolvers.current[translationField]?.(outcome);
          translationTaskResolvers.current[translationField] = null;
          translationTimers.current[translationField] = null;
        }
      }
    }, 900);
  }

  function updateFinnishText(field, value) {
    const translationField = field === "item_name_fi" ? "name" : "description";
    finnishEdited.current[translationField] = Boolean(value.trim());
    pendingTranslations.current[translationField] = "";
    translationRequests.current[translationField] += 1;
    cancelTranslation(translationField);
    completedTranslations.current[translationField] = null;
    setTranslationStatus((current) => ({ ...current, [translationField]: "" }));
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveItem(event) {
    event.preventDefault();
    if (uploadingImage) {
      setError("Please wait for the image upload to finish before saving.");
      return;
    }
    const mainCategory = form.main_category === customCategoryOption
      ? customCategoryName.trim()
      : form.main_category.trim();
    if (!mainCategory) {
      setError(form.main_category === customCategoryOption
        ? "Enter a name for this occasion category."
        : "Select a main category.");
      return;
    }
    const price = Number(form.price_eur);
    if (!Number.isFinite(price) || price < 0) {
      setError("Enter a valid price of €0.00 or more.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const pendingResults = await Promise.all(Object.values(translationTasks.current));
      const translatedName = pendingResults.find((result) => result?.source === form.item_name.trim() && result.translation)?.translation;
      const translatedDescription = pendingResults.find((result) => result?.source === form.short_information.trim() && result.translation)?.translation;
      const savedFinnishName = form.item_name_fi.trim() || (completedTranslations.current.name?.source === form.item_name.trim()
        ? completedTranslations.current.name.translation
        : translatedName) || "";
      const savedFinnishDescription = form.short_information_fi.trim() || (completedTranslations.current.description?.source === form.short_information.trim()
        ? completedTranslations.current.description.translation
        : translatedDescription) || "";
      const payload = {
        ...form,
        item_name: joinBilingualValue(form.item_name, savedFinnishName),
        short_information: joinBilingualValue(form.short_information, savedFinnishDescription),
        main_category: mainCategory,
        price_eur: price,
        is_available: Boolean(form.is_available),
      };
      const savedItem = await saveMenuItem(token, editingId ? { ...payload, item_id: editingId } : payload);
      if (savedItem?.item_id) {
        setItems((current) => {
          const nextItems = editingId
            ? current.map((item) => String(item.item_id) === String(savedItem.item_id) ? savedItem : item)
            : [...current, savedItem];
          return nextItems.sort((first, second) =>
            String(first.main_category || "").localeCompare(String(second.main_category || "")) ||
            String(first.item_name || "").localeCompare(String(second.item_name || ""))
          );
        });
      } else {
        await loadItems();
      }
      const savedMessage = editingId ? "Menu item updated successfully." : "Menu item added successfully.";
      const imageNote = uploadError ? " The image was not attached; retry the upload to add it." : "";
      resetForm();
      setMessage(`${savedMessage}${imageNote}`);
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
    const data = new FormData();
    data.append("image", file);
    setError("");
    setUploadError("");
    setUploadingImage(true);
    try {
      const response = await fetch(`${API_BASE}/admin/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: data,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Image upload failed.");
      setForm((current) => ({ ...current, image_url: `${API_ORIGIN}${result.image_url}` }));
      setMessage("Food picture uploaded. Save the menu item to keep the image.");
    } catch (uploadError) {
      setUploadError(uploadError instanceof TypeError
        ? "Could not reach the image upload service. The menu item can still be saved without a photo; retry the upload when the backend is available."
        : uploadError.message || "Could not upload the food picture.");
    } finally {
      setUploadingImage(false);
      event.target.value = "";
    }
  }

  return (
    <div className="time-management menu-management">
      <h2>Menu Management / Ruokalistan hallinta</h2>
      <p>Add and manage menu dishes / Lisää ja hallitse ruokalistan annoksia.</p>

      {/* Menu editor: mirror the full admin console fields and save behavior. */}
      <form id="menu-item-editor" className="panel editor-form" onSubmit={saveItem}>
        <div className="panel-heading">
          <h3>{editingId ? `Edit item #${editingId}` : "Add a menu item"}</h3>
          {editingId && <button type="button" className="text-button" onClick={resetForm}>Cancel edit</button>}
        </div>
        <div className="form-grid">
          <label>Dish name — English *
            <input value={form.item_name} onChange={(event) => updateEnglishText("item_name", event.target.value)} required maxLength="200" disabled={saving} />
          </label>
          <label>Dish name — Finnish
            <input value={form.item_name_fi} onChange={(event) => updateFinnishText("item_name_fi", event.target.value)} maxLength="200" placeholder="Auto-translated by local Ollama" disabled={saving} />
            <small aria-live="polite">{translationStatus.name || (translationAvailable === null ? "Checking local Ollama…" : translationAvailable ? `Local translation via ${translationModel}` : "Start Ollama locally to enable Finnish auto-translation.")}</small>
          </label>
          <label>Menu item number
            <input value={form.display_code || ""} onChange={(event) => setForm({ ...form, display_code: event.target.value.replace(/\D/g, "") })} maxLength="9" pattern="[0-9]{1,9}" placeholder="Auto-assigned from 24 onward" />
          </label>
          <label>Main category *
            <select value={form.main_category} onChange={(event) => {
              const mainCategory = event.target.value;
              setForm({ ...form, main_category: mainCategory });
              if (mainCategory === customCategoryOption) setCustomCategoryName("");
            }} required>
              <option value="">Select a category</option>
              {mainCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              <option value={customCategoryOption}>Add a custom occasion category…</option>
            </select>
          </label>
          {form.main_category === customCategoryOption && <label>Occasion category name *
            <input value={customCategoryName} onChange={(event) => setCustomCategoryName(event.target.value)} required maxLength="100" placeholder="e.g. Diwali Specials" />
          </label>}
          <label>Subcategory
            <input value={form.subcategory} onChange={(event) => setForm({ ...form, subcategory: event.target.value })} maxLength="100" />
          </label>
          <label>Serving size
            <input value={form.quantity_serving} onChange={(event) => setForm({ ...form, quantity_serving: event.target.value })} maxLength="100" />
          </label>
          <label>Price (€) *
            <input type="number" min="0" step="0.01" value={form.price_eur} onChange={(event) => setForm({ ...form, price_eur: event.target.value })} required />
          </label>
          <div className="allergen-picker-field">
            <span>Allergens (select all that apply)</span>
            <details className="allergen-picker" ref={allergenPickerRef}>
              <summary>{form.allergen_codes.length ? `${form.allergen_codes.join(", ")} selected` : "Select allergen codes"}</summary>
              <div className="allergen-picker-options">
                {allergenOptions.map(([code, label]) => <label key={code}><input type="checkbox" checked={form.allergen_codes.includes(code)} onChange={(event) => setForm({ ...form, allergen_codes: event.target.checked ? [...form.allergen_codes, code] : form.allergen_codes.filter((selected) => selected !== code) })} /> <strong>{code}</strong> — {label}</label>)}
              </div>
            </details>
            <small>Choose only allergens confirmed for this dish.</small>
          </div>
          <label className="check-label">
            <input type="checkbox" checked={form.is_available} onChange={(event) => setForm({ ...form, is_available: event.target.checked })} />
            Display on customer menu
          </label>
          <label className="full-field">Description — English
            <textarea rows="3" value={form.short_information} onChange={(event) => updateEnglishText("short_information", event.target.value)} disabled={saving} />
          </label>
          <label className="full-field">Description — Finnish
            <textarea rows="3" value={form.short_information_fi} onChange={(event) => updateFinnishText("short_information_fi", event.target.value)} placeholder="Auto-translated by local Ollama" disabled={saving} />
            <small aria-live="polite">{translationStatus.description || (translationAvailable === null ? "Checking local Ollama…" : translationAvailable ? `Local translation via ${translationModel}` : "Start Ollama locally to enable Finnish auto-translation.")}</small>
          </label>
          <label className="full-field">Food picture URL
            <input type="url" value={form.image_url} onChange={(event) => setForm({ ...form, image_url: event.target.value })} placeholder="Paste the food picture URL here" />
            <input type="file" accept="image/*" onChange={uploadImage} disabled={uploadingImage} />
            {uploadingImage && <small>Uploading image…</small>}
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        {uploadError && <p className="form-error">{uploadError}</p>}
        {message && <p className="form-success">{message}</p>}
        <div className="form-actions">
          <button type="submit" className="button button-primary" disabled={saving || uploadingImage}>{uploadingImage ? "Uploading image…" : saving && (translationStatus.name.includes("shortly") || translationStatus.description.includes("shortly")) ? "Waiting for Finnish…" : saving ? "Saving…" : editingId ? "Save changes" : "Add item"}</button>
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
                  <td>{(() => {
                    const name = splitBilingualValue(item.item_name || "—");
                    const description = splitBilingualValue(item.short_information);
                    const allergenCodes = Array.isArray(item.allergen_codes) ? item.allergen_codes : String(item.allergen_codes || "").split(",").filter(Boolean);
                    return <>
                      <strong><span style={{ display: "block" }}>{name.english}{item.display_code ? ` (${item.display_code})` : ""}{allergenCodes.map((code) => ` (${code})`).join("")}</span>
                        <span className="menu-finnish-line" style={{ display: "block" }}>{name.finnish || "Finnish name not added"}</span>
                      </strong>
                      {(description.english || description.finnish) && <small>
                        {description.english && <span style={{ display: "block" }}>{description.english}</span>}
                        <span className="menu-finnish-line" style={{ display: "block" }}>{description.finnish || "Finnish description not added"}</span>
                      </small>}
                    </>;
                  })()}{item.image_url && <small>Food image added</small>}</td>
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
