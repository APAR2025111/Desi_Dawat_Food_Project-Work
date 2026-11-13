import React, { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet } from "react-router-dom";
import { useCustomerAccount } from "../CustomerAccount.jsx";
import { getCustomerSurpriseRewards, saveCustomerDateOfBirth } from "../api.js";
import { getSelectedCustomerRewardId, saveSelectedCustomerRewardId } from "../utils/customerRewardSelection.js";

export default function CustomerAccountPage() {
  const { customer, isChecking, sessionError, signOut } = useCustomerAccount();

  if (isChecking || (!customer && sessionError)) {
    return (
      <section className="order-entry-page">
        <h1>My Account</h1>
        {sessionError ? <p role="alert">{sessionError}</p> : <p role="status">Checking your account…</p>}
      </section>
    );
  }
  if (!customer) return <Navigate to="/order-now/login" replace />;

  return (
    <section className="order-entry-page" aria-labelledby="customer-account-title">
      <p className="eyebrow">My Account</p>
      <h1 id="customer-account-title">Welcome, {customer.customer_name}</h1>
      <div className="customer-account-actions">
        <nav className="order-entry-form-actions" aria-label="Customer account">
          <Link className="button button-secondary" to="/">Menu</Link>
          <NavLink className="button button-secondary" to="/order-now/offers">Offers</NavLink>
          <NavLink className="button button-secondary" to="/order-now/my-orders">My Orders</NavLink>
          <NavLink className="button button-secondary" to="/order-now/rewards">Member Rewards</NavLink>
        </nav>
        <button className="button button-secondary" type="button" onClick={signOut}>Log out</button>
      </div>
      <Outlet />
    </section>
  );
}

export function CustomerOffers() {
  const { customer, sessionError, token } = useCustomerAccount();
  const signupPercent = customer.signup_discount_percent;

  return (
    <section aria-labelledby="customer-offers-title">
      <h2 id="customer-offers-title">Your offers</h2>
      <ul className="customer-order-list">
        <li>
          <h3>One-time 10% sign-up offer</h3>
          {sessionError || signupPercent === undefined ? (
            <p>Offer status is currently unavailable.</p>
          ) : (
            <p>{signupPercent > 0 ? "Available on your next signed-in order. Applies to food." : "Already used."}</p>
          )}
        </li>
        <li>
          <h3>Birthday-week offer</h3>
          <p>10% off food on one order during your birthday week, once a year.</p>
          <CustomerBirthday key={customer.customer_id} />
        </li>
        <li>
          <h3>Surprise reward</h3>
          <p>Each signed-in order with a food subtotal over €30 earns one surprise reward: 1–10% off or a free add-on dish.</p>
          <p>Check Member Rewards for coupons you have earned.</p>
        </li>
      </ul>
    </section>
  );
}

export function MemberRewards() {
  const { token, customer } = useCustomerAccount();
  const [rewards, setRewards] = useState([]);
  const [selectedRewardId, setSelectedRewardId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getCustomerSurpriseRewards(token, controller.signal)
      .then(({ rewards: availableRewards }) => {
        const available = Array.isArray(availableRewards) ? availableRewards : [];
        setRewards(available);
        const selectableRewards = available.filter((reward) => !reward.redeemed_at && !reward.redemption_order_id);
        const birthdayAvailable = Number(customer?.birthday_discount_percent) > 0;
        const signupAvailable = Number(customer?.signup_discount_percent) > 0;
        const savedId = getSelectedCustomerRewardId(customer?.customer_id);
        const savedRewardIsAvailable = selectableRewards.some((reward) => String(reward.reward_id) === savedId);
        const nextId = savedId === "birthday" && birthdayAvailable
          ? "birthday"
          : savedId === "signup" && signupAvailable
            ? "signup"
          : savedId === "none"
            ? "none"
          : savedRewardIsAvailable
            ? savedId
            : birthdayAvailable
              ? "birthday"
              : signupAvailable
                ? "signup"
                : selectableRewards.length === 1 ? String(selectableRewards[0].reward_id) : "";
        setSelectedRewardId(nextId);
        saveSelectedCustomerRewardId(customer?.customer_id, nextId);
      })
      .catch((requestError) => {
        if (!controller.signal.aborted) setError(requestError.message || "Surprise rewards are temporarily unavailable. Please try again later.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, customer?.customer_id]);

  function chooseReward(rewardId) {
    const nextId = String(rewardId);
    setSelectedRewardId(nextId);
    saveSelectedCustomerRewardId(customer?.customer_id, nextId);
  }

  return (
    <section className="member-rewards" aria-labelledby="member-rewards-title">
      <div className="member-rewards-heading">
        <p className="eyebrow">A little something for you</p>
        <h2 id="member-rewards-title">Member reward coupons</h2>
        <p>Your earned surprise coupons and any active birthday offer appear here. Choose one for your next order.</p>
      </div>
      {loading && <p role="status">Loading your coupons…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {!loading && !error && (
        <div className="member-reward-grid">
          {(() => {
            const signupUsed = Number(customer?.signup_discount_percent) <= 0;
            const usedDate = customer?.signup_offer_used_at ? new Date(customer.signup_offer_used_at) : null;
            const usedDateLabel = usedDate && !Number.isNaN(usedDate.getTime())
              ? usedDate.toLocaleDateString("en-GB", { timeZone: "Europe/Helsinki" })
              : "";
            return (
              <article className={`member-reward-card${signupUsed ? " member-reward-used-card" : ""}`} key="signup-offer">
                <div className="member-reward-card-top">
                  <span className="member-reward-sparkle" aria-hidden="true">✦</span>
                  <span className="member-reward-tag">SIGN-UP OFFER</span>
                  <span className="member-reward-reference">One-time</span>
                </div>
                <div className="member-reward-main">
                  <p className="member-reward-kicker">Welcome offer</p>
                  <h3>10% OFF</h3>
                  <p className="member-reward-description">{signupUsed ? "Your one-time sign-up discount has been used." : "A one-time discount on food for your next order."}</p>
                </div>
                <div className="member-reward-card-bottom">
                  <p>{signupUsed ? `Used${usedDateLabel ? ` on ${usedDateLabel}` : ""}` : "Available for your next order"}</p>
                  {!signupUsed && (
                    <button
                      className={`member-reward-select${selectedRewardId === "signup" ? " selected" : ""}`}
                      type="button"
                      aria-pressed={selectedRewardId === "signup"}
                      onClick={() => chooseReward("signup")}
                    >
                      {selectedRewardId === "signup" ? "Selected for next order" : "Use sign-up offer"}
                    </button>
                  )}
                </div>
              </article>
            );
          })()}
          {Number(customer?.birthday_discount_percent) > 0 && (
            <article className="member-reward-card member-reward-birthday-card" key="birthday-offer">
              <div className="member-reward-card-top">
                <span className="member-reward-sparkle" aria-hidden="true">✦</span>
                <span className="member-reward-tag">BIRTHDAY OFFER</span>
                <span className="member-reward-reference">Once a year</span>
              </div>
              <div className="member-reward-main">
                <p className="member-reward-kicker">Your birthday week</p>
                <h3>{Number(customer.birthday_discount_percent)}% OFF</h3>
                <p className="member-reward-description">A birthday treat for one food order, available this week.</p>
              </div>
              <div className="member-reward-card-bottom">
                <p>Automatically used at checkout unless you choose a surprise coupon.</p>
                <button
                  className={`member-reward-select${selectedRewardId === "birthday" ? " selected" : ""}`}
                  type="button"
                  aria-pressed={selectedRewardId === "birthday"}
                  onClick={() => chooseReward("birthday")}
                >
                  {selectedRewardId === "birthday" ? "Selected for next order" : "Use birthday offer"}
                </button>
              </div>
            </article>
          )}
          {rewards.map((reward) => {
            const rewardUsed = Boolean(reward.redeemed_at || reward.redemption_order_id);
            const expiry = new Date(reward.expires_at);
            const orderDate = new Date(reward.qualifying_order_date);
            const orderDateLabel = Number.isNaN(orderDate.getTime())
              ? ""
              : orderDate.toLocaleDateString("en-GB", { timeZone: "Europe/Helsinki" });
            const redemptionDate = reward.redemption_order_date || reward.redeemed_at;
            const redemptionDateValue = redemptionDate ? new Date(redemptionDate) : null;
            const redemptionDateLabel = redemptionDateValue && !Number.isNaN(redemptionDateValue.getTime())
              ? redemptionDateValue.toLocaleDateString("en-GB", { timeZone: "Europe/Helsinki" })
              : "";
            const rewardLabel = reward.reward_type === "percent"
              ? `${Number(reward.reward_value)}% OFF`
              : "FREE ADD-ON";
            return (
              <article className={`member-reward-card${rewardUsed ? " member-reward-used-card" : ""}`} key={reward.reward_id}>
                <div className="member-reward-card-top">
                  <span className="member-reward-sparkle" aria-hidden="true">✦</span>
                  <span className="member-reward-tag">SURPRISE REWARD</span>
                  <span className="member-reward-reference">Coupon #{String(reward.reward_id).padStart(4, "0")}</span>
                </div>
                <div className="member-reward-main">
                  <p className="member-reward-kicker">
                    {reward.qualifying_order_receipt_number ? `Issued for receipt #${reward.qualifying_order_receipt_number}` : "A treat from Desi Dawat"}
                    {orderDateLabel && ` · ${orderDateLabel}`}
                  </p>
                  <h3>{rewardLabel}</h3>
                  <p className="member-reward-description">
                    {reward.reward_type === "percent"
                      ? "Your discount applies to food at checkout."
                      : `Enjoy ${reward.addon_item_name || "a free add-on dish"} with your order.`}
                  </p>
                  {rewardUsed && <span className="member-reward-used-badge">USED</span>}
                </div>
                <div className="member-reward-card-bottom">
                  {rewardUsed ? (
                    <p>
                      Used{redemptionDateLabel ? ` on ${redemptionDateLabel}` : ""}
                      {reward.redemption_receipt_number
                        ? ` · Receipt #${reward.redemption_receipt_number}`
                        : reward.redemption_order_id ? ` · Order #${reward.redemption_order_id}` : ""}
                    </p>
                  ) : (
                    <>
                      <p>Apply to your next order by <time dateTime={expiry.toISOString()}>{expiry.toLocaleDateString("en-GB")}</time></p>
                      <button
                        className={`member-reward-select${selectedRewardId === String(reward.reward_id) ? " selected" : ""}`}
                        type="button"
                        aria-pressed={selectedRewardId === String(reward.reward_id)}
                        onClick={() => chooseReward(selectedRewardId === String(reward.reward_id) ? "none" : reward.reward_id)}
                      >
                        {selectedRewardId === String(reward.reward_id) ? "Selected for next order" : "Use on next order"}
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CustomerBirthday() {
  const { token, customer } = useCustomerAccount();
  const [savedBirthday, setSavedBirthday] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const birthday = savedBirthday ?? customer;

  async function saveBirthday(event) {
    event.preventDefault();
    const dateOfBirth = new FormData(event.currentTarget).get("date_of_birth");
    setIsSaving(true);
    setError("");
    try {
      setSavedBirthday(await saveCustomerDateOfBirth(token, dateOfBirth));
    } catch (requestError) {
      setError(requestError.message || "Could not save your date of birth. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (birthday.date_of_birth) {
    const formattedDate = new Date(birthday.date_of_birth).toLocaleDateString("en-GB", {
      dateStyle: "long", timeZone: "UTC",
    });
    return (
      <div>
        <p>Date of birth saved · <time dateTime={birthday.date_of_birth}>{formattedDate}</time></p>
        {birthday.birthday_discount_percent > 0 && (
          <p>Your birthday offer is available in Member Rewards and will be used unless you choose another offer.</p>
        )}
      </div>
    );
  }
  if (birthday.date_of_birth === undefined) return null;

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Helsinki" });
  return (
    <form className="customer-auth-form" onSubmit={saveBirthday}>
      <label>
        Date of birth
        <input type="date" name="date_of_birth" autoComplete="bday" min="1000-01-01" max={today}
          aria-describedby="birthday-date-warning" required disabled={isSaving} />
      </label>
      <p id="birthday-date-warning">Please enter your date of birth carefully. It cannot be changed once saved.</p>
      {error && <p role="alert">{error}</p>}
      <div className="order-entry-form-actions">
        <button className="button button-secondary" type="submit" disabled={isSaving}>
          {isSaving ? "Saving…" : "Save date of birth"}
        </button>
      </div>
    </form>
  );
}
