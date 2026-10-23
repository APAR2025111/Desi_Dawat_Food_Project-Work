const API_BASE =
  import.meta.env.VITE_API_BASE_URL || `${window.location.protocol}//${window.location.hostname}:3001/api`;
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
    throw error;
  }
  return data;
}

export const getMenu = () => request("/menu");
// Checkout delivery quote: let the backend apply the restaurant's distance and order-total rules.
export const getDeliveryQuote = (deliveryAddress, foodSubtotal) =>
  request("/delivery-quote", {
    method: "POST",
    body: JSON.stringify({ delivery_address: deliveryAddress, food_subtotal: foodSubtotal }),
  });
export const loginAdmin = (username, password) =>
  request("/admin/login", { method: "POST", body: JSON.stringify({ username, password }) });

// Admin session check: verify the saved token with the backend before showing protected routes.
export const validateAdminSession = (token) =>
  request("/admin/session", {
    headers: { Authorization: `Bearer ${token}` },
  });

export const getAdminMenu = (token) =>
  request("/admin/menu", { headers: { Authorization: `Bearer ${token}` } });

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

export const updateOrderStatus = (token, orderId, order_status) =>
  request(`/admin/orders/${orderId}/status`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ order_status }),
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
    body: JSON.stringify({ discount_percent }),
  });
export const getOpeningHours = () =>
  request("/opening-hours");

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
