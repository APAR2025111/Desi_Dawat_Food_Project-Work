import React, { useEffect, useState } from "react";
import {
  getAdminSurpriseRewardDishes,
  getAdminSurpriseRewardSettings,
  saveAdminSurpriseRewardDishes,
  saveAdminSurpriseRewardSettings,
} from "../api.js";

const defaultCycle = [
  ...Array.from({ length: 5 }, () => ({ type: "percent", min: 1, max: 5 })),
  ...Array.from({ length: 6 }, () => ({ type: "addon" })),
  ...Array.from({ length: 3 }, () => ({ type: "percent", min: 6, max: 8 })),
  { type: "percent", min: 9, max: 10 },
];

export default function RewardsManagement({ token }) {
  const [items, setItems] = useState([]);
  const [rewardDishIds, setRewardDishIds] = useState([]);
  const [cycle, setCycle] = useState(defaultCycle);
  const [validityDays, setValidityDays] = useState(15);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (!token) {
      setLoading(false);
      setError("Your admin session has expired. Please sign in again.");
      return () => { active = false; };
    }
    Promise.all([getAdminSurpriseRewardSettings(token), getAdminSurpriseRewardDishes(token)])
      .then(([settings, dishData]) => {
        if (!active) return;
        setValidityDays(Number(settings.validity_days) || 15);
        setCycle(Array.isArray(settings.cycle_config) && settings.cycle_config.length === 15 ? settings.cycle_config : defaultCycle);
        const menuItems = Array.isArray(dishData?.items) ? dishData.items : [];
        setItems(menuItems);
        setRewardDishIds(menuItems.filter((item) => Boolean(Number(item.is_reward_choice))).map((item) => Number(item.item_id)));
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Could not load reward settings. Apply database migration 018, then reload this page.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  function updateSlot(index, field, value) {
    setCycle((current) => current.map((slot, slotIndex) => {
      if (slotIndex !== index) return slot;
      if (field === "type") return value === "addon" ? { type: "addon" } : { type: "percent", min: 1, max: 5 };
      return { ...slot, [field]: Number(value) };
    }));
  }

  function toggleDish(itemId, checked) {
    setRewardDishIds((current) => checked
      ? [...new Set([...current, itemId])]
      : current.filter((id) => id !== itemId));
  }

  async function saveSettings(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const hasAddon = cycle.some((slot) => slot.type === "addon");
      if (hasAddon && rewardDishIds.length === 0) throw new Error("Choose at least one available dish for free add-on rewards.");
      if (hasAddon) await saveAdminSurpriseRewardDishes(token, rewardDishIds);
      await saveAdminSurpriseRewardSettings(token, { cycle_config: cycle, validity_days: Number(validityDays) });
      setMessage("Reward cycle and coupon validity saved.");
    } catch (saveError) {
      setError(saveError.message || "Could not save reward settings.");
    } finally {
      setSaving(false);
    }
  }

  const addonItems = items.filter((item) => Boolean(Number(item.is_available)));

  return (
    <div className="rewards-management">
      <p className="muted">Set the 15 qualifying-order rewards and choose how long each coupon remains valid. Guests do not advance the cycle.</p>
      {loading && <p role="status">Loading reward settings…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
      {!loading && !error && (
        <form onSubmit={saveSettings}>
          <section className="panel reward-settings-panel" aria-labelledby="reward-cycle-title">
            <div className="panel-heading">
              <div>
                <h2 id="reward-cycle-title">Reward cycle</h2>
                <p className="muted">Each qualifying registered-customer order uses the next position, then the cycle repeats.</p>
              </div>
              <label className="reward-validity">Coupon validity (days)
                <input type="number" min="1" max="90" value={validityDays} onChange={(event) => setValidityDays(event.target.value)} required />
              </label>
            </div>
            <div className="reward-cycle-list">
              {cycle.map((slot, index) => (
                <div className="reward-cycle-row" key={`reward-slot-${index}`}>
                  <strong className="reward-position">{index + 1}</strong>
                  <label>Reward type
                    <select value={slot.type} onChange={(event) => updateSlot(index, "type", event.target.value)}>
                      <option value="percent">Surprise discount</option>
                      <option value="addon">Free add-on dish</option>
                    </select>
                  </label>
                  {slot.type === "percent" ? (
                    <div className="reward-range-fields">
                      <label>Minimum %
                        <input type="number" min="1" max="10" value={slot.min} onChange={(event) => updateSlot(index, "min", event.target.value)} required />
                      </label>
                      <label>Maximum %
                        <input type="number" min="1" max="10" value={slot.max} onChange={(event) => updateSlot(index, "max", event.target.value)} required />
                      </label>
                    </div>
                  ) : <span className="muted reward-pool-note">A random dish from the selected pool</span>}
                </div>
              ))}
            </div>
          </section>

          {cycle.some((slot) => slot.type === "addon") && (
            <section className="panel reward-settings-panel" aria-labelledby="reward-dishes-title">
              <div className="panel-heading"><div><h2 id="reward-dishes-title">Free add-on dish pool</h2><p className="muted">Choose available menu items that may be awarded in free-dish positions.</p></div></div>
              <div className="reward-dish-list">
                {addonItems.map((item) => {
                  const id = Number(item.item_id);
                  return <label className="check-label" key={`reward-dish-${id}`}>
                    <input type="checkbox" checked={rewardDishIds.includes(id)} onChange={(event) => toggleDish(id, event.target.checked)} />
                    <span>{item.item_name} · €{Number(item.price_eur || 0).toFixed(2)}</span>
                  </label>;
                })}
              </div>
              {addonItems.length === 0 && <p className="muted">There are no currently available menu items to choose.</p>}
            </section>
          )}
          <div className="form-actions"><button type="submit" className="button button-primary" disabled={saving}>{saving ? "Saving…" : "Save reward settings"}</button></div>
        </form>
      )}
    </div>
  );
}
