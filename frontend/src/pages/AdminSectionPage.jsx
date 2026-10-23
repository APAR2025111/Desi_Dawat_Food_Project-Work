
import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
// Inventory report: normalize legacy package labels to measurement-only gm/ml sizes.
import { normalizeInventorySize } from "../utils/inventorySize.js";
import {
  getOpeningHours,
  saveOpeningHours,
  getAdminInventory,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from "../api.js";
// Flyer page: use the dedicated manager for its menu selection and print workflow.
import FlyerManagement from "./FlyerManagement.jsx";
// Menu page: use the dedicated item manager on the dashboard route.
import MenuManagement from "./MenuManagement.jsx";
// Orders page: connect the dashboard route to its dedicated order tools.
import OrdersManagement from "./OrdersManagement.jsx";
// Reports page: connect dashboard receipts and reports to their dedicated view.
import ReportsManagement from "./ReportsManagement.jsx";


const sectionDetails = {
  "/admin/time": {
    title: "Time Management",
    description: "Manage restaurant opening hours and daily schedule.",
  },
  "/admin/inventory": {
    title: "Inventory Management",
    description: "Manage stock, expiry dates and inventory reports.",
  },
  "/admin/flyers": {
    title: "Flyer Management",
    description: "Create and print daily menu flyers and welcome messages.",
  },
  "/admin/menu": {
    title: "Menu Management",
    description: "Manage menu items, prices, photos and availability.",
  },
  "/admin/orders": {
    title: "Order Management",
    description: "View and manage customer orders.",
  },
  "/admin/reports": {
    title: "Receipts & Reports",
    description: "Print receipts and view business reports.",
  },
};

export default function AdminSectionPage() {
  const location = useLocation();
  const section = sectionDetails[location.pathname];

  const [openingHours, setOpeningHours] = useState([]);
  const [hoursLoading, setHoursLoading] = useState(false);
  const [hoursSaving, setHoursSaving] = useState(false);
  const [hoursError, setHoursError] = useState("");
  const [hoursMessage, setHoursMessage] = useState("");
  const [hoursChanged, setHoursChanged] = useState(false);
  const [inventoryItems, setInventoryItems] = useState([]);
const [inventoryLoading, setInventoryLoading] = useState(false);
const [inventoryError, setInventoryError] = useState("");
const [inventoryMessage, setInventoryMessage] = useState("");


  const token =
    sessionStorage.getItem("desiDawatAdminToken") || "";

  useEffect(() => {
    if (location.pathname !== "/admin/time") return;

    let cancelled = false;

    async function loadHours() {
      setHoursLoading(true);
      setHoursError("");
      setHoursMessage("");

      try {
        const data = await getOpeningHours();

        if (!cancelled) {
          const hours = Array.isArray(data)
            ? data
            : data?.hours || [];

          setOpeningHours(
            hours.map((day) => ({
              ...day,
              morning_open: String(
                day.morning_open ?? ""
              ).slice(0, 5),
              morning_close: String(
                day.morning_close ?? ""
              ).slice(0, 5),
              morning_closed: Boolean(day.morning_closed),
              evening_open: String(
                day.evening_open ?? ""
              ).slice(0, 5),
              evening_close: String(
                day.evening_close ?? ""
              ).slice(0, 5),
              evening_closed: Boolean(day.evening_closed),
            }))
          );

          setHoursChanged(false);
        }
      } catch (error) {
        if (!cancelled) {
          setHoursError(
            error.message || "Could not load opening hours."
          );
        }
      } finally {
        if (!cancelled) {
          setHoursLoading(false);
        }
      }
    }

    loadHours();

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);
  
useEffect(() => {
  if (location.pathname !== "/admin/inventory") return;

  let cancelled = false;

  async function loadInventory() {
    setInventoryLoading(true);
    setInventoryError("");
    setInventoryMessage("");

    try {
      const data = await getAdminInventory(token);

      if (!cancelled) {
        setInventoryItems(
  Array.isArray(data) ? data : data?.items || []
);
      }
    } catch (error) {
      if (!cancelled) {
        setInventoryError(
          error.message || "Could not load inventory."
        );
      }
    } finally {
      if (!cancelled) {
        setInventoryLoading(false);
      }
    }
  }

  loadInventory();

  return () => {
    cancelled = true;
  };
}, [location.pathname, token]);


  async function handleSaveOpeningHours(event) {
    event.preventDefault();

    if (!token) {
      setHoursError(
        "Your admin session has expired. Please sign in again."
      );
      return;
    }

    if (openingHours.length !== 4) {
      setHoursError(
        "Expected four opening-hours entries. Please reload the page."
      );
      return;
    }

    setHoursSaving(true);
    setHoursError("");
    setHoursMessage("");

    try {
      await saveOpeningHours(token, openingHours);

      setHoursMessage("Opening hours saved successfully.");
      setHoursChanged(false);
    } catch (error) {
      setHoursError(
        error.message || "Could not save opening hours."
      );
    } finally {
      setHoursSaving(false);
    }
  }

  function updateOpeningHour(dayKey, field, value) {
    setOpeningHours((current) =>
      current.map((day) =>
        day.day_key === dayKey
          ? { ...day, [field]: value }
          : day
      )
    );

    setHoursChanged(true);
    setHoursMessage("");
    setHoursError("");
  }

  if (!section) {
    return (
      <div className="notice">
        Section not found.{" "}
        <Link to="/admin">Return to dashboard</Link>
      </div>
    );
  }

  return (
    <section className="admin-dashboard">
      <div className="admin-dashboard-card">
        <h1>{section.title}</h1>
        <p>{section.description}</p>

        {location.pathname === "/admin/time" ? (
          <div className="time-management">
            {hoursLoading && (
              <p>Loading opening hours...</p>
            )}

            {hoursError && (
              <p className="form-error">{hoursError}</p>
            )}

            {hoursMessage && (
              <p className="form-success">{hoursMessage}</p>
            )}

            {!hoursLoading && openingHours.length > 0 && (
              <form onSubmit={handleSaveOpeningHours}>
                {openingHours.map((day) => (
                  <div
                    className="field-row"
                    key={day.day_key}
                  >
                    <div>
                      <strong>{day.day_fi}</strong>
                      <p className="muted">{day.day_en}</p>
                    </div>

                    <div>
                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(day.morning_closed)}
                          onChange={(event) =>
                            updateOpeningHour(
                              day.day_key,
                              "morning_closed",
                              event.target.checked
                            )
                          }
                        />
                        Morning closed
                      </label>

                      <label>
                        Morning opens
                        <input
                          type="time"
                          value={day.morning_open || ""}
                          disabled={Boolean(day.morning_closed)}
                          onChange={(event) =>
                            updateOpeningHour(
                              day.day_key,
                              "morning_open",
                              event.target.value
                            )
                          }
                        />
                      </label>

                      <label>
                        Morning closes
                        <input
                          type="time"
                          value={day.morning_close || ""}
                          disabled={Boolean(day.morning_closed)}
                          onChange={(event) =>
                            updateOpeningHour(
                              day.day_key,
                              "morning_close",
                              event.target.value
                            )
                          }
                        />
                      </label>

                      <label>
                        <input
                          type="checkbox"
                          checked={Boolean(day.evening_closed)}
                          onChange={(event) =>
                            updateOpeningHour(
                              day.day_key,
                              "evening_closed",
                              event.target.checked
                            )
                          }
                        />
                        Evening closed
                      </label>

                      <label>
                        Evening opens
                        <input
                          type="time"
                          value={day.evening_open || ""}
                          disabled={Boolean(day.evening_closed)}
                          onChange={(event) =>
                            updateOpeningHour(
                              day.day_key,
                              "evening_open",
                              event.target.value
                            )
                          }
                        />
                      </label>

                      <label>
                        Evening closes
                        <input
                          type="time"
                          value={day.evening_close || ""}
                          disabled={Boolean(day.evening_closed)}
                          onChange={(event) =>
                            updateOpeningHour(
                              day.day_key,
                              "evening_close",
                              event.target.value
                            )
                          }
                        />
                      </label>
                    </div>
                  </div>
                ))}

                <button
                  type="submit"
                  disabled={hoursSaving}
                >
                  {hoursSaving
                    ? "Saving..."
                    : "Save Opening Hours"}
                </button>
              </form>
            )}

            {!hoursLoading &&
              !hoursError &&
              openingHours.length === 0 && (
                <p>
                  No opening hours were returned by the server.
                </p>
              )}
          </div>
        ) : (
          <>
            {/* Flyer section: render the standalone flyer manager instead of the empty placeholder. */}
{location.pathname === "/admin/inventory" ? (
  <div className="time-management">
    <h2>Inventory Management / Varastonhallinta</h2>

    <button
      type="button"
      onClick={() => window.print()}
    >
      Print Inventory Report / Tulosta varastoraportti
    </button>

    {inventoryLoading && <p>Loading inventory...</p>}

    {inventoryError && (
      <p className="form-error">{inventoryError}</p>
    )}

    {inventoryMessage && (
      <p className="form-success">{inventoryMessage}</p>
    )}

    {!inventoryLoading && !inventoryError && (
      <>
        <p>Total inventory items: {inventoryItems.length}</p>

        <div className="inventory-report">
          <header className="inventory-report-header">
            <img
              src="/images/LOGO.jpeg"
              alt="Desi Dawat logo"
              style={{ width: 85, height: "auto" }}
            />
            <h2>DESI DAWAT</h2>
            <p>Indian Vegetarian Food / Intialaista kasvisruokaa</p>
            <p>Pateniementie 59, 90800 Oulu</p>
            <h3>INVENTORY REPORT / VARASTORAPORTTI</h3>
            <p>Report date: {new Date().toLocaleDateString("fi-FI")}</p>
          </header>

          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Rack</th>
                <th>Size</th>
                <th>Quantity</th>
                <th>Unit</th>
                <th>Expiry date</th>
                <th>Availability</th>
              </tr>
            </thead>

            <tbody>
              {inventoryItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.item_name_en ||
                      item.item_name ||
                      item.item_name_fi ||
                      "-"}
                  </td>
                  <td>{item.rack_number || "-"}</td>
                  <td>{normalizeInventorySize(item.item_size) || "-"}</td>
                  {/* Inventory report quantity: round numeric stock values to whole units and retain a dash for missing values. */}
                  <td>
                    {item.quantity == null || item.quantity === ""
                      ? "-"
                      : Math.round(Number(item.quantity))}
                  </td>
                  <td>{item.unit || "-"}</td>
                  
<td>
  {item.expiry_date
    ? new Date(item.expiry_date).toLocaleDateString("fi-FI", {
        timeZone: "UTC",
      })
    : "-"}
</td>

                  <td>{item.availability || "Not specified"}</td>
                </tr>
              ))}

              {inventoryItems.length === 0 && (
                <tr>
                  <td colSpan={7}>No inventory items found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </>
    )}
  </div>
) : location.pathname === "/admin/reports" ? (
  <ReportsManagement token={token} />
) : location.pathname === "/admin/orders" ? (
  <OrdersManagement token={token} />
) : location.pathname === "/admin/menu" ? (
  <MenuManagement token={token} />
) : location.pathname === "/admin/flyers" ? (
  <FlyerManagement token={token} />
) : (
  <p>This section is ready for its management features.</p>
)}
          </>
        )}

        <p>
          <Link to="/admin">
            ← Back to Admin Dashboard
          </Link>
        </p>
      </div>
    </section>
  );
}
