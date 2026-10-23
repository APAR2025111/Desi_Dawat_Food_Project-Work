import React, { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { validateAdminSession } from "./api.js";

export default function AdminRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = sessionStorage.getItem("desiDawatAdminToken") || "";
  const [validation, setValidation] = useState({
    token: "",
    pathname: "",
    status: "checking",
  });

  // Admin route guard: verify each protected URL with the API before rendering its content.
  useEffect(() => {
    if (!token) {
      setValidation({ token: "", pathname: location.pathname, status: "invalid" });
      return undefined;
    }

    let cancelled = false;
    setValidation({ token, pathname: location.pathname, status: "checking" });

    validateAdminSession(token)
      .then(() => {
        if (!cancelled) {
          setValidation({ token, pathname: location.pathname, status: "valid" });
        }
      })
      .catch(() => {
        sessionStorage.removeItem("desiDawatAdminToken");
        if (!cancelled) {
          setValidation({ token, pathname: location.pathname, status: "invalid" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token, location.pathname]);

  // Expired-session handling: protected API responses also return the visitor to sign-in.
  useEffect(() => {
    function handleInvalidSession() {
      sessionStorage.removeItem("desiDawatAdminToken");
      navigate("/admin/login", {
        replace: true,
        state: { from: location },
      });
    }

    window.addEventListener("desidawat-admin-session-invalid", handleInvalidSession);
    return () => {
      window.removeEventListener("desidawat-admin-session-invalid", handleInvalidSession);
    };
  }, [location, navigate]);

  // Admin route guard: unauthenticated visitors go to sign-in with their destination saved.
  if (!token || (
    validation.token === token &&
    validation.pathname === location.pathname &&
    validation.status === "invalid"
  )) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  if (
    validation.token !== token ||
    validation.pathname !== location.pathname ||
    validation.status !== "valid"
  ) {
    return (
      <section className="admin-page narrow" aria-live="polite">
        <p>Checking admin session…</p>
      </section>
    );
  }

  return <Outlet />;
}