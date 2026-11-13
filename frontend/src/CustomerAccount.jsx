import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { getCustomerSession } from "./api.js";

const tokenKey = "desiDawatCustomerToken";
const CustomerAccount = createContext(null);

export function useCustomerAccount() {
  return useContext(CustomerAccount);
}

export function CustomerAccountProvider({ children }) {
  const { pathname } = useLocation();
  const [token, setToken] = useState(() => sessionStorage.getItem(tokenKey));
  const [customer, setCustomer] = useState(null);
  const [sessionError, setSessionError] = useState("");

  function signIn(result) {
    sessionStorage.setItem(tokenKey, result.token);
    setToken(result.token);
    setCustomer(result.customer);
    setSessionError("");
  }

  const signOut = useCallback(() => {
    sessionStorage.removeItem(tokenKey);
    setToken(null);
    setCustomer(null);
    setSessionError("");
  }, []);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    getCustomerSession(token, controller.signal)
      .then(({ customer }) => {
        if (controller.signal.aborted) return;
        setCustomer(customer);
        setSessionError("");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error.status === 401 || error.status === 403) {
          signOut();
        } else {
          setSessionError(error.message || "Could not check your account. Please reload and try again.");
        }
      });
    return () => controller.abort();
  }, [token, pathname, signOut]);

  return (
    <CustomerAccount.Provider value={{
      token, customer, sessionError, isChecking: Boolean(token && !customer && !sessionError), signIn, signOut,
    }}>
      {children}
    </CustomerAccount.Provider>
  );
}
