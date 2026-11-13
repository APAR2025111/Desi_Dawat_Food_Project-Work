const rewardSelectionKey = (customerId) => `desiDawatSelectedReward:${customerId}`;

export function getSelectedCustomerRewardId(customerId) {
  if (!customerId) return "";
  try {
    return localStorage.getItem(rewardSelectionKey(customerId)) || "";
  } catch {
    return "";
  }
}

export function saveSelectedCustomerRewardId(customerId, rewardId) {
  if (!customerId) return;
  try {
    if (rewardId) localStorage.setItem(rewardSelectionKey(customerId), String(rewardId));
    else localStorage.removeItem(rewardSelectionKey(customerId));
  } catch {
    // Coupon selection still works for the current checkout if storage is unavailable.
  }
}
