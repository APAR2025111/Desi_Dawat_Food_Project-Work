const API_BASE =
  import.meta.env.VITE_API_BASE_URL || `${window.location.protocol}//${window.location.hostname}:3001/api`;
async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export const getMenu = () => request("/menu");
export const loginAdmin = (username, password) =>
  request("/admin/login", { method: "POST", body: JSON.stringify({ username, password }) });

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

export const getOpeningHours = () =>
  request("/opening-hours");

export const saveOpeningHours = (token, hours) =>
  request("/admin/opening-hours", {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ hours }),
  });
