export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? `${window.location.protocol}//${window.location.hostname}:3001/api`
    : "/api");
export const API_ORIGIN = new URL(API_BASE, window.location.origin).origin;

// Resolve uploads served by the API, including legacy local URLs saved before deployment.
export function resolveImageUrl(value, { driveThumbnailWidth = 600 } = {}) {
  const imageUrl = String(value ?? "").trim();
  if (!imageUrl) return "";
  // Ask Google Drive for a screen-sized image thumbnail instead of downloading
  // the full-resolution original into menu cards and flyers.
  try {
    const parsed = new URL(imageUrl, window.location.origin);
    if (parsed.hostname === "drive.google.com") {
      const fileId = parsed.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || parsed.searchParams.get("id");
      if (fileId) {
        return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${driveThumbnailWidth}`;
      }
    }
  } catch {
    // Keep unusual existing image references unchanged so the browser can report them normally.
  }
  if (imageUrl.startsWith("/uploads/")) return `${API_ORIGIN}${imageUrl}`;
  try {
    const parsed = new URL(imageUrl, window.location.origin);
    if (["localhost", "127.0.0.1"].includes(parsed.hostname) && parsed.pathname.startsWith("/uploads/")) {
      return `${API_ORIGIN}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    // Keep unusual existing image references unchanged so the browser can report them normally.
  }
  return imageUrl;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // Admin session handling: clear rejected tokens and notify the route guard, except for failed login attempts.
    if (
      (response.status === 401 || response.status === 403) &&
      path.startsWith("/admin/") &&
      path !== "/admin/login"
    ) {
      sessionStorage.removeItem("desiDawatAdminToken");
      window.dispatchEvent(new Event("desidawat-admin-session-invalid"));
    }

    // Preserve API error codes so checkout can stop immediately for known out-of-area addresses.
    const error = new Error(data.error || data.message || `Request failed (${response.status})`);
    error.code = data.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

export const getMenu = () => request("/menu");
export const submitOrder = (order, customerToken) =>
  request("/orders", {
    method: "POST",
    headers: customerToken ? { Authorization: `Bearer ${customerToken}` } : {},
    body: JSON.stringify(order),
  });
// Checkout delivery quote: let the backend apply the restaurant's distance and order-total rules.
export const getDeliveryQuote = (deliveryAddress, foodSubtotal) =>
  request("/delivery-quote", {
    method: "POST",
    body: JSON.stringify({ delivery_address: deliveryAddress, food_subtotal: foodSubtotal }),
  });
export const loginAdmin = (username, password) =>
  request("/admin/login", { method: "POST", body: JSON.stringify({ username, password }) });

export const registerCustomer = (customer) =>
  request("/customer-auth/register", {
    method: "POST",
    body: JSON.stringify(customer),
  });
export const loginCustomer = (email, password) =>
  request("/customer-auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
export const getCustomerSession = (token, signal) =>
  request("/customer-auth/session", {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });

export const getCustomerOrders = (token, signal) =>
  request("/customer/orders", {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });

export async function getCustomerOrderReceiptPdf(token, orderId) {
  const response = await fetch(`${API_BASE}/customer/orders/${encodeURIComponent(orderId)}/receipt.pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "Could not load this receipt.");
    throw new Error(message || "Could not load this receipt.");
  }
  return response.blob();
}

export const getCustomerSurpriseRewards = (token, signal) =>
  request("/customer/surprise-rewards", {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });

export const getAdminSurpriseRewardDishes = (token) =>
  request("/admin/surprise-reward-dishes", {
    headers: { Authorization: `Bearer ${token}` },
  });

export const saveAdminSurpriseRewardDishes = (token, item_ids) =>
  request("/admin/surprise-reward-dishes", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ item_ids }),
  });

export const getAdminSurpriseRewardSettings = (token) =>
  request("/admin/surprise-reward-settings", {
    headers: { Authorization: `Bearer ${token}` },
  });

export const saveAdminSurpriseRewardSettings = (token, settings) =>
  request("/admin/surprise-reward-settings", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(settings),
  });

export const saveCustomerDateOfBirth = (token, dateOfBirth) =>
  request("/customer/date-of-birth", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ date_of_birth: dateOfBirth }),
  });

// Admin session check: verify the saved token with the backend before showing protected routes.
export const validateAdminSession = (token) =>
  request("/admin/session", {
    headers: { Authorization: `Bearer ${token}` },
  });

export const getAdminMenu = (token) =>
  request("/admin/menu", { cache: "no-store", headers: { Authorization: `Bearer ${token}` } });

export const saveMenuItem = (token, item) => {
  const editing = Boolean(item.item_id);
  return request(editing ? `/admin/menu/${item.item_id}` : "/admin/menu", {
    method: editing ? "PUT" : "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(item),
  });
};

export const deleteMenuItem = (token, id) =>
  request(`/admin/menu/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

export const getAdminOrders = (token) =>
  request("/admin/orders", {
    headers: { Authorization: `Bearer ${token}` },
  });

export const getAdminCustomers = (token) =>
  request("/admin/customers", {
    headers: { Authorization: `Bearer ${token}` },
  });

export const addAdminCustomer = (token, customer) =>
  request("/admin/customers", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(customer),
  });

export const archiveAdminCustomer = (token, customerId) =>
  request(`/admin/customers/${customerId}/archive`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });

export const restoreAdminCustomer = (token, customerId) =>
  request(`/admin/customers/${customerId}/restore`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
  });

export const updateOrderStatus = (token, orderId, order_status) =>
  request(`/admin/orders/${orderId}/status`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ order_status }),
  });

export const updateOrderRemark = (token, orderId, admin_remark) =>
  request(`/admin/orders/${orderId}/remark`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ admin_remark }),
  });
  
export const updatePaymentStatus = (token, orderId, payment_status) =>
  request(`/admin/orders/${orderId}/payment-status`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ payment_status }),
  });

export const deleteOrder = (token, orderId) =>
  request(`/admin/orders/${orderId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });


export const updateDeliveryCharge = (token, orderId, delivery_charge) =>
  request(`/admin/orders/${orderId}/delivery-charge`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ delivery_charge }),
  });

// Order discount API: save an admin-entered percentage and return the recalculated bill total.
export const updateOrderDiscount = (token, orderId, discount_percent) =>
  request(`/admin/orders/${orderId}/discount`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(typeof discount_percent === "object" ? discount_percent : { discount_percent }),
  });
export const updateAdminOrderReceipt = (token, orderId, receipt) =>
  request(`/admin/orders/${orderId}/edit`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(receipt),
  });
export const getOpeningHours = () =>
  request("/opening-hours", { cache: "no-store" });

export const getAboutPage = () => request("/about");

export const saveAboutPage = (token, content) =>
  request("/admin/about", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(content),
  });

export const uploadAboutMedia = async (token, file) => {
  const form = new FormData();
  form.append("media", file);
  const response = await fetch(`${API_BASE}/admin/about/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      sessionStorage.removeItem("desiDawatAdminToken");
      window.dispatchEvent(new Event("desidawat-admin-session-invalid"));
    }
    throw new Error(data.error || `Upload failed (${response.status})`);
  }
  return data;
};

export const deleteAboutMedia = (token, mediaId) =>
  request(`/admin/about/media/${mediaId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

export const saveOpeningHours = (token, hours) =>
  request("/admin/opening-hours", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ hours }),
  });

  
export const getAdminInventory = (token) =>
  request("/admin/inventory", {
    headers: { Authorization: `Bearer ${token}` },
  });

export const addInventoryItem = (token, item) =>
  request("/admin/inventory", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(item),
  });

export const updateInventoryItem = (token, id, item) =>
  request(`/admin/inventory/${id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(item),
  });

export const deleteInventoryItem = (token, id) =>
  request(`/admin/inventory/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });

// Private business documents: all file and draft routes require an admin session.
export const getAdminDocuments = (token) =>
  request("/admin/documents", {
    headers: { Authorization: `Bearer ${token}` },
  });

export const getLocalAiModels = (token) =>
  request("/admin/documents/ai/models", {
    headers: { Authorization: `Bearer ${token}` },
  });

export const generateBusinessDocumentDraft = (token, prompt) =>
  request("/admin/documents/ai/generate", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(prompt),
  });

export const translateMenuText = (token, details) =>
  request("/admin/documents/ai/translate-menu", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(details),
  });

export const saveBusinessDocumentDraft = (token, document) =>
  request("/admin/documents", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(document),
  });

export const getBusinessDocumentContent = (token, documentId) =>
  request(`/admin/documents/${documentId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });

export async function uploadBusinessDocument(token, file, metadata) {
  const form = new FormData();
  form.append("file", file);
  form.append("title", metadata.title);
  form.append("document_type", metadata.document_type);
  form.append("notes", metadata.notes || "");
  const response = await fetch(`${API_BASE}/admin/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      sessionStorage.removeItem("desiDawatAdminToken");
      window.dispatchEvent(new Event("desidawat-admin-session-invalid"));
    }
    throw new Error(data.error || `Upload failed (${response.status})`);
  }
  return data;
}

export async function updateBusinessDocument(token, documentId, details) {
  const form = new FormData();
  form.append("title", details.title);
  form.append("document_type", details.document_type);
  form.append("notes", details.notes || "");
  if (details.file) form.append("file", details.file);
  const response = await fetch(`${API_BASE}/admin/documents/${documentId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      sessionStorage.removeItem("desiDawatAdminToken");
      window.dispatchEvent(new Event("desidawat-admin-session-invalid"));
    }
    throw new Error(data.error || `Update failed (${response.status})`);
  }
  return data;
}

export async function downloadBusinessDocument(token, documentId, filename) {
  const response = await fetch(`${API_BASE}/admin/documents/${documentId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 || response.status === 403) {
      sessionStorage.removeItem("desiDawatAdminToken");
      window.dispatchEvent(new Event("desidawat-admin-session-invalid"));
    }
    throw new Error(data.error || `Download failed (${response.status})`);
  }
  const blobUrl = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = filename || "business-document";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
}

export const deleteBusinessDocument = (token, documentId) =>
  request(`/admin/documents/${documentId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
